import { useEffect, useState } from 'react';
import { loadPublic, supabase } from './backend';
import { makeCtx, type Ctx } from './derive';
import { getState, normalize, useApp } from './store';
import type { Data } from './types';

/** Data for pages anyone can open (public schedule, print, TV): cloud = live public read; local = this device. */
export function usePublicCtx(eventId: string | undefined): { c: Ctx | null; loading: boolean; error: string | null; updated: Date | null } {
  const app = useApp();
  const sb = supabase();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  useEffect(() => {
    if (!sb || !eventId) return;
    let alive = true;
    const load = () => loadPublic(sb, eventId).then(d => {
      if (!alive) return; normalize(d);
      setData(d); setError(null); setUpdated(new Date());
    }).catch(e => alive && setError(String(e.message ?? e)));
    void load();
    const t = setInterval(load, 15000);
    // instant refresh: editors broadcast a ping after every save (results, moves, times)
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = () => { if (timer) return; timer = setTimeout(() => { timer = null; void load(); }, 400); };
    const ch = sb.channel('pub-ping-' + eventId).on('broadcast', { event: 'changed' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flights' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'levels' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, soon).subscribe();
    const vis = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', vis);
    return () => { alive = false; clearInterval(t); sb.removeChannel(ch); document.removeEventListener('visibilitychange', vis); };
  }, [sb, eventId]);
  if (sb) return { c: data && eventId ? makeCtx(data, eventId) : null, loading: !data && !error, error, updated };
  const id = eventId ?? app.activeEventId ?? '';
  return { c: app.ready ? makeCtx(getState().data, id) : null, loading: !app.ready, error: app.error, updated: new Date() };
}
