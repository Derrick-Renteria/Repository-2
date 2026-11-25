import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/** One step of a page walkthrough. `target` = the data-tour="…" attribute of the element to highlight. */
export interface Step { title: string; body: string; target?: string }

const ALL: Record<string, Step> = {
  howto: { title: 'Help is always here', body: 'Tap ❓ How to on any page to see this walkthrough again.', target: 'howto' },
  undo: { title: '↶ Undo: your safety net', body: 'Made a mistake? Tap Undo in the top bar. It takes back your most recent change, then the one before, and so on. Every change also pops up a message at the bottom with its own Undo button, and the Changes tab lists everything.', target: 'undo' },
};

export const TOURS: Record<string, Step[]> = {
  '': [
    { title: 'Welcome to the Dashboard', body: 'Your home base on competition day: what is on the course, what is next, and anything that needs fixing.' },
    { title: 'Competition-day order: before', body: '1) Import the athlete list (Import tab).\n2) Set the date and check levels (Settings).\n3) Fix anything under "Needs attention".\n4) Print the QR poster (Share tab) and post it at the gym.' },
    { title: 'Competition-day order: during', body: '1) Tap ▶ Start when each flight begins.\n2) Enter points and time for each kid (Results tab).\n3) Running late? Use the +5 / +10 / +15 buttons.\n4) Move athletes on the Schedule tab if needed.' },
    { title: 'Competition-day order: after each level', body: 'On the Results tab, check the leaderboard, set "Top N advance", then tick "Results final". Parents then see Advancing or Done.' },
    { title: 'On the course now', body: 'Shows the flight running now (or first up). On the competition date it follows the clock automatically.', target: 'now' },
    { title: '▶ Start the next flight', body: 'Tap when the next flight actually starts. If you are running late, it offers to push the remaining flights back for you.', target: 'start' },
    { title: 'Running late?', body: 'Push every remaining flight later in one tap. Parents and the TV update automatically. Tapped by mistake? Undo.', target: 'late' },
    { title: 'Quick numbers', body: 'Totals at a glance. A red tile means something needs attention.', target: 'tiles' },
    { title: 'Needs attention', body: 'Duplicates, kids without a flight, over-full flights, and athletes marked Pending. Tap Fix to open each one.', target: 'attention' },
    { title: 'Recent changes', body: 'The latest edits from everyone, each with its own Undo.', target: 'recent' },
    ALL.undo, ALL.howto,
  ],
  schedule: [
    { title: 'The Schedule board', body: 'Every flight is a card in time order with its athletes inside. This is the fastest place to move kids around.', target: 'board' },
    { title: 'Move an athlete', body: 'Press and hold a name for a moment, then drag it onto another flight card and let go. Their level and start time update automatically.', target: 'chip' },
    { title: 'Edit one athlete', body: 'A quick tap on a name opens their details: level, flight, status, notes, score and history.', target: 'chip' },
    { title: 'Change a whole flight\'s time', body: 'Tap the big time on a card. Every athlete in that flight follows the new time.', target: 'ftime' },
    { title: 'Show one level', body: 'Filter the board to a single level when it gets crowded.', target: 'levels' },
    { title: 'Find someone fast', body: 'Type part of a name to highlight that athlete on the board.', target: 'highlight' },
    { title: 'Colors on names', body: 'Orange = has its own time override. Red = something to fix. Yellow = changed recently. A dot means Pending.' },
    { title: 'Add a late registration', body: 'Adds a new athlete, then you pick their level and flight.', target: 'addath' },
    ALL.undo,
  ],
  athletes: [
    { title: 'The athlete list', body: 'Everyone in one table. Best for searching, checking statuses, and fixing details.' },
    { title: 'Search', body: 'Type part of a name.', target: 'search' },
    { title: 'Filters', body: 'Show one level, or only athletes who need attention, changed recently, or have a certain status.', target: 'filters' },
    { title: 'Move to another flight', body: 'Pick a different flight from this dropdown. The start time updates by itself.', target: 'flightsel' },
    { title: 'Status', body: 'Confirmed, Pending, Changed, or Scratched. Scratched athletes disappear from the public schedule but stay in your records.', target: 'statussel' },
    { title: 'Open the full details', body: 'Tap anywhere else on a row to edit name, age, level, time override, score and notes.', target: 'row' },
    { title: 'Add an athlete', body: 'For late registrations or walk-ups.', target: 'add' },
    ALL.undo,
  ],
  flights: [
    { title: 'Flights', body: 'Every flight with its start time. Flight numbers restart for each level (Ninja 1 · F3 and Ninja 2 · F3 are different flights).' },
    { title: 'Change a start time', body: 'Tap a time and pick the new one. Every athlete in that flight follows it.', target: 'ftime' },
    { title: 'Shift the schedule', body: 'Move every flight from a chosen time onward later (or earlier) by a few minutes. Good for a late start or a long break.', target: 'shift' },
    { title: 'Notes', body: 'Notes on a flight (e.g. "lunch break after") show to parents too.', target: 'fnotes' },
    { title: 'Add a flight', body: 'Pick the level. It gets the next number and a time 15 minutes after that level\'s last flight. Check the time after.', target: 'addflight' },
    { title: 'Delete a flight', body: 'Its athletes become Unassigned (shown on the Schedule board). Undo brings everything back.', target: 'fdelete' },
    ALL.undo,
  ],
  flight: [
    { title: 'Flight view', body: 'One flight, big and simple: good for the person calling names at the course.' },
    { title: 'Pick a flight', body: 'Use the arrows or the dropdown to go through flights in order.', target: 'picker' },
    { title: 'Who\'s in it', body: 'Athletes in name order with any exceptions. Tap a name to edit.', target: 'list' },
    ALL.undo,
  ],
  results: [
    { title: 'Entering scores', body: 'Record each kid\'s points and time right after their run. Parents and the TV see it within seconds.' },
    { title: '1 · Pick the flight', body: 'It starts on the flight that is on the course. Use the arrows to move between flights.', target: 'picker' },
    { title: '2 · Type points', body: 'Tap the first points box, type the points, press Enter (or Next on the keyboard).', target: 'pts' },
    { title: '3 · Type time', body: 'Type the time like 42.31 or 1:05.40 and press Enter. It saves and jumps to the next athlete\'s points box.', target: 'time' },
    { title: 'Fell, didn\'t start, disqualified', body: 'Fell: type their points, then tap Fell (keeps points, no time). DNS = did not start. DQ = disqualified.', target: 'fell' },
    { title: 'Typed it wrong?', body: 'Just retype it and press Enter. ✕ clears the score. Every save shows a message with Undo.', target: 'clear' },
    { title: 'Ranking', body: 'Most points wins. If points are tied, the faster time wins.', target: 'board' },
    { title: '4 · Who advances', body: 'Set how many athletes move on from this level (0 = everyone is done after one run).', target: 'topn' },
    { title: '5 · Results final', body: 'Tick when the whole level has run and you have checked the scores. Parents then see ✅ Advancing or 🏆 Done.', target: 'final' },
    { title: 'Special cases', body: 'Override lets you mark one athlete Advancing or Done by hand.', target: 'override' },
    ALL.undo,
  ],
  changes: [
    { title: 'Change history', body: 'Every edit from every device: who, when, before and after.' },
    { title: 'Undo anything', body: 'Each line has Undo. Undoing an undo (Redo) works too.', target: 'changes' },
    { title: 'Search', body: 'Type a name to see everything that happened to that athlete or flight.', target: 'search' },
  ],
  share: [
    { title: 'Share with parents & coaches', body: 'One link for everyone. No login, updates live, shows times and scores.' },
    { title: 'The link', body: 'Copy it and send it in GroupMe, text, or email.', target: 'link' },
    { title: 'QR poster', body: 'Print it and post it at the entrance and the course. Parents scan to find their kid.', target: 'qr' },
    { title: 'Print & TV', body: 'Print the schedule or an A–Z check-in list. Open the TV screen on a laptop connected to a TV: it shows Now / Next and flashes each new score.', target: 'print' },
  ],
  settings: [
    { title: 'Settings', body: 'Set these once before the competition.' },
    { title: 'Competition details', body: 'Name, date (needed for "Now" to follow the clock), and how many athletes fit in a flight.', target: 'comp' },
    { title: 'What parents can see', body: 'Hide the schedule while arranging, show or hide ages, and choose whether scores show live or only after a level is final.', target: 'public' },
    { title: 'Levels', body: 'Rename levels, change colors, reorder, or add a new one.', target: 'levels' },
    { title: 'Who can edit', body: 'Add the email of each staff member who should make changes. They create their own password on the sign-in screen.', target: 'editors' },
    { title: 'Backup', body: 'Download the schedule as a spreadsheet anytime.', target: 'backup' },
    ALL.undo,
  ],
  import: [
    { title: 'Import a competition', body: 'Bring in the athlete list from your spreadsheet. Your spreadsheet is never changed.' },
    { title: 'Easiest: paste the Google Sheets link', body: 'The sheet must be shared as "Anyone with the link can view".', target: 'link' },
    { title: 'Or upload / paste', body: 'Upload a CSV file, or copy all cells in the sheet and paste them.', target: 'paste' },
    { title: 'Check the preview', body: 'You will see counts and anything that needs review (duplicates, missing times). Give it a name and date, then tap Create competition.' },
  ],
};

