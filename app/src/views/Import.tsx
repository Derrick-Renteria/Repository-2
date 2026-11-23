import { useState } from 'react';
import { analyze, parseTable, sheetCsvUrls, type ImportResult } from '../lib/importer';
import { createEvent } from '../lib/store';
import { fmt, todayISO } from '../lib/time';
import { go } from '../lib/router';
import { toast } from '../components/ui';

export function Import() {
  const [link, setLink] = useState('');
  const [text, setText] = useState('');
  const [res, setRes] = useState<ImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');

  const run = (raw: string, title?: string) => {
    try { const r = analyze(parseTable(raw)); setRes(r); setErr(null); if (title && !name) setName(title); }
    catch (e) { setErr((e as Error).message); setRes(null); }
  };
  const fromLink = async () => {
    const urls = sheetCsvUrls(link);
    if (!urls.length) { setErr('That doesn\'t look like a Google Sheets link.'); return; }
    setBusy(true);
    try {
      for (const url of urls) {
        try {
          const r = await fetch(url); if (!r.ok) continue;
          const t = await r.text(); if (/^\s*<!doctype html/i.test(t)) continue;
          run(t); return;
        } catch { /* try the next address */ }
      }
      setErr('Couldn\'t read the sheet from the link. Make sure it is shared as "Anyone with the link can view" — or use option 2 or 3 below.');
    } finally { setBusy(false); }
  };

  const review = res?.issues.filter(i => i.severity === 'review') ?? [];
  const info = res?.issues.filter(i => i.severity === 'info') ?? [];
  return <div className="grid" style={{ maxWidth: 900 }}>
    <h1>Import a competition</h1>
    <div className="card form">
      <h2>1 · Paste your Google Sheets link</h2>
      <div className="row" style={{ flexWrap: 'nowrap' }}><input type="url" placeholder="https://docs.google.com/spreadsheets/d/…" value={link} onChange={e => setLink(e.target.value)} />
        <button className="btn primary" disabled={!link || busy} onClick={() => void fromLink()}>{busy ? 'Reading…' : 'Read'}</button></div>
      <h2 style={{ marginTop: 6 }}>2 · Or upload a CSV file</h2>
      <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={async e => { const f = e.target.files?.[0]; if (f) run(await f.text(), f.name.replace(/\.(csv|tsv|txt)$/i, '')); }} />
      <span className="small muted">In Google Sheets: File ▸ Download ▸ CSV. In Excel: Save As ▸ CSV.</span>
      <h2 style={{ marginTop: 6 }}>3 · Or copy &amp; paste the cells</h2>
      <textarea placeholder="Select all cells in your sheet (including the header row), copy, and paste here" value={text} onChange={e => setText(e.target.value)} style={{ minHeight: 110 }} />
      <div><button className="btn" disabled={!text.trim()} onClick={() => run(text)}>Read pasted cells</button></div>
      <p className="small muted">Columns recognized: <b>Student</b> (or Athlete/Name), <b>Class</b> (or Level), a column with "flight 1", "flight 2"…, <b>Age</b>, <b>Time</b>.</p>
      {err && <div className="banner err">{err}</div>}
    </div>

    {res && <div className="card form">
      <h2>Preview</h2>
      <div className="tiles" style={{ marginBottom: 0 }}>
        <div className="tile"><div className="k">Athletes</div><div className="v">{res.athletes.length}</div></div>
        <div className="tile"><div className="k">Levels</div><div className="v">{res.levels.length}</div><div className="s">{res.levels.join(', ')}</div></div>
        <div className="tile"><div className="k">Flights</div><div className="v">{res.flights.length}</div>
          <div className="s">{fmt(Math.min(...res.flights.map(f => f.startMin ?? 1e9)))} – {fmt(Math.max(...res.flights.map(f => f.startMin ?? 0)))}</div></div>
        <div className={'tile' + (review.length ? ' bad' : '')}><div className="k">To review</div><div className="v">{review.length}</div><div className="s">marked Pending</div></div>
      </div>
      {review.length > 0 && <div><h3>Needs your review (these athletes are marked Pending with a note)</h3>
        {review.map((i, k) => <div key={k} className="small" style={{ padding: '6px 0', borderBottom: '1px solid #F1F5F9' }}>
          <span className="pill al-error">{i.type}</span> <b>{i.name}</b> {i.row ? <span className="muted">(row {i.row})</span> : null} — {i.detail}</div>)}</div>}
      {info.length > 0 && <details><summary className="small"><b>{info.length} other notes</b> (cleanup, large flights, breaks)</summary>
        {info.map((i, k) => <div key={k} className="small" style={{ padding: '4px 0' }}>• {i.detail}</div>)}</details>}
      <div className="two">
        <label className="f">Competition name<input type="text" value={name} placeholder="e.g. Ninja Tournament Nov 1" onChange={e => setName(e.target.value)} /></label>
        <label className="f">Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      </div>
      <div className="row"><span className="spacer" />
        <button className="btn primary" disabled={!name.trim()} onClick={async () => {
          await createEvent(name.trim(), date || null, res); toast(`${name} created with ${res.athletes.length} athletes`); go('');
        }}>Create competition</button></div>
      <p className="small muted">Your original spreadsheet is not changed. Nothing is invented: each flight's time is the time most of its athletes were listed with.</p>
    </div>}

    <div className="card"><h2>Starting from scratch?</h2>
      <p className="muted">Create an empty competition, then add levels (Settings), flights and athletes by hand.</p>
      <button className="btn" onClick={async () => { const n = prompt('Competition name?'); if (n) { await createEvent(n, todayISO()); go('settings'); } }}>Create empty competition</button>
    </div>
  </div>;
}
