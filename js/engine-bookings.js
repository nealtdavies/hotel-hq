'use strict';

/* ================= Managing bookings (no DOM access) =================
   Loaded after engine-extra.js. Changing a booking, special requests, moving a booking to another room (with upgrades and downgrades),
   blocking rooms from sale, and dinner reservations. */

const MAX_REQUESTS = 3, MAX_DINNER_COVERS = 12, DINNER_ADVANCE_DAYS = 30, DINNER_NO_SHOW = 0.1, SEATS_PER_CHEF = 30;
const BLOCK_REASONS = ['Maintenance', 'Renovation', 'Owner use', 'Private hold'];
const typeRank = type => ROOM_TYPES[type].price;

/* ---------- Changing a booking ---------- */
/* d may hold any of: name, adults, children, arriveDay, nights, price, mealPlan, extras, notes. Anything left out stays as it is. */
function modifyBooking(id, d) {
  const b = S.bookings.find(x => x.id === id);
  if (!b) return { ok: false, error: 'That booking no longer exists.' };
  const name = d.name === undefined ? b.name : String(d.name).trim().slice(0, 30);
  if (!name) return { ok: false, error: 'Please type the guest name.' };
  const c = cleanStay({ adults: pickDefined(d.adults, b.adults), children: pickDefined(d.children, b.children), arriveDay: pickDefined(d.arriveDay, b.arriveDay),
    nights: pickDefined(d.nights, b.nights), price: pickDefined(d.price, b.price), mealPlan: pickDefined(d.mealPlan, b.mealPlan), extras: pickDefined(d.extras, b.extras), type: b.type });
  if (c.error) return { ok: false, error: c.error };
  const v = c.v;
  let room = roomById(b.roomId);
  const free = freeRoomsFor(b.type, v.arriveDay, v.nights, b.id);
  if (!room || !free.includes(room)) room = free[0];
  if (!room) return { ok: false, error: `No ${b.type} room is free for those dates.` };
  const total = v.nights * (v.price + mealPerNight(v.plan, v.adults, v.children));
  if (b.arriveDay < S.day) return { ok: false, error: 'That stay has already started.' };
  // commit
  if (name !== b.name) { b.name = name; const t = parseTypedName(name); Object.assign(b.party.members[0], { n: t.name, first: t.first, last: t.last }); }
  if (v.adults !== b.adults || v.children !== b.children) b.party = resizeParty(b.party, v.adults, v.children);
  Object.assign(b, { adults: v.adults, children: v.children, arriveDay: v.arriveDay, nights: v.nights, price: v.price, mealPlan: v.plan, extras: v.extras, roomId: room.id });
  if (d.notes !== undefined) b.notes = String(d.notes).slice(0, 120);
  let refund = 0;
  if (b.deposit > total) { refund = b.deposit - total; b.deposit = total; spend(refund, `Deposit part-refunded: ${b.name}`); }
  delete b.noShowRolled;
  if (b.arriveDay === S.day) { const r = checkInBooking(b.id); return Object.assign({ ok: true, booking: b, refund }, r); }
  return { ok: true, booking: b, refund };
}
const pickDefined = (v, fallback) => v === undefined ? fallback : v;

/* ---------- Special requests ---------- */
function addBookingRequest(id, text) {
  const b = S.bookings.find(x => x.id === id);
  if (!b) return { ok: false, error: 'That booking no longer exists.' };
  text = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!text) return { ok: false, error: 'Please type the request.' };
  if ((b.requests || []).length >= MAX_REQUESTS) return { ok: false, error: `A booking can hold ${MAX_REQUESTS} requests.` };
  if (b.requests.some(q => q.text.toLowerCase() === text.toLowerCase())) return { ok: false, error: 'That request is already noted.' };
  const q = { id: nid(), text, done: false, wish: wishFromText(text) };
  b.requests.push(q);
  return { ok: true, request: q };
}
function removeBookingRequest(id, requestId) {
  const b = S.bookings.find(x => x.id === id);
  if (!b) return false;
  const n = b.requests.length;
  b.requests = b.requests.filter(q => q.id !== requestId);
  return b.requests.length < n;
}

