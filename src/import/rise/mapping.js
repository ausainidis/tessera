// Mapping between Rise block items and Tessera blocks, in both directions.
//
// Each mapper declares:
//   key        Rise "type/variant" it handles (for the report)
//   validated  true if the source structure was confirmed against real exports
//   match      (item) => boolean
//   toBlock    (item, ctx) => { type, content, settings? }
//   editable   Tessera fields that can be written back into the Rise item (preserve mode)
//   fixed      list fields whose length/order must not change in preserve mode
//   write      (item, content, changedFields) => new Rise item
//
// Write-back only touches fields the author actually changed, so untouched items keep
// their exact original markup.

import { sanitizeRichText, sanitizeInline, htmlToText } from '../../core/richtext.js';
import { escapeHtml } from '../../core/html.js';

const first = (it) => (Array.isArray(it.items) && it.items[0]) || {};
const clone = (v) => JSON.parse(JSON.stringify(v));
const withFirst = (it, patch) => {
  const out = clone(it);
  out.items = Array.isArray(out.items) && out.items.length ? out.items : [{}];
  out.items[0] = { ...out.items[0], ...patch };
  return out;
};
const textOf = (html) => htmlToText(html || '');

/** Write list-like content back to Rise sub-items, matched by id. Never adds or removes items. */
function writeItems(it, items, fieldMap) {
  const out = clone(it);
  const byId = new Map((out.items || []).map((x) => [x.id, x]));
  for (const ci of items || []) {
    const target = byId.get(ci.id);
    if (!target) continue;
    for (const [from, to] of Object.entries(fieldMap)) {
      if (typeof to === 'function') to(target, ci[from]);
      else target[to] = ci[from];
    }
  }
  return out;
}

// Rise feedbackType values verified in real exports: CHOICE (per answer),
// CORRECT_INCORRECT (two messages) and ANY (one message for any answer, stored in q.feedback).
function choiceContent(q) {
  const shared = q.feedbackType === 'ANY' ? sanitizeInline(q.feedback || '') : null;
  return {
    mode: /RESPONSE/i.test(q.type || '') ? 'multiple' : 'single',
    question: sanitizeRichText(q.title),
    choices: (q.answers || []).map((a) => ({ id: a.id, text: sanitizeInline(a.title), correct: !!a.correct, feedback: sanitizeInline(a.feedback || '') })),
    feedbackCorrect: shared ?? sanitizeInline(q.feedbackCorrect || ''),
    feedbackIncorrect: shared ?? sanitizeInline(q.feedbackIncorrect || ''),
  };
}

/** Apply edited question content to a Rise question object (knowledge check item or quiz item). */
function writeQuestion(q, c, changed) {
  const out = clone(q);
  if (changed.has('question')) out.title = c.question;
  if (out.feedbackType === 'ANY') {
    if (changed.has('feedbackCorrect')) out.feedback = c.feedbackCorrect;
    else if (changed.has('feedbackIncorrect')) out.feedback = c.feedbackIncorrect;
  } else {
    if (changed.has('feedbackCorrect')) out.feedbackCorrect = c.feedbackCorrect;
    if (changed.has('feedbackIncorrect')) out.feedbackIncorrect = c.feedbackIncorrect;
  }
  if (changed.has('choices')) {
    const byId = new Map(c.choices.map((x) => [x.id, x]));
    for (const a of out.answers || []) {
      const ch = byId.get(a.id);
      if (!ch) continue;
      if (sanitizeInline(a.title) !== ch.text) a.title = ch.text;
      if (sanitizeInline(a.feedback || '') !== ch.feedback) a.feedback = ch.feedback;
      a.correct = !!ch.correct;
    }
    const correct = (out.answers || []).filter((a) => a.correct).map((a) => a.id);
    if ('corrects' in out) out.corrects = correct;
    if ('correct' in out && typeof out.correct === 'string') out.correct = correct[0] || '';
  }
  return out;
}

const QUESTION_EDITABLE = ['question', 'choices', 'feedbackCorrect', 'feedbackIncorrect'];

