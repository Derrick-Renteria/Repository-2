/**
 * NINJA COMPETITION SCHEDULE ORGANIZER  (Google Apps Script)
 * ------------------------------------------------------------------
 * Paste this whole file into Extensions > Apps Script of your
 * competition spreadsheet, save, then run  setupCompetitionSystem  once.
 *
 * What it does
 *  - Leaves your original tab untouched and makes a protected copy ("Original Backup").
 *  - Imports every athlete row into an editable "Master" tab (no data invented).
 *  - Builds Flights, Schedule, Flight View, Coach View, Athlete Search, Dashboard,
 *    Change Log, Import Report, Published and Settings tabs, all driven by formulas.
 *  - Adds dropdowns, conditional formatting, warning-only protection on formulas,
 *    a change log + "recently changed" highlighting (onEdit), and a custom menu.
 *
 * KEY IDEA: in the original sheet flight numbers restart for every level
 * (Ninjanators flight 3 = 9:30 AM, Ninja 1 flight 3 = 10:45 AM). A flight is
 * therefore identified by LEVEL + FLIGHT #, shown as a Flight ID like "Ninja 1 · F3".
 * Start times live ONCE on the Flights tab; every athlete inherits them.
 */

// ============================ CONFIG ============================
var CFG = {
  SOURCE_SHEET_NAME: '',          // '' = auto-detect the tab whose header row contains "Student"
  DEFAULT_STATUS: 'Confirmed',    // status for cleanly imported athletes (flagged rows get 'Pending')
  MAX_PER_FLIGHT: 10,
  CHANGE_WINDOW_MIN: 60,          // how long a change stays highlighted
  MAX_FLIGHT_NUMBER: 20,
  MASTER_ROWS: 1000,
  FLIGHT_ROWS: 200,
  LEVEL_COLORS: ['#FFE0B2', '#C8E6C9', '#BBDEFB', '#E1BEE7', '#FFCDD2',
                 '#B2EBF2', '#F0F4C3', '#D7CCC8', '#CFD8DC', '#FFF9C4',
                 '#F8BBD0', '#DCEDC8', '#C5CAE9', '#FFECB3', '#B2DFDB']
};

var SH = {
  DASH: 'Dashboard', MASTER: 'Master', FLIGHTS: 'Flights', SCHED: 'Schedule',
  FVIEW: 'Flight View', COACH: 'Coach View', SEARCH: 'Athlete Search',
  PUB: 'Published', LOG: 'Change Log', REPORT: 'Import Report',
  SET: 'Settings', BACKUP: 'Original Backup'
};
var MANAGED = Object.keys(SH).map(function (k) { return SH[k]; });

// Master columns (1-based)
var M = { NAME: 1, LEVEL: 2, FLIGHT: 3, TIME: 4, STATUS: 5, NOTES: 6, AGE: 7,
          OVERRIDE: 8, FID: 9, ALERTS: 10, CHANGED: 11, SRC: 12 };
var M_HEADERS = ['Athlete Name', 'Level', 'Flight #', 'Start Time', 'Status', 'Notes',
                 'Age', 'Time Override', 'Flight ID', 'Alerts', 'Last Changed', 'Orig Row'];
// Flights columns
var F = { LEVEL: 1, NUM: 2, FID: 3, TIME: 4, COUNT: 5, AGES: 6, CHECK: 7, NOTES: 8 };

var STATUSES = ['Confirmed', 'Pending', 'Changed', 'Scratched'];
var C = { // palette
  navy: '#1F2A44', edit: '#E8F0FE', editHead: '#1A73E8', lock: '#F1F3F4', lockHead: '#5F6368',
  red: '#FDECEA', redText: '#C62828', yellow: '#FFF59D', orange: '#FFE0B2', band: '#EEF2F8'
};
var TIME_FMT = 'h:mm AM/PM';

// ============================ MENU ============================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🥷 Competition')
    .addItem('📤 Publish schedule snapshot', 'publishSchedule')
    .addItem('🖨️ Get printable PDF link', 'showPdfLinks')
    .addSeparator()
    .addItem('➕ Add flight…', 'addFlightPrompt')
    .addItem('➕ Add level…', 'addLevelPrompt')
    .addItem('↕️ Sort Master by schedule', 'sortMaster')
    .addSeparator()
    .addItem('✅ Mark all "Changed" as Confirmed', 'confirmAllChanged')
    .addItem('🧹 Clear recent-change highlights', 'clearChangeHighlights')
    .addSeparator()
    .addItem('🔁 Rebuild views & formatting (keeps your data)', 'rebuildViews')
    .addItem('⚠️ Full setup / re-import from original…', 'setupCompetitionSystem')
    .addToUi();
}

// ============================ SETUP ============================
function setupCompetitionSystem() {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();
  if (ss.getSheetByName(SH.MASTER)) {
    var r = ui.alert('Re-import from the original?',
      'A Master tab already exists. Re-importing will REPLACE Master, Flights, Change Log and ' +
      'Import Report with a fresh copy built from the original tab. Edits you made in Master will be lost.\n\n' +
      'To only refresh formulas/formatting, choose Cancel and use "Rebuild views & formatting".',
      ui.ButtonSet.OK_CANCEL);
    if (r !== ui.Button.OK) return;
  }
  var src = findSourceSheet_(ss);
  if (!src) { ui.alert('Could not find the original tab (a header row containing "Student").'); return; }

  // 1. Backup copy of the original (original tab itself is never modified)
  var oldBackup = ss.getSheetByName(SH.BACKUP);
  if (!oldBackup) {
    var bk = src.copyTo(ss).setName(SH.BACKUP);
    bk.setTabColor('#9E9E9E');
    bk.protect().setDescription('Original data backup').setWarningOnly(true);
  }

  // 2. Analyze + import
  var result = analyzeSource(src.getDataRange().getDisplayValues());

  buildSettings_(ss, result.levels, src.getName());
  buildFlights_(ss, result.flights);
  buildMaster_(ss, result.athletes);
  buildLog_(ss, true);
  buildReport_(ss, result);
  buildAllViews_(ss);

  ss.getSheetByName(SH.DASH).activate();
  ui.alert('Setup complete',
    'Imported ' + result.athletes.length + ' athletes into ' + result.flights.length + ' flights.\n' +
    result.issues.length + ' items need review: see the "Import Report" tab.\n\n' +
    'Edit assignments on "Master" and start times on "Flights"; every other tab updates automatically.',
    ui.ButtonSet.OK);
}

function rebuildViews() {
  var ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(SH.MASTER) || !ss.getSheetByName(SH.FLIGHTS) || !ss.getSheetByName(SH.SET)) {
    SpreadsheetApp.getUi().alert('Run "Full setup" first.'); return;
  }
  formatSettings_(ss);
  formatFlights_(ss);
  formatMaster_(ss);
  buildLog_(ss, false);
  buildAllViews_(ss);
  SpreadsheetApp.getActive().toast('Views, formulas and formatting rebuilt.', 'Done', 4);
}

function buildAllViews_(ss) {
  buildSchedule_(ss);
  buildFlightView_(ss);
  buildCoach_(ss);
  buildSearch_(ss);
  buildDashboard_(ss);
  if (!ss.getSheetByName(SH.PUB)) publishSchedule(true);
  applyLevelColors_(ss);
  orderTabs_(ss);
  ss.setRecalculationInterval(SpreadsheetApp.RecalculationInterval.ON_CHANGE);
}

function findSourceSheet_(ss) {
  if (CFG.SOURCE_SHEET_NAME) return ss.getSheetByName(CFG.SOURCE_SHEET_NAME);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var s = sheets[i];
    if (MANAGED.indexOf(s.getName()) >= 0) continue;
    var top = s.getRange(1, 1, Math.min(5, Math.max(1, s.getLastRow())), Math.max(1, s.getLastColumn())).getDisplayValues();
    for (var r = 0; r < top.length; r++)
      for (var c = 0; c < top[r].length; c++)
        if (/^\s*student/i.test(top[r][c])) return s;
  }
  return null;
}

// ============================ ANALYSIS (pure JS, testable) ============================
/** Parse "9:00:00 AM" / "9:15 AM" / "13:30" -> fraction of a day, or null. */
function parseTime(s) {
  s = String(s || '').trim();
  var m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  var h = +m[1], mi = +m[2];
  if (m[4]) { var pm = /p/i.test(m[4]); if (h === 12) h = 0; if (pm) h += 12; }
  if (h > 23 || mi > 59) return null;
  return Math.round((h * 60 + mi)) / 1440;
}
function fmtTime(x) {
  if (x === '' || x === null || x === undefined || isNaN(+x)) return String(x === null || x === undefined ? '' : x);
  var mins = Math.round(+x * 1440) % 1440, h = Math.floor(mins / 60), mi = mins % 60;
  var ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ':' + (mi < 10 ? '0' : '') + mi + ' ' + ap;
}
function flightId(level, num) { return String(level).trim() + ' · F' + num; }

/**
 * Analyze the original sheet (2-D array of display strings).
 * Returns { athletes, flights, levels, issues, stats }. Nothing is invented:
 * a flight's start time is the time most of its athletes were listed with; athletes listed
 * with a different time keep it as a "Time Override".
 */
