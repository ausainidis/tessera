// Interactive blocks: button, accordion, tabs, process, flashcards, continue.
// All of them render meaningful, readable HTML without JavaScript; the runtime
// (src/renderer/runtime) progressively enhances them.

import { escapeHtml, escapeAttr, rich, inline, itemId, issue, htmlToText, assetUrl } from './util.js';

const titled = (label) => ({
  key: 'items', label, type: 'list', itemLabel: label.replace(/s$/, ''),
  itemFields: [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'html', label: 'Content', type: 'richtext' },
  ],
});
const titledText = (b) => (b.content.items || []).map((i) => `${i.title || ''} ${htmlToText(i.html)}`).join(' ').trim();
const emptyTitles = (b) => ((b.content.items || []).some((i) => !String(i.title || '').trim()) ? [issue('warning', 'title-empty', 'An item has no title.', 'items')] : []);

export const button = {
  type: 'button',
  version: 1,
  title: 'Button',
  category: 'Interactive',
  icon: '⬚',
  description: 'A button that links to a web page, another lesson or a file.',
  fields: [
    { key: 'label', label: 'Button text', type: 'text', required: true },
    { key: 'action', label: 'Action', type: 'select', options: [['url', 'Open a web address'], ['lesson', 'Go to a lesson'], ['asset', 'Download a file']] },
    { key: 'url', label: 'Web address', type: 'url', showIf: { key: 'action', equals: 'url' } },
    { key: 'lessonId', label: 'Lesson', type: 'lesson', showIf: { key: 'action', equals: 'lesson' } },
    { key: 'asset', label: 'File', type: 'asset', accept: 'file', showIf: { key: 'action', equals: 'asset' } },
    { key: 'intro', label: 'Text above the button (optional)', type: 'inline' },
  ],
  settings: [{ key: 'align', label: 'Alignment', type: 'select', options: [['left', 'Left'], ['center', 'Centre']] }],
  defaults: () => ({ label: 'Continue', action: 'url', url: '', lessonId: '', asset: null, intro: '' }),
  defaultSettings: () => ({ align: 'left' }),
  external: (b) => (b.content.action === 'url' && /^https?:/i.test(b.content.url || '') ? [b.content.url] : []),
  render(b, ctx) {
    const c = b.content;
    let href = '#';
    let extra = '';
    if (c.action === 'url' && c.url) { href = c.url; extra = ' target="_blank" rel="noopener noreferrer"'; }
    if (c.action === 'lesson' && c.lessonId) href = `#lesson-${c.lessonId}`;
    if (c.action === 'asset') { href = assetUrl(ctx, c.asset) || '#'; extra = ' download'; }
    const intro = c.intro ? `<p class="tc-button-intro">${inline(c.intro)}</p>` : '';
    return `<div class="tc-button-row tc-align-${escapeAttr(b.settings?.align || 'left')}">${intro}<a class="tc-button" href="${escapeAttr(href)}"${extra}>${escapeHtml(c.label || 'Button')}</a></div>`;
  },
  validate(b, ctx) {
    const c = b.content;
    const out = [];
    if (!c.label?.trim()) out.push(issue('error', 'label', 'Button has no text.', 'label'));
    if (c.action === 'url' && !c.url) out.push(issue('warning', 'url', 'Button has no web address.', 'url'));
    if (c.action === 'lesson' && (!c.lessonId || (ctx?.state && !ctx.state.lessons[c.lessonId]))) out.push(issue('warning', 'lesson', 'Button does not point to an existing lesson.', 'lessonId'));
    if (c.action === 'asset' && !c.asset) out.push(issue('warning', 'asset', 'No file selected.', 'asset'));
    return out;
  },
  text: (b) => b.content.label || '',
};

export const accordion = {
  type: 'accordion',
  version: 1,
  title: 'Accordion',
  category: 'Interactive',
  icon: '☰',
  description: 'Expandable sections. Uses native, keyboard-accessible disclosure widgets.',
  fields: [titled('Sections')],
  defaults: () => ({ items: [{ id: itemId(), title: 'Section 1', html: '<p>Content</p>' }, { id: itemId(), title: 'Section 2', html: '<p>Content</p>' }] }),
  newItem: () => ({ id: itemId(), title: '', html: '' }),
  render: (b) => `<div class="tc-accordion">${(b.content.items || []).map((i) => `
      <details class="tc-accordion__item"><summary class="tc-accordion__title">${escapeHtml(i.title)}</summary><div class="tc-accordion__body tc-prose">${rich(i.html)}</div></details>`).join('')}
    </div>`,
  validate: emptyTitles,
  text: titledText,
};

