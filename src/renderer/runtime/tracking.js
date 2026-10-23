// Tracking adapters. The runtime records progress through one small interface so that
// web, SCORM 1.2 and future LMS standards (SCORM 2004, xAPI, cmi5) are interchangeable.
//
// interface Tracker {
//   load(): object|null                    resume state saved earlier
//   save(state): void                      persist resume state
//   setLocation(lessonId): void
//   setProgress(percent): void
//   setScore({ raw, max, percent, passed, interactions }): void
//   complete({ passed?: boolean }): void
//   finish(): void                         called when the learner leaves
// }

function safeStorage() {
  try {
    const s = window.localStorage;
    const k = '__tc_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null; // private mode, sandboxed preview, blocked storage
  }
}

/** Remembers progress in this browser only. Used for web exports and preview. */
export function localTracker(courseId, { persist = true } = {}) {
  const storage = persist ? safeStorage() : null;
  const key = `tessera:${courseId}`;
  let memory = null;
  return {
    kind: 'local',
    load() {
      if (!storage) return memory;
      try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
    },
    save(state) {
      memory = state;
      if (storage) try { storage.setItem(key, JSON.stringify(state)); } catch { /* quota or blocked */ }
    },
    setLocation() {},
    setProgress() {},
    setScore() {},
    complete() {},
    finish() {},
  };
}

function findScorm12Api(win) {
  let w = win;
  for (let i = 0; w && i < 12; i += 1) {
    try { if (w.API) return w.API; } catch { /* cross-origin frame */ }
    if (w.parent === w) break;
    w = w.parent;
  }
  try { if (win.opener) return findScorm12Api(win.opener); } catch { /* ignore */ }
  return null;
}

/**
 * SCORM 1.2 adapter (experimental; must be validated in a real LMS before release).
 * Falls back to local tracking when no LMS API is found, so the package also works offline.
 */
export function scorm12Tracker(courseId) {
  const api = findScorm12Api(window);
  if (!api) {
    const t = localTracker(courseId);
    t.kind = 'local (no LMS found)';
    return t;
  }
  let initialised = String(api.LMSInitialize('')) === 'true';
  let finished = false;
  let status = api.LMSGetValue('cmi.core.lesson_status');
  const set = (k, v) => { if (initialised) api.LMSSetValue(k, String(v)); };
  const commit = () => { if (initialised) api.LMSCommit(''); };
  if (status === 'not attempted' || !status) { set('cmi.core.lesson_status', 'incomplete'); status = 'incomplete'; }
  let interactionCount = Number(api.LMSGetValue('cmi.interactions._count')) || 0;
  return {
    kind: 'scorm12',
    load() {
      try { return JSON.parse(api.LMSGetValue('cmi.suspend_data') || 'null'); } catch { return null; }
    },
    save(state) {
      const json = JSON.stringify(state);
      if (json.length <= 4096) set('cmi.suspend_data', json); // SCORM 1.2 limit
      commit();
    },
    setLocation(lessonId) { set('cmi.core.lesson_location', lessonId); },
    setProgress() {},
    setScore(r) {
      set('cmi.core.score.min', 0);
      set('cmi.core.score.max', 100);
      set('cmi.core.score.raw', r.percent);
      for (const it of r.interactions || []) {
        const n = interactionCount;
        interactionCount += 1;
        set(`cmi.interactions.${n}.id`, it.id.slice(0, 255));
        set(`cmi.interactions.${n}.type`, 'choice');
        set(`cmi.interactions.${n}.student_response`, it.response.join(','));
        set(`cmi.interactions.${n}.result`, it.result === 'correct' ? 'correct' : 'wrong');
        set(`cmi.interactions.${n}.weighting`, it.weighting);
      }
      commit();
    },
    complete({ passed } = {}) {
      status = passed === undefined ? 'completed' : passed ? 'passed' : 'failed';
      set('cmi.core.lesson_status', status);
      commit();
    },
    finish() {
      if (!initialised || finished) return;
      finished = true;
      set('cmi.core.exit', status === 'passed' || status === 'completed' ? '' : 'suspend');
      commit();
      api.LMSFinish('');
      initialised = false;
    },
  };
}

export function createTracker(kind, courseId, opts) {
  if (kind === 'scorm12') return scorm12Tracker(courseId);
  return localTracker(courseId, opts);
}
