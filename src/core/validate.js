// Project checks: structure, block content, accessibility, assets and external dependencies.
// Issues are advisory unless level === 'error'. Nothing here changes the project.

import { getBlockDef, blockAssetRefs, blockExternalRefs } from './blocks/index.js';
import { orderedLessons } from './model.js';
import { themeContrastIssues, contrastRatio, normalizeTheme } from './theme.js';
import { cleanOverrides } from './overrides.js';
import { isValidId } from './ids.js';

/**
 * @typedef {{ level: 'error'|'warning'|'info', code: string, message: string, category: string,
 *             lessonId?: string, blockId?: string, field?: string|null }} Issue
 */

export function validateProject(state) {
  const issues = [];
  const add = (category, base, extra = {}) => issues.push({ ...base, ...extra, category });
  const seen = new Set();
  const theme = normalizeTheme(state.theme);

  for (const i of themeContrastIssues(theme)) add('accessibility', i, { scope: 'theme' });

  if (!state.manifest.course.title?.trim()) add('content', { level: 'warning', code: 'course-title', message: 'The course has no title.' });

  for (const lesson of orderedLessons(state)) {
    if (!lesson.title?.trim()) add('content', { level: 'warning', code: 'lesson-title', message: 'A lesson has no title.' }, { lessonId: lesson.id });
    if (lesson.kind === 'assessment') {
      const qs = lesson.blocks.filter((b) => b.type === 'assessmentQuestion');
      if (!qs.length) add('assessment', { level: 'warning', code: 'no-questions', message: `Assessment “${lesson.title}” has no questions.` }, { lessonId: lesson.id });
      const t = Number(lesson.assessment?.passThreshold);
      if (!(t >= 0 && t <= 100)) add('assessment', { level: 'error', code: 'threshold', message: 'Pass threshold must be between 0 and 100%.' }, { lessonId: lesson.id });
    }
    let lastHeading = 1; // the lesson title is rendered as <h1>
    for (const block of lesson.blocks) {
      const at = { lessonId: lesson.id, blockId: block.id };
      if (!isValidId(block.id) || seen.has(block.id)) add('structure', { level: 'error', code: 'block-id', message: `Block id “${block.id}” is missing or duplicated.` }, at);
      seen.add(block.id);
      const def = getBlockDef(block.type);
      if (!def) {
        add('structure', { level: 'error', code: 'unknown-type', message: `Unknown block type “${block.type}”. It is kept unchanged but cannot be shown.` }, at);
        continue;
      }
      const ctx = { state, lesson };
      for (const i of def.validate?.(block, ctx) || []) add(i.code === 'retained' ? 'import' : 'content', i, at);
      for (const i of def.a11y?.(block, ctx) || []) add('accessibility', i, at);

      for (const h of def.headings?.(block) || []) {
        if (h.level > lastHeading + 1) {
          add('accessibility', { level: 'warning', code: 'heading-skip', message: `Heading “${h.text}” jumps from level ${lastHeading} to ${h.level}. Use level ${lastHeading + 1} or lower.`, field: 'level' }, at);
        }
        lastHeading = h.level;
      }

      const o = cleanOverrides(block.overrides);
      if (o.background || o.textColor) {
        const ratio = contrastRatio(o.textColor || theme.colors.text, o.background || theme.colors.background);
        if (ratio !== null && ratio < 4.5) add('accessibility', { level: 'warning', code: 'contrast', message: `Block colour override has contrast ${ratio}:1 (needs 4.5:1).`, field: 'overrides' }, at);
      }

      for (const ref of blockAssetRefs(block)) {
        if (!state.assets[ref]) add('assets', { level: 'error', code: 'asset-unknown', message: `Block refers to an asset that is not in the asset list (${ref}).` }, at);
        else if (state.assets[ref].missing) add('assets', { level: 'error', code: 'asset-missing', message: `File for “${state.assets[ref].originalName || state.assets[ref].path}” is missing.` }, at);
      }
      for (const url of blockExternalRefs(block)) {
        add('external', { level: 'info', code: 'external', message: `Needs an internet connection when viewed: ${url}` }, at);
      }
    }
  }
  return issues;
}

export function summarizeIssues(issues) {
  const s = { error: 0, warning: 0, info: 0 };
  for (const i of issues) s[i.level] = (s[i.level] || 0) + 1;
  return s;
}

/** Every external URL the course depends on (for the offline/online report). */
export function externalDependencies(state) {
  const out = [];
  for (const lesson of orderedLessons(state)) {
    for (const block of lesson.blocks) {
      for (const url of blockExternalRefs(block)) out.push({ url, lessonId: lesson.id, blockId: block.id, type: block.type });
    }
  }
  return out;
}
