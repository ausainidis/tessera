// In-memory project model and constructors.
//
// A project in memory ("state") is a plain, JSON-serialisable object:
//   {
//     manifest: { format, formatVersion, id, course, lessons: [lessonId...], navigation, theme, ... },
//     lessons:  { [lessonId]: Lesson },
//     theme:    Theme,
//     assets:   { [assetId]: AssetEntry }
//   }
// All operations in operations.js treat state as immutable, which makes undo/redo cheap
// (unchanged lessons are shared between history entries).

import { newId } from './ids.js';
import {
  PROJECT_FORMAT, FORMAT_VERSION, DEFAULT_THEME_FILE, APP_NAME, APP_VERSION,
} from './format.js';
import { defaultTheme } from './theme.js';
import { getBlockDef } from './blocks/index.js';

export const LESSON_KINDS = ['lesson', 'assessment', 'section'];

export function defaultNavigation() {
  return {
    mode: 'free', // 'free' | 'sequential' (lessons unlock in order)
    showOutline: true,
    showProgress: true,
    showLessonNav: true,
    coverPage: true,
  };
}

export function defaultAssessmentSettings() {
  return {
    passThreshold: 80, // percent
    attempts: 0, // 0 = unlimited
    shuffleQuestions: false,
    shuffleChoices: false,
    feedback: 'after-each', // 'after-each' | 'at-end' | 'none'
    revealAnswers: true,
    requiredForCompletion: true,
  };
}

export function createManifest({ title = 'Untitled course', language = 'en' } = {}) {
  const now = new Date().toISOString();
  return {
    format: PROJECT_FORMAT,
    formatVersion: FORMAT_VERSION,
    id: newId('crs'),
    generator: { name: APP_NAME, version: APP_VERSION },
    course: { title, description: '', objectives: [], language, author: '' },
    lessons: [],
    navigation: defaultNavigation(),
    theme: DEFAULT_THEME_FILE,
    stylesheets: [],
    styleMap: {},
    publish: { includeSource: false },
    source: null,
    imports: [],
    created: now,
    modified: now,
  };
}

export function createLesson({ title = 'New lesson', kind = 'lesson' } = {}) {
  const lesson = { id: newId('lsn'), title, kind, description: '', blocks: [] };
  if (kind === 'assessment') lesson.assessment = defaultAssessmentSettings();
  return lesson;
}

/** Create a block of a registered type using the block definition's defaults. */
export function createBlock(type, init = {}) {
  const def = getBlockDef(type);
  if (!def) throw new Error(`Unknown block type: ${type}`);
  return {
    id: newId('blk'),
    type,
    v: def.version,
    content: { ...def.defaults(), ...(init.content || {}) },
    settings: { ...(def.defaultSettings ? def.defaultSettings() : {}), ...(init.settings || {}) },
    overrides: {},
  };
}

/** A new, empty project with one lesson containing a heading and a paragraph. */
export function createProject({ title = 'Untitled course', language = 'en', starter = true } = {}) {
  const manifest = createManifest({ title, language });
  const lessons = {};
  if (starter) {
    const lesson = createLesson({ title: 'Introduction' });
    lesson.blocks.push(createBlock('heading', { content: { text: 'Welcome' } }));
    lesson.blocks.push(createBlock('text', { content: { html: '<p>Start writing your course here.</p>' } }));
    lessons[lesson.id] = lesson;
    manifest.lessons.push(lesson.id);
  }
  return { manifest, lessons, theme: defaultTheme(), assets: {} };
}

/** Ordered lesson objects. Missing ids are skipped (reported by validation). */
export function orderedLessons(state) {
  return state.manifest.lessons.map((id) => state.lessons[id]).filter(Boolean);
}

export function findBlock(state, blockId) {
  for (const lessonId of state.manifest.lessons) {
    const lesson = state.lessons[lessonId];
    if (!lesson) continue;
    const index = lesson.blocks.findIndex((b) => b.id === blockId);
    if (index >= 0) return { lesson, block: lesson.blocks[index], index };
  }
  return null;
}

/** Deep clone that keeps JSON semantics (the model is always JSON-safe). */
export function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Give a copied block fresh ids, including nested item/choice ids, so duplicates never collide.
 * Source bindings are dropped: a duplicate is new content, not the imported original.
 */
export function reidentifyBlock(block) {
  const copy = clone(block);
  copy.id = newId('blk');
  delete copy.source;
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (k === 'id' && typeof v === 'string' && /^(itm|chc)_/.test(v)) node.id = newId(v.slice(0, 3));
        else walk(v);
      }
    }
  };
  walk(copy.content);
  return copy;
}
