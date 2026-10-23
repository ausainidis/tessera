import { useState } from 'react';
import { useEditor } from '../store.js';
import { addBlock, moveBlock, updateLesson, updateAssessmentSettings, capabilities } from '../../core/operations.js';
import BlockCard from './BlockCard.jsx';
import BlockPicker from './BlockPicker.jsx';
import { RichTextField } from './fields.jsx';
import { Announcer } from './ui.jsx';

function AssessmentSettings({ lesson }) {
  const { apply } = useEditor();
  const a = lesson.assessment || {};
  const set = (patch) => apply((p) => updateAssessmentSettings(p, lesson.id, patch), { key: `assess-${lesson.id}-${Object.keys(patch)[0]}` });
  return (
    <fieldset className="assess-settings">
      <legend>Assessment settings (scored)</legend>
      <label className="field field--inline"><span className="field__label">Pass threshold (%)</span>
        <input className="input input--num" type="number" min="0" max="100" value={a.passThreshold ?? 80} onChange={(e) => set({ passThreshold: Number(e.target.value) })} /></label>
      <label className="field field--inline"><span className="field__label">Attempts (0 = unlimited)</span>
        <input className="input input--num" type="number" min="0" max="20" value={a.attempts ?? 0} onChange={(e) => set({ attempts: Number(e.target.value) })} /></label>
      <label className="field field--inline"><span className="field__label">Feedback</span>
        <select className="input" value={a.feedback || 'after-each'} onChange={(e) => set({ feedback: e.target.value })}>
          <option value="after-each">Score and feedback per question</option>
          <option value="at-end">Score only</option>
          <option value="none">No feedback</option>
        </select></label>
      <label className="check"><input type="checkbox" checked={!!a.shuffleQuestions} onChange={(e) => set({ shuffleQuestions: e.target.checked })} /> Shuffle questions</label>
      <label className="check"><input type="checkbox" checked={!!a.shuffleChoices} onChange={(e) => set({ shuffleChoices: e.target.checked })} /> Shuffle answers</label>
      <label className="check"><input type="checkbox" checked={a.revealAnswers !== false} onChange={(e) => set({ revealAnswers: e.target.checked })} /> Reveal correct answers after the last attempt</label>
      <label className="check"><input type="checkbox" checked={a.requiredForCompletion !== false} onChange={(e) => set({ requiredForCompletion: e.target.checked })} /> Course is only complete when this assessment is passed</label>
      <p className="muted small">Results are recorded as structured interactions (question, response, result, weighting) for LMS reporting.</p>
    </fieldset>
  );
}

function InsertPoint({ index, onInsert, disabled }) {
  if (disabled) return <div className="insert insert--off" />;
  return (
    <div className="insert">
      <button type="button" className="insert__btn" onClick={() => onInsert(index)} aria-label={`Insert a block at position ${index + 1}`}>+ Add block</button>
    </div>
  );
}

export default function Canvas({ issues }) {
  const { state, apply, dispatch } = useEditor();
  const { project, selection } = state;
  const lesson = project.lessons[selection.lessonId];
  const caps = capabilities(project);
  const [picker, setPicker] = useState(null); // insert index
  const [announce, setAnnounce] = useState('');
  const [drag, setDrag] = useState(null); // { id, over }

  if (!lesson) return <div className="canvas canvas--empty"><p>Select or add a lesson in the outline.</p></div>;

  const move = (blockId, to) => {
    if (to < 0 || to >= lesson.blocks.length) return;
    apply((p) => moveBlock(p, lesson.id, blockId, to));
    const def = lesson.blocks.find((b) => b.id === blockId);
    setAnnounce(`${def?.type} block moved to position ${to + 1} of ${lesson.blocks.length}`);
    requestAnimationFrame(() => document.getElementById(`card-${blockId}`)?.querySelector('.card__head')?.focus());
  };
  const insert = (type) => {
    const index = picker;
    setPicker(null);
    apply((p) => {
      const [s, id] = addBlock(p, lesson.id, type, index);
      return { project: s, select: { blockId: id } };
    });
  };

  return (
    <div className="canvas">
      <header className="lesson-head">
        <p className="muted small">{lesson.kind === 'assessment' ? 'Assessment' : lesson.kind === 'section' ? 'Section heading' : 'Lesson'}</p>
        <label className="sr-only" htmlFor="lesson-title">Lesson title</label>
        <input id="lesson-title" className="lesson-head__title" value={lesson.title} onChange={(e) => apply((p) => updateLesson(p, lesson.id, { title: e.target.value }), { key: `lesson-title-${lesson.id}` })} />
        {lesson.kind !== 'section' && !lesson.source && (
          <RichTextField label="Lesson introduction (optional)" value={lesson.description || ''} onChange={(v) => apply((p) => updateLesson(p, lesson.id, { description: v }), { key: `lesson-desc-${lesson.id}` })} compact />
        )}
        {lesson.kind === 'assessment' && <AssessmentSettings lesson={lesson} />}
      </header>

      {lesson.kind === 'section' ? (
        <p className="muted">Section headings group lessons in the learner’s outline and have no content of their own.</p>
      ) : (
        <ol className="blocks" aria-label="Blocks in this lesson">
          <li><InsertPoint index={0} onInsert={setPicker} disabled={!caps.addBlocks} /></li>
          {lesson.blocks.map((b, i) => (
            <li key={b.id}
              className={drag?.over === i && drag.id !== b.id ? 'is-drop' : ''}
              onDragOver={(e) => { if (drag) { e.preventDefault(); if (drag.over !== i) setDrag({ ...drag, over: i }); } }}
              onDrop={(e) => { e.preventDefault(); if (drag) move(drag.id, i); setDrag(null); }}>
              <BlockCard
                block={b} lesson={lesson} index={i} count={lesson.blocks.length}
                selected={selection.blockId === b.id}
                issues={issues.filter((x) => x.blockId === b.id)}
                onSelect={() => dispatch({ type: 'select', selection: { blockId: b.id } })}
                onMove={(to) => move(b.id, to)}
                dragProps={caps.reorderBlocks ? {
                  draggable: true,
                  onDragStart: (e) => { setDrag({ id: b.id, over: i }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.id); },
                  onDragEnd: () => setDrag(null),
                } : {}}
              />
              <InsertPoint index={i + 1} onInsert={setPicker} disabled={!caps.addBlocks} />
            </li>
          ))}
        </ol>
      )}
      {lesson.kind !== 'section' && lesson.blocks.length === 0 && caps.addBlocks && <p className="muted center">This lesson is empty. Add a block to start.</p>}
      {picker !== null && <BlockPicker lessonKind={lesson.kind} onPick={insert} onClose={() => setPicker(null)} />}
      <Announcer message={announce} />
    </div>
  );
}
