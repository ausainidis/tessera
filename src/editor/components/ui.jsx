import { useEffect, useRef, useId } from 'react';

/** Accessible modal dialog: labelled, traps Tab, closes on Escape, restores focus. */
export function Dialog({ title, children, actions = [], onClose, wide = false }) {
  const ref = useRef(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const el = ref.current;
    const focusables = () => [...el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
    (el.querySelector('[data-autofocus]') || focusables()[0] || el).focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current?.(); }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
        else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
      }
    };
    el.addEventListener('keydown', onKey);
    return () => { el.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, []);
  return (
    <div className="dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`dlg${wide ? ' dlg--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <header className="dlg__head">
          <h2 id={titleId}>{title}</h2>
          {onClose && <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">✕</button>}
        </header>
        <div className="dlg__body">{children}</div>
        {actions.length > 0 && (
          <footer className="dlg__foot">
            {actions.map((a) => (
              <button key={a.label} type="button" className={`btn${a.primary ? ' btn--primary' : ''}${a.danger ? ' btn--danger' : ''}`} onClick={a.onClick} disabled={a.disabled}>{a.label}</button>
            ))}
          </footer>
        )}
      </div>
    </div>
  );
}

export function Toasts({ toasts, onDismiss }) {
  useEffect(() => {
    if (!toasts.length) return undefined;
    const t = setTimeout(() => onDismiss(toasts[0].id), toasts[0].kind === 'error' ? 9000 : 4000);
    return () => clearTimeout(t);
  }, [toasts, onDismiss]);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <span>{t.message}</span>
          <button type="button" className="icon-btn" onClick={() => onDismiss(t.id)} aria-label="Dismiss message">✕</button>
        </div>
      ))}
    </div>
  );
}

export function IconButton({ label, children, ...props }) {
  return <button type="button" className="icon-btn" aria-label={label} title={label} {...props}>{children}</button>;
}

/** Visually hidden live region for announcing moves and other non-visual changes. */
export function Announcer({ message }) {
  return <div className="sr-only" aria-live="assertive" role="status">{message}</div>;
}

export function Badge({ kind = 'neutral', children, title }) {
  return <span className={`badge badge--${kind}`} title={title}>{children}</span>;
}
