// Bridge to the desktop shell. In the desktop app, calls go through the preload's
// allow-listed IPC. When the editor runs in a plain browser (development only), a small
// in-memory mock is used so the UI can be worked on without Electron.

import { createProject } from '../core/model.js';

const bridge = typeof window !== 'undefined' ? window.tessera : null;
export const isDesktop = !!bridge;

function mockApi() {
  let saved = null;
  const checkpoints = [];
  let previewHtml = '';
  return {
    'app:info': () => ({ version: 'dev', platform: 'browser', portable: false }),
    'recent:list': () => [],
    'project:new': (title) => {
      const state = createProject({ title });
      saved = state;
      return { root: '(browser memory)', name: title, state, warnings: [], recovery: null };
    },
    'project:open': () => null,
    'project:save': (state) => {
      saved = { ...state, manifest: { ...state.manifest, modified: new Date().toISOString() } };
      return { state: saved, written: ['(memory)'] };
    },
    'project:autosave': () => true,
    'project:close': () => true,
    'checkpoint:create': (label, state) => {
      const c = { id: `cp${checkpoints.length}`, label, created: new Date().toISOString(), state };
      checkpoints.unshift(c);
      return c;
    },
    'checkpoint:list': () => checkpoints.map(({ id, label, created }) => ({ id, label, created })),
    'checkpoint:restore': (id) => checkpoints.find((c) => c.id === id)?.state,
    'checkpoint:delete': (id) => { checkpoints.splice(checkpoints.findIndex((c) => c.id === id), 1); },
    'assets:import': () => ({ added: [], reused: [] }),
    'assets:check': () => [],
    'preview:update': (p) => { previewHtml = p.html; return 'index.html'; },
    'mock:previewHtml': () => previewHtml,
  };
}

const mock = bridge ? null : mockApi();

export async function call(channel, ...args) {
  if (bridge) return bridge.invoke(channel, ...args);
  const fn = mock[channel];
  if (!fn) throw new Error(`Not available in browser mode: ${channel}`);
  return fn(...args);
}

export function on(channel, listener) {
  return bridge ? bridge.on(channel, listener) : () => {};
}

export function pathForFile(file) {
  return bridge ? bridge.pathForFile(file) : null;
}

/** URL of a project file inside the isolated preview origin. */
export function projectUrl(rel) {
  if (!rel) return '';
  return isDesktop ? `tessera-preview://project/${rel.split('/').map(encodeURIComponent).join('/')}` : '';
}

export const PREVIEW_BASE = isDesktop ? 'tessera-preview://project/' : null;
