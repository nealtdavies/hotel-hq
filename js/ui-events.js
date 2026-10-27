'use strict';

/* ================= Events and Food =================
   Plan, price and advertise events; take reservations; answer client requests for weddings and parties; read the results; build the menu.
   Registers itself into the shared VIEWS, MODALS, actions and forms of ui.js. */

const EV_TABS = [['plan', 'Plan'], ['planned', 'Planned'], ['requests', 'Requests'], ['results', 'Results'], ['menu', 'Menu']];
const eventTypeKeys = () => Object.keys(EVENT_TYPES);
const soldPct = e => Math.min(100, Math.round(eventSold(e) / e.cap * 100));
const daysUntil = day => day - S.day;

/* ---------- Plan ---------- */
function eventTypeCard(key) {
  const d = EVENT_TYPES[key], st = eventTypeStatus(key), isPrivate = d.kind === 'private';
  return `<div class="card stack" style="${st.ok ? '' : 'opacity:.7'}"><div class="row"><h3>${esc(d.name)}</h3><span class="chip right">${esc(d.venue)}</span></div>
    <div class="muted small">${esc(d.blurb)}</div>
    <div class="row small"><span class="chip">${isPrivate ? 'Client books it' : 'You sell tickets'}</span>${d.outdoor ? '<span class="chip warn">Weather risk</span>' : ''}<span class="chip">Needs a ${esc(d.needs.role.toLowerCase())} on the rota</span></div>
    <div class="small">Fair price <b>${money(d.ref)}</b> ${isPrivate ? 'per head' : 'a ticket'} · costs about <b>${money(d.cost)}</b> a head plus <b>${money(d.fixed)}</b> to stage · holds ${d.cap[0]} to ${d.cap[1]}</div>
    <div class="row">${isPrivate ? `<span class="muted small">Requests arrive from clients. See the Requests tab.</span>` : st.ok ? `<button class="btn sm primary" data-act="openPlan" data-key="${key}">Plan this</button>` : `<span class="chip warn">${esc(st.why)}</span>`}</div></div>`;
}
const tabPlan = () => `<div class="grid g3">${eventTypeKeys().map(eventTypeCard).join('')}</div>`;

/* ---------- Planned ---------- */
function eventCard(e) {
  const d = eventDef(e), sold = eventSold(e), n = daysUntil(e.day);
  const venue = `<span class="chip">${esc(d.venue)}</span>`;
  const body = e.private
    ? `<div class="small">${esc(e.client)} · ${e.cap} guests at ${money(e.price)} a head = <b>${money(e.cap * e.price)}</b>. Deposit paid ${money(e.reservations[0].paid)}, balance ${money(e.cap * e.price - e.reservations[0].paid)} on the day.</div>`
    : `<div class="row small"><span><b>${sold}</b> of ${e.cap} places sold</span><span class="chip right">${money(e.price)} a ticket</span></div><div class="bar ${soldPct(e) >= 90 ? 'good' : ''}"><i style="width:${soldPct(e)}%"></i></div>
      <div class="small muted">${esc(EVENT_ADVERTS[e.advert].name)} · about ${expectedDailySales(e).toFixed(1)} tickets a day expected${e.theme ? ' · ' + esc(EVENT_THEMES[e.theme].name) : ''}</div>`;
  const staffOk = eventStaff(d, e.day).length > 0;
  return `<div class="card stack"><div class="row"><h3>${esc(e.name)}</h3>${venue}<span class="chip ${n <= 1 ? 'warn' : ''} right">${n === 1 ? 'Tomorrow' : 'In ' + n + ' days'}</span></div>
    <div class="muted small">${esc(dayLabel(e.day))}</div>${body}${staffOk ? '' : `<div class="alert warn">Nobody who can run this is rostered that day. Check the rota.</div>`}${d.outdoor ? `<div class="small muted">Outdoor: the forecast for the day is ${WEATHER_WORD[forecastOn(e.day).kind].toLowerCase()}. Rain halves the crowd and a storm calls it off.</div>` : ''}
    <div class="row">${e.private ? '' : `<button class="btn sm ghost" data-act="eventRes" data-id="${e.id}">Reservations</button><button class="btn sm ghost" data-act="eventEdit" data-id="${e.id}">Price and advertising</button>`}
      <button class="btn sm ghost right" data-act="cancelEventAsk" data-id="${e.id}">Cancel event</button></div></div>`;
}
function tabPlanned() {
  const list = S.events.slice().sort((a, b) => a.day - b.day || a.id - b.id);
  return list.length ? `<div class="grid g2">${list.map(eventCard).join('')}</div>` : '<div class="card empty">Nothing planned. Start on the Plan tab.</div>';
}

