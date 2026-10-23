// Rich text is stored as a small, allow-listed HTML subset. The same sanitiser runs in the
// editor (browser), the importers (Node) and the renderer, so stored content is always safe
// to render and stays human-readable in the JSON files.

import { parseDocument } from 'htmlparser2';
import { escapeHtml, escapeAttr } from './html.js';

const BLOCK_TAGS = new Set(['p', 'ul', 'ol', 'li', 'br', 'blockquote']);
const INLINE_TAGS = new Set(['strong', 'em', 'u', 's', 'a', 'code', 'sub', 'sup', 'br', 'span']);
const RENAME = { b: 'strong', i: 'em', strike: 's', del: 's', div: 'p' };
const DROP_WITH_CONTENT = new Set(['script', 'style', 'template', 'iframe', 'object', 'embed', 'noscript', 'head', 'title', 'svg', 'math']);
const VOID = new Set(['br']);

export function isSafeHref(href) {
  const h = String(href || '').trim();
  if (!h) return false;
  if (/^(https?:|mailto:|tel:)/i.test(h)) return true;
  if (/^#[\w-]*$/.test(h)) return true;
  // Project-relative link (e.g. to an attachment). Must not contain a scheme.
  return !/^[a-z][a-z0-9+.-]*:/i.test(h) && !h.startsWith('//');
}

function serialise(nodes, allowed) {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += escapeHtml(node.data);
      continue;
    }
    if (node.type !== 'tag') continue; // comments, directives, CDATA are dropped
    let name = node.name.toLowerCase();
    if (DROP_WITH_CONTENT.has(name)) continue;
    if (/^h[1-6]$/.test(name)) name = allowed.has('p') ? 'p' : 'strong';
    name = RENAME[name] || name;
    const inner = serialise(node.children || [], allowed);
    if (!allowed.has(name)) {
      out += inner; // unwrap unknown elements but keep their text
      continue;
    }
    let attrs = '';
    if (name === 'a') {
      const href = node.attribs?.href;
      if (isSafeHref(href)) {
        attrs += ` href="${escapeAttr(href.trim())}"`;
        if (/^https?:/i.test(href.trim())) attrs += ' target="_blank" rel="noopener noreferrer"';
      }
      if (node.attribs?.title) attrs += ` title="${escapeAttr(node.attribs.title)}"`;
    }
    if (name === 'span' && node.attribs?.lang) attrs += ` lang="${escapeAttr(node.attribs.lang)}"`;
    if (name === 'span' && !attrs) {
      out += inner; // a span without semantics is noise
      continue;
    }
    out += VOID.has(name) ? `<${name}>` : `<${name}${attrs}>${inner}</${name}>`;
  }
  return out;
}

const TOP_BLOCKS = new Set(['p', 'ul', 'ol', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const CONTAINERS = new Set(['div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'figure', 'body', 'html', 'nav', 'form', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'dl', 'dd', 'dt']);

/** Sanitise block-level rich text (paragraphs, lists, inline formatting). */
export function sanitizeRichText(html) {
  if (html == null) return '';
  const doc = parseDocument(String(html), { decodeEntities: true, lowerCaseTags: true });
  const allowed = new Set([...BLOCK_TAGS, ...INLINE_TAGS]);
  let out = '';
  let inlineRun = '';
  const flush = () => {
    if (inlineRun.replace(/<br>/g, '').trim()) out += `<p>${inlineRun.trim()}</p>`;
    inlineRun = '';
  };
  // Top level: block elements pass through; runs of loose inline content become paragraphs.
  const top = (nodes) => {
    for (const node of nodes) {
      const name = node.type === 'tag' ? node.name.toLowerCase() : '';
      if (name && CONTAINERS.has(name)) { flush(); top(node.children || []); continue; }
      const piece = serialise([node], allowed);
      if (TOP_BLOCKS.has(name)) { flush(); out += piece; } else inlineRun += piece;
    }
    flush();
  };
  top(doc.children);
  return out.replace(/<p>\s*<\/p>/g, '').trim();
}

/** Sanitise inline rich text (captions, labels, choice text): no paragraphs or lists. */
export function sanitizeInline(html) {
  if (html == null) return '';
  const doc = parseDocument(String(html), { decodeEntities: true, lowerCaseTags: true });
  return serialise(doc.children, INLINE_TAGS).replace(/\s+/g, ' ').trim();
}

/** Plain text from (possibly untrusted) HTML. */
export function htmlToText(html) {
  if (html == null) return '';
  const doc = parseDocument(String(html), { decodeEntities: true });
  const parts = [];
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.type === 'text') parts.push(n.data);
      else if (n.type === 'tag' && !DROP_WITH_CONTENT.has(n.name)) {
        if (/^(p|li|br|div|h[1-6]|blockquote|tr)$/.test(n.name)) parts.push(' ');
        walk(n.children || []);
      }
    }
  };
  walk(doc.children);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

export function textToHtml(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
