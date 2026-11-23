import { useEffect, useMemo, useState } from 'react';
import { useRoute } from './lib/router';
import { init, reload, useApp, getState } from './lib/store';
import { supabase, type Session } from './lib/backend';
import { makeCtx } from './lib/derive';
import { Toasts } from './components/ui';
import { Dashboard } from './views/Dashboard';
import { Board } from './views/Board';
import { Athletes } from './views/Athletes';
import { Flights } from './views/Flights';
import { FlightView } from './views/FlightView';
import { Changes } from './views/Changes';
import { Results } from './views/Results';
import { Import } from './views/Import';
import { Settings } from './views/Settings';
import { Share, Poster } from './views/Share';
import { PublicPage, PrintPage, TvPage } from './views/Public';
import { Login } from './views/Login';
import { usePublicCtx } from './lib/publicData';

const NAV: [string, string][] = [['', 'Dashboard'], ['schedule', 'Schedule'], ['athletes', 'Athletes'], ['flights', 'Flights'],
  ['flight', 'Flight view'], ['results', 'Results'], ['changes', 'Changes'], ['share', 'Share'], ['settings', 'Settings']];
const PUBLIC = ['public', 'print', 'tv', 'poster'];

export default function App() {
  const route = useRoute();
  const sb = supabase();
  const isPublic = PUBLIC.includes(route[0] ?? '');
  const [session, setSession] = useState<Session | null | undefined>(sb ? undefined : null);

  useEffect(() => {
    if (!sb) return;
    void sb.auth.getSession().then(r => setSession(r.data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);
  useEffect(() => {
    if (isPublic && sb) return;               // public pages read the public view directly
    if (sb && !session) return;
    void init({ cloud: !!sb, actor: session?.user.email ?? 'This device' });
  }, [sb, session, isPublic]);

  if (isPublic) {
    const id = route[1];
    return <>{route[0] === 'public' ? <PublicPage eventId={id} /> : route[0] === 'print' ? <PrintPage eventId={id} />
      : route[0] === 'tv' ? <TvPage eventId={id} /> : <PosterRoute id={id} />}<Toasts /></>;
  }
  if (sb && session === undefined) return <div className="empty">Loading…</div>;
  if (sb && !session) return <Login />;
  return <Admin route={route} email={session?.user.email ?? null} />;
}

function PosterRoute({ id }: { id?: string }) { const { c } = usePublicCtx(id); return c ? <Poster c={c} /> : <div className="empty">Loading…</div>; }

function Admin({ route, email }: { route: string[]; email: string | null }) {
  const app = useApp();
  const c = useMemo(() => (app.activeEventId ? makeCtx(app.data, app.activeEventId) : null), [app.data, app.activeEventId]);
  const page = route[0] ?? '';
  const [editor, setEditor] = useState<boolean | null>(null);
  const sb = supabase();
  useEffect(() => {
    if (!sb || !email) { setEditor(true); return; }
    void sb.from('editors').select('email').eq('email', email.toLowerCase()).then(r => setEditor(!!r.data?.length));
  }, [sb, email]);

  const status = app.error ? ['err', 'Error'] : app.saving ? ['saving', 'Saving…'] : app.mode === 'cloud' ? ['', 'Live'] : ['local', 'This device'];
  return <>
    <header className="top">
      <div className="top-row">
        <div className="brand">🥷 <span>Competition</span> {c && <span className="ev">· {c.event.name}</span>}</div>
        <div className="sync"><span className={'dot ' + status[0]} />{status[1]}
          {email && <button className="btn sm ghost" style={{ color: '#CBD5E1' }} onClick={() => void supabase()?.auth.signOut()}>Sign out</button>}</div>
      </div>
      <nav className="nav">{NAV.map(([p, l]) => <a key={p} href={'#/' + p} className={page === p ? 'on' : ''}>{l}</a>)}
        <a href="#/import" className={page === 'import' ? 'on' : ''}>Import</a></nav>
    </header>
    <main>
      {app.error && <div className="banner err">{app.error} <button className="btn sm" onClick={() => void reload()}>Retry</button></div>}
      {editor === false && <div className="banner err">Signed in as {email}, but this email isn't on the editors list yet. Ask the organizer to add it in Settings ▸ People who can edit.</div>}
      {app.mode === 'local' && app.ready && page === '' && <div className="banner">Saved on <b>this device only</b>. To share live with coaches and parents, connect the cloud (see SETUP.md).</div>}
      {!app.ready ? <div className="empty">Loading…</div>
        : page === 'import' || !c ? <Import />
          : page === '' ? <Dashboard c={c} />
            : page === 'schedule' ? <Board c={c} />
              : page === 'athletes' ? <Athletes c={c} />
                : page === 'flights' ? <Flights c={c} />
                  : page === 'flight' ? <FlightView c={c} id={route[1]} />
                    : page === 'results' ? <Results c={c} />
                    : page === 'changes' ? <Changes c={c} />
                      : page === 'share' ? <Share c={c} />
                        : page === 'settings' ? <Settings c={c} />
                          : <Dashboard c={c} />}
    </main>
    <Toasts />
  </>;
}
// for debugging in the browser console
(window as unknown as { __ninja: unknown }).__ninja = { getState };
