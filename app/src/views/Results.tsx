import { useEffect, useRef, useState } from 'react';
import type { Ctx } from '../lib/derive';
import { activeIn, flightLabel, levelColor, nowNext, sortedFlights } from '../lib/derive';
import { fmt } from '../lib/time';
import { fmtPoints, fmtResult, parsePoints, parseResult, resultText, standings, verdict, ordinal, type Standing } from '../lib/results';
import { setOutcome, setResult, updateLevel } from '../lib/store';
import type { Athlete, Outcome, ResultStatus } from '../lib/types';
import { LevelPill, toast } from '../components/ui';
import { query } from '../lib/router';

export function Results({ c }: { c: Ctx }) {
  const flights = sortedFlights(c).filter(f => activeIn(c, f).length);
  const nn = nowNext(c);
  const firstOpen = flights.find(f => activeIn(c, f).some(a => !a.resultStatus));
  const [fid, setFid] = useState<string>(query('flight') ?? nn.current?.id ?? firstOpen?.id ?? flights[0]?.id ?? '');
  const f = c.flightById.get(fid) ?? flights[0];
  const [lvl, setLvl] = useState<string | null>(null);
  const levelId = lvl ?? f?.levelId ?? c.levels[0]?.id;
  const i = f ? flights.indexOf(f) : -1;
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  if (!f) return <div className="empty card">No flights with athletes yet.</div>;
  const runners = activeIn(c, f).sort((a, b) => a.name.localeCompare(b.name));
  const done = runners.filter(a => a.resultStatus).length;
  const goFlight = (id: string) => { setFid(id); setLvl(null); inputs.current = []; };

  return <div className="resgrid">
    <div>
      <div className="toolbar" data-tour="picker">
        <button className="btn" disabled={i <= 0} onClick={() => goFlight(flights[i - 1].id)}>◀</button>
        <select value={f.id} onChange={e => goFlight(e.target.value)} style={{ maxWidth: 360 }}>
          {flights.map(x => { const r = activeIn(c, x); const d = r.filter(a => a.resultStatus).length;
            return <option key={x.id} value={x.id}>{fmt(x.startMin)} · {flightLabel(c, x)} · {d}/{r.length}{d === r.length ? ' ✔' : ''}</option>; })}
        </select>
        <button className="btn" disabled={i >= flights.length - 1} onClick={() => goFlight(flights[i + 1].id)}>▶</button>
        <span className="spacer" /><span className="pill" style={{ background: levelColor(c, f.levelId) + '33' }}>{done}/{runners.length} entered</span>
      </div>
      <p className="muted small" style={{ marginTop: -4 }}>Type <b>points</b>, press Enter, type the <b>time</b> (42.31 or 1:05.40), press Enter: it saves and jumps to the next athlete. Fell? Type their points and tap <b>Fell</b>. Ranking: most points, then fastest time.</p>
      {c.event.settings.hideResultsUntilFinal && <div className="banner">Parents won't see scores for a level until you tick <b>Results final</b> on its leaderboard.</div>}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {runners.map((a, k) => <EntryRow key={a.id} c={c} a={a} first={k === 0} inputRef={el => { inputs.current[k] = el; }}
          onSaved={() => { const nx = inputs.current[k + 1]; if (nx) nx.focus(); else if (flights[i + 1]) toast('Flight complete ✔', { label: 'Next flight ▶', run: () => goFlight(flights[i + 1].id) }); }} />)}
      </div>
    </div>
    <div>
      {levelId && <Leaderboard c={c} levelId={levelId} onLevel={setLvl} />}
    </div>
  </div>;
}

