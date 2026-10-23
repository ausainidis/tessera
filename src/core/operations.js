// Immutable editing operations on the in-memory project state.
// Each function returns a new state object and never mutates its input.
// Operations that create something return [state, newId].
//
// Imported projects in "preserve" mode can restrict operations; see capabilities().

import { createLesson, createBlock, reidentifyBlock, clone } from './model.js';
import { newId } from './ids.js';
import { getBlockDef } from './blocks/index.js';
import { cleanOverrides } from './overrides.js';
import { normalizeTheme } from './theme.js';

const ALL_CAPABILITIES = {
  addLessons: true, deleteLessons: true, reorderLessons: true, duplicateLessons: true,
  addBlocks: true, deleteBlocks: true, reorderBlocks: true, duplicateBlocks: true,
  editTheme: true, editCourse: true,
};

/** What the author may do with this project. Native projects may do everything. */
export function capabilities(state) {
  const caps = state.manifest.source?.capabilities;
  return caps ? { ...ALL_CAPABILITIES, ...caps } : { ...ALL_CAPABILITIES };
}

/** Fields of a block that can be edited (source-bound blocks may restrict them). */
export function editableFields(block) {
  const def = getBlockDef(block.type);
  if (!def) return [];
  const all = def.fields.map((f) => f.key);
  if (block.source && Array.isArray(block.source.editable)) return all.filter((k) => block.source.editable.includes(k));
  return block.type === 'retained' ? [] : all;
}

function assertCap(state, cap) {
  if (!capabilities(state)[cap]) throw new Error(`This project does not allow: ${cap}`);
}

const touch = (state, manifestPatch = {}) => ({ ...state, manifest: { ...state.manifest, ...manifestPatch } });

function withLesson(state, lessonId, fn) {
  const lesson = state.lessons[lessonId];
  if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);
  return { ...state, lessons: { ...state.lessons, [lessonId]: fn(lesson) } };
}

function withBlock(state, lessonId, blockId, fn) {
  return withLesson(state, lessonId, (lesson) => {
    const i = lesson.blocks.findIndex((b) => b.id === blockId);
    if (i < 0) throw new Error(`Block not found: ${blockId}`);
    const blocks = lesson.blocks.slice();
    blocks[i] = fn(blocks[i]);
    return { ...lesson, blocks };
  });
}

function moveInArray(arr, from, to) {
  const out = arr.slice();
  const [item] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, item);
  return out;
}

// ---------- Course ----------

export function updateCourse(state, patch) {
  assertCap(state, 'editCourse');
  return touch(state, { course: { ...state.manifest.course, ...patch } });
}

export function updateNavigation(state, patch) {
  return touch(state, { navigation: { ...state.manifest.navigation, ...patch } });
}

export function updatePublishSettings(state, patch) {
  return touch(state, { publish: { ...state.manifest.publish, ...patch } });
}

export function setStyleMapping(state, blockType, className) {
  const styleMap = { ...state.manifest.styleMap };
  if (className && className.trim()) styleMap[blockType] = { className: className.trim().replace(/[^\w\s-]/g, '') };
  else delete styleMap[blockType];
  return touch(state, { styleMap });
}

// ---------- Lessons ----------

export function addLesson(state, { title, kind = 'lesson', index } = {}) {
  assertCap(state, 'addLessons');
  const lesson = createLesson({ title: title || (kind === 'assessment' ? 'Assessment' : kind === 'section' ? 'New section' : 'New lesson'), kind });
  const order = state.manifest.lessons.slice();
  order.splice(index ?? order.length, 0, lesson.id);
  return [{ ...touch(state, { lessons: order }), lessons: { ...state.lessons, [lesson.id]: lesson } }, lesson.id];
}

export function updateLesson(state, lessonId, patch) {
  const safe = { ...patch };
  delete safe.id;
  delete safe.blocks;
  return withLesson(state, lessonId, (l) => ({ ...l, ...safe }));
}

export function updateAssessmentSettings(state, lessonId, patch) {
  return withLesson(state, lessonId, (l) => ({ ...l, assessment: { ...(l.assessment || {}), ...patch } }));
}

export function duplicateLesson(state, lessonId) {
  assertCap(state, 'duplicateLessons');
  const src = state.lessons[lessonId];
  if (!src) throw new Error(`Lesson not found: ${lessonId}`);
  const copy = { ...clone(src), id: newId('lsn'), title: `${src.title} (copy)` };
  delete copy.source;
  copy.blocks = src.blocks.map(reidentifyBlock);
  const order = state.manifest.lessons.slice();
  order.splice(order.indexOf(lessonId) + 1, 0, copy.id);
  return [{ ...touch(state, { lessons: order }), lessons: { ...state.lessons, [copy.id]: copy } }, copy.id];
}

export function deleteLesson(state, lessonId) {
  assertCap(state, 'deleteLessons');
  const lessons = { ...state.lessons };
  delete lessons[lessonId];
  return { ...touch(state, { lessons: state.manifest.lessons.filter((id) => id !== lessonId) }), lessons };
}

