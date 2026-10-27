'use strict';

/* ================= Reservations and restaurant (no DOM access) =================
   Loaded after engine.js. A booking reserves a specific room for a date range. In-house guests occupy
   [today, today + nights left); a booking occupies [arriveDay, arriveDay + nights). */

/* ---------- Availability ---------- */
function roomBusy(room, from, to, ignoreBookingId) {
  const g = room.guestId ? guestById(room.guestId) : null;
  if (g && S.day < to && S.day + g.left > from) return true;
  if (S.blocks.some(k => k.roomId === room.id && k.from < to && k.to > from)) return true;
  return S.bookings.some(b => b.id !== ignoreBookingId && b.roomId === room.id && b.arriveDay < to && b.arriveDay + b.nights > from);
}
/* Rooms of a type that can host a stay. A stay starting today also needs the room clean and empty right now. */
function freeRoomsFor(type, from, nights, ignoreBookingId) {
  // a damaged room can be booked if its contractor is due to finish by the arrival day
  return S.rooms.filter(r => r.type === type && (!r.damaged || (roomUnderWork(r) && roomUnderWork(r).doneDay <= from && from > S.day)) && !roomBusy(r, from, from + nights, ignoreBookingId) && (from !== S.day || isReady(r)));
}
function capacityOf(type, extras) {
  return ROOM_TYPES[type].cap + (extras || []).reduce((a, k) => a + ((EXTRAS[k] || {}).beds || 0), 0);
}
const mealPerNight = (plan, adults, children) => Math.round(MEAL_PLANS[plan].adult * (adults + children * 0.5));
function dayLabel(day) {
  const rel = day - S.day;
  return `${DAYS[day % 7]} (day ${day + 1})${rel === 0 ? ', today' : rel === 1 ? ', tomorrow' : ''}`;
}
/* Free rooms per type for the next days, for the availability calendar. */
function availabilityGrid(days) {
  const types = [...new Set(S.rooms.map(r => r.type))];
  return types.map(type => {
    const rooms = S.rooms.filter(r => r.type === type && !r.damaged);
    return { type, total: rooms.length, cells: Array.from({ length: days }, (_, i) => rooms.filter(r => !roomBusy(r, S.day + i, S.day + i + 1)).length) };
  });
}
const optionLabelOK = (v, map) => Object.prototype.hasOwnProperty.call(map, v);
function availableExtras() { return Object.keys(EXTRAS).filter(k => !EXTRAS[k].facility || hasFacility(EXTRAS[k].facility)); }
function availableMealPlans() { return Object.keys(MEAL_PLANS).filter(k => k === 'room' || hasFacility('restaurant')); }

