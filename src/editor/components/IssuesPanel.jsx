import { useState } from 'react';
import { useEditor } from '../store.js';
import { getBlockDef } from '../../core/blocks/index.js';

const CATEGORY = { accessibility: 'Accessibility', content: 'Content', assessment: 'Assessment', assets: 'Files', external: 'Needs internet', structure: 'Structure', import: 'Imported content' };

export default function IssuesPanel({ issues }) {
  const { state, dispatch } = useEditor();
  const [filter, setFilter] = useState('all');
  const shown = issues.filter((i) => filter === 'all' || i.category === filter);
  const cats = [...new Set(issues.map((i) => i.category))];
  return (
    <div className="issues-panel">
      <h2 className="panel-title">Checks</h2>
      <p className="muted small">Automatic checks flag things an author should review. They do not replace testing with real learners and assistive technology.</p>
      <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter checks">
        <option value="all">All ({issues.length})</option>
        {cats.map((c) => <option key={c} value={c}>{CATEGORY[c] || c} ({issues.filter((i) => i.category === c).length})</option>)}
      </select>
      {shown.length === 0 ? <p className="ok">✓ Nothing to review.</p> : (
        <ul className="issues">
          {shown.map((i, n) => {
            const lesson = i.lessonId ? state.project.lessons[i.lessonId] : null;
            const block = lesson?.blocks.find((b) => b.id === i.blockId);
            return (
              <li key={n} className={`issue issue--${i.level}`}>
                <span className="issue__level">{i.level === 'error' ? 'Error' : i.level === 'warning' ? 'Review' : 'Note'}</span>
                <span>{i.message}</span>
                {lesson && (
                  <button type="button" className="link small" onClick={() => dispatch({ type: 'select', selection: { lessonId: lesson.id, blockId: block?.id || null } })}>
                    {lesson.title}{block ? ` › ${getBlockDef(block.type)?.title || block.type}` : ''}
                  </button>
                )}
                {i.scope === 'theme' && <span className="muted small">Theme</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
