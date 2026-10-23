// The course renderer. Turns project state into a static HTML document.
//
// The SAME function produces the editor preview and the published course; only the
// `mode` flag differs (preview adds a postMessage bridge for the editor). Both load
// the same runtime script and stylesheet from ./_tessera/, and resolve assets with the
// same project-relative paths, so what the author previews is what learners get.

import { getBlockDef } from '../core/blocks/index.js';
import { orderedLessons } from '../core/model.js';
import { themeToCss } from '../core/theme.js';
import { overridePresentation } from '../core/overrides.js';
import { escapeHtml, escapeAttr, attrs, jsonForScript } from '../core/html.js';
import { sanitizeRichText } from '../core/richtext.js';
import { RUNTIME_DIR, APP_NAME, APP_VERSION, toPosixRel } from '../core/format.js';

const encodePath = (p) => toPosixRel(p).split('/').map(encodeURIComponent).join('/');

function makeContext(state, opts, lesson) {
  const assetUrl = opts.assetUrl || ((entry) => encodePath(entry.path));
  return {
    state,
    lesson,
    mode: opts.mode,
    asset(id) {
      const entry = state.assets[id];
      if (!entry || entry.missing) return null;
      return { url: assetUrl(entry), entry };
    },
  };
}

function styleClassFor(state, type) {
  const m = state.manifest.styleMap?.[type];
  return m?.className ? ` ${String(m.className).replace(/[^\w\s-]/g, '')}` : '';
}

export function renderBlock(state, lesson, block, opts = {}, extraCtx = {}) {
  const def = getBlockDef(block.type);
  const ctx = { ...makeContext(state, opts, lesson), ...extraCtx };
  let inner;
  if (!def) {
    inner = `<div class="tc-retained" role="note"><p class="tc-retained__label">Unsupported block type “${escapeHtml(block.type)}”</p><p class="tc-retained__summary">This block is preserved in the project file but this version cannot display it.</p></div>`;
  } else {
    try {
      inner = def.render(block, ctx);
    } catch (e) {
      inner = `<div class="tc-missing">This block could not be displayed (${escapeHtml(e.message)}).</div>`;
    }
  }
  const o = overridePresentation(block.overrides);
  const width = o.width || block.settings?.size || def?.defaultWidth || 'content';
  const cls = `tc-block tc-block--${escapeAttr(block.type)} tc-w-${escapeAttr(width)}${o.classes.map((c) => ` ${c}`).join('')}${styleClassFor(state, block.type)}`;
  return `<div${attrs({ class: cls, id: `b-${block.id}`, 'data-block-id': block.id, 'data-block-type': block.type, style: o.style || null })}>${inner}</div>`;
}

function assessmentIntro(lesson, questionCount) {
  const a = lesson.assessment || {};
  const attempts = Number(a.attempts) ? `${a.attempts} attempt${Number(a.attempts) === 1 ? '' : 's'}` : 'unlimited attempts';
  return `<div class="tc-assessment__intro"><p>${questionCount} question${questionCount === 1 ? '' : 's'} · Pass mark ${Number(a.passThreshold) || 0}% · ${attempts}</p></div>`;
}

function lessonNeighbours(lessons, lesson) {
  const pages = lessons.filter((l) => l.kind !== 'section');
  const i = pages.findIndex((l) => l.id === lesson.id);
  return { prev: pages[i - 1] || null, next: pages[i + 1] || null };
}

