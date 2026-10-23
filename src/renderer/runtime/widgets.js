// Progressive enhancement for interactive blocks. Every widget works from the static
// markup produced by the block's render() function; without JavaScript the content is
// still readable.

import { isCorrect, scoreAttempt, canRetry, shuffle } from '../../core/assessment.js';

const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));
const once = (el, key) => {
  if (el.dataset[key]) return false;
  el.dataset[key] = '1';
  return true;
};

function button(label, className = 'tc-button tc-button--secondary') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  return b;
}

// ---------- Tabs (WAI-ARIA tabs pattern, automatic activation) ----------

function initTabs(el) {
  if (!once(el, 'tcReady')) return;
  const panels = $$(el, ':scope > .tc-tabs__panel');
  if (!panels.length) return;
  const list = document.createElement('div');
  list.className = 'tc-tabs__list';
  list.setAttribute('role', 'tablist');
  const tabs = panels.map((p) => {
    const t = button(p.dataset.title || 'Tab', 'tc-tabs__tab');
    t.id = `t-${p.id}`;
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-controls', p.id);
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', t.id);
    p.querySelector('.tc-tabs__title')?.classList.add('tc-visually-hidden');
    list.appendChild(t);
    return t;
  });
  const select = (i, focus) => {
    tabs.forEach((t, n) => {
      t.setAttribute('aria-selected', String(n === i));
      t.tabIndex = n === i ? 0 : -1;
      panels[n].hidden = n !== i;
    });
    if (focus) tabs[i].focus();
  };
  list.addEventListener('click', (e) => {
    const i = tabs.indexOf(e.target.closest('[role=tab]'));
    if (i >= 0) select(i, false);
  });
  list.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    const map = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    select((map[e.key] + tabs.length) % tabs.length, true);
  });
  el.prepend(list);
  select(0, false);
}

// ---------- Paged widgets: process steps and carousels ----------

function initPager(el, itemsSel, { label, finishLabel }) {
  if (!once(el, 'tcReady')) return;
  const items = $$(el, itemsSel);
  if (items.length < 2) return;
  const bar = document.createElement('div');
  bar.className = 'tc-pager';
  const prev = button('Previous');
  const next = button('Next', 'tc-button');
  const status = document.createElement('span');
  status.className = 'tc-pager__status';
  status.setAttribute('aria-live', 'polite');
  bar.append(prev, status, next);
  let i = 0;
  const show = (n, focus) => {
    i = Math.max(0, Math.min(items.length - 1, n));
    items.forEach((it, k) => { it.hidden = k !== i; });
    prev.disabled = i === 0;
    next.disabled = i === items.length - 1;
    next.textContent = i === items.length - 2 && finishLabel ? finishLabel : 'Next';
    status.textContent = `${label} ${i + 1} of ${items.length}`;
    if (focus) {
      const target = items[i].querySelector('h3, figure, img') || items[i];
      target.tabIndex = -1;
      target.focus({ preventScroll: false });
    }
  };
  prev.addEventListener('click', () => show(i - 1, true));
  next.addEventListener('click', () => show(i + 1, true));
  items.at(-1).after(bar);
  show(0, false);
}

// ---------- Flashcards ----------

function initFlashcards(el) {
  if (!once(el, 'tcReady')) return;
  for (const card of $$(el, '.tc-flashcard')) {
    const back = card.querySelector('.tc-flashcard__back');
    back.hidden = true;
    const toggle = button('Turn card');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const flipped = card.classList.toggle('is-flipped');
      back.hidden = !flipped;
      card.querySelector('.tc-flashcard__front').hidden = flipped;
      toggle.setAttribute('aria-expanded', String(flipped));
      toggle.textContent = flipped ? 'Turn back' : 'Turn card';
    });
    card.append(toggle);
  }
}

// ---------- Choice helpers ----------

const selectedIn = (el) => $$(el, 'input:checked').map((i) => i.value);

function showChoiceResult(el, q, selected, { reveal }) {
  for (const input of $$(el, 'input')) {
    const label = input.closest('.tc-choice');
    label.classList.remove('is-correct', 'is-incorrect');
    if (reveal && q.correct.includes(input.value)) label.classList.add('is-correct');
    if (selected.includes(input.value) && !q.correct.includes(input.value)) label.classList.add('is-incorrect');
  }
}

function feedbackHtml(q, selected, correct) {
  const parts = [`<p class="tc-feedback__result">${correct ? '✔ ' : '✖ '}${correct ? q.feedbackCorrect : q.feedbackIncorrect}</p>`];
  for (const id of selected) if (q.choiceFeedback?.[id]) parts.push(`<p>${q.choiceFeedback[id]}</p>`);
  return parts.join('');
}

function setInputsDisabled(el, disabled) {
  $$(el, 'input').forEach((i) => { i.disabled = disabled; });
}

// ---------- Knowledge checks (ungraded) ----------

