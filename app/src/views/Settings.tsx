import { useEffect, useState } from 'react';
import type { Ctx } from '../lib/derive';
import { createEvent, deleteEvent, deleteLevel, getState, saveLevel, setActiveEvent, updateEvent, useApp } from '../lib/store';
import { supabase } from '../lib/backend';
import { toast } from '../components/ui';
import { athleteTime, flightLabel, levelName, scheduleSort } from '../lib/derive';
import { fmt } from '../lib/time';
import { fmtResult } from '../lib/results';
import { go } from '../lib/router';

export function Settings({ c }: { c: Ctx }) {
  const app = useApp();
  const s = c.event.settings;
  const setS = (p: Partial<typeof s>) => void updateEvent(c.event.id, { settings: p });
  return <div className="grid" style={{ maxWidth: 900 }}>
    <h1>Settings</h1>
    <div className="card form">
      <h2>Competition</h2>
      <div className="two">
        <label className="f">Name<input type="text" defaultValue={c.event.name} onBlur={e => e.target.value.trim() && void updateEvent(c.event.id, { name: e.target.value.trim() })} /></label>
        <label className="f">Date<input type="date" defaultValue={c.event.date ?? ''} onBlur={e => void updateEvent(c.event.id, { date: e.target.value || null })} /></label>
        <label className="f">Max athletes per flight<input type="number" defaultValue={s.maxPerFlight} onBlur={e => setS({ maxPerFlight: Math.max(1, +e.target.value || 10) })} /></label>
        <label className="f">Flight length (minutes)<input type="number" defaultValue={s.flightLengthMin} onBlur={e => setS({ flightLengthMin: Math.max(1, +e.target.value || 15) })} /></label>
        <label className="f">Highlight changes for (minutes)<input type="number" defaultValue={s.changeWindowMin} onBlur={e => setS({ changeWindowMin: Math.max(1, +e.target.value || 60) })} /></label>
      </div>
      <label className="row"><input type="checkbox" checked={s.published} onChange={e => setS({ published: e.target.checked })} /> <b>Public schedule is visible</b> <span className="muted small">(turn off to hide it while you're still arranging)</span></label>
      <label className="row"><input type="checkbox" checked={s.publicShowAge} onChange={e => setS({ publicShowAge: e.target.checked })} /> Show ages on the public schedule</label>
    </div>

    <div className="card form">
      <div className="row"><h2 style={{ margin: 0 }}>Levels</h2><span className="spacer" /><button className="btn sm" onClick={() => void saveLevel({ eventId: c.event.id })}>+ Add level</button></div>
      {c.levels.map((l, i) => <div key={l.id} className="row" style={{ flexWrap: 'nowrap' }}>
        <input type="color" value={l.color} onChange={e => void saveLevel({ ...l, color: e.target.value })} style={{ width: 48, height: 44, border: 0, background: 'none' }} />
        <input type="text" defaultValue={l.name} onBlur={e => e.target.value.trim() && void saveLevel({ ...l, name: e.target.value.trim() })} />
        <button className="btn sm" disabled={i === 0} onClick={() => { const p = c.levels[i - 1]; void saveLevel({ ...l, sort: p.sort }); void saveLevel({ ...p, sort: l.sort }); }}>↑</button>
        <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{c.flights.filter(f => f.levelId === l.id).length} flights</span>
        <button className="btn sm danger" onClick={() => deleteLevel(l.id).catch(e => toast(e.message))}>✕</button>
      </div>)}
    </div>

    <div className="card form">
      <h2>Competitions</h2>
      {getState().data.events.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(e => <div key={e.id} className="row">
        <b>{e.name}</b><span className="muted small">{e.date ?? ''}</span><span className="spacer" />
        {e.id === app.activeEventId ? <span className="pill st-Confirmed">Open</span> : <button className="btn sm" onClick={() => setActiveEvent(e.id)}>Open</button>}
        <button className="btn sm danger" onClick={() => { if (prompt(`Type DELETE to permanently delete "${e.name}" and all its athletes`) === 'DELETE') void deleteEvent(e.id); }}>Delete</button>
      </div>)}
      <div className="row"><button className="btn" onClick={() => go('import')}>+ Import a competition</button>
        <button className="btn" onClick={async () => { const n = prompt('Name for the copy?', c.event.name + ' (copy)'); if (n) { await duplicate(c, n); toast('Copied'); } }}>Duplicate this competition</button></div>
    </div>

    <div className="card form">
      <h2>Backup</h2>
      <div className="row">
        <button className="btn" onClick={() => downloadCsv(c)}>⬇ Download schedule (CSV)</button>
        <button className="btn" onClick={() => download(`${c.event.name}-backup.json`, JSON.stringify(snapshot(c), null, 1), 'application/json')}>⬇ Full backup (JSON)</button>
      </div>
      <span className="small muted">The CSV opens in Excel or Google Sheets.</span>
    </div>

    <CloudCard />
  </div>;
}

function CloudCard() {
  const app = useApp();
  const sb = supabase();
  const [editors, setEditors] = useState<{ email: string }[] | null>(null);
  const [email, setEmail] = useState('');
  useEffect(() => { if (sb && app.mode === 'cloud') void sb.from('editors').select('email').then(r => setEditors(r.data ?? [])); }, [sb, app.mode]);
  if (app.mode === 'local') return <div className="card"><h2>Sharing &amp; sync</h2>
    <p>This copy saves on <b>this device only</b>. To let the coach edit from any device and give everyone a live public link, connect the free cloud database. The steps are in <code>SETUP.md</code>.</p></div>;
  return <div className="card form"><h2>People who can edit</h2>
    <p className="small muted">Anyone can view the public schedule. Only these emails can sign in and make changes. Each person creates their password on the sign-in screen.</p>
    {editors?.map(e => <div key={e.email} className="row"><span>{e.email}</span><span className="spacer" />
      <button className="btn sm danger" onClick={async () => { if (confirm(`Remove ${e.email}?`)) { await sb!.from('editors').delete().eq('email', e.email); setEditors(editors.filter(x => x.email !== e.email)); } }}>Remove</button></div>)}
    <div className="row" style={{ flexWrap: 'nowrap' }}><input type="email" placeholder="coach@example.com" value={email} onChange={e => setEmail(e.target.value)} />
      <button className="btn primary" onClick={async () => {
        const em = email.trim().toLowerCase(); if (!em) return;
        const { error } = await sb!.from('editors').insert({ email: em }); if (error) { toast(error.message); return; }
        setEditors([...(editors ?? []), { email: em }]); setEmail(''); toast(`${em} can now sign in and edit`);
      }}>Add</button></div>
  </div>;
}

function snapshot(c: Ctx) {
  const d = getState().data;
  return { event: c.event, levels: c.levels, flights: c.flights, athletes: c.athletes, changes: d.changes.filter(x => x.eventId === c.event.id) };
}
async function duplicate(c: Ctx, name: string) {
  await createEvent(name, c.event.date, {
    levels: c.levels.map(l => l.name),
    flights: c.flights.map(f => ({ level: levelName(c, f.levelId), number: f.number, startMin: f.startMin, notes: f.notes, count: 0 })),
    athletes: c.athletes.map(a => { const f = a.flightId ? c.flightById.get(a.flightId) : undefined;
      return { name: a.name, level: levelName(c, a.levelId), flight: f?.number ?? null, age: a.age, overrideMin: a.overrideMin, status: a.status, notes: a.notes, srcRow: a.srcRow ?? 0 }; }),
    issues: [],
  });
}
function download(name: string, body: string, type: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function downloadCsv(c: Ctx) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Start Time', 'Flight', 'Level', 'Athlete', 'Age', 'Status', 'Time Override', 'Result', 'Notes']];
  for (const a of scheduleSort(c, c.athletes)) {
    rows.push([fmt(athleteTime(c, a)), flightLabel(c, a.flightId ? c.flightById.get(a.flightId) : null), levelName(c, a.levelId), a.name, String(a.age ?? ''), a.status, a.overrideMin !== null ? fmt(a.overrideMin) : '', a.resultStatus === 'Finished' ? fmtResult(a.resultMs) : (a.resultStatus ?? ''), a.notes]);
  }
  download(`${c.event.name} schedule.csv`, rows.map(r => r.map(esc).join(',')).join('\n'), 'text/csv');
}
