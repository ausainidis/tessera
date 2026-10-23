// IPC handlers: the only way the editor UI can touch the file system.
//
// Rules:
//  - Every handler checks that the call comes from the editor's main frame.
//  - Paths are chosen through dialogs shown by this process, taken from the recent list,
//    or come from files the user dragged onto the window. The UI cannot name arbitrary paths
//    for writing; project files are always resolved inside the open project folder.

import { ipcMain, dialog, shell, nativeImage, app } from 'electron';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { ProjectStore, isProjectFolder } from '../io/project-store.js';
import {
  importAssetFiles, replaceAssetFile, relinkAsset, optimizeImageAsset, revertOptimizedAsset,
} from '../io/assets.js';
import { analyzeImport, performImport, cleanupAnalysis } from '../import/index.js';
import { sourceWriteBack, previewEntry } from '../import/writeback.js';
import { publishProject } from '../export/publish.js';
import { createProject } from '../core/model.js';
import { normalizeTheme } from '../core/theme.js';
import { safeFileName, exists, resolveInside, copyDir, writeFileAtomic } from '../io/fsutil.js';
import { APP_VERSION, COMPONENTS_DIR, THEME_FORMAT } from '../core/format.js';

const COMPONENT_TEMPLATE = (title) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, '&lt;')}</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<main id="app">
  <h1>${title.replace(/</g, '&lt;')}</h1>
  <p>Edit index.html, style.css and script.js in this folder to build your component.</p>
  <button type="button" id="done">Mark as complete</button>