function initCheck(el, rt) {
  if (!once(el, 'tcReady')) return;
  const id = el.dataset.block;
  const q = rt.data.checks[id];
  if (!q) return;
  const fb = el.querySelector('.tc-feedback');
  const submit = el.querySelector('[data-action=submit]');
  const retry = el.querySelector('[data-action=retry]');
  const restore = rt.state.checks[id];
  const finish = (selected, correct) => {
    showChoiceResult(el, q, selected, { reveal: correct || !q.allowRetry });
    fb.innerHTML = feedbackHtml(q, selected, correct);
    fb.className = `tc-feedback ${correct ? 'is-correct' : 'is-incorrect'}`;
    setInputsDisabled(el, true);
    submit.hidden = true;
    retry.hidden = correct || !q.allowRetry;
  };
  if (restore?.selected) {
    $$(el, 'input').forEach((i) => { i.checked = restore.selected.includes(i.value); });
    finish(restore.selected, restore.correct);
  }
  submit.addEventListener('click', () => {
    const selected = selectedIn(el);
    if (!selected.length) {
      fb.textContent = 'Select an answer first.';
      fb.className = 'tc-feedback';
      return;
    }
    const correct = isCorrect(q, selected);
    finish(selected, correct);
    rt.state.checks[id] = { selected, correct };
    rt.interactionDone(id);
  });
  retry.addEventListener('click', () => {
    setInputsDisabled(el, false);
    $$(el, 'input').forEach((i) => { i.checked = false; });
    $$(el, '.tc-choice').forEach((c) => c.classList.remove('is-correct', 'is-incorrect'));
    fb.textContent = '';
    fb.className = 'tc-feedback';
    submit.hidden = false;
    retry.hidden = true;
    el.querySelector('input')?.focus();
  });
}

// ---------- Scored assessments ----------

function initAssessment(form, rt) {
  if (!once(form, 'tcReady')) return;
  const lessonId = form.dataset.lesson;
  const lesson = rt.data.lessons.find((l) => l.id === lessonId);
  if (!lesson) return;
  const settings = lesson.assessment || {};
  const questions = (lesson.questions || []).map((id) => ({ id, ...rt.data.questions[id] })).filter((q) => q.correct);
  const resultEl = form.querySelector('.tc-assessment__result');
  const submitBtn = form.querySelector('[type=submit]');
  const record = (rt.state.assessments[lessonId] ||= { attempts: 0, best: null, last: null });

  const container = form.querySelector('.tc-blocks');
  if (settings.shuffleQuestions && !rt.data.preview) {
    const blocks = $$(container, ':scope > .tc-block--assessmentQuestion');
    shuffle(blocks).forEach((b) => container.appendChild(b));
    $$(container, '.tc-question__number').forEach((n, i) => { n.textContent = `Question ${i + 1} of ${blocks.length}`; });
  }
  if (settings.shuffleChoices && !rt.data.preview) {
    for (const fs of $$(form, '.tc-choices')) shuffle($$(fs, '.tc-choice')).forEach((c) => fs.appendChild(c));
  }

  const showSummary = (r) => {
    const attemptsLeft = Number(settings.attempts) ? Math.max(0, settings.attempts - record.attempts) : null;
    resultEl.innerHTML = `<p class="tc-assessment__score"><strong>${r.percent}%</strong> (${r.raw} of ${r.max} points) — ${r.passed ? 'Passed' : 'Not passed'}. Pass mark ${r.threshold}%.</p>
      ${!r.passed && attemptsLeft !== null ? `<p>${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.</p>` : ''}`;
    resultEl.className = `tc-assessment__result ${r.passed ? 'is-correct' : 'is-incorrect'}`;
  };

  const lock = (r) => {
    setInputsDisabled(form, true);
    submitBtn.hidden = true;
    if (settings.feedback !== 'none') {
      for (const it of r.interactions) {
        const qEl = form.querySelector(`[data-tc=question][data-block="${CSS.escape(it.id)}"]`);
        if (!qEl) continue;
        const q = rt.data.questions[it.id];
        showChoiceResult(qEl, q, it.response, { reveal: settings.revealAnswers !== false && (r.passed || !canRetry(settings, record.attempts, r.passed)) });
        if (settings.feedback === 'after-each') {
          const fb = qEl.querySelector('.tc-feedback');
          fb.innerHTML = feedbackHtml(q, it.response, it.result === 'correct');
          fb.className = `tc-feedback ${it.result === 'correct' ? 'is-correct' : 'is-incorrect'}`;
        }
      }
    }
    showSummary(r);
    if (canRetry(settings, record.attempts, r.passed)) {
      const again = button('Try again', 'tc-button');
      again.addEventListener('click', () => {
        form.reset();
        setInputsDisabled(form, false);
        $$(form, '.tc-choice').forEach((c) => c.classList.remove('is-correct', 'is-incorrect'));
        $$(form, '.tc-feedback').forEach((f) => { f.textContent = ''; f.className = 'tc-feedback'; });
        resultEl.textContent = '';
        submitBtn.hidden = false;
        form.querySelector('input')?.focus();
      });
      resultEl.appendChild(again);
    }
  };

  if (record.last) {
    for (const it of record.last.interactions) {
      $$(form, `input[name="c-${CSS.escape(it.id)}"]`).forEach((i) => { i.checked = it.response.includes(i.value); });
    }
    lock(record.last);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const responses = {};
    for (const q of questions) responses[q.id] = $$(form, `input[name="c-${CSS.escape(q.id)}"]:checked`).map((i) => i.value);
    const unanswered = questions.filter((q) => !responses[q.id].length).length;
    if (unanswered && !window.confirm(`${unanswered} question${unanswered === 1 ? ' is' : 's are'} unanswered. Submit anyway?`)) return;
    const r = scoreAttempt(questions, responses, settings);
    record.attempts += 1;
    record.last = r;
    if (!record.best || r.percent > record.best.percent) record.best = { percent: r.percent, passed: r.passed };
    lock(r);
    resultEl.focus();
    rt.assessmentSubmitted(lessonId, r);
  });
}

