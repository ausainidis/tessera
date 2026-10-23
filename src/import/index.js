// Import orchestration: analyse a folder or ZIP, produce a compatibility report BEFORE any
// conversion, then create a new project with the strategy the author chose.
//
// Guarantees:
//  - The original input is never modified. A byte-for-byte copy is stored in
//    imports/<importId>/original (or original.zip) inside the new project.
//  - Preserved imports edit a working copy in source/.
//  - No script from the imported material is executed during analysis or import, and
//    no package manager, build tool or dev server is ever run.

import fs from 'node:fs/promises';
import fss from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { newId } from '../core/ids.js';
import { createLesson, createBlock, createProject } from '../core/model.js';
import { addAssets } from '../core/operations.js';
import { APP_NAME, APP_VERSION, SOURCE_DIR, IMPORTS_DIR, COMPONENTS_DIR } from '../core/format.js';
import { detectSource, KIND_LABELS } from './detect.js';
import { buildRiseProject } from './rise/adapter.js';
import { analyzeHtmlSite, buildHtmlProject } from './html/adapter.js';
import { listFiles, copyDir, exists, safeFileName, sha256File } from '../io/fsutil.js';
import { unzipToFolder } from '../io/zip.js';
import { ProjectStore } from '../io/project-store.js';
import { assetKind, mimeType } from '../io/assets.js';

const IGNORE = (rel, e) => e.isDirectory() && /(^|\/)(node_modules|\.git|\.tessera)$/.test(rel);

function makeReader(root) {
  const cache = new Map();
  return (rel) => {
    if (cache.has(rel)) return cache.get(rel);
    let text = null;
    try {
      const p = path.join(root, ...rel.split('/'));
      const stat = fss.statSync(p);
      if (stat.size < 64 * 1024 * 1024) text = fss.readFileSync(p, 'utf8');
    } catch { /* missing */ }
    cache.set(rel, text);
    return text;
  };
}

/** Collects assets referenced during a build and materialises them afterwards. */
class AssetCollector {
  constructor(files, { mode, sourcePrefix = '' }) {
    this.files = new Set(files);
    this.mode = mode; // 'copy' → copy into assets/, 'reference' → point at the working copy
    this.sourcePrefix = sourcePrefix;
    this.byRel = new Map();
  }

  assetFor = (rel) => {
    if (!rel || !this.files.has(rel)) return null;
    if (!this.byRel.has(rel)) this.byRel.set(rel, newId('ast'));
    return this.byRel.get(rel);
  };

  /** Plan a path for a file copied verbatim (fonts). */
  planned = new Map();

  planCopy = (rel, destRel) => {
    if (!rel || !this.files.has(rel)) return null;
    this.planned.set(rel, destRel);
    return destRel;
  };

  async materialise(inputRoot, projectRoot) {
    const entries = [];
    for (const [rel, id] of this.byRel) {
      const src = path.join(inputRoot, ...rel.split('/'));
      let destRel;
      if (this.mode === 'reference') destRel = `${this.sourcePrefix}${rel}`;
      else {
        const kind = assetKind(rel);
        const folder = { image: 'images', audio: 'audio', video: 'video', captions: 'captions', font: 'fonts' }[kind] || 'files';
        destRel = `assets/${folder}/${safeFileName(path.basename(rel))}`;
        let n = 2;
        while (entries.some((e) => e.path === destRel) || (await exists(path.join(projectRoot, ...destRel.split('/'))))) {
          destRel = destRel.replace(/(-\d+)?(\.[^.]*)?$/, `-${n++}$2`);
        }
        await fs.mkdir(path.dirname(path.join(projectRoot, ...destRel.split('/'))), { recursive: true });
        await fs.copyFile(src, path.join(projectRoot, ...destRel.split('/')));
      }
      const stat = await fs.stat(src);
      entries.push({ id, path: destRel, kind: assetKind(rel), mime: mimeType(rel), bytes: stat.size, sha256: await sha256File(src), originalName: path.basename(rel), addedAt: new Date().toISOString(), importedFrom: rel });
    }
    for (const [rel, destRel] of this.planned) {
      const dest = path.join(projectRoot, ...destRel.split('/'));
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(path.join(inputRoot, ...rel.split('/')), dest);
    }
    return entries;
  }
}

