'use strict';

/* ================= Bookings page, booking form and cancellation =================
   Registers itself into the shared VIEWS, MODALS, actions and forms of ui.js. */

const roomStateChip = room => !room ? '<span class="chip bad">Room gone</span>'
  : room.guestId ? '<span class="chip warn">Room still occupied</span>'
  : room.damaged ? '<span class="chip bad">Room damaged</span>'
  : room.dirty ? '<span class="chip warn">Room needs cleaning</span>'
  : '<span class="chip good">Room ready</span>';

function bookingSummary(b) {
  const room = roomById(b.roomId);
  const party = `${b.adults} adult${b.adults > 1 ? 's' : ''}${b.children ? `, ${b.children} child${b.children > 1 ? 'ren' : ''}` : ''}`;
  const extras = b.extras.map(k => EXTRAS[k].name).join(', ');
  return { room, line: `${esc(party)} · ${b.nights} night${b.nights > 1 ? 's' : ''} · ${esc(b.type)}${room ? ' · ' + esc(room.name) : ''} · ${money(b.price)} a night` +
    `${b.mealPlan !== 'room' ? ' · ' + esc(MEAL_PLANS[b.mealPlan].name.split(' (')[0]) : ''}${b.deposit ? ' · deposit ' + money(b.deposit) : ''}`, extras };
}

const BK_TABS = [['rooms', 'Reservations'], ['dinner', 'Dinner'], ['events', 'Events'], ['blocks', 'Room blocks'], ['calendar', 'Calendar']];
const BK_FILTERS = [['all', 'All', () => true], ['today', 'Arriving today', b => b.arriveDay <= S.day], ['week', 'Next 7 days', b => b.arriveDay > S.day && b.arriveDay <= S.day + 7], ['later', 'Later', b => b.arriveDay > S.day + 7]];
const selectDays = (selected, count, first) => Array.from({ length: count + 1 }, (_, i) => `<option value="${(first ?? S.day) + i}" ${(first ?? S.day) + i === selected ? 'selected' : ''}>${esc(dayLabel((first ?? S.day) + i))}</option>`).join('');

function bookingRow(b, due) {
  const s = bookingSummary(b), reqs = (b.requests || []);
  const end = b.arriveDay + b.nights;
  return `<div class="card stack"><div class="row"><b>${esc(b.name)}</b>${due ? roomStateChip(s.room) : ''}<span class="chip ${due ? 'warn' : ''}">${esc(dayLabel(b.arriveDay))}</span>
      <span class="muted small right">${money(bookingTotal(b))} total</span></div>
    ${partyNote(b.party)}<div class="muted small">${s.line}</div><div class="small muted">Leaves ${esc(DAYS[end % 7])} (day ${end + 1})</div>
    ${s.extras ? `<div class="small">Extras: ${esc(s.extras)}</div>` : ''}${reqs.length ? `<div class="row">${reqs.map(q => `<span class="chip info">${esc(q.text)}</span>`).join('')}</div>` : ''}${bookingWishChips(b)}${b.notes ? `<div class="small muted">Note: ${esc(b.notes)}</div>` : ''}
    <div class="row">${due ? `<button class="btn sm good" data-act="arriveCheckIn" data-id="${b.id}">Check in</button>` : ''}<button class="btn sm ghost" data-act="editBooking" data-id="${b.id}">Edit</button>
      <button class="btn sm ghost" data-act="moveBooking" data-id="${b.id}">Move room</button><button class="btn sm ghost" data-act="bookingRequests" data-id="${b.id}">Requests${reqs.length ? ' (' + reqs.length + ')' : ''}</button>
      <button class="btn sm ghost right" data-act="cancelBookingAsk" data-id="${b.id}">Cancel</button></div></div>`;
}

function tabReservations() {
  const flt = BK_FILTERS.find(f => f[0] === ui.bkFilter) || BK_FILTERS[0];
  const all = S.bookings.slice().sort((a, b) => a.arriveDay - b.arriveDay || a.id - b.id);
  const list = all.filter(flt[2]);
  const chips = `<div class="tabs">${BK_FILTERS.map(f => `<button class="tab ${flt[0] === f[0] ? 'active' : ''}" data-act="bkFilter" data-f="${f[0]}">${f[1]} (${all.filter(f[2]).length})</button>`).join('')}</div>`;
  return `${chips}${list.length ? `<div class="grid g2">${list.map(b => bookingRow(b, b.arriveDay <= S.day)).join('')}</div>` : '<div class="card empty">No reservations here. Take one with New booking, or accept a request on the Guests page.</div>'}`;
}