function analyzeSource(values) {
  // locate header row + columns
  var hr = -1, col = {};
  for (var r = 0; r < Math.min(values.length, 10) && hr < 0; r++) {
    for (var c = 0; c < values[r].length; c++) {
      if (/^\s*student/i.test(values[r][c])) { hr = r; break; }
    }
  }
  if (hr < 0) throw new Error('Header row with "Student" not found');
  var H = values[hr].map(function (h) { return String(h).trim().toLowerCase(); });
  H.forEach(function (h, i) {
    if (h === '#') col.num = i;
    else if (/^student|^athlete|^name/.test(h)) col.name = i;
    else if (/class|level|event/.test(h)) col.level = i;
    else if (/^age/.test(h)) col.age = i;
    else if (/^time|start/.test(h)) col.time = i;
    else if (/flight/.test(h)) col.flight = i;
  });
  var body = values.slice(hr + 1);
  if (col.flight === undefined) { // flight column has no header in the original: find it by content
    var best = -1, bestN = 0;
    for (var c2 = 0; c2 < H.length; c2++) {
      var n = body.filter(function (row) { return /flight\s*\d+/i.test(row[c2] || ''); }).length;
      if (n > bestN) { bestN = n; best = c2; }
    }
    if (best >= 0) col.flight = best;
  }

  var athletes = [], issues = [], levels = [], strays = [];
  var raw = { levelSpaces: 0, flightSpaces: 0, timeFormats: {} };
  var block = 0, prevNum = null;
  body.forEach(function (row, i) {
    var srcRow = hr + i + 2; // 1-based sheet row
    var name = String(row[col.name] || '');
    var nameT = name.trim();
    var otherText = row.filter(function (v, k) { return k !== col.name && String(v).trim() !== ''; });
    var seq = col.num !== undefined ? String(row[col.num]).trim() : '';
    if (seq === '1' || (seq !== '' && prevNum !== null && +seq <= +prevNum)) block++;
    if (seq !== '') prevNum = seq;
    if (!nameT) {
      if (otherText.length) strays.push({ row: srcRow, text: otherText.join(' | ') });
      return;
    }
    var lvlRaw = String(row[col.level] || ''), lvl = lvlRaw.trim();
    if (lvlRaw !== lvl) raw.levelSpaces++;
    var flRaw = String(row[col.flight] || ''), fm = flRaw.match(/(\d+)/), fnum = fm ? +fm[1] : '';
    if (flRaw !== flRaw.trim()) raw.flightSpaces++;
    var tRaw = String(row[col.time] || '').trim(), t = parseTime(tRaw);
    if (tRaw) raw.timeFormats[/:\d\d:\d\d/.test(tRaw) ? 'h:mm:ss AM/PM' : 'h:mm AM/PM'] = 1;
    if (lvl && levels.indexOf(lvl) < 0) levels.push(lvl);
    athletes.push({ name: nameT, level: lvl, flight: fnum, age: String(row[col.age] || '').trim(),
                    timeRaw: tRaw, time: t, srcRow: srcRow, block: block, notes: [], status: '' });
  });

  // ---- flights: start time = most common listed time ----
  var fmap = {}, forder = [];
  athletes.forEach(function (a) {
    if (!a.level || a.flight === '') return;
    var id = flightId(a.level, a.flight);
    if (!fmap[id]) { fmap[id] = { level: a.level, num: a.flight, id: id, times: {}, members: [], notes: '' }; forder.push(id); }
    fmap[id].members.push(a);
    if (a.time !== null) fmap[id].times[a.time] = (fmap[id].times[a.time] || 0) + 1;
  });
  var flights = forder.map(function (id) {
    var f = fmap[id], best = null, bestN = 0;
    Object.keys(f.times).forEach(function (t) {
      var n = f.times[t];
      if (n > bestN || (n === bestN && +t < +best)) { best = +t; bestN = n; }
    });
    f.time = best;
    return f;
  });

  // ---- issues ----
  function flag(a, type, detail) {
    issues.push({ type: type, name: a ? a.name : '', srcRow: a ? a.srcRow : '', detail: detail });
    if (a) { a.notes.push(detail); a.status = 'Pending'; }
  }
  athletes.forEach(function (a) {
    if (!a.level) flag(a, 'Missing level', 'No level in original sheet');
    if (a.flight === '') flag(a, 'Missing flight', 'No flight in original sheet');
    var f = fmap[flightId(a.level, a.flight)];
    if (a.level && a.flight !== '') {
      if (a.time === null) {
        a.override = '';
        flag(a, 'Missing start time', 'No start time in original; now uses flight time ' + fmtTime(f.time) + ' (please confirm)');
      } else if (f.time !== null && a.time !== f.time) {
        a.override = a.time;
        flag(a, 'Time differs from flight', 'Original time ' + fmtTime(a.time) + ' differs from ' + f.id +
             ' time ' + fmtTime(f.time) + '; kept as override (please confirm)');
      } else a.override = '';
    }
  });
  // listed inside another flight's group (row-number block) than the label says
  var blocks = {};
  athletes.forEach(function (a) { (blocks[a.block] = blocks[a.block] || []).push(a); });
  Object.keys(blocks).forEach(function (b) {
    var cnt = {}, list = blocks[b];
    list.forEach(function (a) { var k = flightId(a.level, a.flight); cnt[k] = (cnt[k] || 0) + 1; });
    var major = Object.keys(cnt).sort(function (x, y) { return cnt[y] - cnt[x]; })[0];
    if (list.length < 3) return;
    list.forEach(function (a) {
      var k = flightId(a.level, a.flight);
      if (k !== major) flag(a, 'Listed in another flight\'s group',
        'Listed among ' + major + ' athletes but labeled ' + k + '; kept ' + k + ' (please confirm)');
    });
  });
  // duplicates (same name, case/space-insensitive)
  var byName = {};
  athletes.forEach(function (a) { var k = a.name.toLowerCase().replace(/\s+/g, ' '); (byName[k] = byName[k] || []).push(a); });
  Object.keys(byName).forEach(function (k) {
    var list = byName[k];
    if (list.length < 2) return;
    list.forEach(function (a) {
      var others = list.filter(function (o) { return o !== a; })
        .map(function (o) { return flightId(o.level, o.flight) + ' (row ' + o.srcRow + ')'; }).join(', ');
      flag(a, 'Duplicate athlete', 'Also listed in ' + others + ' - keep one, scratch the other');
    });
  });
  // over-capacity flights
  flights.forEach(function (f) {
    if (f.members.length > CFG.MAX_PER_FLIGHT)
      issues.push({ type: 'Large flight', name: '', srcRow: '', detail: f.id + ' has ' + f.members.length + ' athletes (limit ' + CFG.MAX_PER_FLIGHT + ')' });
  });
  // stray rows (no athlete name)
  strays.forEach(function (s) {
    var after = athletes.filter(function (a) { return a.srcRow < s.row; }).pop();
    if (/break|lunch/i.test(s.text) && after) {
      var f = fmap[flightId(after.level, after.flight)];
      if (f) f.notes = 'Followed by: ' + s.text + ' (from original sheet)';
      issues.push({ type: 'Schedule note', name: '', srcRow: s.row, detail: '"' + s.text + '" saved as a note on ' + (f ? f.id : 'flight') });
    } else {
      issues.push({ type: 'Row without athlete', name: '', srcRow: s.row, detail: 'Row has "' + s.text + '" but no athlete name; not imported' });
    }
  });
  // formatting inconsistencies (info only)
  if (raw.levelSpaces) issues.push({ type: 'Formatting', name: '', srcRow: '', detail: raw.levelSpaces + ' level labels had extra spaces (e.g. "Ninja 1 "); trimmed in Master' });
  if (raw.flightSpaces) issues.push({ type: 'Formatting', name: '', srcRow: '', detail: raw.flightSpaces + ' flight labels had extra spaces (e.g. " flight 3"); stored as numbers in Master' });
  if (Object.keys(raw.timeFormats).length > 1) issues.push({ type: 'Formatting', name: '', srcRow: '', detail: 'Start times mixed "9:00:00 AM" and "9:15 AM" styles; all now h:mm AM/PM' });
  athletes.forEach(function (a) {
    if (a.name !== a.name.replace(/\b[a-z]/g, function (ch) { return ch.toUpperCase(); }) && /^[a-z]|\s[a-z]/.test(a.name))
      issues.push({ type: 'Name check', name: a.name, srcRow: a.srcRow, detail: 'Name has lowercase letters at the start of a word; left as entered' });
    if (/\b[A-Z]\d{2}\b/.test(a.name))
      issues.push({ type: 'Name check', name: a.name, srcRow: a.srcRow, detail: 'Name contains a code (e.g. "Z71"); left as entered' });
  });

  athletes.forEach(function (a) { if (!a.status) a.status = CFG.DEFAULT_STATUS; });
  return {
    athletes: athletes, flights: flights, levels: levels, issues: issues,
    stats: { athletes: athletes.length, flights: flights.length, levels: levels.length, columns: col }
  };
}

