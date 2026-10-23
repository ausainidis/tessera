import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createBlock, orderedLessons } from '../src/core/model.js';
import * as ops from '../src/core/operations.js';
import { allBlockDefs, insertableBlocks, blockAssetRefs } from '../src/core/blocks/index.js';
import { validateProject } from '../src/core/validate.js';
import { isValidId } from '../src/core/ids.js';
import { cleanOverrides } from '../src/core/overrides.js';
import { contrastRatio, themeContrastIssues, defaultTheme } from '../src/core/theme.js';
import { sanitizeRichText, sanitizeInline } from '../src/core/richtext.js';

const REQUIRED_BLOCKS = ['heading', 'text', 'list', 'quote', 'image', 'imageText', 'gallery', 'audio', 'video', 'attachment', 'divider', 'button', 'accordion', 'tabs', 'process', 'caseStudy', 'reflection', 'knowledgeCheck', 'assessmentQuestion', 'embed'];

test('the initial block library covers the brief', () => {
  const types = allBlockDefs().map((d) => d.type);
  for (const t of REQUIRED_BLOCKS) assert.ok(types.includes(t), `missing block ${t}`);
});

test('every block definition implements the block interface and renders its defaults', () => {
  const p = createProject();
  for (const def of allBlockDefs()) {
    for (const key of ['type', 'version', 'title', 'category', 'fields', 'defaults', 'render']) assert.ok(def[key] !== undefined, `${def.type}.${key}`);
    const b = createBlock(def.type);
    assert.ok(isValidId(b.id));
    const html = def.render(b, { state: p, asset: () => null, lesson: null });
    assert.equal(typeof html, 'string');
    for (const f of def.fields) assert.ok(f.key && f.type && f.label, `${def.type} field spec`);
  }
});

test('assessment questions are only insertable in assessment lessons', () => {
  assert.ok(!insertableBlocks('lesson').some((d) => d.type === 'assessmentQuestion'));
  assert.ok(insertableBlocks('assessment').some((d) => d.type === 'assessmentQuestion'));
  assert.ok(!insertableBlocks('lesson').some((d) => d.type === 'retained'));
});

test('lesson operations: add, order, duplicate with fresh ids, delete', () => {
  let p = createProject({ title: 'T' });
  const first = p.manifest.lessons[0];
  let id2;
  [p, id2] = ops.addLesson(p, { title: 'Second' });
  p = ops.moveLesson(p, id2, 0);
  assert.deepEqual(p.manifest.lessons, [id2, first]);
  const [p2, copyId] = ops.duplicateLesson(p, first);
  const orig = p2.lessons[first];
  const copy = p2.lessons[copyId];
  assert.equal(copy.blocks.length, orig.blocks.length);
  const ids = new Set([...orig.blocks, ...copy.blocks].map((b) => b.id));
  assert.equal(ids.size, orig.blocks.length * 2, 'duplicated blocks get new ids');
  const p3 = ops.deleteLesson(p2, copyId);
  assert.equal(p3.lessons[copyId], undefined);
  assert.ok(!p3.manifest.lessons.includes(copyId));
  assert.ok(p.lessons[first] === p2.lessons[first], 'unchanged lessons are shared (cheap undo)');
});

test('block operations: insert, move, duplicate (nested ids renewed), delete', () => {
  let p = createProject();
  const lid = p.manifest.lessons[0];
  let kc;
  [p, kc] = ops.addBlock(p, lid, 'knowledgeCheck', 0);
  const [p2, dup] = ops.duplicateBlock(p, lid, kc);
  const a = p2.lessons[lid].blocks.find((b) => b.id === kc).content.choices.map((c) => c.id);
  const b = p2.lessons[lid].blocks.find((x) => x.id === dup).content.choices.map((c) => c.id);
  assert.ok(a.every((id) => !b.includes(id)), 'choice ids are renewed in duplicates');
  const p3 = ops.moveBlock(p2, lid, kc, 2);
  assert.equal(p3.lessons[lid].blocks[2].id, kc);
  const p4 = ops.deleteBlock(p3, lid, dup);
  assert.equal(p4.lessons[lid].blocks.length, 3);
});