/* ---------- Moving and allocating rooms, upgrades and downgrades ---------- */
/* Every room the booking could move to for its dates, with what kind of move it would be. */
function roomOptions(id) {
  const b = S.bookings.find(x => x.id === id);
  if (!b) return [];
  const out = [];
  for (const r of S.rooms) {
    if (r.id === b.roomId) continue;
    if (!freeRoomsFor(r.type, b.arriveDay, b.nights, b.id).includes(r)) continue;
    if (b.adults + b.children > capacityOf(r.type, b.extras)) continue;
    const kind = r.type === b.type ? 'same' : typeRank(r.type) > typeRank(b.type) ? 'upgrade' : 'downgrade';
    out.push({ room: r, kind });
  }
  return out.sort((a, b2) => typeRank(a.room.type) - typeRank(b2.room.type) || a.room.id - b2.room.id);
}
const UPGRADE_MODES = { courtesy: 'Free upgrade', charge: 'Charge the new rate' }, DOWNGRADE_MODES = { reduce: 'Reduce the rate', keep: 'Keep the rate' };
/* mode matters only when the type changes. Upgrades: courtesy (keep the rate, guest delighted) or charge (rate rises with the room).
   Downgrades: reduce (rate falls with the room, guest a little upset) or keep (same rate, guest annoyed). */
function changeRoom(id, roomId, mode) {
  const b = S.bookings.find(x => x.id === id);
  if (!b) return { ok: false, error: 'That booking no longer exists.' };
  const opt = roomOptions(id).find(o => o.room.id === Number(roomId));
  if (!opt) return { ok: false, error: 'That room is not available for these dates and this party.' };
  const room = opt.room;
  if (opt.kind === 'upgrade' && !UPGRADE_MODES[mode]) return { ok: false, error: 'Choose a free upgrade or charge the new rate.' };
  if (opt.kind === 'downgrade' && !DOWNGRADE_MODES[mode]) return { ok: false, error: 'Choose to reduce the rate or keep it.' };
  const reRate = () => clamp(Math.round(b.price * ROOM_TYPES[room.type].price / ROOM_TYPES[b.type].price), 30, 1000);
  let bonus = 0;
  if (opt.kind === 'upgrade') { if (mode === 'courtesy') bonus = 12; else b.price = reRate(); }
  if (opt.kind === 'downgrade') { if (mode === 'keep') bonus = -15; else { b.price = reRate(); bonus = -4; } }
  b.moodBonus = clamp((b.moodBonus || 0) + bonus, -30, 30);
  b.type = room.type; b.roomId = room.id;
  return { ok: true, booking: b, room, kind: opt.kind };
}

/* ---------- Blocking rooms from sale ---------- */
function roomBlocked(room, day) { return S.blocks.some(k => k.roomId === room.id && k.from <= day && k.to > day); }
/* roomIds: the rooms to take off sale for `nights` nights from day `from`. All are blocked or none. */
function blockRooms(roomIds, from, nights, reason) {
  const rooms = [...new Set(roomIds || [])].map(id => roomById(Number(id)));
  if (!rooms.length || rooms.some(r => !r)) return { ok: false, error: 'Choose at least one room.' };
  from = Math.round(Number(from)); nights = Math.round(Number(nights));
  if (!(from >= S.day && from <= S.day + MAX_ADVANCE_DAYS)) return { ok: false, error: `Start within the next ${MAX_ADVANCE_DAYS} days.` };
  if (!(nights >= 1 && nights <= 60)) return { ok: false, error: 'A block lasts 1 to 60 nights.' };
  reason = String(reason || '').trim().slice(0, 40) || BLOCK_REASONS[0];
  const clash = rooms.filter(r => roomBusy(r, from, from + nights));
  if (clash.length) return { ok: false, error: `${clash.slice(0, 3).map(r => r.name).join(', ')}${clash.length > 3 ? ` and ${clash.length - 3} more` : ''} ${clash.length > 1 ? 'have' : 'has'} a stay, booking or block in that period.` };
  const made = rooms.map(r => ({ id: nid(), roomId: r.id, from, to: from + nights, reason }));
  S.blocks.push(...made);
  return { ok: true, blocks: made };
}
function unblock(id) { const n = S.blocks.length; S.blocks = S.blocks.filter(k => k.id !== id); return S.blocks.length < n; }

