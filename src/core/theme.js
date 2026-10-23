// Course-wide design settings ("theme") and their translation to CSS custom properties.
// New blocks never hard-code colours or sizes: everything is read from these variables,
// so a block inserted into any project automatically follows that project's theme.

import { newId } from './ids.js';
import { THEME_FORMAT, FORMAT_VERSION } from './format.js';

export const FONT_STACKS = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", monospace',
};

export function defaultTheme() {
  return {
    format: THEME_FORMAT,
    formatVersion: FORMAT_VERSION,
    id: newId('thm'),
    name: 'Default',
    colors: {
      primary: '#1d5f8a',
      onPrimary: '#ffffff',
      text: '#1f2328',
      muted: '#57606a',
      background: '#ffffff',
      surface: '#f3f5f7',
      border: '#d0d7de',
      accent: '#a8471a',
      link: '#1d5f8a',
      focus: '#c45a00',
      success: '#1a7f37',
      error: '#b42318',
    },
    typography: {
      bodyFont: 'system',
      headingFont: 'system',
      baseSize: 18,
      lineHeight: 1.6,
      scale: 1.25,
      headingWeight: 700,
      fonts: [], // [{ family, src: 'assets/fonts/x.woff2', weight: '400', style: 'normal' }]
    },
    spacing: { blockGap: 40, unit: 8 },
    layout: { contentWidth: 760, wideWidth: 1120 },
    borders: { radius: 8, width: 1 },
    buttons: { style: 'filled', radius: 6, uppercase: false },
    customCss: '',
  };
}

/** Fill in any missing theme fields from defaults (themes from older versions or imports). */
export function normalizeTheme(theme) {
  const base = defaultTheme();
  const t = theme && typeof theme === 'object' ? theme : {};
  return {
    ...base,
    ...t,
    format: THEME_FORMAT,
    formatVersion: FORMAT_VERSION,
    id: t.id || base.id,
    colors: { ...base.colors, ...(t.colors || {}) },
    typography: { ...base.typography, ...(t.typography || {}), fonts: Array.isArray(t.typography?.fonts) ? t.typography.fonts : [] },
    spacing: { ...base.spacing, ...(t.spacing || {}) },
    layout: { ...base.layout, ...(t.layout || {}) },
    borders: { ...base.borders, ...(t.borders || {}) },
    buttons: { ...base.buttons, ...(t.buttons || {}) },
    customCss: typeof t.customCss === 'string' ? t.customCss : '',
  };
}

export function fontStack(name, theme) {
  if (FONT_STACKS[name]) return FONT_STACKS[name];
  const declared = (theme.typography.fonts || []).some((f) => f.family === name);
  const safe = String(name).replace(/["\\;{}<>]/g, '');
  return declared || safe ? `"${safe}", ${FONT_STACKS.system}` : FONT_STACKS.system;
}

const cssValue = (v) => String(v).replace(/[;{}<>]/g, '');

/**
 * CSS for a theme: @font-face rules for bundled local fonts plus :root variables.
 * @param {object} theme
 * @param {(path: string) => string} [url] maps a project-relative path to a URL
 */
export function themeToCss(theme, url = (p) => p) {
  const t = normalizeTheme(theme);
  const c = t.colors;
  const ty = t.typography;
  const lines = [];
  for (const f of ty.fonts) {
    if (!f || !f.family || !f.src) continue;
    lines.push(`@font-face{font-family:"${cssValue(f.family)}";src:url("${cssValue(url(f.src))}");font-weight:${cssValue(f.weight || '400')};font-style:${cssValue(f.style || 'normal')};font-display:swap}`);
  }
  const vars = {
    '--tc-color-primary': c.primary,
    '--tc-color-on-primary': c.onPrimary,
    '--tc-color-text': c.text,
    '--tc-color-muted': c.muted,
    '--tc-color-bg': c.background,
    '--tc-color-surface': c.surface,
    '--tc-color-border': c.border,
    '--tc-color-accent': c.accent,
    '--tc-color-link': c.link,
    '--tc-color-focus': c.focus,
    '--tc-color-success': c.success,
    '--tc-color-error': c.error,
    '--tc-font-body': fontStack(ty.bodyFont, t),
    '--tc-font-heading': fontStack(ty.headingFont, t),
    '--tc-font-size': `${Number(ty.baseSize) || 18}px`,
    '--tc-line-height': Number(ty.lineHeight) || 1.6,
    '--tc-type-scale': Number(ty.scale) || 1.25,
    '--tc-heading-weight': Number(ty.headingWeight) || 700,
    '--tc-block-gap': `${Number(t.spacing.blockGap) || 0}px`,
    '--tc-space': `${Number(t.spacing.unit) || 8}px`,
    '--tc-width-content': `${Number(t.layout.contentWidth) || 760}px`,
    '--tc-width-wide': `${Number(t.layout.wideWidth) || 1120}px`,
    '--tc-radius': `${Number(t.borders.radius) || 0}px`,
    '--tc-border-width': `${Number(t.borders.width) || 0}px`,
    '--tc-button-radius': `${Number(t.buttons.radius) || 0}px`,
    '--tc-button-transform': t.buttons.uppercase ? 'uppercase' : 'none',
  };
  lines.push(`:root{${Object.entries(vars).map(([k, v]) => `${k}:${cssValue(v)}`).join(';')}}`);
  if (t.buttons.style === 'outline') {
    lines.push('.tc-button{background:transparent;color:var(--tc-color-primary);border-color:var(--tc-color-primary)}');
  }
  if (t.customCss) lines.push(t.customCss.replace(/<\/style/gi, '<\\/style'));
  return lines.join('\n');
}

// ---------- Contrast (WCAG 2.x) ----------

export function parseColor(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance([r, g, b]) {
  const ch = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG contrast ratio, or null if either colour is not a hex colour. */
export function contrastRatio(a, b) {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Colour pairs in the theme that must meet WCAG AA contrast. */
export const THEME_CONTRAST_PAIRS = [
  ['text', 'background', 4.5, 'Body text on page background'],
  ['muted', 'background', 4.5, 'Secondary text on page background'],
  ['text', 'surface', 4.5, 'Body text on panels'],
  ['link', 'background', 4.5, 'Links on page background'],
  ['onPrimary', 'primary', 4.5, 'Button text on primary colour'],
  ['primary', 'background', 3, 'Primary colour (outlines, icons) on background'],
  ['focus', 'background', 3, 'Focus indicator on background'],
];

export function themeContrastIssues(theme) {
  const t = normalizeTheme(theme);
  const issues = [];
  for (const [fg, bg, min, label] of THEME_CONTRAST_PAIRS) {
    const ratio = contrastRatio(t.colors[fg], t.colors[bg]);
    if (ratio !== null && ratio < min) {
      issues.push({ level: 'warning', code: 'contrast', field: `colors.${fg}`, message: `${label}: contrast ${ratio}:1 is below ${min}:1.`, ratio, min });
    }
  }
  return issues;
}