function summarise(reportLessons) {
  const s = { lessons: reportLessons.length, blocks: 0, editable: 0, displayOnly: 0, retained: 0 };
  const unsupported = new Map();
  for (const l of reportLessons) {
    for (const b of l.blocks) {
      s.blocks += 1;
      if (b.status === 'editable') s.editable += 1;
      else if (b.status === 'display-only') s.displayOnly += 1;
      else {
        s.retained += 1;
        unsupported.set(b.sourceType, (unsupported.get(b.sourceType) || 0) + 1);
      }
    }
  }
  return { summary: s, unsupported: [...unsupported].map(([sourceType, count]) => ({ sourceType, count })) };
}

/**
 * Analyse an input folder or .zip file.
 * @returns {Promise<object>} analysis including `report` (JSON-serialisable)
 */
export async function analyzeImport(inputPath) {
  const stat = await fs.stat(inputPath);
  let root = inputPath;
  let staging = null;
  if (stat.isFile()) {
    if (!/\.zip$/i.test(inputPath)) throw new Error('Choose a folder or a .zip file.');
    staging = await fs.mkdtemp(path.join(os.tmpdir(), 'tessera-import-'));
    await unzipToFolder(inputPath, staging);
    // A ZIP that wraps everything in one top-level folder is analysed from inside it.
    const top = await fs.readdir(staging, { withFileTypes: true });
    root = top.length === 1 && top[0].isDirectory() ? path.join(staging, top[0].name) : staging;
  }
  const files = await listFiles(root, { skip: IGNORE });
  const read = makeReader(root);
  const det = detectSource(files, read);
  const report = {
    reportVersion: 1,
    createdAt: new Date().toISOString(),
    generator: `${APP_NAME} ${APP_VERSION}`,
    source: { path: inputPath, kind: det.kind, label: KIND_LABELS[det.kind], evidence: det.evidence, fileCount: files.length },
    strategies: [],
    byStrategy: {},
    missingAssets: [],
    externalDependencies: [],
    scripts: [],
    stylesheets: [],
    lms: [],
    notes: [],
    error: det.error || null,
  };

  if (det.kind === 'native') {
    report.strategies.push({ id: 'open', label: 'Open the project', recommended: true, description: 'Open this Tessera project directly. Nothing is converted.' });
  } else if (det.kind === 'rise' && det.rise) {
    report.source.variant = det.rise.variant;
    report.source.validatedVariant = det.rise.validated;
    report.lms = (det.markers || []).filter((m) => /LMS|xAPI|cmi5|SCORM/i.test(m));
    for (const mode of ['preserve', 'convert']) {
      const { reportLessons } = buildRiseProject(det.rise.json, { mode });
      report.byStrategy[mode] = { lessons: reportLessons, ...summarise(reportLessons) };
    }
    report.strategies.push(
      { id: 'preserve', label: 'Preserve Rise appearance (edit supported text)', recommended: true, description: 'Keeps the Rise player, styles, fonts and interactions exactly as exported. You can edit text, questions and answers of supported blocks, rename, reorder and remove lessons and blocks. New blocks cannot be added. Output is the Rise export with your edits.' },
      { id: 'convert', label: 'Convert to a Tessera course', recommended: false, description: 'Rebuilds the course with Tessera blocks and a theme derived from the Rise colours and fonts. Everything recognised becomes fully editable and new blocks can be added, but the appearance will differ from Rise. Unsupported Rise blocks are kept as placeholders with their original data.' },
    );
    if (!det.rise.validated) report.notes.push('This Rise data container has not yet been validated against real exports. Check the result carefully and keep the original.');
    if (report.lms.length) report.notes.push('This export contains LMS packaging. In Preserve mode the LMS files are kept unchanged, but LMS behaviour after editing has not been tested in an LMS by Tessera.');
    report.notes.push('Tessera has not executed any script from this export. The preview runs it in an isolated frame.');
  } else if (det.kind === 'static-html') {
    const a = analyzeHtmlSite(files, read);
    report.missingAssets = a.missing;
    report.externalDependencies = a.external;
    report.scripts = a.scripts;
    report.stylesheets = a.stylesheets;
    for (const mode of ['preserve', 'convert']) {
      const { reportLessons } = buildHtmlProject({ files, read, analysis: a, mode, sourceRoot: SOURCE_DIR, assetFor: () => null });
      report.byStrategy[mode] = { lessons: reportLessons, ...summarise(reportLessons) };
    }
    report.strategies.push(
      { id: 'preserve', label: 'Preserve pages (edit text in place)', recommended: a.scripts.length > 0, description: 'Keeps every page, stylesheet and script exactly as it is. Headings, paragraphs, list items, captions and image alternative text become editable; changes are written into the HTML files at the same position.' },
      { id: 'convert', label: 'Convert to a Tessera course', recommended: a.scripts.length === 0, description: 'Recognised elements become Tessera blocks. Multi-column layouts, tables, forms and widgets are kept verbatim as retained HTML. Page scripts are not carried over. The site’s stylesheets are included and listed in the style map, which you should review.' },
    );
    if (a.scripts.length) report.notes.push(`${a.scripts.length} page(s) contain scripts. Convert mode does not carry page scripts over; Preserve mode keeps them and runs them only in the isolated preview.`);
    report.notes.push('Loading the original stylesheet alone does not make new blocks match the original design. After converting, map block types to the site’s CSS classes in Theme → Style map.');
  } else if (det.kind === 'web-bundle') {
    report.strategies.push({ id: 'embed', label: 'Import as an embedded web component', recommended: true, description: 'The compiled application is copied into the project and shown inside an isolated frame. Its content is not editable in Tessera; it is preserved and displayed as built.' });
    if (det.absolutePaths) report.notes.push('index.html refers to files with absolute paths (e.g. "/assets/…"). These would break inside a course. Tessera can rewrite them to relative paths in its copy (the original stays unchanged). Rebuilding with base: "./" is the better long-term fix.');
    report.byStrategy.embed = { lessons: [{ title: 'Embedded application', blocks: [{ sourceType: 'web application', mappedType: 'embed', status: 'display-only', editableFields: ['title', 'sizing', 'height', 'config'] }] }] };
    Object.assign(report.byStrategy.embed, summarise(report.byStrategy.embed.lessons));
  } else if (det.kind === 'vite-source') {
    report.notes.push('This is application source code that must be built before it can run. Tessera does not run npm install, build scripts or development servers.');
    report.notes.push(`To include it, build it yourself (for example "npm run build" with base: "./" in vite.config) and import the resulting folder as a compiled web bundle.${det.framework?.length ? ` Detected: ${det.framework.join(', ')}.` : ''}`);
    if (det.dist) {
      report.strategies.push({ id: 'embed-dist', label: 'Import the existing dist/ build as an embedded component', recommended: true, description: 'Uses the already-built dist/ folder. Make sure it is up to date: Tessera will not rebuild it.' });
      report.byStrategy['embed-dist'] = { lessons: [{ title: 'Embedded application', blocks: [{ sourceType: 'web application (dist/)', mappedType: 'embed', status: 'display-only', editableFields: [] }] }] };
      Object.assign(report.byStrategy['embed-dist'], summarise(report.byStrategy['embed-dist'].lessons));
    }
  }
  return { inputPath, root, staging, files, detection: det, report };
}