// ============================ SHEET HELPERS ============================
function getOrCreate_(ss, name, clear) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  else if (clear) {
    sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
    sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { p.remove(); });
    sh.getBandings().forEach(function (b) { b.remove(); });
    if (sh.getFilter()) sh.getFilter().remove();
    sh.clear(); sh.clearConditionalFormatRules();
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations().breakApart();
  }
  return sh;
}
function ensureSize_(sh, rows, cols) {
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
  if (sh.getMaxColumns() < cols) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
  if (sh.getMaxColumns() > cols) sh.deleteColumns(cols + 1, sh.getMaxColumns() - cols);
}
function title_(sh, text, sub, width) {
  sh.getRange(1, 1, 1, width).merge().setValue(text).setFontSize(18).setFontWeight('bold')
    .setFontColor('#FFFFFF').setBackground(C.navy).setVerticalAlignment('middle');
  sh.setRowHeight(1, 40);
  if (sub !== undefined) {
    var r = sh.getRange(2, 1, 1, width).merge();
    if (String(sub).charAt(0) === '=') r.setFormula(sub); else r.setValue(sub);
    r.setFontColor('#5F6368').setFontStyle('italic').setBackground('#F8F9FA');
  }
}
function protectSheet_(sh, unprotectedA1List, desc) {
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
  var p = sh.protect().setDescription(desc || (sh.getName() + ' is automatic - edit Master/Flights instead')).setWarningOnly(true);
  if (unprotectedA1List && unprotectedA1List.length)
    p.setUnprotectedRanges(unprotectedA1List.map(function (a) { return sh.getRange(a); }));
}
function protectRange_(rng, desc) {
  rng.protect().setDescription(desc).setWarningOnly(true);
}
function headerStyle_(rng, editable) {
  rng.setFontWeight('bold').setFontColor('#FFFFFF').setBackground(editable ? C.editHead : C.lockHead)
     .setVerticalAlignment('middle').setWrap(true);
}
function listRule_(rangeOrList, strict, help) {
  var b = SpreadsheetApp.newDataValidation();
  b = Array.isArray(rangeOrList) ? b.requireValueInList(rangeOrList, true) : b.requireValueInRange(rangeOrList, true);
  return b.setAllowInvalid(!strict).setHelpText(help || '').build();
}
function timeRule_(cellA1, help) {
  return SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied('=OR(' + cellA1 + '="",AND(ISNUMBER(' + cellA1 + '),' + cellA1 + '<1))')
    .setAllowInvalid(false).setHelpText(help || 'Enter a time like 10:30 AM').build();
}
function q_(name) { return "'" + name.replace(/'/g, "''") + "'"; }
var MR = function (col) { return q_(SH.MASTER) + '!' + col + '2:' + col; }; // Master open range
var FR = function (col) { return q_(SH.FLIGHTS) + '!' + col + '2:' + col; }; // Flights open range

// ============================ SETTINGS ============================
function buildSettings_(ss, levels, srcName) {
  var sh = getOrCreate_(ss, SH.SET, true);
  ensureSize_(sh, 40, 12);
  title_(sh, '⚙️ SETTINGS & LISTS', 'Blue headers = editable. Add a level in column A (then menu ▸ Rebuild views) or use menu ▸ Add level.', 12);
  sh.getRange('A4:C4').setValues([['Level', 'Color', 'Order']]);
  var rows = [];
  for (var i = 0; i < 20; i++) rows.push(i < levels.length ? [levels[i], CFG.LEVEL_COLORS[i % CFG.LEVEL_COLORS.length], i + 1] : ['', '', '']);
  sh.getRange(5, 1, 20, 3).setValues(rows);
  sh.getRange('E4').setValue('Status');
  sh.getRange(5, 5, STATUSES.length, 1).setValues(STATUSES.map(function (s) { return [s]; }));
  sh.getRange('G4').setValue('Flight #');
  var nums = []; for (var n = 1; n <= CFG.MAX_FLIGHT_NUMBER; n++) nums.push([n]);
  sh.getRange(5, 7, nums.length, 1).setValues(nums);
  sh.getRange('I4:J4').setValues([['Setting', 'Value']]);
  sh.getRange('I5:J9').setValues([
    ['Max athletes per flight', CFG.MAX_PER_FLIGHT],
    ['Highlight changes for (minutes)', CFG.CHANGE_WINDOW_MIN],
    ['Event name', ss.getName().replace(/\s*-\s*flight list\s*$/i, '')],
    ['Original data tab', srcName],
    ['Default flight length (minutes)', 15]
  ]);
  sh.getRange('L4').setValue('Coach filter list');
  sh.getRange('L5').setFormula('={"All";FILTER(A5:A24,A5:A24<>"")}');
  formatSettings_(ss);
}
function formatSettings_(ss) {
  var sh = ss.getSheetByName(SH.SET);
  headerStyle_(sh.getRange('A4:C4'), true); headerStyle_(sh.getRange('E4'), true);
  headerStyle_(sh.getRange('G4'), true); headerStyle_(sh.getRange('I4:J4'), true);
  headerStyle_(sh.getRange('L4'), false);
  sh.setColumnWidth(1, 160); sh.setColumnWidth(2, 90); sh.setColumnWidth(3, 60);
  sh.setColumnWidth(9, 240); sh.setColumnWidth(10, 220); sh.setColumnWidth(12, 140);
  [4, 6, 8, 11].forEach(function (c) { sh.setColumnWidth(c, 24); });
  var lv = sh.getRange('A5:C24').getValues();
  lv.forEach(function (r, i) { sh.getRange(5 + i, 2).setBackground(r[1] ? r[1] : null); });
  sh.setFrozenRows(4);
  sh.setTabColor('#9E9E9E');
  protectRange_(sh.getRange('L4:L40'), 'Automatic list');
}
function levelsFromSettings_(ss) {
  return ss.getSheetByName(SH.SET).getRange('A5:B24').getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r, i) { return { name: String(r[0]).trim(), color: r[1] || CFG.LEVEL_COLORS[i % CFG.LEVEL_COLORS.length] }; });
}

// ============================ FLIGHTS ============================
function buildFlights_(ss, flights) {
  var sh = getOrCreate_(ss, SH.FLIGHTS, true);
  ensureSize_(sh, CFG.FLIGHT_ROWS, 8);
  var data = flights.map(function (f) { return [f.level, f.num, '', f.time === null ? '' : f.time, '', '', '', f.notes || '']; });
  if (data.length) {
    sh.getRange(2, F.LEVEL, data.length, 2).setValues(data.map(function (r) { return [r[0], r[1]]; }));
    sh.getRange(2, F.TIME, data.length, 1).setValues(data.map(function (r) { return [r[3]]; }));
    sh.getRange(2, F.NOTES, data.length, 1).setValues(data.map(function (r) { return [r[7]]; }));
  }
  formatFlights_(ss);
}
function formatFlights_(ss) {
  var sh = ss.getSheetByName(SH.FLIGHTS);
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { p.remove(); });
  var n = sh.getMaxRows();
  sh.getRange(1, 1, 1, 8).setValues([['Level', 'Flight #', '', 'Start Time', '', '', '', 'Flight Notes']]);
  // header-row formulas (so rows can be added, sorted or deleted freely)
  sh.getRange(1, F.FID).setFormula('={"Flight ID";ARRAYFORMULA(IF((A2:A="")+(B2:B=""),"",TRIM(A2:A)&" · F"&B2:B))}');
  sh.getRange(1, F.COUNT).setFormula('={"Athletes";ARRAYFORMULA(IF(C2:C="","",COUNTIFS(' + MR('I') + ',C2:C,' + MR('E') + ',"<>Scratched")))}');
  sh.getRange(1, F.AGES).setFormula('={"Ages";MAP(C2:C,LAMBDA(id,IF(id="","",IFERROR(LET(a,FILTER(' + MR('G') + ',' + MR('I') +
    '=id,' + MR('E') + '<>"Scratched",' + MR('G') + '<>""),IF(MIN(a)=MAX(a),MIN(a)&"",MIN(a)&"–"&MAX(a))),""))))}');
  sh.getRange(1, F.CHECK).setFormula('={"Check";ARRAYFORMULA(IF(C2:C="","",TRIM(' +
    'IF(D2:D="","⏰ Missing start time  ","")&' +
    'IF(E2:E=0,"∅ No athletes  ","")&' +
    'IF(E2:E>' + q_(SH.SET) + '!$J$5,"🔺 Over "&' + q_(SH.SET) + '!$J$5&"  ","")&' +
    'IF(COUNTIF(C2:C,C2:C)>1,"👥 Duplicate flight ID  ","")&' +
    'IF((D2:D<>"")*(COUNTIF(D2:D,D2:D)>1),"🕒 Shares time slot  ",""))))}');
  headerStyle_(sh.getRange('A1:B1'), true); headerStyle_(sh.getRange('D1'), true); headerStyle_(sh.getRange('H1'), true);
  headerStyle_(sh.getRange('C1'), false); headerStyle_(sh.getRange('E1:G1'), false);
  sh.setRowHeight(1, 34);
  sh.getRange(2, F.FID, n - 1, 1).setBackground(C.lock).setFontWeight('bold');
  sh.getRange(2, F.COUNT, n - 1, 3).setBackground(C.lock).setHorizontalAlignment('center');
  sh.getRange(2, F.CHECK, n - 1, 1).setHorizontalAlignment('left').setFontColor(C.redText);
  sh.getRange(2, F.TIME, n - 1, 1).setNumberFormat(TIME_FMT).setFontSize(14).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(2, F.NUM, n - 1, 1).setHorizontalAlignment('center');
  var set = ss.getSheetByName(SH.SET);
  sh.getRange(2, F.LEVEL, n - 1, 1).setDataValidation(listRule_(set.getRange('A5:A24'), true, 'Pick a level (add new levels on Settings)'));
  sh.getRange(2, F.NUM, n - 1, 1).setDataValidation(listRule_(set.getRange('G5:G24'), true, 'Pick a flight number'));
  sh.getRange(2, F.TIME, n - 1, 1).setDataValidation(timeRule_('D2', 'Start time for EVERY athlete in this flight, e.g. 10:30 AM'));
  [140, 70, 150, 120, 80, 70, 230, 320].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(1); sh.setFrozenColumns(3);
  if (!sh.getFilter()) sh.getRange(1, 1, n, 8).createFilter();
  protectRange_(sh.getRange('C1:C'), 'Flight ID is automatic (Level + Flight #)');
  protectRange_(sh.getRange('E1:G'), 'Automatic counts/checks');
  sh.setTabColor('#1A73E8');
  sh.getRange('D1').setNote('Change a flight\'s time HERE. Every athlete in the flight updates automatically everywhere.');
  sh.getRange('C1').setNote('Flight ID = Level + Flight #. Flight numbers restart for each level, so "Ninja 1 · F3" and "Ninja 2 · F3" are different flights.');
  // CF
  var rng = sh.getRange(2, 1, n - 1, 8);
  var rules = [
    cf_('=AND($C2<>"",$D2="")', sh.getRange(2, F.TIME, n - 1, 1), C.red, C.redText),
    cf_('=AND($C2<>"",COUNTIF($C$2:$C,$C2)>1)', sh.getRange(2, 1, n - 1, 3), C.red, C.redText),
    cf_('=AND($C2<>"",$E2>' + 'INDIRECT("Settings!J5"))', sh.getRange(2, F.COUNT, n - 1, 1), C.orange, '#E65100'),
    cf_('=AND($C2<>"",ISEVEN(ROW()))', rng.offset(0, 3, n - 1, 1), C.band)
  ];
  sh.setConditionalFormatRules(rules);
}
function cf_(formula, range, bg, font, bold, strike) {
  var b = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula).setRanges([].concat(range));
  if (bg) b.setBackground(bg);
  if (font) b.setFontColor(font);
  if (bold) b.setBold(true);
  if (strike) b.setStrikethrough(true);
  return b.build();
}

