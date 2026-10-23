// Import pathways: detection, compatibility report, Rise preserve/convert, static HTML,
// web bundles, Vite source projects, and preservation guarantees.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { analyzeImport, performImport } from '../src/import/index.js';
import { locateRiseData, readRiseContainer, utf8ToBase64, base64ToUtf8 } from '../src/import/rise/data.js';
import { sourceWriteBack } from '../src/import/writeback.js';
import { ProjectStore } from '../src/io/project-store.js';
import * as ops from '../src/core/operations.js';
import { listFiles, sha256File } from '../src/io/fsutil.js';
import { makeRiseExport, makeStaticSite, tempDir, RISE_COURSE } from './fixtures.js';

const reader = (root) => (rel) => { try { return fss.readFileSync(path.join(root, ...rel.split('/')), 'utf8'); } catch { return null; } };

async function hashes(dir) {
  const out = {};
  for (const f of await listFiles(dir)) out[f] = await sha256File(path.join(dir, ...f.split('/')));
  return out;
}

test('base64 helpers round-trip UTF-8 exactly (accents, quotes, emoji)', () => {
  const s = JSON.stringify(RISE_COURSE);
  assert.equal(base64ToUtf8(utf8ToBase64(s)), s);
  assert.equal(utf8ToBase64(s), Buffer.from(s, 'utf8').toString('base64'));
});

test('each source kind is detected and handled by its own pathway', async () => {
  const base = await tempDir();
  const rise = await makeRiseExport(path.join(base, 'rise'));
  const site = await makeStaticSite(path.join(base, 'site'));
  const vite = path.join(base, 'vite');
  await fs.mkdir(path.join(vite, 'src'), { recursive: true });
  await fs.writeFile(path.join(vite, 'package.json'), JSON.stringify({ scripts: { build: 'vite build', postinstall: 'node evil.js' }, devDependencies: { vite: '^8.0.0', react: '^19.0.0' } }));
  await fs.writeFile(path.join(vite, 'vite.config.js'), 'export default {}');
  await fs.writeFile(path.join(vite, 'index.html'), '<div id="root"></div><script type="module" src="/src/main.jsx"></script>');
  const bundle = path.join(base, 'bundle');
  await fs.mkdir(path.join(bundle, 'assets'), { recursive: true });
  await fs.writeFile(path.join(bundle, 'index.html'), '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-AbCd1234.js"></script></head><body><div id="root"></div></body></html>');
  await fs.writeFile(path.join(bundle, 'assets', 'index-AbCd1234.js'), 'document.getElementById("root").textContent="app";');

  const kinds = {};
  for (const [name, dir] of Object.entries({ rise, site, vite, bundle })) kinds[name] = (await analyzeImport(dir)).report.source.kind;
  assert.deepEqual(kinds, { rise: 'rise', site: 'static-html', vite: 'vite-source', bundle: 'web-bundle' });

  const v = await analyzeImport(vite);
  assert.equal(v.report.strategies.length, 0, 'no build is run, nothing to import without dist/');
  assert.ok(v.report.notes.some((n) => /does not run npm install/.test(n)));
});

test('Rise compatibility report distinguishes editable from retained content', async () => {
  const dir = await makeRiseExport(path.join(await tempDir(), 'rise'));
  const { report } = await analyzeImport(dir);
  assert.equal(report.source.variant, 'runtime-data-jsonp');
  assert.deepEqual(report.strategies.map((s) => s.id), ['preserve', 'convert']);
  const p = report.byStrategy.preserve;
  assert.equal(p.summary.lessons, 2, 'lessons Rise marks deleted are not shown');
  assert.deepEqual(p.unsupported.map((u) => u.sourceType).sort(), ['interactive/interactive-fullscreen/sorting', 'quiz/MATCHING']);
  assert.equal(p.summary.retained, 2);
});

test('Rise preserve: unchanged save is byte-identical; original never modified', async () => {
  const base = await tempDir();
  const input = await makeRiseExport(path.join(base, 'rise'));
  const before = await hashes(input);
  const a = await analyzeImport(input);
  const proj = path.join(base, 'proj');
  await performImport(a, { strategy: 'preserve', targetDir: proj });
  const { store, state } = await ProjectStore.open(proj);
  const wb = sourceWriteBack(state, reader(proj));
  assert.equal(wb.size, 0, 'nothing to write back');
  await store.save(state, wb);
  assert.deepEqual(await hashes(path.join(proj, 'source')), before, 'working copy identical to original');
  assert.deepEqual(await hashes(input), before, 'input untouched');
  assert.deepEqual(await hashes(path.join(proj, 'imports', state.manifest.imports[0].id, 'original')), before, 'original preserved');
});

