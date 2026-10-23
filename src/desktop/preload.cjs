// Preload bridge. The editor UI runs sandboxed with no Node.js access; it can only call
// the allow-listed channels below. Preview frames and imported code never get this bridge
// (preloads run only in the main frame).

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const CHANNELS = new Set([
  'app:info', 'app:openExternal', 'app:confirmClose',
  'recent:list', 'recent:remove',
  'project:new', 'project:open', 'project:openPath', 'project:openStartup', 'project:save', 'project:autosave', 'project:recover', 'project:close', 'project:reveal',
  'checkpoint:create', 'checkpoint:list', 'checkpoint:restore', 'checkpoint:delete',
  'assets:import', 'assets:importPaths', 'assets:replace', 'assets:relink', 'assets:optimize', 'assets:revertOptimize', 'assets:reveal', 'assets:check',
  'import:analyze', 'import:analyzePath', 'import:analyzeStartup', 'import:run', 'import:cancel',
  'theme:export', 'theme:import', 'font:import',
  'export:run', 'export:reveal',
  'preview:update',
  'component:create', 'component:importFolder',
]);

contextBridge.exposeInMainWorld('tessera', {
  invoke(channel, ...args) {
    if (!CHANNELS.has(channel)) return Promise.reject(new Error(`Unknown channel: ${channel}`));
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel, listener) {
    if (!['app:before-close', 'menu:command'].includes(channel)) return () => {};
    const wrapped = (_e, ...args) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  /** Path of a file dropped onto the window (only files the user dragged in). */
  pathForFile(file) {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },
});