export const MAPPERS = [
  {
    key: 'text/paragraph', validated: true,
    match: (it) => it.type === 'text' && it.variant === 'paragraph',
    toBlock: (it) => ({ type: 'text', content: { heading: '', headingLevel: 2, html: sanitizeRichText(first(it).paragraph) } }),
    editable: ['html'],
    write: (it, c) => withFirst(it, { paragraph: c.html }),
  },
  {
    key: 'text/heading paragraph', validated: true,
    match: (it) => it.type === 'text' && /^(heading|subheading) paragraph$/.test(it.variant),
    toBlock: (it) => ({ type: 'text', content: { heading: textOf(first(it).heading), headingLevel: it.variant.startsWith('sub') ? 3 : 2, html: sanitizeRichText(first(it).paragraph) } }),
    editable: ['heading', 'html'],
    write: (it, c, changed) => withFirst(it, {
      ...(changed.has('heading') ? { heading: escapeHtml(c.heading) } : {}),
      ...(changed.has('html') ? { paragraph: c.html } : {}),
    }),
  },
  {
    key: 'text/heading', validated: false,
    match: (it) => it.type === 'text' && /^(heading|subheading)$/.test(it.variant),
    toBlock: (it) => ({ type: 'heading', content: { text: textOf(first(it).heading), level: it.variant === 'subheading' ? 3 : 2 } }),
    editable: ['text'],
    write: (it, c) => withFirst(it, { heading: escapeHtml(c.text) }),
  },
  {
    key: 'impact (statement / note)', validated: true,
    match: (it) => it.type === 'text' && it.family === 'impact',
    toBlock: (it) => ({ type: 'quote', content: { variant: it.variant === 'note' ? 'note' : 'statement', html: sanitizeRichText(first(it).paragraph), attribution: '', role: '' } }),
    editable: ['html'],
    write: (it, c) => withFirst(it, { paragraph: c.html }),
  },
  {
    key: 'quote', validated: true,
    match: (it) => it.type === 'quote' && it.variant !== 'carousel',
    toBlock: (it) => ({ type: 'quote', content: { variant: 'quote', html: sanitizeRichText(first(it).paragraph), attribution: textOf(first(it).name), role: '' } }),
    editable: ['html', 'attribution'],
    write: (it, c, changed) => withFirst(it, {
      ...(changed.has('html') ? { paragraph: c.html } : {}),
      ...(changed.has('attribution') ? { name: escapeHtml(c.attribution) } : {}),
    }),
  },
  {
    key: 'list', validated: true,
    match: (it) => it.type === 'list',
    toBlock: (it) => ({ type: 'list', content: { style: it.variant === 'numbered' ? 'numbered' : it.variant === 'checkboxes' ? 'checklist' : 'bulleted', items: (it.items || []).map((x) => ({ id: x.id, html: sanitizeInline(x.paragraph) })) } }),
    editable: ['items'],
    fixed: ['items'],
    write: (it, c) => writeItems(it, c.items, { html: 'paragraph' }),
  },
  {
    key: 'knowledgeCheck (multiple choice / multiple response)', validated: true,
    match: (it) => it.type === 'knowledgeCheck' && /^MULTIPLE_(CHOICE|RESPONSE)$/.test(first(it).type || ''),
    toBlock: (it) => ({ type: 'knowledgeCheck', content: { ...choiceContent(first(it)), allowRetry: true } }),
    editable: QUESTION_EDITABLE,
    fixed: ['choices'],
    write: (it, c, changed) => {
      const out = clone(it);
      out.items[0] = writeQuestion(out.items[0], c, changed);
      return out;
    },
  },
  {
    key: 'interactive/accordion, tabs', validated: true, // accordion validated; tabs shares the structure (unvalidated)
    match: (it) => it.type === 'interactive' && (it.variant === 'accordion' || it.variant === 'tabs'),
    toBlock: (it) => ({ type: it.variant === 'tabs' ? 'tabs' : 'accordion', content: { items: (it.items || []).map((x) => ({ id: x.id, title: textOf(x.title), html: sanitizeRichText(x.description) })) } }),
    editable: ['items'],
    fixed: ['items'],
    write: (it, c) => writeItems(it, c.items, {
      title: (t, v) => { if (textOf(t.title) !== v) t.title = escapeHtml(v); },
      html: (t, v) => { if (sanitizeRichText(t.description) !== v) t.description = v; },
    }),
  },
  {
    key: 'interactive/flashcard', validated: true,
    // Verified: text sides are { type: 'description', description: '<html>' }. Image sides are not mapped yet.
    match: (it) => it.type === 'interactive' && it.variant === 'flashcard' && (it.items || []).every((x) => ['description', 'text'].includes(x.front?.type || 'description') && ['description', 'text'].includes(x.back?.type || 'description')),
    toBlock: (it) => ({ type: 'flashcards', content: { items: (it.items || []).map((x) => ({ id: x.id, front: sanitizeRichText(x.front?.description), back: sanitizeRichText(x.back?.description) })) } }),
    editable: ['items'],
    fixed: ['items'],
    write: (it, c) => writeItems(it, c.items, {
      front: (t, v) => { if (sanitizeRichText(t.front?.description) !== v) t.front = { ...t.front, description: v }; },
      back: (t, v) => { if (sanitizeRichText(t.back?.description) !== v) t.back = { ...t.back, description: v }; },
    }),
  },
  {
    key: 'interactive-fullscreen/process', validated: true,
    match: (it) => it.type === 'interactive' && it.variant === 'process',
    toBlock: (it) => ({ type: 'process', content: { intro: '', summary: '', items: (it.items || []).filter((x) => !x.isHidden).map((x) => ({ id: x.id, title: textOf(x.title), html: sanitizeRichText(x.description) })) } }),
    editable: ['items'],
    fixed: ['items'],
    write: (it, c) => writeItems(it, c.items, {
      title: (t, v) => { if (textOf(t.title) !== v) t.title = escapeHtml(v); },
      html: (t, v) => { if (sanitizeRichText(t.description) !== v) t.description = v; },
    }),
  },
  {
    key: 'divider/continue', validated: true,
    match: (it) => it.type === 'divider' && it.variant === 'continue',
    toBlock: (it) => ({ type: 'continue', content: { label: textOf(first(it).title) || 'Continue', requireComplete: !!first(it).completeHint, hint: textOf(first(it).completeHint) } }),
    editable: ['label', 'hint'],
    write: (it, c, changed) => withFirst(it, {
      ...(changed.has('label') ? { title: c.label } : {}),
      ...(changed.has('hint') ? { completeHint: c.hint } : {}),
    }),
  },
  {
    key: 'divider', validated: false,
    match: (it) => it.type === 'divider' && it.variant !== 'continue',
    toBlock: (it) => ({ type: 'divider', content: { style: it.variant === 'spacing' ? 'space' : 'line' } }),
    editable: [],
    write: (it) => it,
  },
  {
    key: 'image', validated: false,
    match: (it) => it.type === 'image' && !!first(it).media?.image,
    toBlock: (it, ctx) => {
      const f = first(it);
      const img = f.media.image;
      const asset = ctx.assetFor?.(img.key || img.src || img.originalUrl) || null;
      const alt = textOf(img.altText || img.alt || '');
      if (it.variant === 'text aside' || (f.paragraph && it.variant !== 'full' && it.variant !== 'hero')) {
        return { type: 'imageText', content: { asset, alt, decorative: !alt && false, heading: '', html: sanitizeRichText(f.paragraph || ''), imagePosition: 'left' } };
      }
      return { type: 'image', content: { asset, alt, decorative: false, caption: sanitizeInline(f.caption || '') }, settings: { size: it.variant === 'full' || it.variant === 'hero' ? 'full' : 'content' } };
    },
    editable: ['caption'],
    write: (it, c, changed) => withFirst(it, changed.has('caption') ? { caption: c.caption } : {}),
  },
];

