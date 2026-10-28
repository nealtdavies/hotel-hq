'use strict';

/* ================= Management online and offline: the header button, the banner, what is locked, and "While you were away" ================= */

/* Things that happen with guests and the day's events need Management online. Everything else (menus, prices, the rota, staff, rooms,
   notes, replies, the diary, settings) can be changed while the hotel is paused. */
const LIVE_ACTIONS = new Set(['assign', 'assignAll', 'declineRequest', 'acceptEnquiry', 'declineEnquiry', 'acceptAll', 'customiseEnquiry', 'checkInRoom', 'addGuest',
  'arriveCheckIn', 'arriveAll', 'resolve', 'chooseOption', 'service', 'getQuotes', 'hireFirm', 'advanceTime', 'mailAssign', 'mailAssignAll', 'mailBest', 'mailDiscount',
  'callOpen', 'msgOpen', 'phoneDecline', 'acceptEventReq', 'declineEventReq', 'kidsEnrol', 'crisisAct', 'crisisPlay', 'prepAct']);
const LIVE_FORMS = new Set(['booking', 'dinner', 'call', 'message', 'addEventRes', 'crisisNotice']);

function offlineBlocked() {
  if (!S || isOnline()) return false;
  toast('Management is offline. Press Management Online to open the hotel first.', 'bad');
  return true;
}

const realDateLabel = iso => { const n = dateNum(iso); return n === null ? 'earlier' : new Date(n * 86400000).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); };

function mgmtButton() {
  return isOnline()
    ? `<button class="btn big mgmt on" data-act="endDayAsk" aria-label="Management is online. Press to go offline and end the day"><span class="dot" aria-hidden="true"></span>Management Offline</button>`
    : `<button class="btn primary big mgmt off" data-act="goOnline" aria-label="Management is offline. Press to go online and open the hotel"><span class="dot" aria-hidden="true"></span>Management Online</button>`;
}

function mgmtBanner() {
  if (isOnline()) return '';
  const days = daysBetween(S.mgmt.since, localDate(0));
  return `<div class="alert info mgmt-banner" role="status"><div><b>Management is offline.</b> The hotel is paused, so nothing happens and you can change menus, prices, the rota and your team in peace.
    Press <b>Management Online</b> when you are ready to open day ${S.day + 1}; overnight, bookings, calls and requests will have come in.
    ${days >= 2 ? `<br><b>Careful:</b> it has been ${days} days since you went offline, so the hotel will have run by itself for ${Math.min(MGMT.maxAway, days - 1)} of them.` : ''}</div>
    <button class="btn primary" data-act="goOnline">Management Online</button></div>`;
}

/* The player taps Management Online. */
actions.goOnline = () => {
  const r = goOnline(localDate(0));
  if (!r.ok) return;
  ui.autoInc = true;
  sfx('bell');
  writeSave();
  if (r.bankrupt) { ui.modal = { type: 'gameover' }; render(); return; }
  if (r.away.length) { ui.modal = { type: 'away', away: r.away, nights: r.nights }; render(); return; }
  openNextIncident();
};

MODALS.away = m => {
  const rows = m.away.map(a => `<div class="card" style="box-shadow:none;background:var(--surface2)"><div class="row"><b>${esc(a.day)}</b><span class="chip ${a.profit >= 0 ? 'good' : 'bad'} right">${signed(a.profit)}</span></div>
    <div class="small muted">Income ${money(a.income)}, costs ${money(a.expenses)}.${a.headline ? ` ${esc(a.headline)}` : ''}</div>
    ${a.events.length ? `<ul class="small" style="margin:6px 0 0">${a.events.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}</div>`).join('');
  return { inner: `<h2>While you were away</h2><p class="muted small">You were away for ${m.nights} ${m.nights === 1 ? 'day' : 'days'}, so the hotel ran by itself for ${m.away.length === 1 ? 'one day' : m.away.length + ' days'}. Nobody dealt with guests or problems, but the bills were paid and guests came and went. (It never runs by itself for more than ${MGMT.maxAway} days.)</p>
    <div class="stack">${rows}</div><div class="actions"><button class="btn primary big" data-act="closeModal">Open day ${S.day + 1}</button></div>` };
};

/* Shows what happened while the real clock moved on. */
function showAway(r) {
  ui.pendingAway = null;
  ui.modal = r.bankrupt ? { type: 'gameover' } : { type: 'away', away: r.away, nights: r.nights };
  render();
}
/* The real clock has moved on while the hotel was left online. Waits if a pop-up is open, and is called again a little later. */
function mgmtClockCheck() {
  if (!S || !isOnline() || ui.modal) return false;
  const r = catchUp(localDate(0));
  if (!r) return false;
  writeSave();
  sfx('tick');
  showAway(r);
  return true;
}
setInterval(mgmtClockCheck, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) mgmtClockCheck(); });
