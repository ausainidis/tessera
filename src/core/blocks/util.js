// Helpers shared by block definitions. See docs/BLOCK_INTERFACE.md.

import { newId } from '../ids.js';
import { escapeHtml, escapeAttr, attrs } from '../html.js';
import { sanitizeRichText, sanitizeInline, htmlToText } from '../richtext.js';

export { escapeHtml, escapeAttr, attrs, sanitizeRichText, sanitizeInline, htmlToText, newId };

/** Rich text for output: always re-sanitised, so hand-edited JSON cannot inject script. */
export const rich = (html) => sanitizeRichText(html);
export const inline = (html) => sanitizeInline(html);

export const itemId = () => newId('itm');
export const choiceId = () => newId('chc');

/** <img> for an asset id, or a visible placeholder when the asset is missing. */
export function imageTag(ctx, assetId, { alt = '', decorative = false, className = '', loading = 'lazy' } = {}) {
  const a = assetId ? ctx.asset(assetId) : null;
  if (!a) {
    return `<div class="tc-missing" role="img" aria-label="${escapeAttr(alt || 'Image missing')}">${assetId ? 'Missing image' : 'No image selected'}</div>`;
  }
  return `<img${attrs({ src: a.url, alt: decorative ? '' : alt, class: className || null, loading, width: a.entry?.width || null, height: a.entry?.height || null })}>`;
}

export function assetUrl(ctx, assetId) {
  const a = assetId ? ctx.asset(assetId) : null;
  return a ? a.url : null;
}

/** Recognise YouTube / Vimeo URLs and return a privacy-friendly embed URL. */
export function externalVideoEmbed(url) {
  const u = String(url || '').trim();
  let m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
  if (m) return { provider: 'YouTube', embed: `https://www.youtube-nocookie.com/embed/${m[1]}` };
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (m) return { provider: 'Vimeo', embed: `https://player.vimeo.com/video/${m[1]}?dnt=1` };
  return null;
}

export const isExternalUrl = (u) => /^https?:\/\//i.test(String(u || '').trim());

export function issue(level, code, message, field) {
  return { level, code, message, field };
}

/** Shared choice-question fields for knowledge checks and assessment questions. */
export const CHOICE_FIELDS = [
  { key: 'mode', label: 'Question type', type: 'select', options: [['single', 'Multiple choice (one answer)'], ['multiple', 'Multiple response (several answers)']] },
  { key: 'question', label: 'Question', type: 'richtext', required: true },
  {
    key: 'choices', label: 'Answers', type: 'choices', min: 2, max: 10,
    itemFields: [
      { key: 'text', label: 'Answer', type: 'inline' },
      { key: 'correct', label: 'Correct', type: 'boolean' },
      { key: 'feedback', label: 'Feedback for this answer', type: 'inline' },
    ],
  },
  { key: 'feedbackCorrect', label: 'Feedback when correct', type: 'inline' },
  { key: 'feedbackIncorrect', label: 'Feedback when incorrect', type: 'inline' },
];

export function defaultChoices() {
  return [
    { id: choiceId(), text: 'Answer A', correct: true, feedback: '' },
    { id: choiceId(), text: 'Answer B', correct: false, feedback: '' },
    { id: choiceId(), text: 'Answer C', correct: false, feedback: '' },
  ];
}

export function validateChoices(c) {
  const issues = [];
  const choices = Array.isArray(c.choices) ? c.choices : [];
  const correct = choices.filter((x) => x.correct).length;
  if (!htmlToText(c.question)) issues.push(issue('error', 'question-empty', 'The question has no text.', 'question'));
  if (choices.length < 2) issues.push(issue('warning', 'choices-few', 'Only one answer: fine for an acknowledgement, otherwise add more answers.', 'choices'));
  if (choices.some((x) => !htmlToText(x.text))) issues.push(issue('warning', 'choice-empty', 'One or more answers have no text.', 'choices'));
  if (c.mode === 'single' && correct !== 1) issues.push(issue('error', 'correct-count', 'A multiple-choice question needs exactly one correct answer.', 'choices'));
  if (c.mode === 'multiple' && correct < 1) issues.push(issue('error', 'correct-count', 'Mark at least one correct answer.', 'choices'));
  return issues;
}

/** Markup for a choice question. Correctness is never in the markup; the runtime reads it from course data. */
export function renderChoices(block, { name, legendId }) {
  const c = block.content;
  const type = c.mode === 'multiple' ? 'checkbox' : 'radio';
  const options = (c.choices || []).map((ch) => `
      <label class="tc-choice"><input type="${type}" name="${escapeAttr(name)}" value="${escapeAttr(ch.id)}"><span>${inline(ch.text)}</span></label>`).join('');
  return `<fieldset class="tc-choices" aria-describedby="${escapeAttr(legendId)}">
      <legend class="tc-visually-hidden">${c.mode === 'multiple' ? 'Select all that apply' : 'Select one answer'}</legend>${options}
    </fieldset>`;
}