test('overrides are explicit, validated and resettable', () => {
  let p = createProject();
  const lid = p.manifest.lessons[0];
  const bid = p.lessons[lid].blocks[0].id;
  p = ops.setBlockOverride(p, lid, bid, 'background', '#123456');
  p = ops.setBlockOverride(p, lid, bid, 'paddingTop', 9999);
  p = ops.setBlockOverride(p, lid, bid, 'bogus', 'x');
  assert.deepEqual(p.lessons[lid].blocks[0].overrides, { background: '#123456', paddingTop: 400 });
  p = ops.setBlockOverride(p, lid, bid, 'background', undefined);
  assert.deepEqual(p.lessons[lid].blocks[0].overrides, { paddingTop: 400 });
  p = ops.resetBlockOverrides(p, lid, bid);
  assert.deepEqual(p.lessons[lid].blocks[0].overrides, {});
  assert.deepEqual(cleanOverrides({ textColor: 'red' }), {}, 'only hex colours');
});

test('capabilities restrict preserved imports and editable fields', () => {
  let p = createProject();
  p = { ...p, manifest: { ...p.manifest, source: { mode: 'preserve', capabilities: { addBlocks: false } } } };
  const lid = p.manifest.lessons[0];
  assert.throws(() => ops.addBlock(p, lid, 'text'), /addBlocks/);
  const b = { ...p.lessons[lid].blocks[1], source: { adapter: 'rise', editable: ['html'] } };
  p = { ...p, lessons: { ...p.lessons, [lid]: { ...p.lessons[lid], blocks: [p.lessons[lid].blocks[0], b] } } };
  const p2 = ops.updateBlockContent(p, lid, b.id, { html: '<p>ok</p>', heading: 'not allowed' });
  assert.equal(p2.lessons[lid].blocks[1].content.html, '<p>ok</p>');
  assert.equal(p2.lessons[lid].blocks[1].content.heading, '');
});

test('validation flags accessibility issues for author review', () => {
  let p = createProject();
  const lid = p.manifest.lessons[0];
  let img;
  [p, img] = ops.addBlock(p, lid, 'image');
  p = ops.addAssets(p, [{ id: 'ast_test01', path: 'assets/images/a.png', kind: 'image' }]);
  p = ops.updateBlockContent(p, lid, img, { asset: 'ast_test01' });
  let h;
  [p, h] = ops.addBlock(p, lid, 'heading', undefined, { content: { text: 'Deep', level: 4 } });
  [p] = ops.addBlock(p, lid, 'video', undefined, { content: { source: 'url', url: 'https://youtu.be/abcdefgh' } });
  p = ops.setBlockOverride(p, lid, h, 'background', '#777777');
  const codes = validateProject(p).map((i) => i.code);
  for (const c of ['alt-missing', 'heading-skip', 'contrast', 'external']) assert.ok(codes.includes(c), `expected ${c}`);
  assert.deepEqual(blockAssetRefs(p.lessons[lid].blocks.find((b) => b.id === img)), ['ast_test01']);
});

test('contrast calculation matches WCAG reference values', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#777777', '#ffffff'), 4.48);
  assert.deepEqual(themeContrastIssues(defaultTheme()), []);
});

test('rich text sanitiser removes scripts, handlers and unsafe links', () => {
  const out = sanitizeRichText('<p onclick="x()">Hi<script>alert(1)</script> <a href="javascript:alert(1)">x</a> <img src=x onerror=alert(1)></p>');
  assert.ok(!/script|onclick|onerror|javascript:|<img/i.test(out), out);
  assert.equal(sanitizeInline('<p>a <b>b</b></p>'), 'a <strong>b</strong>');
  assert.equal(sanitizeRichText('loose <em>text</em>'), '<p>loose <em>text</em></p>');
});

test('orderedLessons follows the manifest order', () => {
  let p = createProject();
  let b;
  [p, b] = ops.addLesson(p, { title: 'B' });
  p = ops.moveLesson(p, b, 0);
  assert.equal(orderedLessons(p)[0].id, b);
});