/* ---------- Dinner ---------- */
function tabDinner() {
  if (!hasFacility('restaurant')) return '<div class="card empty">Build the restaurant on the Expansion page to take dinner reservations.</div>';
  const maxDay = S.day + DINNER_ADVANCE_DAYS;
  const dayOptions = Array.from({ length: DINNER_ADVANCE_DAYS + 1 }, (_, i) => { const d = S.day + i, open = restaurantOpen(d), left = dinnerSeats(d) - dinnerCovers(d);
    return `<option value="${d}" ${open && left > 0 ? '' : 'disabled'}>${esc(dayLabel(d))}${open ? ` (${Math.max(0, left)} seats left)` : ' (closed)'}</option>`; }).join('');
  const times = Array.from({ length: 13 }, (_, i) => 1080 + i * 15).map(t => `<option value="${t}" ${t === 1170 ? 'selected' : ''}>${clockText(t)}</option>`).join('');
  const days = [...new Set(S.dinners.map(d => d.day))].sort((a, b) => a - b);
  const list = days.map(day => `<div class="card"><div class="row"><h3>${esc(dayLabel(day))}</h3><span class="chip right">${dinnerCovers(day)} of ${dinnerSeats(day)} seats</span></div>
    <div class="bar" style="margin:8px 0 4px"><i style="width:${Math.min(100, Math.round(dinnerCovers(day) / dinnerSeats(day) * 100))}%"></i></div>
    <div class="list">${S.dinners.filter(d => d.day === day).sort((a, b) => a.time - b.time).map(d => `<div class="row"><b>${clockText(d.time)}</b><span>${esc(d.name)}</span><span class="chip">${d.covers} ${d.covers > 1 ? 'people' : 'person'}</span>${d.notes ? `<span class="muted small">${esc(d.notes)}</span>` : ''}<button class="btn sm ghost right" data-act="cancelDinner" data-id="${d.id}">Cancel</button></div>`).join('')}</div></div>`).join('');
  return `<div class="card"><form data-form="dinner"><h3>Book a table</h3>
      <div class="cols2"><div><label class="f" for="dn-name">Name for the table</label><input type="text" id="dn-name" name="name" maxlength="30" required></div>
        <div><label class="f" for="dn-n">People (1 to ${MAX_DINNER_COVERS})</label><input type="number" id="dn-n" name="covers" min="1" max="${MAX_DINNER_COVERS}" value="2"></div></div>
      <div class="cols2"><div><label class="f" for="dn-day">Evening</label><select id="dn-day" name="day">${dayOptions}</select></div>
        <div><label class="f" for="dn-t">Time</label><select id="dn-t" name="time">${times}</select></div></div>
      <label class="f" for="dn-notes">Notes</label><input type="text" id="dn-notes" name="notes" maxlength="80" placeholder="Window table, allergies...">
      <div class="actions"><button class="btn primary" type="submit">Book table</button></div></form>
      <p class="muted small" style="margin:10px 0 0">Reserved tables are served first each evening; about one party in ten does not turn up. Each chef on shift seats ${SEATS_PER_CHEF} people. Bookings run up to ${DINNER_ADVANCE_DAYS} days ahead (day ${maxDay + 1}).</p></div>
    <div class="section-title"><h3>Reserved tables</h3><span class="chip">${S.dinners.length}</span></div>
    ${list ? `<div class="grid g2">${list}</div>` : '<div class="card empty">No dinner reservations yet.</div>'}`;
}

/* ---------- Events (the Events and Food panel fills this in) ---------- */
function tabEvents() {
  return typeof eventReservationsPanel === 'function' ? eventReservationsPanel() : '<div class="card empty">No events planned yet.</div>';
}

