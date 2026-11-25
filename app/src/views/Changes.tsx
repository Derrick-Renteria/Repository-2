import { useState } from 'react';
import type { Ctx } from '../lib/derive';
import { getState, undoChange, useApp } from '../lib/store';
import { ago } from '../lib/time';

export function Changes({ c }: { c: Ctx }) {
  useApp();
  const [q, setQ] = useState('');
  const list = getState().data.changes.filter(x => x.eventId === c.event.id && (!q || (x.target + x.field + x.newValue + x.oldValue).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.at.localeCompare(a.at));
  return <>
    <div className="toolbar"><input data-tour="search" type="search" placeholder="Filter changes…" value={q} onChange={e => setQ(e.target.value)} />
      <span className="muted small">{list.length} changes · newest first</span></div>
    <div className="tablewrap" data-tour="changes"><table className="t">
      <thead><tr><th>When</th><th>Who</th><th>Athlete / flight</th><th>Change</th><th>Before</th><th>After</th><th></th></tr></thead>
      <tbody>{list.map(x => <tr key={x.id} style={x.undone ? { opacity: .45 } : undefined}>
        <td className="small" style={{ whiteSpace: 'nowrap' }}>{new Date(x.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}<div className="muted">{ago(x.at)}</div></td>
        <td className="small muted">{x.actor}</td><td><b>{x.target}</b></td><td>{x.field}</td>
        <td className="muted">{x.oldValue}</td><td><b>{x.newValue}</b></td>
        <td>{x.undo && (x.undone ? <span className="small muted">undone</span> : <button className="btn sm" onClick={() => void undoChange(x.id)}>Undo</button>)}</td>
      </tr>)}</tbody></table></div>
    {list.length === 0 && <div className="empty">No changes yet.</div>}
  </>;
}
