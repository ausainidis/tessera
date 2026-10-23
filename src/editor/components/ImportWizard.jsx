import { useState } from 'react';
import { useEditor } from '../store.js';
import { call } from '../api.js';
import { Dialog, Badge } from './ui.jsx';

const STATUS = {
  editable: ['ok', 'Editable'],
  'display-only': ['neutral', 'Display only'],
  'retained-display': ['warn', 'Retained (shown as original)'],
  'retained-placeholder': ['warn', 'Retained (placeholder)'],
};

/** Compatibility report shown before any conversion happens. */
export default function ImportWizard({ analysis, onClose }) {
  const { run, loadSession } = useEditor();
  const r = analysis.report;
  const recommended = r.strategies.find((s) => s.recommended) || r.strategies[0];
  const [strategy, setStrategy] = useState(recommended?.id || null);
  const [busy, setBusy] = useState(false);
  const detail = strategy ? r.byStrategy[strategy] : null;

  const cancel = async () => {
    await call('import:cancel', analysis.analysisId).catch(() => {});
    onClose();
  };
  const go = async () => {
    setBusy(true);
    const result = await run(() => call('import:run', analysis.analysisId, strategy));
    setBusy(false);
    if (result) {
      loadSession(result);
      onClose();
    }
  };

  return (
    <Dialog wide title="Import compatibility report" onClose={cancel}
      actions={[
        { label: 'Cancel', onClick: cancel },
        ...(r.strategies.length ? [{ label: busy ? 'Importing…' : strategy === 'open' ? 'Open project' : 'Choose destination and import…', primary: true, disabled: busy || !strategy, onClick: go }] : []),
      ]}>
      <section className="report">
        <dl className="kv">
          <dt>Source</dt><dd>{r.source.path}</dd>
          <dt>Detected</dt><dd><strong>{r.source.label}</strong>{r.source.variant ? ` (${r.source.variant}${r.source.validatedVariant === false ? ', unvalidated variant' : ''})` : ''}</dd>
          <dt>Evidence</dt><dd><ul className="tight">{r.source.evidence.map((e) => <li key={e}>{e}</li>)}</ul></dd>
          <dt>Files</dt><dd>{r.source.fileCount}</dd>
        </dl>
        {r.error && <p className="alert alert--error">{r.error}</p>}
        {r.notes.map((n) => <p key={n} className="alert">{n}</p>)}

        {r.strategies.length > 0 ? (
          <fieldset className="strategies">
            <legend>How should this be imported?</legend>
            {r.strategies.map((s) => (
              <label key={s.id} className={`strategy${strategy === s.id ? ' is-selected' : ''}`}>
                <input type="radio" name="strategy" value={s.id} checked={strategy === s.id} onChange={() => setStrategy(s.id)} />
                <span>
                  <strong>{s.label}</strong>{s.recommended && <> <Badge kind="ok">Recommended</Badge></>}
                  <span className="muted small block">{s.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : <p className="alert alert--error">Tessera cannot import this source. See the notes above.</p>}

        {detail && (
          <>
            <h3>What you will get</h3>
            <div className="stats">
              <div><strong>{detail.summary.lessons}</strong><span>lessons</span></div>
              <div><strong>{detail.summary.blocks}</strong><span>blocks</span></div>
              <div><strong>{detail.summary.editable}</strong><span>editable</span></div>
              <div><strong>{detail.summary.displayOnly}</strong><span>display only</span></div>
              <div><strong>{detail.summary.retained}</strong><span>retained</span></div>
            </div>
            {detail.unsupported.length > 0 && (
              <>
                <h3>Unsupported components (kept, not deleted)</h3>
                <ul className="tight">{detail.unsupported.map((u) => <li key={u.sourceType}><code>{u.sourceType}</code> × {u.count}</li>)}</ul>
              </>
            )}
            <details className="report__lessons">
              <summary>Lessons and blocks ({detail.summary.blocks})</summary>
              {detail.lessons.map((l, i) => (
                <div key={i} className="report__lesson">
                  <h4>{l.title} <span className="muted small">{l.sourceType}</span></h4>
                  <table className="table">
                    <thead><tr><th>Source</th><th>Becomes</th><th>Status</th><th>Editable fields</th></tr></thead>
                    <tbody>
                      {l.blocks.map((b, j) => (
                        <tr key={j}>
                          <td><code>{b.sourceType}</code>{b.validated === false && b.mappedType ? <span className="muted small"> (unvalidated mapping)</span> : null}</td>
                          <td>{b.mappedType || '—'}</td>
                          <td><Badge kind={(STATUS[b.status] || ['neutral'])[0]}>{(STATUS[b.status] || [null, b.status])[1]}</Badge></td>
                          <td className="small">{(b.editableFields || []).join(', ') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </details>
          </>
        )}

        {(r.missingAssets.length > 0 || r.externalDependencies.length > 0 || r.scripts.length > 0 || r.lms.length > 0) && <h3>Dependencies and issues</h3>}
        {r.missingAssets.length > 0 && (
          <details open><summary>Missing files ({r.missingAssets.length})</summary>
            <ul className="tight">{r.missingAssets.map((m, i) => <li key={i}><code>{m.ref}</code> in {m.page}</li>)}</ul>
          </details>
        )}
        {r.externalDependencies.length > 0 && (
          <details><summary>External dependencies — need internet when viewed ({r.externalDependencies.length})</summary>
            <ul className="tight">{r.externalDependencies.map((m, i) => <li key={i}><code>{m.url}</code> ({m.kind}, {m.page})</li>)}</ul>
          </details>
        )}
        {r.scripts.length > 0 && (
          <details><summary>Pages with scripts ({r.scripts.length})</summary>
            <ul className="tight">{r.scripts.map((s) => <li key={s.page}>{s.page}: {s.external} external, {s.inline} inline</li>)}</ul>
          </details>
        )}
        {r.lms.length > 0 && <p className="small">LMS packaging found: {r.lms.join('; ')}</p>}
        <p className="muted small">The original files are copied unchanged into the new project (imports/…/original) and are never edited.</p>
      </section>
    </Dialog>
  );
}
