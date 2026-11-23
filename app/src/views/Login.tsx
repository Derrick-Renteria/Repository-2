import { useState } from 'react';
import { supabase } from '../lib/backend';

export function Login() {
  const sb = supabase()!;
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setMsg(null);
    const r = mode === 'in' ? await sb.auth.signInWithPassword({ email, password: pw })
      : mode === 'up' ? await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: location.origin + location.pathname } })
        : await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    setBusy(false);
    if (r.error) setMsg(r.error.message);
    else if (mode === 'up') setMsg(r.data && 'session' in r.data && r.data.session ? null : 'Check your email to confirm, then sign in.');
    else if (mode === 'reset') setMsg('Check your email for a reset link.');
  };
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: 'var(--navy)' }}>
    <div className="card form" style={{ width: 'min(420px, 100%)' }}>
      <div style={{ fontSize: 40, textAlign: 'center' }}>🥷</div>
      <h1 style={{ textAlign: 'center', margin: 0 }}>Competition Manager</h1>
      <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>{mode === 'in' ? 'Sign in to manage the schedule' : mode === 'up' ? 'Create your editor password' : 'Reset your password'}</p>
      <label className="f">Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      {mode !== 'reset' && <label className="f">Password<input type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && void submit()} /></label>}
      {msg && <div className="banner">{msg}</div>}
      <button className="btn primary" disabled={busy || !email || (mode !== 'reset' && pw.length < 6)} onClick={() => void submit()}>
        {mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}</button>
      <div className="row small" style={{ justifyContent: 'center' }}>
        {mode !== 'in' && <button className="btn ghost sm" onClick={() => setMode('in')}>Sign in</button>}
        {mode !== 'up' && <button className="btn ghost sm" onClick={() => setMode('up')}>First time? Create password</button>}
        {mode !== 'reset' && <button className="btn ghost sm" onClick={() => setMode('reset')}>Forgot password</button>}
      </div>
      <p className="small muted" style={{ textAlign: 'center' }}>Looking for the schedule? Use the public link from the organizer — no sign-in needed.</p>
    </div>
  </div>;
}
