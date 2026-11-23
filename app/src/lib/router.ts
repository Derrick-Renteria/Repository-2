import { useEffect, useState } from 'react';
export function useRoute(): string[] {
  const get = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || '').split('/').filter(Boolean);
  const [r, setR] = useState(get);
  useEffect(() => { const on = () => { setR(get()); window.scrollTo(0, 0); }; window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  return r;
}
export const go = (path: string) => { location.hash = '#/' + path.replace(/^\//, ''); };
export const query = (k: string) => new URLSearchParams(location.hash.split('?')[1] ?? '').get(k);