export const QUIZ_QUESTION_MAPPER = {
  key: 'quiz question (MULTIPLE_CHOICE / MULTIPLE_RESPONSE)', validated: true,
  match: (q) => /^MULTIPLE_(CHOICE|RESPONSE)$/.test(q.type || ''),
  toBlock: (q) => ({ type: 'assessmentQuestion', content: { ...choiceContent(q), points: 1 } }),
  editable: QUESTION_EDITABLE,
  fixed: ['choices'],
  write: (q, c, changed) => writeQuestion(q, c, changed),
};

export function sourceTypeOf(item, lessonType) {
  if (lessonType === 'quiz') return `quiz/${item.type || '?'}`;
  return [item.type, item.family && item.family !== item.type ? item.family : null, item.variant].filter(Boolean).join('/');
}

/** Human-readable summary of an unsupported item, so retained content is recognisable. */
export function summarizeItem(item) {
  const parts = [];
  const walk = (v, depth) => {
    if (parts.join(' ').length > 220 || depth > 5) return;
    if (typeof v === 'string') {
      if (/^(https?:|[0-9a-f-]{20,}|[A-Za-z0-9_-]{20,}$)/.test(v)) return;
      const t = textOf(v);
      if (t && t.length > 2) parts.push(t);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) if (!/^(id|type|variant|family|key|settings|metadata|globalBlockId|media|avatar)$/.test(k)) walk(x, depth + 1);
    }
  };
  walk(item.items ?? item, 0);
  const s = parts.join(' · ');
  return s.length > 240 ? `${s.slice(0, 237)}…` : s;
}

export function findMapper(item, lessonType) {
  if (lessonType === 'quiz') return QUIZ_QUESTION_MAPPER.match(item) ? QUIZ_QUESTION_MAPPER : null;
  return MAPPERS.find((m) => m.match(item)) || null;
}
