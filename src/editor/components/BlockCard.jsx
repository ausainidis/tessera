import { useState } from 'react';
import { useEditor } from '../store.js';
import { getBlockDef } from '../../core/blocks/index.js';
import {
  updateBlockContent, updateBlockSettings, setBlockOverride, resetBlockOverrides,
  duplicateBlock, deleteBlock, capabilities, editableFields,
} from '../../core/operations.js';
import { OVERRIDE_FIELDS, cleanOverrides } from '../../core/overrides.js';
import { FieldEditor, isVisible } from './fields.jsx';
import { IconButton, Badge } from './ui.jsx';

function Overrides({ block, lesson }) {
  const { apply, state } = useEditor();
  const o = cleanOverrides(block.overrides);
  const theme = state.project.theme;
  const themeValue = { background: theme.colors.background, textColor: theme.colors.text, width: 'content', align: 'left', paddingTop: 0, paddingBottom: 0, radius: theme.borders.radius };
  const set = (key, value) => apply((p) => setBlockOverride(p, lesson.id, block.id, key, value), { key: `ovr-${block.id}-${key}` });
  return (
    <div className="overrides">
      <p className="muted small">By default every block follows the course theme. Overrides apply to this block only and are listed here so they can be reset.</p>
      {OVERRIDE_FIELDS.map((f) => {
        const active = o[f.key] !== undefined;
        return (
          <div key={f.key} className={`override${active ? ' is-active' : ''}`}>
            <FieldEditor field={f} value={active ? o[f.key] : themeValue[f.key]} onChange={(v) => set(f.key, v)} />
            {active ? (
              <span className="override__state"><Badge kind="warn">Overridden</Badge> <button type="button" className="link" onClick={() => set(f.key, undefined)}>Reset to theme</button></span>
            ) : <span className="override__state muted small">Theme value</span>}
          </div>
        );
      })}
      {Object.keys(o).length > 0 && <button type="button" className="btn btn--sm" onClick={() => apply((p) => resetBlockOverrides(p, lesson.id, block.id))}>Reset all overrides</button>}
    </div>
  );
}