test('Rise preserve: edits are written into the Rise data, nothing else changes', async () => {
  const base = await tempDir();
  const input = await makeRiseExport(path.join(base, 'rise'));
  const proj = path.join(base, 'proj');
  await performImport(await analyzeImport(input), { strategy: 'preserve', targetDir: proj });
  const { store, state } = await ProjectStore.open(proj);
  const [lid, qid] = state.manifest.lessons;
  const blocks = state.lessons[lid].blocks;
  const byRef = (ref) => blocks.find((b) => b.source.ref === ref);
  let s = ops.updateBlockContent(state, lid, byRef('i2').id, { html: '<p>Changed text</p>' });
  const kc = byRef('i5');
  s = ops.updateBlockContent(s, lid, kc.id, { choices: kc.content.choices.map((c) => ({ ...c, text: c.id === 'a1' ? 'A (edited)' : c.text })) });
  s = ops.updateLesson(s, lid, { title: 'Renamed' });
  s = ops.updateAssessmentSettings(s, qid, { passThreshold: 70, attempts: 3 });
  s = ops.deleteBlock(s, lid, byRef('i3').id);
  s = ops.moveBlock(s, lid, byRef('i4').id, 0);
  assert.throws(() => ops.addBlock(s, lid, 'text'), /addBlocks/);
  const wb = sourceWriteBack(s, reader(proj));
  assert.deepEqual([...wb.keys()], ['source/runtime-data.js']);
  await store.save(s, wb);
  const data = readRiseContainer(await fs.readFile(path.join(proj, 'source', 'runtime-data.js'), 'utf8'), 'runtime-data-jsonp');
  const L1 = data.course.lessons.find((l) => l.id === 'L1');
  assert.equal(L1.title, 'Renamed');
  assert.deepEqual(L1.items.map((i) => i.id), ['i4', 'i1', 'i2', 'i5', 'i6', 'i7', 'i8', 'i9']);
  assert.equal(L1.items.find((i) => i.id === 'i2').items[0].paragraph, '<p>Changed text</p>');
  assert.equal(L1.items.find((i) => i.id === 'i5').items[0].answers[0].title, 'A (edited)');
  assert.deepEqual(L1.items.find((i) => i.id === 'i1'), RISE_COURSE.course.lessons[0].items[0], 'untouched item is exactly preserved');
  assert.deepEqual(L1.items.find((i) => i.id === 'i7'), RISE_COURSE.course.lessons[0].items[6], 'unsupported item is exactly preserved');
  const quiz = data.course.lessons.find((l) => l.id === 'L2');
  assert.equal(quiz.settings.passingScore, 70);
  assert.equal(quiz.settings.retryCount, 2);
  assert.ok(data.course.lessons.find((l) => l.id === 'L0').deleted, 'Rise-deleted lesson kept in place');
  // Reopen: edits persist in Tessera's own files too.
  const again = await ProjectStore.open(proj);
  assert.equal(again.state.lessons[lid].title, 'Renamed');
  assert.equal(sourceWriteBack(again.state, reader(proj)).size, 0, 'Tessera files and Rise data agree after reopening');
});

test('Rise convert: native, theme-aware course with unsupported items retained verbatim', async () => {
  const base = await tempDir();
  const input = await makeRiseExport(path.join(base, 'rise'));
  const proj = path.join(base, 'conv');
  await performImport(await analyzeImport(input), { strategy: 'convert', targetDir: proj });
  const { state } = await ProjectStore.open(proj);
  assert.equal(state.manifest.source, null);
  assert.equal(state.theme.colors.primary, '#1b365d');
  const blocks = Object.values(state.lessons).flatMap((l) => l.blocks);
  const retained = blocks.filter((b) => b.type === 'retained');
  assert.equal(retained.length, 2);
  assert.deepEqual(retained[0].content.raw, RISE_COURSE.course.lessons[0].items[6]);
  const [p2] = ops.addBlock(state, state.manifest.lessons[0], 'tabs');
  assert.ok(p2, 'new blocks can be added to converted courses');
  assert.equal(Object.values(state.lessons).find((l) => l.kind === 'assessment').assessment.attempts, 0, 'Rise retryCount -1 → unlimited');
});

test('static HTML: report lists scripts, stylesheets, missing files and external dependencies', async () => {
  const site = await makeStaticSite(path.join(await tempDir(), 'site'));
  const { report } = await analyzeImport(site);
  assert.deepEqual(report.missingAssets.map((m) => m.resolved), ['img/missing.png']);
  assert.ok(report.externalDependencies.some((e) => e.url.includes('youtube.com')));
  assert.deepEqual(report.stylesheets, ['css/site.css']);
  assert.equal(report.scripts.length, 1);
  const conv = report.byStrategy.convert;
  assert.deepEqual(conv.unsupported.map((u) => u.sourceType).sort(), ['<div>', '<table>']);
});

