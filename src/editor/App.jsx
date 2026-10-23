import { useReducer, useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { editorReducer, initialEditorState, EditorContext } from './store.js';
import { call, on } from './api.js';
import Home from './components/Home.jsx';
import Editor from './components/Editor.jsx';
import ImportWizard from './components/ImportWizard.jsx';
import { Dialog, Toasts } from './components/ui.jsx';

const AUTOSAVE_MS = 4000;

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [importing, setImporting] = useState(null); // { analysisId, report }
  const [recovery, setRecovery] = useState(null);
  const [closePrompt, setClosePrompt] = useState(null); // 'window' | 'project'
  const [warnings, setWarnings] = useState([]);

  const toast = useCallback((message, kind = 'info') => dispatch({ type: 'toast', message, kind }), []);
  const apply = useCallback((fn, opts = {}) => dispatch({ type: 'apply', fn, ...opts }), []);

  const loadSession = useCallback((result) => {
    if (!result) return;
    if (result.needsImport) {
      toast('That folder is not a Tessera project. Use Import to bring it in.', 'warning');
      return;
    }
    dispatch({ type: 'load', session: { root: result.root, name: result.name }, project: result.state });
    setWarnings(result.warnings || []);
    if (result.recovery) setRecovery(result.recovery);
  }, [toast]);

  const run = useCallback(async (fn) => {
    try {
      return await fn();
    } catch (e) {
      toast(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error');
      return null;
    }
  }, [toast]);

  const save = useCallback(async () => {
    const s = stateRef.current;
    if (!s.project) return false;
    const snapshot = s.project;
    const r = await run(() => call('project:save', snapshot));
    if (!r) return false;
    dispatch({ type: 'saved', modified: r.state.manifest.modified, stillDirty: stateRef.current.project !== snapshot });
    toast(r.written.length ? `Saved (${r.written.length} file${r.written.length === 1 ? '' : 's'} written)` : 'Saved (no changes on disk)', 'success');
    return true;
  }, [run, toast]);

  const closeProject = useCallback(async (force = false) => {
    if (!force && stateRef.current.dirty) {
      setClosePrompt('project');
      return;
    }
    await call('project:close');
    dispatch({ type: 'close' });
  }, []);

  // Autosave to .tessera/autosave.json (never over the saved files).
  useEffect(() => {
    if (!state.dirty || !state.project) return undefined;
    const t = setTimeout(() => { call('project:autosave', stateRef.current.project).catch(() => {}); }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [state.project, state.dirty]);

  // Keyboard shortcuts and menu commands.
  const command = useCallback((cmd) => {
    const s = stateRef.current;
    if (!s.project) return;
    if (cmd === 'save') save();
    if (cmd === 'undo') dispatch({ type: 'undo' });
    if (cmd === 'redo') dispatch({ type: 'redo' });
    if (cmd === 'close') closeProject();
    if (['export', 'checkpoint', 'togglePreview'].includes(cmd)) window.dispatchEvent(new CustomEvent('tessera:command', { detail: cmd }));
  }, [save, closeProject]);

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); command('save'); }
      else if (k === 'z' && !e.shiftKey) { e.preventDefault(); command('undo'); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); command('redo'); }
    };
    window.addEventListener('keydown', onKey);
    const offMenu = on('menu:command', command);
    const offClose = on('app:before-close', () => {
      if (stateRef.current.dirty) setClosePrompt('window');
      else call('app:confirmClose');
    });
    return () => { window.removeEventListener('keydown', onKey); offMenu(); offClose(); };
  }, [command]);

  // Startup: open a project passed on the command line (used by automated checks).
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('open')) run(() => call('project:openStartup')).then(loadSession);
    if (q.get('import')) run(() => call('import:analyzeStartup')).then((r) => r && setImporting(r));
  }, [run, loadSession]);

  const ctx = useMemo(() => ({ state, dispatch, apply, toast, run, save, closeProject, loadSession, setImporting }), [state, apply, toast, run, save, closeProject, loadSession]);

  return (
    <EditorContext.Provider value={ctx}>
      {state.project ? <Editor warnings={warnings} onDismissWarnings={() => setWarnings([])} /> : <Home />}
      {importing && <ImportWizard analysis={importing} onClose={() => setImporting(null)} />}
      {recovery && (
        <Dialog title="Recover unsaved changes?" onClose={() => setRecovery(null)}
          actions={[
            { label: 'Discard them', onClick: async () => { await run(() => call('project:recover', 'discard')); setRecovery(null); } },
            { label: 'Restore changes', primary: true, onClick: async () => { const p = await run(() => call('project:recover', 'restore')); if (p) dispatch({ type: 'replaceProject', project: p }); setRecovery(null); toast('Unsaved changes restored. Save to keep them.', 'success'); } },
          ]}>
          <p>Tessera found changes from {new Date(recovery.savedAt).toLocaleString()} that were not saved, probably because the editor closed unexpectedly.</p>
          <p>Restoring loads them as unsaved changes; your saved files are not touched until you save.</p>
        </Dialog>
      )}
      {closePrompt && (
        <Dialog title="Save changes before closing?" onClose={() => setClosePrompt(null)}
          actions={[
            { label: 'Cancel', onClick: () => setClosePrompt(null) },
            { label: 'Close without saving', danger: true, onClick: async () => { const which = closePrompt; setClosePrompt(null); if (which === 'window') call('app:confirmClose'); else closeProject(true); } },
            { label: 'Save and close', primary: true, onClick: async () => { const which = closePrompt; setClosePrompt(null); if (await save()) { if (which === 'window') call('app:confirmClose'); else closeProject(true); } } },
          ]}>
          <p>“{state.project?.manifest.course.title}” has unsaved changes. An autosave copy is kept, but it is not the same as saving.</p>
        </Dialog>
      )}
      <Toasts toasts={state.toasts} onDismiss={(id) => dispatch({ type: 'dismissToast', id })} />
    </EditorContext.Provider>
  );
}
