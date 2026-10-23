// Conversion between the in-memory state and the files of a project folder.
// Pure functions (no file system access), so they run in Node, the editor and tests.

import {
  MANIFEST_FILE, ASSETS_FILE, LESSON_FORMAT, ASSETS_FORMAT, FORMAT_VERSION,
  LESSONS_DIR, DEFAULT_THEME_FILE, lessonFile, isSafeRelPath, toPosixRel,
} from './format.js';
import { checkManifest, migrateState } from './migrate.js';
import { normalizeTheme, defaultTheme } from './theme.js';
import { defaultNavigation, defaultAssessmentSettings } from './model.js';

/** Stable, diff-friendly JSON: two-space indentation and a trailing newline. */
export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Serialise state into project files.
 * @returns {Map<string,string>} project-relative path → file contents
 */
export function serializeProject(state) {
  const files = new Map();
  const themePath = isSafeRelPath(state.manifest.theme) ? toPosixRel(state.manifest.theme) : DEFAULT_THEME_FILE;
  const manifest = { ...state.manifest, theme: themePath, formatVersion: FORMAT_VERSION };
  files.set(MANIFEST_FILE, stableJson(manifest));
  for (const id of state.manifest.lessons) {
    const lesson = state.lessons[id];
    if (!lesson) continue;
    files.set(lessonFile(id), stableJson({ format: LESSON_FORMAT, formatVersion: FORMAT_VERSION, ...lesson }));
  }
  files.set(themePath, stableJson(state.theme));
  files.set(ASSETS_FILE, stableJson({ format: ASSETS_FORMAT, formatVersion: FORMAT_VERSION, assets: state.assets }));
  return files;
}

function parseJson(text, path) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${e.message}`);
  }
}

function normalizeLesson(raw, id) {
  const { format, formatVersion, ...lesson } = raw; // eslint-disable-line no-unused-vars
  lesson.id = lesson.id || id;
  lesson.title = typeof lesson.title === 'string' ? lesson.title : 'Untitled lesson';
  lesson.kind = ['lesson', 'assessment', 'section'].includes(lesson.kind) ? lesson.kind : 'lesson';
  lesson.description = lesson.description || '';
  lesson.blocks = Array.isArray(lesson.blocks) ? lesson.blocks : [];
  lesson.blocks = lesson.blocks.map((b) => ({ ...b, content: b.content || {}, settings: b.settings || {}, overrides: b.overrides || {} }));
  if (lesson.kind === 'assessment') lesson.assessment = { ...defaultAssessmentSettings(), ...(lesson.assessment || {}) };
  return lesson;
}

/**
 * Build state from project files.
 * @param {(path: string) => string|null} readFile returns file text or null if missing
 * @param {string[]} [lessonFilesOnDisk] project-relative paths of all files in lessons/
 * @returns {{ state: object, warnings: string[] }}
 */
export function deserializeProject(readFile, lessonFilesOnDisk = []) {
  const warnings = [];
  const manifestText = readFile(MANIFEST_FILE);
  if (manifestText == null) throw new Error(`${MANIFEST_FILE} not found.`);
  const manifest = parseJson(manifestText, MANIFEST_FILE);
  checkManifest(manifest);

  manifest.lessons = Array.isArray(manifest.lessons) ? manifest.lessons : [];
  manifest.navigation = { ...defaultNavigation(), ...(manifest.navigation || {}) };
  manifest.course = { title: 'Untitled course', description: '', objectives: [], language: 'en', author: '', ...(manifest.course || {}) };
  manifest.stylesheets = Array.isArray(manifest.stylesheets) ? manifest.stylesheets.filter(isSafeRelPath) : [];
  manifest.styleMap = manifest.styleMap || {};
  manifest.publish = { includeSource: false, ...(manifest.publish || {}) };
  manifest.imports = Array.isArray(manifest.imports) ? manifest.imports : [];
  manifest.source = manifest.source || null;

  const lessons = {};
  for (const id of manifest.lessons) {
    const text = readFile(lessonFile(id));
    if (text == null) {
      warnings.push(`Lesson file ${lessonFile(id)} is missing. The lesson was left out; restore the file and reopen to recover it.`);
      continue;
    }
    lessons[id] = normalizeLesson(parseJson(text, lessonFile(id)), id);
  }
  // Lesson files that exist on disk but are not listed are recovered, never ignored.
  for (const path of lessonFilesOnDisk) {
    const m = new RegExp(`^${LESSONS_DIR}/(.+)\\.json$`).exec(toPosixRel(path));
    if (!m || lessons[m[1]] || manifest.lessons.includes(m[1])) continue;
    const text = readFile(path);
    try {
      lessons[m[1]] = normalizeLesson(parseJson(text, path), m[1]);
      manifest.lessons.push(m[1]);
      warnings.push(`Found lesson file ${path} that was not in the course outline. It has been added at the end.`);
    } catch (e) {
      warnings.push(`Could not read unlisted lesson file ${path}: ${e.message}`);
    }
  }
  manifest.lessons = manifest.lessons.filter((id) => lessons[id]);

  const themePath = isSafeRelPath(manifest.theme) ? toPosixRel(manifest.theme) : DEFAULT_THEME_FILE;
  const themeText = readFile(themePath);
  let theme;
  if (themeText == null) {
    warnings.push(`Theme file ${themePath} is missing. The default theme is used.`);
    theme = defaultTheme();
  } else theme = normalizeTheme(parseJson(themeText, themePath));
  manifest.theme = themePath;

  const assetsText = readFile(ASSETS_FILE);
  const assets = assetsText == null ? {} : parseJson(assetsText, ASSETS_FILE).assets || {};

  const migrated = migrateState({ manifest, lessons, theme, assets });
  return { state: migrated.state, warnings: [...warnings, ...migrated.notes] };
}