function EntryRow({ c, a, inputRef, onSaved, first }: { c: Ctx; a: Athlete; inputRef: (el: HTMLInputElement | null) => void; onSaved: () => void; first?: boolean }) {
  const ptsTxt = () => (a.resultPoints !== null && a.resultPoints !== undefined ? String(+a.resultPoints) : '');
  const timeTxt = () => (a.resultStatus === 'Finished' ? fmtResult(a.resultMs) : '');
  const [pv, setPv] = useState(ptsTxt);
  const [tv, setTv] = useState(timeTxt);
  const [bad, setBad] = useState<'' | 'pts' | 'time'>('');
  const timeRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { setPv(ptsTxt()); setTv(timeTxt()); }, [a.resultStatus, a.resultMs, a.resultPoints]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = a.levelId ? standings(c, a.levelId).find(s => s.a.id === a.id) : undefined;
  /** Save what's typed. Time present -> Finished; points only -> keep current DNF, else Finished without time. */
  const save = (advance: boolean) => {
    const pts = parsePoints(pv), ms = tv.trim() ? parseResult(tv) : null;
    if (Number.isNaN(pts as number)) { setBad('pts'); toast(`"${pv}" isn't a points number`); return false; }
    if (tv.trim() && (ms === null || ms <= 0)) { setBad('time'); toast(`"${tv}" isn't a time. Use 42.31 or 1:05.40`); return false; }
    setBad('');
    if (pts === null && ms === null) return true;
    if (ms !== null) setTv(fmtResult(ms));
    const status: ResultStatus = ms === null && a.resultStatus === 'DNF' ? 'DNF' : 'Finished';
    void setResult(a.id, status, ms, pts);
    if (advance) onSaved();
    return true;
  };
  const mark = (s: ResultStatus) => {
    const pts = parsePoints(pv);
    void setResult(a.id, s, null, s === 'DNF' && !Number.isNaN(pts as number) ? pts : null);
    setTv(''); if (s !== 'DNF') setPv(''); onSaved();
  };
  return <div className={'entry' + (a.resultStatus ? ' has' : '')}>
    <div className="who"><b>{a.name}</b>{a.age !== null && <span className="muted small"> · {a.age}</span>}
      <div className="small muted">{st?.rank ? `${ordinal(st.rank)} in ${c.levelById.get(a.levelId!)?.name}` : a.resultStatus ? resultText(a) : 'not entered'}</div></div>
    <input data-tour={first ? 'pts' : undefined} ref={inputRef} className={'ptsin' + (bad === 'pts' ? ' bad' : '')} inputMode="decimal" enterKeyHint="next" placeholder="pts" value={pv}
      onChange={e => setPv(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); timeRef.current?.focus(); } }}
      aria-label={`Points for ${a.name}`} />
    <input data-tour={first ? 'time' : undefined} ref={timeRef} className={'timein' + (bad === 'time' ? ' bad' : '')} inputMode="decimal" enterKeyHint="next" placeholder="time" value={tv}
      onChange={e => setTv(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(true); } }} onBlur={() => save(false)}
      aria-label={`Time for ${a.name}`} />
    <div className="seg mini" data-tour={first ? 'fell' : undefined}>{(['DNF', 'DNS', 'DQ'] as ResultStatus[]).map(s =>
      <button key={s} className={a.resultStatus === s ? 'on' : ''} onClick={() => mark(s)}
        title={s === 'DNF' ? 'Fell / did not finish: keeps the points typed, no time' : s === 'DNS' ? 'Did not start' : 'Disqualified'}>{s === 'DNF' ? 'Fell' : s}</button>)}</div>
    <button data-tour={first ? 'clear' : undefined} className="btn sm ghost" disabled={!a.resultStatus} onClick={() => { void setResult(a.id, null, null); setTv(''); setPv(''); }} aria-label="Clear result">✕</button>
  </div>;
}

export function Leaderboard({ c, levelId, onLevel, readOnly }: { c: Ctx; levelId: string; onLevel?: (id: string) => void; readOnly?: boolean }) {
  const lvl = c.levelById.get(levelId);
  if (!lvl) return null;
  const st = standings(c, levelId);
  return <div className="card" data-tour={readOnly ? undefined : 'board'}>
    <div className="row" style={{ marginBottom: 8 }}>
      <h2 style={{ margin: 0 }}>Leaderboard</h2><span className="spacer" />
      {onLevel ? <select value={levelId} onChange={e => onLevel(e.target.value)} style={{ width: 'auto' }}>
        {c.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select> : <LevelPill name={lvl.name} color={lvl.color} />}
    </div>
    <div className="small muted" style={{ marginBottom: 8 }}>Ranked by most points, then fastest time.</div>
    {!readOnly && <div className="row small" style={{ marginBottom: 10, gap: 14 }}>
      <label className="row" data-tour="topn" style={{ gap: 6 }}>Top
        <input type="number" min={0} inputMode="numeric" defaultValue={lvl.advanceCount} key={lvl.id + lvl.advanceCount} style={{ width: 72, minHeight: 36, padding: '4px 8px' }}
          onBlur={e => void updateLevel(lvl.id, { advanceCount: Math.max(0, +e.target.value || 0) })} /> advance</label>
      <label className="row" data-tour="final" style={{ gap: 6 }}><input type="checkbox" checked={lvl.resultsFinal} onChange={e => void updateLevel(lvl.id, { resultsFinal: e.target.checked })} />
        <b>Results final</b> <span className="muted">(tells parents Advancing / Done)</span></label>
    </div>}
    <table className="t lb"><thead><tr><th>#</th><th>Athlete</th><th>Pts</th><th>Time</th><th>Status</th>{!readOnly && <th>Override</th>}</tr></thead>
      <tbody>{st.map((s: Standing, si: number) => { const vd = verdict(c, s.a, st); return <tr key={s.a.id} className={vd.kind === 'advance' ? 'adv' : ''}>
        <td className="muted">{s.rank ?? ''}</td><td><b>{s.a.name}</b></td>
        <td className="time">{fmtPoints(s.a.resultPoints).replace(' pts', '') || <span className="muted">—</span>}</td>
        <td className="time">{s.a.resultStatus === 'Finished' ? fmtResult(s.a.resultMs) : s.a.resultStatus === 'DNF' ? 'fell' : s.a.resultStatus ?? <span className="muted">—</span>}</td>
        <td><span className={'pill v-' + vd.kind}>{vd.short || (s.a.resultStatus ? '' : 'waiting')}</span></td>
        {!readOnly && <td data-tour={si === 0 ? 'override' : undefined}><select value={s.a.outcome ?? ''} style={{ minHeight: 34, padding: '4px 6px', fontSize: 14 }}
          onChange={e => void setOutcome(s.a.id, (e.target.value || null) as Outcome | null)}>
          <option value="">Auto</option><option value="advance">Advancing</option><option value="done">Done</option></select></td>}
      </tr>; })}</tbody></table>
    {st.length === 0 && <div className="empty">No athletes in this level.</div>}
  </div>;
}
