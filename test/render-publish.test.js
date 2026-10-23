// Rendering, assessment scoring and publishing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { createProject } from '../src/core/model.js';
import * as ops from '../src/core/operations.js';
import { renderCourse, buildRuntimeData } from '../src/renderer/render.js';
import { isCorrect, scoreAttempt, canRetry, shuffle } from '../src/core/assessment.js';
import { ProjectStore } from '../src/io/project-store.js';
import { publishProject } from '../src/export/publish.js';
import { listFiles } from '../src/io/fsutil.js';
import { tempDir } from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE = path.join(ROOT, 'samples', 'native-demo');
const RUNTIME = path.join(ROOT, 'dist', 'runtime');

test('scoring: multiple choice and multiple response (all-or-nothing)', () => {
  const mc = { mode: 'single', correct: ['a'] };
  const mr = { mode: 'multiple', correct: ['a', 'b'] };
  assert.equal(isCorrect(mc, ['a']), true);
  assert.equal(isCorrect(mc, ['a', 'b']), false);
  assert.equal(isCorrect(mr, ['b', 'a']), true);
  assert.equal(isCorrect(mr, ['a']), false);
  assert.equal(isCorrect(mr, ['a', 'b', 'c']), false);
  const r = scoreAttempt([{ id: 'q1', ...mc, points: 1 }, { id: 'q2', ...mr, points: 3 }], { q1: ['a'], q2: ['a'] }, { passThreshold: 25 });
  assert.equal(r.raw, 1);
  assert.equal(r.max, 4);
  assert.equal(r.percent, 25);
  assert.equal(r.passed, true);
  assert.deepEqual(r.interactions.map((i) => [i.id, i.type, i.result, i.weighting]), [['q1', 'choice', 'correct', 1], ['q2', 'choice-multiple', 'incorrect', 3]]);
});

test('attempt limits and pass thresholds', () => {
  assert.equal(canRetry({ attempts: 0 }, 99, false), true, '0 = unlimited');
  assert.equal(canRetry({ attempts: 2 }, 1, false), true);
  assert.equal(canRetry({ attempts: 2 }, 2, false), false);
  assert.equal(canRetry({ attempts: 0 }, 1, true), false, 'no retry after passing');
  assert.equal(scoreAttempt([{ id: 'q', mode: 'single', correct: ['x'] }], { q: [] }, { passThreshold: 80 }).passed, false);
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  assert.deepEqual(shuffle([1, 2, 3, 4], rnd).sort(), [1, 2, 3, 4]);
});

test('knowledge checks are ungraded; assessment questions carry points', () => {
  let p = createProject();
  const lid = p.manifest.lessons[0];
  [p] = ops.addBlock(p, lid, 'knowledgeCheck');
  let aid;
  [p, aid] = ops.addLesson(p, { kind: 'assessment' });
  [p] = ops.addBlock(p, aid, 'assessmentQuestion');
  const d = buildRuntimeData(p);
  assert.equal(Object.keys(d.checks).length, 1);
  assert.equal(Object.keys(d.questions).length, 1);
  assert.ok(!('points' in Object.values(d.checks)[0]));
  assert.equal(d.lessons.find((l) => l.id === aid).assessment.passThreshold, 80);
});

test('rendering escapes author text and never emits scripts from content', () => {
  let p = createProject({ title: '<script>alert(1)</script>' });
  const lid = p.manifest.lessons[0];
  [p] = ops.addBlock(p, lid, 'heading', undefined, { content: { text: '</h2><img src=x onerror=alert(1)>' } });
  p = ops.updateLesson(p, lid, { title: '"><svg onload=alert(1)>' });
  const html = renderCourse(p);
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(!/<img src=x onerror/.test(html));
  assert.ok(!/<svg onload/.test(html));
  assert.equal((html.match(/<script/g) || []).length, 2, 'only the data block and the runtime');
});

test('preview and published output come from the same renderer', () => {
  const p = createProject();
  const pub = renderCourse(p, { mode: 'publish' });
  const pre = renderCourse(p, { mode: 'preview' });
  const normalise = (h) => h.replace(' data-tc-preview', '').replace('"preview":true', '"preview":false');
  assert.equal(normalise(pre), pub);
});

test('publishing the sample: static folder, only referenced files, ZIP, editable copy', async () => {
  const out = path.join(await tempDir(), 'published');
  const { state } = await ProjectStore.open(SAMPLE);
  const r = await publishProject(state, { projectRoot: SAMPLE, outDir: out, runtimeDir: RUNTIME, zip: true, includeSource: true });
  const files = await listFiles(out);
  for (const f of ['index.html', '_tessera/runtime.js', '_tessera/base.css', 'components/data-sort/index.html', 'tessera-export.json']) assert.ok(files.includes(f), f);
  const html = await fs.readFile(path.join(out, 'index.html'), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (/^https?:/.test(m[1])) continue;
    assert.ok(files.includes(decodeURIComponent(m[1])), `referenced file is published: ${m[1]}`);
  }
  assert.ok(!files.some((f) => f.startsWith('.tessera/') || f === 'tessera-project.json'), 'editor state is not published at the root');
  assert.ok(files.includes('editable-project/tessera-project.json'));
  assert.deepEqual(r.report.warnings, []);
  assert.equal(r.report.externalDependencies.length, 1);
  const zip = unzipSync(new Uint8Array(await fs.readFile(r.zipPath)));
  assert.ok(zip['index.html']);
  // The included editable project reopens.
  const reopened = await ProjectStore.open(path.join(out, 'editable-project'));
  assert.equal(reopened.state.manifest.course.title, state.manifest.course.title);
});

test('SCORM 1.2 (experimental) package has a manifest listing its files', async () => {
  const out = path.join(await tempDir(), 'scorm');
  const { state } = await ProjectStore.open(SAMPLE);
  await publishProject(state, { projectRoot: SAMPLE, outDir: out, runtimeDir: RUNTIME, format: 'scorm12' });
  const manifest = await fs.readFile(path.join(out, 'imsmanifest.xml'), 'utf8');
  assert.match(manifest, /<schemaversion>1\.2<\/schemaversion>/);
  assert.match(manifest, /adlcp:scormtype="sco" href="index.html"/);
  assert.match(manifest, /<file href="_tessera\/runtime.js"\/>/);
  assert.match(await fs.readFile(path.join(out, 'index.html'), 'utf8'), /"tracking":"scorm12"/);
});

test('publishing refuses to overwrite a non-empty unrelated folder', async () => {
  const out = await tempDir();
  await fs.writeFile(path.join(out, 'important.docx'), 'x');
  const { state } = await ProjectStore.open(SAMPLE);
  await assert.rejects(publishProject(state, { projectRoot: SAMPLE, outDir: out, runtimeDir: RUNTIME }), /not empty/);
  assert.equal(await fs.readFile(path.join(out, 'important.docx'), 'utf8'), 'x');
});