// ============================ MASTER ============================
function buildMaster_(ss, athletes) {
  var sh = getOrCreate_(ss, SH.MASTER, true);
  ensureSize_(sh, CFG.MASTER_ROWS, 12);
  if (athletes.length) {
    var rows = athletes.map(function (a) {
      return [a.name, a.level, a.flight, '', a.status, a.notes.join(' | '), a.age === '' ? '' : (isNaN(+a.age) ? a.age : +a.age),
              a.override === '' || a.override === undefined ? '' : a.override];
    });
    // write input columns only (D is formula)
    sh.getRange(2, 1, rows.length, 3).setValues(rows.map(function (r) { return r.slice(0, 3); }));
    sh.getRange(2, 5, rows.length, 4).setValues(rows.map(function (r) { return r.slice(4, 8); }));
    sh.getRange(2, M.SRC, rows.length, 1).setValues(athletes.map(function (a) { return [a.srcRow]; }));
  }
  formatMaster_(ss);
}
function formatMaster_(ss) {
  var sh = ss.getSheetByName(SH.MASTER);
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { p.remove(); });
  var n = sh.getMaxRows();
  sh.getRange(1, 1, 1, 12).setValues([M_HEADERS.map(function (h, i) {
    return [M.TIME, M.FID, M.ALERTS].indexOf(i + 1) >= 0 ? '' : h; })]);
  var FL = q_(SH.FLIGHTS);
  sh.getRange(1, M.FID).setFormula('={"Flight ID";ARRAYFORMULA(IF(A2:A="","",IF((B2:B="")+(C2:C=""),"",TRIM(B2:B)&" · F"&C2:C)))}');
  sh.getRange(1, M.TIME).setFormula('={"Start Time";ARRAYFORMULA(IF(A2:A="","",IF(H2:H<>"",H2:H,' +
    'IFERROR(1/(1/VLOOKUP(I2:I,' + FL + '!$C$2:$D,2,FALSE)),""))))}');
  sh.getRange(1, M.ALERTS).setFormula('={"Alerts";ARRAYFORMULA(IF(A2:A="","",TRIM(' +
    'IF(B2:B="","⚠️ No level  ","")&' +
    'IF(C2:C="","⚠️ No flight  ","")&' +
    'IF(I2:I="","",IF(ISNA(MATCH(I2:I,' + FL + '!$C$2:$C,0)),"⛔ Flight not set up  ",IF(D2:D="","⏰ No start time  ","")))&' +
    'IF((E2:E<>"Scratched")*(COUNTIFS(A2:A,A2:A,E2:E,"<>Scratched")>1),"👥 Duplicate  ","")&' +
    'IF(H2:H<>"","⏱️ Time override  ",""))))}');
  var editCols = [M.NAME, M.LEVEL, M.FLIGHT, M.STATUS, M.NOTES, M.AGE, M.OVERRIDE];
  for (var c = 1; c <= 12; c++) headerStyle_(sh.getRange(1, c), editCols.indexOf(c) >= 0);
  sh.setRowHeight(1, 36);
  sh.getRange(1, 1, n, 12).setVerticalAlignment('middle');
  [M.TIME, M.FID, M.ALERTS, M.CHANGED, M.SRC].forEach(function (c) { sh.getRange(2, c, n - 1, 1).setBackground(C.lock); });
  sh.getRange(2, M.TIME, n - 1, 1).setNumberFormat(TIME_FMT).setFontSize(13).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(2, M.OVERRIDE, n - 1, 1).setNumberFormat(TIME_FMT).setHorizontalAlignment('center');
  sh.getRange(2, M.CHANGED, n - 1, 1).setNumberFormat('m/d h:mm AM/PM').setFontSize(9);
  sh.getRange(2, M.FLIGHT, n - 1, 1).setHorizontalAlignment('center');
  sh.getRange(2, M.AGE, n - 1, 1).setHorizontalAlignment('center');
  sh.getRange(2, M.SRC, n - 1, 1).setFontColor('#9AA0A6').setFontSize(9).setHorizontalAlignment('center');
  sh.getRange(2, M.ALERTS, n - 1, 1).setFontColor(C.redText).setFontSize(9);
  sh.getRange(2, M.NAME, n - 1, 1).setFontWeight('bold');
  var set = ss.getSheetByName(SH.SET);
  sh.getRange(2, M.LEVEL, n - 1, 1).setDataValidation(listRule_(set.getRange('A5:A24'), true, 'Pick a level. New levels: Settings tab or menu ▸ Add level'));
  sh.getRange(2, M.FLIGHT, n - 1, 1).setDataValidation(listRule_(set.getRange('G5:G24'), true, 'Flight number within the level (flights restart at 1 for each level)'));
  sh.getRange(2, M.STATUS, n - 1, 1).setDataValidation(listRule_(set.getRange('E5:E8'), true, 'Confirmed / Pending / Changed / Scratched'));
  sh.getRange(2, M.OVERRIDE, n - 1, 1).setDataValidation(timeRule_('H2', 'ONLY for an athlete who must start at a different time than their flight. Leave blank normally.'));
  sh.getRange(2, M.AGE, n - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(1, 99).setAllowInvalid(true).build());
  [190, 110, 70, 110, 100, 260, 50, 95, 130, 210, 110, 60].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(1); sh.setFrozenColumns(1);
  if (!sh.getFilter()) sh.getRange(1, 1, n, 12).createFilter();
  protectRange_(sh.getRange('D1:D'), 'Start Time is automatic (from Flights). Use "Time Override" for exceptions.');
  protectRange_(sh.getRange('I1:L'), 'Automatic columns (Flight ID, Alerts, Last Changed, Orig Row)');
  protectRange_(sh.getRange('A1:H1'), 'Header row holds formulas');
  sh.getRange('D1').setNote('Automatic: comes from the Flights tab. To change it for one athlete only, type a time in "Time Override".');
  sh.getRange('H1').setNote('Leave blank so the athlete follows the flight time. Fill only for exceptions; they are highlighted orange.');
  sh.getRange('K1').setNote('Stamped automatically when Level, Flight, Status or Override changes. Recent changes are highlighted yellow.');
  sh.setTabColor('#1A73E8');
  masterCF_(ss);
}
function masterCF_(ss) {
  var sh = ss.getSheetByName(SH.MASTER), n = sh.getMaxRows() - 1;
  var R = function (c1, c2) { return sh.getRange(2, c1, n, (c2 || c1) - c1 + 1); };
  var recent = 'AND($K2<>"",NOW()-$K2<INDIRECT("Settings!J6")/1440)';
  var rules = [
    cf_('=$E2="Scratched"', R(1, 12), '#ECEFF1', '#90A4AE', false, true),
    cf_('=AND($A2<>"",B2="")', R(M.LEVEL, M.FLIGHT), '#F28B82', '#FFFFFF', true),
    cf_('=AND($A2<>"",$I2<>"",$D2="")', R(M.TIME), C.red, C.redText),
    cf_('=REGEXMATCH($J2,"Flight not set up")', R(M.LEVEL, M.FLIGHT), C.red, C.redText, true),
    cf_('=REGEXMATCH($J2,"Duplicate")', R(M.NAME), C.red, C.redText, true),
    cf_('=' + recent, [R(M.NAME), R(M.FLIGHT, M.FLIGHT), R(M.STATUS, M.NOTES), R(M.CHANGED)], C.yellow, null, true),
    cf_('=$H2<>""', [R(M.TIME), R(M.OVERRIDE)], C.orange, '#E65100', true),
    cf_('=$E2="Changed"', R(M.STATUS), '#FFF3E0', '#E65100', true),
    cf_('=$E2="Pending"', R(M.STATUS), '#FFFDE7', '#8D6E00'),
    cf_('=$E2="Confirmed"', R(M.STATUS), '#E6F4EA', '#137333'),
    cf_('=AND($A2<>"",ISEVEN(ROW()))', [R(M.NAME), R(M.FLIGHT), R(M.NOTES, M.OVERRIDE)], C.band)
  ];
  sh.setConditionalFormatRules(rules);
}

// ============================ CHANGE LOG ============================
function buildLog_(ss, reset) {
  var sh = ss.getSheetByName(SH.LOG);
  if (!sh || reset) {
    sh = getOrCreate_(ss, SH.LOG, true);
    ensureSize_(sh, 1000, 7);
  }
  sh.getRange('A1:G1').setValues([['When', 'Athlete / Flight', 'Field', 'Old value', 'New value', 'Master row', 'Edited by']]);
  headerStyle_(sh.getRange('A1:G1'), false);
  sh.getRange('A2:A').setNumberFormat('m/d h:mm:ss AM/PM');
  [140, 190, 120, 160, 160, 80, 180].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(1);
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
  sh.protect().setDescription('Change log is written automatically').setWarningOnly(true);
  sh.setConditionalFormatRules([cf_('=AND($A2<>"",NOW()-$A2<INDIRECT("Settings!J6")/1440)', sh.getRange('A2:G'), C.yellow)]);
  sh.setTabColor('#F9AB00');
}

// ============================ IMPORT REPORT ============================
function buildReport_(ss, result) {
  var sh = getOrCreate_(ss, SH.REPORT, true);
  ensureSize_(sh, Math.max(60, result.issues.length + 20), 4);
  title_(sh, '🔎 IMPORT REPORT - what was found in the original sheet', 'Built ' +
    Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MMM d, yyyy h:mm a') + ' · ' + result.stats.athletes +
    ' athletes · ' + result.stats.flights + ' flights · ' + result.stats.levels + ' levels. Flagged athletes were set to "Pending".', 4);
  sh.getRange('A4:D4').setValues([['Type', 'Athlete', 'Original row', 'Details / action taken']]);
  headerStyle_(sh.getRange('A4:D4'), false);
  var order = ['Duplicate athlete', 'Time differs from flight', 'Missing start time', 'Listed in another flight\'s group',
               'Missing level', 'Missing flight', 'Row without athlete', 'Large flight', 'Schedule note', 'Formatting', 'Name check'];
  var rows = result.issues.slice().sort(function (a, b) {
    return (order.indexOf(a.type) - order.indexOf(b.type)) || (String(a.name) < String(b.name) ? -1 : 1);
  }).map(function (i) { return [i.type, i.name, i.srcRow, i.detail]; });
  if (rows.length) sh.getRange(5, 1, rows.length, 4).setValues(rows);
  [200, 190, 90, 640].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.getRange('D5:D').setWrap(true);
  sh.setFrozenRows(4);
  sh.setConditionalFormatRules([
    cf_('=REGEXMATCH($A5,"Duplicate|differs|Missing|another flight|without")', sh.getRange('A5:D'), C.red, C.redText),
    cf_('=REGEXMATCH($A5,"Large")', sh.getRange('A5:D'), '#FFF3E0', '#E65100')
  ]);
  protectSheet_(sh, [], 'Import report (reference only)');
  sh.setTabColor('#9E9E9E');
}