/* ---------- Bookings ---------- */
/* Checks the stay details shared by new bookings and changes to them. Returns { error } or { v } with clean values. */
function cleanStay(d) {
  const adults = Math.round(Number(d.adults)), children = Math.round(Number(d.children) || 0), nights = Math.round(Number(d.nights));
  const arriveDay = Math.round(Number(d.arriveDay));
  const price = Math.round(Number(d.price));
  const extras = [...new Set(d.extras || [])];
  const type = d.type, plan = d.mealPlan || 'room';
  if (!(adults >= 1 && adults <= 6)) return { error: 'A booking needs 1 to 6 adults.' };
  if (!(children >= 0 && children <= 4)) return { error: 'Children must be 0 to 4.' };
  if (!(nights >= 1 && nights <= 14)) return { error: 'A stay is 1 to 14 nights.' };
  if (!(arriveDay >= S.day && arriveDay <= S.day + MAX_ADVANCE_DAYS)) return { error: `Arrival must be within the next ${MAX_ADVANCE_DAYS} days.` };
  if (!ROOM_TYPES[type] || !S.rooms.some(r => r.type === type)) return { error: 'You have no rooms of that type.' };
  if (!(price >= 30 && price <= 1000)) return { error: 'The rate must be between £30 and £1,000 a night.' };
  if (!optionLabelOK(plan, MEAL_PLANS) || !availableMealPlans().includes(plan)) return { error: 'That meal plan is not available.' };
  if (!extras.every(k => optionLabelOK(k, EXTRAS) && availableExtras().includes(k))) return { error: 'One of the extras is not available.' };
  if (adults + children > capacityOf(type, extras)) return { error: `${type} rooms sleep ${ROOM_TYPES[type].cap}. Add an extra bed or pick a bigger room.` };
  return { v: { adults, children, nights, arriveDay, price, extras, type, plan } };
}
/* Validates and creates a booking. Returns { ok, error } or { ok, booking, guest } when the guest arrives today. */
function createBooking(d) {
  const name = String(d.name || '').trim().slice(0, 30);
  if (!name) return { ok: false, error: 'Please type the guest name.' };
  const depositPct = Number(d.depositPct) || 0;
  const c = cleanStay(d);
  if (c.error) return { ok: false, error: c.error };
  const { adults, children, nights, arriveDay, price, extras, type, plan } = c.v;
  if (!DEPOSITS.some(x => x[0] === depositPct)) return { ok: false, error: 'Invalid deposit.' };
  const others = String(d.others || '').split(',').map(x => x.trim()).filter(Boolean);
  if (others.length > adults + children - 1) return { ok: false, error: `You listed ${others.length} other name${others.length > 1 ? 's' : ''} but the party has only ${adults + children - 1} other guest${adults + children - 1 === 1 ? '' : 's'}.` };
  if (others.some(o => o.length > 30)) return { ok: false, error: 'Each name must be 30 characters or fewer.' };
  if (d.rel && d.rel !== 'auto' && !Object.prototype.hasOwnProperty.call(REL_LABELS, d.rel)) return { ok: false, error: 'Unknown party type.' };
  const free = freeRoomsFor(type, arriveDay, nights);
  let room = d.roomId ? S.rooms.find(r => r.id === Number(d.roomId)) : null;
  if (d.roomId && !room) return { ok: false, error: 'That room does not exist.' };
  if (room && !free.includes(room)) return { ok: false, error: `${room.name} is not free for those dates.` };
  if (!room) room = free[0];
  if (!room) return { ok: false, error: `No ${type} room is free for those dates.` };
  const total = nights * (price + mealPerNight(plan, adults, children));
  const deposit = Math.round(total * depositPct);
  const party = newParty({ adults, children, rel: d.rel, lead: parseTypedName(name), others });
  const b = { id: nid(), name, party, adults, children, type, roomId: room.id, arriveDay, nights, price, mealPlan: plan, extras, deposit, notes: String(d.notes || '').slice(0, 120), requests: [], moodBonus: 0, noShow: false, regularId: d.regularId || null };
  if (deposit) earn(deposit, `Deposit: ${name}`);
  S.bookings.push(b);
  noteFirst('booked'); tally('bookings');
  if (arriveDay === S.day) { const r = checkInBooking(b.id); return Object.assign({ ok: true, booking: b }, r); }
  return { ok: true, booking: b };
}
function cancelBooking(id, refund) {
  const b = S.bookings.find(x => x.id === id);
  if (!b) return false;
  if (b.deposit && refund) spend(b.deposit, `Deposit refunded: ${b.name}`);
  S.bookings = S.bookings.filter(x => x !== b);
  return true;
}
/* Checks a reservation in now. Uses its room, or another free room of the type. Returns { guest, room, moved } or { error } / { noShow }. */
function checkInBooking(id) {
  const b = S.bookings.find(x => x.id === id);
  if (!b) return { error: 'That booking no longer exists.' };
  if (b.arriveDay > S.day) return { error: 'This guest has not arrived yet.' };
  if (b.noShow) {
    S.bookings = S.bookings.filter(x => x !== b);
    return { noShow: true, name: b.name, kept: b.deposit };
  }
  let room = roomById(b.roomId), moved = false;
  if (!room || !isReady(room)) {
    room = freeRoomsFor(b.type, S.day, b.nights, b.id)[0] || null;
    moved = !!room;
  }
  if (!room) return { error: `${b.name}'s room is not ready and there is no other ${b.type} room free.` };
  S.bookings = S.bookings.filter(x => x !== b);
  const g = checkIn(room, b.name, b.nights, { party: b.party, price: b.price, adults: b.adults, children: b.children, mealPlan: b.mealPlan, deposit: b.deposit, extras: b.extras, notes: b.notes });
  if (b.regularId) welcomeBack(g, b.regularId);   // someone from the guest book: their note decides how pleased they are
  if (moved) g.happiness = clamp(g.happiness - 8, 0, 100);
  if (b.moodBonus) g.happiness = clamp(g.happiness + b.moodBonus, 0, 100);
  giveWishes(g, wishKeysOf(b.requests));   // a sea view, the ground floor or vegetarian food is judged, not left to a task
  const wishes = judgeRoomWishes(g, room);
  for (const q of b.requests || []) if (!q.done && !q.wish) S.jobs.push({ id: nid(), type: 'request', kind: 'special', label: q.text, guestId: g.id, role: 'Receptionist', pay: 0, cost: 0, text: `Asked for when booking: ${q.text}` });
  return { guest: g, room, moved, wishes };
}
const arrivalsDue = () => S.bookings.filter(b => b.arriveDay <= S.day);
function checkInAllArrivals() {
  let ok = 0, noShow = 0, stuck = 0;
  for (const b of [...arrivalsDue()]) {
    const r = checkInBooking(b.id);
    if (r.guest) ok++; else if (r.noShow) noShow++; else stuck++;
  }
  return { ok, noShow, stuck };
}
/* Evening: anyone still waiting is checked in if possible, otherwise they walk away angry and the deposit is refunded. */
function processArrivals(events) {
  for (const b of [...arrivalsDue()]) {
    const r = checkInBooking(b.id);
    if (r.noShow) events.push({ text: `${r.name} did not arrive. ${r.kept ? `You keep the ${money(r.kept)} deposit.` : ''}`.trim() });
    else if (r.guest) {
      r.guest.happiness = clamp(r.guest.happiness - 5, 0, 100);
      events.push({ text: `${r.guest.name} arrived late in the evening and checked in${r.moved ? ' (moved to another room)' : ''}.` });
      if (r.wishes.missed.length) events.push({ text: `${r.guest.name} asked for ${r.wishes.missed.join(' and ')} and did not get it. They have complained.` });
    }
    else {
      if (b.deposit) spend(b.deposit, `Deposit refunded: ${b.name}`);
      addReview(b.name, 2, 'We arrived with a reservation and there was no room ready for us.');
      events.push({ text: `${b.name} had a reservation but no ${b.type} room was ready, so they left angry (2★ review).` });
      S.bookings = S.bookings.filter(x => x !== b);
    }
  }
}
/* Morning: announce today's arrivals and decide who will not turn up. */
function markArrivals() {
  const due = arrivalsDue();
  due.forEach(b => { if (b.arriveDay === S.day && !('noShowRolled' in b)) { b.noShowRolled = true; b.noShow = chance(NO_SHOW_CHANCE); } });
  if (due.length) S.news.push(`${due.length} reservation${due.length > 1 ? 's' : ''} arriving today. Get the rooms ready and check them in.`);
}
/* Accept an enquiry (today's stay, or a reservation for a later date). Returns { ok, error, guest, booking }. */
function acceptEnquiryNow(id) {
  const e = S.enquiries.find(x => x.id === id);
  if (!e) return { ok: false, error: 'That enquiry has gone.' };
  const from = e.arriveDay ?? S.day;
  const room = freeRoomsFor(e.type, from, e.nights)[0];
  if (!room) return { ok: false, error: `No ${e.type} room is free for those dates.` };
  S.enquiries = S.enquiries.filter(x => x !== e);
  noteFirst('booked'); tally('bookings');
  if (from === S.day) return { ok: true, guest: checkIn(room, e.name, e.nights, { adults: e.adults, children: e.children, party: e.party }), room };
  const b = { id: nid(), name: e.name, party: e.party || soloParty(e.name), adults: e.adults || 1, children: e.children || 0, type: e.type, roomId: room.id, arriveDay: from, nights: e.nights, price: room.price, mealPlan: 'room', extras: [], deposit: 0, notes: '', requests: [], moodBonus: 0, noShow: false };
  S.bookings.push(b);
  return { ok: true, booking: b, room };
}

