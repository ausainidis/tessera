// Generic field editors. Block definitions declare their fields (docs/BLOCK_INTERFACE.md);
// the editor builds its controls from those declarations, so new block types get an
// accessible editing UI without writing UI code.

import { useEffect, useId, useRef, useState } from 'react';
import { useEditor } from '../store.js';
import { sanitizeRichText, sanitizeInline } from '../../core/richtext.js';
import { newId } from '../../core/ids.js';
import { orderedLessons } from '../../core/model.js';
import { addAssets } from '../../core/operations.js';
import { call, projectUrl } from '../api.js';
import { Dialog, IconButton } from './ui.jsx';

export function isVisible(field, content) {
  const c = field.showIf;
  if (!c) return true;
  const v = content?.[c.key];
  if ('equals' in c) return v === c.equals || String(v) === String(c.equals);
  if (c.truthy) return !!v;
  if (c.falsy) return !v;
  return true;
}

// ---------- Rich text ----------

function LinkPopover({ onApply, onCancel }) {
  const [url, setUrl] = useState('https://');
  return (
    <div className="popover" role="dialog" aria-label="Insert link">
      <label className="field"><span className="field__label">Link address</span>
        <input className="input" autoFocus value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onApply(url); } if (e.key === 'Escape') onCancel(); }} /></label>
      <div className="row"><button type="button" className="btn btn--sm btn--primary" onClick={() => onApply(url)}>Apply</button><button type="button" className="btn btn--sm" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

export function RichTextField({ label, value, onChange, inline = false, disabled = false, compact = false, help }) {
  const ref = useRef(null);
  const id = useId();
  const savedRange = useRef(null);
  const [linking, setLinking] = useState(false);
  const clean = inline ? sanitizeInline : sanitizeRichText;

  // Uncontrolled editing: only rewrite the DOM when the value changes from outside
  // (undo, another field), never while the author is typing in it.
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && clean(el.innerHTML) !== (value || '')) el.innerHTML = value || '';
  }, [value, clean]);

  const emit = () => {
    const next = clean(ref.current.innerHTML);
    if (next !== (value || '')) onChange(next);
  };
  const exec = (cmd, arg) => {
    ref.current.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };
  const keepSelection = () => {
    const sel = window.getSelection();
    if (sel.rangeCount) savedRange.current = sel.getRangeAt(0).cloneRange();
  };
  const applyLink = (url) => {
    setLinking(false);
    ref.current.focus();
    if (savedRange.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    if (url && url !== 'https://') document.execCommand('createLink', false, url);
    emit();
  };

  return (
    <div className={`field rte${compact ? ' rte--compact' : ''}${disabled ? ' is-disabled' : ''}`}>
      <span className="field__label" id={`${id}-l`}>{label}</span>
      {!disabled && (
        <div className="rte__bar" role="toolbar" aria-label={`${label} formatting`} onMouseDown={(e) => e.preventDefault()}>
          <button type="button" onClick={() => exec('bold')} aria-label="Bold" title="Bold (Ctrl+B)"><b>B</b></button>
          <button type="button" onClick={() => exec('italic')} aria-label="Italic" title="Italic (Ctrl+I)"><i>I</i></button>
          <button type="button" onClick={() => { keepSelection(); setLinking(true); }} aria-label="Link" title="Link">🔗</button>
          <button type="button" onClick={() => exec('unlink')} aria-label="Remove link" title="Remove link">⛓̸</button>
          {!inline && <button type="button" onClick={() => exec('insertUnorderedList')} aria-label="Bulleted list" title="Bulleted list">•≡</button>}
          {!inline && <button type="button" onClick={() => exec('insertOrderedList')} aria-label="Numbered list" title="Numbered list">1≡</button>}
          <button type="button" onClick={() => exec('removeFormat')} aria-label="Clear formatting" title="Clear formatting">⌫</button>
        </div>
      )}
      {linking && <LinkPopover onApply={applyLink} onCancel={() => setLinking(false)} />}
      <div ref={ref} className={`rte__area${inline ? ' rte__area--inline' : ''}`} role="textbox" aria-multiline={!inline} aria-labelledby={`${id}-l`}
        aria-describedby={help ? `${id}-h` : undefined} aria-readonly={disabled}
        contentEditable={!disabled} suppressContentEditableWarning tabIndex={disabled ? -1 : 0}
        onInput={emit} onBlur={() => { if (ref.current) ref.current.innerHTML = clean(ref.current.innerHTML); }}
        onPaste={(e) => {
          e.preventDefault();
          const html = e.clipboardData.getData('text/html');
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertHTML', false, html ? (inline ? sanitizeInline(html) : sanitizeRichText(html)) : text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(/\n/g, '<br>'));
          emit();
        }}
        onKeyDown={(e) => { if (inline && e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); } }} />
      {help && <span className="field__help" id={`${id}-h`}>{help}</span>}
    </div>
  );
}

