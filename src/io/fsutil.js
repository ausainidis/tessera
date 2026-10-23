// File-system helpers with an emphasis on not corrupting the author's files.

import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isSafeRelPath, toPosixRel } from '../core/format.js';

export async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readTextOrNull(p) {
  try {
    return await fs.readFile(p, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);

/** Retry briefly when Windows antivirus or indexers hold a file open. */
async function retry(fn, attempts = 6) {
  for (let i = 0; ; i += 1) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts || !RETRYABLE.has(e.code)) throw e;
      await new Promise((r) => setTimeout(r, 40 * 2 ** i));
    }
  }
}

/** Write to a temporary file in the same folder and flush it to disk. Returns the temp path. */
export async function writeTemp(target, data) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const fh = await fs.open(tmp, 'w');
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  return tmp;
}

export async function renameReplace(tmp, target) {
  await retry(() => fs.rename(tmp, target));
}

/**
 * Atomic write: the target is either the old file or the complete new file, never a
 * partially written one, even if the computer loses power mid-save.
 */
export async function writeFileAtomic(target, data) {
  const tmp = await writeTemp(target, data);
  try {
    await renameReplace(tmp, target);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

export async function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fss.createReadStream(p).on('error', reject).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex')));
  });
}

/**
 * Resolve a project-relative path to an absolute path, refusing anything that would
 * escape the project folder (including through symbolic links when `real` is set).
 */
export async function resolveInside(root, rel, { real = false } = {}) {
  if (!isSafeRelPath(rel)) throw new Error(`Path is outside the project: ${rel}`);
  const abs = path.resolve(root, ...toPosixRel(rel).split('/'));
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) throw new Error(`Path is outside the project: ${rel}`);
  if (real) {
    const [rp, rr] = await Promise.all([fs.realpath(abs), fs.realpath(rootAbs)]);
    if (rp !== rr && !rp.startsWith(rr + path.sep)) throw new Error(`Path is outside the project: ${rel}`);
    return rp;
  }
  return abs;
}

export function relFrom(root, abs) {
  return path.relative(root, abs).split(path.sep).join('/');
}

/** Recursively list files (project-relative, forward slashes). Skips symlinks. */
export async function listFiles(root, { skip = () => false } = {}) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = relFrom(root, abs);
      if (skip(rel, e)) continue;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) await walk(abs);
      else if (e.isFile()) out.push(rel);
    }
  }
  await walk(root);
  return out;
}

export async function copyDir(src, dest, { skip = () => false } = {}) {
  const files = await listFiles(src, { skip });
  for (const rel of files) {
    const to = path.join(dest, ...rel.split('/'));
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(path.join(src, ...rel.split('/')), to);
  }
  return files;
}

/** A file name safe on Windows, macOS and Linux. */
export function safeFileName(name, fallback = 'file') {
  const ext = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, '');
  const base = path.basename(name, path.extname(name))
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || fallback;
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base) ? `${base}-file` : base;
  return `${reserved}${ext}`;
}

/** First path that does not exist yet: name.ext, name-2.ext, name-3.ext… */
export async function uniquePath(dir, fileName) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  for (let i = 1; ; i += 1) {
    const candidate = path.join(dir, i === 1 ? fileName : `${base}-${i}${ext}`);
    if (!(await exists(candidate))) return candidate;
  }
}