/** Markup for one lesson <article>. Used for the full document and for live preview updates. */
export function renderLessonArticle(state, lessonId, opts = {}) {
  const lessons = orderedLessons(state);
  const lesson = state.lessons[lessonId];
  if (!lesson || lesson.kind === 'section') return '';
  let blocks;
  if (lesson.kind === 'assessment') {
    const questions = lesson.blocks.filter((b) => b.type === 'assessmentQuestion');
    let n = 0;
    const body = lesson.blocks.map((b) => renderBlock(state, lesson, b, opts, b.type === 'assessmentQuestion' ? { questionNumber: ++n, questionCount: questions.length } : {})).join('\n');
    blocks = `<form class="tc-assessment" data-tc="assessment" data-lesson="${escapeAttr(lesson.id)}" novalidate>
      ${assessmentIntro(lesson, questions.length)}
      <div class="tc-blocks">${body}</div>
      <div class="tc-assessment__actions"><button type="submit" class="tc-button">Submit answers</button></div>
      <div class="tc-assessment__result" role="status" aria-live="polite" tabindex="-1"></div>
    </form>`;
  } else {
    blocks = `<div class="tc-blocks">${lesson.blocks.map((b) => renderBlock(state, lesson, b, opts)).join('\n')}</div>`;
  }
  const nav = state.manifest.navigation;
  const { prev, next } = lessonNeighbours(lessons, lesson);
  const lessonNav = nav.showLessonNav === false ? '' : `<nav class="tc-lesson-nav" aria-label="Lesson navigation">
      ${prev ? `<a class="tc-lesson-nav__prev" href="#lesson-${escapeAttr(prev.id)}" data-nav="prev"><span class="tc-lesson-nav__dir">Previous</span> ${escapeHtml(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a class="tc-lesson-nav__next tc-button" href="#lesson-${escapeAttr(next.id)}" data-nav="next"><span class="tc-lesson-nav__dir">Next</span> ${escapeHtml(next.title)}</a>` : '<a class="tc-lesson-nav__next tc-button" href="#lesson-end" data-nav="finish">Finish</a>'}
    </nav>`;
  const desc = lesson.description ? `<div class="tc-lesson-desc tc-prose">${sanitizeRichText(lesson.description)}</div>` : '';
  return `<article class="tc-lesson tc-lesson--${escapeAttr(lesson.kind)}" id="lesson-${escapeAttr(lesson.id)}" data-lesson-id="${escapeAttr(lesson.id)}" aria-labelledby="h-${escapeAttr(lesson.id)}">
    <header class="tc-lesson-header"><h1 class="tc-lesson-title" id="h-${escapeAttr(lesson.id)}" tabindex="-1">${escapeHtml(lesson.title)}</h1>${desc}</header>
    ${blocks}
    ${lessonNav}
  </article>`;
}

/** Data the runtime needs: structure, settings and answer keys. */
export function buildRuntimeData(state, opts = {}) {
  const m = state.manifest;
  const data = {
    generator: `${APP_NAME} ${APP_VERSION}`,
    courseId: m.id,
    title: m.course.title,
    navigation: m.navigation,
    tracking: opts.tracking || 'local',
    preview: opts.mode === 'preview',
    lessons: [],
    checks: {},
    questions: {},
    gates: {},
    embeds: {},
  };
  for (const lesson of orderedLessons(state)) {
    const entry = { id: lesson.id, title: lesson.title, kind: lesson.kind };
    if (lesson.kind === 'assessment') {
      entry.assessment = { ...lesson.assessment };
      entry.questions = lesson.blocks.filter((b) => b.type === 'assessmentQuestion').map((b) => b.id);
    }
    data.lessons.push(entry);
    for (const b of lesson.blocks) {
      const def = getBlockDef(b.type);
      if (!def?.runtimeData) continue;
      const rd = { ...def.runtimeData(b), lessonId: lesson.id };
      if (b.type === 'knowledgeCheck') data.checks[b.id] = rd;
      else if (b.type === 'assessmentQuestion') data.questions[b.id] = rd;
      else if (b.type === 'continue') data.gates[b.id] = rd;
      else if (b.type === 'embed') data.embeds[b.id] = rd;
    }
  }
  return data;
}

function outline(state) {
  const items = orderedLessons(state).map((l) => (l.kind === 'section'
    ? `<li class="tc-outline__section" role="presentation">${escapeHtml(l.title)}</li>`
    : `<li class="tc-outline__item"><a class="tc-outline__link" href="#lesson-${escapeAttr(l.id)}" data-lesson="${escapeAttr(l.id)}"><span class="tc-outline__status" aria-hidden="true"></span><span class="tc-outline__title">${escapeHtml(l.title)}</span></a></li>`)).join('');
  return `<nav id="tc-outline" class="tc-outline" aria-label="Course outline"><ol class="tc-outline__list">${items}</ol></nav>`;
}

function cover(state) {
  const c = state.manifest.course;
  const first = orderedLessons(state).find((l) => l.kind !== 'section');
  const objectives = (c.objectives || []).filter((o) => String(o).trim());
  return `<section class="tc-cover" id="lesson-cover" data-lesson-id="cover" aria-labelledby="h-cover">
    <h1 class="tc-cover__title" id="h-cover" tabindex="-1">${escapeHtml(c.title)}</h1>
    ${c.description ? `<div class="tc-cover__desc tc-prose">${sanitizeRichText(c.description)}</div>` : ''}
    ${objectives.length ? `<div class="tc-cover__objectives"><h2 class="tc-heading">Learning objectives</h2><ul class="tc-list">${objectives.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ul></div>` : ''}
    ${first ? `<p><a class="tc-button tc-cover__start" href="#lesson-${escapeAttr(first.id)}" data-nav="start">Start course</a></p>` : ''}
  </section>`;
}

/**
 * Render the complete course document.
 * @param {object} state project state
 * @param {{ mode?: 'preview'|'publish', assetUrl?: (entry) => string, tracking?: 'local'|'scorm12', runtimeBase?: string }} [opts]
 */
export function renderCourse(state, opts = {}) {
  const mode = opts.mode || 'publish';
  const base = opts.runtimeBase ?? RUNTIME_DIR;
  const m = state.manifest;
  const nav = m.navigation;
  const lessons = orderedLessons(state);
  const articles = lessons.map((l) => renderLessonArticle(state, l.id, { ...opts, mode })).join('\n');
  const stylesheets = (m.stylesheets || []).map((href) => `<link rel="stylesheet" href="${escapeAttr(encodePath(href))}">`).join('\n');
  const data = buildRuntimeData(state, { ...opts, mode });
  return `<!doctype html>
<html lang="${escapeAttr(m.course.language || 'en')}"${mode === 'preview' ? ' data-tc-preview' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="${escapeAttr(`${APP_NAME} ${APP_VERSION}`)}">
<title>${escapeHtml(m.course.title)}</title>
<link rel="stylesheet" href="${base}/base.css">
<style id="tc-theme">${themeToCss(state.theme, encodePath)}</style>
${stylesheets}
</head>
<body class="tc-body${nav.showOutline === false ? ' tc-no-outline' : ''}">
<a class="tc-skip" href="#tc-main">Skip to content</a>
<header class="tc-header">
  ${nav.showOutline === false ? '' : '<button type="button" class="tc-menu-toggle" aria-controls="tc-outline" aria-expanded="false"><span aria-hidden="true">☰</span><span class="tc-visually-hidden">Course outline</span></button>'}
  <p class="tc-course-title"><a href="#lesson-cover">${escapeHtml(m.course.title)}</a></p>
  ${nav.showProgress === false ? '' : '<div class="tc-progress" role="progressbar" aria-label="Course progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="tc-progress__bar"></span><span class="tc-progress__label">0%</span></div>'}
</header>
<div class="tc-layout">
${nav.showOutline === false ? '' : outline(state)}
<main id="tc-main" class="tc-main" tabindex="-1">
${nav.coverPage === false ? '' : cover(state)}
${articles}
<section class="tc-end" id="lesson-end" data-lesson-id="end" aria-labelledby="h-end" hidden>
  <h1 id="h-end" tabindex="-1">Course complete</h1>
  <div class="tc-end__status" role="status"></div>
</section>
</main>
</div>
<script type="application/json" id="tc-data">${jsonForScript(data)}</script>
<script src="${base}/runtime.js"></script>
</body>
</html>
`;
}