/* ---------- Dinner reservations ---------- */
/* Seats in the restaurant on a day: 30 for each chef working, and always at least one chef's worth. */
function dinnerSeats(day) {
  const chefs = S.staff.filter(s => s.role === 'Chef' && worksOn(s, day) && (day !== S.day || s.sickDays === 0)).length;
  return Math.max(1, chefs) * SEATS_PER_CHEF;
}
const dinnerCovers = day => S.dinners.filter(d => d.day === day).reduce((a, d) => a + d.covers, 0);
function bookDinner(d) {
  if (!hasFacility('restaurant')) return { ok: false, error: 'You have no restaurant yet.' };
  const name = String(d.name || '').trim().slice(0, 30);
  if (!name) return { ok: false, error: 'Please type the name for the table.' };
  const day = Math.round(Number(d.day)), covers = Math.round(Number(d.covers)), time = Math.round(Number(d.time));
  if (!(day >= S.day && day <= S.day + DINNER_ADVANCE_DAYS)) return { ok: false, error: `Dinner must be within the next ${DINNER_ADVANCE_DAYS} days.` };
  if (!(covers >= 1 && covers <= MAX_DINNER_COVERS)) return { ok: false, error: `A table is for 1 to ${MAX_DINNER_COVERS} people.` };
  if (!(time >= 1080 && time <= 1260 && time % 15 === 0)) return { ok: false, error: 'Dinner is served from 18:00 to 21:00.' };
  if (!restaurantOpen(day)) return { ok: false, error: 'The restaurant is not open that day.' };
  if (!menuAvailable('Main').length) return { ok: false, error: 'The menu has no main courses switched on.' };
  if (restaurantEventOn(day)) return { ok: false, error: 'The restaurant is hosting an event that evening.' };
  const left = dinnerSeats(day) - dinnerCovers(day);
  if (covers > left) return { ok: false, error: `Only ${Math.max(0, left)} seat${left === 1 ? '' : 's'} left that evening.` };
  const r = { id: nid(), name, day, covers, time, notes: String(d.notes || '').trim().slice(0, 80) };
  S.dinners.push(r);
  return { ok: true, dinner: r };
}
function cancelDinner(id) { const n = S.dinners.length; S.dinners = S.dinners.filter(d => d.id !== id); return S.dinners.length < n; }

/* ---------- Calendar ---------- */
/* How one room looks on one day: guest, booked, blocked, damaged or free (with a label for the tooltip). */
function roomDayState(room, day) {
  const g = room.guestId ? guestById(room.guestId) : null;
  if (g && day >= S.day && day < S.day + g.left) return { state: 'guest', label: g.name };
  const b = S.bookings.find(x => x.roomId === room.id && x.arriveDay <= day && day < x.arriveDay + x.nights);
  if (b) return { state: 'booked', label: b.name };
  const k = S.blocks.find(x => x.roomId === room.id && x.from <= day && day < x.to);
  if (k) return { state: 'blocked', label: k.reason };
  if (room.damaged) return { state: 'damaged', label: 'Damaged' };
  return { state: 'free', label: 'Free' };
}
const bookingTotal = b => b.nights * (b.price + mealPerNight(b.mealPlan, b.adults, b.children));
