// Saving, reopening, relocation, interruption recovery, autosave and checkpoints.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createProject } from '../src/core/model.js';
import * as ops from '../src/core/operations.js';
import { serializeProject } from '../src/core/serialize.js';
import { ProjectStore } from '../src/io/project-store.js';
import { importAssetFiles, replaceAssetFile } from '../src/io/assets.js';
import { copyDir, listFiles } from '../src/io/fsutil.js';
import { FORMAT_VERSION } from '../src/core/format.js';
import { tempDir } from './fixtures.js';

const strip = (s) => JSON.parse(JSON.stringify({ ...s, manifest: { ...s.manifest, modified: null } }));

async function projectWithAsset() {
  const base = await tempDir();
  const dir = path.join(base, 'course');
  await fs.mkdir(dir);
  const img = path.join(base, 'photo.png');
  await fs.writeFile(img, Buffer.from('89504e470d0a1a0a', 'hex'));
  let p = createProject({ title: 'Persist me' });
  const { added } = await importAssetFiles(dir, {}, [img]);
  p = ops.addAssets(p, added);
  const lid = p.manifest.lessons[0];
  let bid;
  [p, bid] = ops.addBlock(p, lid, 'image', undefined, { content: { asset: added[0].id, alt: 'A photo' } });
  const store = await ProjectStore.create(dir, p);
  return { base, dir, state: p, store, assetId: added[0].id, blockId: bid, lessonId: lid };
}

test('save → close → reopen gives an identical, fully editable project', async () => {
  const { dir, state } = await projectWithAsset();
  const { state: reopened, warnings, recovery } = await ProjectStore.open(dir);
  assert.deepEqual(warnings, []);
  assert.equal(recovery, null);
  assert.deepEqual(strip(reopened), strip(state));
  const edited = ops.updateCourse(reopened, { title: 'Edited after reopening' });
  assert.equal(edited.manifest.course.title, 'Edited after reopening');
});

test('project files are versioned, human-readable JSON with stable ids', async () => {
  const { dir } = await projectWithAsset();
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'tessera-project.json'), 'utf8'));
  assert.equal(manifest.format, 'tessera-project');
  assert.equal(manifest.formatVersion, FORMAT_VERSION);
  const lessonText = await fs.readFile(path.join(dir, 'lessons', `${manifest.lessons[0]}.json`), 'utf8');
  assert.match(lessonText, /^\{\n {2}"format": "tessera-lesson"/);
  const assets = JSON.parse(await fs.readFile(path.join(dir, 'assets.json'), 'utf8'));
  for (const a of Object.values(assets.assets)) assert.ok(!path.isAbsolute(a.path) && !a.path.includes('\\'), 'relative forward-slash paths');
});

test('a project moved to another location reopens with all assets resolved', async () => {
  const { base, dir, state } = await projectWithAsset();
  const moved = path.join(base, 'elsewhere', 'renamed course');
  await copyDir(dir, moved);
  await fs.rm(dir, { recursive: true });
  const { state: reopened, warnings } = await ProjectStore.open(moved);
  assert.deepEqual(warnings, []);
  assert.ok(Object.values(reopened.assets).every((a) => !a.missing));
  assert.deepEqual(strip(reopened), strip(state));
});

test('saving without changes rewrites no files', async () => {
  const { dir, store, state } = await projectWithAsset();
  const before = await fs.stat(path.join(dir, 'tessera-project.json'));
  const r = await store.save(state);
  assert.deepEqual(r.written, []);
  const after = await fs.stat(path.join(dir, 'tessera-project.json'));
  assert.equal(after.mtimeMs, before.mtimeMs);
});

test('an interrupted multi-file save is completed on next open (journal)', async () => {
  const { dir, state, lessonId } = await projectWithAsset();
  const edited = ops.updateLesson(ops.updateCourse(state, { title: 'New title' }), lessonId, { title: 'New lesson title' });
  const files = serializeProject(edited);
  // Simulate a crash after temp files and journal were written but before renames.
  const entries = [];
  for (const rel of ['tessera-project.json', `lessons/${lessonId}.json`]) {
    const tmp = `${rel}.deadbeef.tmp`;
    await fs.writeFile(path.join(dir, ...tmp.split('/')), files.get(rel));
    entries.push({ tmp, target: rel });
  }
  await fs.writeFile(path.join(dir, '.tessera', 'journal.json'), JSON.stringify({ entries }));
  const { state: reopened, warnings } = await ProjectStore.open(dir);
  assert.ok(warnings.some((w) => /interrupted save/i.test(w)));
  assert.equal(reopened.manifest.course.title, 'New title');
  assert.equal(reopened.lessons[lessonId].title, 'New lesson title');
  const leftovers = (await listFiles(dir)).filter((f) => f.endsWith('.tmp') || f.endsWith('journal.json'));
  assert.deepEqual(leftovers, []);
});

