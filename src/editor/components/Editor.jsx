import { useEffect, useMemo, useState } from 'react';
import { useEditor } from '../store.js';
import { validateProject, summarizeIssues } from '../../core/validate.js';
import { capabilities } from '../../core/operations.js';
import Outline from './Outline.jsx';
import Canvas from './Canvas.jsx';
import Preview from './Preview.jsx';
import AssetsPanel from './AssetsPanel.jsx';
import ThemePanel from './ThemePanel.jsx';
import IssuesPanel from './IssuesPanel.jsx';
import CoursePanel from './CoursePanel.jsx';
import ExportDialog from './ExportDialog.jsx';
import CheckpointsDialog from './CheckpointsDialog.jsx';
import { Badge } from './ui.jsx';

const TABS = [
  ['outline', 'Outline'],
  ['course', 'Course'],
  ['assets', 'Assets'],
  ['theme', 'Theme'],
  ['issues', 'Checks'],
];

export default function Editor({ warnings, onDismissWarnings }) {
  const { state, dispatch, save, closeProject } = useEditor();
  const { project, session, dirty, past, future } = state;
  const [tab, setTab] = useState('outline');
  const [showPreview, setShowPreview] = useState(true);
  const [dialog, setDialog] = useState(null); // 'export' | 'checkpoints'
  const issues = useMemo(() => validateProject(project), [project]);
  const counts = summarizeIssues(issues);
  const caps = capabilities(project);
  const preserved = project.manifest.source?.mode === 'preserve';

  useEffect(() => {
    const onCmd = (e) => {
      if (e.detail === 'export') setDialog('export');
      if (e.detail === 'checkpoint') setDialog('checkpoints');
      if (e.detail === 'togglePreview') setShowPreview((v) => !v);
    };
    window.addEventListener('tessera:command', onCmd);
    return () => window.removeEventListener('tessera:command', onCmd);
  }, []);

  useEffect(() => {
    document.title = `${dirty ? '• ' : ''}${project.manifest.course.title} — Tessera`;
  }, [dirty, project.manifest.course.title]);

  return (
    <div className={`editor${showPreview ? '' : ' editor--no-preview'}`}>
      <header className="toolbar" role="toolbar" aria-label="Project">
        <div className="toolbar__title">
          <strong title={session.root}>{project.manifest.course.title}</strong>
          <span className="muted small">{session.name}{preserved ? ` · preserved ${project.manifest.source.adapter === 'rise' ? 'Rise' : 'HTML'} import` : ''}</span>
        </div>
        <div className="toolbar__group">
          <button type="button" className="btn btn--sm" onClick={() => dispatch({ type: 'undo' })} disabled={!past.length} title="Undo (Ctrl+Z)">Undo</button>
          <button type="button" className="btn btn--sm" onClick={() => dispatch({ type: 'redo' })} disabled={!future.length} title="Redo (Ctrl+Y)">Redo</button>
        </div>
        <div className="toolbar__group">
          <button type="button" className={`btn btn--sm${dirty ? ' btn--primary' : ''}`} onClick={save} title="Save (Ctrl+S)">{dirty ? 'Save' : 'Saved'}</button>
          <button type="button" className="btn btn--sm" onClick={() => setDialog('checkpoints')}>Checkpoints</button>
          <button type="button" className="btn btn--sm" onClick={() => setShowPreview((v) => !v)} aria-pressed={showPreview}>Preview</button>
          <button type="button" className="btn btn--sm btn--accent" onClick={() => setDialog('export')}>Publish…</button>
          <button type="button" className="btn btn--sm" onClick={() => closeProject()}>Close</button>
        </div>
      </header>

      {warnings.length > 0 && (
        <div className="banner" role="alert">
          <div>{warnings.map((w) => <p key={w}>{w}</p>)}</div>
          <button type="button" className="btn btn--sm" onClick={onDismissWarnings}>Dismiss</button>
        </div>
      )}
      {preserved && (
        <div className="banner banner--info">
          <p>
            This is a <strong>preserved import</strong>: the original {project.manifest.source.adapter === 'rise' ? 'Rise player renders the course' : 'pages are kept as they are'}, and your edits are written into its source files.
            {' '}{!caps.addBlocks && 'New blocks cannot be added. '}Fields that cannot be written back are locked.
          </p>
        </div>
      )}

      <aside className="sidebar" aria-label="Project panels">
        <div className="tabs" role="tablist" aria-label="Panels">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} className="tabs__tab" onClick={() => setTab(id)}>
              {label}{id === 'issues' && (counts.error + counts.warning) > 0 && <> <Badge kind={counts.error ? 'error' : 'warn'}>{counts.error + counts.warning}</Badge></>}
            </button>
          ))}
        </div>
        <div className="sidebar__panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'outline' && <Outline />}
          {tab === 'course' && <CoursePanel />}
          {tab === 'assets' && <AssetsPanel />}
          {tab === 'theme' && <ThemePanel />}
          {tab === 'issues' && <IssuesPanel issues={issues} />}
        </div>
      </aside>

      <main className="canvas-wrap" aria-label="Lesson editor">
        <Canvas issues={issues} />
      </main>

      {showPreview && <Preview />}

      {dialog === 'export' && <ExportDialog issues={issues} onClose={() => setDialog(null)} />}
      {dialog === 'checkpoints' && <CheckpointsDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
