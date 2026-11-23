import { useMemo, useState } from 'react';
import { Modal, TimeField, StatusPill, AlertPills, toast } from './ui';
import type { Ctx } from '../lib/derive';
import { athleteAlerts, athleteTime, duplicateNames, flightLabel, sortedFlights } from '../lib/derive';
import { STATUSES, type Athlete } from '../lib/types';
import { updateAthlete, deleteAthlete, undoChange, getState } from '../lib/store';
import { ago, fmt } from '../lib/time';

export function AthleteEditor({ c, athlete, onClose }: { c: Ctx; athlete: Athlete; onClose: () => void }) {
  const a = c.athletes.find(x => x.id === athlete.id) ?? athlete;
  const [name, setName] = useState(a.name);
  const [age, setAge] = useState(a.age === null ? '' : String(a.age));
  const [notes, setNotes] = useState(a.notes);
  const flights = useMemo(() => sortedFlights(c).filter(f => !a.levelId || f.levelId === a.levelId), [c, a.levelId]);
  const alerts = athleteAlerts(c, a, duplicateNames(c));
  const history = getState().data.changes.filter(ch => ch.eventId === a.eventId && ch.target === a.name).sort((x, y) => y.at.localeCompare(x.at)).slice(0, 8);
  const save = (p: Partial<Athlete>) => { void updateAthlete(a.id, p); };

  return (
    <Modal title={a.name} onClose={onClose} actions={<StatusPill s={a.status} />}>
      <div className="form">
        {alerts.length > 0 && <div className="row"><AlertPills alerts={alerts} /></div>}
        <div className="two">
          <label className="f">Name<input type="text" value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && save({ name: name.trim() })} /></label>
          <label className="f">Age<input type="number" inputMode="numeric" value={age} onChange={e => setAge(e.target.value)} onBlur={() => save({ age: age === '' ? null : +age })} /></label>
        </div>
        <label className="f">Level
          <select value={a.levelId ?? ''} onChange={e => {
            const lv = e.target.value || null;
            const cur = a.flightId ? c.flightById.get(a.flightId) : undefined;
            // keep the same flight number in the new level when it exists
            const same = cur && lv ? c.flights.find(f => f.levelId === lv && f.number === cur.number) : undefined;
            save({ levelId: lv, flightId: same?.id ?? null });
            if (lv && !same) toast('Level changed — now pick a flight for this level.');
          }}>
            <option value="">— none —</option>
            {c.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select></label>
        <label className="f">Flight
          <select value={a.flightId ?? ''} onChange={e => { const f = c.flightById.get(e.target.value); save(f ? { flightId: f.id, levelId: f.levelId } : { flightId: null }); }}>
            <option value="">— unassigned —</option>
            {flights.map(f => <option key={f.id} value={f.id}>{fmt(f.startMin)} — {flightLabel(c, f, true)}</option>)}
          </select></label>
        <div className="two">
          <label className="f">Start time<div className="big time" style={{ padding: '8px 0' }}>{fmt(athleteTime(c, a))}</div></label>
          <label className="f">Time override (exceptions only)
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <TimeField value={a.overrideMin} onChange={v => save({ overrideMin: v })} />
              {a.overrideMin !== null && <button className="btn sm" onClick={() => save({ overrideMin: null })}>Clear</button>}
            </div></label>
        </div>
        <label className="f">Status
          <div className="seg">{STATUSES.map(s => <button key={s} className={a.status === s ? 'on' : ''} onClick={() => save({ status: s })}>{s}</button>)}</div></label>
        <label className="f">Notes<textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => save({ notes })} /></label>
        {history.length > 0 && <div>
          <h3>History</h3>
          {history.map(h => <div key={h.id} className="row small" style={{ padding: '4px 0', borderBottom: '1px solid var(--subtle)' }}>
            <span className="muted">{ago(h.at)}</span><b>{h.field}</b><span>{h.oldValue} → {h.newValue}</span>
            <span className="spacer" />{h.undo && !h.undone && <button className="btn sm" onClick={() => void undoChange(h.id)}>Undo</button>}
          </div>)}
        </div>}
        <div className="row"><span className="spacer" />
          <button className="btn danger" onClick={() => { if (confirm(`Delete ${a.name}? (Scratching is usually better — it keeps the record.)`)) { void deleteAthlete(a.id); onClose(); } }}>Delete athlete</button>
        </div>
      </div>
    </Modal>
  );
}
