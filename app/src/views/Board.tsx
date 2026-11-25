import { useMemo, useState } from 'react';
import { DndContext, DragOverlay, MeasuringStrategy, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core';

/** Drop onto the card under the finger / pointer; fall back to overlap if the pointer is between cards. */
const dropUnderFinger: CollisionDetection = args => { const hits = pointerWithin(args); return hits.length ? hits : rectIntersection(args); };
import type { Ctx } from '../lib/derive';
import { activeIn, athleteAlerts, duplicateNames, flightAlerts, flightLabel, isRecent, levelColor, nowNext, sortedFlights } from '../lib/derive';
import type { Athlete, Flight } from '../lib/types';
import { addAthlete, moveAthlete, updateFlight } from '../lib/store';
import { fmt } from '../lib/time';
import { AthleteEditor } from '../components/AthleteEditor';
import { AlertPills, Modal, TimeField, useTick } from '../components/ui';
import { go } from '../lib/router';

export function Board({ c }: { c: Ctx }) {
  useTick(30000);
  const [lvl, setLvl] = useState<string>('all');
  const [q, setQ] = useState('');
  const [showScr, setShowScr] = useState(false);
  const [edit, setEdit] = useState<Athlete | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [timeEdit, setTimeEdit] = useState<Flight | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }));
  const dupes = useMemo(() => duplicateNames(c), [c]);
  const cur = nowNext(c).current;
  const flights = sortedFlights(c).filter(f => lvl === 'all' || f.levelId === lvl);
  const unassigned = c.athletes.filter(a => !a.flightId || !c.flightById.has(a.flightId));
  const ql = q.trim().toLowerCase();

  const onEnd = (e: DragEndEvent) => {
    setDragId(null);
    const a = c.athletes.find(x => x.id === e.active.id); if (!a || !e.over) return;
    const target = e.over.id === 'unassigned' ? null : c.flightById.get(String(e.over.id)) ?? null;
    if ((target?.id ?? null) === (a.flightId ?? null)) return;
    void moveAthlete(a.id, target);   // the confirmation toast with Undo comes from the store
  };
  const dragged = dragId ? c.athletes.find(a => a.id === dragId) : null;

  return <>
    <div className="toolbar">
      <div className="seg" data-tour="levels">
        <button className={lvl === 'all' ? 'on' : ''} onClick={() => setLvl('all')}>All</button>
        {c.levels.map(l => <button key={l.id} className={lvl === l.id ? 'on' : ''} onClick={() => setLvl(l.id)}>
          <span className="lvldot" style={{ background: l.color }} />{l.name}</button>)}
      </div>
      <input data-tour="highlight" type="search" placeholder="Highlight athlete…" value={q} onChange={e => setQ(e.target.value)} />
      <label className="row small"><input type="checkbox" checked={showScr} onChange={e => setShowScr(e.target.checked)} /> Show scratched</label>
      <span className="spacer" />
      <button data-tour="addath" className="btn" onClick={() => void addAthlete(c.event.id, { name: 'New athlete', levelId: lvl !== 'all' ? lvl : null }).then(a => setEdit(a))}>+ Athlete</button>
    </div>
    <p className="muted small" style={{ marginTop: -6 }}>Drag an athlete onto another flight to move them (on iPad: press and hold, then drag). Tap a name to edit. Tap a time to change the whole flight.</p>

    <DndContext sensors={sensors} collisionDetection={dropUnderFinger} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} onDragStart={e => setDragId(String(e.active.id))} onDragEnd={onEnd} onDragCancel={() => setDragId(null)}>
      <div className="board" data-tour="board">
        {unassigned.length > 0 && <Card id="unassigned" title="Unassigned" color="#94A3B8" count={unassigned.length}>
          {unassigned.map(a => <Chip key={a.id} a={a} c={c} q={ql} dupes={dupes} onTap={() => setEdit(a)} />)}
        </Card>}
        {flights.map((f, fi) => {
          const members = c.athletes.filter(a => a.flightId === f.id && (showScr || a.status !== 'Scratched')).sort((x, y) => x.name.localeCompare(y.name));
          const n = activeIn(c, f).length, al = flightAlerts(c, f).filter(x => x.code !== 'empty');
          return <Card key={f.id} id={f.id} color={levelColor(c, f.levelId)} current={cur?.id === f.id}
            title={<><button className="tbtn time" data-tour={fi === 0 ? 'ftime' : undefined} onClick={() => setTimeEdit(f)} title="Change flight time">{fmt(f.startMin)}</button>
              <span className="lbl">{flightLabel(c, f)}</span></>}
            count={n} max={c.event.settings.maxPerFlight} onOpen={() => go('flight/' + f.id)}
            foot={<>{al.length > 0 && <div style={{ padding: '0 12px 8px' }}><AlertPills alerts={al} /></div>}{f.notes && <div className="fnote">▶ {f.notes}</div>}</>}>
            {members.map((a, ai) => <Chip key={a.id} a={a} c={c} q={ql} dupes={dupes} onTap={() => setEdit(a)} tour={fi === 0 && ai === 0 ? 'chip' : undefined} />)}
          </Card>;
        })}
      </div>
      {dragId && unassigned.length === 0 && <UnassignZone />}
      <DragOverlay>{dragged ? <span className="chip overlay">{dragged.name}</span> : null}</DragOverlay>
    </DndContext>
    {flights.length === 0 && <div className="empty card">No flights yet. Add them on the <a href="#/flights">Flights</a> tab or <a href="#/import">import your spreadsheet</a>.</div>}
    {edit && <AthleteEditor c={c} athlete={edit} onClose={() => setEdit(null)} />}
    {timeEdit && <Modal title={`${flightLabel(c, timeEdit, true)} start time`} onClose={() => setTimeEdit(null)}>
      <p className="muted">Every athlete in this flight follows this time (except individual overrides).</p>
      <TimeField value={timeEdit.startMin} onChange={v => { void updateFlight(timeEdit.id, { startMin: v }); setTimeEdit(null); }} />
      <p className="small muted">Pick the time, then tap outside the box (or press Done).</p>
    </Modal>}
  </>;
}