// ---------- Reflection prompts (stored in this browser only) ----------

function initReflection(el, rt) {
  if (!once(el, 'tcReady')) return;
  const ta = el.querySelector('textarea');
  const key = `tessera:${rt.data.courseId}:reflection:${el.dataset.block}`;
  try { ta.value = rt.data.preview ? '' : window.localStorage.getItem(key) || ''; } catch { /* storage unavailable */ }
  let t;
  ta.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { try { if (!rt.data.preview) window.localStorage.setItem(key, ta.value); } catch { /* ignore */ } }, 400);
    rt.interactionDone(el.dataset.block);
  });
}

// ---------- Embedded components ----------

function initEmbed(el, rt) {
  if (!once(el, 'tcReady')) return;
  const frame = el.querySelector('iframe');
  if (!frame) return;
  const id = el.dataset.block;
  // Opened from a local folder: Chromium refuses to load file:// scripts into an opaque-origin
  // frame, so the component would not run at all. Here only, the frame gets same-origin access
  // (it can then reach the course page). On a web server and in the editor the full sandbox
  // applies. Documented in docs/COMPONENTS.md and docs/SECURITY.md.
  if (location.protocol === 'file:' && !/allow-same-origin/.test(frame.getAttribute('sandbox') || '')) {
    frame.setAttribute('sandbox', `${frame.getAttribute('sandbox')} allow-same-origin`);
    frame.src = frame.getAttribute('src');
  }
  let config = {};
  try { config = JSON.parse(frame.dataset.config || '{}'); } catch { /* invalid config is reported in the editor */ }
  // The frame may finish loading before this runs, so send the configuration now, again on
  // load, and whenever the component announces itself with "tessera:ready".
  const send = () => frame.contentWindow?.postMessage({ type: 'tessera:config', blockId: id, config }, '*');
  frame.addEventListener('load', send);
  rt.embedFrames.set(frame, { el, id, send });
  send();
}

export function handleEmbedMessage(e, rt) {
  for (const [frame, info] of rt.embedFrames) {
    if (!frame.isConnected) { rt.embedFrames.delete(frame); continue; }
    if (frame.contentWindow !== e.source) continue;
    const msg = e.data || {};
    if (msg.type === 'tessera:ready') info.send();
    if (msg.type === 'tessera:resize' && info.el.dataset.sizing === 'auto') {
      const h = Math.max(80, Math.min(10000, Number(msg.height) || 0));
      if (h) frame.style.height = `${h}px`;
    }
    if (msg.type === 'tessera:complete' && info.el.dataset.completion === 'event') {
      rt.state.embeds[info.id] = { complete: true, score: Number.isFinite(msg.score) ? msg.score : undefined };
      rt.interactionDone(info.id);
    }
    return;
  }
}

export function initWidgets(root, rt) {
  $$(root, '[data-tc=tabs]').forEach((el) => initTabs(el));
  $$(root, '[data-tc=process]').forEach((el) => initPager(el, '.tc-process__step', { label: 'Step' }));
  $$(root, '[data-tc=carousel]').forEach((el) => initPager(el, '.tc-gallery__item', { label: 'Image' }));
  $$(root, '[data-tc=flashcards]').forEach((el) => initFlashcards(el));
  $$(root, '[data-tc=check]').forEach((el) => initCheck(el, rt));
  $$(root, '[data-tc=assessment]').forEach((el) => initAssessment(el, rt));
  $$(root, '[data-tc=reflection]').forEach((el) => initReflection(el, rt));
  $$(root, '[data-tc=embed]').forEach((el) => initEmbed(el, rt));
}
