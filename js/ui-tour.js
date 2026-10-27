'use strict';

/* ================= Guided first day =================
   A friendly tour that points at what to do next. Each step finishes by itself when the player does the thing (it reads the same
   first-steps flags as the Dashboard checklist), so nobody has to press Next for those. It can be skipped at any time.
   S.tour is { step, done }. Registers into AFTER_RENDER so it is redrawn after every screen change. */

const tourEl = view => [...document.querySelectorAll(`.nav[data-view="${view}"]`)].find(e => e.offsetParent !== null) || null;
const navTarget = view => tourEl(view) || [...document.querySelectorAll('.nav.more-btn')].find(e => e.offsetParent !== null) || null;
const visible = sel => [...document.querySelectorAll(sel)].find(e => e.offsetParent !== null) || null;
const onMore = view => !tourEl(view);          // on phones the other pages sit behind the More button

/* kind 'next': press Next. Otherwise it ends when done() is true. target() gives the element to point at. */
const TOUR = [
  { id: 'welcome', kind: 'next', title: 'Welcome to your hotel!', text: 'I will show you around. It takes about two minutes, and you can skip it whenever you like.', target: () => null },
  { id: 'top', kind: 'next', title: 'Your control bar', text: 'This shows your cash and your guest rating. The button on the right opens and closes your hotel.', target: () => visible('.top .hname') },
  { id: 'online', title: 'Open the hotel', text: 'Your hotel is paused, so nothing is happening yet. Press Management Online to start your first day.', done: () => isOnline(), target: () => visible('.btn.mgmt') },
  { id: 'inbox', title: 'Read your messages', text: () => `Your team sends messages here. ${ui.view === 'inbox' ? 'Tap a message to read it.' : 'Open the Inbox.'}`, done: () => S.firsts.read, target: () => ui.view === 'inbox' ? visible('.maillist') : navTarget('inbox') },
  { id: 'booking', title: 'Take a booking', text: () => `People want to stay with you. ${ui.view === 'guests' ? 'Tap Accept on a booking.' : onMore('guests') ? 'Tap More, then Guests.' : 'Open Guests.'}`, done: () => S.firsts.booked, target: () => ui.view === 'guests' ? visible('[data-act="acceptEnquiry"]') : navTarget('guests') },
  { id: 'clean', title: 'Get a room cleaned', text: () => `A dirty room cannot be sold. ${ui.view === 'tasks' ? 'Choose a cleaner for a cleaning job.' : onMore('tasks') ? 'Tap More, then Tasks.' : 'Open Tasks.'}`, done: () => S.firsts.cleaned, target: () => ui.view === 'tasks' ? visible('.pick[data-act="assign"]') : navTarget('tasks') },
  { id: 'team', title: 'Meet your team', text: () => `Everyone works shifts. ${ui.view === 'staff' ? '' : 'Open Team to see who is on duty.'}`, done: () => S.firsts.team, target: () => navTarget('staff') },
  { id: 'end', title: 'Close the day', text: 'All set. Press Management Offline to end the day and find out how much you earned. Then you can change things in peace before you open the next day.', done: () => S.firsts.endDay, target: () => visible('[data-act="endDayAsk"]') },
  { id: 'bye', kind: 'next', last: true, title: 'You did it!', text: 'That is your first day. Keep an eye on the tip on your Dashboard, collect awards, and grow your hotel. You can find the checklist on the Dashboard any time.', target: () => null }
];

function tourStep() { return TOUR[Math.min(S.tour.step, TOUR.length - 1)]; }
function tourSkip() { S.tour.done = true; writeSave(); tourUpdate(); }
function tourNext() {
  S.tour.step++;
  if (S.tour.step >= TOUR.length) S.tour.done = true;
  writeSave(); tourUpdate();
}

/* Moves past steps the player has already completed. */
function tourAdvance() {
  let moved = false;
  while (!S.tour.done) {
    const st = tourStep();
    if (st.kind !== 'next' && st.done && st.done()) { S.tour.step++; moved = true; if (S.tour.step >= TOUR.length) S.tour.done = true; }
    else break;
  }
  if (moved) writeSave();
}

function tourUpdate() {
  let box = document.getElementById('tour');
  if (!box) { box = document.createElement('div'); box.id = 'tour'; document.body.appendChild(box); }
  if (!S || !S.tour || S.tour.done || (ui.modal && ui.modal.type !== 'more')) { box.innerHTML = ''; return; }
  tourAdvance();
  if (S.tour.done) { box.innerHTML = ''; return; }
  const st = tourStep(), el = st.target ? st.target() : null, text = typeof st.text === 'function' ? st.text() : st.text;
  const r = el ? el.getBoundingClientRect() : null, pad = 6;
  const ring = r ? `<div class="tour-ring" style="left:${Math.round(r.left - pad)}px;top:${Math.round(r.top - pad)}px;width:${Math.round(r.width + pad * 2)}px;height:${Math.round(r.height + pad * 2)}px"></div>` : '';
  const total = TOUR.length - 2, n = Math.min(Math.max(S.tour.step - 1, 1), total);
  box.innerHTML = `${ring}<div class="tour-card ${r ? '' : 'center'}" role="dialog" aria-live="polite" aria-label="Guided tour"><div class="small muted">${st.kind === 'next' && (S.tour.step === 0 || st.last) ? 'Guided tour' : `Step ${n} of ${total}`}</div>
    <b class="tour-title">${esc(st.title)}</b><p>${esc(text)}</p>
    <div class="row">${st.kind === 'next' ? `<button class="btn sm primary" data-act="tourNext">${st.last ? 'Finish' : 'Next'}</button>` : ''}${st.last ? '' : '<button class="btn sm ghost" data-act="tourSkip">Skip tour</button>'}</div></div>`;
  const card = box.querySelector('.tour-card');
  if (r && card) {
    const h = card.offsetHeight, below = r.bottom + 14 + h < innerHeight - 8, wide = innerWidth >= 700;
    card.style.top = Math.max(8, below ? r.bottom + 14 : r.top - 14 - h) + 'px';
    card.style.left = wide ? Math.min(Math.max(8, r.left), innerWidth - card.offsetWidth - 8) + 'px' : '12px';
  }
}
AFTER_RENDER.push(tourUpdate);
window.addEventListener('resize', () => { if (S) tourUpdate(); });
window.addEventListener('scroll', () => { if (S && S.tour && !S.tour.done) tourUpdate(); }, { passive: true });
actions.tourNext = tourNext;
actions.tourSkip = tourSkip;
