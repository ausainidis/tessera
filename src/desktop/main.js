// Electron main process: window, security policy, protocols and IPC.
//
// Security model (docs/SECURITY.md):
//  - The editor UI is sandboxed: no Node.js, context isolation, strict CSP, allow-listed IPC.
//  - Previews and imported code load from a separate origin (tessera-preview://) inside
//    sandboxed iframes and never receive the IPC bridge.
//  - New windows, navigation away from the editor, webviews and permission requests
//    (camera, location, notifications…) are refused.
//  - No network access is needed; content that needs the internet is reported, not fetched.

import { app, BrowserWindow, session, ipcMain, Menu, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerSchemes, handleAppProtocol, handlePreviewProtocol, APP_SCHEME } from './protocols.js';
import { registerIpc } from './ipc.js';
import { writeFileAtomic } from '../io/fsutil.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EDITOR_DIR = path.join(ROOT, 'dist', 'editor');
const RUNTIME_DIR = path.join(ROOT, 'dist', 'runtime');
const DEV_URL = process.env.TESSERA_DEV_URL || null;
const args = process.argv.slice(1);
const argValue = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) || null;

// Portable mode: keep settings in a "data" folder next to the executable when writable,
// so the application can run from a USB stick or any extracted folder.
if (app.isPackaged) {
  const portable = path.join(path.dirname(process.execPath), 'data');
  try {
    fs.mkdirSync(portable, { recursive: true });
    fs.accessSync(portable, fs.constants.W_OK);
    app.setPath('userData', portable);
  } catch { /* fall back to the per-user profile */ }
}

registerSchemes();
app.enableSandbox();

// ---------- Small persistent stores ----------

const recentFile = () => path.join(app.getPath('userData'), 'recent-projects.json');
const recent = {
  async list() {
    try {
      const items = JSON.parse(fs.readFileSync(recentFile(), 'utf8'));
      return items.filter((x) => fs.existsSync(x.path));
    } catch {
      return [];
    }
  },
  async add(p, title) {
    const items = (await this.list()).filter((x) => x.path !== p);
    items.unshift({ path: p, title, openedAt: new Date().toISOString() });
    await writeFileAtomic(recentFile(), JSON.stringify(items.slice(0, 12), null, 2));
  },
  async remove(p) {
    await writeFileAtomic(recentFile(), JSON.stringify((await this.list()).filter((x) => x.path !== p), null, 2));
  },
};

const previewState = { root: null, documents: new Map() };
const preview = {
  setRoot(root) { previewState.root = root; previewState.documents = new Map(); },
  setDocument(rel, text) { previewState.documents.set(rel, text); },
  replaceDocuments(map) { previewState.documents = new Map(map); },
  clearDocuments() { previewState.documents = new Map(); },
};

// ---------- Window ----------

let mainWindow = null;
let allowClose = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Tessera',
    backgroundColor: '#f6f7f9',
    show: false,
    webPreferences: {
      preload: path.join(ROOT, 'src', 'desktop', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      spellcheck: true,
    },
  });
  mainWindow.once('ready-to-show', () => { if (!argValue('smoke-test')) mainWindow.show(); });
  mainWindow.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    mainWindow.webContents.send('app:before-close');
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  const url = DEV_URL || `${APP_SCHEME}://editor/index.html`;
  const query = argValue('open') ? '?open=1' : argValue('import') ? '?import=1' : '';
  mainWindow.loadURL(url + query);
  return mainWindow;
}

function hardenSessions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'fullscreen' || permission === 'clipboard-sanitized-write'));
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'fullscreen' || permission === 'clipboard-sanitized-write');
  ses.on('will-download', (e) => e.preventDefault());
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (ev) => ev.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      // Links in previews (e.g. "open video in new window") go to the system browser,
      // but only plain https links; everything else is refused.
      if (/^https:\/\//.test(url)) setImmediate(() => shell.openExternal(url));
      return { action: 'deny' };
    });
    contents.on('will-navigate', (ev, url) => {
      const allowed = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith(`${APP_SCHEME}://`);
      if (!allowed) ev.preventDefault();
    });
  });
}

function buildMenu() {
  const send = (cmd) => () => mainWindow?.webContents.send('menu:command', cmd);
  const template = [
    { label: 'File', submenu: [
      { label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('save') },
      { label: 'Create checkpoint…', click: send('checkpoint') },
      { type: 'separator' },
      { label: 'Publish…', accelerator: 'CmdOrCtrl+Shift+E', click: send('export') },
      { type: 'separator' },
      { label: 'Close project', click: send('close') },
      { role: 'quit' },
    ] },
    { label: 'Edit', submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
      { label: 'Redo', accelerator: 'CmdOrCtrl+Y', click: send('redo') },
      { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ] },
    { label: 'View', submenu: [
      { label: 'Toggle preview', accelerator: 'CmdOrCtrl+P', click: send('togglePreview') },
      { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
    ] },
    { label: 'Help', submenu: [
      { label: 'Read me', click: () => shell.openPath([path.join(path.dirname(process.execPath), 'README.md'), path.join(ROOT, 'README.md')].find((f) => fs.existsSync(f))) },
      { label: 'Licences', click: () => shell.openPath([path.join(path.dirname(process.execPath), 'THIRD_PARTY_NOTICES.md'), path.join(ROOT, 'THIRD_PARTY_NOTICES.md')].find((f) => fs.existsSync(f))) },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  hardenSessions();
  handleAppProtocol(EDITOR_DIR);
  handlePreviewProtocol(RUNTIME_DIR, () => previewState);
  registerIpc({ getWindow: () => mainWindow, runtimeDir: RUNTIME_DIR, preview, recent, startupPath: argValue('open'), startupImport: argValue('import') });
  ipcMain.handle('app:confirmClose', (event) => {
    if (event.sender !== mainWindow?.webContents) return false;
    allowClose = true;
    mainWindow.close();
    return true;
  });
  buildMenu();
  createWindow();

  // Automated check used by scripts/smoke-test.mjs: render, capture, quit.
  const shot = argValue('smoke-test');
  if (shot) {
    const delay = Number(argValue('smoke-delay') || 4000);
    setTimeout(async () => {
      try {
        const script = argValue('smoke-script');
        if (script) {
          const log = await mainWindow.webContents.executeJavaScript(`(async () => { ${fs.readFileSync(script, 'utf8')} })()`).catch((e) => `SCRIPT FAILED: ${e.message}`);
          fs.writeFileSync(`${shot}.log`, typeof log === 'string' ? log : JSON.stringify(log, null, 2));
          await new Promise((r) => setTimeout(r, Number(argValue('smoke-after') || 1500)));
        }
        // Record what every frame (editor, preview, components) shows, for automated checks.
        const frames = [];
        for (const f of mainWindow.webContents.mainFrame.framesInSubtree) {
          const text = await f.executeJavaScript('[...document.scripts].map((s) => s.src.split("/").pop() || "inline").join(",") + " | " + (document.body ? document.body.innerText : "").replace(/\\s+/g, " ").slice(0, 300)').catch((e) => `(${e.message})`);
          frames.push(`${f.url.slice(0, 120)} :: ${text}`);
        }
        fs.writeFileSync(`${shot}.frames.txt`, frames.join('\n'));
        const img = await mainWindow.webContents.capturePage();
        fs.writeFileSync(shot, img.toPNG());
        const text = await mainWindow.webContents.executeJavaScript('document.body.innerText.slice(0, 2000)');
        fs.writeFileSync(`${shot}.txt`, text);
      } finally {
        allowClose = true;
        app.quit();
      }
    }, delay);
  }
});

app.on('window-all-closed', () => app.quit());
