import { useEffect, useState } from 'react';
import type { Ctx } from '../lib/derive';
import { activeIn, athleteTime, flightLabel, levelColor, nowNext, sortedFlights } from '../lib/derive';
import { fmt } from '../lib/time';
import { usePublicCtx } from '../lib/publicData';
import { useTick } from '../components/ui';
import { query } from '../lib/router';
import { latestResults, resultText, standings, verdict, ordinal } from '../lib/results';
import { Leaderboard } from './Results';

export function PublicPage({ eventId }: { eventId?: string }) {
  const { c, loading, error, updated } = usePublicCtx(eventId);
  useTick(30000);
  if (loading) return <div className="empty">Loading schedule…</div>;
  if (!c) return <div className="empty">{error ? `Couldn't load the schedule (${error}).` : 'Schedule not found. Check the link.'}</div>;
  if (!c.event.settings.published) return <div className="pub"><div className="pubhead"><h1>{c.event.name}</h1></div><div className="empty">The schedule isn't posted yet. Check back soon.</div></div>;
  return <PublicBody c={c} updated={updated} />;
}

function PublicBody({ c, updated }: { c: Ctx; updated: Date | null }) {
  const [q, setQ] = useState(query('q') ?? '');
  const [lvl, setLvl] = useState('all');
  const [tab, setTab] = useState<'schedule' | 'results'>(query('tab') === 'results' ? 'results' : 'schedule');
  useTick(5000);
  const posted = latestResults(c, 10 * 60000).slice(0, 3);
  const nn = nowNext(c);
  const ql = q.trim().toLowerCase();
  const flights = sortedFlights(c).filter(f => (lvl === 'all' || f.levelId === lvl) && activeIn(c, f).length > 0);
  const shown = ql ? flights.filter(f => activeIn(c, f).some(a => a.name.toLowerCase().includes(ql))) : flights;
  const matches = ql ? c.athletes.filter(a => a.status !== 'Scratched' && a.name.toLowerCase().includes(ql)) : [];
  const curIdx = nn.current ? flights.indexOf(nn.current) : -1;
  const mark = (name: string) => {
    if (!ql) return name; const i = name.toLowerCase().indexOf(ql); if (i < 0) return name;
    return <>{name.slice(0, i)}<mark>{name.slice(i, i + ql.length)}</mark>{name.slice(i + ql.length)}</>;
  };
  return <>
    <div className="pubhead"><div className="pub" style={{ padding: 0 }}>
      <h1>{c.event.name}</h1>
      <div className="sub">{c.event.date ? new Date(c.event.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + ' · ' : ''}
        Live schedule{updated ? ` · updated ${updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</div>
      {(nn.current || nn.next[0]) && nn.mode !== 'preview' && <div style={{ marginTop: 12, background: 'rgba(255,255,255,.08)', borderRadius: 12, padding: '10px 12px' }}>
        {nn.current && <div><b style={{ color: 'var(--accent)' }}>NOW</b> &nbsp;{fmt(nn.current.startMin)} · {flightLabel(c, nn.current, true)}</div>}
        {nn.next[0] && <div style={{ opacity: .85 }}><b>NEXT</b> &nbsp;{fmt(nn.next[0].startMin)} · {flightLabel(c, nn.next[0], true)}</div>}
      </div>}
    </div></div>
    <div className="pub">
      <div className="pubsearch">
        <input type="search" placeholder="🔍 Find an athlete…" value={q} onChange={e => setQ(e.target.value)} style={{ fontSize: 18 }} />
        <div className="seg" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
          <button className={lvl === 'all' ? 'on' : ''} onClick={() => setLvl('all')}>All</button>
          {c.levels.map(l => <button key={l.id} className={lvl === l.id ? 'on' : ''} onClick={() => setLvl(l.id)} style={{ whiteSpace: 'nowrap' }}>{l.name}</button>)}
        </div>
      </div>
      <div className="seg" style={{ marginBottom: 12, width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <button className={tab === 'schedule' ? 'on' : ''} onClick={() => setTab('schedule')}>🗓 Schedule</button>
        <button className={tab === 'results' ? 'on' : ''} onClick={() => setTab('results')}>🏆 Results</button>
      </div>
      {posted.length > 0 && !ql && <div className="justposted">
        <div className="small muted" style={{ fontWeight: 700 }}>JUST POSTED</div>
        {posted.map(a => { const lv = c.levelById.get(a.levelId ?? ''); const st = a.levelId ? standings(c, a.levelId).find(s => s.a.id === a.id) : undefined;
          return <div key={a.id + a.resultAt} className={'jp' + (Date.now() - Date.parse(a.resultAt!) < 60000 ? ' fresh' : '')}>
            <b>{a.name}</b><span className="muted small">{lv?.name}</span><span className="spacer" />
            {st?.rank && <span className="small">{ordinal(st.rank)}</span>}<b className="time" style={{ fontSize: 20 }}>{resultText(a)}</b></div>; })}
      </div>}
      {ql && <div className="card" style={{ marginBottom: 12 }}>
        {matches.length === 0 ? <span className="muted">No athlete matches "{q}".</span> : matches.slice(0, 8).map(a => {
          const f = a.flightId ? c.flightById.get(a.flightId) : undefined;
          const vd = verdict(c, a);
          return <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--subtle)' }}>
            <div className="row"><b style={{ fontSize: 18 }}>{a.name}</b><span className="spacer" />
              <span className="time" style={{ fontSize: 22 }}>{fmt(athleteTime(c, a))}</span><span className="muted">{flightLabel(c, f, true)}</span></div>
            {a.resultStatus ? <div className={'resultcard v-' + vd.kind}><div className="row"><span>Result</span><span className="spacer" /><span className="big time">{resultText(a)}</span></div>
              <div>{vd.label}</div></div> : <div className="small muted" style={{ marginTop: 4 }}>No result yet. Times appear here right after the run.</div>}
          </div>;
        })}
      </div>}
      {tab === 'results' && c.levels.filter(l => (lvl === 'all' || l.id === lvl) && c.athletes.some(a => a.levelId === l.id && a.status !== 'Scratched')).map(l =>
        <div key={l.id} style={{ marginBottom: 12 }}><Leaderboard c={c} levelId={l.id} readOnly /></div>)}
      {tab === 'schedule' && shown.map((f, i) => {
        const list = activeIn(c, f).sort((a, b) => a.name.localeCompare(b.name));
        const idx = flights.indexOf(f);
        return <div key={f.id} className={'pflight' + (nn.current?.id === f.id ? ' now' : '') + (curIdx >= 0 && idx < curIdx && !ql ? ' done' : '')}>
          <div className="ph" style={{ background: levelColor(c, f.levelId) + '26', borderTop: `5px solid ${levelColor(c, f.levelId)}` }}>
            <span className="tm">{fmt(f.startMin)}</span><b style={{ fontSize: 17 }}>{flightLabel(c, f, true)}</b><span className="spacer" />
            {nn.current?.id === f.id ? <span className="pill nowpill">NOW</span> : <span className="muted small">{list.length}</span>}
          </div>
          <ul>{list.map(a => <li key={a.id}>{a.resultStatus && <span className="res">{resultText(a)}</span>}{mark(a.name)}{c.event.settings.publicShowAge && a.age !== null && <span className="muted small"> · {a.age}</span>}
            {a.overrideMin !== null && <span className="small" style={{ color: 'var(--orange)' }}> · {fmt(a.overrideMin)}</span>}</li>)}</ul>
          {f.notes && <div className="fnote">▶ {f.notes}</div>}
          {i === shown.length - 1 ? null : null}
        </div>;
      })}
      {tab === 'schedule' && shown.length === 0 && <div className="empty">No flights to show.</div>}
      <p className="small muted" style={{ textAlign: 'center' }}>Times can change during the event. This page refreshes automatically.</p>
    </div>
  </>;
}

export function PrintPage({ eventId }: { eventId?: string }) {
  const { c } = usePublicCtx(eventId);
  if (!c) return <div className="empty">Loading…</div>;
  const mode = query('mode') ?? 'flight';
  const flights = sortedFlights(c).filter(f => activeIn(c, f).length);
  const athletes = c.athletes.filter(a => a.status !== 'Scratched').sort((a, b) => a.name.localeCompare(b.name));
  return <div className="print">
    <div className="noprint row" style={{ marginBottom: 14 }}>
      <a className="btn" href={`#/print/${c.event.id}?mode=flight`}>By flight</a><a className="btn" href={`#/print/${c.event.id}?mode=name`}>Athlete A–Z</a>
      <span className="spacer" /><button className="btn primary" onClick={() => print()}>🖨 Print / Save PDF</button></div>
    <h1>{c.event.name}{mode === 'name' ? ' — Athlete list' : ' — Schedule'}</h1>
    <div className="meta">{c.event.date ?? ''} · Printed {new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · times subject to change</div>
    {mode === 'name' ? <table><thead><tr><th>Athlete</th><th>Start</th><th>Flight</th>{c.event.settings.publicShowAge && <th>Age</th>}<th>Result</th><th>✓</th></tr></thead>
      <tbody>{athletes.map(a => <tr key={a.id}><td><b>{a.name}</b></td><td>{fmt(athleteTime(c, a))}</td><td>{flightLabel(c, a.flightId ? c.flightById.get(a.flightId) : null)}</td>
        {c.event.settings.publicShowAge && <td>{a.age ?? ''}</td>}<td>{resultText(a)}</td><td>☐</td></tr>)}</tbody></table>
      : flights.map(f => <div key={f.id} className="pg">
        <div className="h" style={{ background: levelColor(c, f.levelId) + '40' }}><span>{fmt(f.startMin)}</span><span>{flightLabel(c, f, true)}</span><span style={{ marginLeft: 'auto' }}>{activeIn(c, f).length} athletes</span></div>
        <ol>{activeIn(c, f).sort((a, b) => a.name.localeCompare(b.name)).map(a => <li key={a.id}>{a.name}{a.overrideMin !== null ? ` (${fmt(a.overrideMin)})` : ''}</li>)}</ol>
        {f.notes && <div style={{ padding: '0 10px 6px', fontStyle: 'italic', fontWeight: 700 }}>▶ {f.notes}</div>}
      </div>)}
  </div>;
}

export function TvPage({ eventId }: { eventId?: string }) {
  const { c } = usePublicCtx(eventId);
  useTick(2000);
  const [rot, setRot] = useState(0);
  useEffect(() => { const t = setInterval(() => setRot(r => r + 1), 12000); return () => clearInterval(t); }, []);
  if (!c) return <div className="tv"><div className="empty">Loading…</div></div>;
  const flash = latestResults(c, 25000)[0];   // newest time posted in the last 25 s
  const header = <div className="row"><div style={{ fontSize: '2.6vw', fontWeight: 800 }}>{c.event.name}</div><span className="spacer" />
    <div className="clock">{new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div></div>;
  const flashEl = flash && (() => { const st = flash.levelId ? standings(c, flash.levelId).find(s => s.a.id === flash.id) : undefined;
    const lv = c.levelById.get(flash.levelId ?? '');
    return <div className="tvflash" key={flash.id + flash.resultAt}><div className="card2">
      <div className="lab" style={{ color: 'var(--accent)', fontWeight: 800, letterSpacing: '.3vw', fontSize: '1.6vw' }}>NEW RESULT</div>
      <div className="nm">{flash.name}</div><div className="tm">{resultText(flash)}</div>
      <div className="rk" style={{ color: lv?.color }}>{st?.rank ? `${ordinal(st.rank)} in ${lv?.name}` : lv?.name}</div></div></div>; })();

  if (query('mode') === 'results') {
    const lvls = c.levels.filter(l => c.athletes.some(a => a.levelId === l.id && a.resultStatus));
    const latest = latestResults(c, 3600000)[0];
    const show = lvls.length ? (latest && rot % 2 === 0 ? c.levelById.get(latest.levelId!) ?? lvls[0] : lvls[rot % lvls.length]) : null;
    const st = show ? standings(c, show.id).filter(s => s.a.resultStatus).slice(0, 12) : [];
    return <div className="tv">{header}
      <div className="box">{show ? <>
        <div className="lab">LEADERBOARD</div><div className="fl" style={{ color: show.color }}>{show.name}{show.resultsFinal ? ' · FINAL' : ''}</div>
        <table><tbody>{st.map(s => { const vd = verdict(c, s.a); return <tr key={s.a.id}>
          <td style={{ width: '8%', color: '#94A3B8' }}>{s.rank ?? ''}</td><td><b>{s.a.name}</b></td>
          <td style={{ textAlign: 'right', fontWeight: 800 }}>{resultText(s.a)}</td>
          <td style={{ textAlign: 'right', width: '22%', color: vd.kind === 'advance' ? '#4ADE80' : '#94A3B8' }}>{vd.kind === 'advance' ? 'Advancing' : vd.kind === 'done' ? 'Done' : ''}</td></tr>; })}</tbody></table>
      </> : <div className="fl">Results will appear here as athletes finish.</div>}</div>
      {flashEl}
    </div>;
  }

  const nn = nowNext(c);
  const main = nn.current ?? nn.next[0];
  const rest = nn.current ? nn.next : nn.next.slice(1);
  const box = (f: typeof main, label: string, small = false) => f && <div className={'box' + (small ? ' small' : '')} key={f.id + label}>
    <div className="lab">{label}</div><div className="tm">{fmt(f.startMin)}</div>
    <div className="fl" style={{ color: levelColor(c, f.levelId) }}>{flightLabel(c, f, true)}</div>
    <ul>{activeIn(c, f).sort((a, b) => a.name.localeCompare(b.name)).map(a => <li key={a.id}>{a.name}{a.resultStatus && <span style={{ float: 'right', marginRight: '2vw', color: '#FDE68A', fontWeight: 800 }}>{resultText(a)}</span>}</li>)}</ul></div>;
  return <div className="tv">{header}
    <div className="cols">
      {box(main, nn.current ? 'NOW ON THE COURSE' : 'FIRST UP') ?? <div className="box"><div className="fl">No flights scheduled</div></div>}
      <div style={{ display: 'grid', gap: '2vw', alignContent: 'start' }}>{rest.map((f, i) => box(f, i === 0 ? 'UP NEXT' : 'ON DECK', true))}</div>
    </div>
    {flashEl}
  </div>;
}