/* ---------- Requests ---------- */
function requestCard(q) {
  const d = EVENT_TYPES[q.type], total = q.guests * q.offer, cost = q.guests * d.cost + d.fixed, ok = eventStaff(d, q.day).length > 0 && !venueBusy(d.venue, q.day), left = q.expires - S.day;
  return `<div class="card stack"><div class="row"><h3>${esc(d.name)}</h3><span class="chip">${esc(d.venue)}</span><span class="chip warn right">${left <= 0 ? 'Last day to answer' : 'Answer within ' + left + ' day' + (left > 1 ? 's' : '')}</span></div>
    <div><b>${esc(q.client)}</b> would like to hold it on <b>${esc(dayLabel(q.day))}</b> for <b>${q.guests}</b> guests.</div>
    <div class="small">Offer: <b>${money(q.offer)}</b> a head = <b>${money(total)}</b>. Deposit now ${money(Math.round(total * PRIVATE_DEPOSIT))}. Costs about ${money(cost)}, so about <b class="${total - cost >= 0 ? 'pos' : 'neg'}">${signed(total - cost)}</b>.</div>
    ${ok ? '' : `<div class="alert warn">${venueBusy(d.venue, q.day) ? `The ${esc(d.venue.toLowerCase())} is already in use that day.` : `Nobody who can run it is rostered that day. Put a ${esc(d.needs.role.toLowerCase())} on the rota first.`}</div>`}
    <div class="row"><button class="btn sm good" data-act="acceptEventReq" data-id="${q.id}">Accept</button><button class="btn sm ghost" data-act="declineEventReq" data-id="${q.id}">Decline</button></div></div>`;
}
const tabRequests = () => S.eventRequests.length ? `<div class="grid g2">${S.eventRequests.map(requestCard).join('')}</div>` : '<div class="card empty">No client requests right now. Parties and weddings are asked for as your hotel\'s reputation grows.</div>';

/* ---------- Results ---------- */
function tabResults() {
  const log = S.eventLog.slice().reverse();
  const done = log.filter(l => !l.cancelled), profit = done.reduce((a, l) => a + l.revenue - l.cost, 0);
  const rows = log.map(l => `<div class="row"><div style="min-width:170px"><b>${esc(l.name)}</b><div class="muted small">${esc(dayLabel(l.day))}</div></div>
    ${l.cancelled ? '<span class="chip bad">Cancelled</span>' : `<span class="stars">${stars(l.stars)}</span><span class="chip">${l.attendees} guests</span>${l.rain ? '<span class="chip warn">Rained off</span>' : ''}<span class="small muted">takings ${money(l.revenue)}, costs ${money(l.cost)}</span><b class="right ${l.revenue - l.cost >= 0 ? 'pos' : 'neg'}">${signed(l.revenue - l.cost)}</b>`}</div>`).join('');
  return `<div class="grid g4" style="margin-bottom:16px"><div class="card kpi"><div class="v">${done.length}</div><div class="l">Events held</div></div><div class="card kpi"><div class="v ${profit >= 0 ? 'pos' : 'neg'}">${signed(profit)}</div><div class="l">Profit from events</div></div>
    <div class="card kpi"><div class="v">${done.length ? (done.reduce((a, l) => a + l.stars, 0) / done.length).toFixed(1) : '-'}</div><div class="l">Average stars</div></div></div>
    ${rows ? `<div class="card list">${rows}</div><p class="muted small">The last 20 events. Takings include tickets sold earlier. Costs do not include advertising.</p>` : '<div class="card empty">No events held yet.</div>'}`;
}

function viewEvents() {
  if (!EV_TABS.some(t => t[0] === ui.eventTab)) ui.eventTab = 'plan';
  const body = { plan: tabPlan, planned: tabPlanned, requests: tabRequests, results: tabResults, menu: () => hasFacility('restaurant') ? menuPanel() : '<div class="card empty">Build the restaurant on the Expansion page to create a menu.</div>' }[ui.eventTab]();
  const count = { planned: S.events.length, requests: S.eventRequests.length };
  return `<div class="pagehead"><div><h2>Events and Food</h2><p>${S.events.length} event${S.events.length === 1 ? '' : 's'} planned${S.eventRequests.length ? `, ${S.eventRequests.length} client request${S.eventRequests.length > 1 ? 's' : ''} waiting` : ''}. Price them fairly and advertise to fill the room.</p></div></div>
    <div class="tabs">${EV_TABS.map(([k, l]) => `<button class="tab ${ui.eventTab === k ? 'active' : ''}" data-act="eventTab" data-tab="${k}">${l}${count[k] ? ` (${count[k]})` : ''}</button>`).join('')}</div>${body}`;
}
VIEWS.events = viewEvents;

