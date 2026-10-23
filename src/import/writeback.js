// Write-back for preserved imports: turns the edited Tessera state into updated source
// files (project-relative path → new text). Pure: the caller supplies a file reader.
// Used by save (so source files and Tessera files are written in one transaction), by
// the preview (served from memory) and by publishing.

import { readRiseContainer, replaceRiseData } from './rise/data.js';
import { riseWriteBack } from './rise/adapter.js';
import { htmlWriteBack } from './html/adapter.js';

/**
 * @param {object} state
 * @param {(projectRel: string) => string|null} read reads the CURRENT working source files
 * @returns {Map<string, string>} only files whose content changes
 */
export function sourceWriteBack(state, read) {
  const src = state.manifest.source;
  const out = new Map();
  if (!src || src.mode !== 'preserve') return out;
  if (src.adapter === 'rise') {
    const text = read(src.dataFile);
    if (text == null) throw new Error(`Rise data file is missing: ${src.dataFile}`);
    const data = readRiseContainer(text, src.variant);
    const next = riseWriteBack(state, data);
    if (next !== data) out.set(src.dataFile, replaceRiseData(text, { variant: src.variant }, next));
  } else if (src.adapter === 'html') {
    const changed = htmlWriteBack(state, (file) => read(`${src.root}/${file}`));
    for (const [file, text] of changed) out.set(`${src.root}/${file}`, text);
  }
  return out;
}

/** Project-relative page to show in the preview for a lesson of a preserved import. */
export function previewEntry(state, lessonId, blockId) {
  const src = state.manifest.source;
  if (!src) return null;
  const lesson = state.lessons[lessonId];
  if (src.adapter === 'html') return lesson?.source?.page || src.entry;
  if (src.adapter === 'rise') {
    // Routes verified in the Rise player code: #/lessons/<lessonId>?blockId=<itemId>
    if (!lesson?.source?.ref) return src.entry;
    const item = blockId && lesson.blocks.find((b) => b.id === blockId)?.source?.ref;
    return `${src.entry}#/lessons/${encodeURIComponent(lesson.source.ref)}${item ? `?blockId=${encodeURIComponent(item)}` : ''}`;
  }
  return src.entry;
}
