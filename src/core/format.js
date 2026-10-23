// Constants describing the native project format on disk.
// See docs/PROJECT_FORMAT.md for the full specification.

export const APP_NAME = 'Tessera';
export const APP_VERSION = '0.1.0';

export const PROJECT_FORMAT = 'tessera-project';
export const LESSON_FORMAT = 'tessera-lesson';
export const THEME_FORMAT = 'tessera-theme';
export const ASSETS_FORMAT = 'tessera-assets';

/** Current version of the on-disk format. Bump together with a migration in migrate.js. */
export const FORMAT_VERSION = 1;

export const MANIFEST_FILE = 'tessera-project.json';
export const ASSETS_FILE = 'assets.json';
export const LESSONS_DIR = 'lessons';
export const THEMES_DIR = 'themes';
export const DEFAULT_THEME_FILE = 'themes/theme.json';
export const ASSET_DIR = 'assets';
export const COMPONENTS_DIR = 'components';
export const IMPORTS_DIR = 'imports';
export const SOURCE_DIR = 'source';
/** Editor-private state: autosave, checkpoints, journal, trash. Never required to open a project. */
export const STATE_DIR = '.tessera';

/** Folder name used for the shared runtime inside preview and published output. */
export const RUNTIME_DIR = '_tessera';

export function lessonFile(id) {
  return `${LESSONS_DIR}/${id}.json`;
}

/** Normalise any relative path to forward slashes without leading "./" or "/". */
export function toPosixRel(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

/** True if a project-relative path stays inside the project (no "..", no drive letters). */
export function isSafeRelPath(p) {
  if (typeof p !== 'string' || !p) return false;
  // Absolute paths (POSIX, UNC, drive letters) are refused rather than reinterpreted.
  if (/^([\\/]|[a-zA-Z]:)/.test(p)) return false;
  const n = toPosixRel(p);
  return !n.split('/').some((seg) => seg === '..');
}