async function ensureEmptyTarget(dir) {
  if (await exists(dir)) {
    const entries = await fs.readdir(dir);
    if (entries.length) throw new Error(`The destination folder “${dir}” is not empty. Choose a new or empty folder.`);
  }
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Create a project from an analysis.
 * @param {object} analysis from analyzeImport
 * @param {{ strategy: string, targetDir: string, fixAbsolutePaths?: boolean }} opts
 * @returns {Promise<{ projectDir: string }>}
 */
export async function performImport(analysis, { strategy, targetDir, fixAbsolutePaths = true }) {
  const { root, detection: det, report, inputPath } = analysis;
  if (det.kind === 'native') return { projectDir: root };
  if (!report.strategies.some((s) => s.id === strategy)) throw new Error(`Import option “${strategy}” is not available for this source.`);
  await ensureEmptyTarget(targetDir);
  const importId = newId('imp');
  const importDir = `${IMPORTS_DIR}/${importId}`;
  const read = makeReader(root);

  // 1. Preserve the original, untouched.
  const originalAbs = path.join(targetDir, IMPORTS_DIR, importId);
  await fs.mkdir(originalAbs, { recursive: true });
  if (/\.zip$/i.test(inputPath)) await fs.copyFile(inputPath, path.join(originalAbs, 'original.zip'));
  else await copyDir(root, path.join(originalAbs, 'original'), { skip: IGNORE });

  let state;
  let capabilities = null;
  const record = { id: importId, kind: det.kind, strategy, importedAt: new Date().toISOString(), from: path.basename(inputPath), original: /\.zip$/i.test(inputPath) ? `${importDir}/original.zip` : `${importDir}/original`, report: `${importDir}/report.json` };

  if (det.kind === 'rise') {
    if (strategy === 'preserve') {
      await copyDir(root, path.join(targetDir, SOURCE_DIR), { skip: IGNORE });
      ({ state, capabilities } = buildRiseProject(det.rise.json, { mode: 'preserve' }));
      state.manifest.source = { adapter: 'rise', mode: 'preserve', root: SOURCE_DIR, entry: `${SOURCE_DIR}/${det.entry}`, dataFile: `${SOURCE_DIR}/${det.rise.file}`, variant: det.rise.variant, importId, capabilities };
    } else {
      const dir = det.rise.file.includes('/') ? det.rise.file.slice(0, det.rise.file.lastIndexOf('/') + 1) : '';
      const collector = new AssetCollector(analysis.files, { mode: 'copy' });
      const assetFor = (key) => {
        if (!key || /^https?:/i.test(key)) return null;
        const clean = key.replace(/^\.?\//, '');
        return collector.assetFor(`${dir}assets/${clean}`) || collector.assetFor(`${dir}${clean}`);
      };
      const fontFile = (key) => collector.planCopy(`${dir}lib/fonts/${key}`, `assets/fonts/${safeFileName(key)}`);
      ({ state } = buildRiseProject(det.rise.json, { mode: 'convert', assetFor, fontFile }));
      state = addAssets(state, await collector.materialise(root, targetDir));
    }
  } else if (det.kind === 'static-html') {
    const a = analyzeHtmlSite(analysis.files, read);
    await copyDir(root, path.join(targetDir, SOURCE_DIR), { skip: IGNORE });
    const collector = new AssetCollector(analysis.files, { mode: strategy === 'preserve' ? 'reference' : 'copy', sourcePrefix: `${SOURCE_DIR}/` });
    ({ state, capabilities } = buildHtmlProject({ files: analysis.files, read, analysis: a, mode: strategy, sourceRoot: SOURCE_DIR, assetFor: collector.assetFor }));
    state = addAssets(state, await collector.materialise(root, targetDir));
    if (strategy === 'preserve') {
      state.manifest.source = { adapter: 'html', mode: 'preserve', root: SOURCE_DIR, entry: `${SOURCE_DIR}/${a.pages[0]?.path || 'index.html'}`, importId, capabilities };
    } else {
      state.manifest.styleMap = {};
      report.notes.push('Stylesheets carried over: review Theme → Style map to connect Tessera blocks with the original CSS classes.');
    }
  } else if (det.kind === 'web-bundle' || det.kind === 'vite-source') {
    const bundleRoot = det.kind === 'vite-source' ? path.join(root, det.dist) : root;
    const slug = safeFileName(path.basename(inputPath).replace(/\.zip$/i, ''), 'app').replace(/\.[^.]*$/, '').toLowerCase();
    const compDir = `${COMPONENTS_DIR}/${slug}`;
    const copied = await copyDir(bundleRoot, path.join(targetDir, ...compDir.split('/')), { skip: IGNORE });
    const entryRel = det.kind === 'vite-source' ? 'index.html' : det.entry;
    if (fixAbsolutePaths && (det.absolutePaths || det.kind === 'vite-source')) {
      const p = path.join(targetDir, ...compDir.split('/'), entryRel);
      const html = await fs.readFile(p, 'utf8');
      const fixed = html.replace(/((?:src|href)=["'])\/(?!\/)/g, '$1');
      if (fixed !== html) {
        await fs.writeFile(p, fixed);
        report.notes.push(`Rewrote absolute paths in ${compDir}/${entryRel} to relative paths (the original in ${record.original} is unchanged).`);
      }
    }
    const lesson = createLesson({ title: 'Interactive application' });
    const b = createBlock('embed', { content: { entry: `${compDir}/${entryRel}`, title: report.source.label, kind: 'bundle', sizing: 'aspect', aspectRatio: '16/9' } });
    lesson.blocks.push(b);
    state = createProject({ title: path.basename(inputPath).replace(/\.zip$/i, ''), starter: false });
    state.lessons[lesson.id] = lesson;
    state.manifest.lessons.push(lesson.id);
    report.notes.push(`Copied ${copied.length} files into ${compDir}.`);
  } else {
    throw new Error('Nothing importable was found.');
  }

  state.manifest.imports = [record];
  await fs.mkdir(path.join(targetDir, ...importDir.split('/')), { recursive: true });
  await fs.writeFile(path.join(targetDir, ...record.report.split('/')), `${JSON.stringify({ ...report, chosenStrategy: strategy }, null, 2)}\n`);
  await ProjectStore.create(targetDir, state);
  return { projectDir: targetDir };
}

export async function cleanupAnalysis(analysis) {
  if (analysis?.staging) await fs.rm(analysis.staging, { recursive: true, force: true });
}