/* Events as the Bookings page shows them: who has reserved what. */
function eventReservationsPanel() {
  const list = S.events.filter(e => !e.private).sort((a, b) => a.day - b.day);
  const priv = S.events.filter(e => e.private).sort((a, b) => a.day - b.day);
  const row = e => `<div class="card stack"><div class="row"><h3>${esc(e.name)}</h3><span class="chip right">${esc(dayLabel(e.day))}</span></div>
    <div class="row small"><span><b>${eventSold(e)}</b> of ${e.cap} places</span><span class="chip">${money(e.price)} a ticket</span></div><div class="bar"><i style="width:${soldPct(e)}%"></i></div>
    <div class="small muted">${e.reservations.slice(0, 5).map(r => `${esc(r.name)} (${r.size})`).join(', ') || 'No reservations yet'}${e.reservations.length > 5 ? ` and ${e.reservations.length - 5} more` : ''}</div>
    <div class="row"><button class="btn sm primary" data-act="eventRes" data-id="${e.id}">Reservations</button></div></div>`;
  const contract = e => `<div class="card stack"><div class="row"><h3>${esc(e.name)}</h3><span class="chip right">${esc(dayLabel(e.day))}</span></div><div class="small">${e.cap} guests, ${money(e.cap * e.price)} contract, deposit paid ${money(e.reservations[0].paid)}.</div></div>`;
  return `<div class="row" style="margin-bottom:12px"><span class="muted">Reservations for events you have planned.</span><button class="btn sm ghost right" data-act="nav" data-view="events">Events and Food</button></div>
    ${list.length || priv.length ? `<div class="grid g2">${list.map(row).join('')}${priv.map(contract).join('')}</div>` : '<div class="card empty">No events planned yet. Plan one on the Events and Food page.</div>'}`;
}

