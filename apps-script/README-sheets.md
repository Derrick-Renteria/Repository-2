# Ninja Competition Schedule Organizer

A Google Apps Script that turns the **"NInja Tourn Nov 1 26 - Flight List"** spreadsheet into a self-organizing competition management system. It runs inside your existing spreadsheet, reads your real data, and builds every tab with live formulas.

- Code: [`apps-script/Code.gs`](apps-script/Code.gs)

---

## 1. Setup (about 3 minutes)

1. Open the spreadsheet. *(Optional extra safety: **File ▸ Make a copy** first.)*
2. Go to **Extensions ▸ Apps Script**.
3. Delete the sample `function myFunction() {}`. Paste the entire contents of `apps-script/Code.gs`, then click **💾 Save**.
4. In the function dropdown at the top, choose **`setupCompetitionSystem`** and click **▶ Run**.
5. Google asks for permission ("This app isn't verified" ▸ **Advanced ▸ Go to project ▸ Allow**). The script only touches this spreadsheet.
6. Go back to the spreadsheet and reload the page. A **🥷 Competition** menu appears.

Your original tab (`Sheet1`) is **never modified**. A protected copy named **Original Backup** is also created.

> **Why Apps Script?** Formulas, dropdowns and conditional formatting do all of the live reorganizing, so nothing breaks if the script never runs again. The script handles the things formulas can't:
> - the one-time import and cleanup
> - the **Change Log** and **"recently changed" highlighting** (an `onEdit` trigger records old and new values)
> - auto-setting Status to *Changed*
> - the printable **Published** snapshot and PDF links
> - menu shortcuts for adding flights and levels

---

## 2. How to use it on competition day

| I want to… | Do this |
|---|---|
| Move an athlete to another flight | **Master** ▸ change **Flight #** (and **Level** if they change level) |
| Change a whole flight's start time | **Flights** ▸ change **Start Time** once. Every athlete in that flight updates everywhere. |
| Give one athlete a different time | **Master** ▸ type a time in **Time Override** (highlighted orange). Clear it to go back to the flight time. |
| Scratch an athlete | **Master** ▸ Status = **Scratched**. They disappear from Schedule, Coach View and Published. |
| Find an athlete fast | **Athlete Search** ▸ type part of a name |
| See one flight | **Flight View** ▸ pick a flight in the yellow box |
| Add a flight or level | **🥷 Competition ▸ Add flight… / Add level…** |
| Hand out a schedule | **🥷 Competition ▸ Publish schedule snapshot**, then **Get printable PDF link**, or **File ▸ Share ▸ Publish to web** with only the *Published* (or *Coach View*) tab selected |
| Done reviewing changes | **🥷 Competition ▸ Mark all "Changed" as Confirmed** |

**Important: flight numbers restart for each level** (as in your original sheet). "Flight 3" alone is ambiguous: Ninjanators F3 is 9:30 AM, but Ninja 1 F3 is 10:45 AM. So each flight is identified by **Level + Flight #**, shown as a Flight ID such as **`Ninja 1 · F3`**. If you change an athlete's Level, their Flight # now points to that level's flight.

**Colors:**
- **blue headers / white cells** = you edit
- **gray headers / gray cells** = automatic (warning-protected)
- **yellow** = changed recently (default 60 min, set on Settings)
- **orange** = time override
- **red** = problem

---

## 3. Tabs

| Tab | Purpose |
|---|---|
| **Dashboard** | Totals, active/scratched counts, flights, first and last flight, missing assignments, duplicates, missing times, overrides, recent changes, counts by level and by flight. iPad-friendly. |
| **Master** ✏️ | The one place to edit athletes: Name, Level ▾, Flight # ▾, Start Time (auto), Status ▾, Notes, Age, Time Override, Flight ID (auto), Alerts (auto), Last Changed (auto), Orig Row. Has filters. |
| **Flights** ✏️ | One row per flight: Level ▾, Flight # ▾, Flight ID (auto), **Start Time**, Athletes (auto), Ages (auto), Check (auto), Notes. |
| **Schedule** | Auto-sorted by start time ▸ flight ▸ level ▸ athlete, with banded flight groups and large times. |
| **Flight View** | Pick a flight: time, level, count, notes, athletes, exceptions. |
| **Coach View** | Every athlete in time order. Can filter by level. |
| **Athlete Search** | Type-ahead name search. |
| **Published** | Clean, static, print-ready snapshot with no editing controls. Refresh it from the menu. |
| **Change Log** | Every change, with old value → new value, time and user. |
| **Import Report** | Everything found in the original sheet (see below). |
| **Settings** ✏️ | Levels and colors, statuses, flight numbers, max athletes per flight (10), highlight window (60 min), event name. |
| **Original Backup** | Protected copy of the original tab. |

