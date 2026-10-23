// Static HTML import adapter.
//
//   preserve  The pages are kept as they are (working copy in source/). Text elements
//             (headings, paragraphs, list items, captions) and image alternative text are
//             bound to Tessera blocks; edits are written back into the HTML source at
//             the element's position, leaving every other byte untouched.
//   convert   Recognised elements become native Tessera blocks. Anything else — layout
//             grids, tables, forms, widgets — is kept verbatim as a "retained" HTML block.
//             Page stylesheets are carried over and listed in the style map for review.

import { parseDocument } from 'htmlparser2';
import { createManifest, createLesson } from '../../core/model.js';
import { newId } from '../../core/ids.js';
import { defaultTheme } from '../../core/theme.js';
import { getBlockDef } from '../../core/blocks/index.js';
import { sanitizeInline, sanitizeRichText, htmlToText } from '../../core/richtext.js';
import { escapeHtml, escapeAttr } from '../../core/html.js';
import { externalVideoEmbed } from '../../core/blocks/util.js';

const posix = {
  dirname: (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''),
  join: (...parts) => {
    const out = [];
    for (const seg of parts.join('/').split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') out.pop();
      else out.push(seg);
    }
    return out.join('/');
  },
};

const isTag = (n) => n.type === 'tag' || n.type === 'script' || n.type === 'style';
const elementChildren = (n) => (n.children || []).filter(isTag);
const INLINE = new Set(['a', 'abbr', 'b', 'strong', 'i', 'em', 'u', 's', 'span', 'code', 'sub', 'sup', 'br', 'small', 'mark', 'time', 'q', 'cite', 'kbd', 'dfn', 'del', 'ins']);
const CONTAINERS = new Set(['div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'body']);
const SKIP = new Set(['script', 'style', 'noscript', 'template', 'link', 'meta', 'nav']);

const isLocalRef = (u) => !!u && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u.trim());
const isExternal = (u) => /^(https?:)?\/\//i.test(u || '');
const stripQuery = (u) => u.split(/[?#]/)[0];

function parse(text) {
  return parseDocument(text, { withStartIndices: true, withEndIndices: true, decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
}

function find(node, pred, out = []) {
  for (const c of node.children || []) {
    if (!isTag(c)) continue;
    if (pred(c)) out.push(c);
    find(c, pred, out);
  }
  return out;
}

/** Inline-only element: contains only text and inline tags. */
function isInlineOnly(node) {
  return (node.children || []).every((c) => c.type === 'text' || c.type === 'comment' || (isTag(c) && INLINE.has(c.name) && isInlineOnly(c)));
}

function innerRange(text, node) {
  const kids = node.children || [];
  if (kids.length) return [kids[0].startIndex, kids.at(-1).endIndex + 1];
  const open = text.indexOf('>', node.startIndex) + 1;
  return [open, open];
}

function outerHtml(text, node) {
  return text.slice(node.startIndex, node.endIndex + 1);
}

function nodePath(node) {
  const path = [];
  let n = node;
  while (n.parent) {
    path.unshift(elementChildren(n.parent).indexOf(n));
    n = n.parent;
  }
  return path;
}

function nodeAt(doc, path) {
  let n = doc;
  for (const i of path) {
    n = elementChildren(n)[i];
    if (!n) return null;
  }
  return n;
}

// ---------- Analysis ----------

/** Analyse a static site for the compatibility report. */
export function analyzeHtmlSite(files, read) {
  const fileSet = new Set(files);
  const pages = files.filter((f) => /\.html?$/i.test(f) && !/(^|\/)(node_modules|\.git)\//.test(f));
  const order = [];
  const index = pages.find((p) => /^index\.html?$/i.test(p)) || pages.find((p) => /(^|\/)index\.html?$/i.test(p));
  if (index) {
    order.push(index);
    const doc = parse(read(index) || '');
    for (const a of find(doc, (n) => n.name === 'a')) {
      const href = a.attribs?.href;
      if (!isLocalRef(href)) continue;
      const target = posix.join(posix.dirname(index), stripQuery(href));
      if (pages.includes(target) && !order.includes(target)) order.push(target);
    }
  }
  for (const p of pages.sort()) if (!order.includes(p)) order.push(p);

  const result = { pages: [], stylesheets: new Set(), scripts: [], external: [], missing: [] };
  for (const page of order) {
    const text = read(page) || '';
    const doc = parse(text);
    const dir = posix.dirname(page);
    const titleNode = find(doc, (n) => n.name === 'title')[0];
    const h1 = find(doc, (n) => n.name === 'h1')[0];
    const title = htmlToText(titleNode ? outerHtml(text, titleNode) : '') || htmlToText(h1 ? outerHtml(text, h1) : '') || page;
    const refs = [];
    for (const n of find(doc, () => true)) {
      const a = n.attribs || {};
      for (const attr of ['src', 'href', 'poster', 'data']) {
        const v = a[attr];
        if (!v || (attr === 'href' && n.name === 'a' && !/\.(pdf|docx?|xlsx?|pptx?|zip|txt|csv|mp3|mp4)$/i.test(stripQuery(v)))) continue;
        refs.push({ tag: n.name, attr, value: v, rel: a.rel });
      }
    }
    let scriptCount = 0;
    for (const r of refs) {
      if (isExternal(r.value)) {
        result.external.push({ url: r.value, page, kind: r.tag });
        continue;
      }
      if (!isLocalRef(r.value)) continue;
      const target = posix.join(dir, stripQuery(decodeURI(r.value)));
      if (r.tag === 'link' && /stylesheet/i.test(r.rel || '')) result.stylesheets.add(target);
      if (r.tag === 'script') scriptCount += 1;
      if (!fileSet.has(target)) result.missing.push({ page, ref: r.value, resolved: target });
    }
    const inlineScripts = find(doc, (n) => n.name === 'script' && !n.attribs?.src && (n.children || []).some((c) => c.data?.trim()));
    if (scriptCount || inlineScripts.length) result.scripts.push({ page, external: scriptCount, inline: inlineScripts.length });
    result.pages.push({ path: page, title });
  }
  return { ...result, stylesheets: [...result.stylesheets] };
}

// ---------- Preserve mode: bindings to editable elements ----------

const BIND_TEXT = /^(h[1-6]|p|figcaption|blockquote|dt|dd|td|th|caption|label|button|summary)$/;

function blockFor(type, content, settings = {}) {
  const def = getBlockDef(type);
  return { id: newId('blk'), type, v: def.version, content: { ...def.defaults(), ...content }, settings: { ...(def.defaultSettings ? def.defaultSettings() : {}), ...settings }, overrides: {} };
}

/** Content a bound element maps to (used both when importing and when writing back). */
function mapBound(text, node, kind) {
  if (kind === 'heading') return { text: htmlToText(outerHtml(text, node)) };
  if (kind === 'text') {
    const [s, e] = innerRange(text, node);
    return { html: sanitizeRichText(`<p>${text.slice(s, e)}</p>`) };
  }
  if (kind === 'list') {
    return { items: elementChildren(node).filter((li) => li.name === 'li').map((li, i) => { const [s, e] = innerRange(text, li); return { id: `itm_li${i}`, html: sanitizeInline(text.slice(s, e)) }; }) };
  }
  if (kind === 'image') return { alt: node.attribs?.alt || '' };
  return {};
}

function bindPage(text, page, assetFor) {
  const doc = parse(text);
  const body = find(doc, (n) => n.name === 'body')[0] || doc;
  const blocks = [];
  const walk = (node) => {
    for (const c of elementChildren(node)) {
      if (SKIP.has(c.name)) continue;
      const path = nodePath(c);
      const src = (kind, editable, fixed = []) => ({ adapter: 'html', file: page, path, kind, editable, fixed });
      if (/^h[1-6]$/.test(c.name) && isInlineOnly(c)) {
        const b = blockFor('heading', { ...mapBound(text, c, 'heading'), level: Math.max(2, Number(c.name[1])) });
        b.source = src('heading', ['text']);
        blocks.push(b);
      } else if ((c.name === 'ul' || c.name === 'ol') && elementChildren(c).every((li) => li.name === 'li' && isInlineOnly(li))) {
        const b = blockFor('list', { style: c.name === 'ol' ? 'numbered' : 'bulleted', ...mapBound(text, c, 'list') });
        b.source = src('list', ['items'], ['items']);
        blocks.push(b);
      } else if (BIND_TEXT.test(c.name) && isInlineOnly(c) && htmlToText(outerHtml(text, c))) {
        const b = blockFor('text', mapBound(text, c, 'text'));
        b.source = src('text', ['html']);
        blocks.push(b);
      } else if (c.name === 'img') {
        const b = blockFor('image', { asset: assetFor(posix.join(posix.dirname(page), stripQuery(c.attribs?.src || ''))), ...mapBound(text, c, 'image') });
        b.source = src('image', ['alt']);
        blocks.push(b);
      } else walk(c);
    }
  };
  walk(body);
  return blocks;
}

function setAttribute(startTag, name, value) {
  const re = new RegExp(`(\\s${name}\\s*=\\s*)("[^"]*"|'[^']*'|[^\\s>]+)`, 'i');
  const v = `"${escapeAttr(value)}"`;
  if (re.test(startTag)) return startTag.replace(re, `$1${v}`);
  return startTag.replace(/\s*(\/?)>$/, ` ${name}=${v}$1>`);
}

const innerFromRich = (html) => {
  const s = sanitizeRichText(html);
  // A bound element is a single paragraph-like element: write its inline content.
  return s.replace(/^<p>/, '').replace(/<\/p>$/, '').replace(/<\/p><p>/g, '<br><br>');
};

/**
 * Apply edits to one page's HTML. Only changed elements are rewritten.
 * @returns {string} the new page text (the same string if nothing changed)
 */
export function applyHtmlEdits(text, blocks) {
  const doc = parse(text);
  const edits = [];
  for (const b of blocks) {
    const s = b.source;
    const node = nodeAt(doc, s.path);
    if (!node) continue;
    const current = mapBound(text, node, s.kind);
    if (s.kind === 'heading' && current.text !== b.content.text) {
      edits.push({ range: innerRange(text, node), value: escapeHtml(b.content.text) });
    } else if (s.kind === 'text' && current.html !== b.content.html) {
      edits.push({ range: innerRange(text, node), value: innerFromRich(b.content.html) });
    } else if (s.kind === 'list') {
      const lis = elementChildren(node).filter((li) => li.name === 'li');
      (b.content.items || []).forEach((item, i) => {
        if (lis[i] && current.items[i] && current.items[i].html !== item.html) edits.push({ range: innerRange(text, lis[i]), value: sanitizeInline(item.html) });
      });
    } else if (s.kind === 'image' && current.alt !== b.content.alt) {
      const tagEnd = text.indexOf('>', node.startIndex) + 1;
      edits.push({ range: [node.startIndex, tagEnd], value: setAttribute(text.slice(node.startIndex, tagEnd), 'alt', b.content.alt || '') });
    }
  }
  edits.sort((a, b) => b.range[0] - a.range[0]);
  let out = text;
  for (const e of edits) out = out.slice(0, e.range[0]) + e.value + out.slice(e.range[1]);
  return out;
}

// ---------- Convert mode ----------

function rewriteUrls(fragment, base) {
  return fragment.replace(/(\s(?:src|href|poster)\s*=\s*)(["'])([^"']*)\2/gi, (m, pre, q, url) => (isLocalRef(url) ? `${pre}${q}${posix.join(base, url)}${q}` : m));
}

function convertPage(text, page, { assetFor, sourceRoot, report }) {
  const doc = parse(text);
  const body = find(doc, (n) => n.name === 'main')[0] || find(doc, (n) => n.name === 'body')[0] || doc;
  const dir = posix.dirname(page);
  const base = posix.join(sourceRoot, dir);
  const blocks = [];
  let pendingDetails = [];
  const flushDetails = () => {
    if (!pendingDetails.length) return;
    blocks.push(blockFor('accordion', { items: pendingDetails }));
    report.push({ sourceType: 'details', mappedType: 'accordion', status: 'editable' });
    pendingDetails = [];
  };
  const add = (b, sourceType) => {
    flushDetails();
    blocks.push(b);
    report.push({ sourceType, mappedType: b.type, status: b.type === 'retained' ? 'retained-display' : 'editable' });
  };
  const retain = (node, reason) => {
    const b = blockFor('retained', { sourceType: `HTML <${node.name}>`, summary: htmlToText(outerHtml(text, node)).slice(0, 200), reason, html: rewriteUrls(outerHtml(text, node), base), assetDir: sourceRoot });
    b.origin = { adapter: 'html', file: page, path: nodePath(node) };
    add(b, `<${node.name}>`);
  };
  const img = (node) => assetFor(posix.join(dir, stripQuery(node.attribs?.src || '')));
  const walk = (node) => {
    for (const c of node.children || []) {
      if (c.type === 'text') {
        if (c.data.trim()) add(blockFor('text', { html: sanitizeRichText(c.data) }), 'text');
        continue;
      }
      if (!isTag(c) || SKIP.has(c.name)) continue;
      const n = c.name;
      if (/^h[1-6]$/.test(n)) add(blockFor('heading', { text: htmlToText(outerHtml(text, c)), level: Math.min(4, Math.max(2, Number(n[1]))) }), `<${n}>`);
      else if (n === 'p') {
        const h = outerHtml(text, c);
        if (/<(img|iframe|video|audio|object|canvas|svg|input|button|select|form)\b/i.test(h)) retain(c, 'Paragraph contains media or controls.');
        else if (htmlToText(h)) add(blockFor('text', { html: sanitizeRichText(h) }), '<p>');
      } else if ((n === 'ul' || n === 'ol') && elementChildren(c).every((li) => li.name === 'li' && isInlineOnly(li))) {
        add(blockFor('list', { style: n === 'ol' ? 'numbered' : 'bulleted', items: elementChildren(c).map((li) => ({ id: newId('itm'), html: sanitizeInline(outerHtml(text, li).replace(/^<li[^>]*>|<\/li>$/gi, '')) })) }), `<${n}>`);
      } else if (n === 'img') add(blockFor('image', { asset: img(c), alt: c.attribs?.alt || '', decorative: c.attribs?.alt === '' }), '<img>');
      else if (n === 'figure' && find(c, (x) => x.name === 'img').length === 1 && elementChildren(c).every((x) => x.name === 'img' || x.name === 'figcaption' || x.name === 'picture')) {
        const im = find(c, (x) => x.name === 'img')[0];
        const cap = find(c, (x) => x.name === 'figcaption')[0];
        add(blockFor('image', { asset: img(im), alt: im.attribs?.alt || '', caption: cap ? sanitizeInline(outerHtml(text, cap).replace(/^<figcaption[^>]*>|<\/figcaption>$/gi, '')) : '' }), '<figure>');
      } else if (n === 'blockquote') add(blockFor('quote', { variant: 'quote', html: sanitizeRichText(outerHtml(text, c).replace(/^<blockquote[^>]*>|<\/blockquote>$/gi, '')) }), '<blockquote>');
      else if (n === 'hr') add(blockFor('divider', { style: 'line' }), '<hr>');
      else if (n === 'details') {
        const summary = find(c, (x) => x.name === 'summary')[0];
        const inner = outerHtml(text, c).replace(/^<details[^>]*>/i, '').replace(/<\/details>$/i, '').replace(/<summary[\s\S]*?<\/summary>/i, '');
        pendingDetails.push({ id: newId('itm'), title: summary ? htmlToText(outerHtml(text, summary)) : 'Details', html: sanitizeRichText(inner) });
      } else if (n === 'iframe' && externalVideoEmbed(c.attribs?.src)) {
        add(blockFor('video', { source: 'url', url: c.attribs.src, title: c.attribs.title || '' }), '<iframe> (video)');
      } else if (CONTAINERS.has(n)) {
        // Layout containers with several block-level columns are kept as they are;
        // simple wrappers are unwrapped so their content becomes editable.
        const kids = elementChildren(c).filter((k) => !SKIP.has(k.name));
        const columns = kids.length >= 2 && kids.every((k) => CONTAINERS.has(k.name));
        if (columns) retain(c, 'Multi-column layout. Kept as-is so the layout is not flattened.');
        else walk(c);
      } else retain(c, `<${n}> has no Tessera equivalent.`);
    }
  };
  walk(body);
  flushDetails();
  return blocks;
}

/**
 * Build a project from a static site.
 * @param {{ files: string[], read: (rel) => string|null, analysis: object, mode: 'preserve'|'convert',
 *           sourceRoot: string, assetFor: (rel: string) => string|null }} opts
 */
export function buildHtmlProject({ read, analysis, mode, sourceRoot, assetFor }) {
  const manifest = createManifest({ title: analysis.pages[0]?.title || 'Imported web pages' });
  const lessons = {};
  const reportLessons = [];
  for (const page of analysis.pages) {
    const text = read(page.path) || '';
    const lesson = createLesson({ title: page.title });
    const rep = { title: page.title, sourceType: page.path, blocks: [] };
    if (mode === 'preserve') {
      lesson.source = { adapter: 'html', page: `${sourceRoot}/${page.path}` };
      lesson.blocks = bindPage(text, page.path, assetFor);
      for (const b of lesson.blocks) rep.blocks.push({ sourceType: b.source.kind, mappedType: b.type, status: 'editable', editableFields: b.source.editable });
    } else {
      lesson.blocks = convertPage(text, page.path, { assetFor, sourceRoot, report: rep.blocks });
      // An initial <h1> equal to the page title duplicates the lesson title.
      if (lesson.blocks[0]?.type === 'heading' && lesson.blocks[0].content.text === page.title) {
        lesson.blocks.shift();
        rep.blocks.shift();
      }
    }
    lessons[lesson.id] = lesson;
    manifest.lessons.push(lesson.id);
    reportLessons.push(rep);
  }
  if (mode === 'convert') {
    manifest.stylesheets = analysis.stylesheets.map((s) => `${sourceRoot}/${s}`);
  } else {
    manifest.navigation = { ...manifest.navigation, coverPage: false };
  }
  return {
    state: { manifest, lessons, theme: defaultTheme(), assets: {} },
    reportLessons,
    capabilities: {
      addLessons: false, duplicateLessons: false, deleteLessons: false, reorderLessons: false,
      addBlocks: false, duplicateBlocks: false, deleteBlocks: false, reorderBlocks: false,
      editTheme: false, editCourse: false,
    },
  };
}

/** Compute changed page files for a preserved HTML project. */
export function htmlWriteBack(state, read) {
  const byFile = new Map();
  for (const id of state.manifest.lessons) {
    for (const b of state.lessons[id]?.blocks || []) {
      if (b.source?.adapter !== 'html') continue;
      if (!byFile.has(b.source.file)) byFile.set(b.source.file, []);
      byFile.get(b.source.file).push(b);
    }
  }
  const changed = new Map();
  for (const [file, blocks] of byFile) {
    const text = read(file);
    if (text == null) continue;
    const next = applyHtmlEdits(text, blocks);
    if (next !== text) changed.set(file, next);
  }
  return changed;
}