// ============================ SCHEDULE (auto-sorted) ============================
function buildSchedule_(ss) {
  var sh = getOrCreate_(ss, SH.SCHED, true);
  ensureSize_(sh, CFG.MASTER_ROWS + 10, 10);
  title_(sh, '🗓️ COMPETITION SCHEDULE  (automatic)',
    '="Sorted by start time ▸ flight ▸ level ▸ athlete · "&COUNTA(D5:D)&" athletes (scratched hidden) · Edit on Master / Flights"', 8);
  sh.getRange('A4:J4').setValues([['Start Time', 'Flight', 'Level', 'Athlete', 'Age', 'Status', 'Notes', 'Alerts', 'F#', 'Grp']]);
  headerStyle_(sh.getRange('A4:J4'), false);
  sh.getRange('A5').setFormula('=IFERROR(SORT(FILTER({' + [MR('D'), MR('I'), MR('B'), MR('A'), MR('G'), MR('E'), MR('F'), MR('J'), MR('C')].join(',') +
    '},' + MR('A') + '<>"",' + MR('E') + '<>"Scratched"),1,TRUE,9,TRUE,3,TRUE,4,TRUE),"")');
  sh.getRange('J5').setFormula('=ARRAYFORMULA(IF(D5:D="","",MATCH(B5:B&"|"&A5:A,UNIQUE(B5:B&"|"&A5:A),0)))');
  sh.hideColumns(9, 2);
  sh.getRange('A5:A').setNumberFormat(TIME_FMT).setFontSize(14).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange('B5:B').setFontWeight('bold');
  sh.getRange('E5:E').setHorizontalAlignment('center');
  sh.getRange('H5:H').setFontSize(9);
  [110, 130, 110, 200, 50, 95, 260, 200].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(4);
  var n = sh.getMaxRows() - 4, R = function (c1, c2) { return sh.getRange(5, c1, n, c2 - c1 + 1); };
  var first = 'OR($B5<>$B4,$A5<>$A4)';
  var rules = [
    cf_('=$H5<>""', R(8, 8), C.red, C.redText),
    cf_('=$F5="Changed"', R(6, 6), '#FFF3E0', '#E65100', true)
  ].concat(levelRules_(ss, '$C5', R(3, 3))).concat([
    cf_('=AND($D5<>"",NOT(' + first + '),ISODD($J5))', R(1, 1), C.band, '#B0B8C4'),
    cf_('=AND($D5<>"",NOT(' + first + '))', R(1, 1), null, '#B0B8C4'),
    cf_('=AND($D5<>"",' + first + ',ISODD($J5))', R(1, 8), C.band, null, true),
    cf_('=AND($D5<>"",' + first + ')', R(1, 8), null, null, true),
    cf_('=AND($D5<>"",ISODD($J5))', R(1, 8), C.band)
  ]);
  sh.setConditionalFormatRules(rules);
  protectSheet_(sh, [], 'Schedule is automatic - edit Master / Flights');
  sh.setTabColor('#34A853');
}

