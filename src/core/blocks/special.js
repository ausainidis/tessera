// Special blocks:
//  - embed:    a custom web component or imported web page/bundle, rendered in a sandboxed iframe.
//  - retained: imported content the editor does not understand. Kept verbatim, never edited,
//              never silently dropped. See docs/IMPORTS.md.

import { escapeHtml, escapeAttr, attrs, issue } from './util.js';
import { isSafeRelPath, toPosixRel } from '../format.js';

export const EMBED_KINDS = [['component', 'Custom web component'], ['page', 'Imported web page'], ['bundle', 'Compiled web bundle']];

export const embed = {
  type: 'embed',
  version: 1,
  title: 'Web component',
  category: 'Advanced',
  icon: '</>',
  description: 'Interactive HTML, CSS and JavaScript from this project, shown in an isolated frame.',
  fields: [
    { key: 'entry', label: 'Entry point (project-relative HTML file)', type: 'path', help: 'For example components/my-widget/index.html' },
    { key: 'title', label: 'Title (for screen readers)', type: 'text', required: true },
    { key: 'kind', label: 'Kind', type: 'select', options: EMBED_KINDS },
    { key: 'sizing', label: 'Sizing', type: 'select', options: [['fixed', 'Fixed height'], ['aspect', 'Aspect ratio'], ['auto', 'Automatic (component reports its height)']] },
    { key: 'height', label: 'Height (px)', type: 'number', min: 80, max: 4000, showIf: { key: 'sizing', equals: 'fixed' } },
    { key: 'aspectRatio', label: 'Aspect ratio', type: 'select', options: [['16/9', '16:9'], ['4/3', '4:3'], ['1/1', '1:1'], ['9/16', '9:16']], showIf: { key: 'sizing', equals: 'aspect' } },
    { key: 'config', label: 'Configuration (JSON passed to the component)', type: 'json' },
    { key: 'completion', label: 'Completion', type: 'select', options: [['none', 'Not tracked'], ['event', 'Complete when the component sends a completion event']] },
    { key: 'allowSameOrigin', label: 'Allow storage access (less isolated)', type: 'boolean', help: 'Only enable for trusted code that needs localStorage or cookies. The component can then read the course page.' },
  ],
  defaults: () => ({ entry: '', title: 'Interactive component', kind: 'component', sizing: 'fixed', height: 480, aspectRatio: '16/9', config: '{}', completion: 'none', allowSameOrigin: false }),
  render(b) {
    const c = b.content;
    if (!c.entry || !isSafeRelPath(c.entry)) return '<div class="tc-missing">No component entry point</div>';
    let cfg = '';
    try { cfg = JSON.stringify(JSON.parse(c.config || '{}')); } catch { cfg = '{}'; }
    const style = c.sizing === 'fixed' ? `height:${Math.max(80, Number(c.height) || 480)}px` : c.sizing === 'aspect' ? `aspect-ratio:${escapeAttr(c.aspectRatio || '16/9')}` : 'height:320px';
    const sandbox = `allow-scripts allow-forms allow-popups allow-modals${c.allowSameOrigin ? ' allow-same-origin' : ''}`;
    return `<div class="tc-embed" data-tc="embed" data-block="${escapeAttr(b.id)}" data-sizing="${escapeAttr(c.sizing)}" data-completion="${escapeAttr(c.completion)}">
      <iframe${attrs({ src: toPosixRel(c.entry), title: c.title || 'Interactive component', sandbox, style, loading: 'lazy', 'data-config': cfg })}></iframe></div>`;
  },
  runtimeData: (b) => ({ completion: b.content.completion === 'event' }),
  validate(b) {
    const c = b.content;
    const out = [];
    if (!c.entry) out.push(issue('error', 'entry', 'Choose the component’s entry HTML file.', 'entry'));
    else if (!isSafeRelPath(c.entry)) out.push(issue('error', 'entry-path', 'Entry point must be inside the project folder.', 'entry'));
    try { JSON.parse(c.config || '{}'); } catch { out.push(issue('error', 'config', 'Configuration is not valid JSON.', 'config')); }
    return out;
  },
  a11y: (b) => (b.content.title?.trim() ? [] : [issue('warning', 'frame-title', 'Component has no title for screen readers.', 'title')]),
  files: (b) => (b.content.entry ? [b.content.entry] : []),
  text: (b) => b.content.title || '',
};

export const retained = {
  type: 'retained',
  version: 1,
  title: 'Retained content',
  category: 'Advanced',
  icon: '⚑',
  insertable: false,
  description: 'Imported content that cannot be edited here. It is preserved unchanged.',
  fields: [
    { key: 'sourceType', label: 'Original type', type: 'readonly' },
    { key: 'summary', label: 'Summary', type: 'readonly' },
    { key: 'reason', label: 'Why it is not editable', type: 'readonly' },
  ],
  defaults: () => ({ sourceType: '', summary: '', reason: '', html: '', raw: null }),
  render(b) {
    const c = b.content;
    // Retained HTML fragments come from the author's own imported pages and are output as-is,
    // exactly as they appeared in the original (this is the point of retaining them).
    if (c.html) return `<div class="tc-retained-html">${c.html}</div>`;
    return `<div class="tc-retained" role="note">
      <p class="tc-retained__label">${escapeHtml(c.sourceType || 'Imported content')}</p>
      ${c.summary ? `<p class="tc-retained__summary">${escapeHtml(c.summary)}</p>` : ''}
    </div>`;
  },
  validate: (b) => [issue('info', 'retained', `Retained ${b.content.sourceType || 'content'} is preserved but cannot be edited here${b.content.html ? '' : ' and is shown as a placeholder in Tessera output'}.`, null)],
  text: (b) => b.content.summary || '',
};