export const tabs = {
  type: 'tabs',
  version: 1,
  title: 'Tabs',
  category: 'Interactive',
  icon: '⊟',
  description: 'Content split into tabs. Without JavaScript all panels are shown in order.',
  fields: [titled('Tabs')],
  defaults: () => ({ items: [{ id: itemId(), title: 'Tab 1', html: '<p>Content</p>' }, { id: itemId(), title: 'Tab 2', html: '<p>Content</p>' }] }),
  newItem: () => ({ id: itemId(), title: '', html: '' }),
  render: (b) => `<div class="tc-tabs" data-tc="tabs">${(b.content.items || []).map((i) => `
      <section class="tc-tabs__panel" id="p-${escapeAttr(i.id)}" data-title="${escapeAttr(i.title)}"><h3 class="tc-tabs__title">${escapeHtml(i.title)}</h3><div class="tc-prose">${rich(i.html)}</div></section>`).join('')}
    </div>`,
  validate: emptyTitles,
  text: titledText,
};

export const process = {
  type: 'process',
  version: 1,
  title: 'Process steps',
  category: 'Interactive',
  icon: '⇢',
  description: 'A sequence of steps presented one at a time.',
  fields: [
    { key: 'intro', label: 'Introduction (optional)', type: 'richtext' },
    titled('Steps'),
    { key: 'summary', label: 'Summary (optional)', type: 'richtext' },
  ],
  defaults: () => ({ intro: '', items: [{ id: itemId(), title: 'Step 1', html: '<p>Describe the step.</p>' }, { id: itemId(), title: 'Step 2', html: '<p>Describe the step.</p>' }], summary: '' }),
  newItem: () => ({ id: itemId(), title: '', html: '' }),
  render(b) {
    const c = b.content;
    const intro = htmlToText(c.intro) ? `<div class="tc-process__intro tc-prose">${rich(c.intro)}</div>` : '';
    const summary = htmlToText(c.summary) ? `<div class="tc-process__summary tc-prose">${rich(c.summary)}</div>` : '';
    const steps = (c.items || []).map((i, n) => `
      <li class="tc-process__step"><h3 class="tc-process__title"><span class="tc-process__num">${n + 1}</span> ${escapeHtml(i.title)}</h3><div class="tc-prose">${rich(i.html)}</div></li>`).join('');
    return `<div class="tc-process" data-tc="process">${intro}<ol class="tc-process__steps">${steps}</ol>${summary}</div>`;
  },
  validate: emptyTitles,
  text: (b) => `${htmlToText(b.content.intro)} ${titledText(b)} ${htmlToText(b.content.summary)}`.trim(),
};

export const flashcards = {
  type: 'flashcards',
  version: 1,
  title: 'Flashcards',
  category: 'Interactive',
  icon: '⧉',
  description: 'Cards that turn over to reveal the back.',
  fields: [{
    key: 'items', label: 'Cards', type: 'list', itemLabel: 'Card',
    itemFields: [{ key: 'front', label: 'Front', type: 'richtext' }, { key: 'back', label: 'Back', type: 'richtext' }],
  }],
  defaults: () => ({ items: [{ id: itemId(), front: '<p>Term</p>', back: '<p>Definition</p>' }] }),
  newItem: () => ({ id: itemId(), front: '', back: '' }),
  render: (b) => `<ul class="tc-flashcards" data-tc="flashcards">${(b.content.items || []).map((i) => `
      <li class="tc-flashcard"><div class="tc-flashcard__front tc-prose">${rich(i.front)}</div><div class="tc-flashcard__back tc-prose">${rich(i.back)}</div></li>`).join('')}
    </ul>`,
  text: (b) => (b.content.items || []).map((i) => `${htmlToText(i.front)} ${htmlToText(i.back)}`).join(' '),
};

export const continueGate = {
  type: 'continue',
  version: 1,
  title: 'Continue',
  category: 'Layout',
  icon: '↧',
  description: 'Hides the rest of the lesson until the learner continues. Optionally requires the interactions above to be completed.',
  fields: [
    { key: 'label', label: 'Button text', type: 'text' },
    { key: 'requireComplete', label: 'Require interactions above to be completed', type: 'boolean' },
    { key: 'hint', label: 'Hint shown while locked', type: 'text', showIf: { key: 'requireComplete', truthy: true } },
  ],
  defaults: () => ({ label: 'Continue', requireComplete: false, hint: 'Complete the activities above to continue.' }),
  render: (b) => `<div class="tc-continue" data-tc="continue" data-require="${b.content.requireComplete ? '1' : '0'}">
      <button type="button" class="tc-button">${escapeHtml(b.content.label || 'Continue')}</button>
      <p class="tc-continue__hint" hidden>${escapeHtml(b.content.hint || '')}</p></div>`,
  runtimeData: (b) => ({ requireComplete: !!b.content.requireComplete }),
  text: (b) => b.content.label || '',
};