test('static HTML preserve: edits change only the edited element in the original markup', async () => {
  const base = await tempDir();
  const site = await makeStaticSite(path.join(base, 'site'));
  const original = await fs.readFile(path.join(site, 'index.html'), 'utf8');
  const proj = path.join(base, 'proj');
  await performImport(await analyzeImport(site), { strategy: 'preserve', targetDir: proj });
  const { store, state } = await ProjectStore.open(proj);
  const lid = state.manifest.lessons[0];
  const lead = state.lessons[lid].blocks.find((b) => b.type === 'text' && b.content.html.includes('Welcome'));
  const img = state.lessons[lid].blocks.find((b) => b.type === 'image');
  let s = ops.updateBlockContent(state, lid, lead.id, { html: '<p>Hello <strong>world</strong> &amp; you</p>' });
  s = ops.updateBlockContent(s, lid, img.id, { alt: 'Company "logo"' });
  const wb = sourceWriteBack(s, reader(proj));
  await store.save(s, wb);
  const edited = await fs.readFile(path.join(proj, 'source', 'index.html'), 'utf8');
  const expected = original
    .replace('<p class="lead">Welcome to the <em>site</em>.</p>', '<p class="lead">Hello <strong>world</strong> &amp; you</p>')
    .replace('<img src="img/logo.svg" alt="Logo">', '<img src="img/logo.svg" alt="Company &quot;logo&quot;">');
  assert.equal(edited, expected);
  assert.equal(await fs.readFile(path.join(site, 'index.html'), 'utf8'), original, 'input untouched');
});

test('static HTML convert: recognised elements become blocks; layouts and tables are retained, not flattened', async () => {
  const base = await tempDir();
  const site = await makeStaticSite(path.join(base, 'site'));
  const proj = path.join(base, 'proj');
  await performImport(await analyzeImport(site), { strategy: 'convert', targetDir: proj });
  const { state } = await ProjectStore.open(proj);
  const l1 = state.lessons[state.manifest.lessons[0]];
  const types = l1.blocks.map((b) => b.type);
  assert.deepEqual(types, ['text', 'image', 'list', 'retained', 'retained', 'accordion', 'text', 'image']);
  assert.match(l1.blocks[3].content.html, /class="cols"/);
  assert.deepEqual(state.manifest.stylesheets, ['source/css/site.css']);
  const l2 = state.lessons[state.manifest.lessons[1]];
  assert.ok(l2.blocks.some((b) => b.type === 'video' && b.content.source === 'url'));
});

test('compiled bundle: imported as an isolated component; absolute paths fixed in the copy only', async () => {
  const base = await tempDir();
  const bundle = path.join(base, 'quiz-app');
  await fs.mkdir(path.join(bundle, 'assets'), { recursive: true });
  await fs.writeFile(path.join(bundle, 'index.html'), '<!doctype html><html><head><script type="module" src="/assets/index-AbCd1234.js"></script></head><body><div id="root"></div></body></html>');
  await fs.writeFile(path.join(bundle, 'assets', 'index-AbCd1234.js'), '');
  const a = await analyzeImport(bundle);
  assert.ok(a.report.notes.some((n) => /absolute paths/.test(n)));
  const proj = path.join(base, 'proj');
  await performImport(a, { strategy: 'embed', targetDir: proj });
  const { state } = await ProjectStore.open(proj);
  const block = Object.values(state.lessons)[0].blocks[0];
  assert.equal(block.type, 'embed');
  assert.equal(block.content.entry, 'components/quiz-app/index.html');
  assert.match(await fs.readFile(path.join(proj, 'components', 'quiz-app', 'index.html'), 'utf8'), /src="assets\/index-AbCd1234\.js"/);
  assert.match(await fs.readFile(path.join(bundle, 'index.html'), 'utf8'), /src="\/assets\//, 'source untouched');
});

test('importing refuses a non-empty destination', async () => {
  const base = await tempDir();
  const site = await makeStaticSite(path.join(base, 'site'));
  const dest = path.join(base, 'dest');
  await fs.mkdir(dest);
  await fs.writeFile(path.join(dest, 'keep.txt'), 'x');
  await assert.rejects(performImport(await analyzeImport(site), { strategy: 'convert', targetDir: dest }), /not empty/);
});

test('ZIP inputs are analysed after safe extraction', async () => {
  const { zipFolder } = await import('../src/io/zip.js');
  const base = await tempDir();
  const rise = await makeRiseExport(path.join(base, 'rise'));
  const zip = path.join(base, 'rise.zip');
  await zipFolder(rise, zip);
  const a = await analyzeImport(zip);
  assert.equal(a.report.source.kind, 'rise');
  assert.ok(locateRiseData(a.files, reader(a.root)));
});