export default function BlockCard({ block, lesson, index, count, selected, issues, onSelect, onMove, dragProps }) {
  const { state, apply, toast, dispatch } = useEditor();
  const caps = capabilities(state.project);
  const def = getBlockDef(block.type);
  const [view, setView] = useState('content');
  const editable = new Set(editableFields(block));
  const fixed = new Set(block.source?.fixed || []);
  const summary = def?.text ? def.text(block).slice(0, 110) : '';
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.filter((i) => i.level === 'warning').length;
  const overridden = Object.keys(cleanOverrides(block.overrides)).length;
  const bound = !!block.source;

  const onKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.altKey && e.key === 'ArrowUp' && caps.reorderBlocks) { e.preventDefault(); onMove(index - 1); }
    if (e.altKey && e.key === 'ArrowDown' && caps.reorderBlocks) { e.preventDefault(); onMove(index + 1); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
  };
  const remove = () => {
    apply((p) => deleteBlock(p, lesson.id, block.id), { select: { blockId: null } });
    toast(`${def?.title || 'Block'} deleted. Press Ctrl+Z to undo.`);
  };

  return (
    <article id={`card-${block.id}`} className={`card-block${selected ? ' is-selected' : ''}${block.type === 'retained' ? ' is-retained' : ''}`} aria-label={`${def?.title || block.type} block, ${index + 1} of ${count}`}>
      <div className="card__head" tabIndex={0} role="button" aria-expanded={selected} onClick={onSelect} onKeyDown={onKeyDown}
        title={caps.reorderBlocks ? 'Alt+Up / Alt+Down to move' : undefined}>
        <span className="drag-handle" aria-hidden="true" {...dragProps}>⠿</span>
        <span className="card__icon" aria-hidden="true">{def?.icon || '?'}</span>
        <span className="card__title">
          <strong>{def?.title || `Unknown: ${block.type}`}</strong>
          {summary && <span className="card__summary">{summary}</span>}
        </span>
        <span className="card__badges">
          {bound && <Badge kind="info" title="Imported content: edits are written back to the original source. Some fields are locked.">Imported</Badge>}
          {overridden > 0 && <Badge kind="warn" title="This block overrides theme settings">{overridden} override{overridden === 1 ? '' : 's'}</Badge>}
          {errors > 0 && <Badge kind="error">{errors} error{errors === 1 ? '' : 's'}</Badge>}
          {!errors && warnings > 0 && <Badge kind="warn">{warnings} check{warnings === 1 ? '' : 's'}</Badge>}
        </span>
        <span className="card__actions" onClick={(e) => e.stopPropagation()}>
          <IconButton label="Move block up" onClick={() => onMove(index - 1)} disabled={!caps.reorderBlocks || index === 0}>↑</IconButton>
          <IconButton label="Move block down" onClick={() => onMove(index + 1)} disabled={!caps.reorderBlocks || index === count - 1}>↓</IconButton>
          <IconButton label="Duplicate block" onClick={() => apply((p) => { const [s, id] = duplicateBlock(p, lesson.id, block.id); return { project: s, select: { blockId: id } }; })} disabled={!caps.duplicateBlocks || block.type === 'retained'}>⧉</IconButton>
          <IconButton label="Delete block" onClick={remove} disabled={!caps.deleteBlocks}>🗑</IconButton>
        </span>
      </div>

      {selected && def && (
        <div className="card__body">
          {block.type !== 'retained' && !bound && (
            <div className="segmented" role="tablist" aria-label="Block settings">
              <button type="button" role="tab" aria-selected={view === 'content'} onClick={() => setView('content')}>Content</button>
              <button type="button" role="tab" aria-selected={view === 'design'} onClick={() => setView('design')}>Design{overridden ? ` (${overridden})` : ''}</button>
            </div>
          )}
          {view === 'content' || bound ? (
            <div className="fields">
              {bound && <p className="muted small">Imported from {block.source.adapter === 'rise' ? 'Rise' : 'HTML'}. Editable here: {[...editable].join(', ') || 'nothing (preserved as-is)'}.</p>}
              {def.fields.filter((f) => isVisible(f, block.content)).map((f) => (
                <FieldEditor key={f.key} field={f} value={block.content[f.key]} blockId={block.id}
                  disabled={!editable.has(f.key)} fixedLength={fixed.has(f.key)}
                  onChange={(v) => apply((p) => updateBlockContent(p, lesson.id, block.id, { [f.key]: v }), { key: `${block.id}-${f.key}` })} />
              ))}
              {!bound && (def.settings || []).map((f) => (
                <FieldEditor key={f.key} field={f} value={block.settings[f.key]}
                  onChange={(v) => apply((p) => updateBlockSettings(p, lesson.id, block.id, { [f.key]: v }), { key: `${block.id}-s-${f.key}` })} />
              ))}
              {block.type === 'retained' && block.content.raw && <details><summary>Original data (read-only)</summary><pre className="code">{JSON.stringify(block.content.raw, null, 2).slice(0, 4000)}</pre></details>}
              {block.type === 'retained' && block.content.html && <details><summary>Original HTML (read-only)</summary><pre className="code">{block.content.html.slice(0, 4000)}</pre></details>}
            </div>
          ) : <Overrides block={block} lesson={lesson} />}
          {issues.length > 0 && (
            <ul className="issues issues--inline" aria-label="Checks for this block">
              {issues.map((i, n) => <li key={n} className={`issue issue--${i.level}`}>{i.message}</li>)}
            </ul>
          )}
          <button type="button" className="link small" onClick={() => dispatch({ type: 'select', selection: { blockId: null } })}>Done</button>
        </div>
      )}
    </article>
  );
}
