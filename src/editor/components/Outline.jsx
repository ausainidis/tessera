import { useState } from 'react';
import { useEditor } from '../store.js';
import { orderedLessons } from '../../core/model.js';
import { addLesson, duplicateLesson, deleteLesson, moveLesson, capabilities } from '../../core/operations.js';
import { Dialog, IconButton, Announcer } from './ui.jsx';

const KIND_ICON = { lesson: '▤', assessment: '✓', section: '§' };
const KIND_LABEL = { lesson: 'Lesson', assessment: 'Assessment', section: 'Section heading' };

export default function Outline() {
  const { state, apply, dispatch } = useEditor();
  const { project, selection } = state;
  const lessons = orderedLessons(project);
  const caps = capabilities(project);
  const [confirm, setConfirm] = useState(null);
  const [announce, setAnnounce] = useState('');
  const [drag, setDrag] = useState(null); // { id, over }

  const move = (id, to) => {
    const from = project.manifest.lessons.indexOf(id);
    if (to < 0 || to >= lessons.length || to === from) return;
    apply((p) => moveLesson(p, id, to));
    setAnnounce(`${project.lessons[id].title} moved to position ${to + 1} of ${lessons.length}`);
  };
  const add = (kind) => apply((p) => {
    const index = selection.lessonId ? p.manifest.lessons.indexOf(selection.lessonId) + 1 : undefined;
    const [s, id] = addLesson(p, { kind, index });
    return { project: s, select: { lessonId: id, blockId: null } };
  });

  return (
    <div className="outline">
      <h2 className="panel-title">Course outline</h2>
      <ol className="outline__list">
        {lessons.map((l, i) => {
          const selected = l.id === selection.lessonId;
          return (
            <li key={l.id}
              className={`outline__item outline__item--${l.kind}${selected ? ' is-selected' : ''}${drag?.over === i ? ' is-drop' : ''}`}
              draggable={caps.reorderLessons}
              onDragStart={(e) => { setDrag({ id: l.id, over: i }); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { if (drag) { e.preventDefault(); setDrag({ ...drag, over: i }); } }}
              onDrop={(e) => { e.preventDefault(); if (drag) move(drag.id, i); setDrag(null); }}
              onDragEnd={() => setDrag(null)}>
              <span className="drag-handle" aria-hidden="true" title="Drag to reorder">⠿</span>
              <span className="outline__icon" aria-hidden="true" title={KIND_LABEL[l.kind]}>{KIND_ICON[l.kind]}</span>
              <button type="button" className="outline__title" aria-current={selected ? 'true' : undefined} onClick={() => dispatch({ type: 'select', selection: { lessonId: l.id, blockId: null } })}>
                <span className="sr-only">{KIND_LABEL[l.kind]}: </span>{l.title || 'Untitled'}
              </button>
              <span className="outline__actions">
                <IconButton label={`Move “${l.title}” up`} onClick={() => move(l.id, i - 1)} disabled={!caps.reorderLessons || i === 0}>↑</IconButton>
                <IconButton label={`Move “${l.title}” down`} onClick={() => move(l.id, i + 1)} disabled={!caps.reorderLessons || i === lessons.length - 1}>↓</IconButton>
                <IconButton label={`Duplicate “${l.title}”`} onClick={() => apply((p) => { const [s, id] = duplicateLesson(p, l.id); return { project: s, select: { lessonId: id } }; })} disabled={!caps.duplicateLessons}>⧉</IconButton>
                <IconButton label={`Delete “${l.title}”`} onClick={() => setConfirm(l)} disabled={!caps.deleteLessons}>🗑</IconButton>
              </span>
            </li>
          );
        })}
      </ol>
      {lessons.length === 0 && <p className="muted">No lessons yet.</p>}
      <div className="outline__add">
        <button type="button" className="btn btn--sm" onClick={() => add('lesson')} disabled={!caps.addLessons}>+ Lesson</button>
        <button type="button" className="btn btn--sm" onClick={() => add('section')} disabled={!caps.addLessons}>+ Section</button>
        <button type="button" className="btn btn--sm" onClick={() => add('assessment')} disabled={!caps.addLessons}>+ Assessment</button>
      </div>
      <p className="muted small">Drag items, or use the arrow buttons, to reorder. Sections are headings in the learner’s outline.</p>
      <Announcer message={announce} />
      {confirm && (
        <Dialog title="Delete lesson?" onClose={() => setConfirm(null)}
          actions={[
            { label: 'Cancel', onClick: () => setConfirm(null) },
            { label: 'Delete lesson', danger: true, onClick: () => { apply((p) => deleteLesson(p, confirm.id)); setConfirm(null); } },
          ]}>
          <p>“{confirm.title}” and its {confirm.blocks.length} block{confirm.blocks.length === 1 ? '' : 's'} will be removed. You can undo this, and the lesson file is moved to the project’s trash folder when you save.</p>
        </Dialog>
      )}
    </div>
  );
}
