import { useState } from 'react';
import type { Ctx } from '../lib/derive';
import { activeIn, athleteAlerts, duplicateNames, flightAlerts, flightLabel, isRecent, levelColor, nowNext, sortedFlights } from '../lib/derive';
import { getState, shiftFlights, undoChange, updateEvent } from '../lib/store';
import { ago, fmt, nowMin } from '../lib/time';
import { AlertPills, LevelPill, toast, useTick } from '../components/ui';
import { AthleteEditor } from '../components/AthleteEditor';
import type { Athlete } from '../lib/types';
import { go } from '../lib/router';

export function Dashboard({ c }: { c: Ctx }) {
  useTick(20000);
  const [edit, setEdit] = useState<Athlete | null>(null);
  const dupes = duplicateNames(c);
  const active = c.athletes.filter(a => a.status !== 'Scratched');
  const flights = sortedFlights(c);
  const used = flights.filter(f => activeIn(c, f).length > 0 && f.startMin !== null);
  const problems = c.athletes.map(a => ({ a, al: athleteAlerts(c, a, dupes).filter(x => x.severity !== 'info') })).filter(x => x.al.length);
  const flightProblems = flights.map(f => ({ f, al: flightAlerts(c, f).filter(x => x.severity !== 'info') })).filter(x => x.al.length);
  const recent = c.athletes.filter(a => isRecent(c, a));
  const nn = nowNext(c);
  const changes = getState().data.changes.filter(x => x.eventId === c.event.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  const maxLvl = Math.max(1, ...c.levels.map(l => active.filter(a => a.levelId === l.id).length));

  const startFlight = (id: string | null) => {
    void updateEvent(c.event.id, { settings: { currentFlightId: id, currentStartedAt: id ? new Date().toISOString() : null } });
    if (id) {
      const f = c.flightById.get(id)!; const late = nowMin() - (f.startMin ?? nowMin());
      if (c.event.date === new Date().toISOString().slice(0, 10) && late >= 5)
        toast(`Running ${late} min late. Push the remaining flights back ${late} min?`, { label: `+${late} min`, run: () => void shiftFlights(c.event.id, (f.startMin ?? 0) + 1, late) }, 12000);
    }
  };

  return <>
    <div className="nowbar">
      <div className="now">
        <div className="lab">{nn.mode === 'preview' ? 'FIRST UP' : 'ON THE COURSE NOW'}</div>
        {!c.event.date && <div className="small" style={{ color: '#94A3B8' }}>Set the competition date in Settings so "Now" follows the clock on the day.</div>}
        {nn.current ? <>
          <div className="tm">{fmt(nn.current.startMin)}</div>
          <div className="fl">{flightLabel(c, nn.current, true)} · {activeIn(c, nn.current).length} athletes</div>
          {nn.lateMin !== null && nn.lateMin >= 3 && <div style={{ color: '#FCA5A5', fontWeight: 700, marginTop: 4 }}>Started {nn.lateMin} min late</div>}
        </> : nn.next[0] ? <>
          <div className="tm">{fmt(nn.next[0].startMin)}</div><div className="fl">{flightLabel(c, nn.next[0], true)}</div>
        </> : <div className="fl">No flights scheduled yet</div>}
        <div className="row" style={{ marginTop: 12 }}>
          {nn.next[0] && <button className="btn primary" onClick={() => startFlight(nn.next[0].id)}>
            ▶ Start {flightLabel(c, nn.next[0])}</button>}
          {nn.current && <button className="btn" onClick={() => go('flight/' + nn.current!.id)}>Open flight</button>}
          {c.event.settings.currentFlightId && <button className="btn ghost" style={{ color: '#CBD5E1' }} onClick={() => startFlight(null)}>Use clock</button>}
        </div>
      </div>
      <div className="card">
        <h3>Up next</h3>
        {(nn.current ? nn.next : nn.next.slice(1)).map(f =>
          <div key={f.id} className="row" style={{ padding: '6px 0' }}><span className="time big">{fmt(f.startMin)}</span>
            <LevelPill name={flightLabel(c, f)} color={levelColor(c, f.levelId)} /><span className="muted small">{activeIn(c, f).length} athletes</span></div>)}
        <RunningLate c={c} />
      </div>
    </div>

    <div className="tiles">
      <Tile k="Athletes" v={c.athletes.length} s={`${c.athletes.length - active.length} scratched`} />
      <Tile k="Competing" v={active.length} s="not scratched" />
      <Tile k="Flights" v={used.length} s={`of ${flights.length} set up`} />
      <Tile k="First flight" v={used[0] ? fmt(used[0].startMin) : '—'} s={used[0] ? flightLabel(c, used[0]) : ''} small />
      <Tile k="Last flight" v={used.length ? fmt(used[used.length - 1].startMin) : '—'} s={used.length ? flightLabel(c, used[used.length - 1]) : ''} small />
      <Tile k="Needs attention" v={problems.length + flightProblems.length} s={`${c.athletes.filter(a => a.status === 'Pending').length} pending review`} bad={problems.length + flightProblems.length > 0} />
      <Tile k="Changed recently" v={recent.length} s={`last ${c.event.settings.changeWindowMin} min`} />
      <Tile k="Results in" v={active.filter(a => a.resultStatus).length} s={`of ${active.length} · enter on Results tab`} />
    </div>

    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))' }}>
      <div className="card">
        <h2>Needs attention</h2>
        {problems.length + flightProblems.length === 0 && <div className="empty">✅ Everything looks good</div>}
        {flightProblems.map(({ f, al }) => <div key={f.id} className="attn">
          <div className="who"><b>{flightLabel(c, f)}</b></div><button className="btn sm" onClick={() => go('flights')}>Fix</button>
          <div className="pills"><AlertPills alerts={al} /></div></div>)}
        {problems.slice(0, 25).map(({ a, al }) => <div key={a.id} className="attn">
          <div className="who"><b>{a.name}</b><span className="muted small">{flightLabel(c, a.flightId ? c.flightById.get(a.flightId) : null)}</span></div>
          <button className="btn sm" onClick={() => setEdit(a)}>Fix</button>
          <div className="pills"><AlertPills alerts={al} /></div>{a.notes && <div className="small muted" style={{ gridColumn: 1 }}>{a.notes}</div>}</div>)}
        {problems.length > 25 && <a href="#/athletes">+{problems.length - 25} more on the Athletes tab</a>}
      </div>
      <div className="card">
        <h2>Athletes by level</h2>
        {c.levels.map(l => { const n = active.filter(a => a.levelId === l.id).length; return (
          <div key={l.id} style={{ margin: '8px 0' }}>
            <div className="row"><LevelPill name={l.name} color={l.color} /><span className="spacer" /><b>{n}</b>
              <span className="muted small">· {c.flights.filter(f => f.levelId === l.id).length} flights</span></div>
            <div className="bar" style={{ marginTop: 5 }}><i style={{ width: `${(n / maxLvl) * 100}%`, background: l.color }} /></div>
          </div>); })}
      </div>
      <div className="card">
        <div className="row"><h2 style={{ margin: 0 }}>Recent changes</h2><span className="spacer" /><a href="#/changes">All</a></div>
        {changes.length === 0 && <div className="empty">No changes yet</div>}
        {changes.map(ch => <div key={ch.id} className="small" style={{ padding: '7px 0', borderBottom: '1px solid var(--subtle)', opacity: ch.undone ? .5 : 1 }}>
          <div className="row"><b>{ch.target}</b><span className="muted">{ago(ch.at)}</span><span className="spacer" />
            {ch.undo && !ch.undone && <button className="btn sm" onClick={() => void undoChange(ch.id)}>Undo</button>}</div>
          <div>{ch.field}: <span className="muted">{ch.oldValue || '—'}</span> → <b>{ch.newValue || '—'}</b></div>
        </div>)}
      </div>
    </div>
    {edit && <AthleteEditor c={c} athlete={edit} onClose={() => setEdit(null)} />}
  </>;
}
const Tile = ({ k, v, s, bad, small }: { k: string; v: string | number; s?: string; bad?: boolean; small?: boolean }) =>
  <div className={'tile' + (bad ? ' bad' : '')}><div className="k">{k}</div><div className="v" style={small ? { fontSize: 26 } : undefined}>{v}</div><div className="s">{s}</div></div>;

export function RunningLate({ c }: { c: Ctx }) {
  const nn = nowNext(c);
  const from = (nn.current ? nn.next[0]?.startMin : nn.next[0]?.startMin) ?? 0;
  const go = async (d: number) => {
    const n = await shiftFlights(c.event.id, from, d);
    if (n) toast(`${n} flights moved ${d > 0 ? 'later' : 'earlier'} by ${Math.abs(d)} min`, { label: 'Undo', run: () => { const last = getState().data.changes.filter(x => x.field === 'Shifted').sort((a, b) => b.at.localeCompare(a.at))[0]; if (last) void undoChange(last.id); } });
  };
  return <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
    <div className="small muted" style={{ marginBottom: 6 }}><b>Running late?</b> Shift every flight from {fmt(from)} on:</div>
    <div className="row">{[5, 10, 15].map(d => <button key={d} className="btn sm" onClick={() => void go(d)}>+{d} min</button>)}
      <button className="btn sm" onClick={() => void go(-5)}>−5 min</button></div>
  </div>;
}
