// ZIP creation and safe extraction (pure JavaScript via fflate; no native tools).

import fs from 'node:fs/promises';
import path from 'node:path';
import { zipSync, unzipSync } from 'fflate';
import { listFiles } from './fsutil.js';

const STORE_EXT = /\.(png|jpe?g|gif|webp|avif|mp4|m4v|webm|mp3|m4a|ogg|zip|woff2?)$/i;

/** Zip a folder. Already-compressed media are stored rather than recompressed. */
export async function zipFolder(srcDir, destZip) {
  const files = await listFiles(srcDir);
  const tree = {};
  for (const rel of files) {
    const data = await fs.readFile(path.join(srcDir, ...rel.split('/')));
    tree[rel] = [new Uint8Array(data), { level: STORE_EXT.test(rel) ? 0 : 6 }];
  }
  await fs.writeFile(destZip, zipSync(tree));
  return files.length;
}

/**
 * Extract a ZIP into an empty folder. Rejects entries that would escape the folder
 * ("zip slip"), absolute paths and archives with an excessive expanded size.
 */
export async function unzipToFolder(zipPath, destDir, { maxBytes = 4 * 1024 ** 3 } = {}) {
  const data = new Uint8Array(await fs.readFile(zipPath));
  const entries = unzipSync(data);
  let total = 0;
  const root = path.resolve(destDir);
  const written = [];
  for (const [name, bytes] of Object.entries(entries)) {
    if (name.endsWith('/')) continue;
    const norm = name.replace(/\\/g, '/');
    if (norm.startsWith('/') || /^[a-zA-Z]:/.test(norm) || norm.split('/').includes('..')) {
      throw new Error(`Unsafe path in archive: ${name}`);
    }
    total += bytes.length;
    if (total > maxBytes) throw new Error('Archive is too large to import.');
    const target = path.resolve(root, ...norm.split('/'));
    if (!target.startsWith(root + path.sep)) throw new Error(`Unsafe path in archive: ${name}`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
    written.push(norm);
  }
  return written;
}
