// Rise 360 import adapter: builds a Tessera project from decoded Rise course data, and
// writes edits back into the Rise data for preserved imports.
//
// Two strategies (chosen by the author after reading the compatibility report):
//   preserve  Keep the Rise player and its appearance. Supported fields are edited in
//             Tessera and written back into the Rise course data. Unsupported blocks stay
//             exactly as they are. New blocks cannot be added (Rise's own block formats
//             are not public).
//   convert   Build a native Tessera course. Everything recognised becomes fully editable
//             and follows the Tessera theme; unrecognised items become "retained" blocks
//             that keep the original data.

import { createManifest, createLesson, defaultAssessmentSettings } from '../../core/model.js';
import { newId } from '../../core/ids.js';
import { defaultTheme, contrastRatio } from '../../core/theme.js';
import { sanitizeRichText, htmlToText } from '../../core/richtext.js';
import { getBlockDef } from '../../core/blocks/index.js';
import { findMapper, sourceTypeOf, summarizeItem } from './mapping.js';

const PRESERVE_CAPABILITIES = {
  addLessons: false, duplicateLessons: false, deleteLessons: true, reorderLessons: true,
  addBlocks: false, duplicateBlocks: false, deleteBlocks: true, reorderBlocks: true,
  editTheme: false, editCourse: true,
};

const json = (v) => JSON.stringify(v);

function lessonKind(rl) {
  if (rl.type === 'quiz') return 'assessment';
  if (rl.type === 'section') return 'section';
  return 'lesson';
}

function quizSettings(rl) {
  const s = rl.settings || {};
  const retry = Number(s.retryCount);
  return {
    ...defaultAssessmentSettings(),
    passThreshold: Number.isFinite(Number(s.passingScore)) ? Number(s.passingScore) : 80,
    attempts: Number.isFinite(retry) && retry >= 0 ? retry + 1 : 0,
    shuffleQuestions: !!s.randomizeQuestionOrder,
    shuffleChoices: !!s.shuffleAnswerChoices,
    revealAnswers: s.revealAnswers !== 'none',
  };
}

function themeFromRise(data, fontFiles) {
  const t = defaultTheme();
  t.name = 'Imported from Rise';
  const accent = data.course?.theme?.colorAccent || data.course?.color;
  if (/^#[0-9a-f]{6}$/i.test(accent || '')) {
    t.colors.primary = accent;
    t.colors.link = accent;
    t.colors.onPrimary = (contrastRatio('#ffffff', accent) || 0) >= 4.5 ? '#ffffff' : '#000000';
  }
  if (data.course?.theme?.blockCorners && data.course.theme.blockCorners !== 'ROUNDED') t.borders.radius = 0;
  const families = new Set();
  for (const f of data.fonts || []) {
    const src = fontFiles(f.key);
    if (!src || !f.name) continue;
    t.typography.fonts.push({ family: f.name, src, weight: String(f.weight || '400'), style: f.style || 'normal' });
    families.add(f.name);
  }
  const heading = data.course?.headingTypeface;
  const body = data.course?.bodyTypeface;
  if (typeof heading === 'string' && families.has(heading)) t.typography.headingFont = heading;
  if (typeof body === 'string' && families.has(body)) t.typography.bodyFont = body;
  return t;
}

/**
 * Build project state + compatibility details from Rise data.
 * @param {object} data decoded Rise JSON
 * @param {{ mode: 'preserve'|'convert', assetFor?: (key: string) => string|null, fontFile?: (key: string) => string|null }} opts
 */