/* ---------- Restaurant ---------- */
const menuAvailable = cat => S.menu.filter(d => d.on && (!cat || d.cat === cat));
const adultMenu = cat => menuAvailable(cat).filter(d => !d.kids);
const kidsMenu = cat => menuAvailable(cat).filter(d => d.kids);
const ingredientCost = d => Math.round(d.price * (0.15 + 0.08 * d.quality));
const fairDishPrice = d => DISH_BASE[d.cat] * (d.kids ? KIDS_FAIR : 1) * (0.7 + 0.15 * d.quality);
function dishFeeling(d) {
  const base = fairDishPrice(d);
  return clamp(Math.round((d.quality - 2.5) * 2 + (base - d.price) / base * 6), -5, 6);
}
function restaurantOpen(day) {
  const f = FACILITIES.find(x => x.key === 'restaurant');
  return hasFacility('restaurant') && facilityStatus(f, day).open;
}
/* Covers one evening in the restaurant. Reserved tables come first (a tenth of parties do not turn up), then in-house guests fill the
   remaining seats: variety brings diners, chefs limit seats, quality pleases guests. Reservations for today are used up either way. */
function runDining() {
  const out = { open: false, covers: 0, reserved: 0, cancelled: 0, revenue: 0, cost: 0, dishes: 0 };
  const booked = S.dinners.filter(d => d.day === S.day);
  S.dinners = S.dinners.filter(d => d.day > S.day);
  if (!hasFacility('restaurant')) return out;
  const mains = adultMenu('Main');
  if (!restaurantOpen() || !mains.length) { out.cancelled = booked.length; S.diningLast = out; return out; }
  out.open = true;
  const chefs = S.staff.filter(s => s.role === 'Chef' && worksOn(s, S.day) && s.sickDays === 0).length;
  let seats = Math.max(1, chefs) * SEATS_PER_CHEF - eventSeatsToday();
  const appetite = 0.10 + 0.04 * Math.min(adultMenu().length, 8);
  const kidsAppetite = kidsMenu('Main').length ? 0.10 + 0.05 * Math.min(kidsMenu().length, 8) : appetite;   // a children's menu with a main on it tempts the children
  /* A child orders from the children's dishes when there are any for the course; everyone else from the grown-up ones. */
  const takeOrder = kid => {
    const pool = cat => (kid && kidsMenu(cat).length ? kidsMenu(cat) : adultMenu(cat));
    const order = [pick(kid ? pool('Main') : mains)];
    for (const [cat, p] of [['Starter', 0.5], ['Dessert', 0.4], ['Drink', 0.7]]) { const list = pool(cat); if (list.length && chance(p)) order.push(pick(list)); }
    return order;
  };
  for (const r of booked) {
    seats -= r.covers;
    if (chance(DINNER_NO_SHOW)) continue;
    for (let i = 0; i < r.covers; i++) { out.covers++; out.reserved++; takeOrder().forEach(d => { out.revenue += d.price; out.cost += ingredientCost(d); out.dishes++; }); }
  }
  for (const g of S.guests) {
    const persons = (g.adults || 1) + (g.children || 0);
    let feel = 0, dishes = 0;
    for (let i = 0; i < persons && seats > 0; i++) {
      const kid = i >= (g.adults || 1);
      if (!chance(kid ? kidsAppetite : appetite)) continue;
      seats--; out.covers++;
      takeOrder(kid).forEach(d => { out.revenue += d.price; out.cost += ingredientCost(d); feel += dishFeeling(d); dishes++; });
    }
    out.dishes += dishes;
    if (dishes) g.happiness = clamp(g.happiness + Math.round(feel / dishes), 0, 100);
  }
  if (out.covers) { earn(out.revenue, `Restaurant: ${out.covers} covers`); spend(out.cost, 'Restaurant ingredients'); }
  S.diningLast = out;
  return out;
}

