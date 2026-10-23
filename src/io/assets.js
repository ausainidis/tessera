// Asset management. Blocks reference assets by stable id; assets.json maps each id to a
// project-relative path. Replacing a file keeps the id, so every reference survives.
// Originals are never overwritten: replaced files and optimisation sources are kept.

import fs from 'node:fs/promises';
import path from 'node:path';
import { newId } from '../core/ids.js';
import { ASSET_DIR, STATE_DIR } from '../core/format.js';
import { sha256File, safeFileName, uniquePath, relFrom, resolveInside, renameReplace } from './fsutil.js';

const KINDS = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif'],
  audio: ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.wav', '.opus'],
  video: ['.mp4', '.m4v', '.webm', '.ogv', '.mov'],
  captions: ['.vtt'],
  font: ['.woff', '.woff2', '.ttf', '.otf'],
};

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.wav': 'audio/wav', '.opus': 'audio/opus',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg', '.mov': 'video/quicktime',
  '.vtt': 'text/vtt', '.pdf': 'application/pdf', '.zip': 'application/zip', '.txt': 'text/plain', '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

export function assetKind(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  for (const [kind, exts] of Object.entries(KINDS)) if (exts.includes(ext)) return kind;
  return 'file';
}

export function mimeType(fileName) {
  return MIME[path.extname(fileName).toLowerCase()] || 'application/octet-stream';
}

const folderFor = (kind) => `${ASSET_DIR}/${{ image: 'images', audio: 'audio', video: 'video', captions: 'captions', font: 'fonts' }[kind] || 'files'}`;

/**
 * Copy files into the project's assets folder. Identical files (same SHA-256) already in
 * the project are reused instead of duplicated.
 * @returns {Promise<{ added: object[], reused: object[] }>}
 */
export async function importAssetFiles(root, assets, filePaths, { imageSize } = {}) {
  const byHash = new Map(Object.values(assets).filter((a) => a.sha256).map((a) => [a.sha256, a]));
  const added = [];
  const reused = [];
  for (const src of filePaths) {
    const stat = await fs.stat(src);
    if (!stat.isFile()) continue;
    const sha256 = await sha256File(src);
    if (byHash.has(sha256)) {
      reused.push(byHash.get(sha256));
      continue;
    }
    const kind = assetKind(src);
    const dir = path.join(root, ...folderFor(kind).split('/'));
    await fs.mkdir(dir, { recursive: true });
    const dest = await uniquePath(dir, safeFileName(path.basename(src)));
    await fs.copyFile(src, dest);
    const entry = {
      id: newId('ast'),
      path: relFrom(root, dest),
      kind,
      mime: mimeType(dest),
      bytes: stat.size,
      sha256,
      originalName: path.basename(src),
      addedAt: new Date().toISOString(),
    };
    if (kind === 'image' && imageSize) Object.assign(entry, await imageSize(dest).catch(() => ({})));
    added.push(entry);
    byHash.set(sha256, entry);
  }
  return { added, reused };
}

/**
 * Replace an asset's file. The asset keeps its id (so every block keeps working); the
 * previous file is moved to .tessera/trash/assets so it can be recovered.
 */
export async function replaceAssetFile(root, entry, newFile, { imageSize } = {}) {
  const kind = assetKind(newFile);
  const dir = path.join(root, ...folderFor(kind).split('/'));
  await fs.mkdir(dir, { recursive: true });
  const dest = await uniquePath(dir, safeFileName(path.basename(newFile)));
  await fs.copyFile(newFile, dest);
  try {
    const old = await resolveInside(root, entry.path);
    const trash = path.join(root, STATE_DIR, 'trash', 'assets', `${Date.now()}-${path.basename(old)}`);
    await fs.mkdir(path.dirname(trash), { recursive: true });
    await renameReplace(old, trash);
  } catch { /* old file already missing */ }
  const stat = await fs.stat(dest);
  const patch = {
    path: relFrom(root, dest),
    kind,
    mime: mimeType(dest),
    bytes: stat.size,
    sha256: await sha256File(dest),
    originalName: path.basename(newFile),
    replacedAt: new Date().toISOString(),
    optimized: undefined,
    width: undefined,
    height: undefined,
  };
  if (kind === 'image' && imageSize) Object.assign(patch, await imageSize(dest).catch(() => ({})));
  return patch;
}

/** Point a missing asset at a file the author located elsewhere (copied into the project). */
export async function relinkAsset(root, entry, foundFile, opts) {
  const patch = await replaceAssetFile(root, { ...entry, path: '__missing__/none' }, foundFile, opts);
  return { ...patch, missing: undefined };
}

/**
 * Create an optimised copy of an image next to the original and switch the asset to it.
 * The original file is kept and recorded in `optimized.originalPath`, so the author can revert.
 * @param {(src: string, dest: string, opts: object) => Promise<{width:number,height:number}>} processor
 */
export async function optimizeImageAsset(root, entry, processor, { maxWidth = 1920, quality = 82 } = {}) {
  if (entry.kind !== 'image' || /\.(svg|gif)$/i.test(entry.path)) throw new Error('Only JPEG, PNG and WebP images can be optimised.');
  const src = await resolveInside(root, entry.optimized?.originalPath || entry.path);
  const parsed = path.parse(src);
  const isPng = parsed.ext.toLowerCase() === '.png';
  const dest = await uniquePath(parsed.dir, `${parsed.name}.optimized${isPng ? '.png' : '.jpg'}`);
  const dims = await processor(src, dest, { maxWidth, quality, format: isPng ? 'png' : 'jpeg' });
  const stat = await fs.stat(dest);
  const before = (await fs.stat(src)).size;
  if (stat.size >= before) {
    await fs.rm(dest, { force: true });
    return { patch: null, saved: 0, message: 'The image is already well compressed; nothing was changed.' };
  }
  return {
    patch: {
      path: relFrom(root, dest),
      mime: isPng ? 'image/png' : 'image/jpeg',
      bytes: stat.size,
      sha256: await sha256File(dest),
      width: dims?.width,
      height: dims?.height,
      optimized: { originalPath: relFrom(root, src), originalBytes: before, maxWidth, quality, at: new Date().toISOString() },
    },
    saved: before - stat.size,
  };
}

/** Revert an optimised image to its original file (the optimised copy is left on disk). */
export async function revertOptimizedAsset(root, entry) {
  if (!entry.optimized?.originalPath) throw new Error('This image has not been optimised.');
  const src = await resolveInside(root, entry.optimized.originalPath);
  const stat = await fs.stat(src);
  return { path: entry.optimized.originalPath, bytes: stat.size, sha256: await sha256File(src), mime: mimeType(src), optimized: undefined };
}