/* ---------- Dialogs ---------- */
/* A rough forecast for the planning form, shown live. It uses the same appeal and cost rules as the game. */
function eventForecast(v) {
  const d = EVENT_TYPES[v.type], e = { type: v.type, day: v.day, price: v.price, advert: v.advert, theme: v.theme, cap: v.cap };
  const days = Math.max(1, v.day - S.day), daily = expectedDailySales(e);
  const tickets = Math.min(v.cap, daily * (days - 1)), door = Math.min(v.cap - tickets, daily * 0.8);
  const attendees = Math.round((tickets * (1 - EVENT_NO_SHOW) + door) * 10) / 10;
  const revenue = tickets * v.price + door * v.price + attendees * d.extra;
  const cost = attendees * (d.cost + (v.theme ? EVENT_THEMES[v.theme].cost : 0)) + d.fixed + EVENT_ADVERTS[v.advert].cost;
  return { daily, attendees, revenue, cost, profit: revenue - cost, full: tickets + door >= v.cap * 0.95 };
}
MODALS.planEvent = m => {
  const d = EVENT_TYPES[m.key];
  if (!d || !eventTypeStatus(m.key).ok) return null;
  const days = Array.from({ length: EVENT_ADVANCE_DAYS }, (_, i) => S.day + 1 + i);
  const options = days.map(day => { const busy = venueBusy(d.venue, day), staff = eventStaff(d, day).length > 0, dinner = d.venue === 'Restaurant' && dinnerCovers(day) > 0;
    const why = busy ? 'venue in use' : dinner ? 'dinner tables booked' : !staff ? `no ${d.needs.role.toLowerCase()} rostered` : '';
    const wx = d.outdoor ? ` - ${WEATHER_WORD[forecastOn(day).kind].toLowerCase()} forecast` : '';
    return `<option value="${day}" ${why ? 'disabled' : ''}>${esc(dayLabel(day))}${wx}${why ? ' (' + why + ')' : ''}</option>`; }).join('');
  const first = days.find(day => !venueBusy(d.venue, day) && eventStaff(d, day).length > 0 && !(d.venue === 'Restaurant' && dinnerCovers(day) > 0));
  return { inner: `<form data-form="planEvent" id="evForm"><input type="hidden" name="type" value="${m.key}"><h2>Plan: ${esc(d.name)}</h2><p class="muted small" style="margin:0">${esc(d.blurb)}</p>
    ${m.key === 'theme' ? `<label class="f" for="ev-theme">Theme</label><select id="ev-theme" name="theme">${Object.entries(EVENT_THEMES).map(([k, t]) => `<option value="${k}">${esc(t.name)}</option>`).join('')}</select>` : ''}
    <label class="f" for="ev-day">Date</label><select id="ev-day" name="day">${options}</select>
    <div class="cols2"><div><label class="f" for="ev-price">Ticket price (${money(d.min)} to ${money(d.max)})</label><input type="number" id="ev-price" name="price" min="${d.min}" max="${d.max}" value="${d.ref}"></div>
      <div><label class="f" for="ev-cap">Places (${d.cap[0]} to ${d.cap[1]})</label><input type="number" id="ev-cap" name="cap" min="${d.cap[0]}" max="${d.cap[1]}" value="${d.cap[2]}"></div></div>
    <label class="f" for="ev-adv">Advertising</label><select id="ev-adv" name="advert">${EVENT_ADVERTS.map((a, i) => `<option value="${i}">${esc(a.name)}${a.cost ? ' (' + money(a.cost) + ')' : ''}</option>`).join('')}</select>
    <div id="evPreview" class="log" style="margin-top:16px"></div>
    <div class="actions"><button class="btn ghost" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit" ${first === undefined ? 'disabled' : ''}>Plan event</button></div></form>`, first };
};
function eventPreview() {
  const form = document.getElementById('evForm');
  if (!form || !S) return;
  const f = new FormData(form), type = f.get('type'), d = EVENT_TYPES[type];
  const day = Number(f.get('day')) || S.day + 1, price = Math.round(Number(f.get('price'))), cap = Math.round(Number(f.get('cap'))), advert = Number(f.get('advert')) || 0, theme = f.get('theme') || null;
  const box = document.getElementById('evPreview');
  if (!(price >= d.min && price <= d.max && cap >= d.cap[0] && cap <= d.cap[1])) { box.innerHTML = '<span class="muted">Enter a price and number of places within the limits to see a forecast.</span>'; return; }
  const fc = eventForecast({ type, day, price, cap, advert, theme });
  const ratio = price / d.ref, tips = [];
  if (ratio > 1.25) tips.push('That price is well above the usual rate. Fewer people will book and guests will be less impressed.');
  else if (ratio < 0.7) tips.push('A very low price sells out but barely covers your costs.');
  if (fc.full) tips.push('This forecast fills the room. You could charge a little more or add places.');
  if (advert && cap <= d.cap[0] + 5) tips.push('Advertising rarely pays for a small event.');
  if (d.outdoor) tips.push(`The forecast for that day is ${WEATHER_WORD[forecastOn(day).kind].toLowerCase()}. Rain halves the crowd and a storm calls a public event off. Forecasts can be wrong, more so further ahead.`);
  box.innerHTML = `<b>Forecast (an estimate)</b><p style="margin:4px 0">About <b>${fc.daily.toFixed(1)}</b> tickets a day, so around <b>${Math.round(fc.attendees)}</b> guests on the night.</p>
    <p style="margin:4px 0">Takings ${money(fc.revenue)}, costs ${money(fc.cost)} including advertising, expected profit <b class="${fc.profit >= 0 ? 'pos' : 'neg'}">${signed(fc.profit)}</b>.</p>${tips.map(t => `<p class="muted" style="margin:3px 0">${esc(t)}</p>`).join('')}`;
}
AFTER_RENDER.push(eventPreview);
document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#evForm')) eventPreview(); });
document.addEventListener('change', e => { if (e.target.closest && e.target.closest('#evForm')) eventPreview(); });

