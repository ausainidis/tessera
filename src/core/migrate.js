// Format migrations. A project written by an older version is upgraded in memory when
// opened; it is written in the current format the next time the author saves.
// A project written by a newer version is refused rather than risk losing data.

import { FORMAT_VERSION, PROJECT_FORMAT } from './format.js';
import { getBlockDef } from './blocks/index.js';

/** Ordered upgrade steps: MANIFEST_MIGRATIONS[n] upgrades a version-n state to n+1. */
const MANIFEST_MIGRATIONS = {
  // Example for future use:
  // 1: (state) => { state.manifest.newField = default; return state; },
};

export class FormatError extends Error {}

export function checkManifest(manifest) {
  if (!manifest || manifest.format !== PROJECT_FORMAT) {
    throw new FormatError('This folder does not contain a Tessera project (tessera-project.json is missing or invalid).');
  }
  const v = Number(manifest.formatVersion);
  if (!Number.isInteger(v) || v < 1) throw new FormatError(`Unknown project format version: ${manifest.formatVersion}`);
  if (v > FORMAT_VERSION) {
    throw new FormatError(`This project was saved by a newer version of Tessera (format ${v}). This version reads format ${FORMAT_VERSION} and earlier. Update Tessera to open it.`);
  }
}

/** Upgrade a freshly loaded state in place. Returns a list of human-readable notes. */
export function migrateState(state) {
  const notes = [];
  let v = Number(state.manifest.formatVersion);
  while (v < FORMAT_VERSION) {
    const step = MANIFEST_MIGRATIONS[v];
    if (!step) throw new FormatError(`No migration from format ${v}`);
    state = step(state);
    notes.push(`Upgraded project format ${v} → ${v + 1}.`);
    v += 1;
  }
  state.manifest.formatVersion = FORMAT_VERSION;
  for (const lesson of Object.values(state.lessons)) {
    lesson.blocks = lesson.blocks.map((b) => {
      const def = getBlockDef(b.type);
      let block = b;
      while (def && Number(block.v || 1) < def.version) {
        const from = Number(block.v || 1);
        const step = def.migrations?.[from];
        if (!step) break;
        block = { ...step(block), v: from + 1 };
        notes.push(`Upgraded ${b.type} block ${b.id} to version ${from + 1}.`);
      }
      return block;
    });
  }
  return { state, notes };
}
