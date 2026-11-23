/** Times are stored as minutes after midnight (no time-zone surprises). */
export function fmt(min: number | null | undefined): string {
  if (min === null || min === undefined || Number.isNaN(min)) return '—';
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mi = m % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mi).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
/** "9:00:00 AM", "9:15 AM", "13:30", "930am" -> minutes, or null */
export function parseTime(text: string): number | null {
  const s = String(text ?? '').trim().toUpperCase().replace(/\./g, '');
  let m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M?)?$/);
  if (!m) { const n = s.match(/^(\d{1,2})(\d{2})?\s*([AP]M?)$/); if (n) m = [n[0], n[1], n[2] ?? '00', n[3]] as RegExpMatchArray; }
  if (!m) return null;
  let h = +m[1]; const mi = +m[2];
  if (m[3]) { const pm = m[3].startsWith('P'); if (h === 12) h = 0; if (pm) h += 12; }
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
export const toInput = (min: number | null) =>
  min === null ? '' : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const fromInput = (v: string): number | null => {
  const m = v.match(/^(\d{2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null;
};
export const nowMin = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
export const todayISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return new Date(iso).toLocaleDateString();
}
