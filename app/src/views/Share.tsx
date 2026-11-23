import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Ctx } from '../lib/derive';
import { useApp } from '../lib/store';
import { toast } from '../components/ui';

export const publicUrl = (eventId: string, page = 'public') => `${location.origin}${location.pathname}#/${page}/${eventId}`;

export function Share({ c }: { c: Ctx }) {
  const app = useApp();
  const url = publicUrl(c.event.id);
  const [qr, setQr] = useState('');
  useEffect(() => { void QRCode.toDataURL(url, { width: 600, margin: 1 }).then(setQr); }, [url]);
  return <div className="grid" style={{ maxWidth: 900 }}>
    <h1>Share the schedule</h1>
    {app.mode === 'local' && <div className="banner">You're in <b>this-device-only</b> mode, so these links only work on this device. Connect the cloud database (see SETUP.md) to share with everyone.</div>}
    {!c.event.settings.published && <div className="banner err">The public schedule is currently <b>hidden</b>. Turn it on in <a href="#/settings">Settings</a>.</div>}
    <div className="card" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 220px', gap: 18, alignItems: 'center' }}>
      <div className="form">
        <h2>Public link: coaches &amp; parents</h2>
        <p className="muted">Anyone can open it on a phone, no login. It updates live, has a "find my athlete" search, and never shows notes or scratched athletes.</p>
        <input type="text" readOnly value={url} onFocus={e => e.target.select()} />
        <div className="row">
          <button className="btn primary" onClick={() => { void navigator.clipboard?.writeText(url); toast('Link copied'); }}>Copy link</button>
          <a className="btn" href={url} target="_blank" rel="noreferrer">Open</a>
          {'share' in navigator && <button className="btn" onClick={() => void navigator.share({ title: c.event.name, url })}>Share…</button>}
          <a className="btn" href={'#/poster/' + c.event.id} target="_blank" rel="noreferrer">🖨 QR poster</a>
        </div>
      </div>
      {qr && <img src={qr} alt="QR code for the public schedule" style={{ width: '100%', borderRadius: 12, border: '1px solid var(--line)' }} />}
    </div>
    <div className="card form">
      <h2>Print &amp; screens</h2>
      <div className="row">
        <a className="btn" href={'#/print/' + c.event.id + '?mode=flight'} target="_blank" rel="noreferrer">🖨 Schedule by flight</a>
        <a className="btn" href={'#/print/' + c.event.id + '?mode=name'} target="_blank" rel="noreferrer">🖨 Athlete A–Z (check-in list)</a>
        <a className="btn" href={'#/tv/' + c.event.id} target="_blank" rel="noreferrer">📺 TV "Now / Next" screen</a>
      </div>
      <span className="small muted">Print pages open in a new tab: use Share ▸ Print on iPad, or Ctrl/Cmd+P on a computer (choose "Save as PDF" for a PDF).</span>
    </div>
  </div>;
}

export function Poster({ c }: { c: Ctx }) {
  const url = publicUrl(c.event.id);
  const [qr, setQr] = useState('');
  useEffect(() => { void QRCode.toDataURL(url, { width: 900, margin: 1 }).then(setQr); }, [url]);
  return <div className="print" style={{ textAlign: 'center', paddingTop: 40 }}>
    <div className="noprint" style={{ marginBottom: 20 }}><button className="btn primary" onClick={() => print()}>🖨 Print</button></div>
    <h1 style={{ fontSize: 40 }}>{c.event.name}</h1>
    <p style={{ fontSize: 26, margin: '10px 0 26px' }}>Scan for the live competition schedule</p>
    {qr && <img src={qr} alt="QR code" style={{ width: '70%', maxWidth: 520 }} />}
    <p style={{ fontSize: 18, marginTop: 20 }}>Find your athlete's start time · updates live</p>
    <p style={{ fontSize: 12, color: '#555', wordBreak: 'break-all' }}>{url}</p>
  </div>;
}
