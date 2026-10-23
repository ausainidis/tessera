import { useEffect, useState } from 'react';
import { useEditor } from '../store.js';
import { call, isDesktop, pathForFile } from '../api.js';

export default function Home() {
  const { run, loadSession, setImporting, toast } = useEditor();
  const [recent, setRecent] = useState([]);
  const [title, setTitle] = useState('');
  const [info, setInfo] = useState(null);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    call('recent:list').then(setRecent).catch(() => {});
    call('app:info').then(setInfo).catch(() => {});
  }, []);

  const create = async (e) => {
    e.preventDefault();
    loadSession(await run(() => call('project:new', title.trim() || 'New course')));
  };
  const open = async () => {
    const r = await run(() => call('project:open'));
    if (r?.needsImport) toast('That folder is not a Tessera project. Choose “Import a folder” to bring it in.', 'warning');
    else loadSession(r);
  };
  const analyze = async (kind) => {
    const r = await run(() => call('import:analyze', kind));
    if (r) setImporting(r);
  };

  return (
    <main className={`home${dropping ? ' is-dropping' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDropping(false); }}
      onDrop={async (e) => {
        e.preventDefault();
        setDropping(false);
        const p = e.dataTransfer.files[0] && pathForFile(e.dataTransfer.files[0]);
        if (!p) return;
        const r = await run(() => call('import:analyzePath', p));
        if (r) setImporting(r);
      }}>
      <header className="home__head">
        <h1>Tessera</h1>
        <p>Create, edit and publish responsive learning content. Your projects are ordinary folders on your computer, and everything works offline.</p>
      </header>
      <div className="home__grid">
        <section className="card" aria-labelledby="new-h">
          <h2 id="new-h">New course</h2>
          <form onSubmit={create} className="stack">
            <label className="field">
              <span className="field__label">Course title</span>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Handling personal data" />
            </label>
            <button type="submit" className="btn btn--primary">Create project folder…</button>
          </form>
        </section>
        <section className="card" aria-labelledby="open-h">
          <h2 id="open-h">Open or import</h2>
          <div className="stack">
            <button type="button" className="btn" onClick={open} disabled={!isDesktop}>Open a Tessera project…</button>
            <button type="button" className="btn" onClick={() => analyze('folder')} disabled={!isDesktop}>Import a folder…</button>
            <button type="button" className="btn" onClick={() => analyze('zip')} disabled={!isDesktop}>Import a ZIP file…</button>
            <p className="muted small">Imports support Rise 360 exports, static HTML sites and compiled web bundles. You will see a compatibility report before anything is converted, and the original is never changed. You can also drop a folder or ZIP file onto this window.</p>
          </div>
        </section>
        <section className="card home__recent" aria-labelledby="recent-h">
          <h2 id="recent-h">Recent projects</h2>
          {recent.length === 0 ? <p className="muted">No recent projects.</p> : (
            <ul className="recent">
              {recent.map((r) => (
                <li key={r.path}>
                  <button type="button" className="recent__open" onClick={async () => loadSession(await run(() => call('project:openPath', r.path)))}>
                    <strong>{r.title || r.path.split(/[\\/]/).pop()}</strong>
                    <span className="muted small">{r.path}</span>
                  </button>
                  <button type="button" className="icon-btn" aria-label={`Remove ${r.title} from recent projects`} title="Remove from list (does not delete files)" onClick={async () => { await call('recent:remove', r.path); setRecent(await call('recent:list')); }}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <footer className="home__foot muted small">
        {info ? `Version ${info.version}${info.electron ? ` · Electron ${info.electron}` : ''}${info.portable ? ' · portable mode (settings stored next to the application)' : ''}` : ''}
        {!isDesktop && ' · Browser development mode: file operations are simulated.'}
      </footer>
    </main>
  );
}
