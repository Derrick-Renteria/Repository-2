import type { Athlete, Level } from './types';
import type { Ctx } from './derive';

/** 42310 -> "42.31", 65400 -> "1:05.40" */
export function fmtResult(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '';
  const cs = Math.round(ms / 10), m = Math.floor(cs / 6000), s = (cs % 6000) / 100;
  return m ? `${m}:${s.toFixed(2).padStart(5, '0')}` : s.toFixed(2);
}
/** "42.31", "42", "1:05.4", "1.05.40", "105.4" -> milliseconds, or null */
export function parseResult(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  let m = t.match(/^(\d{1,2})[:.](\d{1,2})\.(\d{1,3})$/);
  if (m) return (+m[1] * 60 + +m[2]) * 1000 + Math.round(+('0.' + m[3]) * 1000);
  m = t.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m) return (+m[1] * 60 + +m[2]) * 1000;
  m = t.match(/^(\d{1,4})(?:\.(\d{1,3}))?$/);
  if (m) return +m[1] * 1000 + (m[2] ? Math.round(+('0.' + m[2]) * 1000) : 0);
  return null;
}
/** "7", "7.5" -> 7 / 7.5 ; "" -> null ; invalid -> NaN */
export function parsePoints(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  return /^\d{1,4}(\.\d{1,2})?$/.test(t) ? +t : NaN;
}
export const fmtPoints = (p: number | null | undefined) => (p === null || p === undefined ? '' : `${+p} pts`);

/** Scored = has points and/or a time (finished, or fell but earned points). */
export const isScored = (a: Athlete) =>
  (a.resultStatus === 'Finished' || a.resultStatus === 'DNF') && (a.resultPoints !== null || a.resultMs !== null);

/** Ranking: most points first; tied points -> fastest time; no time (fell) after timed runs. */
export function compareScore(x: Athlete, y: Athlete) {
  const px = x.resultPoints ?? -1, py = y.resultPoints ?? -1;
  if (px !== py) return py - px;
  const tx = x.resultMs ?? Number.MAX_SAFE_INTEGER, ty = y.resultMs ?? Number.MAX_SAFE_INTEGER;
  return tx - ty;
}

export interface Standing { a: Athlete; rank: number | null; total: number; run: number }
/** Level standings: scored athletes ranked (exact ties share a rank), then DNF-without-score / DQ / DNS, then not yet run. */
export function standings(c: Ctx, levelId: string): Standing[] {
  const list = c.athletes.filter(a => a.levelId === levelId && a.status !== 'Scratched');
  const scored = list.filter(isScored).sort((x, y) => compareScore(x, y) || x.name.localeCompare(y.name));
  const other = list.filter(a => a.resultStatus && !isScored(a)).sort((x, y) => order(x) - order(y) || x.name.localeCompare(y.name));
  const pending = list.filter(a => !a.resultStatus).sort((x, y) => x.name.localeCompare(y.name));
  const run = scored.length + other.length;
  const out: Standing[] = [];
  scored.forEach((a, i) => out.push({ a, rank: i > 0 && compareScore(scored[i - 1], a) === 0 ? out[i - 1].rank : i + 1, total: list.length, run }));
  other.forEach(a => out.push({ a, rank: null, total: list.length, run }));
  pending.forEach(a => out.push({ a, rank: null, total: list.length, run }));
  return out;
}
const order = (a: Athlete) => ({ DNF: 1, DQ: 2, DNS: 3 } as Record<string, number>)[a.resultStatus ?? ''] ?? 9;

export type Verdict = { kind: 'advance' | 'done' | 'provisional' | 'waiting'; label: string; short: string };
export function verdict(c: Ctx, a: Athlete, st?: Standing[]): Verdict {
  const lvl: Level | undefined = a.levelId ? c.levelById.get(a.levelId) : undefined;
  const s = (st ?? (a.levelId ? standings(c, a.levelId) : [])).find(x => x.a.id === a.id);
  if (a.outcome === 'advance') return { kind: 'advance', label: '✅ Advancing to the next round', short: 'Advancing' };
  if (a.outcome === 'done') return { kind: 'done', label: '🏆 Done — collect your award', short: 'Done' };
  if (!a.resultStatus) return { kind: 'waiting', label: 'Hasn\'t run yet', short: '' };
  if (lvl?.resultsFinal) {
    const adv = isScored(a) && s?.rank != null && s.rank <= (lvl.advanceCount ?? 0);
    return adv ? { kind: 'advance', label: '✅ Advancing to the next round', short: 'Advancing' }
      : { kind: 'done', label: '🏆 Done — collect your award', short: 'Done' };
  }
  const where = s?.rank ? `${ordinal(s.rank)} of ${s.run} so far` : a.resultStatus;
  const hint = lvl && lvl.advanceCount > 0 ? ` · top ${lvl.advanceCount} advance` : '';
  return { kind: 'provisional', label: `${where}${hint} · results not final yet`, short: s?.rank ? ordinal(s.rank) : a.resultStatus };
}
export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
/** "7 pts · 42.31", "5 pts · fell", "42.31", "DNS" */
export function resultText(a: Athlete) {
  if (!a.resultStatus) return '';
  if (a.resultStatus === 'DNS' || a.resultStatus === 'DQ') return a.resultStatus;
  const parts = [fmtPoints(a.resultPoints), a.resultStatus === 'DNF' ? 'fell' : fmtResult(a.resultMs)].filter(Boolean);
  return parts.join(' · ') || a.resultStatus;
}
export function latestResults(c: Ctx, withinMs = 15 * 60000, now = Date.now()) {
  return c.athletes.filter(a => a.resultAt && a.status !== 'Scratched' && now - Date.parse(a.resultAt) < withinMs)
    .sort((x, y) => y.resultAt!.localeCompare(x.resultAt!));
}
