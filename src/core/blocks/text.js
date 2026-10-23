// Text blocks: heading, text, list, quote, divider.

import { escapeHtml, rich, inline, itemId, issue, htmlToText } from './util.js';

const LEVELS = [['2', 'Heading 2'], ['3', 'Heading 3'], ['4', 'Heading 4']];
const clampLevel = (l) => Math.min(6, Math.max(2, Number(l) || 2));

export const heading = {
  type: 'heading',
  version: 1,
  title: 'Heading',
  category: 'Text',
  icon: 'H',
  description: 'A section heading. Choose the level that matches the document structure.',
  fields: [
    { key: 'text', label: 'Heading text', type: 'text', required: true },
    { key: 'level', label: 'Level', type: 'select', options: LEVELS, help: 'The lesson title is level 1. Do not skip levels.' },
  ],
  defaults: () => ({ text: 'Heading', level: 2 }),
  headings: (b) => [{ level: clampLevel(b.content.level), text: b.content.text }],
  render(b) {
    const l = clampLevel(b.content.level);
    return `<h${l} class="tc-heading">${escapeHtml(b.content.text)}</h${l}>`;
  },
  validate: (b) => (b.content.text?.trim() ? [] : [issue('error', 'empty', 'Heading is empty.', 'text')]),
  text: (b) => b.content.text || '',
};

export const text = {
  type: 'text',
  version: 1,
  title: 'Text',
  category: 'Text',
  icon: '¶',
  description: 'Paragraphs with bold, italic, links and lists. Optional heading.',
  fields: [
    { key: 'heading', label: 'Heading (optional)', type: 'text' },
    { key: 'headingLevel', label: 'Heading level', type: 'select', options: LEVELS, showIf: { key: 'heading', truthy: true } },
    { key: 'html', label: 'Text', type: 'richtext' },
  ],
  defaults: () => ({ heading: '', headingLevel: 2, html: '<p>Text</p>' }),
  headings: (b) => (b.content.heading ? [{ level: clampLevel(b.content.headingLevel), text: b.content.heading }] : []),
  render(b) {
    const c = b.content;
    const l = clampLevel(c.headingLevel);
    const h = c.heading ? `<h${l} class="tc-heading">${escapeHtml(c.heading)}</h${l}>` : '';
    return `${h}<div class="tc-prose">${rich(c.html)}</div>`;
  },
  validate: (b) => (htmlToText(b.content.html) || b.content.heading ? [] : [issue('warning', 'empty', 'Text block is empty.', 'html')]),
  text: (b) => `${b.content.heading || ''} ${htmlToText(b.content.html)}`.trim(),
};

export const list = {
  type: 'list',
  version: 1,
  title: 'List',
  category: 'Text',
  icon: '•',
  description: 'Bulleted, numbered or checklist items.',
  fields: [
    { key: 'style', label: 'List style', type: 'select', options: [['bulleted', 'Bulleted'], ['numbered', 'Numbered'], ['checklist', 'Checklist']] },
    { key: 'items', label: 'Items', type: 'list', itemLabel: 'Item', itemFields: [{ key: 'html', label: 'Item text', type: 'inline' }] },
  ],
  defaults: () => ({ style: 'bulleted', items: [{ id: itemId(), html: 'First item' }, { id: itemId(), html: 'Second item' }] }),
  newItem: () => ({ id: itemId(), html: '' }),
  render(b) {
    const c = b.content;
    const tag = c.style === 'numbered' ? 'ol' : 'ul';
    const items = (c.items || []).map((i) => `<li>${inline(i.html)}</li>`).join('');
    return `<${tag} class="tc-list tc-list--${escapeHtml(c.style || 'bulleted')}">${items}</${tag}>`;
  },
  validate: (b) => ((b.content.items || []).length ? [] : [issue('warning', 'empty', 'List has no items.', 'items')]),
  text: (b) => (b.content.items || []).map((i) => htmlToText(i.html)).join(' '),
};

export const quote = {
  type: 'quote',
  version: 1,
  title: 'Quotation',
  category: 'Text',
  icon: '“',
  description: 'A quotation, highlighted statement or note.',
  fields: [
    { key: 'variant', label: 'Style', type: 'select', options: [['quote', 'Quotation'], ['statement', 'Statement'], ['note', 'Note']] },
    { key: 'html', label: 'Text', type: 'richtext' },
    { key: 'attribution', label: 'Attribution', type: 'text', showIf: { key: 'variant', equals: 'quote' } },
    { key: 'role', label: 'Role or source', type: 'text', showIf: { key: 'variant', equals: 'quote' } },
  ],
  defaults: () => ({ variant: 'quote', html: '<p>Quotation text.</p>', attribution: '', role: '' }),
  render(b) {
    const c = b.content;
    if (c.variant === 'statement') return `<div class="tc-statement tc-prose">${rich(c.html)}</div>`;
    if (c.variant === 'note') return `<aside class="tc-note tc-prose">${rich(c.html)}</aside>`;
    const cite = c.attribution
      ? `<figcaption class="tc-quote__by">${escapeHtml(c.attribution)}${c.role ? `<span class="tc-quote__role">, ${escapeHtml(c.role)}</span>` : ''}</figcaption>`
      : '';
    return `<figure class="tc-quote"><blockquote class="tc-prose">${rich(c.html)}</blockquote>${cite}</figure>`;
  },
  text: (b) => `${htmlToText(b.content.html)} ${b.content.attribution || ''}`.trim(),
};

export const divider = {
  type: 'divider',
  version: 1,
  title: 'Divider',
  category: 'Layout',
  icon: '—',
  description: 'A visual break between sections.',
  fields: [{ key: 'style', label: 'Style', type: 'select', options: [['line', 'Line'], ['dots', 'Dots'], ['space', 'Space only']] }],
  defaults: () => ({ style: 'line' }),
  render: (b) => `<hr class="tc-divider tc-divider--${escapeHtml(b.content.style || 'line')}">`,
  text: () => '',
};
