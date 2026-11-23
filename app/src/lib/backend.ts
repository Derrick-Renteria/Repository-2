import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import type { Data, TableName } from './types';
import { EMPTY } from './types';

export interface WriteOp { table: TableName; upsert?: Record<string, unknown>[]; remove?: string[] }
export type RemoteHandler = (table: TableName, row: Record<string, unknown> | null, id: string) => void;
export interface Backend {
  mode: 'local' | 'cloud';
  loadAll(): Promise<Data>;
  write(ops: WriteOp[]): Promise<void>;
  subscribe(h: RemoteHandler, reload: () => void): () => void;
  ping?(eventId: string): void;
}
const TABLES: TableName[] = ['events', 'levels', 'flights', 'athletes', 'changes'];

// ---------------- local (this device) ----------------
const KEY = 'ninja-comp-db-v1';
export class LocalBackend implements Backend {
  mode = 'local' as const;
  private chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(KEY) : null;
  private read(): Data {
    try { const s = localStorage.getItem(KEY); return s ? { ...EMPTY, ...JSON.parse(s) } : structuredClone(EMPTY); }
    catch { return structuredClone(EMPTY); }
  }
  async loadAll() { return this.read(); }
  async write(ops: WriteOp[]) {
    const d = this.read() as unknown as Record<TableName, Record<string, unknown>[]>;
    for (const op of ops) {
      let rows = d[op.table] ?? [];
      if (op.remove?.length) { const rm = new Set(op.remove); rows = rows.filter(r => !rm.has(r.id as string)); }
      for (const u of op.upsert ?? []) {
        const i = rows.findIndex(r => r.id === u.id);
        if (i >= 0) rows[i] = { ...rows[i], ...u }; else rows.push(u);
      }
      d[op.table] = rows;
    }
    localStorage.setItem(KEY, JSON.stringify(d));
    this.chan?.postMessage('changed');
  }
  subscribe(_h: RemoteHandler, reload: () => void) {
    const on = () => reload();
    this.chan?.addEventListener('message', on);
    const st = (e: StorageEvent) => { if (e.key === KEY) reload(); };
    window.addEventListener('storage', st);
    return () => { this.chan?.removeEventListener('message', on); window.removeEventListener('storage', st); };
  }
}

// ---------------- cloud (Supabase) ----------------
const snake = (k: string) => k.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const mapKeys = (o: Record<string, unknown>, f: (k: string) => string) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [f(k), v]));

export const cloudConfig = {
  url: (import.meta.env.VITE_SUPABASE_URL as string | undefined) || localStorage.getItem('ninja-sb-url') || '',
  key: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || localStorage.getItem('ninja-sb-key') || '',
};
let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  if (!cloudConfig.url || !cloudConfig.key) return null;
  if (!client) client = createClient(cloudConfig.url, cloudConfig.key);
  return client;
}

export class CloudBackend implements Backend {
  mode = 'cloud' as const;
  private sb: SupabaseClient;
  constructor(sb: SupabaseClient) { this.sb = sb; }
  async loadAll(): Promise<Data> {
    const out = structuredClone(EMPTY) as unknown as Record<TableName, unknown[]>;
    await Promise.all(TABLES.map(async t => {
      const all: unknown[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await this.sb.from(t).select('*').range(from, from + 999);
        if (error) throw error;
        all.push(...data.map(r => mapKeys(r, camel)));
        if (data.length < 1000) break;
      }
      out[t] = all;
    }));
    return out as unknown as Data;
  }
  async write(ops: WriteOp[]) {
    for (const op of ops) {
      if (op.remove?.length) {
        const { error } = await this.sb.from(op.table).delete().in('id', op.remove); if (error) throw error;
      }
      if (op.upsert?.length) {
        for (let i = 0; i < op.upsert.length; i += 500) {
          const { error } = await this.sb.from(op.table).upsert(op.upsert.slice(i, i + 500).map(r => mapKeys(r, snake)));
          if (error) throw error;
        }
      }
    }
  }
  private pings = new Map<string, ReturnType<SupabaseClient['channel']>>();
  /** Tell open public pages / TVs for this event to refresh right now (Realtime broadcast). */
  ping(eventId: string) {
    let ch = this.pings.get(eventId);
    if (!ch) { ch = this.sb.channel('pub-ping-' + eventId); ch.subscribe(); this.pings.set(eventId, ch); }
    void ch.send({ type: 'broadcast', event: 'changed', payload: { at: Date.now() } });
  }
  subscribe(h: RemoteHandler, reload: () => void) {
    const ch = this.sb.channel('ninja-db');
    for (const t of TABLES) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, (p) => {
        if (p.eventType === 'DELETE') h(t, null, (p.old as { id: string }).id);
        else h(t, mapKeys(p.new as Record<string, unknown>, camel), (p.new as { id: string }).id);
      });
    }
    ch.subscribe(status => { if (status === 'SUBSCRIBED') reload(); });
    const vis = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', vis);
    return () => { this.sb.removeChannel(ch); document.removeEventListener('visibilitychange', vis); };
  }
}

/** Public (no login) read of one event's schedule: no notes, no scratched athletes. */
export async function loadPublic(sb: SupabaseClient, eventId: string): Promise<Data> {
  const [ev, lv, fl, at] = await Promise.all([
    sb.from('events').select('*').eq('id', eventId),
    sb.from('levels').select('*').eq('event_id', eventId),
    sb.from('flights').select('*').eq('event_id', eventId),
    sb.from('public_athletes').select('*').eq('event_id', eventId),
  ]);
  for (const r of [ev, lv, fl, at]) if (r.error) throw r.error;
  const m = (rows: Record<string, unknown>[] | null) => (rows ?? []).map(r => mapKeys(r, camel));
  return {
    events: m(ev.data) as unknown as Data['events'], levels: m(lv.data) as unknown as Data['levels'],
    flights: m(fl.data) as unknown as Data['flights'],
    athletes: m(at.data).map(a => ({ status: 'Confirmed', notes: '', overrideMin: null, changedAt: null, srcRow: null,
      resultMs: null, resultStatus: null, resultAt: null, outcome: null, ...a })) as unknown as Data['athletes'],
    changes: [],
  };
}
export type { Session };
