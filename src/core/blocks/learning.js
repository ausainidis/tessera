// Learning blocks: case study, reflection prompt, knowledge check (ungraded)
// and assessment question (scored; only allowed inside assessment lessons).

import {
  escapeHtml, escapeAttr, rich, inline, issue, htmlToText, imageTag,
  CHOICE_FIELDS, defaultChoices, validateChoices, renderChoices,
} from './util.js';

export const caseStudy = {
  type: 'caseStudy',
  version: 1,
  title: 'Case study',
  category: 'Learning',
  icon: '❖',
  description: 'A scenario with a challenge and a revealable outcome.',
  fields: [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'asset', label: 'Image (optional)', type: 'asset', accept: 'image' },
    { key: 'alt', label: 'Alternative text', type: 'text', showIf: { key: 'asset', truthy: true } },
    { key: 'scenario', label: 'Scenario', type: 'richtext' },
    { key: 'challenge', label: 'Challenge or questions', type: 'richtext' },
    { key: 'outcomeLabel', label: 'Reveal button text', type: 'text' },
    { key: 'outcome', label: 'Outcome or discussion', type: 'richtext' },
  ],
  defaults: () => ({ title: 'Case study', asset: null, alt: '', scenario: '<p>Describe the situation.</p>', challenge: '<p>What would you do?</p>', outcomeLabel: 'See what happened', outcome: '<p>Describe the outcome.</p>' }),
  headings: (b) => (b.content.title ? [{ level: 2, text: b.content.title }] : []),
  render(b, ctx) {
    const c = b.content;
    const img = c.asset ? `<div class="tc-case__media">${imageTag(ctx, c.asset, { alt: c.alt })}</div>` : '';
    return `<div class="tc-case">
      ${c.title ? `<h2 class="tc-heading tc-case__title">${escapeHtml(c.title)}</h2>` : ''}${img}
      <div class="tc-case__scenario tc-prose">${rich(c.scenario)}</div>
      ${htmlToText(c.challenge) ? `<div class="tc-case__challenge tc-prose">${rich(c.challenge)}</div>` : ''}
      ${htmlToText(c.outcome) ? `<details class="tc-case__outcome"><summary class="tc-button tc-button--secondary">${escapeHtml(c.outcomeLabel || 'Reveal')}</summary><div class="tc-prose">${rich(c.outcome)}</div></details>` : ''}
    </div>`;
  },
  a11y: (b) => (b.content.asset && !String(b.content.alt || '').trim() ? [issue('warning', 'alt-missing', 'Case study image has no alternative text.', 'alt')] : []),
  text: (b) => [b.content.title, htmlToText(b.content.scenario), htmlToText(b.content.challenge), htmlToText(b.content.outcome)].join(' ').trim(),
};

export const reflection = {
  type: 'reflection',
  version: 1,
  title: 'Reflection prompt',
  category: 'Learning',
  icon: '✎',
  description: 'An open question. Answers stay in the learner’s browser and are never scored or sent anywhere.',
  fields: [
    { key: 'prompt', label: 'Prompt', type: 'richtext', required: true },
    { key: 'placeholder', label: 'Placeholder text', type: 'text' },
    { key: 'sampleAnswer', label: 'Sample answer (optional)', type: 'richtext' },
  ],
  defaults: () => ({ prompt: '<p>How could you apply this in your work?</p>', placeholder: 'Type your thoughts…', sampleAnswer: '' }),
  render(b) {
    const c = b.content;
    const id = `r-${b.id}`;
    return `<div class="tc-reflection" data-tc="reflection" data-block="${escapeAttr(b.id)}">
      <label class="tc-reflection__prompt tc-prose" for="${escapeAttr(id)}">${rich(c.prompt)}</label>
      <textarea id="${escapeAttr(id)}" class="tc-input" rows="5" placeholder="${escapeAttr(c.placeholder || '')}"></textarea>
      <p class="tc-reflection__note">Your answer is saved only in this browser.</p>
      ${htmlToText(c.sampleAnswer) ? `<details class="tc-reflection__sample"><summary>Compare with a sample answer</summary><div class="tc-prose">${rich(c.sampleAnswer)}</div></details>` : ''}
    </div>`;
  },
  validate: (b) => (htmlToText(b.content.prompt) ? [] : [issue('error', 'prompt', 'Reflection has no prompt.', 'prompt')]),
  text: (b) => htmlToText(b.content.prompt),
};