/* ---------- Menu editing ---------- */
function cleanDish(d) {
  const name = String(d.name || '').trim().slice(0, 40);
  if (!name) return { error: 'Please give the dish a name.' };
  if (!DISH_CATS.includes(d.cat)) return { error: 'Pick a category.' };
  const price = Number(d.price), quality = Math.round(Number(d.quality));
  if (!(price >= 1 && price <= 200)) return { error: 'The price must be between £1 and £200.' };
  if (!(quality >= 1 && quality <= 5)) return { error: 'Quality is 1 to 5 stars.' };
  return { dish: { name, desc: String(d.desc || '').trim().slice(0, 100), cat: d.cat, price: Math.round(price * 100) / 100, quality, veg: !!d.veg, nuts: !!d.nuts, kids: !!d.kids, on: d.on !== false } };
}
function addDish(d, photo) {
  if (S.menu.length >= MAX_DISHES) return { error: `A menu holds up to ${MAX_DISHES} dishes.` };
  const c = cleanDish(d);
  if (c.error) return c;
  const dish = Object.assign({ id: nid(), photo: photo || null, img: null }, c.dish);
  S.menu.push(dish);
  return { dish };
}
function updateDish(id, d, photo) {
  const dish = S.menu.find(x => x.id === id);
  if (!dish) return { error: 'That dish no longer exists.' };
  const c = cleanDish(d);
  if (c.error) return c;
  Object.assign(dish, c.dish);
  if (photo === 'REMOVE') dish.photo = null; else if (photo) dish.photo = photo;
  return { dish };
}
function deleteDish(id) { const n = S.menu.length; S.menu = S.menu.filter(x => x.id !== id); return S.menu.length < n; }
/* Adds the children's set (skipping any already there). Returns how many dishes were added. */
function addKidsMenu() {
  let added = 0;
  for (const d of KIDS_MENU) {
    if (S.menu.length >= MAX_DISHES) break;
    if (S.menu.some(x => x.img === `assets/menu/${d.key}.jpg`)) continue;
    S.menu.push(Object.assign({ id: nid(), photo: null, img: `assets/menu/${d.key}.jpg`, on: true, kids: true }, d));
    added++;
  }
  return added;
}
function defaultMenu() { return DEFAULT_MENU.map(d => Object.assign({ id: nid(), photo: null, img: `assets/menu/${d.key}.jpg`, on: true }, d)); }