### Safeguards included
- **Strict dropdowns** for Level, Flight # and Status, so invalid flight numbers or levels are rejected. Time cells only accept times.
- An **Alerts** column flags:
  - a missing level or flight
  - a flight that isn't set up on the Flights tab
  - a flight with no start time
  - duplicate athletes (scratched copies are ignored)
  - time overrides
- **Flights → Check** flags missing times, empty flights, over-capacity flights, duplicate flight IDs and shared time slots.
- All formula columns and view tabs are **warning-protected**.
- Formulas live in the **header rows**, so adding, deleting or sorting athlete rows can't break them.
- Every view is a live formula. If an athlete changes flight, they disappear from the old flight immediately.

---

## 4. What the analysis of your sheet found

The sheet has 1 tab with **286 athletes**, **5 levels** (Ninjanators, Ninja 1, Ninja 2, Ninja 3, Ninja Team) and **29 flights** running from 9:00 AM to 5:00 PM in 15-minute slots. There is a 1 hr 15 min lunch break after Ninja 1 F9 (12:15 PM).

Nothing was invented. A flight's start time is the time most of its athletes were listed with. Athletes with any of the issues below were imported with **Status = Pending** and an explanatory **Note**. The other 273 athletes were imported as **Confirmed**; you can change that default in `CFG.DEFAULT_STATUS`.

**Needs your decision**

| Athlete | Issue |
|---|---|
| Charlotte Crowder | Listed twice: Ninja 1 F2 (row 63) **and** Ninja 1 F5 (row 95) |
| Magnus Crowder | Listed twice: Ninja 1 F3 (row 76) **and** Ninja 1 F9 (row 133) |
| Daniel Keene | Listed twice: Ninja 3 F4 (row 249) **and** Ninja 3 F6 (row 261) |
| Will Foss | Listed twice: Ninja 3 F3 (row 239) **and** Ninja 3 F6 (row 266) |
| Achira Jagani | Labeled Ninja 3 **F6**, but listed with the **F5** group and given F5's time (4:15 PM). Kept as F6 with a 4:15 PM override. Likely belongs in F5. |
| Ada Thompson | Labeled Ninja 3 **F3** (3:45 PM) but listed within the F4 group. Kept as F3. |
| Alivia Hunsaker | In Ninja 3 F3 (3:45 PM) but listed at **4:00 PM**. Kept as an override. |
| Carson Lemich L08 | No start time; now uses Ninja 2 F7's 3:00 PM. A stray "3:00 PM" sits on the next row (row 210), which is probably his. |
| Hudson Payne | No start time; now uses Ninja 3 F6's 4:30 PM |

**Other findings**
- **Flights over 10 athletes:** Ninja 3 F3 (11, including Ada Thompson), Ninja Team F1 (11), Ninja Team F2 (11).
- **Inconsistent formatting, cleaned in Master:**
  - 91 level labels had trailing spaces ("Ninja 1 ").
  - 40 flight labels had leading spaces (" flight 3").
  - Times were mixed between "9:00:00 AM" and "9:15 AM" styles.
- **Names left exactly as entered:**
  - Codes inside names: Joie Zhou **Z71**, Tatum McLeod **Z72**, Vikram Padmaray **E14**, Carson Lemich **L08**.
  - Lowercase names: vihas kantareddy, avik joshi, beckham powell, oliver eifler, Lilly larsen.
- **Wide age ranges:** Ninja 1 F8 spans ages 4–12, and Ninja 2 F1 spans ages 5–9.

---

## 5. Notes and limits

- **Re-running full setup** re-imports from the original tab and **replaces Master edits**; it asks you to confirm first. To refresh formulas and formatting only, use **Rebuild views & formatting (keeps your data)**.
- Changes are logged only when they're made **in the spreadsheet** (not through the API or other scripts). Old values are captured for single-cell edits; for pastes over several cells the log shows "(multi-cell edit)".
- The **Published** tab is a snapshot on purpose, so a half-finished edit never reaches coaches. Re-publish after changes. If you want a live link instead, publish the **Coach View** tab.
- In the Change Log, "Edited by" shows an email only where Google allows it (usually users in the same Google Workspace domain).
