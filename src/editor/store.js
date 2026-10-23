// Editor state with undo/redo. The project state is immutable, so history entries share
// unchanged lessons and stay cheap. Rapid edits to the same field are coalesced into one
// undo step (typing a sentence is one step, not one per character).

import { createContext, useContext } from 'react';

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1200;

export const initialEditorState = {
  session: null, // { root, name }
  project: null,
  past: [],
  future: [],
  dirty: false,
  lastKey: null,
  lastAt: 0,
  selection: { lessonId: null, blockId: null },
  toasts: [],
};

export function editorReducer(state, action) {
  switch (action.type) {
    case 'load': {
      const project = action.project;
      const first = project.manifest.lessons.find((id) => project.lessons[id]?.kind !== 'section') || project.manifest.lessons[0] || null;
      return { ...initialEditorState, session: action.session, project, dirty: !!action.dirty, selection: { lessonId: first, blockId: null } };
    }
    case 'close':
      return { ...initialEditorState, toasts: state.toasts };
    case 'apply': {
      // action.fn(project) returns a new project or { project, select }. Operations may
      // refuse (e.g. preserved imports); the refusal becomes a message, not a crash.
      let result;
      try {
        result = action.fn ? action.fn(state.project) : action.project;
      } catch (e) {
        return { ...state, toasts: [...state.toasts, { id: Date.now() + Math.random(), kind: 'error', message: e.message }].slice(-4) };
      }
      const nextProject = result && result.manifest ? result : result?.project;
      if (!nextProject || nextProject === state.project) return state;
      action = { ...action, project: nextProject, select: action.select || result.select };
      const now = Date.now();
      const coalesce = action.key && action.key === state.lastKey && now - state.lastAt < COALESCE_MS;
      const past = coalesce ? state.past : [...state.past, state.project].slice(-HISTORY_LIMIT);
      let selection = action.select ? { ...state.selection, ...action.select } : state.selection;
      if (selection.lessonId && !action.project.lessons[selection.lessonId]) selection = { lessonId: action.project.manifest.lessons[0] || null, blockId: null };
      return { ...state, project: action.project, past, future: [], dirty: true, lastKey: action.key || null, lastAt: now, selection };
    }
    case 'replaceProject': // used by checkpoint restore and recovery: undoable
      return { ...state, past: [...state.past, state.project].slice(-HISTORY_LIMIT), future: [], project: action.project, dirty: true, lastKey: null, selection: { lessonId: action.project.manifest.lessons[0] || null, blockId: null } };
    case 'undo': {
      if (!state.past.length) return state;
      const project = state.past[state.past.length - 1];
      return { ...state, project, past: state.past.slice(0, -1), future: [state.project, ...state.future], dirty: true, lastKey: null, selection: fixSelection(project, state.selection) };
    }
    case 'redo': {
      if (!state.future.length) return state;
      const [project, ...future] = state.future;
      return { ...state, project, past: [...state.past, state.project], future, dirty: true, lastKey: null, selection: fixSelection(project, state.selection) };
    }
    case 'saved':
      // Saving only changes the modification time; keep history intact.
      return { ...state, project: { ...state.project, manifest: { ...state.project.manifest, modified: action.modified } }, dirty: action.stillDirty ? true : false };
    case 'select':
      return { ...state, selection: { ...state.selection, ...action.selection } };
    case 'toast':
      return { ...state, toasts: [...state.toasts, { id: Date.now() + Math.random(), kind: action.kind || 'info', message: action.message }].slice(-4) };
    case 'dismissToast':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    default:
      return state;
  }
}

function fixSelection(project, selection) {
  if (selection.lessonId && project.lessons[selection.lessonId]) {
    const hasBlock = !selection.blockId || project.lessons[selection.lessonId].blocks.some((b) => b.id === selection.blockId);
    return hasBlock ? selection : { ...selection, blockId: null };
  }
  return { lessonId: project.manifest.lessons[0] || null, blockId: null };
}

export const EditorContext = createContext(null);
export const useEditor = () => useContext(EditorContext);
