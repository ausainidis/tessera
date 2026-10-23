// Isolation and file-safety guarantees that do not need Electron.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { resolveInside } from '../src/io/fsutil.js';
import { unzipToFolder } from '../src/io/zip.js';
import { isSafeRelPath } from '../src/core/format.js';
import { createBlock } from '../src/core/model.js';
import { getBlockDef } from '../src/core/blocks/index.js';
import { tempDir } from './fixtures.js';

test('project paths cannot escape the project folder', async () => {
  const root = await tempDir();
  for (const bad of ['../x', 'a/../../x', 'C:/Windows/win.ini', 'C:\\Windows', '//server/share', '\\\\server\\share', '/etc/passwd', '']) {
    assert.equal(isSafeRelPath(bad), false, bad);
    await assert.rejects(resolveInside(root, bad));
  }
  assert.equal(await resolveInside(root, 'assets/a.png'), path.join(root, 'assets', 'a.png'));
});

test('symbolic links pointing outside the project are refused', async (t) => {
  const root = await tempDir();
  const outside = await tempDir();
  await fs.writeFile(path.join(outside, 'secret.txt'), 'secret');
  try {
    await fs.symlink(outside, path.join(root, 'link'), 'junction');
  } catch {
    t.skip('cannot create links on this system');
    return;
  }
  await assert.rejects(resolveInside(root, 'link/secret.txt', { real: true }), /outside/);
});

test('ZIP extraction rejects path traversal entries ("zip slip")', async () => {
  const dir = await tempDir();
  const zip = path.join(dir, 'evil.zip');
  await fs.writeFile(zip, zipSync({ 'ok.txt': strToU8('ok'), '../escaped.txt': strToU8('bad') }));
  await assert.rejects(unzipToFolder(zip, path.join(dir, 'out')), /Unsafe path/);
  await assert.rejects(fs.access(path.join(dir, 'escaped.txt')));
});

test('custom components render in a sandboxed frame without same-origin access by default', () => {
  const b = createBlock('embed', { content: { entry: 'components/x/index.html' } });
  const html = getBlockDef('embed').render(b, {});
  assert.match(html, /sandbox="allow-scripts allow-forms allow-popups allow-modals"/);
  assert.ok(!html.includes('allow-same-origin'));
  const unsafe = createBlock('embed', { content: { entry: '../../outside.html' } });
  assert.match(getBlockDef('embed').render(unsafe, {}), /No component entry point/);
});
