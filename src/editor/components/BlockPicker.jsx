import { useMemo, useState } from 'react';
import { insertableBlocks, CATEGORY_ORDER } from '../../core/blocks/index.js';
import { Dialog } from './ui.jsx';

export default function BlockPicker({ lessonKind, onPick, onClose }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const defs = insertableBlocks(lessonKind).filter((d) => !q || `${d.title} ${d.description}`.toLowerCase().includes(q.toLowerCase()));
    return CATEGORY_ORDER.map((c) => [c, defs.filter((d) => d.category === c)]).filter(([, list]) => list.length);
  }, [lessonKind, q]);
  return (
    <Dialog title="Add a block" onClose={onClose} wide>
      <label className="field">
        <span className="field__label">Search blocks</span>
        <input className="input" data-autofocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. image, question, tabs" />
      </label>
      {groups.map(([cat, defs]) => (
        <section key={cat} className="picker__group">
          <h3>{cat}</h3>
          <div className="picker__grid">
            {defs.map((d) => (
              <button key={d.type} type="button" className="picker__item" onClick={() => onPick(d.type)}>
                <span className="picker__icon" aria-hidden="true">{d.icon}</span>
                <span><strong>{d.title}</strong><span className="muted small block">{d.description}</span></span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {groups.length === 0 && <p className="muted">No blocks match “{q}”.</p>}
      {lessonKind !== 'assessment' && <p className="muted small">Scored assessment questions are available inside assessment lessons. Knowledge checks are never scored.</p>}
    </Dialog>
  );
}
