// Reading and writing native project folders.
//
// Safeguards (see docs/ARCHITECTURE.md, "Editing safeguards"):
//  - Every file is written atomically (temp file + fsync + rename).
//  - A multi-file save is journaled: if the editor stops half-way through renaming,
//    the journal lets the next open finish the save, so lessons never mix old and new.
//  - Only files whose content changed are rewritten.
//  - Removed lesson files are moved to .tessera/trash, not deleted.
//  - Autosave goes to .tessera/autosave.json, never over the author's saved files.
//  - Manual checkpoints are full snapshots in .tessera/checkpoints.

import fs from 'node:fs/promises';
import path from 'node:path';
import { serializeProject, deserializeProject, stableJson } from '../core/serialize.js';
import { MANIFEST_FILE, STATE_DIR, LESSONS_DIR, ASSETS_FILE } from '../core/format.js';
import {
  exists, readTextOrNull, writeTemp, renameReplace, writeFileAtomic, resolveInside, listFiles, safeFileName,
} from './fsutil.js';

const JOURNAL = `${STATE_DIR}/journal.json`;
const AUTOSAVE = `${STATE_DIR}/autosave.json`;
const CHECKPOINTS = `${STATE_DIR}/checkpoints`;
const TRASH = `${STATE_DIR}/trash`;

const abs = (root, rel) => path.join(root, ...rel.split('/'));

export async function isProjectFolder(dir) {
  return exists(path.join(dir, MANIFEST_FILE));
}

/** Finish (or discard) a save that was interrupted. Returns a note if anything was done. */
async function recoverJournal(root) {
  const text = await readTextOrNull(abs(root, JOURNAL));
  if (text == null) return null;
  let journal;
  try {
    journal = JSON.parse(text);
  } catch {
    await fs.rm(abs(root, JOURNAL), { force: true });
    return 'An interrupted save journal was unreadable and has been removed. Saved files were not changed.';
  }
  let completed = 0;
  for (const { tmp, target } of journal.entries || []) {
    const tmpAbs = await resolveInside(root, tmp);
    if (await exists(tmpAbs)) {
      await renameReplace(tmpAbs, await resolveInside(root, target));
      completed += 1;
    }
  }
  await fs.rm(abs(root, JOURNAL), { force: true });
  return completed ? `Completed an interrupted save (${completed} file${completed === 1 ? '' : 's'}).` : null;
}

async function removeStrayTemps(root) {
  const files = await listFiles(root, { skip: (rel, e) => e.isDirectory() && (rel === 'node_modules' || rel === '.git') });
  for (const f of files) if (/\.[0-9a-f]{8}\.tmp$/.test(f)) await fs.rm(abs(root, f), { force: true });
}

export class ProjectStore {
  constructor(root) {
    this.root = path.resolve(root);
    /** project-relative path → last content written to / read from disk */
    this.known = new Map();
  }

  /** Create a new project folder. Refuses to overwrite an existing project. */
  static async create(root, state) {
    await fs.mkdir(root, { recursive: true });
    if (await isProjectFolder(root)) throw new Error('This folder already contains a Tessera project.');
    for (const dir of [LESSONS_DIR, 'assets', 'themes', STATE_DIR]) await fs.mkdir(path.join(root, dir), { recursive: true });
    await fs.writeFile(path.join(root, STATE_DIR, 'README.txt'), 'Tessera editor state (autosave, checkpoints, trash).\nSafe to delete when the editor is closed; never needed to open the project.\n');
    const store = new ProjectStore(root);
    await store.save(state);
    return store;
  }

  /**
   * Open a project folder.
   * @returns {Promise<{store: ProjectStore, state: object, warnings: string[], recovery: null|{savedAt: string}}>}
   */
  static async open(root) {
    const store = new ProjectStore(root);
    const warnings = [];
    const note = await recoverJournal(store.root);
    if (note) warnings.push(note);
    await removeStrayTemps(store.root);
    const cache = new Map();
    const lessonFiles = (await listFiles(abs(store.root, LESSONS_DIR))).map((f) => `${LESSONS_DIR}/${f}`);
    // Lessons are read lazily through this synchronous reader after prefetching.
    const prefetch = [MANIFEST_FILE, ASSETS_FILE, ...lessonFiles];
    for (const rel of prefetch) cache.set(rel, await readTextOrNull(abs(store.root, rel)));
    const manifestText = cache.get(MANIFEST_FILE);
    if (manifestText) {
      try {
        const themeRel = JSON.parse(manifestText).theme;
        if (typeof themeRel === 'string') cache.set(themeRel, await readTextOrNull(await resolveInside(store.root, themeRel)));
      } catch { /* reported by deserializeProject */ }
    }
    const { state, warnings: w } = deserializeProject((rel) => (cache.has(rel) ? cache.get(rel) : null), lessonFiles);
    warnings.push(...w);
    for (const [rel, text] of cache) if (text != null) store.known.set(rel, text);
    await store.checkAssetFiles(state);
    const recovery = await store.readAutosaveInfo();
    return { store, state, warnings, recovery };
  }

  /** Mark assets whose files are missing (in memory only; never written as data loss). */
  async checkAssetFiles(state) {
    for (const entry of Object.values(state.assets)) {
      let missing = true;
      try {
        missing = !(await exists(await resolveInside(this.root, entry.path)));
      } catch { /* unsafe path counts as missing */ }
      if (missing) entry.missing = true;
      else delete entry.missing;
    }
    return Object.values(state.assets).filter((a) => a.missing).map((a) => a.id);
  }

