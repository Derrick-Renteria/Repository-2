import type { Athlete, Data, EventRow, Flight, Level } from './types';
import { nowMin, todayISO } from './time';

export interface Ctx {
  event: EventRow;
  levels: Level[]; flights: Flight[]; athletes: Athlete[];
  levelById: Map<string, Level>; flightById: Map<string, Flight>;
}
export function makeCtx(data: Data, eventId: string): Ctx | null {
  const event = data.events.find(e => e.id === eventId);
  if (!event) return null;
  const levels = data.levels.filter(l => l.eventId === eventId).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const flights = data.flights.filter(f => f.eventId === eventId);
  const athletes = data.athletes.filter(a => a.eventId === eventId);
  return { event, levels, flights, athletes,
    levelById: new Map(levels.map(l => [l.id, l])), flightById: new Map(flights.map(f => [f.id, f])) };
}

export const levelName = (c: Ctx, id: string | null) => (id && c.levelById.get(id)?.name) || '';
export const levelColor = (c: Ctx, id: string | null) => (id && c.levelById.get(id)?.color) || '#9CA3AF';
export function flightLabel(c: Ctx, f: Flight | undefined | null, long = false): string {
  if (!f) return 'Unassigned';
  return `${levelName(c, f.levelId) || '?'} · ${long ? 'Flight ' : 'F'}${f.number}`;
}
export const athleteFlight = (c: Ctx, a: Athlete) => (a.flightId ? c.flightById.get(a.flightId) : undefined);
export function athleteTime(c: Ctx, a: Athlete): number | null {
  if (a.overrideMin !== null) return a.overrideMin;
  return athleteFlight(c, a)?.startMin ?? null;
}
const normName = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const levelSort = (c: Ctx, id: string | null) => (id ? c.levelById.get(id)?.sort ?? 999 : 999);

export type Severity = 'error' | 'warn' | 'info';
export interface Alert { code: string; text: string; severity: Severity }

export function athleteAlerts(c: Ctx, a: Athlete, dupes: Set<string>): Alert[] {
  const out: Alert[] = [];
  if (a.status === 'Scratched') return out;
  const f = athleteFlight(c, a);
  if (!a.levelId) out.push({ code: 'nolevel', text: 'No level', severity: 'error' });
  if (!a.flightId) out.push({ code: 'noflight', text: 'No flight', severity: 'error' });
  else if (!f) out.push({ code: 'badflight', text: 'Flight was deleted', severity: 'error' });
  else {
    if (a.levelId && f.levelId !== a.levelId) out.push({ code: 'mismatch', text: `Flight is ${levelName(c, f.levelId)}, athlete is ${levelName(c, a.levelId)}`, severity: 'error' });
    if (athleteTime(c, a) === null) out.push({ code: 'notime', text: 'No start time', severity: 'error' });
  }
  if (dupes.has(normName(a.name))) out.push({ code: 'dupe', text: 'Duplicate name', severity: 'warn' });
  if (a.status === 'Pending') out.push({ code: 'pending', text: 'Pending review', severity: 'warn' });
  if (a.overrideMin !== null) out.push({ code: 'override', text: 'Time override', severity: 'info' });
  return out;
}
export function duplicateNames(c: Ctx): Set<string> {
  const n = new Map<string, number>();
  c.athletes.forEach(a => { if (a.status !== 'Scratched') n.set(normName(a.name), (n.get(normName(a.name)) ?? 0) + 1); });
  return new Set([...n.entries()].filter(([, v]) => v > 1).map(([k]) => k));
}
export function activeIn(c: Ctx, f: Flight) {
  return c.athletes.filter(a => a.flightId === f.id && a.status !== 'Scratched');
}
export function flightAlerts(c: Ctx, f: Flight): Alert[] {
  const out: Alert[] = [];
  const n = activeIn(c, f).length;
  if (f.startMin === null) out.push({ code: 'notime', text: 'Missing start time', severity: 'error' });
  if (n === 0) out.push({ code: 'empty', text: 'No athletes', severity: 'warn' });
  if (n > c.event.settings.maxPerFlight) out.push({ code: 'over', text: `Over ${c.event.settings.maxPerFlight}`, severity: 'warn' });
  if (f.startMin !== null && c.flights.some(o => o.id !== f.id && o.startMin === f.startMin))
    out.push({ code: 'shared', text: 'Shares a time slot', severity: 'info' });
  if (c.flights.some(o => o.id !== f.id && o.levelId === f.levelId && o.number === f.number))
    out.push({ code: 'dupnum', text: 'Duplicate flight number', severity: 'error' });
  return out;
}

export function sortedFlights(c: Ctx): Flight[] {
  return [...c.flights].sort((a, b) =>
    (a.startMin ?? 1e9) - (b.startMin ?? 1e9) || a.number - b.number || levelSort(c, a.levelId) - levelSort(c, b.levelId));
}
/** Schedule order: start time ▸ flight # ▸ level ▸ athlete name */
export function scheduleSort(c: Ctx, list: Athlete[]): Athlete[] {
  return [...list].sort((a, b) => {
    const fa = athleteFlight(c, a), fb = athleteFlight(c, b);
    return (athleteTime(c, a) ?? 1e9) - (athleteTime(c, b) ?? 1e9)
      || (fa?.number ?? 999) - (fb?.number ?? 999)
      || levelSort(c, a.levelId) - levelSort(c, b.levelId)
      || a.name.localeCompare(b.name);
  });
}
export function isRecent(c: Ctx, a: Athlete, now = Date.now()) {
  const win = c.event.settings.changeWindowMin * 60000;
  const f = athleteFlight(c, a);
  return [a.changedAt, f?.changedAt].some(t => t && now - Date.parse(t) < win);
}

export interface NowNext { current: Flight | null; next: Flight[]; lateMin: number | null; mode: 'live' | 'manual' | 'preview' }
/** What is on the course: a flight the director started, else the clock on event day, else the first flights. */
export function nowNext(c: Ctx, at = new Date()): NowNext {
  const list = sortedFlights(c).filter(f => f.startMin !== null && activeIn(c, f).length > 0);
  const s = c.event.settings;
  const manual = s.currentFlightId ? list.find(f => f.id === s.currentFlightId) : undefined;
  if (manual) {
    const i = list.indexOf(manual);
    let late: number | null = null;
    if (s.currentStartedAt) {
      const st = new Date(s.currentStartedAt);
      if (todayISO(st) === todayISO(at) || !c.event.date) late = nowMin(st) - (manual.startMin ?? 0);
    }
    return { current: manual, next: list.slice(i + 1, i + 3), lateMin: late, mode: 'manual' };
  }
  if (!c.event.date || c.event.date === todayISO(at)) {
    const t = nowMin(at);
    let cur: Flight | null = null;
    for (const f of list) if ((f.startMin ?? 0) <= t) cur = f;
    if (cur && t - (cur.startMin ?? 0) > s.flightLengthMin * 2 && list.indexOf(cur) === list.length - 1) cur = null;
    if (c.event.date === todayISO(at) || cur) {
      const i = cur ? list.indexOf(cur) : -1;
      return { current: cur, next: list.slice(i + 1, i + 3), lateMin: null, mode: 'live' };
    }
  }
  return { current: null, next: list.slice(0, 2), lateMin: null, mode: 'preview' };
}

export function nameForPublic(name: string) { return name.trim(); }