export function buildRiseProject(data, opts) {
  const mode = opts.mode;
  const manifest = createManifest({ title: htmlToText(data.course?.title) || 'Imported Rise course' });
  manifest.course.description = sanitizeRichText(data.course?.description || '');
  manifest.course.language = data.labelSet?.iso639Code || 'en';
  const lessons = {};
  const reportLessons = [];

  for (const rl of data.course?.lessons || []) {
    if (rl.deleted) continue;
    const lesson = createLesson({ title: htmlToText(rl.title) || 'Untitled lesson', kind: lessonKind(rl) });
    if (lesson.kind === 'assessment') lesson.assessment = quizSettings(rl);
    if (mode === 'preserve') lesson.source = { adapter: 'rise', ref: rl.id, type: rl.type };
    else lesson.origin = { adapter: 'rise', ref: rl.id };
    const rep = { title: lesson.title, sourceType: rl.type, blocks: [] };

    for (const item of rl.items || []) {
      const sourceType = sourceTypeOf(item, rl.type);
      const mapper = findMapper(item, rl.type);
      let block;
      if (mapper) {
        const mapped = mapper.toBlock(item, { assetFor: opts.assetFor });
        const def = getBlockDef(mapped.type);
        block = {
          id: newId('blk'), type: mapped.type, v: def.version,
          content: { ...def.defaults(), ...mapped.content },
          settings: { ...(def.defaultSettings ? def.defaultSettings() : {}), ...(mapped.settings || {}) },
          overrides: {},
        };
        const editable = mode === 'preserve' ? mapper.editable : def.fields.map((f) => f.key);
        rep.blocks.push({
          sourceType, mappedType: mapped.type,
          status: mode === 'convert' || editable.length ? 'editable' : 'display-only',
          validated: mapper.validated,
          editableFields: editable,
        });
        if (mode === 'preserve') block.source = { adapter: 'rise', ref: item.id, mapper: mapper.key, editable: mapper.editable, fixed: mapper.fixed || [] };
        else block.origin = { adapter: 'rise', ref: item.id, sourceType };
      } else {
        const def = getBlockDef('retained');
        block = {
          id: newId('blk'), type: 'retained', v: def.version,
          content: {
            sourceType: `Rise ${sourceType}`,
            summary: summarizeItem(item),
            reason: mode === 'preserve'
              ? 'This Rise block type is not supported for editing yet. It is kept and displayed by the Rise player unchanged.'
              : 'This Rise block type has no Tessera equivalent yet. The original data is kept in this block; it is shown as a placeholder.',
            html: '',
            raw: mode === 'convert' ? item : null,
          },
          settings: {},
          overrides: {},
        };
        if (mode === 'preserve') block.source = { adapter: 'rise', ref: item.id, mapper: null, editable: [] };
        else block.origin = { adapter: 'rise', ref: item.id, sourceType };
        rep.blocks.push({ sourceType, mappedType: null, status: mode === 'preserve' ? 'retained-display' : 'retained-placeholder', validated: false, editableFields: [] });
      }
      lesson.blocks.push(block);
    }
    lessons[lesson.id] = lesson;
    manifest.lessons.push(lesson.id);
    reportLessons.push(rep);
  }

  const theme = mode === 'convert' ? themeFromRise(data, opts.fontFile || (() => null)) : defaultTheme();
  if (mode === 'preserve') manifest.navigation = { ...manifest.navigation, coverPage: false };
  return { state: { manifest, lessons, theme, assets: {} }, reportLessons, capabilities: PRESERVE_CAPABILITIES };
}

/** Content a bound block would have if freshly mapped from this Rise item. */
function mappedContent(item, lessonType, block) {
  const mapper = findMapper(item, lessonType);
  if (!mapper) return null;
  const def = getBlockDef(block.type);
  return { mapper, content: { ...def.defaults(), ...mapper.toBlock(item, {}).content } };
}

/**
 * Apply the edits in a preserved project's state to Rise course data.
 * Returns the original object unchanged (same reference) when there is nothing to write.
 */
export function riseWriteBack(state, data) {
  const out = JSON.parse(JSON.stringify(data));
  const riseLessons = new Map((out.course.lessons || []).map((l) => [l.id, l]));
  const newOrder = [];

  for (const lessonId of state.manifest.lessons) {
    const lesson = state.lessons[lessonId];
    const rl = lesson?.source?.ref && riseLessons.get(lesson.source.ref);
    if (!rl) continue;
    if (htmlToText(rl.title) !== lesson.title) rl.title = lesson.title;
    if (rl.type === 'quiz' && lesson.assessment) {
      const before = quizSettings(rl);
      const a = lesson.assessment;
      rl.settings = rl.settings || {};
      if (before.passThreshold !== Number(a.passThreshold)) rl.settings.passingScore = Number(a.passThreshold);
      if (before.attempts !== Number(a.attempts)) rl.settings.retryCount = Number(a.attempts) > 0 ? Number(a.attempts) - 1 : -1;
      if (before.shuffleQuestions !== !!a.shuffleQuestions) rl.settings.randomizeQuestionOrder = !!a.shuffleQuestions;
      if (before.shuffleChoices !== !!a.shuffleChoices) rl.settings.shuffleAnswerChoices = !!a.shuffleChoices;
    }
    const items = new Map((rl.items || []).map((it) => [it.id, it]));
    const nextItems = [];
    for (const block of lesson.blocks) {
      const item = block.source?.ref && items.get(block.source.ref);
      if (!item) continue; // blocks without a Rise counterpart cannot be written into Rise data
      const mapped = mappedContent(item, rl.type, block);
      if (!mapped || block.type === 'retained') {
        nextItems.push(item);
        continue;
      }
      const changed = new Set((block.source.editable || []).filter((f) => json(block.content[f]) !== json(mapped.content[f])));
      nextItems.push(changed.size ? mapped.mapper.write(item, block.content, changed) : item);
    }
    rl.items = nextItems;
    newOrder.push(rl);
  }
  // Lessons Rise itself marks as deleted are not shown in Tessera; keep them where they were.
  const queue = newOrder.slice();
  const merged = (out.course.lessons || []).map((l) => (l.deleted ? l : queue.shift())).filter(Boolean);
  const orderChanged = json(merged.map((l) => l.id)) !== json((data.course.lessons || []).map((l) => l.id));
  out.course.lessons = merged;
  if (orderChanged) merged.filter((l) => !l.deleted).forEach((l, i) => { if ('position' in l) l.position = i; });
  if (htmlToText(out.course.title) !== state.manifest.course.title) out.course.title = state.manifest.course.title;
  if (sanitizeRichText(data.course.description || '') !== state.manifest.course.description) out.course.description = state.manifest.course.description;

  return json(out) === json(data) ? data : out;
}
