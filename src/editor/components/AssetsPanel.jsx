import { useMemo, useState } from 'react';
import { useEditor } from '../store.js';
import { blockAssetRefs } from '../../core/blocks/index.js';
import { orderedLessons } from '../../core/model.js';
import { addAssets, updateAsset } from '../../core/operations.js';
import { call, projectUrl, pathForFile, isDesktop } from '../api.js';
import { Badge } from './ui.jsx';

const KINDS = ['all', 'image', 'audio', 'video', 'captions', 'font', 'file'];
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function AssetsPanel() {
  const { state, apply, run, toast, dispatch } = useEditor();
  const { project } = state;
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [dropping, setDropping] = useState(false);

  const usage = useMemo(() => {
    const map = new Map();
    for (const l of orderedLessons(project)) {
      for (const b of l.blocks) for (const id of blockAssetRefs(b)) {
        if (!map.has(id)) map.set(id, []);
        map.get(id).push({ lessonId: l.id, blockId: b.id });
      }
    }
    for (const f of project.theme.typography.fonts) {
      const a = Object.values(project.assets).find((x) => x.path === f.src);
      if (a) map.set(a.id, [...(map.get(a.id) || []), { theme: true }]);
    }
    return map;
  }, [project]);

  const list = Object.values(project.assets)
    .filter((a) => kind === 'all' || a.kind === kind)
    .filter((a) => !q || `${a.originalName} ${a.path}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.missing ? 1 : 0) - (a.missing ? 1 : 0) || (a.originalName || a.path).localeCompare(b.originalName || b.path));
  const missing = Object.values(project.assets).filter((a) => a.missing).length;

  const added = (r) => {
    if (!r) return;
    if (r.added.length) apply((p) => addAssets(p, r.added));
    toast(`${r.added.length} file${r.added.length === 1 ? '' : 's'} added${r.reused.length ? `, ${r.reused.length} already in the project` : ''}.`, 'success');
  };
  const patch = (a, p, message) => {
    if (!p) return;
    apply((s) => updateAsset(s, a.id, { ...p, missing: undefined }));
    if (message) toast(message, 'success');
  };
  const locate = (a) => {
    const uses = usage.get(a.id)?.filter((u) => u.blockId) || [];
    if (!uses.length) { toast('This file is not used in any lesson.'); return; }
    const cur = uses.findIndex((u) => u.blockId === state.selection.blockId);
    const next = uses[(cur + 1) % uses.length];
    dispatch({ type: 'select', selection: next });
  };

  return (
    <div className={`assets${dropping ? ' is-dropping' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true); } }}
      onDragLeave={() => setDropping(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDropping(false);
        const paths = [...e.dataTransfer.files].map(pathForFile).filter(Boolean);
        if (paths.length) added(await run(() => call('assets:importPaths', project.assets, paths)));
      }}>
      <h2 className="panel-title">Assets</h2>
      <div className="row">
        <button type="button" className="btn btn--sm btn--primary" disabled={!isDesktop} onClick={async () => added(await run(() => call('assets:import', project.assets, null)))}>Add files…</button>
        <button type="button" className="btn btn--sm" disabled={!isDesktop} onClick={async () => {
          const ids = await run(() => call('assets:check', project.assets));
          if (!ids) return;
          apply((p) => Object.values(p.assets).reduce((s, a) => updateAsset(s, a.id, { missing: ids.includes(a.id) || undefined }), p));
          toast(ids.length ? `${ids.length} file${ids.length === 1 ? ' is' : 's are'} missing.` : 'All asset files are present.', ids.length ? 'warning' : 'success');
        }}>Check files</button>
      </div>
      <p className="muted small">Drop files here to add them. Files are copied into the project’s assets folder; references use relative paths so the project can be moved.</p>
      {missing > 0 && <p className="alert alert--error">{missing} missing file{missing === 1 ? '' : 's'}. Use “Locate…” to point to the file again.</p>}
      <div className="row">
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by type">{KINDS.map((k) => <option key={k} value={k}>{k === 'all' ? 'All types' : k}</option>)}</select>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search assets" />
      </div>
      <ul className="asset-list">
        {list.map((a) => {
          const uses = usage.get(a.id)?.length || 0;
          return (
            <li key={a.id} className={`asset-row${a.missing ? ' is-missing' : ''}`}>
              <div className="asset-row__thumb">{a.kind === 'image' && !a.missing ? <img src={projectUrl(a.path)} alt="" loading="lazy" /> : <span>{a.kind}</span>}</div>
              <div className="asset-row__info">
                <strong title={a.path}>{a.originalName || a.path.split('/').pop()}</strong>
                <span className="muted small">{a.path} · {a.bytes ? size(a.bytes) : '?'}{a.width ? ` · ${a.width}×${a.height}` : ''}</span>
                <span className="small">
                  {a.missing && <Badge kind="error">Missing</Badge>} {uses ? <Badge>{uses} use{uses === 1 ? '' : 's'}</Badge> : <Badge kind="neutral">Unused</Badge>}
                  {a.optimized && <> <Badge kind="ok" title={`Original kept at ${a.optimized.originalPath}`}>Optimised −{Math.round((1 - a.bytes / a.optimized.originalBytes) * 100)}%</Badge></>}
                </span>
                <div className="asset-row__actions">
                  <button type="button" className="link" onClick={() => locate(a)}>Show usage</button>
                  {a.missing
                    ? <button type="button" className="link" onClick={async () => patch(a, await run(() => call('assets:relink', a)), 'File located and copied into the project.')}>Locate…</button>
                    : <button type="button" className="link" onClick={async () => patch(a, await run(() => call('assets:replace', a)), 'File replaced. Every block using it now shows the new file.')}>Replace…</button>}
                  {a.kind === 'image' && !a.missing && !/\.(svg|gif)$/i.test(a.path) && (a.optimized
                    ? <button type="button" className="link" onClick={async () => patch(a, await run(() => call('assets:revertOptimize', a)), 'Using the original image again.')}>Use original</button>
                    : <button type="button" className="link" onClick={async () => {
                      const r = await run(() => call('assets:optimize', a, { maxWidth: 1920, quality: 82 }));
                      if (!r) return;
                      if (!r.patch) toast(r.message);
                      else patch(a, r.patch, `Optimised copy created (saved ${size(r.saved)}). The original file is kept.`);
                    }}>Optimise</button>)}
                  {!a.missing && <button type="button" className="link" onClick={() => run(() => call('assets:reveal', a))}>Show in folder</button>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {list.length === 0 && <p className="muted">No files{kind !== 'all' || q ? ' match' : ' yet'}.</p>}
    </div>
  );
}