export function pageKey(route: string[]) { return route[0] === undefined ? '' : route[0]; }
const seenKey = (k: string) => 'ninja-tour-seen-' + (k || 'dashboard');
export const tourSeen = (k: string) => localStorage.getItem(seenKey(k)) === '1';

export function Tour({ page, onClose }: { page: string; onClose: () => void }) {
  const steps = TOURS[page] ?? [{ title: 'Help', body: 'No walkthrough for this page yet.' }];
  const [i, setI] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);
  const step = steps[i];
  const el = useCallback(() => (step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null), [step]);
  useEffect(() => { localStorage.setItem(seenKey(page), '1'); }, [page]);
  useLayoutEffect(() => {
    const t = el();
    if (t) t.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    const measure = () => { const n = el(); setBox(n ? n.getBoundingClientRect() : null); };
    measure(); const timer = setTimeout(measure, 350);
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true);
    return () => { clearTimeout(timer); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [el]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI(x => Math.min(x + 1, steps.length - 1)); if (e.key === 'ArrowLeft') setI(x => Math.max(x - 1, 0)); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose, steps.length]);

  const pad = 6, vw = window.innerWidth, vh = window.innerHeight;
  const cardW = Math.min(380, vw - 24);
  let cardStyle: React.CSSProperties = { left: (vw - cardW) / 2, top: Math.max(80, vh / 2 - 120), width: cardW };
  if (box) {
    const below = box.bottom + 14 + 220 < vh;
    cardStyle = { width: cardW, left: Math.min(Math.max(12, box.left + box.width / 2 - cardW / 2), vw - cardW - 12), top: below ? box.bottom + 14 : Math.max(12, box.top - 14 - 230) };
  }
  const last = i === steps.length - 1;
  return <div className="tour" role="dialog" aria-label="How to">
    {box ? <div className="tour-hole" style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />
      : <div className="tour-dim" onClick={onClose} />}
    <div className="tour-card" style={cardStyle}>
      <div className="row" style={{ marginBottom: 6 }}><span className="pill" style={{ background: 'var(--accent)', color: '#fff' }}>{i + 1} / {steps.length}</span>
        <span className="spacer" /><button className="btn sm ghost" onClick={onClose} aria-label="Close help">✕</button></div>
      <h3 style={{ fontSize: 18 }}>{step.title}</h3>
      <p style={{ whiteSpace: 'pre-line', margin: '0 0 14px', lineHeight: 1.45 }}>{step.body}</p>
      <div className="row">
        <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>◀ Back</button><span className="spacer" />
        {last ? <button className="btn primary" onClick={onClose}>Got it ✓</button> : <button className="btn primary" onClick={() => setI(i + 1)}>Next ▶</button>}
      </div>
      <div className="tour-dots">{steps.map((_, k) => <i key={k} className={k === i ? 'on' : ''} onClick={() => setI(k)} />)}</div>
    </div>
  </div>;
}
