// Live preview. Uses the same renderer and runtime as published output, loaded from a
// separate, sandboxed origin (tessera-preview://) so previewed code cannot reach the editor.
//
// Native projects: the first render loads the full document; later edits replace only the
// changed lesson (no reload, scroll position kept). Structural changes reload the document.
// Preserved imports: the original player is reloaded with edited source served from memory.

import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { useEditor } from '../store.js';
import { renderCourse, renderLessonArticle, buildRuntimeData } from '../../renderer/render.js';
import { themeToCss } from '../../core/theme.js';
import { call, isDesktop, PREVIEW_BASE } from '../api.js';

const DEVICES = {
  desktop: { label: 'Desktop', width: 1280, height: 800 },
  tablet: { label: 'Tablet', width: 768, height: 1024 },
  mobile: { label: 'Mobile', width: 375, height: 740 },
};

function shellSignature(p) {
  const { modified, ...m } = p.manifest; // eslint-disable-line no-unused-vars
  return JSON.stringify({ m, lessons: m.lessons.map((id) => [p.lessons[id]?.title, p.lessons[id]?.kind, p.lessons[id]?.description, p.lessons[id]?.assessment]), fonts: p.theme.typography.fonts, css: p.theme.customCss });
}

export default function Preview() {
  const { state, dispatch } = useEditor();
  const { project, selection } = state;
  const preserved = project.manifest.source?.mode === 'preserve';
  const frame = useRef(null);
  const wrap = useRef(null);
  const last = useRef({ project: null, sig: null, n: 0 });
  const [device, setDevice] = useState('desktop');
  const [landscape, setLandscape] = useState(false);
  const [customWidth, setCustomWidth] = useState(1280);
  const [scale, setScale] = useState(1);
  const [src, setSrc] = useState(null);
  const [srcDoc, setSrcDoc] = useState(null);
  const [reload, setReload] = useState(0);

  const base = DEVICES[device];
  const width = device === 'desktop' ? customWidth : landscape ? base.height : base.width;
  const height = device === 'desktop' ? 800 : landscape ? base.width : base.height;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 24) / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  // The preview origin differs from the editor origin, so the iframe's allow-same-origin only
  // gives it access to its own origin (needed by imported players that use storage).
  const post = (msg) => frame.current?.contentWindow?.postMessage(msg, '*');

  // Render on change (debounced).
  useEffect(() => {
    const t = setTimeout(async () => {
      const prev = last.current;
      if (preserved) {
        const url = await call('preview:update', { kind: 'preserve', state: project, lessonId: selection.lessonId, blockId: selection.blockId }).catch(() => null);
        if (!url) return;
        prev.n += 1;
        const [path, hash = ''] = url.split('#');
        setSrc(`${PREVIEW_BASE}${path.split('/').map(encodeURIComponent).join('/')}?v=${prev.n}${hash ? `#${hash}` : ''}`);
        prev.project = project;
        return;
      }
      const sig = shellSignature(project);
      if (!prev.project || sig !== prev.sig) {
        const html = renderCourse(project, { mode: 'preview', runtimeBase: isDesktop ? undefined : '/_tessera-dev' });
        prev.n += 1;
        if (isDesktop) {
          await call('preview:update', { kind: 'native', html });
          setSrc(`${PREVIEW_BASE}index.html?v=${prev.n}${selection.lessonId ? `#lesson-${selection.lessonId}` : ''}`);
        } else setSrcDoc(html);
      } else {
        const data = buildRuntimeData(project, { mode: 'preview' });
        for (const id of project.manifest.lessons) {
          if (project.lessons[id] !== prev.project.lessons[id]) {
            post({ type: 'tessera:replace-lesson', lessonId: id, html: renderLessonArticle(project, id, { mode: 'preview' }), data: { lessons: data.lessons, checks: data.checks, questions: data.questions, gates: data.gates, embeds: data.embeds }, blockId: selection.blockId });
          }
        }
        if (project.theme !== prev.project.theme) post({ type: 'tessera:theme', css: themeToCss(project.theme) });
        // Keep the stored document current so a reload shows the latest state.
        if (isDesktop) call('preview:update', { kind: 'native', html: renderCourse(project, { mode: 'preview' }) }).catch(() => {});
      }
      prev.project = project;
      prev.sig = sig;
    }, preserved ? 500 : 180);
    return () => clearTimeout(t);
  }, [project, preserved, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the selection.
  useEffect(() => {
    if (preserved) return;
    post({ type: 'tessera:goto', lessonId: selection.lessonId, blockId: selection.blockId });
  }, [selection.lessonId, selection.blockId, preserved]);
  useEffect(() => {
    if (!preserved || !last.current.project) return;
    call('preview:update', { kind: 'preserve', state: project, lessonId: selection.lessonId, blockId: selection.blockId }).then((url) => {
      if (!url) return;
      const [path, hash = ''] = url.split('#');
      setSrc(`${PREVIEW_BASE}${path.split('/').map(encodeURIComponent).join('/')}?v=${last.current.n}${hash ? `#${hash}` : ''}`);
    }).catch(() => {});
  }, [selection.lessonId, selection.blockId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Messages from the preview (click a block to select it).
  useEffect(() => {
    const onMsg = (e) => {
      if (e.source !== frame.current?.contentWindow) return;
      const msg = e.data || {};
      if (msg.type === 'tessera:select' && project.lessons[msg.lessonId]) dispatch({ type: 'select', selection: { lessonId: msg.lessonId, blockId: msg.blockId } });
      if (msg.type === 'tessera:ready') post({ type: 'tessera:goto', lessonId: selection.lessonId, blockId: selection.blockId });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  });

  return (
    <section className="preview" aria-label="Preview">
      <div className="preview__bar" role="toolbar" aria-label="Preview size">
        {Object.entries(DEVICES).map(([id, d]) => (
          <button key={id} type="button" className="btn btn--sm" aria-pressed={device === id} onClick={() => setDevice(id)}>{d.label}</button>
        ))}
        {device === 'desktop' ? (
          <label className="preview__width">Width
            <input type="range" min="320" max="1920" step="10" value={customWidth} onChange={(e) => setCustomWidth(Number(e.target.value))} aria-valuetext={`${customWidth} pixels`} />
            <span className="small">{customWidth}px</span>
          </label>
        ) : (
          <button type="button" className="btn btn--sm" aria-pressed={landscape} onClick={() => setLandscape((v) => !v)}>{landscape ? 'Landscape' : 'Portrait'}</button>
        )}
        <button type="button" className="btn btn--sm" onClick={() => { last.current.project = null; last.current.sig = null; setReload((n) => n + 1); }} title="Reload preview" aria-label="Reload preview">↻</button>
      </div>
      <div className="preview__stage" ref={wrap}>
        <div className="preview__device" style={{ width: width * scale, height: height * scale }}>
          <iframe
            ref={frame}
            title="Course preview"
            className="preview__frame"
            style={{ width, height, transform: `scale(${scale})` }}
            sandbox={isDesktop ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals' : 'allow-scripts allow-forms'}
            {...(isDesktop ? { src: src || 'about:blank' } : { srcDoc: srcDoc || '' })}
          />
        </div>
        <p className="muted small center">{width} × {height}{scale < 1 ? ` · shown at ${Math.round(scale * 100)}%` : ''}{preserved ? ' · original player' : ' · same renderer as published output'}</p>
      </div>
    </section>
  );
}
