// Custom protocols.
//
//   tessera-app://editor/…      the editor UI (built files in dist/editor)
//   tessera-preview://project/… the open project, for the isolated preview
//
// The preview origin is separate from the editor origin, so preview content (including
// imported scripts) cannot reach the editor's DOM or its IPC bridge. The preview handler
// only serves files inside the open project (symbolic links are resolved and checked),
// the shared course runtime, and in-memory preview documents. It never serves editor
// state (.tessera/) and never lists folders.

import { protocol, net } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import { resolveInside } from '../io/fsutil.js';
import { RUNTIME_DIR, STATE_DIR } from '../core/format.js';

export const APP_SCHEME = 'tessera-app';
export const PREVIEW_SCHEME = 'tessera-preview';

export function registerSchemes() {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
    { scheme: PREVIEW_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

const EDITOR_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${PREVIEW_SCHEME}:`,
  `media-src 'self' ${PREVIEW_SCHEME}:`,
  `frame-src ${PREVIEW_SCHEME}:`,
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.vtt': 'text/vtt',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
};
const typeOf = (p) => TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream';

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
}

/** Serve the built editor UI. */
export function handleAppProtocol(editorDir) {
  protocol.handle(APP_SCHEME, async (req) => {
    const url = new URL(req.url);
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    try {
      const file = await resolveInside(editorDir, rel);
      const data = await fs.readFile(file);
      const headers = { 'content-type': typeOf(file) };
      if (file.endsWith('.html')) headers['content-security-policy'] = EDITOR_CSP;
      return new Response(data, { headers });
    } catch {
      return notFound();
    }
  });
}

/**
 * Preview protocol. `getState()` returns { root, documents: Map<rel,string> } for the
 * currently open project, or null.
 */
export function handlePreviewProtocol(runtimeDir, getState) {
  protocol.handle(PREVIEW_SCHEME, async (req) => {
    const s = getState();
    if (!s?.root) return notFound();
    const url = new URL(req.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const noStore = { 'cache-control': 'no-store' };
    if (s.documents.has(rel)) {
      return new Response(s.documents.get(rel), { headers: { 'content-type': typeOf(rel), ...noStore } });
    }
    if (rel.startsWith(`${RUNTIME_DIR}/`)) {
      try {
        const file = await resolveInside(runtimeDir, rel.slice(RUNTIME_DIR.length + 1));
        return new Response(await fs.readFile(file), { headers: { 'content-type': typeOf(file), ...noStore } });
      } catch {
        return notFound();
      }
    }
    if (!rel || rel === STATE_DIR || rel.startsWith(`${STATE_DIR}/`) || rel.split('/').some((seg) => seg.startsWith('.'))) return notFound();
    try {
      const file = await resolveInside(s.root, rel, { real: true });
      const stat = await fs.stat(file);
      if (!stat.isFile()) return notFound();
      // net.fetch on file: URLs supports range requests, needed for seeking in media.
      const res = await net.fetch(pathToFileURL(file).toString(), { headers: req.headers });
      const headers = new Headers(res.headers);
      headers.set('content-type', typeOf(file));
      headers.set('cache-control', 'no-store');
      return new Response(res.body, { status: res.status, headers });
    } catch {
      return notFound();
    }
  });
}
