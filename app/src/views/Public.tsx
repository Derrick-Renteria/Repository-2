import { useState } from 'react';
import type { Ctx } from '../lib/derive';
import { activeIn, athleteTime, flightLabel, levelColor, nowNext, sortedFlights } from '../lib/derive';
import { fmt } from '../lib/time';
import { usePublicCtx } from '../lib/publicData';
import { useTick } from '../components/ui';
import { query } from '../lib/router';

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
      {ql && <div className="card" style={{ marginBottom: 12 }}>
        {matches.length === 0 ? <span className="muted">No athlete matches "{q}".</span> : matches.slice(0, 8).map(a => {
          const f = a.flightId ? c.flightById.get(a.flightId) : undefined;
          return <div key={a.id} className="row" style={{ padding: '6px 0' }}><b style={{ fontSize: 18 }}>{a.name}</b><span className="spacer" />
            <span className="time" style={{ fontSize: 22 }}>{fmt(athleteTime(c, a))}</span><span className="muted">{flightLabel(c, f, true)}</span></div>;
        })}
      </div>}
      {shown.map((f, i) => {
        const list = activeIn(c, f).sort((a, b) => a.name.localeCompare(b.name));
        const idx = flights.indexOf(f);
        return <div key={f.id} className={'pflight' + (nn.current?.id === f.id ? ' now' : '') + (curIdx >= 0 && idx < curIdx && !ql ? ' done' : '')}>
          <div className="ph" style={{ background: levelColor(c, f.levelId) + '26', borderTop: `5px solid ${levelColor(c, f.levelId)}` }}>
            <span className="tm">{fmt(f.startMin)}</span><b style={{ fontSize: 17 }}>{flightLabel(c, f, true)}</b><span className="spacer" />
            {nn.current?.id === f.id ? <span className="pill" style={{ background: '#DCFCE7', color: '#15803D' }}>NOW</span> : <span className="muted small">{list.length}</span>}
          </div>
          <ul>{list.map(a => <li key={a.id}>{mark(a.name)}{c.event.settings.publicShowAge && a.age !== null && <span className="muted small"> · {a.age}</span>}
            {a.overrideMin !== null && <span className="small" style={{ color: '#C2410C' }}> · {fmt(a.overrideMin)}</span>}</li>)}</ul>
          {f.notes && <div className="fnote">▶ {f.notes}</div>}
          {i === shown.length - 1 ? null : null}
        </div>;
      })}
      {shown.length === 0 && <div className="empty">No flights to show.</div>}
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
    {mode === 'name' ? <table><thead><tr><th>Athlete</th><th>Start</th><th>Flight</th>{c.event.settings.publicShowAge && <th>Age</th>}<th>✓</th></tr></thead>
      <tbody>{athletes.map(a => <tr key={a.id}><td><b>{a.name}</b></td><td>{fmt(athleteTime(c, a))}</td><td>{flightLabel(c, a.flightId ? c.flightById.get(a.flightId) : null)}</td>
        {c.event.settings.publicShowAge && <td>{a.age ?? ''}</td>}<td>☐</td></tr>)}</tbody></table>
      : flights.map(f => <div key={f.id} className="pg">
        <div className="h" style={{ background: levelColor(c, f.levelId) + '40' }}><span>{fmt(f.startMin)}</span><span>{flightLabel(c, f, true)}</span><span style={{ marginLeft: 'auto' }}>{activeIn(c, f).length} athletes</span></div>
        <ol>{activeIn(c, f).sort((a, b) => a.name.localeCompare(b.name)).map(a => <li key={a.id}>{a.name}{a.overrideMin !== null ? ` (${fmt(a.overrideMin)})` : ''}</li>)}</ol>
        {f.notes && <div style={{ padding: '0 10px 6px', fontStyle: 'italic', fontWeight: 700 }}>▶ {f.notes}</div>}
      </div>)}
  </div>;
}

export function TvPage({ eventId }: { eventId?: string }) {
  const { c } = usePublicCtx(eventId);
  useTick(15000);
  if (!c) return <div className="tv"><div className="empty">Loading…</div></div>;
  const nn = nowNext(c);
  const main = nn.current ?? nn.next[0];
  const rest = nn.current ? nn.next : nn.next.slice(1);
  const box = (f: typeof main, label: string, small = false) => f && <div className={'box' + (small ? ' small' : '')} key={f.id + label}>
    <div className="lab">{label}</div><div className="tm">{fmt(f.startMin)}</div>
    <div className="fl" style={{ color: levelColor(c, f.levelId) }}>{flightLabel(c, f, true)}</div>
    <ul>{activeIn(c, f).sort((a, b) => a.name.localeCompare(b.name)).map(a => <li key={a.id}>{a.name}</li>)}</ul></div>;
  return <div className="tv">
    <div className="row"><div style={{ fontSize: '2.6vw', fontWeight: 800 }}>{c.event.name}</div><span className="spacer" />
      <div className="clock">{new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div></div>
    <div className="cols">
      {box(main, nn.current ? 'NOW ON THE COURSE' : 'FIRST UP') ?? <div className="box"><div className="fl">No flights scheduled</div></div>}
      <div style={{ display: 'grid', gap: '2vw', alignContent: 'start' }}>{rest.map((f, i) => box(f, i === 0 ? 'UP NEXT' : 'ON DECK', true))}</div>
    </div>
  </div>;
}