function levelRules_(ss, cellRef, ranges) {
  return levelsFromSettings_(ss).map(function (l) {
    return cf_('=' + cellRef + '="' + l.name.replace(/"/g, '""') + '"', ranges, l.color, '#202124', true);
  });
}

// ============================ FLIGHT VIEW ============================
function buildFlightView_(ss) {
  var sh = getOrCreate_(ss, SH.FVIEW, true);
  ensureSize_(sh, 80, 8);
  title_(sh, '🎯 FLIGHT VIEW', 'Pick a flight in the yellow box. Updates instantly when Master or Flights change.', 8);
  var FL = q_(SH.FLIGHTS);
  sh.getRange('A4').setValue('Select flight ▸').setFontWeight('bold').setHorizontalAlignment('right').setFontSize(12);
  var first = ss.getSheetByName(SH.FLIGHTS).getRange('C2').getDisplayValue();
  sh.getRange('B4:C4').merge().setValue(first).setBackground('#FFF59D').setFontSize(16).setFontWeight('bold')
    .setDataValidation(listRule_(ss.getSheetByName(SH.FLIGHTS).getRange('C2:C' + CFG.FLIGHT_ROWS), true, 'Choose a flight'));
  var lk = function (col) { return '=IFERROR(INDEX(' + FL + '!' + col + '2:' + col + ',MATCH($B$4,' + FL + '!C2:C,0)),"")'; };
  var labels = [['Start time', lk('D')], ['Level', lk('A')], ['Athletes', '=COUNTIFS(' + MR('I') + ',$B$4,' + MR('E') + ',"<>Scratched")'],
                ['Scratched', '=COUNTIFS(' + MR('I') + ',$B$4,' + MR('E') + ',"Scratched")'],
                ['Flight notes', lk('H')], ['Flight check', lk('G')]];
  labels.forEach(function (p, i) {
    var r = 6 + i;
    sh.getRange(r, 1).setValue(p[0]).setFontWeight('bold').setHorizontalAlignment('right').setFontColor('#5F6368');
    sh.getRange(r, 2, 1, 6).merge().setFormula(p[1]).setHorizontalAlignment('left');
  });
  sh.getRange('B6').setNumberFormat(TIME_FMT).setFontSize(30).setFontWeight('bold').setFontColor(C.navy);
  sh.setRowHeight(6, 50);
  sh.getRange('B7:B9').setFontSize(13).setFontWeight('bold');
  sh.getRange('B11').setFontColor(C.redText);
  sh.getRange('A13:H13').setValues([['#', 'Athlete', 'Level', 'Age', 'Start Time', 'Status', 'Notes', 'Alerts / exceptions']]);
  headerStyle_(sh.getRange('A13:H13'), false);
  sh.getRange('A14').setFormula('=IFERROR(SEQUENCE(COUNTIF(' + MR('I') + ',$B$4)),"")');
  sh.getRange('B14').setFormula('=ARRAYFORMULA(IFERROR(SORT(FILTER({' + [MR('A'), MR('B'), MR('G'), MR('D'), MR('E'), MR('F'), MR('J')].join(',') +
    ',IF(' + MR('E') + '="Scratched",1,0)},' + MR('I') + '=$B$4),8,TRUE,1,TRUE),"No athletes are assigned to this flight"))');
  sh.hideColumns(9);
  sh.getRange('E14:E').setNumberFormat(TIME_FMT).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange('A14:A').setHorizontalAlignment('center').setFontColor('#5F6368');
  sh.getRange('D14:D').setHorizontalAlignment('center');
  sh.getRange('B14:B').setFontWeight('bold').setFontSize(12);
  [130, 200, 110, 50, 100, 95, 240, 210].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(4);
  var n = 60, R = function (c1, c2) { return sh.getRange(14, c1, n, c2 - c1 + 1); };
  sh.setConditionalFormatRules([
    cf_('=$F14="Scratched"', R(1, 8), '#ECEFF1', '#90A4AE', false, true),
    cf_('=REGEXMATCH($H14,"override")', R(5, 5), C.orange, '#E65100', true),
    cf_('=$H14<>""', R(8, 8), C.red, C.redText)
  ].concat(levelRules_(ss, '$C14', R(3, 3))).concat([
    cf_('=AND($B14<>"",ISEVEN(ROW()))', R(1, 8), C.band)
  ]));
  protectSheet_(sh, ['B4'], 'Flight View is automatic - only the yellow box is editable');
  sh.setTabColor('#34A853');
}

// ============================ COACH VIEW ============================
function buildCoach_(ss) {
  var sh = getOrCreate_(ss, SH.COACH, true);
  ensureSize_(sh, CFG.MASTER_ROWS + 10, 6);
  title_(sh, '📣 COACH VIEW - every athlete in start-time order', 'Choose a level in the yellow box (or All). Scratched athletes are hidden.', 5);
  sh.getRange('A4').setValue('Level ▸').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('B4').setValue('All').setBackground('#FFF59D').setFontWeight('bold').setFontSize(13)
    .setDataValidation(listRule_(ss.getSheetByName(SH.SET).getRange('L5:L30'), true, 'All or one level'));
  sh.getRange('A6:E6').setValues([['Start Time', 'Athlete', 'Level', 'Flight', 'Age']]);
  headerStyle_(sh.getRange('A6:E6'), false);
  sh.getRange('A7').setFormula('=IFERROR(SORT(FILTER({' + [MR('D'), MR('A'), MR('B'), MR('I'), MR('G')].join(',') + '},' +
    MR('A') + '<>"",' + MR('E') + '<>"Scratched",(($B$4="All")+(' + MR('B') + '=$B$4))>0),1,TRUE,2,TRUE),"No athletes")');
  sh.getRange('F7').setFormula('=ARRAYFORMULA(IF(B7:B="","",MATCH(A7:A&"",UNIQUE(A7:A&""),0)))');
  sh.hideColumns(6);
  sh.getRange('A7:A').setNumberFormat(TIME_FMT).setFontSize(13).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange('B7:B').setFontWeight('bold');
  sh.getRange('E7:E').setHorizontalAlignment('center');
  [110, 210, 110, 140, 50].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(6);
  var n = sh.getMaxRows() - 6, R = function (c1, c2) { return sh.getRange(7, c1, n, c2 - c1 + 1); };
  sh.setConditionalFormatRules(levelRules_(ss, '$C7', R(3, 3)).concat([
    cf_('=AND($B7<>"",$A7<>$A6)', R(1, 5), null, null, true),
    cf_('=AND($B7<>"",ISODD($F7))', R(1, 5), C.band)
  ]));
  protectSheet_(sh, ['B4'], 'Coach View is automatic');
  sh.setTabColor('#34A853');
}

// ============================ ATHLETE SEARCH ============================
function buildSearch_(ss) {
  var sh = getOrCreate_(ss, SH.SEARCH, true);
  ensureSize_(sh, 200, 8);
  title_(sh, '🔍 ATHLETE SEARCH', 'Type any part of a name in the yellow box (2+ letters). Results include scratched athletes.', 8);
  sh.getRange('A4').setValue('Search ▸').setFontWeight('bold').setHorizontalAlignment('right').setFontSize(12);
  sh.getRange('B4:C4').merge().setBackground('#FFF59D').setFontSize(14).setFontWeight('bold');
  sh.getRange('A6:H6').setValues([['Athlete', 'Level', 'Flight', 'Start Time', 'Status', 'Notes', 'Alerts', 'Master row']]);
  headerStyle_(sh.getRange('A6:H6'), false);
  sh.getRange('A7').setFormula('=ARRAYFORMULA(IF(LEN(TRIM($B$4))<2,"Type at least 2 letters of a name above",IFERROR(SORT(FILTER({' +
    [MR('A'), MR('B'), MR('I'), MR('D'), MR('E'), MR('F'), MR('J'), 'ROW(' + MR('A') + ')'].join(',') +
    '},ISNUMBER(SEARCH(TRIM($B$4),' + MR('A') + '))),1,TRUE),"No athlete matches \u201C"&$B$4&"\u201D")))');
  sh.getRange('D7:D').setNumberFormat(TIME_FMT).setFontWeight('bold').setFontSize(13).setHorizontalAlignment('center');
  sh.getRange('A7:A').setFontWeight('bold');
  sh.getRange('H7:H').setHorizontalAlignment('center').setFontColor('#5F6368');
  [200, 110, 130, 100, 95, 240, 200, 80].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(6);
  var R = function (c1, c2) { return sh.getRange(7, c1, 190, c2 - c1 + 1); };
  sh.setConditionalFormatRules([
    cf_('=$E7="Scratched"', R(1, 8), '#ECEFF1', '#90A4AE', false, true),
    cf_('=$G7<>""', R(7, 7), C.red, C.redText)
  ].concat(levelRules_(ss, '$B7', R(2, 2))));
  protectSheet_(sh, ['B4'], 'Search results are automatic');
  sh.setTabColor('#34A853');
}

// ============================ DASHBOARD ============================
function buildDashboard_(ss) {
  var sh = getOrCreate_(ss, SH.DASH, true);
  ensureSize_(sh, 160, 12);
  var S = q_(SH.SET), FL = q_(SH.FLIGHTS), LG = q_(SH.LOG);
  title_(sh, '🥷 COMPETITION DASHBOARD', '=' + S + '!J7&"  ·  live · updates automatically from Master & Flights"', 12);
  sh.getRange('A1').setFormula('="🥷 "&UPPER(' + S + '!J7)&"  ·  DASHBOARD"');
  [16, 160, 130, 110, 110, 130, 24, 95, 150, 110, 80, 210].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  var win = S + '!$J$6/1440';
  var activeFlights = FL + '!C2:C<>"",' + FL + '!E2:E>0,' + FL + '!D2:D<>""';
  var tiles = [
    // row 4-6
    [4, 2, 'REGISTERED', '=COUNTIF(' + MR('A') + ',"?*")', '="incl. "&COUNTIF(' + MR('E') + ',"Scratched")&" scratched"'],
    [4, 3, 'ACTIVE', '=COUNTIFS(' + MR('A') + ',"?*",' + MR('E') + ',"<>Scratched")', '="competing"'],
    [4, 4, 'FLIGHTS', '=COUNTIFS(' + FR('C') + ',"?*",' + FR('E') + ',">0")', '="of "&COUNTIF(' + FR('C') + ',"?*")&" set up"'],
    [4, 5, 'FIRST FLIGHT', '=IFERROR(INDEX(SORT(FILTER({' + FR('D') + ',' + FR('C') + '},' + activeFlights + '),1,TRUE),1,1),"—")',
                           '=IFERROR(INDEX(SORT(FILTER({' + FR('D') + ',' + FR('C') + '},' + activeFlights + '),1,TRUE),1,2),"")'],
    [4, 6, 'LAST FLIGHT', '=IFERROR(INDEX(SORT(FILTER({' + FR('D') + ',' + FR('C') + '},' + activeFlights + '),1,FALSE),1,1),"—")',
                          '=IFERROR(INDEX(SORT(FILTER({' + FR('D') + ',' + FR('C') + '},' + activeFlights + '),1,FALSE),1,2),"")'],
    // row 8-10
    [8, 2, 'MISSING ASSIGNMENT', '=COUNTIF(' + MR('J') + ',"*No level*")+COUNTIFS(' + MR('J') + ',"*No flight*",' + MR('J') + ',"<>*No level*")+COUNTIF(' + MR('J') + ',"*not set up*")', '="level / flight / invalid"'],
    [8, 3, 'NO START TIME', '=COUNTIF(' + MR('J') + ',"*No start time*")+COUNTIF(' + FR('G') + ',"*Missing start*")', '="athletes + flights"'],
    [8, 4, 'DUPLICATES', '=COUNTIF(' + MR('J') + ',"*Duplicate*")', '="entries to review"'],
    [8, 5, 'TIME OVERRIDES', '=COUNTIF(' + MR('H') + ',"<>")', '="individual exceptions"'],
    [8, 6, 'CHANGED RECENTLY', '=COUNTIFS(' + MR('K') + ',">="&(NOW()-' + win + '))', '="last "&' + S + '!J6&" min · "&COUNTIF(' + MR('E') + ',"Changed")&" marked Changed"']
  ];
  tiles.forEach(function (t) {
    var r = t[0], c = t[1];
    sh.getRange(r, c).setValue(t[2]).setFontSize(9).setFontColor('#5F6368').setFontWeight('bold');
    sh.getRange(r + 1, c).setFormula(t[3]).setFontSize(26).setFontWeight('bold').setFontColor(C.navy);
    sh.getRange(r + 2, c).setFormula(t[4]).setFontSize(9).setFontColor('#5F6368');
    sh.getRange(r, c, 3, 1).setBackground('#F8F9FA').setHorizontalAlignment('center')
      .setBorder(true, true, true, true, false, false, '#DADCE0', SpreadsheetApp.BorderStyle.SOLID);
  });
  sh.getRange('E5:F5').setNumberFormat(TIME_FMT).setFontSize(20);
  sh.setRowHeight(5, 48); sh.setRowHeight(9, 48); sh.setRowHeight(7, 10);
  sh.setConditionalFormatRules([]);
  var alertTiles = sh.getRange('B9:D9');

  // ---- By level (B12:F32) ----
  section_(sh, 12, 2, 'ATHLETES BY LEVEL', 5);
  sh.getRange('B13:F13').setValues([['Level', 'Athletes', 'Flights', 'Scratched', '']]);
  headerStyle_(sh.getRange('B13:F13'), false);
  sh.getRange('B14').setFormula('=FILTER(' + S + '!A5:A24,' + S + '!A5:A24<>"")');
  sh.getRange('C14').setFormula('=ARRAYFORMULA(IF(B14:B33="","",COUNTIFS(' + MR('B') + ',B14:B33,' + MR('E') + ',"<>Scratched")))');
  sh.getRange('D14').setFormula('=ARRAYFORMULA(IF(B14:B33="","",COUNTIFS(' + FR('A') + ',B14:B33,' + FR('E') + ',">0")))');
  sh.getRange('E14').setFormula('=ARRAYFORMULA(IF(B14:B33="","",COUNTIFS(' + MR('B') + ',B14:B33,' + MR('E') + ',"Scratched")))');
  sh.getRange('F14').setFormula('=ARRAYFORMULA(IF(B14:B33="","",REPT("█",ROUND(20*C14:C33/MAX(1,MAX(C14:C33))))))');
  sh.getRange('C14:E33').setHorizontalAlignment('center').setFontSize(12);
  sh.getRange('C14:C33').setFontWeight('bold');
  sh.getRange('F14:F33').setFontColor('#1A73E8').setFontSize(8);

  // ---- Needs attention (B36:F56) ----
  section_(sh, 36, 2, 'NEEDS ATTENTION (top 20)', 5);
  sh.getRange('B37:F37').setValues([['Athlete', 'Flight', 'Issue', '', '']]);
  headerStyle_(sh.getRange('B37:F37'), false);
  sh.getRange('B38').setFormula('=IFERROR(ARRAY_CONSTRAIN(SORT(FILTER({' + MR('A') + ',' + MR('I') + ',' + MR('J') + '},' + MR('A') + '<>"",' +
    MR('J') + '<>"",' + MR('J') + '<>"⏱️ Time override"),2,TRUE),20,3),"✅ Nothing needs attention")');
  sh.getRange('D38:D57').setFontColor(C.redText).setFontSize(9);

  // ---- Recent changes (B60:F80) ----
  section_(sh, 60, 2, 'RECENT CHANGES (from Change Log)', 5);
  sh.getRange('B61:F61').setValues([['When', 'Athlete / Flight', 'Field', 'Old', 'New']]);
  headerStyle_(sh.getRange('B61:F61'), false);
  sh.getRange('B62').setFormula('=IFERROR(ARRAY_CONSTRAIN(SORT(FILTER({' + LG + '!A2:A,' + LG + '!B2:B,' + LG + '!C2:C,' + LG + '!D2:D,' + LG + '!E2:E},' +
    LG + '!A2:A<>""),1,FALSE),20,5),"No changes logged yet")');
  sh.getRange('B62:B81').setNumberFormat('h:mm AM/PM').setFontSize(9);

  // ---- By flight (H12:L...) ----
  section_(sh, 12, 8, 'ATHLETES BY FLIGHT (in time order)', 5);
  sh.getRange('H13:L13').setValues([['Start', 'Flight', 'Level', 'Athletes', 'Check']]);
  headerStyle_(sh.getRange('H13:L13'), false);
  sh.getRange('H14').setFormula('=IFERROR(SORT(FILTER({' + FR('D') + ',' + FR('C') + ',' + FR('A') + ',' + FR('E') + ',' + FR('G') + '},' +
    FR('C') + '<>""),1,TRUE,2,TRUE),"")');
  sh.getRange('H14:H160').setNumberFormat(TIME_FMT).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange('K14:K160').setHorizontalAlignment('center').setFontWeight('bold');
  sh.getRange('L14:L160').setFontColor(C.redText).setFontSize(9);

  sh.setFrozenRows(2);
  var rules = [
    cf_('=B9>0', alertTiles, '#FDECEA', C.redText),
    cf_('=E9>0', sh.getRange('E9:F9'), '#FFF8E1', '#E65100'),
    cf_('=AND($K14<>"",$K14>INDIRECT("Settings!J5"))', sh.getRange('K14:K160'), C.orange, '#E65100')
  ];
  rules = rules.concat(levelRules_(ss, '$B14', sh.getRange('B14:B33')))
               .concat(levelRules_(ss, '$J14', sh.getRange('J14:J160')))
               .concat([cf_('=AND($I14<>"",ISEVEN(ROW()))', sh.getRange('H14:L160'), C.band),
                        cf_('=AND($B38<>"",ISEVEN(ROW()))', sh.getRange('B38:F57'), C.band),
                        cf_('=AND($B62<>"",ISEVEN(ROW()))', sh.getRange('B62:F81'), C.band)]);
  sh.setConditionalFormatRules(rules);
  sh.setHiddenGridlines(true);
  protectSheet_(sh, [], 'Dashboard is automatic');
  sh.setTabColor('#202124');
}
function section_(sh, row, col, text, width) {
  sh.getRange(row, col, 1, width).merge().setValue(text).setFontWeight('bold').setFontSize(11)
    .setFontColor(C.navy).setBorder(null, null, true, null, null, null, C.navy, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

// ============================ LEVEL COLORS ============================
function applyLevelColors_(ss) {
  // Master + Flights level columns (prepend level rules ahead of existing rules)
  [[SH.MASTER, '$B2', 'B2:B', 4], [SH.FLIGHTS, '$A2', 'A2:A', 2]].forEach(function (x) {
    var sh = ss.getSheetByName(x[0]);
    var keep = sh.getConditionalFormatRules().filter(function (r) {
      var cond = r.getBooleanCondition();
      var vals = cond ? cond.getCriteriaValues() : [];
      return !(vals.length && /^=\$[AB]2="/.test(String(vals[0])));
    });
    var rules = keep.slice(0, x[3]).concat(levelRules_(ss, x[1], sh.getRange(x[2]))).concat(keep.slice(x[3]));
    sh.setConditionalFormatRules(rules);
  });
  var set = ss.getSheetByName(SH.SET);
  set.getRange('A5:B24').getValues().forEach(function (r, i) { set.getRange(5 + i, 2).setBackground(r[1] || null); });
}

function orderTabs_(ss) {
  var order = [SH.DASH, SH.MASTER, SH.FLIGHTS, SH.SCHED, SH.FVIEW, SH.COACH, SH.SEARCH, SH.PUB, SH.LOG, SH.REPORT, SH.SET, SH.BACKUP];
  var pos = 1;
  order.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    ss.setActiveSheet(sh); ss.moveActiveSheet(pos++);
  });
}

// ============================ ON EDIT: change log + stamps ============================
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet(), name = sh.getName();
    if (name === SH.MASTER) masterEdited_(e, sh);
    else if (name === SH.FLIGHTS) flightsEdited_(e, sh);
  } catch (err) { console.error(err); }
}
var TRACK = {}; TRACK[M.NAME] = 'Name'; TRACK[M.LEVEL] = 'Level'; TRACK[M.FLIGHT] = 'Flight #'; TRACK[M.STATUS] = 'Status';
TRACK[M.NOTES] = 'Notes'; TRACK[M.AGE] = 'Age'; TRACK[M.OVERRIDE] = 'Time override';
var ASSIGN_COLS = [M.LEVEL, M.FLIGHT, M.OVERRIDE, M.STATUS];

function masterEdited_(e, sh) {
  var rg = e.range, r0 = rg.getRow(), c0 = rg.getColumn(), nr = rg.getNumRows(), nc = rg.getNumColumns();
  if (r0 + nr - 1 < 2) return;
  var single = nr === 1 && nc === 1;
  var vals = sh.getRange(r0, 1, nr, M.SRC).getValues();
  var disp = sh.getRange(r0, 1, nr, M.SRC).getDisplayValues();
  var now = new Date(), user = currentUser_(), logRows = [], stamp = [], status = [];
  for (var i = 0; i < nr; i++) {
    var row = r0 + i; if (row < 2) continue;
    var touchedAssign = false, statusEdited = false;
    for (var j = 0; j < nc; j++) {
      var col = c0 + j;
      if (!TRACK[col]) continue;
      var newV = disp[i][col - 1];
      var oldV = single ? (e.oldValue === undefined ? '' : String(e.oldValue)) : '(multi-cell edit)';
      if (single && col === M.OVERRIDE && oldV !== '' && !isNaN(+oldV)) oldV = fmtTime(+oldV);
      if (single && oldV === newV) continue;
      logRows.push([now, disp[i][M.NAME - 1] || (col === M.NAME ? oldV : ''), TRACK[col], oldV, newV, row, user]);
      if (ASSIGN_COLS.indexOf(col) >= 0) touchedAssign = true;
      if (col === M.STATUS) statusEdited = true;
    }
    if (touchedAssign && vals[i][M.NAME - 1] !== '') {
      stamp.push(row);
      var st = vals[i][M.STATUS - 1];
      if (!statusEdited && st !== 'Scratched' && st !== 'Changed') status.push([row, st === '' ? 'Pending' : 'Changed', st]);
    }
  }
  stamp.forEach(function (r) { sh.getRange(r, M.CHANGED).setValue(now); });
  status.forEach(function (x) {
    sh.getRange(x[0], M.STATUS).setValue(x[1]);
    logRows.push([now, sh.getRange(x[0], M.NAME).getDisplayValue(), 'Status (auto)', x[2], x[1], x[0], user]);
  });
  appendLog_(logRows);
}

function flightsEdited_(e, sh) {
  var rg = e.range, r0 = rg.getRow(), c0 = rg.getColumn(), nr = rg.getNumRows(), nc = rg.getNumColumns();
  if (r0 + nr - 1 < 2) return;
  if (c0 > F.TIME || c0 + nc - 1 < F.LEVEL) return; // only Level, Flight #, Start Time
  var single = nr === 1 && nc === 1, now = new Date(), user = currentUser_(), logRows = [];
  var disp = sh.getRange(r0, 1, nr, F.TIME).getDisplayValues();
  var touched = {};
  for (var i = 0; i < nr; i++) {
    if (r0 + i < 2) continue;
    var fid = disp[i][F.FID - 1];
    for (var j = 0; j < nc; j++) {
      var col = c0 + j; if ([F.LEVEL, F.NUM, F.TIME].indexOf(col) < 0) continue;
      var label = col === F.TIME ? 'Flight start time' : (col === F.LEVEL ? 'Flight level' : 'Flight number');
      var oldV = single ? (e.oldValue === undefined ? '' : String(e.oldValue)) : '(multi-cell edit)';
      if (single && col === F.TIME && oldV !== '' && !isNaN(+oldV)) oldV = fmtTime(+oldV);
      var newV = disp[i][col - 1];
      if (single && oldV === newV) continue;
      logRows.push([now, fid, label, oldV, newV, '', user]);
      if (col === F.TIME && fid) touched[fid] = true;
    }
  }
  // stamp every athlete in a flight whose time changed (status is left as is)
  var ids = Object.keys(touched);
  if (ids.length) {
    var ms = sh.getParent().getSheetByName(SH.MASTER), last = ms.getLastRow();
    if (last >= 2) {
      var fidCol = ms.getRange(2, M.FID, last - 1, 1).getDisplayValues();
      var stampCol = ms.getRange(2, M.CHANGED, last - 1, 1).getValues();
      var any = false;
      fidCol.forEach(function (v, k) { if (touched[v[0]]) { stampCol[k][0] = now; any = true; } });
      if (any) ms.getRange(2, M.CHANGED, last - 1, 1).setValues(stampCol);
    }
  }
  appendLog_(logRows);
}
function appendLog_(rows) {
  if (!rows.length) return;
  var lg = SpreadsheetApp.getActive().getSheetByName(SH.LOG);
  if (!lg) return;
  var last = Math.max(1, lg.getLastRow());
  if (last + rows.length > lg.getMaxRows()) lg.insertRowsAfter(lg.getMaxRows(), rows.length + 200);
  lg.getRange(last + 1, 1, rows.length, 7).setValues(rows);
}
function currentUser_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

// ============================ MENU ACTIONS ============================
function publishSchedule(silent) {
  var ss = SpreadsheetApp.getActive();
  SpreadsheetApp.flush();
  var ms = ss.getSheetByName(SH.MASTER), fs = ss.getSheetByName(SH.FLIGHTS);
  var last = ms.getLastRow();
  var rows = last >= 2 ? ms.getRange(2, 1, last - 1, M.SRC).getDisplayValues() : [];
  var fl = fs.getLastRow() >= 2 ? fs.getRange(2, 1, fs.getLastRow() - 1, F.NOTES).getValues() : [];
  var fnotes = {}, forder = {};
  fl.forEach(function (f) { if (f[F.FID - 1]) { fnotes[f[F.FID - 1]] = f[F.NOTES - 1]; } });
  var levels = levelsFromSettings_(ss), lcolor = {}, lorder = {};
  levels.forEach(function (l, i) { lcolor[l.name] = l.color; lorder[l.name] = i; });
  var groups = {}, keys = [];
  rows.forEach(function (r) {
    if (!r[M.NAME - 1] || r[M.STATUS - 1] === 'Scratched') return;
    var t = r[M.TIME - 1], fid = r[M.FID - 1] || '(unassigned)';
    var tnum = parseTime(t); if (tnum === null) tnum = 9;
    var k = fid + '|' + tnum;
    if (!groups[k]) { groups[k] = { fid: fid, t: tnum, level: r[M.LEVEL - 1], num: +r[M.FLIGHT - 1] || 0, list: [] }; keys.push(k); }
    groups[k].list.push(r);
  });
  keys.sort(function (a, b) {
    var A = groups[a], B = groups[b];
    return (A.t - B.t) || (A.num - B.num) || ((lorder[A.level] || 0) - (lorder[B.level] || 0));
  });
  var sh = getOrCreate_(ss, SH.PUB, true);
  var out = [], fmt = [];
  var event = ss.getSheetByName(SH.SET).getRange('J7').getDisplayValue();
  var stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MMM d, yyyy h:mm a');
  out.push([event.toUpperCase() + ' - COMPETITION SCHEDULE', '', '', '']); fmt.push('title');
  out.push(['Published ' + stamp + ' · subject to change', '', '', '']); fmt.push('sub');
  out.push(['', '', '', '']); fmt.push('');
  keys.forEach(function (k) {
    var g = groups[k];
    g.list.sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });
    out.push([g.t === 9 ? 'TBD' : fmtTime(g.t), g.fid.replace(' · F', ' · Flight '), g.list.length + ' athletes', '']); fmt.push('head:' + g.level);
    g.list.forEach(function (r) { out.push(['', r[0], r[M.AGE - 1] === '' ? '' : 'Age ' + r[M.AGE - 1], r[M.LEVEL - 1]]); fmt.push('row'); });
    if (fnotes[g.fid]) { out.push(['', '▶ ' + fnotes[g.fid], '', '']); fmt.push('note'); }
    out.push(['', '', '', '']); fmt.push('');
  });
  ensureSize_(sh, Math.max(out.length + 5, 50), 4);
  sh.getRange(1, 1, out.length, 4).setValues(out).setNumberFormat('@').setVerticalAlignment('middle');
  sh.getRange(1, 1, 1, 4).merge().setFontSize(18).setFontWeight('bold').setFontColor('#FFFFFF').setBackground(C.navy);
  sh.getRange(2, 1, 1, 4).merge().setFontStyle('italic').setFontColor('#5F6368');
  sh.setRowHeight(1, 40);
  fmt.forEach(function (f, i) {
    var r = i + 1;
    if (f.indexOf('head:') === 0) {
      var lv = f.slice(5);
      sh.getRange(r, 1, 1, 4).setBackground(lcolor[lv] || '#E8EAED').setFontWeight('bold')
        .setBorder(true, null, true, null, null, null, '#5F6368', SpreadsheetApp.BorderStyle.SOLID);
      sh.getRange(r, 1).setFontSize(16);
      sh.getRange(r, 2).setFontSize(13);
      sh.setRowHeight(r, 30);
    } else if (f === 'note') {
      sh.getRange(r, 2, 1, 3).merge().setFontStyle('italic').setFontColor('#E65100').setFontWeight('bold');
    }
  });
  [110, 240, 110, 120].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setHiddenGridlines(true);
  sh.setFrozenRows(2);
  protectSheet_(sh, [], 'Published snapshot - re-publish from the menu');
  sh.setTabColor('#A142F4');
  if (silent !== true) {
    sh.activate();
    ss.toast('Snapshot updated. Share it with File ▸ Share ▸ Publish to web ▸ "Published" tab, or menu ▸ Get printable PDF link.', 'Published', 8);
  }
}

