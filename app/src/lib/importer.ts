import Papa from 'papaparse';
import { parseTime, fmt } from './time';
import type { Status } from './types';

export interface ImportedAthlete {
  name: string; level: string; flight: number | null; age: number | null;
  overrideMin: number | null; status: Status; notes: string; srcRow: number;
}
export interface ImportedFlight { level: string; number: number; startMin: number | null; notes: string; count: number }
export interface ImportIssue { type: string; name: string; row: number | null; detail: string; severity: 'review' | 'info' }
export interface ImportResult {
  levels: string[]; flights: ImportedFlight[]; athletes: ImportedAthlete[]; issues: ImportIssue[]; title?: string;
}

export function parseTable(text: string): string[][] {
  const res = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: false });
  return (res.data as string[][]).map(r => r.map(c => (c ?? '').toString()));
}

const fid = (level: string, n: number | null) => `${level} · F${n ?? '?'}`;

/**
 * Turn the competition spreadsheet (any CSV/TSV with Student / Class / flight / Age / Time columns)
 * into levels, flights and athletes. Nothing is invented: a flight's time is the time most of its
 * athletes were listed with; other listed times are kept as per-athlete overrides and flagged.
 */
export function analyze(values: string[][], maxPerFlight = 10): ImportResult {
  let hr = -1;
  for (let r = 0; r < Math.min(values.length, 15) && hr < 0; r++)
    if (values[r].some(c => /^\s*(student|athlete|name)\b/i.test(c))) hr = r;
  if (hr < 0) throw new Error('Could not find a header row with "Student" (or "Athlete" / "Name").');
  const H = values[hr].map(h => h.trim().toLowerCase());
  const col: Record<string, number> = {};
  H.forEach((h, i) => {
    if (h === '#' && col.num === undefined) col.num = i;
    else if (/^(student|athlete|name)/.test(h) && col.name === undefined) col.name = i;
    else if (/class|level|event|division/.test(h) && col.level === undefined) col.level = i;
    else if (/^age/.test(h) && col.age === undefined) col.age = i;
    else if (/^(time|start)/.test(h) && col.time === undefined) col.time = i;
    else if (/flight|heat|wave/.test(h) && col.flight === undefined) col.flight = i;
  });
  const body = values.slice(hr + 1);
  if (col.flight === undefined) {
    let best = -1, bestN = 0;
    for (let c = 0; c < H.length; c++) {
      const n = body.filter(r => /(flight|heat|wave)?\s*\d+/i.test(r[c] ?? '') && /flight|heat|wave/i.test(r[c] ?? '')).length;
      if (n > bestN) { bestN = n; best = c; }
    }
    if (best >= 0) col.flight = best;
  }
  if (col.name === undefined) throw new Error('No athlete name column found.');

  type A = ImportedAthlete & { time: number | null; block: number; notesArr: string[] };
  const athletes: A[] = [], issues: ImportIssue[] = [], levels: string[] = [];
  const strays: { row: number; text: string }[] = [];
  let block = 0, prev: number | null = null, lvlSpaces = 0, flSpaces = 0;
  const timeStyles = new Set<string>();
  body.forEach((row, i) => {
    const srcRow = hr + i + 2;
    const name = (row[col.name] ?? '').trim();
    const seq = col.num !== undefined ? (row[col.num] ?? '').trim() : '';
    if (seq !== '' && !Number.isNaN(+seq)) { if (+seq === 1 || (prev !== null && +seq <= prev)) block++; prev = +seq; }
    if (!name) {
      const other = row.filter((v, k) => k !== col.name && v.trim() !== '' && k !== col.num);
      if (other.length) strays.push({ row: srcRow, text: other.map(s => s.trim()).join(' | ') });
      return;
    }
    const lvlRaw = col.level !== undefined ? row[col.level] ?? '' : '';
    const level = lvlRaw.trim(); if (lvlRaw !== level) lvlSpaces++;
    const flRaw = col.flight !== undefined ? row[col.flight] ?? '' : '';
    if (flRaw !== flRaw.trim()) flSpaces++;
    const fm = flRaw.match(/(\d+)/);
    const tRaw = col.time !== undefined ? (row[col.time] ?? '').trim() : '';
    if (tRaw) timeStyles.add(/:\d\d:\d\d/.test(tRaw) ? 'long' : 'short');
    const ageTxt = col.age !== undefined ? (row[col.age] ?? '').trim() : '';
    if (level && !levels.includes(level)) levels.push(level);
    athletes.push({
      name, level, flight: fm ? +fm[1] : null, age: ageTxt && !Number.isNaN(+ageTxt) ? +ageTxt : null,
      overrideMin: null, status: 'Confirmed', notes: '', srcRow, time: parseTime(tRaw), block, notesArr: [],
    });
  });

  // flights
  const fmap = new Map<string, ImportedFlight & { times: Map<number, number>; members: A[] }>();
  for (const a of athletes) {
    if (!a.level || a.flight === null) continue;
    const k = fid(a.level, a.flight);
    if (!fmap.has(k)) fmap.set(k, { level: a.level, number: a.flight, startMin: null, notes: '', count: 0, times: new Map(), members: [] });
    const f = fmap.get(k)!; f.members.push(a); f.count++;
    if (a.time !== null) f.times.set(a.time, (f.times.get(a.time) ?? 0) + 1);
  }
  for (const f of fmap.values()) {
    let best: number | null = null, bestN = 0;
    for (const [t, n] of f.times) if (n > bestN || (n === bestN && best !== null && t < best)) { best = t; bestN = n; }
    f.startMin = best;
  }

  const flag = (a: A, type: string, detail: string) => {
    issues.push({ type, name: a.name, row: a.srcRow, detail, severity: 'review' });
    a.notesArr.push(detail); a.status = 'Pending';
  };
  for (const a of athletes) {
    if (!a.level) flag(a, 'Missing level', 'No level in the original sheet');
    if (a.flight === null) flag(a, 'Missing flight', 'No flight in the original sheet');
    const f = a.level && a.flight !== null ? fmap.get(fid(a.level, a.flight)) : undefined;
    if (!f) continue;
    if (a.time === null) flag(a, 'Missing start time', `No start time in the original; follows ${fid(a.level, a.flight)} at ${fmt(f.startMin)} — please confirm`);
    else if (f.startMin !== null && a.time !== f.startMin) {
      a.overrideMin = a.time;
      flag(a, 'Time differs from flight', `Listed at ${fmt(a.time)} but ${fid(a.level, a.flight)} is ${fmt(f.startMin)}; kept as a time override — please confirm`);
    }
  }
  // listed inside another flight's numbered group
  const blocks = new Map<number, A[]>();
  athletes.forEach(a => { if (!blocks.has(a.block)) blocks.set(a.block, []); blocks.get(a.block)!.push(a); });
  for (const list of blocks.values()) {
    if (list.length < 3) continue;
    const cnt = new Map<string, number>();
    list.forEach(a => { const k = fid(a.level, a.flight); cnt.set(k, (cnt.get(k) ?? 0) + 1); });
    const major = [...cnt.entries()].sort((x, y) => y[1] - x[1])[0][0];
    list.forEach(a => {
      const k = fid(a.level, a.flight);
      if (k !== major) flag(a, "Listed in another flight's group", `Listed among ${major} athletes but labeled ${k}; kept ${k} — please confirm`);
    });
  }
  // duplicates
  const byName = new Map<string, A[]>();
  athletes.forEach(a => { const k = a.name.toLowerCase().replace(/\s+/g, ' '); if (!byName.has(k)) byName.set(k, []); byName.get(k)!.push(a); });
  for (const list of byName.values()) if (list.length > 1) list.forEach(a => {
    const others = list.filter(o => o !== a).map(o => `${fid(o.level, o.flight)} (row ${o.srcRow})`).join(', ');
    flag(a, 'Duplicate athlete', `Also listed in ${others} — keep one, scratch the other`);
  });
  for (const f of fmap.values()) if (f.count > maxPerFlight)
    issues.push({ type: 'Large flight', name: '', row: null, detail: `${fid(f.level, f.number)} has ${f.count} athletes (limit ${maxPerFlight})`, severity: 'info' });
  for (const s of strays) {
    const before = athletes.filter(a => a.srcRow < s.row).pop();
    const f = before && before.level && before.flight !== null ? fmap.get(fid(before.level, before.flight)) : undefined;
    if (/break|lunch|reset/i.test(s.text) && f) {
      f.notes = `Followed by: ${s.text}`;
      issues.push({ type: 'Schedule note', name: '', row: s.row, detail: `"${s.text}" saved as a note on ${fid(f.level, f.number)}`, severity: 'info' });
    } else issues.push({ type: 'Row without athlete', name: '', row: s.row, detail: `Row has "${s.text}" but no athlete name — not imported`, severity: 'review' });
  }
  if (lvlSpaces) issues.push({ type: 'Cleanup', name: '', row: null, detail: `${lvlSpaces} level labels had extra spaces — trimmed`, severity: 'info' });
  if (flSpaces) issues.push({ type: 'Cleanup', name: '', row: null, detail: `${flSpaces} flight labels had extra spaces — cleaned`, severity: 'info' });
  if (timeStyles.size > 1) issues.push({ type: 'Cleanup', name: '', row: null, detail: 'Times mixed "9:00:00 AM" and "9:15 AM" styles — all now h:mm AM/PM', severity: 'info' });

  return {
    levels,
    flights: [...fmap.values()].map(({ level, number, startMin, notes, count }) => ({ level, number, startMin, notes, count })),
    athletes: athletes.map(({ time: _t, block: _b, notesArr, ...a }) => ({ ...a, notes: notesArr.join(' | ') })),
    issues,
  };
}

/** Google Sheets share link -> CSV URLs to try (sheet must be shared "anyone with the link"). */
export function sheetCsvUrls(link: string): string[] {
  const u = sheetCsvUrl(link); if (!u) return [];
  return [u, u.replace('/export?format=csv&gid=', '/gviz/tq?tqx=out:csv&gid=')];
}
export function sheetCsvUrl(link: string): string | null {
  let u = link.trim();
  const safe = u.match(/[?&]url=([^&]+)/); // Outlook safelinks wrapper
  if (safe) u = decodeURIComponent(safe[1]);
  const m = u.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return null;
  const gid = u.match(/[#&?]gid=(\d+)/)?.[1] ?? '0';
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}
