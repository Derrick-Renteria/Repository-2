import { useState } from 'react';
import type { Ctx } from '../lib/derive';
import { activeIn, flightAlerts, flightLabel, sortedFlights } from '../lib/derive';
import { addFlight, deleteFlight, shiftFlights, updateFlight } from '../lib/store';
import { fmt } from '../lib/time';
import { AlertPills, TimeField, toast } from '../components/ui';
import { go } from '../lib/router';

export function Flights({ c }: { c: Ctx }) {
  const [view, setView] = useState<'time' | 'level'>('time');
  const [from, setFrom] = useState<number | null>(null);
  const [delta, setDelta] = useState(15);
  const all = sortedFlights(c);
  const groups = view === 'time' ? [{ id: 'all', name: 'All flights in time order', color: 'var(--ink)', list: all }]
    : c.levels.map(l => ({ id: l.id, name: l.name, color: l.color, list: all.filter(f => f.levelId === l.id).sort((a, b) => a.number - b.number) }));

  const add = async (levelId: string) => {
    const mine = all.filter(f => f.levelId === levelId && f.startMin !== null);
    const last = mine.length ? Math.max(...mine.map(f => f.startMin as number)) : (all.length ? Math.max(...all.map(f => f.startMin ?? 0)) : 540);
    const f = await addFlight(c.event.id, levelId, last + c.event.settings.flightLengthMin);
    toast(`${flightLabel(c, { ...f })} added at ${fmt(f.startMin)}. Check its time.`);
  };

  return <>
    <div className="card" style={{ marginBottom: 14 }}>
      <h2>⏱ Shift the schedule</h2>
      <div className="row">
        <span>Move every flight starting at or after</span>
        <div style={{ width: 150 }}><TimeField value={from} onChange={setFrom} /></div>
        <span>by</span>
        <select value={delta} onChange={e => setDelta(+e.target.value)} style={{ width: 130 }}>
          {[-30, -15, -10, -5, 5, 10, 15, 20, 30, 45, 60].map(d => <option key={d} value={d}>{d > 0 ? '+' : ''}{d} min</option>)}</select>
        <button className="btn primary" disabled={from === null} onClick={async () => {
          const n = await shiftFlights(c.event.id, from!, delta);
          toast(n ? `${n} flights shifted ${delta > 0 ? '+' : ''}${delta} min (undo in Changes)` : 'No flights at or after that time');
        }}>Shift</button>
      </div>
    </div>
    <div className="toolbar">
      <div className="seg"><button className={view === 'time' ? 'on' : ''} onClick={() => setView('time')}>By time</button>
        <button className={view === 'level' ? 'on' : ''} onClick={() => setView('level')}>By level</button></div>
      <span className="muted small">Change a time here and every athlete in that flight follows it.</span>
      <span className="spacer" />
      {view === 'time' && c.levels.length > 0 && <select style={{ width: 'auto' }} value="" onChange={e => e.target.value && void add(e.target.value)}>
        <option value="">+ Add flight to…</option>{c.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
    </div>
    {c.levels.length === 0 && <div className="empty card">Add levels first on <a href="#/settings">Settings</a>, or <a href="#/import">import your spreadsheet</a>.</div>}
    {groups.map(g => <div key={g.id} style={{ marginBottom: 18 }}>
      {view === 'level' && <div className="row" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0, borderLeft: `6px solid ${g.color}`, paddingLeft: 10 }}>{g.name}</h2><span className="spacer" />
        <button className="btn sm" onClick={() => void add(g.id)}>+ Add flight</button></div>}
      <div className="tablewrap"><table className="t">
        <thead><tr><th>Flight</th><th style={{ width: 150 }}>Start time</th><th>Athletes</th><th>Ages</th><th>Notes</th><th>Check</th><th></th></tr></thead>
        <tbody>{g.list.map(f => {
          const m = activeIn(c, f); const ages = m.map(a => a.age).filter((x): x is number => x !== null);
          const lc = c.levelById.get(f.levelId)?.color ?? '#999';
          return <tr key={f.id}>
            <td style={{ borderLeft: `6px solid ${lc}` }}><a href={'#/flight/' + f.id} style={{ fontWeight: 700, color: 'inherit' }}>{flightLabel(c, f)}</a></td>
            <td className="tcell"><TimeField value={f.startMin} onChange={v => void updateFlight(f.id, { startMin: v })} /></td>
            <td className="ncell"><b style={{ color: m.length > c.event.settings.maxPerFlight ? 'var(--red)' : undefined }}>{m.length}</b><span className="muted">/{c.event.settings.maxPerFlight}</span></td>
            <td className="muted">{ages.length ? (Math.min(...ages) === Math.max(...ages) ? Math.min(...ages) : `${Math.min(...ages)}–${Math.max(...ages)}`) : ''}</td>
            <td><input type="text" defaultValue={f.notes} placeholder="Notes" onBlur={e => void updateFlight(f.id, { notes: e.target.value })} /></td>
            <td><AlertPills alerts={flightAlerts(c, f)} /></td>
            <td><div className="row" style={{ flexWrap: 'nowrap' }}>
              <button className="btn sm" onClick={() => go('flight/' + f.id)}>View</button>
              <button className="btn sm danger" onClick={() => { if (confirm(`Delete ${flightLabel(c, f)}?${m.length ? ` Its ${m.length} athletes become Unassigned.` : ''}`)) void deleteFlight(f.id); }}>✕</button></div></td>
          </tr>; })}</tbody></table></div>
    </div>)}
  </>;
}
