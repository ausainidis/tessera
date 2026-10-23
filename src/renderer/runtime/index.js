// Tessera course runtime. Bundled to _tessera/runtime.js and shipped with every
// published course; also used unchanged by the editor preview.
//
// Responsibilities: page navigation, outline and progress, sequential locking,
// continue gates, interactive widgets, completion and resume via a tracking adapter,
// and (preview only) a postMessage bridge to the editor.

import { createTracker } from './tracking.js';
import { initWidgets, handleEmbedMessage } from './widgets.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function boot() {
  const dataEl = document.getElementById('tc-data');
  if (!dataEl) return;
  const data = JSON.parse(dataEl.textContent);
  document.documentElement.classList.add('tc-js');

  const tracker = createTracker(data.tracking, data.courseId, { persist: !data.preview });
  const saved = tracker.load();
  const state = {
    v: 1,
    location: null,
    completed: {},
    gates: {},
    checks: {},
    assessments: {},
    embeds: {},
    done: {},
    ...(saved && saved.v === 1 ? saved : {}),
  };

  const pages = () => data.lessons.filter((l) => l.kind !== 'section');
  const pageEl = (id) => document.getElementById(`lesson-${id}`);
  let current = null;
  let saveTimer = null;

  const rt = {
    data,
    state,
    embedFrames: new Map(),
    save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => tracker.save(state), 250);
    },
    interactionDone(blockId) {
      state.done[blockId] = true;
      rt.save();
      const gateHint = $$('.tc-continue__hint:not([hidden])');
      gateHint.forEach((h) => { h.hidden = true; });
    },
    assessmentSubmitted(lessonId, result) {
      const lesson = data.lessons.find((l) => l.id === lessonId);
      tracker.setScore(result);
      if (result.passed || lesson?.assessment?.requiredForCompletion === false) markComplete(lessonId);
      else {
        rt.save();
        updateOutline();
      }
      checkCourseComplete();
    },
  };

  // ---------- Completion and progress ----------

  function isLocked(lessonId) {
    if (data.preview || data.navigation.mode !== 'sequential') return false;
    for (const p of pages()) {
      if (p.id === lessonId) return false;
      if (!state.completed[p.id]) return true;
    }
    return false;
  }

  function progressPercent() {
    const all = pages();
    if (!all.length) return 0;
    return Math.round((all.filter((p) => state.completed[p.id]).length / all.length) * 100);
  }

  function updateOutline() {
    for (const link of $$('.tc-outline__link')) {
      const id = link.dataset.lesson;
      const locked = isLocked(id);
      link.classList.toggle('is-complete', !!state.completed[id]);
      link.classList.toggle('is-locked', locked);
      if (locked) link.setAttribute('aria-disabled', 'true');
      else link.removeAttribute('aria-disabled');
      if (id === current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
      const status = link.querySelector('.tc-outline__status');
      if (status) status.textContent = state.completed[id] ? '✓' : locked ? '🔒' : '';
    }
    const pct = progressPercent();
    const bar = $('.tc-progress');
    if (bar) {
      bar.setAttribute('aria-valuenow', String(pct));
      $('.tc-progress__bar', bar).style.width = `${pct}%`;
      $('.tc-progress__label', bar).textContent = `${pct}%`;
    }
    tracker.setProgress(pct);
  }

  function courseStatus() {
    const all = pages();
    const complete = all.every((p) => state.completed[p.id]);
    const required = all.filter((p) => p.kind === 'assessment' && p.assessment?.requiredForCompletion !== false);
    const passed = required.length ? required.every((p) => state.assessments[p.id]?.best?.passed) : undefined;
    return { complete, passed, scored: required.length > 0 };
  }

  function checkCourseComplete() {
    const s = courseStatus();
    if (s.complete && !state.courseComplete) {
      state.courseComplete = true;
      tracker.complete({ passed: s.scored ? s.passed : undefined });
    }
    rt.save();
  }

  function markComplete(lessonId) {
    if (state.completed[lessonId]) return;
    state.completed[lessonId] = true;
    updateOutline();
    checkCourseComplete();
  }

  // ---------- Continue gates ----------

  function applyGates(article) {
    const blocks = $$(':scope .tc-blocks > .tc-block', article);
    let locked = false;
    for (const b of blocks) {
      b.classList.toggle('tc-gated', locked);
      b.hidden = locked;
      if (b.dataset.blockType === 'continue' && !state.gates[b.dataset.blockId]) {
        if (!locked) b.hidden = false;
        locked = true;
      } else if (b.dataset.blockType === 'continue') {
        $('button', b).hidden = true;
      }
    }
    const nav = $('.tc-lesson-nav', article);
    if (nav) nav.hidden = locked;
  }

  function gateBlocked(gateEl) {
    const article = gateEl.closest('.tc-lesson');
    const gate = data.gates[gateEl.dataset.blockId];
    if (!gate?.requireComplete) return false;
    for (const b of $$(':scope .tc-blocks > .tc-block', article)) {
      if (b === gateEl) break;
      const id = b.dataset.blockId;
      const needs = data.checks[id] || (data.embeds[id]?.completion) || b.dataset.blockType === 'reflection';
      if (needs && !state.done[id]) return true;
    }
    return false;
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.tc-continue button');
    if (!btn) return;
    const gateEl = btn.closest('.tc-block');
    if (gateBlocked(gateEl)) {
      $('.tc-continue__hint', gateEl).hidden = false;
      return;
    }
    state.gates[gateEl.dataset.blockId] = true;
    rt.save();
    const article = gateEl.closest('.tc-lesson');
    applyGates(article);
    const next = gateEl.nextElementSibling;
    if (next) {
      next.tabIndex = -1;
      next.focus();
    }
    observeEnd(article);
  });

  // ---------- Page navigation ----------

  const endObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting || en.target.hidden) continue;
        const article = en.target.closest('.tc-lesson');
        const lesson = data.lessons.find((l) => l.id === article?.dataset.lessonId);
        if (lesson && lesson.kind !== 'assessment') markComplete(lesson.id);
      }
    }, { threshold: 0.5 })
    : null;

  function observeEnd(article) {
    const nav = $('.tc-lesson-nav', article);
    if (nav && endObserver) endObserver.observe(nav);
  }

  function show(id, { focus = true, blockId = null } = {}) {
    const target = id === 'cover' || id === 'end' ? id : pages().find((p) => p.id === id)?.id;
    if (!target) return show(pages()[0]?.id || 'cover', { focus });
    if (target !== 'cover' && target !== 'end' && isLocked(target)) {
      const firstOpen = pages().find((p) => !state.completed[p.id]);
      return show(firstOpen ? firstOpen.id : 'cover', { focus });
    }
    current = target;
    for (const el of $$('.tc-main > section, .tc-main > article')) el.hidden = el.dataset.lessonId !== target;
    if (target === 'end') {
      const s = courseStatus();
      $('.tc-end__status').textContent = s.complete
        ? (s.scored ? (s.passed ? 'You have completed the course and passed the assessment.' : 'You have completed the course but not yet passed the assessment.') : 'You have completed the course.')
        : `You have completed ${progressPercent()}% of the course. Lessons not yet completed are shown in the outline.`;
    }
    if (target !== 'cover' && target !== 'end') {
      state.location = target;
      tracker.setLocation(target);
      rt.save();
      const article = pageEl(target);
      applyGates(article);
      observeEnd(article);
      if (!$('.tc-lesson-nav', article)) markComplete(target);
    }
    updateOutline();
    document.body.classList.remove('tc-outline-open');
    $('.tc-menu-toggle')?.setAttribute('aria-expanded', 'false');
    const blockEl = blockId ? document.getElementById(`b-${blockId}`) : null;
    // The browser's own fragment scroll runs after hashchange, so position on the next frame.
    const position = () => {
      if (blockEl && !blockEl.hidden) blockEl.scrollIntoView({ block: 'center' });
      else window.scrollTo(0, 0);
    };
    position();
    requestAnimationFrame(position);
    if (focus) document.getElementById(`h-${target}`)?.focus({ preventScroll: true });
    return target;
  }

  function route(focus = true) {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('lesson-')) return show(h.slice(7), { focus });
    if (h.startsWith('b-')) {
      const el = document.getElementById(h);
      const article = el?.closest('[data-lesson-id]');
      if (article) return show(article.dataset.lessonId, { focus: false, blockId: h.slice(2) });
    }
    const coverEl = document.getElementById('lesson-cover');
    if (state.location && pageEl(state.location) && !data.preview) return show(state.location, { focus: false });
    return show(coverEl ? 'cover' : pages()[0]?.id, { focus: false });
  }

  window.addEventListener('hashchange', () => route(true));
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#lesson-"]');
    if (!link) return;
    if (link.getAttribute('aria-disabled') === 'true') {
      e.preventDefault();
      return;
    }
    if (link.dataset.nav === 'next' || link.dataset.nav === 'finish') {
      const article = link.closest('.tc-lesson');
      const lesson = data.lessons.find((l) => l.id === article?.dataset.lessonId);
      if (lesson && lesson.kind !== 'assessment') markComplete(lesson.id);
    }
    if (location.hash === link.getAttribute('href')) {
      e.preventDefault();
      show(link.getAttribute('href').slice(8));
    }
  });

  const toggle = $('.tc-menu-toggle');
  toggle?.addEventListener('click', () => {
    const open = document.body.classList.toggle('tc-outline-open');
    toggle.setAttribute('aria-expanded', String(open));
    if (open) $('.tc-outline a')?.focus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('tc-outline-open')) {
      document.body.classList.remove('tc-outline-open');
      toggle?.setAttribute('aria-expanded', 'false');
      toggle?.focus();
    }
  });

  window.addEventListener('message', (e) => handleEmbedMessage(e, rt));
  window.addEventListener('pagehide', () => { tracker.save(state); tracker.finish(); });

  initWidgets(document, rt);
  route(false);

  // ---------- Preview bridge (editor only) ----------

  if (data.preview && window.parent !== window) {
    const post = (msg) => window.parent.postMessage(msg, '*');
    document.addEventListener('click', (e) => {
      const block = e.target.closest('.tc-block');
      const article = e.target.closest('[data-lesson-id]');
      if (block && article) post({ type: 'tessera:select', lessonId: article.dataset.lessonId, blockId: block.dataset.blockId });
    }, true);
    const highlight = (blockId) => {
      $$('.tc-selected').forEach((el) => el.classList.remove('tc-selected'));
      if (blockId) document.getElementById(`b-${blockId}`)?.classList.add('tc-selected');
    };
    window.addEventListener('message', (e) => {
      if (e.source !== window.parent) return;
      const msg = e.data || {};
      if (msg.type === 'tessera:goto') {
        if (msg.lessonId && msg.lessonId !== current) show(msg.lessonId, { focus: false, blockId: msg.blockId });
        else if (msg.blockId) document.getElementById(`b-${msg.blockId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        highlight(msg.blockId);
      }
      if (msg.type === 'tessera:replace-lesson' && msg.html) {
        const old = pageEl(msg.lessonId);
        if (!old) return;
        const tpl = document.createElement('template');
        tpl.innerHTML = msg.html.trim();
        const fresh = tpl.content.firstElementChild;
        if (msg.data) Object.assign(data, msg.data);
        old.replaceWith(fresh);
        fresh.hidden = current !== msg.lessonId;
        initWidgets(fresh, rt);
        if (current === msg.lessonId) { applyGates(fresh); observeEnd(fresh); }
        highlight(msg.blockId);
      }
      if (msg.type === 'tessera:theme' && typeof msg.css === 'string') {
        document.getElementById('tc-theme').textContent = msg.css;
      }
    });
    post({ type: 'tessera:ready', lessonId: current });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
