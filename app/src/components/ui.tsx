import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Status } from '../lib/types';
import type { Alert } from '../lib/derive';
import { fromInput, toInput } from '../lib/time';

export function Modal({ title, onClose, children, actions }: { title: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="hd"><h2>{title}</h2><span className="spacer" />{actions}<button className="btn sm ghost" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

// ---- toasts ----
interface Toast { id: number; text: string; action?: { label: string; run: () => void } }
let toasts: Toast[] = []; const tsubs = new Set<() => void>(); let tid = 0;
export function toast(text: string, action?: Toast['action'], ms = 6000) {
  const t = { id: ++tid, text, action }; toasts = [...toasts, t].slice(-3); tsubs.forEach(f => f());
  setTimeout(() => { toasts = toasts.filter(x => x.id !== t.id); tsubs.forEach(f => f()); }, ms);
}
export function Toasts() {
  const list = useSyncExternalStore(cb => { tsubs.add(cb); return () => tsubs.delete(cb); }, () => toasts);
  return <div className="toasts">{list.map(t => (
    <div className="toast" key={t.id}><span>{t.text}</span>
      {t.action && <button onClick={() => { t.action!.run(); toasts = toasts.filter(x => x.id !== t.id); tsubs.forEach(f => f()); }}>{t.action.label}</button>}
    </div>))}</div>;
}

export const LevelPill = ({ name, color }: { name: string; color: string }) =>
  name ? <span className="pill lvl" style={{ background: color + '33', borderColor: color }}>{name}</span> : <span className="pill al-error">No level</span>;
export const StatusPill = ({ s }: { s: Status }) => <span className={`pill st-${s}`}>{s}</span>;
export const AlertPills = ({ alerts }: { alerts: Alert[] }) =>
  <>{alerts.map(a => <span key={a.code} className={`pill al-${a.severity}`}>{a.text}</span>)}</>;

/** Native time picker (great on iPad) storing minutes after midnight. */
export function TimeField({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  const [v, setV] = useState(toInput(value));
  useEffect(() => setV(toInput(value)), [value]);
  return <input type="time" value={v} placeholder={placeholder} step={300}
    onChange={e => setV(e.target.value)}
    onBlur={() => { const m = fromInput(v); if (m !== value) onChange(m); }}
    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

/** Re-render every `ms` (for clocks, "x min ago", recent-change highlights). */
export function useTick(ms = 30000) {
  const [, s] = useState(0);
  useEffect(() => { const t = setInterval(() => s(x => x + 1), ms); return () => clearInterval(t); }, [ms]);
}