</main>
<script src="script.js"></script>
</body>
</html>
`;
const COMPONENT_SCRIPT = `// Tessera component protocol (see docs/COMPONENTS.md):
//   send     { type: 'tessera:ready' }             when the script has started
//   receive  { type: 'tessera:config', config }    configuration set in the editor
//   send     { type: 'tessera:resize', height }    when sizing is "automatic"
//   send     { type: 'tessera:complete', score? }  when completion is tracked
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'tessera:config') {
    console.log('Component configuration', event.data.config);
  }
});
document.getElementById('done').addEventListener('click', () => {
  parent.postMessage({ type: 'tessera:complete' }, '*');
});
parent.postMessage({ type: 'tessera:ready' }, '*');
new ResizeObserver(() => {
  parent.postMessage({ type: 'tessera:resize', height: document.documentElement.scrollHeight }, '*');
}).observe(document.body);
`;

/** Image processor for optional optimisation, using Chromium's codecs (no native add-ons). */
async function processImage(src, dest, { maxWidth, quality, format }) {
  let img = nativeImage.createFromPath(src);
  if (img.isEmpty()) throw new Error('This image format cannot be optimised.');
  const size = img.getSize();
  if (size.width > maxWidth) img = img.resize({ width: maxWidth, quality: 'best' });
  const buf = format === 'png' ? img.toPNG() : img.toJPEG(quality);
  await fs.writeFile(dest, buf);
  return img.getSize();
}

async function imageSize(file) {
  const img = nativeImage.createFromPath(file);
  if (img.isEmpty()) return {};
  const { width, height } = img.getSize();
  return { width, height };
}

const ACCEPT = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'],
  audio: ['mp3', 'm4a', 'aac', 'ogg', 'wav', 'opus'],
  video: ['mp4', 'm4v', 'webm', 'ogv', 'mov'],
  captions: ['vtt'],
  font: ['woff2', 'woff', 'ttf', 'otf'],
};

export function registerIpc({ getWindow, runtimeDir, preview, recent, startupPath = null, startupImport = null }) {
  /** @type {null | { store: ProjectStore, root: string }} */
  let session = null;
  const analyses = new Map();

  const sourceReader = () => (rel) => {
    try {
      return fss.readFileSync(path.join(session.root, ...rel.split('/')), 'utf8');
    } catch {
      return null;
    }
  };

  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, ...args) => {
      const win = getWindow();
      if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) {
        throw new Error('Rejected IPC call from an untrusted frame.');
      }
      return fn(...args);
    });
  };
  const requireSession = () => {
    if (!session) throw new Error('No project is open.');
    return session;
  };

  async function openSession(root) {
    const opened = await ProjectStore.open(root);
    session = { store: opened.store, root: opened.store.root };
    preview.setRoot(session.root);
    await recent.add(session.root, opened.state.manifest.course.title);
    return { root: session.root, name: path.basename(session.root), state: opened.state, warnings: opened.warnings, recovery: opened.recovery };
  }

  handle('app:info', () => ({ version: APP_VERSION, electron: process.versions.electron, platform: process.platform, portable: app.getPath('userData').startsWith(path.dirname(process.execPath)) }));
  handle('app:openExternal', (url) => {
    if (!/^https:\/\//.test(String(url))) throw new Error('Only https links can be opened.');
    return shell.openExternal(url);
  });

  handle('recent:list', () => recent.list());
  handle('recent:remove', (p) => recent.remove(p));

  handle('project:new', async (title) => {
    const r = await dialog.showOpenDialog(getWindow(), { title: 'Choose where to create the project folder', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const dir = path.join(r.filePaths[0], safeFileName(title || 'New course', 'course').replace(/\.[^.]*$/, ''));
    if (await exists(dir)) throw new Error(`A folder named “${path.basename(dir)}” already exists there.`);
    await ProjectStore.create(dir, createProject({ title: title || 'New course' }));
    return openSession(dir);
  });

  handle('project:open', async () => {
    const r = await dialog.showOpenDialog(getWindow(), { title: 'Open a Tessera project folder', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    if (!(await isProjectFolder(r.filePaths[0]))) return { needsImport: true, path: r.filePaths[0] };
    return openSession(r.filePaths[0]);
  });

  handle('project:openPath', async (p) => {
    const known = (await recent.list()).some((x) => x.path === p);
    if (!known) throw new Error('Unknown project path.');
    if (!(await isProjectFolder(p))) throw new Error('The project folder is no longer there or is not a Tessera project.');
    return openSession(p);
  });

  // A project folder given on the command line (e.g. "Tessera.exe --open=C:\Courses\X").
  handle('project:openStartup', async () => {
    if (!startupPath || !(await isProjectFolder(startupPath))) throw new Error('The project given on the command line could not be opened.');
    return openSession(path.resolve(startupPath));
  });

  handle('project:save', async (state) => {
    const s = requireSession();
    const extra = sourceWriteBack(state, sourceReader());
    const result = await s.store.save(state, extra);
    preview.clearDocuments();
    return { state: result.state, written: result.written };
  });

  handle('project:autosave', async (state) => {
    await requireSession().store.autosave(state);
    return true;
  });

  handle('project:recover', async (choice) => {
    const s = requireSession();
    if (choice === 'restore') return s.store.loadAutosave();
    await s.store.clearAutosave();
    return null;
  });

  handle('project:close', async () => {
    session = null;
    preview.setRoot(null);
    return true;
  });

  handle('project:reveal', () => shell.openPath(requireSession().root));

  handle('checkpoint:create', (label, state) => requireSession().store.createCheckpoint(state, label));
  handle('checkpoint:list', () => requireSession().store.listCheckpoints());
  handle('checkpoint:restore', (id) => requireSession().store.loadCheckpoint(id));
  handle('checkpoint:delete', (id) => requireSession().store.deleteCheckpoint(id));

  handle('assets:import', async (assets, accept) => {
    const s = requireSession();
    const filters = accept && ACCEPT[accept] ? [{ name: accept, extensions: ACCEPT[accept] }] : [];
    const r = await dialog.showOpenDialog(getWindow(), { title: 'Add media to the project', properties: ['openFile', 'multiSelections'], filters: [...filters, { name: 'All files', extensions: ['*'] }] });
    if (r.canceled) return { added: [], reused: [] };
    return importAssetFiles(s.root, assets, r.filePaths, { imageSize });
  });

  handle('assets:importPaths', async (assets, paths) => {
    const s = requireSession();
    const files = [];
    for (const p of (paths || []).slice(0, 200)) {
      try {
        if (typeof p === 'string' && (await fs.stat(p)).isFile()) files.push(p);
      } catch { /* skip */ }
    }
    return importAssetFiles(s.root, assets, files, { imageSize });
  });

  handle('assets:replace', async (entry) => {
    const s = requireSession();
    const r = await dialog.showOpenDialog(getWindow(), { title: `Replace “${entry.originalName || entry.path}”`, properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    return replaceAssetFile(s.root, entry, r.filePaths[0], { imageSize });
  });

  handle('assets:relink', async (entry) => {
    const s = requireSession();
    const r = await dialog.showOpenDialog(getWindow(), { title: `Locate “${entry.originalName || entry.path}”`, properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    return relinkAsset(s.root, entry, r.filePaths[0], { imageSize });
  });

  handle('assets:optimize', (entry, opts) => optimizeImageAsset(requireSession().root, entry, processImage, opts));
  handle('assets:revertOptimize', (entry) => revertOptimizedAsset(requireSession().root, entry));
  handle('assets:reveal', async (entry) => shell.showItemInFolder(await resolveInside(requireSession().root, entry.path)));
  handle('assets:check', async (assets) => {
    const s = requireSession();
    const missing = [];
    for (const a of Object.values(assets)) {
      try {
        if (!(await exists(await resolveInside(s.root, a.path)))) missing.push(a.id);
      } catch {
        missing.push(a.id);
      }
    }
    return missing;
  });

  handle('import:analyze', async (kind) => {
    const r = await dialog.showOpenDialog(getWindow(), kind === 'zip'
      ? { title: 'Choose a ZIP file to import', properties: ['openFile'], filters: [{ name: 'ZIP archives', extensions: ['zip'] }] }
      : { title: 'Choose a folder to import', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const analysis = await analyzeImport(r.filePaths[0]);
    const id = `a${Date.now()}`;
    analyses.set(id, analysis);
    return { analysisId: id, report: analysis.report };
  });

  const analyzeKnownPath = async (p) => {
    const stat = await fs.stat(p).catch(() => null);
    if (!stat || !(stat.isDirectory() || (stat.isFile() && /.zip$/i.test(p)))) throw new Error('Drop a folder or a .zip file to import it.');
    const analysis = await analyzeImport(p);
    const id = `a${Date.now()}`;
    analyses.set(id, analysis);
    return { analysisId: id, report: analysis.report };
  };
  // A folder or ZIP the user dropped onto the window (path obtained from the dropped file).
  handle('import:analyzePath', (p) => analyzeKnownPath(String(p)));
  // A folder or ZIP given on the command line: Tessera.exe --import="C:\exports\course.zip"
  handle('import:analyzeStartup', () => {
    if (!startupImport) throw new Error('No import was requested on the command line.');
    return analyzeKnownPath(startupImport);
  });

  handle('import:run', async (analysisId, strategy) => {
    const analysis = analyses.get(analysisId);
    if (!analysis) throw new Error('This import analysis has expired. Analyse the source again.');
    if (analysis.detection.kind === 'native') return openSession(analysis.root);
    const r = await dialog.showOpenDialog(getWindow(), { title: 'Choose where to create the new project folder', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const base = safeFileName(`${path.basename(analysis.inputPath).replace(/\.zip$/i, '')} (Tessera)`, 'imported').replace(/\.[^.]*$/, '');
    let dir = path.join(r.filePaths[0], base);
    for (let i = 2; await exists(dir); i += 1) dir = path.join(r.filePaths[0], `${base}-${i}`);
    await performImport(analysis, { strategy, targetDir: dir });
    await cleanupAnalysis(analysis);
    analyses.delete(analysisId);
    return openSession(dir);
  });

  handle('import:cancel', async (analysisId) => {
    await cleanupAnalysis(analyses.get(analysisId));
    analyses.delete(analysisId);
  });

  handle('theme:export', async (theme) => {
    const r = await dialog.showSaveDialog(getWindow(), { title: 'Export theme', defaultPath: `${safeFileName(theme.name || 'theme').replace(/\.[^.]*$/, '')}.tessera-theme.json`, filters: [{ name: 'Tessera theme', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    // Font files are referenced by path; they are exported alongside the theme file.
    const t = normalizeTheme(theme);
    const s = session;
    if (s && t.typography.fonts.length) {
      const fontDir = path.join(path.dirname(r.filePath), 'fonts');
      await fs.mkdir(fontDir, { recursive: true });
      for (const f of t.typography.fonts) {
        try {
          await fs.copyFile(await resolveInside(s.root, f.src), path.join(fontDir, path.basename(f.src)));
          f.src = `fonts/${path.basename(f.src)}`;
        } catch { /* missing font file */ }
      }
    }
    await writeFileAtomic(r.filePath, `${JSON.stringify(t, null, 2)}\n`);
    return r.filePath;
  });

  handle('theme:import', async () => {
    const s = requireSession();
    const r = await dialog.showOpenDialog(getWindow(), { title: 'Import theme', properties: ['openFile'], filters: [{ name: 'Tessera theme', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const raw = JSON.parse(await fs.readFile(r.filePaths[0], 'utf8'));
    if (raw.format !== THEME_FORMAT) throw new Error('This file is not a Tessera theme.');
    const t = normalizeTheme(raw);
    const fontEntries = [];
    const fonts = [];
    for (const f of t.typography.fonts) {
      const src = path.resolve(path.dirname(r.filePaths[0]), f.src);
      if (!(await exists(src))) continue;
      const { added, reused } = await importAssetFiles(s.root, {}, [src]);
      const e = added[0] || reused[0];
      if (added[0]) fontEntries.push(added[0]);
      fonts.push({ ...f, src: e.path });
    }
    t.typography.fonts = fonts;
    return { theme: t, assets: fontEntries };
  });

  handle('font:import', async (assets) => {
    const s = requireSession();
    const r = await dialog.showOpenDialog(getWindow(), { title: 'Add a font file', properties: ['openFile'], filters: [{ name: 'Fonts', extensions: ACCEPT.font }] });
    if (r.canceled || !r.filePaths[0]) return null;
    return importAssetFiles(s.root, assets, [r.filePaths[0]]);
  });

  handle('export:run', async (state, opts) => {
    const s = requireSession();
    const r = await dialog.showOpenDialog(getWindow(), { title: 'Choose where to save the published course', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const suffix = opts.format === 'scorm12' ? 'scorm12' : 'web';
    const name = `${safeFileName(state.manifest.course.title || 'course', 'course').replace(/\.[^.]*$/, '')}-${suffix}`;
    const outDir = path.join(r.filePaths[0], name);
    const sourceFiles = sourceWriteBack(state, sourceReader());
    return publishProject(state, { projectRoot: s.root, outDir, runtimeDir, format: opts.format, zip: !!opts.zip, includeSource: !!opts.includeSource, sourceFiles });
  });

  handle('export:reveal', (p) => shell.openPath(p));

  handle('preview:update', async (payload) => {
    requireSession();
    if (payload.kind === 'native') {
      preview.setDocument('index.html', payload.html);
      return 'index.html';
    }
    // Preserved import: serve edited source files from memory, unchanged ones from disk.
    const changed = sourceWriteBack(payload.state, sourceReader());
    preview.replaceDocuments(changed);
    return previewEntry(payload.state, payload.lessonId, payload.blockId);
  });

  handle('component:create', async (title) => {
    const s = requireSession();
    const slug = safeFileName(title || 'component', 'component').replace(/\.[^.]*$/, '').toLowerCase();
    let dir = path.join(s.root, COMPONENTS_DIR, slug);
    for (let i = 2; await exists(dir); i += 1) dir = path.join(s.root, COMPONENTS_DIR, `${slug}-${i}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), COMPONENT_TEMPLATE(title || 'Component'));
    await fs.writeFile(path.join(dir, 'style.css'), 'body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; }\n');
    await fs.writeFile(path.join(dir, 'script.js'), COMPONENT_SCRIPT);
    shell.openPath(dir);
    return `${COMPONENTS_DIR}/${path.basename(dir)}/index.html`;
  });

  handle('component:importFolder', async () => {
    const s = requireSession();
    const r = await dialog.showOpenDialog(getWindow(), { title: 'Choose a self-contained web project folder (with index.html)', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const src = r.filePaths[0];
    if (!(await exists(path.join(src, 'index.html')))) throw new Error('The folder must contain an index.html entry point. Source projects must be built first; Tessera does not run build tools.');
    const slug = safeFileName(path.basename(src), 'component').replace(/\.[^.]*$/, '').toLowerCase();
    let dir = path.join(s.root, COMPONENTS_DIR, slug);
    for (let i = 2; await exists(dir); i += 1) dir = path.join(s.root, COMPONENTS_DIR, `${slug}-${i}`);
    await copyDir(src, dir, { skip: (rel, e) => e.isDirectory() && /(^|\/)(node_modules|\.git)$/.test(rel) });
    return `${COMPONENTS_DIR}/${path.basename(dir)}/index.html`;
  });

  return { hasSession: () => !!session };
}