function Card({ id, title, color, count, max, current, children, foot, onOpen }: {
  id: string; title: React.ReactNode; color: string; count: number; max?: number; current?: boolean; children: React.ReactNode; foot?: React.ReactNode; onOpen?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={'fcard' + (isOver ? ' over' : '') + (current ? ' current' : '')}>
    <div className="fhead" style={{ background: color + '22', borderTop: `5px solid ${color}` }}>
      {title}
      {current && <span className="pill nowpill">NOW</span>}
      <span className={'cnt' + (max && count > max ? ' over' : '')}>{count}{max ? `/${max}` : ''}</span>
      {onOpen && <button className="btn sm ghost" onClick={onOpen} aria-label="Open flight">⤢</button>}
    </div>
    <div className="chips">{children}</div>
    {foot}
  </div>;
}

function Chip({ a, c, q, dupes, onTap, tour }: { a: Athlete; c: Ctx; q: string; dupes: Set<string>; onTap: () => void; tour?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: a.id });
  const al = athleteAlerts(c, a, dupes).filter(x => x.severity !== 'info');
  const cls = ['chip', isDragging && 'dragging', a.status === 'Scratched' && 'scr', a.overrideMin !== null && 'ov', al.length && 'al', isRecent(c, a) && 'rec'].filter(Boolean).join(' ');
  const hit = q && a.name.toLowerCase().includes(q);
  return <span ref={setNodeRef} {...listeners} {...attributes} data-tour={tour} className={cls} onClick={onTap}
    style={hit ? { outline: '3px solid #2563EB', outlineOffset: 1 } : q ? { opacity: .35 } : undefined}
    title={[...al.map(x => x.text), a.overrideMin !== null ? `Override ${fmt(a.overrideMin)}` : '', a.notes].filter(Boolean).join(' · ')}>
    {a.name}{a.age !== null && <span className="age">{a.age}</span>}
    {a.overrideMin !== null && <span className="age">⏱{fmt(a.overrideMin)}</span>}
    {a.status === 'Pending' && <span title="Pending">•</span>}
  </span>;
}

/** Fixed drop zone shown only while dragging, so the board layout never shifts mid-drag. */
function UnassignZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'unassigned' });
  return <div ref={setNodeRef} className={'unzone' + (isOver ? ' over' : '')}>Drop here to remove from all flights (Unassigned)</div>;
}
