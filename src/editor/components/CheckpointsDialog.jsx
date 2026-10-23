import { useEffect, useState } from 'react';
import { useEditor } from '../store.js';
import { call } from '../api.js';
import { Dialog } from './ui.jsx';

export default function CheckpointsDialog({ onClose }) {
  const { state, dispatch, run, toast } = useEditor();
  const [list, setList] = useState([]);
  const [label, setLabel] = useState('');
  const refresh = () => call('checkpoint:list').then(setList).catch(() => setList([]));
  useEffect(() => { refresh(); }, []);

  const create = async (e) => {
    e.preventDefault();
    const c = await run(() => call('checkpoint:create', label.trim() || 'Checkpoint', state.project));
    if (c) {
      toast(`Checkpoint “${c.label}” created.`, 'success');
      setLabel('');
      refresh();
    }
  };

  return (
    <Dialog title="Checkpoints" onClose={onClose} actions={[{ label: 'Close', onClick: onClose }]}>
      <p className="muted small">A checkpoint is a named snapshot of the whole course, stored inside the project (.tessera/checkpoints). Restoring one loads it as unsaved changes, so you can still undo.</p>
      <form className="row" onSubmit={create}>
        <input className="input" data-autofocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Before reviewer feedback" aria-label="Checkpoint name" />
        <button type="submit" className="btn btn--primary">Create checkpoint</button>
      </form>
      {list.length === 0 ? <p className="muted">No checkpoints yet.</p> : (
        <ul className="checkpoints">
          {list.map((c) => (
            <li key={c.id}>
              <span><strong>{c.label}</strong><span className="muted small block">{new Date(c.created).toLocaleString()}</span></span>
              <span className="row">
                <button type="button" className="btn btn--sm" onClick={async () => { const p = await run(() => call('checkpoint:restore', c.id)); if (p) { dispatch({ type: 'replaceProject', project: p }); toast(`Restored “${c.label}”. Save to keep it, or undo.`, 'success'); onClose(); } }}>Restore</button>
                <button type="button" className="btn btn--sm" onClick={async () => { await run(() => call('checkpoint:delete', c.id)); refresh(); }} aria-label={`Delete checkpoint ${c.label}`}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
