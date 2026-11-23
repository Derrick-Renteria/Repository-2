import { useSyncExternalStore } from 'react';
import type { Athlete, Change, Data, EventRow, EventSettings, Flight, Level, TableName, UndoOp } from './types';
import { DEFAULT_SETTINGS, EMPTY, LEVEL_COLORS } from './types';
import { CloudBackend, LocalBackend, supabase, type Backend, type WriteOp } from './backend';
import type { ImportResult } from './importer';
import { fmt } from './time';

type Row = { id: string } & Record<string, unknown>;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const nowISO = () => new Date().toISOString();

interface State {
  data: Data; ready: boolean; error: string | null; saving: number;
  activeEventId: string | null; actor: string; mode: 'local' | 'cloud'; canEdit: boolean;
}
let state: State = {
  data: EMPTY, ready: false, error: null, saving: 0,
  activeEventId: localStorage.getItem('ninja-active-event'), actor: 'This device', mode: 'local', canEdit: true,
};
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
function set(p: Partial<State>) { state = { ...state, ...p }; emit(); }
export const useApp = () => useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => state);
export const getState = () => state;

let backend: Backend = new LocalBackend();
let unsub: (() => void) | null = null;

export async function init(opts: { cloud: boolean; actor?: string; canEdit?: boolean }) {
  unsub?.();
  const sb = opts.cloud ? supabase() : null;
  backend = sb ? new CloudBackend(sb) : new LocalBackend();
  set({ mode: backend.mode, actor: opts.actor ?? 'This device', canEdit: opts.canEdit ?? true });
  await reload();
  unsub = backend.subscribe(applyRemote, () => { void reload(); });
}
let reloading = false;
export async function reload() {
  if (reloading) return; reloading = true;
  try {
    const data = await backend.loadAll();
    data.events.forEach(e => { e.settings = { ...DEFAULT_SETTINGS, ...(e.settings ?? {}) }; });
    let active = state.activeEventId;
    if (!active || !data.events.some(e => e.id === active)) active = [...data.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id ?? null;
    set({ data, ready: true, error: null, activeEventId: active });
  } catch (e) { set({ ready: true, error: (e as Error).message }); }
  finally { reloading = false; }
}
function applyRemote(table: TableName, row: Record<string, unknown> | null, id: string) {
  const list = (state.data[table] as unknown as Row[]).filter(r => r.id !== id);
  if (row) {
    if (table === 'events') row.settings = { ...DEFAULT_SETTINGS, ...((row.settings as object) ?? {}) };
    const old = (state.data[table] as unknown as Row[]).find(r => r.id === id);
    list.push({ ...(old ?? {}), ...row } as Row);
  }
  set({ data: { ...state.data, [table]: list } });
}
export function setActiveEvent(id: string) { localStorage.setItem('ninja-active-event', id); set({ activeEventId: id }); }

/** Apply locally (instant), then save. On failure, reload from the source of truth. */
async function commit(ops: WriteOp[]) {
  const d: Record<string, Row[]> = { ...(state.data as unknown as Record<string, Row[]>) };
  for (const op of ops) {
    let rows = [...(d[op.table] ?? [])];
    if (op.remove?.length) { const rm = new Set(op.remove); rows = rows.filter(r => !rm.has(r.id)); }
    for (const u of (op.upsert ?? []) as Row[]) {
      const i = rows.findIndex(r => r.id === u.id);
      if (i >= 0) rows[i] = { ...rows[i], ...u }; else rows.push(u);
    }
    d[op.table] = rows;
  }
  set({ data: d as unknown as Data, saving: state.saving + 1 });
  try { await backend.write(ops); set({ saving: state.saving - 1, error: null }); }
  catch (e) { set({ saving: state.saving - 1, error: 'Not saved: ' + (e as Error).message }); await reload(); }
}

function logChange(eventId: string, target: string, field: string, oldValue: string, newValue: string, undo: UndoOp[] | null): Change {
  return { id: uid(), eventId, at: nowISO(), actor: state.actor, target, field, oldValue, newValue, undo, undone: false };
}
const find = <T extends { id: string }>(t: TableName, id: string) => (state.data[t] as unknown as T[]).find(r => r.id === id);
const lvlName = (id: string | null) => (id ? find<Level>('levels', id)?.name ?? '?' : '—');
const flLabel = (id: string | null) => { const f = id ? find<Flight>('flights', id) : undefined; return f ? `${lvlName(f.levelId)} · F${f.number}` : 'Unassigned'; };

// ---------------- athletes ----------------
const ASSIGN: (keyof Athlete)[] = ['levelId', 'flightId', 'overrideMin'];
function describe(field: keyof Athlete, v: unknown): string {
  if (field === 'levelId') return lvlName(v as string | null);
  if (field === 'flightId') return flLabel(v as string | null);
  if (field === 'overrideMin') return v === null ? 'none' : fmt(v as number);
  return v === null || v === undefined ? '' : String(v);
}
const FIELD_LABEL: Partial<Record<keyof Athlete, string>> = { levelId: 'Level', flightId: 'Flight', overrideMin: 'Time override', status: 'Status', notes: 'Notes', name: 'Name', age: 'Age' };

export async function updateAthlete(id: string, patch: Partial<Athlete>) {
  const a = find<Athlete>('athletes', id); if (!a) return;
  const keys = (Object.keys(patch) as (keyof Athlete)[]).filter(k => patch[k] !== a[k]);
  if (!keys.length) return;
  const full: Partial<Athlete> = { ...patch };
  if (keys.some(k => ASSIGN.includes(k))) {
    full.changedAt = nowISO();
    if (!('status' in patch) && a.status !== 'Scratched') full.status = a.status === 'Confirmed' || a.status === 'Changed' ? 'Changed' : a.status;
  }
  if (keys.includes('status')) full.changedAt = nowISO();
  const before = Object.fromEntries(Object.keys(full).map(k => [k, a[k as keyof Athlete]]));
  const undo: UndoOp[] = [{ table: 'athletes', id, op: 'update', patch: before }];
  const changes = keys.map((k, i) => logChange(a.eventId, a.name, FIELD_LABEL[k] ?? k, describe(k, a[k]), describe(k, full[k]), i === 0 ? undo : null));
  await commit([{ table: 'athletes', upsert: [{ id, ...full }] }, { table: 'changes', upsert: changes as unknown as Row[] }]);
}
/** Move by drag & drop: the athlete takes the flight's level. */
export const moveAthlete = (id: string, flight: Flight | null) =>
  updateAthlete(id, flight ? { flightId: flight.id, levelId: flight.levelId } : { flightId: null });

export async function addAthlete(eventId: string, a: Partial<Athlete>) {
  const row: Athlete = { id: uid(), eventId, name: 'New athlete', age: null, levelId: null, flightId: null, overrideMin: null,
    status: 'Pending', notes: '', changedAt: nowISO(), srcRow: null, ...a };
  await commit([{ table: 'athletes', upsert: [row as unknown as Row] },
    { table: 'changes', upsert: [logChange(eventId, row.name, 'Added', '', flLabel(row.flightId), [{ table: 'athletes', id: row.id, op: 'delete' }]) as unknown as Row] }]);
  return row;
}
export async function deleteAthlete(id: string) {
  const a = find<Athlete>('athletes', id); if (!a) return;
  await commit([{ table: 'athletes', remove: [id] },
    { table: 'changes', upsert: [logChange(a.eventId, a.name, 'Deleted', flLabel(a.flightId), '', [{ table: 'athletes', id, op: 'insert', row: { ...a } }]) as unknown as Row] }]);
}

// ---------------- flights ----------------
export async function updateFlight(id: string, patch: Partial<Flight>) {
  const f = find<Flight>('flights', id); if (!f) return;
  const keys = (Object.keys(patch) as (keyof Flight)[]).filter(k => patch[k] !== f[k]); if (!keys.length) return;
  const full = { ...patch, changedAt: keys.includes('startMin') ? nowISO() : f.changedAt };
  const before = Object.fromEntries(Object.keys(full).map(k => [k, f[k as keyof Flight]]));
  const label = flLabel(id);
  const ch = keys.map((k, i) => logChange(f.eventId, label, k === 'startMin' ? 'Start time' : k === 'notes' ? 'Flight notes' : k,
    k === 'startMin' ? fmt(f.startMin) : String(f[k] ?? ''), k === 'startMin' ? fmt(patch.startMin as number | null) : String(patch[k] ?? ''),
    i === 0 ? [{ table: 'flights', id, op: 'update', patch: before }] : null));
  await commit([{ table: 'flights', upsert: [{ id, ...full }] }, { table: 'changes', upsert: ch as unknown as Row[] }]);
}
export async function addFlight(eventId: string, levelId: string, startMin: number | null) {
  const nums = state.data.flights.filter(f => f.eventId === eventId && f.levelId === levelId).map(f => f.number);
  const row: Flight = { id: uid(), eventId, levelId, number: (nums.length ? Math.max(...nums) : 0) + 1, startMin, notes: '', changedAt: nowISO() };
  await commit([{ table: 'flights', upsert: [row as unknown as Row] },
    { table: 'changes', upsert: [logChange(eventId, `${lvlName(levelId)} · F${row.number}`, 'Flight added', '', fmt(startMin), [{ table: 'flights', id: row.id, op: 'delete' }]) as unknown as Row] }]);
  return row;
}
export async function deleteFlight(id: string) {
  const f = find<Flight>('flights', id); if (!f) return;
  const members = state.data.athletes.filter(a => a.flightId === id);
  const undo: UndoOp[] = [{ table: 'flights', id, op: 'insert', row: { ...f } },
    ...members.map(a => ({ table: 'athletes' as const, id: a.id, op: 'update' as const, patch: { flightId: id } }))];
  await commit([
    { table: 'athletes', upsert: members.map(a => ({ id: a.id, flightId: null, changedAt: nowISO() })) },
    { table: 'flights', remove: [id] },
    { table: 'changes', upsert: [logChange(f.eventId, flLabel(id), 'Flight deleted', `${members.length} athletes`, members.length ? 'athletes now unassigned' : '', undo) as unknown as Row] },
  ]);
}
/** "Running late": move every flight starting at/after `fromMin` by `delta` minutes. */
export async function shiftFlights(eventId: string, fromMin: number, delta: number) {
  const list = state.data.flights.filter(f => f.eventId === eventId && f.startMin !== null && f.startMin >= fromMin);
  if (!list.length || !delta) return 0;
  const t = nowISO();
  await commit([
    { table: 'flights', upsert: list.map(f => ({ id: f.id, startMin: (f.startMin as number) + delta, changedAt: t })) },
    { table: 'changes', upsert: [logChange(eventId, `${list.length} flights from ${fmt(fromMin)}`, 'Shifted', '', `${delta > 0 ? '+' : ''}${delta} min`,
      list.map(f => ({ table: 'flights' as const, id: f.id, op: 'update' as const, patch: { startMin: f.startMin, changedAt: f.changedAt } }))) as unknown as Row] },
  ]);
  return list.length;
}

// ---------------- levels / events ----------------
export async function saveLevel(l: Partial<Level> & { eventId: string }) {
  const lvls = state.data.levels.filter(x => x.eventId === l.eventId);
  const row = l.id ? { ...l } : { id: uid(), name: 'New level', color: LEVEL_COLORS[lvls.length % LEVEL_COLORS.length], sort: lvls.length + 1, ...l };
  await commit([{ table: 'levels', upsert: [row as Row] }]);
}
export async function deleteLevel(id: string) {
  if (state.data.flights.some(f => f.levelId === id) || state.data.athletes.some(a => a.levelId === id))
    throw new Error('This level still has flights or athletes. Move or delete them first.');
  await commit([{ table: 'levels', remove: [id] }]);
}
export async function updateEvent(id: string, patch: Partial<Omit<EventRow, 'settings'>> & { settings?: Partial<EventSettings> }) {
  const e = find<EventRow>('events', id); if (!e) return;
  const row = { ...patch, id, settings: { ...e.settings, ...(patch.settings ?? {}) } };
  await commit([{ table: 'events', upsert: [row as unknown as Row] }]);
}
export async function createEvent(name: string, date: string | null, imp?: ImportResult) {
  const ev: EventRow = { id: uid(), name, date, settings: { ...DEFAULT_SETTINGS }, createdAt: nowISO() };
  const levels: Level[] = (imp?.levels ?? []).map((n, i) => ({ id: uid(), eventId: ev.id, name: n, color: LEVEL_COLORS[i % LEVEL_COLORS.length], sort: i + 1 }));
  const lid = new Map(levels.map(l => [l.name, l.id]));
  const flights: Flight[] = (imp?.flights ?? []).map(f => ({ id: uid(), eventId: ev.id, levelId: lid.get(f.level)!, number: f.number, startMin: f.startMin, notes: f.notes, changedAt: null }));
  const fk = new Map(flights.map(f => [`${f.levelId}|${f.number}`, f.id]));
  const athletes: Athlete[] = (imp?.athletes ?? []).map(a => {
    const levelId = a.level ? lid.get(a.level) ?? null : null;
    return { id: uid(), eventId: ev.id, name: a.name, age: a.age, levelId, flightId: levelId && a.flight !== null ? fk.get(`${levelId}|${a.flight}`) ?? null : null,
      overrideMin: a.overrideMin, status: a.status, notes: a.notes, changedAt: null, srcRow: a.srcRow };
  });
  await commit([
    { table: 'events', upsert: [ev as unknown as Row] },
    { table: 'levels', upsert: levels as unknown as Row[] },
    { table: 'flights', upsert: flights as unknown as Row[] },
    { table: 'athletes', upsert: athletes as unknown as Row[] },
    { table: 'changes', upsert: [logChange(ev.id, name, imp ? 'Imported' : 'Created', '', imp ? `${athletes.length} athletes, ${flights.length} flights` : '', null) as unknown as Row] },
  ]);
  setActiveEvent(ev.id);
  return ev;
}
export async function deleteEvent(id: string) {
  const d = state.data, by = <T extends { id: string; eventId: string }>(l: T[]) => l.filter(r => r.eventId === id).map(r => r.id);
  await commit([
    { table: 'changes', remove: by(d.changes) }, { table: 'athletes', remove: by(d.athletes) },
    { table: 'flights', remove: by(d.flights) }, { table: 'levels', remove: by(d.levels) }, { table: 'events', remove: [id] },
  ]);
}

// ---------------- undo ----------------
export async function undoChange(id: string) {
  const c = find<Change>('changes', id); if (!c?.undo || c.undone) return;
  // re-create deleted rows first, then restore fields, then remove rows that were added
  const rank = { insert: 0, update: 1, delete: 2 } as const;
  const ops: WriteOp[] = [...c.undo].sort((x, y) => rank[x.op] - rank[y.op]).map(u =>
    u.op === 'update' ? { table: u.table, upsert: [{ id: u.id, ...u.patch }] }
      : u.op === 'insert' ? { table: u.table, upsert: [u.row as Row] }
        : { table: u.table, remove: [u.id] });
  ops.push({ table: 'changes', upsert: [{ id, undone: true }, logChange(c.eventId, c.target, 'Undo', `${c.field}: ${c.newValue}`, c.oldValue, null) as unknown as Row] });
  await commit(ops);
}