export function moveLesson(state, lessonId, toIndex) {
  assertCap(state, 'reorderLessons');
  const from = state.manifest.lessons.indexOf(lessonId);
  if (from < 0) return state;
  return touch(state, { lessons: moveInArray(state.manifest.lessons, from, toIndex) });
}

// ---------- Blocks ----------

export function addBlock(state, lessonId, type, index, init) {
  assertCap(state, 'addBlocks');
  const block = createBlock(type, init);
  return [insertBlock(state, lessonId, block, index), block.id];
}

export function insertBlock(state, lessonId, block, index) {
  return withLesson(state, lessonId, (l) => {
    const blocks = l.blocks.slice();
    blocks.splice(index ?? blocks.length, 0, block);
    return { ...l, blocks };
  });
}

export function updateBlockContent(state, lessonId, blockId, patch) {
  return withBlock(state, lessonId, blockId, (b) => {
    const allowed = new Set(editableFields(b));
    const filtered = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.has(k)));
    return Object.keys(filtered).length ? { ...b, content: { ...b.content, ...filtered } } : b;
  });
}

export function updateBlockSettings(state, lessonId, blockId, patch) {
  return withBlock(state, lessonId, blockId, (b) => (b.source && !b.source.settings ? b : { ...b, settings: { ...b.settings, ...patch } }));
}

export function setBlockOverride(state, lessonId, blockId, key, value) {
  return withBlock(state, lessonId, blockId, (b) => {
    const next = { ...b.overrides, [key]: value };
    if (value === undefined || value === null || value === '') delete next[key];
    return { ...b, overrides: cleanOverrides(next) };
  });
}

export function resetBlockOverrides(state, lessonId, blockId) {
  return withBlock(state, lessonId, blockId, (b) => ({ ...b, overrides: {} }));
}

export function duplicateBlock(state, lessonId, blockId) {
  assertCap(state, 'duplicateBlocks');
  const lesson = state.lessons[lessonId];
  const i = lesson.blocks.findIndex((b) => b.id === blockId);
  if (i < 0) throw new Error(`Block not found: ${blockId}`);
  const copy = reidentifyBlock(lesson.blocks[i]);
  return [insertBlock(state, lessonId, copy, i + 1), copy.id];
}

export function deleteBlock(state, lessonId, blockId) {
  assertCap(state, 'deleteBlocks');
  return withLesson(state, lessonId, (l) => ({ ...l, blocks: l.blocks.filter((b) => b.id !== blockId) }));
}

export function moveBlock(state, lessonId, blockId, toIndex) {
  assertCap(state, 'reorderBlocks');
  return withLesson(state, lessonId, (l) => {
    const from = l.blocks.findIndex((b) => b.id === blockId);
    return from < 0 ? l : { ...l, blocks: moveInArray(l.blocks, from, toIndex) };
  });
}

export function moveBlockToLesson(state, fromLessonId, blockId, toLessonId, toIndex) {
  assertCap(state, 'reorderBlocks');
  if (state.manifest.source) throw new Error('Blocks cannot be moved between lessons in preserved imports.');
  const block = state.lessons[fromLessonId]?.blocks.find((b) => b.id === blockId);
  if (!block) throw new Error(`Block not found: ${blockId}`);
  const removed = withLesson(state, fromLessonId, (l) => ({ ...l, blocks: l.blocks.filter((b) => b.id !== blockId) }));
  return insertBlock(removed, toLessonId, block, toIndex);
}

// ---------- Theme ----------

/** Set a theme value by dotted path, e.g. setThemeValue(s, 'colors.primary', '#123456'). */
export function setThemeValue(state, path, value) {
  assertCap(state, 'editTheme');
  const theme = clone(state.theme);
  const keys = path.split('.');
  let obj = theme;
  for (const k of keys.slice(0, -1)) obj = obj[k] ??= {};
  obj[keys.at(-1)] = value;
  return { ...state, theme: normalizeTheme(theme) };
}

export function replaceTheme(state, theme, { keepId = false } = {}) {
  assertCap(state, 'editTheme');
  const t = normalizeTheme(clone(theme));
  if (keepId) t.id = state.theme.id;
  return { ...state, theme: t };
}

// ---------- Assets ----------

export function addAssets(state, entries) {
  const assets = { ...state.assets };
  for (const e of entries) assets[e.id] = e;
  return { ...state, assets };
}

export function updateAsset(state, assetId, patch) {
  if (!state.assets[assetId]) throw new Error(`Asset not found: ${assetId}`);
  return { ...state, assets: { ...state.assets, [assetId]: { ...state.assets[assetId], ...patch, id: assetId } } };
}

export function removeAsset(state, assetId) {
  const assets = { ...state.assets };
  delete assets[assetId];
  return { ...state, assets };
}
