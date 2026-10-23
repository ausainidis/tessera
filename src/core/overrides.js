// Per-block design overrides. Overrides are explicit, listed in block.overrides,
// shown in the editor with a "reset" control, and rendered as CSS custom properties
// on the block wrapper so they only affect that block.

export const OVERRIDE_FIELDS = [
  { key: 'width', label: 'Width', type: 'select', options: [['content', 'Content'], ['wide', 'Wide'], ['full', 'Full width']] },
  { key: 'align', label: 'Text alignment', type: 'select', options: [['left', 'Left'], ['center', 'Centre']] },
  { key: 'background', label: 'Background colour', type: 'color' },
  { key: 'textColor', label: 'Text colour', type: 'color' },
  { key: 'paddingTop', label: 'Space above (px)', type: 'number', min: 0, max: 400 },
  { key: 'paddingBottom', label: 'Space below (px)', type: 'number', min: 0, max: 400 },
  { key: 'radius', label: 'Corner radius (px)', type: 'number', min: 0, max: 64 },
];

const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;

/** Remove unknown keys and invalid values. */
export function cleanOverrides(overrides) {
  const out = {};
  for (const f of OVERRIDE_FIELDS) {
    const v = overrides?.[f.key];
    if (v === undefined || v === null || v === '') continue;
    if (f.type === 'color' && HEX.test(v)) out[f.key] = v;
    if (f.type === 'number' && Number.isFinite(Number(v))) out[f.key] = Math.min(f.max, Math.max(f.min, Number(v)));
    if (f.type === 'select' && f.options.some(([o]) => o === v)) out[f.key] = v;
  }
  return out;
}

/** Inline style declarations and extra classes for the block wrapper. */
export function overridePresentation(overrides) {
  const o = cleanOverrides(overrides);
  const style = [];
  const classes = [];
  if (o.background) { style.push(`--tc-block-bg:${o.background}`); classes.push('tc-has-bg'); }
  if (o.textColor) style.push(`--tc-block-color:${o.textColor}`);
  if (o.paddingTop !== undefined) style.push(`--tc-block-pt:${o.paddingTop}px`);
  if (o.paddingBottom !== undefined) style.push(`--tc-block-pb:${o.paddingBottom}px`);
  if (o.radius !== undefined) style.push(`--tc-block-radius:${o.radius}px`);
  if (o.align) classes.push(`tc-align-${o.align}`);
  return { style: style.join(';'), classes, width: o.width || null };
}