/** Data the runtime needs to evaluate a choice question. Not part of the visible markup. */
function choiceData(b) {
  const c = b.content;
  return {
    mode: c.mode === 'multiple' ? 'multiple' : 'single',
    correct: (c.choices || []).filter((x) => x.correct).map((x) => x.id),
    choiceFeedback: Object.fromEntries((c.choices || []).filter((x) => x.feedback).map((x) => [x.id, inline(x.feedback)])),
    feedbackCorrect: inline(c.feedbackCorrect || 'Correct.'),
    feedbackIncorrect: inline(c.feedbackIncorrect || 'Not quite.'),
  };
}

export const knowledgeCheck = {
  type: 'knowledgeCheck',
  version: 1,
  title: 'Knowledge check',
  category: 'Learning',
  icon: '?',
  description: 'An ungraded practice question with feedback. Never counts toward a score.',
  fields: [...CHOICE_FIELDS, { key: 'allowRetry', label: 'Allow learners to try again', type: 'boolean' }],
  defaults: () => ({ mode: 'single', question: '<p>Question?</p>', choices: defaultChoices(), feedbackCorrect: 'Correct.', feedbackIncorrect: 'Not quite. Review the content above and try again.', allowRetry: true }),
  render(b) {
    const qid = `q-${b.id}`;
    return `<div class="tc-check" data-tc="check" data-block="${escapeAttr(b.id)}">
      <p class="tc-check__label">Knowledge check</p>
      <div class="tc-check__question tc-prose" id="${escapeAttr(qid)}">${rich(b.content.question)}</div>
      ${renderChoices(b, { name: `c-${b.id}`, legendId: qid })}
      <div class="tc-check__actions"><button type="button" class="tc-button" data-action="submit">Submit</button><button type="button" class="tc-button tc-button--secondary" data-action="retry" hidden>Try again</button></div>
      <div class="tc-feedback" role="status" aria-live="polite"></div>
    </div>`;
  },
  runtimeData: (b) => ({ ...choiceData(b), allowRetry: b.content.allowRetry !== false }),
  validate: (b) => validateChoices(b.content),
  text: (b) => `${htmlToText(b.content.question)} ${(b.content.choices || []).map((x) => htmlToText(x.text)).join(' ')}`,
};

export const assessmentQuestion = {
  type: 'assessmentQuestion',
  version: 1,
  title: 'Assessment question',
  category: 'Assessment',
  icon: '✓',
  scope: 'assessment',
  description: 'A scored question. Only available in assessment lessons.',
  fields: [...CHOICE_FIELDS, { key: 'points', label: 'Points', type: 'number', min: 1, max: 100 }],
  defaults: () => ({ mode: 'single', question: '<p>Question?</p>', choices: defaultChoices(), feedbackCorrect: 'Correct.', feedbackIncorrect: 'Incorrect.', points: 1 }),
  render(b, ctx) {
    const qid = `q-${b.id}`;
    const n = ctx?.questionNumber ? `<p class="tc-question__number">Question ${ctx.questionNumber}${ctx.questionCount ? ` of ${ctx.questionCount}` : ''}</p>` : '';
    return `<div class="tc-question" data-tc="question" data-block="${escapeAttr(b.id)}">
      ${n}<div class="tc-question__text tc-prose" id="${escapeAttr(qid)}">${rich(b.content.question)}</div>
      ${renderChoices(b, { name: `c-${b.id}`, legendId: qid })}
      <div class="tc-feedback" role="status" aria-live="polite"></div>
    </div>`;
  },
  runtimeData: (b) => ({ ...choiceData(b), points: Math.max(1, Number(b.content.points) || 1) }),
  validate(b, ctx) {
    const out = validateChoices(b.content);
    if (ctx?.lesson && ctx.lesson.kind !== 'assessment') out.push(issue('error', 'scope', 'Assessment questions only count inside an assessment lesson.', null));
    return out;
  },
  text: (b) => `${htmlToText(b.content.question)} ${(b.content.choices || []).map((x) => htmlToText(x.text)).join(' ')}`,
};