function showPdfLinks() {
  var ss = SpreadsheetApp.getActive(), id = ss.getId();
  var link = function (name, landscape) {
    var sh = ss.getSheetByName(name); if (!sh) return '';
    var url = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=pdf&gid=' + sh.getSheetId() +
      '&size=letter&portrait=' + (!landscape) + '&fitw=true&gridlines=false&sheetnames=false&printtitle=false&pagenum=CENTER&fzr=true' +
      '&top_margin=0.4&bottom_margin=0.4&left_margin=0.4&right_margin=0.4';
    return '<p><a target="_blank" href="' + url + '">' + name + '</a></p>';
  };
  var html = HtmlService.createHtmlOutput('<div style="font-family:Arial;font-size:14px">' +
    '<p>Click to download a print-ready PDF (opens a new tab):</p>' +
    link(SH.PUB, false) + link(SH.COACH, false) + link(SH.SCHED, true) + link(SH.FVIEW, false) +
    '<p style="color:#5F6368;font-size:12px">Tip: run "Publish schedule snapshot" first so the Published tab is current.</p></div>')
    .setWidth(380).setHeight(240);
  SpreadsheetApp.getUi().showModalDialog(html, '🖨️ Printable schedules');
}

function addFlightPrompt() {
  var ss = SpreadsheetApp.getActive(), ui = SpreadsheetApp.getUi();
  var levels = levelsFromSettings_(ss).map(function (l) { return l.name; });
  var r1 = ui.prompt('Add flight', 'Level (one of: ' + levels.join(', ') + ')', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var lvl = r1.getResponseText().trim();
  var match = levels.filter(function (l) { return l.toLowerCase() === lvl.toLowerCase(); })[0];
  if (!match) { ui.alert('"' + lvl + '" is not a level. Add it first with ▸ Add level.'); return; }
  var r2 = ui.prompt('Add flight to ' + match, 'Start time (e.g. 5:15 PM)', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var t = parseTime(r2.getResponseText());
  if (t === null) { ui.alert('Could not read that time. Use a format like 5:15 PM.'); return; }
  var fs = ss.getSheetByName(SH.FLIGHTS), last = Math.max(2, fs.getLastRow());
  var data = fs.getRange(2, 1, last - 1, 2).getValues();
  var maxNum = 0, firstEmpty = -1;
  data.forEach(function (r, i) {
    if (String(r[0]).trim() === match) maxNum = Math.max(maxNum, +r[1] || 0);
    if (firstEmpty < 0 && r[0] === '' && r[1] === '') firstEmpty = i + 2;
  });
  var row = firstEmpty > 0 ? firstEmpty : last + 1;
  fs.getRange(row, F.LEVEL, 1, 2).setValues([[match, maxNum + 1]]);
  fs.getRange(row, F.TIME).setValue(t);
  appendLog_([[new Date(), flightId(match, maxNum + 1), 'Flight added', '', fmtTime(t), '', currentUser_()]]);
  ss.toast(flightId(match, maxNum + 1) + ' added at ' + fmtTime(t) + '. Assign athletes on Master (Level ' + match + ', Flight # ' + (maxNum + 1) + ').', 'Flight added', 6);
}

function addLevelPrompt() {
  var ss = SpreadsheetApp.getActive(), ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Add level', 'New competition level name', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var name = r.getResponseText().trim(); if (!name) return;
  var set = ss.getSheetByName(SH.SET), vals = set.getRange('A5:A24').getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim().toLowerCase() === name.toLowerCase()) { ui.alert('That level already exists.'); return; }
    if (vals[i][0] === '') {
      set.getRange(5 + i, 1, 1, 3).setValues([[name, CFG.LEVEL_COLORS[i % CFG.LEVEL_COLORS.length], i + 1]]);
      rebuildViews();
      ss.toast('Level "' + name + '" added with its own color. Add its flights with ▸ Add flight.', 'Level added', 6);
      return;
    }
  }
  ui.alert('The level list is full (20). Clear an unused level on Settings first.');
}

