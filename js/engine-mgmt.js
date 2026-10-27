'use strict';
/* ================= Management online and offline (no DOM access) =================
   Offline, the hotel is paused: nothing happens, so menus, prices, the rota and the team can be changed in peace. Going online opens the
   next day, and "overnight" a day's worth of bookings, calls, requests and incidents has arrived. When the real calendar has moved on by
   more than a night while Management was offline, the hotel ran by itself for each extra real day (up to MGMT.maxAway): nobody dealt with
   anything, so problems were ignored, guests checked out and the bills were paid. The player sees what happened in "While you were away".
   S.mgmt is { online, since } with `since` the real date (YYYY-MM-DD) of the last change. S.morningPending is true from the end of a day
   until the next morning has been generated. Dates are passed in so this file never reads the clock. */

const MGMT = { maxAway: 3 };

const dateNum = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null; };
/* Whole real days from date a to date b (never negative). Unreadable dates count as no gap. */
const daysBetween = (a, b) => { const x = dateNum(a), y = dateNum(b); return x === null || y === null ? 0 : Math.max(0, Math.round(y - x)); };

/* New games for tests and older saves start online, so nothing changes for them. The setup screen takes a new hotel offline. */
function startMgmt(d, online, date) {
  d.mgmt = { online: online !== false, since: date || null };
  d.morningPending = false;
}
const isOnline = () => !S.mgmt || S.mgmt.online !== false;

/* Generates the morning of a day that has ended: the overnight bookings, calls, requests and incidents. */
function openMorning() {
  if (!S.morningPending) return false;
  S.morningPending = false;
  generateDay();
  return true;
}

/* A one-line account of a day, for the "While you were away" screen. */
const awayLine = r => ({ day: r.dayLabel, income: r.income, expenses: r.expenses, profit: r.income - r.expenses, headline: r.headline || '', events: r.events.slice(0, 4).map(e => e.text) });

/* The day has ended: Management goes offline. Call after runEndDay({ defer: true }). */
function goOffline(today) {
  S.mgmt = { online: false, since: today || null };
}
/* Management comes back online. Returns { ok, away: [one line for each unattended day], bankrupt }. */
function goOnline(today) {
  if (isOnline()) return { ok: false, error: 'Management is already online.', away: [], bankrupt: false };
  const gap = daysBetween(S.mgmt.since, today), extra = Math.min(MGMT.maxAway, Math.max(0, gap - 1));
  const away = [];
  let bankrupt = false;
  for (let i = 0; i < extra && !bankrupt; i++) {
    openMorning();
    away.push(awayLine(runEndDay({ defer: true })));
    bankrupt = S.money <= BANKRUPT_AT;
  }
  openMorning();
  S.mgmt = { online: true, since: today || null };
  return { ok: true, away, bankrupt: bankrupt || S.money <= BANKRUPT_AT, nights: gap };
}

/* Management was left online past midnight: the real day has moved on, so the hotel ran by itself for each night that passed (up to MGMT.maxAway).
   Returns null when no night has passed, otherwise { away, bankrupt, nights } like goOnline. Stays online. */
function catchUp(today) {
  if (!isOnline()) return null;
  if (!S.mgmt.since) { S.mgmt.since = today || null; return null; }   // an older save that has never been timed
  const gap = daysBetween(S.mgmt.since, today);
  if (gap < 1) return null;
  const away = [];
  let bankrupt = false;
  for (let i = 0; i < Math.min(MGMT.maxAway, gap) && !bankrupt; i++) {
    away.push(awayLine(runEndDay({ defer: true })));
    openMorning();
    bankrupt = S.money <= BANKRUPT_AT;
  }
  S.mgmt = { online: true, since: today || null };
  return { away, bankrupt, nights: gap };
}