  /**
   * Save the project. `extraFiles` holds additional project-relative files to write in
   * the same transaction (used by preserved imports to update their source files).
   * Returns the state with an updated modification time.
   */
  async save(state, extraFiles = new Map()) {
    const saved = { ...state, manifest: { ...state.manifest, modified: new Date().toISOString() } };
    // Transient flags are not part of the format.
    const cleanAssets = Object.fromEntries(Object.entries(saved.assets).map(([id, a]) => {
      const { missing, ...rest } = a; // eslint-disable-line no-unused-vars
      return [id, rest];
    }));
    const files = serializeProject({ ...saved, assets: cleanAssets });
    for (const [rel, text] of extraFiles) files.set(rel, text);

    const changed = [...files].filter(([rel, text]) => this.known.get(rel) !== text && !(rel === MANIFEST_FILE && this.onlyModifiedDiffers(text)));
    const entries = [];
    for (const [rel, text] of changed) {
      const target = await resolveInside(this.root, rel);
      const tmp = await writeTemp(target, text);
      entries.push({ tmp: path.relative(this.root, tmp).split(path.sep).join('/'), target: rel });
    }
    if (entries.length) {
      await writeFileAtomic(abs(this.root, JOURNAL), JSON.stringify({ created: saved.manifest.modified, entries }));
      for (const { tmp, target } of entries) await renameReplace(abs(this.root, tmp), abs(this.root, target));
      await fs.rm(abs(this.root, JOURNAL), { force: true });
      for (const [rel, text] of changed) this.known.set(rel, text);
    }
    await this.trashUnlistedLessons(saved);
    await this.clearAutosave();
    return { state: saved, written: changed.map(([rel]) => rel) };
  }

  /** Avoid rewriting the manifest when only its timestamp would change. */
  onlyModifiedDiffers(text) {
    const prev = this.known.get(MANIFEST_FILE);
    if (!prev) return false;
    try {
      const a = JSON.parse(prev);
      const b = JSON.parse(text);
      a.modified = b.modified;
      return stableJson(a) === stableJson(b);
    } catch {
      return false;
    }
  }

  async trashUnlistedLessons(state) {
    const listed = new Set(state.manifest.lessons.map((id) => `${id}.json`));
    const files = await listFiles(abs(this.root, LESSONS_DIR));
    for (const f of files) {
      if (listed.has(f) || !f.endsWith('.json')) continue;
      const dest = abs(this.root, `${TRASH}/lessons/${Date.now()}-${f}`);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await renameReplace(abs(this.root, `${LESSONS_DIR}/${f}`), dest);
      this.known.delete(`${LESSONS_DIR}/${f}`);
    }
  }

  // ---------- Autosave and recovery ----------

  async autosave(state) {
    await writeFileAtomic(abs(this.root, AUTOSAVE), JSON.stringify({ savedAt: new Date().toISOString(), state }));
  }

  async readAutosaveInfo() {
    const text = await readTextOrNull(abs(this.root, AUTOSAVE));
    if (!text) return null;
    try {
      return { savedAt: JSON.parse(text).savedAt };
    } catch {
      return null;
    }
  }

  async loadAutosave() {
    const text = await readTextOrNull(abs(this.root, AUTOSAVE));
    if (!text) return null;
    const data = JSON.parse(text);
    await this.checkAssetFiles(data.state);
    return data.state;
  }

  async clearAutosave() {
    await fs.rm(abs(this.root, AUTOSAVE), { force: true });
  }

  // ---------- Checkpoints ----------

  async createCheckpoint(state, label = 'Checkpoint') {
    const created = new Date().toISOString();
    const name = `${created.replace(/[:.]/g, '-')}_${safeFileName(label, 'checkpoint').replace(/\.[^.]*$/, '')}.json`;
    await writeFileAtomic(abs(this.root, `${CHECKPOINTS}/${name}`), JSON.stringify({ label, created, state }));
    return { id: name, label, created };
  }

  async listCheckpoints() {
    const files = (await listFiles(abs(this.root, CHECKPOINTS))).filter((f) => f.endsWith('.json'));
    const out = [];
    for (const f of files) {
      try {
        const { label, created } = JSON.parse(await fs.readFile(abs(this.root, `${CHECKPOINTS}/${f}`), 'utf8'));
        out.push({ id: f, label, created });
      } catch { /* skip unreadable checkpoint */ }
    }
    return out.sort((a, b) => b.created.localeCompare(a.created));
  }

  async loadCheckpoint(id) {
    if (!/^[\w.-]+\.json$/.test(id)) throw new Error('Invalid checkpoint id');
    const { state } = JSON.parse(await fs.readFile(abs(this.root, `${CHECKPOINTS}/${id}`), 'utf8'));
    await this.checkAssetFiles(state);
    return state;
  }

  async deleteCheckpoint(id) {
    if (!/^[\w.-]+\.json$/.test(id)) throw new Error('Invalid checkpoint id');
    const dest = abs(this.root, `${TRASH}/checkpoints/${id}`);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await renameReplace(abs(this.root, `${CHECKPOINTS}/${id}`), dest);
  }
}