function sortMaster() {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(SH.MASTER), last = sh.getLastRow();
  if (last < 3) return;
  var n = last - 1, all = sh.getRange(2, 1, n, M.SRC).getValues();
  var tdisp = sh.getRange(2, M.TIME, n, 1).getDisplayValues();
  all.forEach(function (r, i) { r.push(parseTime(tdisp[i][0])); });
  var lorder = {}; levelsFromSettings_(ss).forEach(function (l, i) { lorder[l.name] = i; });
  var tval = function (r) { return r[M.SRC] === null ? 1e9 : r[M.SRC] * 1440; };
  var rows = all.filter(function (r) { return r[0] !== ''; });
  rows.sort(function (a, b) {
    return (tval(a) - tval(b)) || ((+a[2] || 99) - (+b[2] || 99)) ||
      ((lorder[a[1]] === undefined ? 99 : lorder[a[1]]) - (lorder[b[1]] === undefined ? 99 : lorder[b[1]])) ||
      String(a[0]).localeCompare(String(b[0]));
  });
  while (rows.length < n) rows.push(new Array(M.SRC).fill(''));
  // write only input / static columns; formula columns (D, I, J) are left alone
  sh.getRange(2, 1, n, 3).setValues(rows.map(function (r) { return r.slice(0, 3); }));
  sh.getRange(2, 5, n, 4).setValues(rows.map(function (r) { return r.slice(4, 8); }));
  sh.getRange(2, M.CHANGED, n, 2).setValues(rows.map(function (r) { return r.slice(10, 12); }));
  ss.toast('Master sorted by start time ▸ flight ▸ level ▸ name.', 'Sorted', 4);
}

function confirmAllChanged() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.MASTER), last = sh.getLastRow();
  if (last < 2) return;
  var rg = sh.getRange(2, M.STATUS, last - 1, 1), v = rg.getValues(), n = 0;
  v.forEach(function (r) { if (r[0] === 'Changed') { r[0] = 'Confirmed'; n++; } });
  rg.setValues(v);
  appendLog_([[new Date(), '(all)', 'Status', 'Changed', 'Confirmed (' + n + ' athletes)', '', currentUser_()]]);
  SpreadsheetApp.getActive().toast(n + ' athletes set to Confirmed.', 'Done', 4);
}
function clearChangeHighlights() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.MASTER), last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, M.CHANGED, last - 1, 1).clearContent();
  SpreadsheetApp.getActive().toast('Recent-change highlights cleared (Change Log is kept).', 'Done', 4);
}

// Node test hook (ignored by Apps Script)
if (typeof module !== 'undefined') module.exports = { analyzeSource: analyzeSource, parseTime: parseTime, fmtTime: fmtTime };
