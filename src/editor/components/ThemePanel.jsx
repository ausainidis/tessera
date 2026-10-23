import { useState } from 'react';
import { useEditor } from '../store.js';
import { setThemeValue, replaceTheme, addAssets, setStyleMapping, capabilities } from '../../core/operations.js';
import { themeContrastIssues, contrastRatio, defaultTheme, FONT_STACKS } from '../../core/theme.js';
import { allBlockDefs } from '../../core/blocks/index.js';
import { call, isDesktop } from '../api.js';
import { FieldEditor } from './fields.jsx';
import { Dialog } from './ui.jsx';

const COLORS = [
  ['primary', 'Primary (buttons, accents)'], ['onPrimary', 'Text on primary'], ['text', 'Body text'], ['muted', 'Secondary text'],
  ['background', 'Page background'], ['surface', 'Panels'], ['border', 'Borders'], ['accent', 'Accent'],
  ['link', 'Links'], ['focus', 'Keyboard focus'], ['success', 'Correct / success'], ['error', 'Incorrect / error'],
];

function Section({ title, children, open = false }) {
  return <details className="theme-sec" open={open}><summary>{title}</summary><div className="theme-sec__body">{children}</div></details>;
}

export default function ThemePanel() {
  const { state, apply, run, toast } = useEditor();
  const { project } = state;
  const t = project.theme;
  const caps = capabilities(project);
  const [confirmReset, setConfirmReset] = useState(false);
  const set = (path, value) => apply((p) => setThemeValue(p, path, value), { key: `theme-${path}` });
  const contrast = themeContrastIssues(t);
  const fontOptions = [['system', 'System sans-serif'], ['serif', 'Serif'], ['mono', 'Monospace'], ...[...new Set(t.typography.fonts.map((f) => f.family))].map((f) => [f, f])];
  const num = (path, label, min, max, step = 1) => {
    const value = path.split('.').reduce((o, k) => o?.[k], t);
    return <FieldEditor field={{ key: path, label, type: 'number', min, max, step }} value={value} onChange={(v) => set(path, v ?? min)} />;
  };

  if (!caps.editTheme) {
    return (
      <div>
        <h2 className="panel-title">Theme</h2>
        <p className="muted">This preserved import keeps its original appearance. Theme settings apply to Tessera courses; convert the import to use them.</p>
      </div>
    );
  }

  return (
    <div className="theme-panel">
      <h2 className="panel-title">Theme</h2>
      <label className="field"><span className="field__label">Theme name</span><input className="input" value={t.name} onChange={(e) => set('name', e.target.value)} /></label>
      <div className="row wrap">
        <button type="button" className="btn btn--sm" disabled={!isDesktop} onClick={async () => { const pth = await run(() => call('theme:export', t)); if (pth) toast(`Theme exported to ${pth}`, 'success'); }}>Export…</button>
        <button type="button" className="btn btn--sm" disabled={!isDesktop} onClick={async () => {
          const r = await run(() => call('theme:import'));
          if (!r) return;
          apply((p) => replaceTheme(addAssets(p, r.assets), r.theme, { keepId: false }));
          toast(`Theme “${r.theme.name}” applied. Undo to go back.`, 'success');
        }}>Import…</button>
        <button type="button" className="btn btn--sm" onClick={() => setConfirmReset(true)}>Reset to default</button>
      </div>
      {contrast.length > 0 ? (
        <ul className="issues">{contrast.map((c) => <li key={c.field} className="issue issue--warning">{c.message}</li>)}</ul>
      ) : <p className="ok small">✓ All theme colour pairs meet WCAG AA contrast.</p>}

      <Section title="Colours" open>
        {COLORS.map(([k, label]) => (
          <div key={k} className="color-row">
            <FieldEditor field={{ key: k, label, type: 'color' }} value={t.colors[k]} onChange={(v) => set(`colors.${k}`, v)} />
            {['text', 'muted', 'link'].includes(k) && <span className="small muted">{contrastRatio(t.colors[k], t.colors.background)}:1</span>}
            {k === 'onPrimary' && <span className="small muted">{contrastRatio(t.colors.onPrimary, t.colors.primary)}:1</span>}
          </div>
        ))}
      </Section>

      <Section title="Typography">
        <FieldEditor field={{ key: 'bodyFont', label: 'Body font', type: 'select', options: fontOptions }} value={t.typography.bodyFont} onChange={(v) => set('typography.bodyFont', v)} />
        <FieldEditor field={{ key: 'headingFont', label: 'Heading font', type: 'select', options: fontOptions }} value={t.typography.headingFont} onChange={(v) => set('typography.headingFont', v)} />
        {num('typography.baseSize', 'Base size (px)', 12, 28)}
        {num('typography.lineHeight', 'Line height', 1, 2.4, 0.05)}
        {num('typography.scale', 'Heading scale', 1, 1.6, 0.01)}
        {num('typography.headingWeight', 'Heading weight', 300, 900, 100)}
        <h4>Font files</h4>
        <p className="muted small">Fonts are stored in the project, so courses look the same offline. Check the font licence allows embedding.</p>
        <ul className="tight">
          {t.typography.fonts.map((f, i) => (
            <li key={i} className="font-row">
              <input className="input" aria-label="Font family name" value={f.family} onChange={(e) => set('typography.fonts', t.typography.fonts.map((x, n) => (n === i ? { ...x, family: e.target.value } : x)))} />
              <select className="input" aria-label="Weight" value={f.weight} onChange={(e) => set('typography.fonts', t.typography.fonts.map((x, n) => (n === i ? { ...x, weight: e.target.value } : x)))}>
                {['300', '400', '500', '600', '700', '800'].map((w) => <option key={w}>{w}</option>)}
              </select>
              <select className="input" aria-label="Style" value={f.style} onChange={(e) => set('typography.fonts', t.typography.fonts.map((x, n) => (n === i ? { ...x, style: e.target.value } : x)))}>
                <option>normal</option><option>italic</option>
              </select>
              <button type="button" className="icon-btn" aria-label={`Remove font ${f.family}`} onClick={() => set('typography.fonts', t.typography.fonts.filter((_, n) => n !== i))}>✕</button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn--sm" disabled={!isDesktop} onClick={async () => {
          const r = await run(() => call('font:import', project.assets));
          const e = r && (r.added[0] || r.reused[0]);
          if (!e) return;
          const family = (e.originalName || 'Custom font').replace(/\.[^.]*$/, '').replace(/[-_](regular|bold|italic|light|medium|semibold|black)$/i, '');
          apply((p) => setThemeValue(addAssets(p, r.added), 'typography.fonts', [...p.theme.typography.fonts, { family, src: e.path, weight: /bold/i.test(e.originalName) ? '700' : '400', style: /italic/i.test(e.originalName) ? 'italic' : 'normal' }]));
        }}>Add font file…</button>
      </Section>

      <Section title="Spacing and widths">
        {num('spacing.blockGap', 'Space between blocks (px)', 0, 160)}
        {num('spacing.unit', 'Spacing unit (px)', 2, 24)}
        {num('layout.contentWidth', 'Content width (px)', 480, 1200)}
        {num('layout.wideWidth', 'Wide width (px)', 600, 1800)}
      </Section>

      <Section title="Borders and buttons">
        {num('borders.radius', 'Corner radius (px)', 0, 40)}
        {num('borders.width', 'Border width (px)', 0, 6)}
        <FieldEditor field={{ key: 'style', label: 'Button style', type: 'select', options: [['filled', 'Filled'], ['outline', 'Outline']] }} value={t.buttons.style} onChange={(v) => set('buttons.style', v)} />
        {num('buttons.radius', 'Button radius (px)', 0, 40)}
        <FieldEditor field={{ key: 'uppercase', label: 'Uppercase button text', type: 'boolean' }} value={t.buttons.uppercase} onChange={(v) => set('buttons.uppercase', v)} />
      </Section>

      <Section title="Custom CSS (advanced)">
        <p className="muted small">Added after the theme. Use the --tc-* variables to stay consistent, e.g. <code>.tc-note {'{'} border-color: var(--tc-color-primary) {'}'}</code>.</p>
        <textarea className="input code" rows={8} spellCheck={false} value={t.customCss} onChange={(e) => set('customCss', e.target.value)} aria-label="Custom CSS" />
      </Section>

      <Section title={`Imported stylesheets and style map${project.manifest.stylesheets.length ? ` (${project.manifest.stylesheets.length})` : ''}`} open={project.manifest.stylesheets.length > 0}>
        {project.manifest.stylesheets.length ? (
          <>
            <p className="small">These stylesheets from an imported site are loaded after the theme:</p>
            <ul className="tight">{project.manifest.stylesheets.map((s) => <li key={s}><code>{s}</code></li>)}</ul>
          </>
        ) : <p className="muted small">No imported stylesheets.</p>}
        <p className="muted small">Map Tessera block types to CSS classes from the imported design. The class is added to every block of that type, so new blocks match the original design. Loading a stylesheet alone does not do this.</p>
        <table className="table table--compact">
          <thead><tr><th>Block</th><th>CSS class(es)</th></tr></thead>
          <tbody>
            {allBlockDefs().filter((d) => d.insertable !== false).map((d) => (
              <tr key={d.type}>
                <td>{d.title}</td>
                <td><input className="input input--sm" aria-label={`CSS class for ${d.title}`} value={project.manifest.styleMap[d.type]?.className || ''} onChange={(e) => apply((p) => setStyleMapping(p, d.type, e.target.value), { key: `stylemap-${d.type}` })} placeholder="e.g. lead" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {confirmReset && (
        <Dialog title="Reset theme?" onClose={() => setConfirmReset(false)}
          actions={[{ label: 'Cancel', onClick: () => setConfirmReset(false) }, { label: 'Reset', danger: true, onClick: () => { apply((p) => replaceTheme(p, { ...defaultTheme(), name: p.theme.name })); setConfirmReset(false); } }]}>
          <p>All colours, fonts and sizes return to Tessera defaults. Block overrides are kept. You can undo this.</p>
        </Dialog>
      )}
      <p className="muted small">Stacks: {Object.keys(FONT_STACKS).join(', ')} use fonts installed on the learner’s device.</p>
    </div>
  );
}
