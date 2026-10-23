import { Fragment } from 'react';
import { useEditor } from '../store.js';
import { updateCourse, updateNavigation, capabilities } from '../../core/operations.js';
import { RichTextField, FieldEditor } from './fields.jsx';
import { IconButton } from './ui.jsx';

export default function CoursePanel() {
  const { state, apply } = useEditor();
  const { project } = state;
  const c = project.manifest.course;
  const nav = project.manifest.navigation;
  const caps = capabilities(project);
  const setCourse = (patch, key) => apply((p) => updateCourse(p, patch), { key: `course-${key}` });
  const setNav = (patch) => apply((p) => updateNavigation(p, patch));
  const objectives = c.objectives || [];

  return (
    <div className="course-panel">
      <h2 className="panel-title">Course</h2>
      <fieldset disabled={!caps.editCourse} className="plain">
        <label className="field"><span className="field__label">Title</span><input className="input" value={c.title} onChange={(e) => setCourse({ title: e.target.value }, 'title')} /></label>
        <RichTextField label="Description" value={c.description} onChange={(v) => setCourse({ description: v }, 'desc')} disabled={!caps.editCourse} compact />
        <fieldset className="list-field">
          <legend className="field__label">Learning objectives</legend>
          {objectives.map((o, i) => (
            <div key={i} className="row">
              <input className="input" aria-label={`Objective ${i + 1}`} value={o} onChange={(e) => setCourse({ objectives: objectives.map((x, n) => (n === i ? e.target.value : x)) }, `obj-${i}`)} />
              <IconButton label={`Remove objective ${i + 1}`} onClick={() => setCourse({ objectives: objectives.filter((_, n) => n !== i) }, 'obj-rm')}>✕</IconButton>
            </div>
          ))}
          <button type="button" className="btn btn--sm" onClick={() => setCourse({ objectives: [...objectives, ''] }, 'obj-add')}>+ Add objective</button>
        </fieldset>
        <div className="row">
          <label className="field"><span className="field__label">Language (e.g. en, de, fr)</span><input className="input" value={c.language} onChange={(e) => setCourse({ language: e.target.value.trim() }, 'lang')} /></label>
          <label className="field"><span className="field__label">Author</span><input className="input" value={c.author || ''} onChange={(e) => setCourse({ author: e.target.value }, 'author')} /></label>
        </div>
      </fieldset>

      <h3>Navigation</h3>
      {project.manifest.source?.mode === 'preserve' ? <p className="muted small">Navigation is controlled by the original player in preserved imports.</p> : (
        <>
          <FieldEditor field={{ key: 'mode', label: 'Lesson order', type: 'select', options: [['free', 'Free: learners can open any lesson'], ['sequential', 'Sequential: complete lessons in order']] }} value={nav.mode} onChange={(v) => setNav({ mode: v })} />
          <FieldEditor field={{ key: 'coverPage', label: 'Show a cover page with description and objectives', type: 'boolean' }} value={nav.coverPage} onChange={(v) => setNav({ coverPage: v })} />
          <FieldEditor field={{ key: 'showOutline', label: 'Show the course outline (sidebar menu)', type: 'boolean' }} value={nav.showOutline} onChange={(v) => setNav({ showOutline: v })} />
          <FieldEditor field={{ key: 'showProgress', label: 'Show the progress indicator', type: 'boolean' }} value={nav.showProgress} onChange={(v) => setNav({ showProgress: v })} />
          <FieldEditor field={{ key: 'showLessonNav', label: 'Show previous/next lesson links', type: 'boolean' }} value={nav.showLessonNav} onChange={(v) => setNav({ showLessonNav: v })} />
        </>
      )}
      <h3>Project</h3>
      <dl className="kv small">
        <dt>Format</dt><dd>{project.manifest.format} v{project.manifest.formatVersion}</dd>
        <dt>Course id</dt><dd><code>{project.manifest.id}</code></dd>
        <dt>Created</dt><dd>{new Date(project.manifest.created).toLocaleString()}</dd>
        <dt>Saved</dt><dd>{new Date(project.manifest.modified).toLocaleString()}</dd>
        {project.manifest.imports.map((imp) => <Fragment key={imp.id}><dt>Imported</dt><dd>{imp.kind} ({imp.strategy}) from {imp.from}; original kept in <code>{imp.original}</code></dd></Fragment>)}
      </dl>
    </div>
  );
}