// ---------- Assets ----------

const ACCEPT_KIND = { image: 'image', audio: 'audio', video: 'video', captions: 'captions', file: null, font: 'font' };

function AssetChooser({ accept, onPick, onClose }) {
  const { state, apply, run } = useEditor();
  const kind = ACCEPT_KIND[accept];
  const list = Object.values(state.project.assets).filter((a) => !kind || a.kind === kind).sort((a, b) => (a.originalName || a.path).localeCompare(b.originalName || b.path));
  const addNew = async () => {
    const r = await run(() => call('assets:import', state.project.assets, accept === 'file' ? null : accept));
    if (!r) return;
    if (r.added.length) apply((p) => addAssets(p, r.added));
    const first = r.added[0] || r.reused[0];
    if (first) onPick(first.id);
  };
  return (
    <Dialog title={`Choose ${accept === 'file' ? 'a file' : `an ${accept === 'image' ? 'image' : accept}`}`} onClose={onClose} wide
      actions={[{ label: 'Add a new file…', primary: true, onClick: addNew }, { label: 'Cancel', onClick: onClose }]}>
      {list.length === 0 ? <p className="muted">No matching files in this project yet.</p> : (
        <div className="asset-grid">
          {list.map((a) => (
            <button key={a.id} type="button" className={`asset-tile${a.missing ? ' is-missing' : ''}`} onClick={() => onPick(a.id)}>
              {a.kind === 'image' && !a.missing ? <img src={projectUrl(a.path)} alt="" /> : <span className="asset-tile__kind">{a.kind}</span>}
              <span className="asset-tile__name">{a.originalName || a.path.split('/').pop()}</span>
              {a.missing && <span className="badge badge--error">Missing</span>}
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function AssetField({ field, value, onChange, disabled }) {
  const { state } = useEditor();
  const [choosing, setChoosing] = useState(false);
  const a = value ? state.project.assets[value] : null;
  return (
    <div className="field">
      <span className="field__label">{field.label}</span>
      <div className="asset-field">
        {a ? (
          <>
            {a.kind === 'image' && !a.missing ? <img className="asset-field__thumb" src={projectUrl(a.path)} alt="" /> : <span className="asset-field__kind">{a.kind}</span>}
            <span className="asset-field__name">{a.originalName || a.path}{a.missing && <span className="badge badge--error">Missing file</span>}</span>
          </>
        ) : <span className="muted">{value ? 'Unknown asset' : 'None selected'}</span>}
        {!disabled && <button type="button" className="btn btn--sm" onClick={() => setChoosing(true)}>{a ? 'Change…' : 'Choose…'}</button>}
        {!disabled && value && <button type="button" className="btn btn--sm" onClick={() => onChange(null)}>Remove</button>}
      </div>
      {field.help && <span className="field__help">{field.help}</span>}
      {choosing && <AssetChooser accept={field.accept || 'file'} onClose={() => setChoosing(false)} onPick={(id) => { onChange(id); setChoosing(false); }} />}
    </div>
  );
}

// ---------- Lists and choices ----------

function blankItem(field) {
  const item = { id: newId(field.type === 'choices' ? 'chc' : 'itm') };
  for (const f of field.itemFields || []) item[f.key] = f.type === 'boolean' ? false : f.type === 'asset' ? null : '';
  return item;
}

function ListField({ field, value, onChange, disabled, fixedLength }) {
  const items = Array.isArray(value) ? value : [];
  const canStructure = !disabled && !fixedLength;
  const set = (i, patch) => onChange(items.map((it, n) => (n === i ? { ...it, ...patch } : it)));
  const move = (i, to) => {
    if (to < 0 || to >= items.length) return;
    const next = items.slice();
    const [x] = next.splice(i, 1);
    next.splice(to, 0, x);
    onChange(next);
  };
  return (
    <fieldset className="list-field" disabled={disabled}>
      <legend className="field__label">{field.label}</legend>
      {items.map((item, i) => (
        <div key={item.id || i} className="list-field__item">
          <div className="list-field__head">
            <span className="small muted">{field.itemLabel || (field.type === 'choices' ? 'Answer' : 'Item')} {i + 1}</span>
            {canStructure && (
              <span>
                <IconButton label={`Move ${field.itemLabel || 'item'} ${i + 1} up`} onClick={() => move(i, i - 1)} disabled={i === 0}>↑</IconButton>
                <IconButton label={`Move ${field.itemLabel || 'item'} ${i + 1} down`} onClick={() => move(i, i + 1)} disabled={i === items.length - 1}>↓</IconButton>
                <IconButton label={`Remove ${field.itemLabel || 'item'} ${i + 1}`} onClick={() => onChange(items.filter((_, n) => n !== i))} disabled={field.min && items.length <= field.min}>✕</IconButton>
              </span>
            )}
          </div>
          {field.itemFields.map((f) => (
            <FieldEditor key={f.key} field={f} value={item[f.key]} disabled={disabled} onChange={(v) => set(i, { [f.key]: v })} />
          ))}
        </div>
      ))}
      {canStructure && (!field.max || items.length < field.max) && (
        <button type="button" className="btn btn--sm" onClick={() => onChange([...items, blankItem(field)])}>+ Add {(field.itemLabel || (field.type === 'choices' ? 'answer' : 'item')).toLowerCase()}</button>
      )}
      {fixedLength && !disabled && <p className="muted small">Items can be edited but not added, removed or reordered in this imported block.</p>}
    </fieldset>
  );
}

// ---------- Component entry point ----------

function EntryField({ field, value, onChange, disabled }) {
  const { run } = useEditor();
  return (
    <div className="field">
      <label className="field__label" htmlFor="entry-path">{field.label}</label>
      <input id="entry-path" className="input" value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder="components/my-widget/index.html" />
      {!disabled && (
        <div className="row">
          <button type="button" className="btn btn--sm" onClick={async () => { const p = await run(() => call('component:create', 'New component')); if (p) onChange(p); }}>Create a new component…</button>
          <button type="button" className="btn btn--sm" onClick={async () => { const p = await run(() => call('component:importFolder')); if (p) onChange(p); }}>Import a built web project…</button>
        </div>
      )}
      <span className="field__help">{field.help} Components run in an isolated frame and talk to the course only through messages (docs/COMPONENTS.md).</span>
    </div>
  );
}

// ---------- Dispatcher ----------

export function FieldEditor({ field, value, onChange, disabled = false, fixedLength = false }) {
  const id = useId();
  const { state } = useEditor();
  const help = field.help ? <span className="field__help" id={`${id}-h`}>{field.help}</span> : null;
  const describedBy = field.help ? `${id}-h` : undefined;
  switch (field.type) {
    case 'richtext':
      return <RichTextField label={field.label} value={value} onChange={onChange} disabled={disabled} help={field.help} />;
    case 'inline':
      return <RichTextField label={field.label} value={value} onChange={onChange} disabled={disabled} inline compact help={field.help} />;
    case 'textarea':
      return <label className="field"><span className="field__label">{field.label}</span><textarea className="input" rows={4} value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} />{help}</label>;
    case 'json': {
      let valid = true;
      try { JSON.parse(value || '{}'); } catch { valid = false; }
      return <label className="field"><span className="field__label">{field.label}</span><textarea className={`input code${valid ? '' : ' is-invalid'}`} rows={5} spellCheck={false} value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-invalid={!valid} />{!valid && <span className="field__error">Not valid JSON.</span>}{help}</label>;
    }
    case 'number':
      return <label className="field field--inline"><span className="field__label">{field.label}</span><input className="input input--num" type="number" min={field.min} max={field.max} step={field.step ?? 'any'} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} aria-describedby={describedBy} />{help}</label>;
    case 'select':
      return (
        <label className="field field--inline"><span className="field__label">{field.label}</span>
          <select className="input" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(typeof value === 'number' ? Number(e.target.value) : e.target.value)} aria-describedby={describedBy}>
            {field.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>{help}</label>
      );
    case 'boolean':
      return <label className="check"><input type="checkbox" checked={!!value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-describedby={describedBy} /> {field.label}{help}</label>;
    case 'color':
      return (
        <div className="field field--inline"><label className="field__label" htmlFor={id}>{field.label}</label>
          <span className="color-field">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000'} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={`${field.label} picker`} />
            <input id={id} className="input input--hex" value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
          </span></div>
      );
    case 'asset':
      return <AssetField field={field} value={value} onChange={onChange} disabled={disabled} />;
    case 'list':
    case 'choices':
      return <ListField field={field} value={value} onChange={onChange} disabled={disabled} fixedLength={fixedLength} />;
    case 'lesson':
      return (
        <label className="field field--inline"><span className="field__label">{field.label}</span>
          <select className="input" value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
            <option value="">Choose a lesson…</option>
            {orderedLessons(state.project).filter((l) => l.kind !== 'section').map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select></label>
      );
    case 'path':
      return <EntryField field={field} value={value} onChange={onChange} disabled={disabled} />;
    case 'readonly':
      return value ? <div className="field"><span className="field__label">{field.label}</span><p className="readonly">{String(value)}</p></div> : null;
    case 'url':
    case 'text':
    default:
      return <label className="field"><span className="field__label">{field.label}{field.required ? ' *' : ''}</span><input className="input" type={field.type === 'url' ? 'url' : 'text'} value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} />{help}</label>;
  }
}