test('a half-written temp file without a journal never replaces saved data', async () => {
  const { dir, state } = await projectWithAsset();
  await fs.writeFile(path.join(dir, 'tessera-project.json.0badc0de.tmp'), '{"truncated":');
  const { state: reopened } = await ProjectStore.open(dir);
  assert.equal(reopened.manifest.course.title, state.manifest.course.title);
  assert.ok(!(await listFiles(dir)).some((f) => f.endsWith('.tmp')));
});

test('autosave enables recovery after an unexpected exit, and save clears it', async () => {
  const { dir, store, state } = await projectWithAsset();
  const unsaved = ops.updateCourse(state, { title: 'Unsaved work' });
  await store.autosave(unsaved);
  const { store: s2, recovery, state: onDisk } = await ProjectStore.open(dir);
  assert.ok(recovery?.savedAt);
  assert.equal(onDisk.manifest.course.title, 'Persist me', 'saved files untouched by autosave');
  const restored = await s2.loadAutosave();
  assert.equal(restored.manifest.course.title, 'Unsaved work');
  await s2.save(restored);
  assert.equal((await ProjectStore.open(dir)).recovery, null);
});

test('manual checkpoints can be listed and restored', async () => {
  const { store, state } = await projectWithAsset();
  await store.createCheckpoint(state, 'Before review');
  const changed = ops.updateCourse(state, { title: 'After review' });
  await store.createCheckpoint(changed, 'After review');
  const list = await store.listCheckpoints();
  assert.deepEqual(list.map((c) => c.label), ['After review', 'Before review']);
  const restored = await store.loadCheckpoint(list[1].id);
  assert.equal(restored.manifest.course.title, 'Persist me');
});

test('missing asset files are detected; replacing an asset keeps every reference', async () => {
  const { base, dir, assetId, state, store } = await projectWithAsset();
  const entry = state.assets[assetId];
  await fs.rm(path.join(dir, ...entry.path.split('/')));
  const { state: reopened } = await ProjectStore.open(dir);
  assert.equal(reopened.assets[assetId].missing, true);
  const other = path.join(base, 'replacement.jpg');
  await fs.writeFile(other, 'jpeg-bytes');
  const patch = await replaceAssetFile(dir, entry, other);
  const next = ops.updateAsset(reopened, assetId, { ...patch, missing: undefined });
  assert.equal(next.assets[assetId].id, assetId);
  assert.match(next.assets[assetId].path, /replacement\.jpg$/);
  await store.save(next);
  const again = await ProjectStore.open(dir);
  assert.ok(!again.state.assets[assetId].missing);
});

test('identical files are imported once (deduplicated by content hash)', async () => {
  const base = await tempDir();
  const a = path.join(base, 'a.png');
  const b = path.join(base, 'b.png');
  await fs.writeFile(a, 'same');
  await fs.writeFile(b, 'same');
  const dir = path.join(base, 'p');
  await fs.mkdir(dir);
  const r = await importAssetFiles(dir, {}, [a, b]);
  assert.equal(r.added.length, 1);
  assert.equal(r.reused.length, 1);
});

test('deleted lessons go to the trash folder; unlisted lesson files are recovered on open', async () => {
  const { dir, store, state } = await projectWithAsset();
  const [withTwo, id2] = ops.addLesson(state, { title: 'Two' });
  await store.save(withTwo);
  await store.save(ops.deleteLesson(withTwo, id2));
  const trash = await listFiles(path.join(dir, '.tessera', 'trash'));
  assert.ok(trash.some((f) => f.includes(id2)));
  // A lesson file that exists but is not listed (e.g. a merge mishap) is recovered, not ignored.
  await fs.copyFile(path.join(dir, '.tessera', 'trash', ...trash.find((f) => f.includes(id2)).split('/')), path.join(dir, 'lessons', `${id2}.json`));
  const { state: reopened, warnings } = await ProjectStore.open(dir);
  assert.ok(reopened.manifest.lessons.includes(id2));
  assert.ok(warnings.some((w) => /not in the course outline/.test(w)));
});

test('a project from a newer format version is refused, not damaged', async () => {
  const { dir } = await projectWithAsset();
  const file = path.join(dir, 'tessera-project.json');
  const m = JSON.parse(await fs.readFile(file, 'utf8'));
  m.formatVersion = FORMAT_VERSION + 1;
  await fs.writeFile(file, JSON.stringify(m));
  await assert.rejects(ProjectStore.open(dir), /newer version/);
});
