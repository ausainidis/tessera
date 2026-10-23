import { useState } from 'react';
import { useEditor } from '../store.js';
import { updatePublishSettings } from '../../core/operations.js';
import { call, isDesktop } from '../api.js';
import { Dialog } from './ui.jsx';

export default function ExportDialog({ issues, onClose }) {
  const { state, apply, run } = useEditor();
  const { project, dirty } = state;
  const preserved = project.manifest.source?.mode === 'preserve';
  const [format, setFormat] = useState('web');
  const [zip, setZip] = useState(true);
  const [includeSource, setIncludeSource] = useState(!!project.manifest.publish?.includeSource);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const errors = issues.filter((i) => i.level === 'error');
  const external = issues.filter((i) => i.category === 'external');

  const go = async () => {
    setBusy(true);
    if (includeSource !== !!project.manifest.publish?.includeSource) apply((p) => updatePublishSettings(p, { includeSource }));
    const r = await run(() => call('export:run', project, { format, zip, includeSource }));
    setBusy(false);
    if (r) setResult(r);
  };

  if (result) {
    return (
      <Dialog title="Course published" onClose={onClose}
        actions={[{ label: 'Show folder', onClick: () => call('export:reveal', result.outDir) }, { label: 'Done', primary: true, onClick: onClose }]}>
        <p>Saved to <code>{result.outDir}</code>{result.zipPath && <> and <code>{result.zipPath}</code></>}.</p>
        <p>Open <code>{result.report.entry}</code> in a browser, or upload the folder to any static web host. No editor or server software is needed.</p>
        {result.report.warnings.length > 0 && <><h3>Warnings</h3><ul className="issues">{result.report.warnings.map((w) => <li key={w} className="issue issue--warning">{w}</li>)}</ul></>}
        {result.report.externalDependencies.length > 0 && <><h3>Needs internet when viewed</h3><ul className="tight">{result.report.externalDependencies.map((d) => <li key={d.blockId}><code>{d.url}</code></li>)}</ul></>}
        {includeSource && <p className="small">The editable project is included in the <code>editable-project</code> folder. Remove it before publishing publicly if learners should not receive it.</p>}
      </Dialog>
    );
  }

  return (
    <Dialog title="Publish course" onClose={onClose}
      actions={[{ label: 'Cancel', onClick: onClose }, { label: busy ? 'Publishing…' : 'Choose folder and publish…', primary: true, disabled: busy || !isDesktop, onClick: go }]}>
      <fieldset className="strategies">
        <legend>Format</legend>
        <label className={`strategy${format === 'web' ? ' is-selected' : ''}`}><input type="radio" name="fmt" checked={format === 'web'} onChange={() => setFormat('web')} />
          <span><strong>Web folder</strong><span className="muted small block">Plain HTML, CSS and JavaScript for any static web host or local viewing. Progress is remembered in the learner’s browser.</span></span></label>
        <label className={`strategy${format === 'scorm12' ? ' is-selected' : ''}`}><input type="radio" name="fmt" checked={format === 'scorm12'} onChange={() => setFormat('scorm12')} disabled={preserved} />
          <span><strong>SCORM 1.2 package <span className="badge badge--warn">Experimental</span></strong><span className="muted small block">Reports completion, score and resume data to an LMS. Not yet tested in a real LMS — test before using it with learners.{preserved ? ' Not available for preserved imports.' : ''}</span></span></label>
      </fieldset>
      <label className="check"><input type="checkbox" checked={zip} onChange={(e) => setZip(e.target.checked)} /> Also create a ZIP file</label>
      <label className="check"><input type="checkbox" checked={includeSource} onChange={(e) => setIncludeSource(e.target.checked)} /> Include the editable project (so it can be reopened in Tessera)</label>
      {dirty && <p className="alert">You have unsaved changes. Publishing uses the current state shown in the editor; save as well to keep it in the project.</p>}
      {errors.length > 0 && <p className="alert alert--error">{errors.length} error{errors.length === 1 ? '' : 's'} in Checks. You can still publish, but review them first.</p>}
      {external.length > 0 && <p className="small">{external.length} item{external.length === 1 ? '' : 's'} need an internet connection when viewed (see Checks).</p>}
    </Dialog>
  );
}