/* ---------- Room blocks ---------- */
function blockGroups() {
  const groups = new Map();
  S.blocks.slice().sort((a, b) => a.from - b.from || a.id - b.id).forEach(k => { const key = `${k.from}|${k.to}|${k.reason}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(k); });
  return [...groups.values()];
}
function tabBlocks() {
  const types = [...new Set(S.rooms.map(r => r.type))];
  const scope = types.map(t => `<option value="type:${esc(t)}">All ${esc(t)} rooms (${S.rooms.filter(r => r.type === t).length})</option>`).join('') + S.rooms.map(r => `<option value="room:${r.id}">${esc(r.name)} (${esc(r.type)})</option>`).join('');
  const rows = blockGroups().map(g => { const k = g[0], names = g.slice(0, 4).map(x => roomById(x.roomId).name).join(', ') + (g.length > 4 ? ` and ${g.length - 4} more` : '');
    return `<div class="row"><div><b>${esc(k.reason)}</b><div class="muted small">${esc(names)}</div></div><span class="chip">${esc(dayLabel(k.from))} to ${esc(DAYS[(k.to - 1) % 7])} (day ${k.to})</span><span class="chip">${g.length} room${g.length > 1 ? 's' : ''}</span>
      <button class="btn sm ghost right" data-act="unblockGroup" data-ids="${g.map(x => x.id).join(',')}">Allow bookings again</button></div>`; }).join('');
  return `<div class="card"><form data-form="block"><h3>Take rooms off sale</h3>
      <p class="muted small" style="margin:4px 0 0">Blocked rooms cannot be booked or sold to enquiries. You cannot block dates that already have a guest or reservation.</p>
      <label class="f" for="bl-scope">Rooms</label><select id="bl-scope" name="scope">${scope}</select>
      <div class="cols2"><div><label class="f" for="bl-from">From</label><select id="bl-from" name="from">${selectDays(S.day + 1, MAX_ADVANCE_DAYS)}</select></div>
        <div><label class="f" for="bl-n">Nights (1 to 60)</label><input type="number" id="bl-n" name="nights" min="1" max="60" value="3"></div></div>
      <label class="f" for="bl-r">Reason</label><select id="bl-r" name="reason">${BLOCK_REASONS.map(r => `<option>${esc(r)}</option>`).join('')}</select>
      <div class="actions"><button class="btn primary" type="submit">Block from sale</button></div></form></div>
    <div class="section-title"><h3>Blocked now and coming up</h3><span class="chip">${S.blocks.length}</span></div>
    ${rows ? `<div class="card list">${rows}</div>` : '<div class="card empty">Every room is on sale.</div>'}`;
}

/* ---------- Calendar ---------- */
const CAL_DAYS = 14;
function tabCalendar() {
  const types = [...new Set(S.rooms.map(r => r.type))];
  if (ui.calType && !types.includes(ui.calType)) ui.calType = null;
  const rooms = S.rooms.filter(r => !ui.calType || r.type === ui.calType);
  const days = Array.from({ length: CAL_DAYS }, (_, i) => S.day + i);
  const head = days.map((d, i) => `<th class="${i === 0 ? 'today' : ''}">${DAYS[d % 7]}<br><small>${d + 1}</small></th>`).join('');
  const rows = rooms.map(r => `<tr><td class="l sticky"><b>${esc(r.name)}</b><div class="muted small">${esc(r.type)}</div></td>${days.map(d => { const c = roomDayState(r, d); return `<td><span class="cal ${c.state}" title="${esc(c.label)}">${c.state === 'free' ? '' : esc(c.label.split(' ')[0].slice(0, 6))}</span></td>`; }).join('')}</tr>`).join('');
  const chips = `<div class="tabs"><button class="tab ${!ui.calType ? 'active' : ''}" data-act="calType" data-t="">All rooms</button>${types.map(t => `<button class="tab ${ui.calType === t ? 'active' : ''}" data-act="calType" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
  const grid = availabilityGrid(CAL_DAYS).map(r => `<tr><td class="l"><b>${esc(r.type)}</b><div class="muted small">${r.total} rooms</div></td>${r.cells.map((n, i) => { const cls = n === 0 ? 'bad' : n <= Math.max(1, Math.round(r.total * 0.2)) ? 'warn' : 'good'; return `<td class="${i === 0 ? 'today' : ''}"><span class="chip ${cls}">${n}</span></td>`; }).join('')}</tr>`).join('');
  return `<div class="section-title" style="margin-top:0"><h3>Free rooms, next ${CAL_DAYS} days</h3><span class="muted small">Green is plenty, amber is nearly full, red is full.</span></div>
    <div class="card scroll-x"><table class="avail"><thead><tr><th class="l">Room type</th>${head}</tr></thead><tbody>${grid}</tbody></table></div>
    <div class="section-title"><h3>Every room</h3></div>${chips}
    <div class="legend" style="margin:0 0 12px"><span><span class="cal guest"></span> Guest</span><span><span class="cal booked"></span> Booked</span><span><span class="cal blocked"></span> Blocked</span><span><span class="cal damaged"></span> Damaged</span><span><span class="cal free"></span> Free</span></div>
    <div class="card scroll-x"><table class="avail calendar"><thead><tr><th class="l sticky">Room</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function viewBookings() {
  if (!BK_TABS.some(t => t[0] === ui.bookingTab)) ui.bookingTab = 'rooms';
  const due = arrivalsDue();
  const body = { rooms: tabReservations, dinner: tabDinner, events: tabEvents, blocks: tabBlocks, calendar: tabCalendar }[ui.bookingTab]();
  return `<div class="pagehead"><div><h2>Bookings</h2><p>${S.bookings.length} reservation${S.bookings.length === 1 ? '' : 's'}${due.length ? `, ${due.length} arriving today` : ''}. Guests staying now are on the Guests page.</p></div><span class="spacer"></span>
      ${due.length > 1 ? '<button class="btn good" data-act="arriveAll">Check in all arrivals</button>' : ''}<button class="btn primary" data-act="addGuest">New booking</button></div>
    <div class="tabs">${BK_TABS.map(([k, l]) => `<button class="tab ${ui.bookingTab === k ? 'active' : ''}" data-act="bookingTab" data-tab="${k}">${l}</button>`).join('')}</div>${body}`;
}
VIEWS.bookings = viewBookings;

/* ---------- Booking form ---------- */
MODALS.booking = m => {
  const types = [...new Set(S.rooms.map(r => r.type))];
  const pre = m.prefill || {};
  const type = types.includes(pre.type) ? pre.type : types[0];
  const arrive = pre.arriveDay ?? S.day;
  const dayOptions = Array.from({ length: MAX_ADVANCE_DAYS + 1 }, (_, i) => `<option value="${S.day + i}" ${S.day + i === arrive ? 'selected' : ''}>${esc(dayLabel(S.day + i))}</option>`).join('');
  const extras = availableExtras().map(k => { const x = EXTRAS[k]; return `<label class="row small" style="gap:6px"><input type="checkbox" name="extras" value="${k}"> ${esc(x.name)} <span class="muted">${x.price ? money(x.price) + (x.perNight ? ' a night' : '') : 'free'}</span></label>`; }).join('');
  return { wide: false, inner: `<form data-form="booking" id="bkForm"><h2>New booking</h2>
    <label class="f" for="bk-name">Guest name</label><div class="row" style="flex-wrap:nowrap"><input type="text" id="bk-name" name="name" maxlength="30" value="${esc(pre.name || '')}" placeholder="Write a name, or let the game suggest one" required data-autofocus style="flex:1;min-width:0"><button type="button" class="btn sm ghost" data-act="diceName" data-target="bk-name">Suggest a name</button></div>
    <div class="cols2"><div><label class="f" for="bk-ad">Adults (1 to 6)</label><input type="number" id="bk-ad" name="adults" min="1" max="6" value="${pre.adults || 2}"></div>
      <div><label class="f" for="bk-ch">Children (0 to 4)</label><input type="number" id="bk-ch" name="children" min="0" max="4" value="${pre.children || 0}"></div></div>
    <div class="cols2"><div><label class="f" for="bk-rel">Party type</label><select id="bk-rel" name="rel"><option value="auto">Decide for me</option>${Object.keys(REL_LABELS).map(k => `<option value="${k}" ${k === pre.rel ? 'selected' : ''}>${esc(REL_LABELS[k])}</option>`).join('')}</select></div>
      <div><label class="f" for="bk-others">Other guests' names (optional)</label><div class="row" style="flex-wrap:nowrap"><input type="text" id="bk-others" name="others" maxlength="150" value="${esc(pre.others || '')}" placeholder="Separate with commas" style="flex:1;min-width:0"><button type="button" class="btn sm ghost" data-act="diceOthers">Suggest</button></div></div></div>
    <div class="cols2"><div><label class="f" for="bk-day">Arrival</label><select id="bk-day" name="arriveDay">${dayOptions}</select></div>
      <div><label class="f" for="bk-n">Nights (1 to 14)</label><input type="number" id="bk-n" name="nights" min="1" max="14" value="${pre.nights || 2}"></div></div>
    <div class="cols2"><div><label class="f" for="bk-type">Room type</label><select id="bk-type" name="type">${types.map(t => `<option value="${esc(t)}" ${t === type ? 'selected' : ''}>${esc(t)} (sleeps ${ROOM_TYPES[t].cap})</option>`).join('')}</select></div>
      <div><label class="f" for="bk-room">Room</label><select id="bk-room" name="roomId" data-want="${pre.roomId || ''}"></select></div></div>
    <div class="cols2"><div><label class="f" for="bk-price">Rate per night (${CURRENCY}30 to ${CURRENCY}1,000)</label><input type="number" id="bk-price" name="price" min="30" max="1000" step="1" value="${ROOM_TYPES[type].price}"></div>
      <div><label class="f" for="bk-meal">Meals</label><select id="bk-meal" name="mealPlan">${availableMealPlans().map(k => `<option value="${k}">${esc(MEAL_PLANS[k].name)}${MEAL_PLANS[k].adult ? ` (${money(MEAL_PLANS[k].adult)} per adult a night)` : ''}</option>`).join('')}</select></div></div>
    <label class="f">Extras</label><div class="stack" style="gap:4px">${extras}</div>
    <div class="cols2"><div><label class="f" for="bk-dep">Deposit</label><select id="bk-dep" name="depositPct">${DEPOSITS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
      <div><label class="f" for="bk-notes">Notes</label><input type="text" id="bk-notes" name="notes" maxlength="120" placeholder="Anniversary, quiet room..."></div></div>
    <div id="bkPreview" class="log" style="margin-top:16px"></div>
    <div class="actions"><button class="btn ghost" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Create booking</button></div></form>` };
};

const formValues = f => ({ name: f.get('name'), adults: f.get('adults'), children: f.get('children'), rel: f.get('rel'), others: f.get('others'), arriveDay: f.get('arriveDay'),
  nights: f.get('nights'), type: f.get('type'), roomId: f.get('roomId'), price: f.get('price'), mealPlan: f.get('mealPlan'), extras: f.getAll('extras'),
  depositPct: f.get('depositPct'), notes: f.get('notes') });
function bookingFormValues(form) {
  const f = new FormData(form);
  return formValues(f);
}
/* Refreshes the room list and the price and availability summary as the form changes (no re-render, so typing is not interrupted). */
function bookingPreview() {
  const form = document.getElementById('bkForm');
  if (!form || !S) return;
  const v = bookingFormValues(form);
  const from = Number(v.arriveDay), nights = Math.round(Number(v.nights)) || 1;
  const free = freeRoomsFor(v.type, from, nights);
  const sel = form.elements.roomId, want = sel.value || sel.dataset.want || '';
  sel.innerHTML = `<option value="">Any available (${free.length} free)</option>` + free.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
  if (want && free.some(r => String(r.id) === String(want))) sel.value = String(want);
  sel.dataset.want = '';
  const adults = Math.round(Number(v.adults)) || 0, children = Math.round(Number(v.children)) || 0, price = Math.round(Number(v.price)) || 0;
  const perNight = price + (MEAL_PLANS[v.mealPlan] ? mealPerNight(v.mealPlan, adults, children) : 0);
  const total = nights * perNight, depositPct = Number(v.depositPct) || 0;
  const extrasPaid = v.extras.reduce((a, k) => a + (EXTRAS[k] ? (EXTRAS[k].perNight ? EXTRAS[k].price * nights : EXTRAS[k].price) : 0), 0);
  const cap = capacityOf(v.type, v.extras);
  const warns = [];
  if (!free.length) warns.push(`No ${v.type} room is free for those dates.`);
  else if (from === S.day) warns.push('A booking for today uses a clean, empty room and checks in straight away.');
  if (adults + children > cap) warns.push(`${v.type} rooms sleep ${ROOM_TYPES[v.type].cap}. Add an extra bed or pick a bigger room.`);
  const def = ROOM_TYPES[v.type].price;
  if (price > def * 1.25) warns.push('That rate is above the usual price, so the guest will start less happy.');
  if (price < def * 0.85 && price >= 30) warns.push('A discounted rate makes the guest happier.');
  document.getElementById('bkPreview').innerHTML = `<b>${nights} night${nights > 1 ? 's' : ''} from ${esc(dayLabel(from))}</b>
    <p>Room and meals: ${money(perNight)} a night, <b>${money(total)}</b> in total.${extrasPaid ? ` Extras worth ${money(extrasPaid)} are charged when staff complete them.` : ''}
    ${depositPct ? ` Deposit due now: <b>${money(Math.round(total * depositPct))}</b>.` : ''}</p>${warns.map(w => `<p class="${/sleep|No /.test(w) ? 'neg' : 'muted'}" style="margin:3px 0">${esc(w)}</p>`).join('')}`;
}
AFTER_RENDER.push(bookingPreview);
document.addEventListener('input', e => {
  const form = e.target.closest && e.target.closest('#bkForm');
  if (!form) return;
  if (e.target.name === 'price') e.target.dataset.touched = '1';
  bookingPreview();
});
document.addEventListener('change', e => {
  const form = e.target.closest && e.target.closest('#bkForm');
  if (!form) return;
  if (e.target.name === 'type' && !form.elements.price.dataset.touched) form.elements.price.value = ROOM_TYPES[e.target.value].price;
  if (e.target.name === 'type') form.elements.roomId.dataset.want = '';
  bookingPreview();
});

forms.booking = f => {
  const r = createBooking(formValues(f));
  if (!r.ok) return toast(r.error, 'bad');
  if (r.guest) toast(`${r.guest.name} checked in to ${r.room.name}.`, 'good');
  else if (r.noShow) toast(`${r.name} did not arrive.`, 'bad');
  else if (r.error) toast(`Booked, but ${r.error}`, 'bad');
  else toast(`${r.booking.name} is booked for ${dayLabel(r.booking.arriveDay)}${r.booking.deposit ? `. Deposit ${money(r.booking.deposit)} taken.` : '.'}`, 'good');
  ui.modal = null; commit();
};

/* ---------- Check in and cancel ---------- */
actions.customiseEnquiry = d => {
  const e = S.enquiries.find(x => x.id === Number(d.id));
  if (!e) return;
  S.enquiries = S.enquiries.filter(x => x !== e);
  const p = e.party;
  openModal({ type: 'booking', prefill: { name: e.name, nights: e.nights, type: e.type, arriveDay: e.arriveDay ?? S.day, adults: e.adults, children: e.children,
    rel: p ? p.rel : 'auto', others: p ? p.members.slice(1).map(m => m.n).join(', ') : '' } });
};
actions.arriveCheckIn = d => {
  const r = checkInBooking(Number(d.id));
  if (r.guest) { sfx('bell'); toast(`${r.guest.name} checked in to ${r.room.name}${r.moved ? ' (moved from the reserved room)' : ''}.${wishToast(r)}`, r.moved || (r.wishes && r.wishes.missed.length) ? '' : 'good'); }
  else if (r.noShow) toast(`${r.name} did not turn up.${r.kept ? ` You keep the ${money(r.kept)} deposit.` : ''}`, 'bad');
  else toast(r.error, 'bad');
  commit();
};
actions.arriveAll = () => {
  const r = checkInAllArrivals();
  toast(`${r.ok} checked in${r.noShow ? `, ${r.noShow} no-show${r.noShow > 1 ? 's' : ''}` : ''}${r.stuck ? `, ${r.stuck} without a room ready` : ''}.`, r.stuck ? 'bad' : 'good');
  commit();
};
actions.cancelBookingAsk = d => {
  const b = S.bookings.find(x => x.id === Number(d.id));
  if (b) openModal({ type: 'cancelBk', id: b.id });
};
MODALS.cancelBk = m => {
  const b = S.bookings.find(x => x.id === m.id);
  if (!b) return null;
  return { inner: `<h2>Cancel ${esc(b.name)}'s booking?</h2><p>${esc(dayLabel(b.arriveDay))}, ${b.nights} night${b.nights > 1 ? 's' : ''}, ${esc(b.type)} room.${b.deposit ? ` They paid a ${money(b.deposit)} deposit.` : ''}</p>
    <div class="actions"><button class="btn ghost" data-act="closeModal">Keep the booking</button>
      ${b.deposit ? `<button class="btn danger" data-act="cancelBookingDo" data-id="${b.id}" data-refund="">Cancel and keep deposit</button><button class="btn primary" data-act="cancelBookingDo" data-id="${b.id}" data-refund="1">Cancel and refund deposit</button>`
        : `<button class="btn danger" data-act="cancelBookingDo" data-id="${b.id}" data-refund="">Cancel booking</button>`}</div>` };
};
actions.cancelBookingDo = d => {
  cancelBooking(Number(d.id), !!d.refund);
  ui.modal = null;
  toast(d.refund ? 'Booking cancelled and deposit refunded.' : 'Booking cancelled.');
  commit();
};

/* ---------- Managing a booking: edit, move room, requests ---------- */
MODALS.editBooking = m => {
  const b = S.bookings.find(x => x.id === m.id);
  if (!b) return null;
  const extras = availableExtras().map(k => { const x = EXTRAS[k]; return `<label class="row small" style="gap:6px"><input type="checkbox" name="extras" value="${k}" ${b.extras.includes(k) ? 'checked' : ''}> ${esc(x.name)} <span class="muted">${x.price ? money(x.price) + (x.perNight ? ' a night' : '') : 'free'}</span></label>`; }).join('');
  return { inner: `<form data-form="editBooking"><input type="hidden" name="id" value="${b.id}"><h2>Edit booking</h2><p class="muted small" style="margin:0">${esc(b.type)} room, ${esc((roomById(b.roomId) || {}).name || '')}. To change the room or its type use Move room.</p>
    <label class="f" for="eb-name">Guest name</label><input type="text" id="eb-name" name="name" maxlength="30" value="${esc(b.name)}" required>
    <div class="cols2"><div><label class="f" for="eb-ad">Adults (1 to 6)</label><input type="number" id="eb-ad" name="adults" min="1" max="6" value="${b.adults}"></div>
      <div><label class="f" for="eb-ch">Children (0 to 4)</label><input type="number" id="eb-ch" name="children" min="0" max="4" value="${b.children}"></div></div>
    <div class="cols2"><div><label class="f" for="eb-day">Arrival</label><select id="eb-day" name="arriveDay">${selectDays(b.arriveDay, MAX_ADVANCE_DAYS)}</select></div>
      <div><label class="f" for="eb-n">Nights (1 to 14)</label><input type="number" id="eb-n" name="nights" min="1" max="14" value="${b.nights}"></div></div>
    <div class="cols2"><div><label class="f" for="eb-price">Rate per night</label><input type="number" id="eb-price" name="price" min="30" max="1000" value="${b.price}"></div>
      <div><label class="f" for="eb-meal">Meals</label><select id="eb-meal" name="mealPlan">${availableMealPlans().map(k => `<option value="${k}" ${k === b.mealPlan ? 'selected' : ''}>${esc(MEAL_PLANS[k].name)}</option>`).join('')}</select></div></div>
    <label class="f">Extras</label><div class="stack" style="gap:4px">${extras}</div>
    <label class="f" for="eb-notes">Notes</label><input type="text" id="eb-notes" name="notes" maxlength="120" value="${esc(b.notes)}">
    <div class="actions"><button class="btn ghost" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Save changes</button></div></form>` };
};

const MOVE_SHOW = 5;
MODALS.moveBooking = m => {
  const b = S.bookings.find(x => x.id === m.id);
  if (!b) return null;
  const opts = roomOptions(b.id), cur = roomById(b.roomId);
  const reRate = t => clamp(Math.round(b.price * ROOM_TYPES[t].price / ROOM_TYPES[b.type].price), 30, 1000);
  const btn = (o, mode, label, cls) => `<button class="btn sm ${cls || 'ghost'}" data-act="doMove" data-id="${b.id}" data-room="${o.room.id}" data-mode="${mode}">${label}</button>`;
  const row = o => `<div class="row" style="padding:8px 0"><div style="width:84px;flex:none">${roomPhoto(o.room)}</div><div style="min-width:120px"><b>${esc(o.room.name)}</b><div class="muted small">${esc(o.room.type)}, usually ${money(o.room.price)} a night</div></div>
    <div class="row right">${o.kind === 'same' ? btn(o, '', 'Move here', 'primary')
      : o.kind === 'upgrade' ? btn(o, 'courtesy', 'Free upgrade', 'primary') + btn(o, 'charge', `Charge ${money(reRate(o.room.type))}`)
      : btn(o, 'reduce', `Reduce to ${money(reRate(o.room.type))}`, 'primary') + btn(o, 'keep', 'Keep rate')}</div></div>`;
  const section = (kind, title, note) => { const list = opts.filter(o => o.kind === kind); if (!list.length) return '';
    const byType = [...new Set(list.map(o => o.room.type))].map(t => { const l = list.filter(o => o.room.type === t); return l.slice(0, MOVE_SHOW).map(row).join('') + (l.length > MOVE_SHOW ? `<div class="muted small" style="padding:6px 0">and ${l.length - MOVE_SHOW} more ${esc(t)} rooms are free</div>` : ''); }).join('');
    return `<div class="section-title" style="margin:18px 0 4px"><h3>${title}</h3></div><p class="muted small" style="margin:0 0 4px">${note}</p><div class="list">${byType}</div>`; };
  return { wide: false, inner: `<h2>Move ${esc(b.name)}</h2><p class="muted small" style="margin:0">Now in ${esc(cur ? cur.name : 'no room')} (${esc(b.type)}), ${esc(dayLabel(b.arriveDay))} for ${b.nights} night${b.nights > 1 ? 's' : ''}, ${b.adults + b.children} guest${b.adults + b.children > 1 ? 's' : ''}.</p>
    ${section('same', 'Same room type', 'Swap rooms at no cost. Guests do not mind.')}
    ${section('upgrade', 'Upgrade', 'A free upgrade delights the guest. Charging the new rate is fair, and the guest is neutral about it.')}
    ${section('downgrade', 'Downgrade', 'Reducing the rate softens the blow. Keeping the rate for a lesser room makes the guest angry.')}
    ${opts.length ? '' : '<div class="alert warn" style="margin-top:14px">No other room is free for these dates and this party.</div>'}
    <div class="actions"><button class="btn ghost" data-act="closeModal">Close</button></div>` };
};

MODALS.bookingRequests = m => {
  const b = S.bookings.find(x => x.id === m.id);
  if (!b) return null;
  const list = (b.requests || []).map(q => `<div class="row" style="padding:8px 0"><span>${esc(q.text)}</span><button class="btn sm ghost right" data-act="removeRequest" data-id="${b.id}" data-req="${q.id}">Remove</button></div>`).join('');
  return { inner: `<h2>Requests for ${esc(b.name)}</h2><p class="muted small" style="margin:0">Noted requests become guest requests on arrival. Your team handles them from the Tasks page, and guests are happier when they are met. Up to ${MAX_REQUESTS}.</p>
    <div class="list" style="margin-top:8px">${list || '<div class="muted" style="padding:10px 0">No requests yet.</div>'}</div>
    <form data-form="addRequest" style="margin-top:8px"><input type="hidden" name="id" value="${b.id}"><label class="f" for="rq-text">New request</label>
      <input type="text" id="rq-text" name="text" maxlength="60" placeholder="Birthday cake, quiet room, late check-in..." data-autofocus ${(b.requests || []).length >= MAX_REQUESTS ? 'disabled' : ''}>
      <div class="actions"><button class="btn ghost" type="button" data-act="closeModal">Close</button><button class="btn primary" type="submit" ${(b.requests || []).length >= MAX_REQUESTS ? 'disabled' : ''}>Add request</button></div></form>` };
};

actions.bookingTab = d => { ui.bookingTab = d.tab; render(); };
actions.bkFilter = d => { ui.bkFilter = d.f; render(); };
actions.calType = d => { ui.calType = d.t || null; render(); };
actions.editBooking = d => openModal({ type: 'editBooking', id: Number(d.id) });
actions.moveBooking = d => openModal({ type: 'moveBooking', id: Number(d.id) });
actions.bookingRequests = d => openModal({ type: 'bookingRequests', id: Number(d.id) });
actions.doMove = d => {
  const r = changeRoom(Number(d.id), Number(d.room), d.mode);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.booking.name} moved to ${r.room.name}${r.kind === 'same' ? '' : r.kind === 'upgrade' ? ' (upgrade)' : ' (downgrade)'}.`, r.kind === 'downgrade' ? '' : 'good');
  ui.modal = null; commit();
};
actions.removeRequest = d => { removeBookingRequest(Number(d.id), Number(d.req)); commit(); };
actions.cancelDinner = d => { cancelDinner(Number(d.id)); toast('Table cancelled.'); commit(); };
actions.unblockGroup = d => { const n = String(d.ids).split(',').map(Number).filter(unblock).length; toast(`${n} room${n === 1 ? '' : 's'} back on sale.`, 'good'); commit(); };

forms.editBooking = f => {
  const r = modifyBooking(Number(f.get('id')), { name: f.get('name'), adults: f.get('adults'), children: f.get('children'), arriveDay: f.get('arriveDay'), nights: f.get('nights'),
    price: f.get('price'), mealPlan: f.get('mealPlan'), extras: f.getAll('extras'), notes: f.get('notes') });
  if (!r.ok) return toast(r.error, 'bad');
  if (r.guest) toast(`${r.guest.name} checked in to ${r.room.name}.`, 'good');
  else if (r.error) toast(`Saved, but ${r.error}`, 'bad');
  else toast(`Booking updated.${r.refund ? ` ${money(r.refund)} of the deposit was refunded.` : ''}`, 'good');
  ui.modal = null; commit();
};
forms.addRequest = f => {
  const r = addBookingRequest(Number(f.get('id')), f.get('text'));
  if (!r.ok) return toast(r.error, 'bad');
  commit();
};
forms.dinner = f => {
  const r = bookDinner({ name: f.get('name'), covers: f.get('covers'), day: f.get('day'), time: f.get('time'), notes: f.get('notes') });
  if (!r.ok) return toast(r.error, 'bad');
  toast(`Table for ${r.dinner.covers} booked for ${clockText(r.dinner.time)}.`, 'good');
  commit();
};
forms.block = f => {
  const scope = String(f.get('scope')), [kind, val] = scope.split(':');
  const ids = kind === 'type' ? S.rooms.filter(r => r.type === val).map(r => r.id) : [Number(val)];
  const r = blockRooms(ids, f.get('from'), f.get('nights'), f.get('reason'));
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.blocks.length} room${r.blocks.length > 1 ? 's' : ''} taken off sale.`, 'good');
  commit();
};