MODALS.eventRes = m => {
  const e = S.events.find(x => x.id === m.id);
  if (!e || e.private) return null;
  const left = e.cap - eventSold(e);
  const list = e.reservations.map(r => `<div class="row" style="padding:8px 0"><span><b>${esc(r.name)}</b>${r.guestId ? ' <span class="chip info">Staying guest</span>' : ''}</span><span class="chip">${r.size} ${r.size > 1 ? 'people' : 'person'}</span><span class="small muted">${money(r.paid)}</span><button class="btn sm ghost right" data-act="cancelEventRes" data-event="${e.id}" data-res="${r.id}">Cancel</button></div>`).join('');
  return { inner: `<h2>${esc(e.name)}</h2><p class="muted small" style="margin:0">${esc(dayLabel(e.day))} · ${eventSold(e)} of ${e.cap} places sold at ${money(e.price)}. Cancelling a reservation refunds the ticket.</p>
    <div class="list" style="margin-top:8px;max-height:260px;overflow:auto">${list || '<div class="muted" style="padding:10px 0">No reservations yet.</div>'}</div>
    <form data-form="addEventRes" style="margin-top:8px"><input type="hidden" name="id" value="${e.id}"><div class="cols2"><div><label class="f" for="er-name">Name</label><input type="text" id="er-name" name="name" maxlength="30" required ${left ? '' : 'disabled'}></div>
      <div><label class="f" for="er-size">People (1 to 6)</label><input type="number" id="er-size" name="size" min="1" max="6" value="2" ${left ? '' : 'disabled'}></div></div>
      <div class="actions"><button class="btn ghost" type="button" data-act="closeModal">Close</button><button class="btn primary" type="submit" ${left ? '' : 'disabled'}>${left ? 'Add reservation' : 'Event is full'}</button></div></form>` };
};
MODALS.eventEdit = m => {
  const e = S.events.find(x => x.id === m.id);
  if (!e || e.private) return null;
  const d = eventDef(e);
  return { inner: `<form data-form="editEvent"><input type="hidden" name="id" value="${e.id}"><h2>${esc(e.name)}</h2><p class="muted small" style="margin:0">A new price applies to tickets sold from now on. Advertising can only be stepped up, and you pay the difference.</p>
    <label class="f" for="ee-price">Ticket price (${money(d.min)} to ${money(d.max)})</label><input type="number" id="ee-price" name="price" min="${d.min}" max="${d.max}" value="${e.price}">
    <label class="f" for="ee-adv">Advertising</label><select id="ee-adv" name="advert">${EVENT_ADVERTS.map((a, i) => `<option value="${i}" ${i === e.advert ? 'selected' : ''} ${i < e.advert ? 'disabled' : ''}>${esc(a.name)}${i > e.advert ? ' (+' + money(a.cost - EVENT_ADVERTS[e.advert].cost) + ')' : ''}</option>`).join('')}</select>
    <div class="actions"><button class="btn ghost" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>` };
};

actions.eventTab = d => { ui.eventTab = d.tab; render(); };
actions.openPlan = d => openModal({ type: 'planEvent', key: d.key });
actions.eventRes = d => openModal({ type: 'eventRes', id: Number(d.id) });
actions.eventEdit = d => openModal({ type: 'eventEdit', id: Number(d.id) });
actions.cancelEventAsk = d => {
  const e = S.events.find(x => x.id === Number(d.id));
  if (e) confirmModal(`Cancel ${e.name}?`, e.private ? 'The client gets their deposit back and will leave you a bad review.' : `Tickets sold so far are refunded${e.advert ? ' and the advertising money is lost' : ''}.`, 'cancelEventDo', 'Cancel event', { id: e.id }, true);
};
actions.cancelEventDo = d => { const r = cancelEvent(Number(d.id)); ui.modal = null; toast(r.ok ? `Event cancelled.${r.refund ? ' ' + money(r.refund) + ' refunded.' : ''}` : r.error, r.ok ? '' : 'bad'); commit(); };
actions.acceptEventReq = d => { const r = acceptEventRequest(Number(d.id)); if (!r.ok) return toast(r.error, 'bad'); toast(`${r.event.name} is booked. Deposit ${money(r.deposit)} taken.`, 'good'); commit(); };
actions.declineEventReq = d => { declineEventRequest(Number(d.id)); toast('Request declined.'); commit(); };
actions.cancelEventRes = d => { cancelEventReservation(Number(d.event), Number(d.res)); commit(); };

forms.planEvent = f => {
  const r = planEvent({ type: f.get('type'), day: f.get('day'), price: f.get('price'), cap: f.get('cap'), advert: f.get('advert'), theme: f.get('theme') || undefined });
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.event.name} planned for ${dayLabel(r.event.day)}.`, 'good');
  ui.modal = null; ui.eventTab = 'planned'; commit();
};
forms.addEventRes = f => {
  const r = addEventReservation(Number(f.get('id')), { name: f.get('name'), size: f.get('size') });
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.reservation.name} booked${r.reservation.paid ? ', ' + money(r.reservation.paid) + ' taken' : ''}.`, 'good');
  commit();
};
forms.editEvent = f => {
  const id = Number(f.get('id')), e = S.events.find(x => x.id === id);
  if (!e) return;
  const p = setEventPrice(id, f.get('price'));
  if (!p.ok) return toast(p.error, 'bad');
  if (Number(f.get('advert')) > e.advert) { const a = setEventAdvert(id, f.get('advert')); if (!a.ok) return toast(a.error, 'bad'); }
  toast('Event updated.', 'good');
  ui.modal = null; commit();
};
