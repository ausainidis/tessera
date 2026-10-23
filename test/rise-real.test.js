// Validation against REAL Rise 360 exports, which cannot be redistributed in this repository.
// Point TESSERA_RISE_SAMPLES at a folder containing one sub-folder (or .zip) per export:
//   set TESSERA_RISE_SAMPLES=C:\path\to\rise-exports && npm test
// Without the variable these tests are skipped.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeImport, performImport, cleanupAnalysis } from '../src/import/index.js';
import { replaceRiseData } from '../src/import/rise/data.js';
import { riseWriteBack } from '../src/import/rise/adapter.js';
import { sourceWriteBack } from '../src/import/writeback.js';
import { ProjectStore } from '../src/io/project-store.js';
import * as ops from '../src/core/operations.js';
import { tempDir } from './fixtures.js';

const dir = process.env.TESSERA_RISE_SAMPLES;
const samples = dir && fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((n) => !n.startsWith('.')).map((n) => path.join(dir, n)).filter((p) => fs.statSync(p).isDirectory() || p.endsWith('.zip'))
  : [];

if (!samples.length) test('real Rise exports (set TESSERA_RISE_SAMPLES to run)', { skip: true }, () => {});

for (const sample of samples) {
  test(`real Rise export: ${path.basename(sample)}`, async () => {
    const a = await analyzeImport(sample);
    try {
      assert.equal(a.report.source.kind, 'rise', 'detected as Rise');
      const json = a.detection.rise.json;
      // 1. Re-encoding unchanged data must reproduce the container byte for byte.
      const containerPath = path.join(a.root, ...a.detection.rise.file.split('/'));
      const text = fs.readFileSync(containerPath, 'utf8');
      assert.equal(replaceRiseData(text, a.detection.rise, json), text, 'byte-identical re-encoding');
      // 2. A preserved import with no edits writes nothing back.
      const proj = path.join(await tempDir(), 'p');
      await performImport(a, { strategy: 'preserve', targetDir: proj });
      const { state, store } = await ProjectStore.open(proj);
      const read = (rel) => { try { return fs.readFileSync(path.join(proj, ...rel.split('/')), 'utf8'); } catch { return null; } };
      assert.equal(sourceWriteBack(state, read).size, 0, 'no-edit write-back is empty');
      assert.equal(riseWriteBack(state, json), json, 'write-back returns the same data');
      // 3. Editing one text block changes exactly one item.
      const lid = state.manifest.lessons.find((id) => state.lessons[id].blocks.some((b) => b.type === 'text' && b.source.editable.includes('html')));
      const block = state.lessons[lid].blocks.find((b) => b.type === 'text');
      const edited = ops.updateBlockContent(state, lid, block.id, { html: '<p>Tessera validation edit</p>' });
      const out = riseWriteBack(edited, json);
      const diffs = [];
      out.course.lessons.forEach((l, i) => l.items?.forEach((it, j) => {
        if (JSON.stringify(it) !== JSON.stringify(json.course.lessons[i].items[j])) diffs.push(it.id);
      }));
      assert.deepEqual(diffs, [block.source.ref]);
      await store.save(edited, sourceWriteBack(edited, read));
      // 4. Coverage report for the compatibility matrix.
      const s = a.report.byStrategy.preserve.summary;
      console.log(`    ${path.basename(sample)}: ${s.lessons} lessons, ${s.blocks} blocks, ${s.editable} editable, ${s.retained} retained; unsupported: ${a.report.byStrategy.preserve.unsupported.map((u) => `${u.sourceType}×${u.count}`).join(', ') || 'none'}`);
    } finally {
      await cleanupAnalysis(a);
    }
  });
}
