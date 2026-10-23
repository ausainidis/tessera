// Assessment scoring. Shared by the published runtime (bundled into _tessera/runtime.js)
// and the test suite, so the logic learners experience is the logic that is tested.
//
// Results are structured for later LMS reporting: each response maps to one interaction
// (id, type, learner response, correct response, result, weighting), matching the shape of
// SCORM cmi.interactions and xAPI "answered" statements.

/**
 * @param {{mode:'single'|'multiple', correct:string[]}} q
 * @param {string[]} selected choice ids
 */
export function isCorrect(q, selected) {
  const want = new Set(q.correct || []);
  const got = new Set(selected || []);
  if (q.mode !== 'multiple' && got.size !== 1) return false;
  if (want.size !== got.size) return false;
  for (const id of got) if (!want.has(id)) return false;
  return true;
}

/**
 * Score an assessment attempt.
 * @param {Array<{id:string, mode:string, correct:string[], points?:number}>} questions
 * @param {Record<string,string[]>} responses questionId → selected choice ids
 * @param {{passThreshold:number}} settings
 */
export function scoreAttempt(questions, responses, settings) {
  let raw = 0;
  let max = 0;
  const interactions = questions.map((q) => {
    const points = Math.max(1, Number(q.points) || 1);
    const selected = responses[q.id] || [];
    const correct = isCorrect(q, selected);
    max += points;
    if (correct) raw += points;
    return {
      id: q.id,
      type: q.mode === 'multiple' ? 'choice-multiple' : 'choice',
      response: selected,
      correctResponse: q.correct,
      result: correct ? 'correct' : 'incorrect',
      weighting: points,
    };
  });
  const percent = max ? Math.round((raw / max) * 100) : 0;
  const threshold = Math.min(100, Math.max(0, Number(settings?.passThreshold ?? 80)));
  return { raw, max, percent, passed: percent >= threshold, threshold, interactions };
}

/** Whether another attempt is allowed. attempts: 0 means unlimited. */
export function canRetry(settings, attemptsUsed, passed) {
  if (passed) return false;
  const limit = Number(settings?.attempts) || 0;
  return limit === 0 || attemptsUsed < limit;
}

/** Fisher–Yates shuffle with an injectable random source (deterministic in tests). */
export function shuffle(list, random = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
