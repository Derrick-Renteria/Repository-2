import { useMemo, useState } from 'react';
import type { Ctx } from '../lib/derive';
import { athleteAlerts, athleteFlight, athleteTime, duplicateNames, flightLabel, isRecent, levelColor, levelName, scheduleSort, sortedFlights } from '../lib/derive';
import { STATUSES, type Athlete, type Status } from '../lib/types';
import { addAthlete, updateAthlete } from '../lib/store';
import { fmt } from '../lib/time';
import { AthleteEditor } from '../components/AthleteEditor';
import { AlertPills, LevelPill } from '../components/ui';

export function Athletes({ c }: { c: Ctx }) {
  const [q, setQ] = useState('');
  const [lvl, setLvl] = useState('all');
  const [st, setSt] = useState<'all' | Status | 'issues' | 'recent'>('all');
  const [sort, setSort] = useState<'schedule' | 'name'>('schedule');
  const [edit, setEdit] = useState<Athlete | null>(null);
  const dupes = useMemo(() => duplicateNames(c), [c]);
  const flights = sortedFlights(c);
  let list = c.athletes.filter(a =>
    (!q || a.name.toLowerCase().includes(q.trim().toLowerCase())) && (lvl === 'all' || a.levelId === lvl) &&
    (st === 'all' || (st === 'issues' ? athleteAlerts(c, a, dupes).some(x => x.severity !== 'info') : st === 'recent' ? isRecent(c, a) : a.status === st)));
  list = sort === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : scheduleSort(c, list);

  return <>
    <div className="toolbar">
      <input type="search" placeholder="Search athletes…" value={q} onChange={e => setQ(e.target.value)} autoFocus={false} />
      <select value={lvl} onChange={e => setLvl(e.target.value)} style={{ width: 'auto' }}>
        <option value="all">All levels</option>{c.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      <select value={st} onChange={e => setSt(e.target.value as typeof st)} style={{ width: 'auto' }}>
        <option value="all">All statuses</option><option value="issues">⚠️ Needs attention</option><option value="recent">🟡 Changed recently</option>
        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
      <div className="seg"><button className={sort === 'schedule' ? 'on' : ''} onClick={() => setSort('schedule')}>By time</button>
        <button className={sort === 'name' ? 'on' : ''} onClick={() => setSort('name')}>A–Z</button></div>
      <span className="spacer" /><span className="muted small">{list.length} shown</span>
      <button className="btn primary" onClick={() => void addAthlete(c.event.id, {}).then(a => setEdit(a))}>+ Add athlete</button>
    </div>
    <div className="tablewrap"><table className="t">
      <thead><tr><th>Athlete</th><th>Age</th><th>Level</th><th>Flight</th><th>Start</th><th>Status</th><th>Alerts / notes</th></tr></thead>
      <tbody>{list.map(a => {
        const f = athleteFlight(c, a); const al = athleteAlerts(c, a, dupes);
        return <tr key={a.id} className={'click' + (isRecent(c, a) ? ' recent' : '')} style={a.status === 'Scratched' ? { opacity: .5 } : undefined} onClick={() => setEdit(a)}>
          <td><b>{a.name}</b></td><td>{a.age ?? ''}</td>
          <td><LevelPill name={levelName(c, a.levelId)} color={levelColor(c, a.levelId)} /></td>
          <td onClick={e => e.stopPropagation()}>
            <select value={a.flightId ?? ''} style={{ minWidth: 150 }} onChange={e => { const nf = c.flightById.get(e.target.value); void updateAthlete(a.id, nf ? { flightId: nf.id, levelId: nf.levelId } : { flightId: null }); }}>
              <option value="">Unassigned</option>
              {flights.filter(x => !a.levelId || x.levelId === a.levelId || x.id === a.flightId).map(x => <option key={x.id} value={x.id}>{flightLabel(c, x)} · {fmt(x.startMin)}</option>)}
            </select></td>
          <td className="time" style={{ color: a.overrideMin !== null ? 'var(--orange)' : undefined, whiteSpace: 'nowrap' }}>{fmt(athleteTime(c, a))}{a.overrideMin !== null && ' ⏱'}</td>
          <td onClick={e => e.stopPropagation()}>
            <select value={a.status} className={`st-${a.status}`} style={{ width: 130, fontWeight: 700 }} onChange={e => void updateAthlete(a.id, { status: e.target.value as Status })}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}</select></td>
          <td style={{ maxWidth: 320 }}><div className="row" style={{ gap: 4 }}><AlertPills alerts={al} /></div>{a.notes && <div className="small muted">{a.notes}</div>}{!f && !al.length ? '' : null}</td>
        </tr>; })}</tbody>
    </table></div>
    {list.length === 0 && <div className="empty">No athletes match.</div>}
    {edit && <AthleteEditor c={c} athlete={edit} onClose={() => setEdit(null)} />}
  </>;
}
