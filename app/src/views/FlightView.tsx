import { useState } from 'react';
import type { Ctx } from '../lib/derive';
import { activeIn, athleteAlerts, athleteTime, duplicateNames, flightAlerts, flightLabel, levelColor, sortedFlights } from '../lib/derive';
import { fmt } from '../lib/time';
import { go } from '../lib/router';
import { AlertPills, StatusPill } from '../components/ui';
import { AthleteEditor } from '../components/AthleteEditor';
import type { Athlete } from '../lib/types';

export function FlightView({ c, id }: { c: Ctx; id?: string }) {
  const list = sortedFlights(c);
  const f = (id && c.flightById.get(id)) || list[0];
  const [edit, setEdit] = useState<Athlete | null>(null);
  if (!f) return <div className="empty card">No flights yet.</div>;
  const i = list.indexOf(f);
  const members = c.athletes.filter(a => a.flightId === f.id).sort((a, b) => (a.status === 'Scratched' ? 1 : 0) - (b.status === 'Scratched' ? 1 : 0) || a.name.localeCompare(b.name));
  const dupes = duplicateNames(c);
  const color = levelColor(c, f.levelId);
  return <>
    <div className="toolbar">
      <button className="btn" disabled={i <= 0} onClick={() => go('flight/' + list[i - 1].id)}>◀ Previous</button>
      <select value={f.id} onChange={e => go('flight/' + e.target.value)} style={{ maxWidth: 340 }}>
        {list.map(x => <option key={x.id} value={x.id}>{fmt(x.startMin)} — {flightLabel(c, x, true)} ({activeIn(c, x).length})</option>)}</select>
      <button className="btn" disabled={i >= list.length - 1} onClick={() => go('flight/' + list[i + 1].id)}>Next ▶</button>
    </div>
    <div className="card" style={{ borderTop: `8px solid ${color}`, marginBottom: 14 }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div><div className="time" style={{ fontSize: 56, lineHeight: 1 }}>{fmt(f.startMin)}</div>
          <div className="big" style={{ marginTop: 6 }}>{flightLabel(c, f, true)}</div></div>
        <span className="spacer" />
        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 44, fontWeight: 800 }}>{activeIn(c, f).length}</div><div className="muted">athletes</div></div>
      </div>
      {f.notes && <div className="fnote" style={{ padding: '10px 0 0', fontSize: 16 }}>▶ {f.notes}</div>}
      <div className="row" style={{ marginTop: 8 }}><AlertPills alerts={flightAlerts(c, f)} /></div>
    </div>
    <div className="tablewrap"><table className="t" style={{ fontSize: 18 }}>
      <thead><tr><th>#</th><th>Athlete</th><th>Age</th><th>Start</th><th>Status</th><th>Exceptions / notes</th></tr></thead>
      <tbody>{members.map((a, k) => <tr key={a.id} className="click" onClick={() => setEdit(a)} style={a.status === 'Scratched' ? { opacity: .45, textDecoration: 'line-through' } : undefined}>
        <td className="muted">{k + 1}</td><td style={{ fontSize: 19 }}><b>{a.name}</b></td><td>{a.age ?? ''}</td>
        <td className="time" style={{ color: a.overrideMin !== null ? '#C2410C' : undefined }}>{fmt(athleteTime(c, a))}</td>
        <td><StatusPill s={a.status} /></td>
        <td><div className="row" style={{ gap: 4 }}><AlertPills alerts={athleteAlerts(c, a, dupes)} /></div>{a.notes && <div className="small muted">{a.notes}</div>}</td>
      </tr>)}</tbody></table></div>
    {members.length === 0 && <div className="empty">No athletes in this flight.</div>}
    {edit && <AthleteEditor c={c} athlete={edit} onClose={() => setEdit(null)} />}
  </>;
}
