// Publishing: static web folder, ZIP, and (experimental) SCORM 1.2 package.
//
// Published output is plain HTML/CSS/JS that runs on any static web host (or from a
// local folder) without the editor or any server. Only files the course actually uses
// are copied.

import fs from 'node:fs/promises';
import path from 'node:path';
import { renderCourse } from '../renderer/render.js';
import { orderedLessons } from '../core/model.js';
import { blockAssetRefs, getBlockDef } from '../core/blocks/index.js';
import { externalDependencies } from '../core/validate.js';
import { RUNTIME_DIR, STATE_DIR, SOURCE_DIR, APP_NAME, APP_VERSION, toPosixRel, isSafeRelPath } from '../core/format.js';
import { exists, listFiles, copyDir, resolveInside, writeFileAtomic } from '../io/fsutil.js';
import { zipFolder } from '../io/zip.js';
import { scorm12Manifest } from './scorm12.js';

export const EXPORT_MARKER = 'tessera-export.json';

/** Refuse to write into a folder that has other content, so an export never clobbers unrelated files. */
async function prepareOutDir(outDir) {
  if (await exists(outDir)) {
    const entries = await fs.readdir(outDir);
    if (entries.length && !entries.includes(EXPORT_MARKER)) {
      throw new Error(`The folder “${outDir}” is not empty. Choose an empty folder or a previous Tessera export.`);
    }
    await fs.rm(outDir, { recursive: true, force: true });
  }
  await fs.mkdir(outDir, { recursive: true });
}

/** Every project-relative file the published course needs. */
export function collectCourseFiles(state) {
  const files = new Set();
  const dirs = new Set();
  const missing = [];
  for (const lesson of orderedLessons(state)) {
    for (const block of lesson.blocks) {
      for (const id of blockAssetRefs(block)) {
        const a = state.assets[id];
        if (!a || a.missing) missing.push({ assetId: id, path: a?.path, lessonId: lesson.id, blockId: block.id });
        else files.add(a.path);
      }
      const def = getBlockDef(block.type);
      for (const f of def?.files?.(block) || []) if (isSafeRelPath(f)) dirs.add(path.posix.dirname(toPosixRel(f)));
      if (block.type === 'retained' && block.content.assetDir && isSafeRelPath(block.content.assetDir)) dirs.add(block.content.assetDir);
    }
  }
  for (const f of state.theme.typography?.fonts || []) if (f.src && isSafeRelPath(f.src)) files.add(toPosixRel(f.src));
  for (const s of state.manifest.stylesheets || []) dirs.add(path.posix.dirname(toPosixRel(s)));
  return { files: [...files], dirs: [...dirs].filter((d) => d && d !== '.'), missing };
}

/**
 * Publish a project.
 * @param {object} state
 * @param {{ projectRoot: string, outDir: string, runtimeDir: string, format?: 'web'|'scorm12',
 *           zip?: boolean, includeSource?: boolean, sourceFiles?: Map<string,string> }} opts
 */
export async function publishProject(state, opts) {
  const { projectRoot, outDir, runtimeDir } = opts;
  const format = opts.format || 'web';
  const warnings = [];
  await prepareOutDir(outDir);

  let copied = [];
  if (state.manifest.source?.mode === 'preserve') {
    // Preserved import: publish the working copy of the original, with edits applied.
    const srcRoot = await resolveInside(projectRoot, state.manifest.source.root || SOURCE_DIR);
    copied = await copyDir(srcRoot, outDir);
    for (const [rel, text] of opts.sourceFiles || []) {
      const prefix = `${toPosixRel(state.manifest.source.root || SOURCE_DIR)}/`;
      if (!rel.startsWith(prefix)) continue;
      await writeFileAtomic(await resolveInside(outDir, rel.slice(prefix.length)), text);
    }
    if (format === 'scorm12' && !(await exists(path.join(outDir, 'imsmanifest.xml')))) {
      warnings.push('This preserved import has no LMS packaging of its own; SCORM output is not available for it.');
    }
  } else {
    const tracking = format === 'scorm12' ? 'scorm12' : 'local';
    await fs.writeFile(path.join(outDir, 'index.html'), renderCourse(state, { mode: 'publish', tracking }));
    await fs.mkdir(path.join(outDir, RUNTIME_DIR), { recursive: true });
    for (const f of ['runtime.js', 'base.css']) {
      await fs.copyFile(path.join(runtimeDir, f), path.join(outDir, RUNTIME_DIR, f));
    }
    const { files, dirs, missing } = collectCourseFiles(state);
    for (const m of missing) warnings.push(`Missing asset ${m.path || m.assetId} (lesson ${state.lessons[m.lessonId]?.title}). The block shows a placeholder.`);
    for (const rel of files) {
      const src = await resolveInside(projectRoot, rel).catch(() => null);
      if (!src || !(await exists(src))) {
        warnings.push(`File not found: ${rel}`);
        continue;
      }
      const dest = path.join(outDir, ...rel.split('/'));
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
    }
    for (const dir of dirs) {
      const src = await resolveInside(projectRoot, dir).catch(() => null);
      if (!src || !(await exists(src))) {
        warnings.push(`Folder not found: ${dir}`);
        continue;
      }
      await copyDir(src, path.join(outDir, ...dir.split('/')));
    }
    if (format === 'scorm12') {
      const all = await listFiles(outDir);
      await fs.writeFile(path.join(outDir, 'imsmanifest.xml'), scorm12Manifest(state, all));
    }
    copied = await listFiles(outDir);
  }

  if (opts.includeSource) {
    const dest = path.join(outDir, 'editable-project');
    await copyDir(projectRoot, dest, { skip: (rel) => rel === STATE_DIR || rel.startsWith(`${STATE_DIR}/`) });
    await fs.writeFile(path.join(dest, 'README.txt'), `This folder is the editable ${APP_NAME} project for this course.\nOpen it in ${APP_NAME} (File → Open project) to continue editing.\nIt is not needed to view the course.\n`);
  }

  const external = externalDependencies(state);
  const report = {
    generator: `${APP_NAME} ${APP_VERSION}`,
    exportedAt: new Date().toISOString(),
    format,
    courseTitle: state.manifest.course.title,
    entry: state.manifest.source?.mode === 'preserve' ? state.manifest.source.entry?.replace(/^source\//, '') : 'index.html',
    includesEditableProject: !!opts.includeSource,
    externalDependencies: external,
    warnings,
    fileCount: copied.length,
  };
  await fs.writeFile(path.join(outDir, EXPORT_MARKER), `${JSON.stringify(report, null, 2)}\n`);

  let zipPath = null;
  if (opts.zip) {
    zipPath = `${outDir.replace(/[\\/]+$/, '')}.zip`;
    await zipFolder(outDir, zipPath);
  }
  return { outDir, zipPath, report };
}
