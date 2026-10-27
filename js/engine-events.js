'use strict';

/* ================= Events: planning, ticket sales, private contracts and the night itself (no DOM access) =================
   Loaded after engine-bookings.js. Public events (excursions, karaoke, buffets, theme nights, barbecues) sell tickets that you price and
   advertise. Private events (parties, weddings) arrive as client requests with an offer per head. Each event is settled in the evening. */

const eventDef = e => EVENT_TYPES[e.type];
const eventSold = e => e.reservations.reduce((a, r) => a + r.size, 0);
function poisson(lambda) {
  if (!(lambda > 0)) return 0;
  const limit = Math.exp(-Math.min(lambda, 50)); let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > limit && k < 200);
  return k - 1;
}
const eventTypeStatus = key => {
  const d = EVENT_TYPES[key];
  if (!d) return { ok: false, why: 'Unknown event.' };
  if (S.tier < d.tier) return { ok: false, why: `Unlocks at ${TIERS[d.tier - 1].name}` };
  if (d.needs.facility && !hasFacility(d.needs.facility)) return { ok: false, why: `Needs the ${FACILITY_UPGRADES[d.needs.facility].name.toLowerCase()}` };
  return { ok: true, why: '' };
};
/* People who could run the event on a day: the role the event needs, or a manager. Sick people only count today. */
function eventStaff(def, day) {
  return S.staff.filter(s => (s.role === def.needs.role || s.role === 'Manager') && worksOn(s, day) && (day !== S.day || s.sickDays === 0));
}
const venueBusy = (venue, day, ignoreId) => S.events.some(e => e.id !== ignoreId && e.day === day && EVENT_TYPES[e.type].venue === venue);
const restaurantEventOn = day => S.events.some(e => e.day === day && EVENT_TYPES[e.type].venue === 'Restaurant');
const eventSeatsToday = () => S.events.filter(e => e.day === S.day && EVENT_TYPES[e.type].venue === 'Restaurant').reduce((a, e) => a + e.cap, 0);

/* How attractive an event is: a fair price, advertising, a good rating, a bigger hotel and a popular theme all help. */
function eventAppeal(e) {
  const d = eventDef(e);
  const priceFactor = clamp(Math.pow(d.ref / Math.max(1, e.price), 2.5), 0.05, 2);   // steep: overcharging empties the room
  const ratingFactor = clamp(rating() / 4, 0.6, 1.3);
  const sizeFactor = clamp(Math.sqrt(S.rooms.length / 24), 1, 3);
  const theme = e.theme ? EVENT_THEMES[e.theme].pop : 1;
  const when = d.outdoor ? seasonOf(e.day).outdoor * OUTDOOR_WEATHER[forecastOn(e.day).kind] : seasonOf(e.day).indoor;
  return priceFactor * EVENT_ADVERTS[e.advert].boost * ratingFactor * sizeFactor * theme * when;
}
const expectedDailySales = e => eventDef(e).demand * eventAppeal(e);

/* ---------- Planning ---------- */
function planEvent(d) {
  const def = EVENT_TYPES[d.type];
  if (!def) return { ok: false, error: 'Choose an event.' };
  if (def.kind === 'private') return { ok: false, error: `Clients book ${def.name.toLowerCase()}s. Accept a request when one arrives.` };
  const st = eventTypeStatus(d.type);
  if (!st.ok) return { ok: false, error: `${def.name}: ${st.why.toLowerCase()}.` };
  const day = Math.round(Number(d.day)), price = Math.round(Number(d.price)), cap = Math.round(Number(d.cap === undefined ? def.cap[2] : d.cap)), advert = Math.round(Number(d.advert || 0));
  if (!(day >= S.day + 1 && day <= S.day + EVENT_ADVANCE_DAYS)) return { ok: false, error: `Plan between tomorrow and ${EVENT_ADVANCE_DAYS} days ahead.` };
  if (!(price >= def.min && price <= def.max)) return { ok: false, error: `The ticket price must be between ${money(def.min)} and ${money(def.max)}.` };
  if (!(cap >= def.cap[0] && cap <= def.cap[1])) return { ok: false, error: `This event holds ${def.cap[0]} to ${def.cap[1]} people.` };
  if (!EVENT_ADVERTS[advert]) return { ok: false, error: 'Unknown advertising option.' };
  const theme = d.type === 'theme' ? (d.theme || 'italian') : null;
  if (theme && !EVENT_THEMES[theme]) return { ok: false, error: 'Choose a theme.' };
  if (S.events.length >= MAX_EVENTS) return { ok: false, error: `You can run up to ${MAX_EVENTS} events at once.` };
  if (venueBusy(def.venue, day)) return { ok: false, error: `The ${def.venue.toLowerCase()} is already in use that day.` };
  if (def.venue === 'Restaurant' && dinnerCovers(day) > 0) return { ok: false, error: 'Dinner tables are booked that evening. Cancel them first.' };
  if (!eventStaff(def, day).length) return { ok: false, error: `Nobody is rostered that day who can run it. Put a ${def.needs.role.toLowerCase()} on the rota.` };
  const cost = EVENT_ADVERTS[advert].cost;
  if (!canAfford(cost)) return { ok: false, error: 'Not enough cash for the advertising.' };
  const e = { id: nid(), type: d.type, name: theme ? EVENT_THEMES[theme].name : def.name, day, price, cap, advert, theme, private: false, client: null, reservations: [] };
  if (cost) spend(cost, `Advertising: ${e.name}`);
  S.events.push(e);
  return { ok: true, event: e };
}
function setEventPrice(id, price) {
  const e = S.events.find(x => x.id === id), def = e && eventDef(e);
  if (!e) return { ok: false, error: 'That event is gone.' };
  if (e.private) return { ok: false, error: 'A client contract has a fixed price.' };
  price = Math.round(Number(price));
  if (!(price >= def.min && price <= def.max)) return { ok: false, error: `The ticket price must be between ${money(def.min)} and ${money(def.max)}.` };
  e.price = price;
  return { ok: true, event: e };
}
/* Advertising can be stepped up, paying the difference; it cannot be taken back. */
function setEventAdvert(id, level) {
  const e = S.events.find(x => x.id === id);
  if (!e) return { ok: false, error: 'That event is gone.' };
  level = Math.round(Number(level));
  if (!EVENT_ADVERTS[level]) return { ok: false, error: 'Unknown advertising option.' };
  if (e.private) return { ok: false, error: 'A client contract needs no advertising.' };
  if (level <= e.advert) return { ok: false, error: 'You can only step the advertising up.' };
  const cost = EVENT_ADVERTS[level].cost - EVENT_ADVERTS[e.advert].cost;
  if (!canAfford(cost)) return { ok: false, error: 'Not enough cash for the advertising.' };
  spend(cost, `Advertising: ${e.name}`);
  e.advert = level;
  return { ok: true, event: e };
}
function cancelEvent(id) {
  const e = S.events.find(x => x.id === id);
  if (!e) return { ok: false, error: 'That event is gone.' };
  const refund = e.reservations.reduce((a, r) => a + r.paid, 0);
  if (refund) spend(refund, `Refunds: ${e.name} cancelled`);
  S.events = S.events.filter(x => x !== e);
  if (e.private) addReview(e.client, 1, 'They cancelled our booking. We had to find somewhere else.');
  return { ok: true, refund };
}

/* ---------- Reservations ---------- */
function addEventReservation(id, d) {
  const e = S.events.find(x => x.id === id);
  if (!e) return { ok: false, error: 'That event is gone.' };
  if (e.private) return { ok: false, error: 'A client contract is booked as a whole party.' };
  const name = String(d.name || '').trim().slice(0, 30), size = Math.round(Number(d.size));
  if (!name) return { ok: false, error: 'Please type a name.' };
  if (!(size >= 1 && size <= 6)) return { ok: false, error: 'A reservation is for 1 to 6 people.' };
  const left = e.cap - eventSold(e);
  if (size > left) return { ok: false, error: left > 0 ? `Only ${left} place${left === 1 ? '' : 's'} left.` : 'The event is full.' };
  const r = { id: nid(), name, size, paid: e.price * size, guestId: d.guestId || null };
  e.reservations.push(r);
  if (r.paid) earn(r.paid, `Tickets: ${e.name}`);
  return { ok: true, reservation: r };
}
function cancelEventReservation(eventId, resId) {
  const e = S.events.find(x => x.id === eventId);
  if (!e || e.private) return false;
  const r = e.reservations.find(x => x.id === resId);
  if (!r) return false;
  if (r.paid) spend(r.paid, `Ticket refunded: ${r.name}`);
  e.reservations = e.reservations.filter(x => x !== r);
  return true;
}

/* ---------- Each morning: tickets sell, clients ask ---------- */
function sellEventTickets() {
  for (const e of S.events) {
    if (e.private || e.day <= S.day) continue;
    let n = poisson(expectedDailySales(e));
    const appeal = eventAppeal(e);
    for (const g of S.guests) {
      if (eventSold(e) + n >= e.cap) break;
      if (chance(Math.min(0.2, 0.03 * appeal)) && !e.reservations.some(r => r.guestId === g.id)) {
        const size = Math.min((g.adults || 1) + (g.children || 0), rndRange(1, 2));
        if (eventSold(e) + n + size <= e.cap) { const r = { id: nid(), name: g.name, size, paid: e.price * size, guestId: g.id }; e.reservations.push(r); if (r.paid) earn(r.paid, `Tickets: ${e.name}`); }
      }
    }
    n = Math.min(n, e.cap - eventSold(e));
    while (n > 0) {
      const size = Math.min(n, rndRange(1, 4)), p = drawPerson();
      const r = { id: nid(), name: p.name, size, paid: e.price * size, guestId: null };
      e.reservations.push(r); if (r.paid) earn(r.paid, `Tickets: ${e.name}`);
      n -= size;
    }
  }
}
const MAX_EVENT_REQUESTS = 4;
function makeEventRequests() {
  S.eventRequests = S.eventRequests.filter(q => q.expires >= S.day);
  for (const key of Object.keys(EVENT_TYPES)) {
    const def = EVENT_TYPES[key];
    if (def.kind !== 'private' || !eventTypeStatus(key).ok || S.eventRequests.length >= MAX_EVENT_REQUESTS) continue;
    if (!chance((key === 'wedding' ? 0.025 : 0.05) * clamp(rating() / 4, 0.6, 1.3))) continue;
    const day = S.day + rndRange(8, 40);
    if (venueBusy(def.venue, day) || S.eventRequests.some(q => q.day === day && EVENT_TYPES[q.type].venue === def.venue)) continue;
    const guests = rndRange(def.cap[0], def.cap[1]), offer = clamp(Math.round(def.ref * (0.85 + Math.random() * 0.4)), def.min, def.max), client = drawPerson().name;
    const q = { id: nid(), type: key, client, guests, day, offer, expires: S.day + 4 };
    S.eventRequests.push(q);
    S.news.push(`${client} asks to hold a ${def.name.toLowerCase()} for ${guests} guests on ${dayLabel(day)}. See Events and Food.`);
  }
}
function acceptEventRequest(id) {
  const q = S.eventRequests.find(x => x.id === id);
  if (!q) return { ok: false, error: 'That request has expired.' };
  const def = EVENT_TYPES[q.type];
  if (q.day <= S.day) return { ok: false, error: 'That date has passed.' };
  if (!eventTypeStatus(q.type).ok) return { ok: false, error: `${def.name}: ${eventTypeStatus(q.type).why.toLowerCase()}.` };
  if (venueBusy(def.venue, q.day)) return { ok: false, error: `The ${def.venue.toLowerCase()} is already in use that day.` };
  if (!eventStaff(def, q.day).length) return { ok: false, error: `Nobody is rostered that day who can run it. Put a ${def.needs.role.toLowerCase()} on the rota first.` };
  if (S.events.length >= MAX_EVENTS) return { ok: false, error: `You can run up to ${MAX_EVENTS} events at once.` };
  const deposit = Math.round(q.guests * q.offer * PRIVATE_DEPOSIT);
  const e = { id: nid(), type: q.type, name: `${q.client}'s ${def.name.toLowerCase()}`, day: q.day, price: q.offer, cap: q.guests, advert: 0, theme: null, private: true, client: q.client,
    reservations: [{ id: nid(), name: q.client, size: q.guests, paid: deposit, guestId: null }] };
  S.events.push(e);
  S.eventRequests = S.eventRequests.filter(x => x !== q);
  if (deposit) earn(deposit, `Deposit: ${e.name}`);
  return { ok: true, event: e, deposit };
}
function declineEventRequest(id) { const n = S.eventRequests.length; S.eventRequests = S.eventRequests.filter(x => x.id !== id); return S.eventRequests.length < n; }

/* ---------- The night itself ---------- */
/* Stars out of five: a fair price, skilled staff and a popular theme help; crowding and rain hurt. */
function eventStars(e, attendees, rain) {
  const d = eventDef(e), staff = eventStaff(d, S.day), skill = staff.length ? staff.reduce((a, s) => a + s.skill, 0) / staff.length : 3;
  let score = 3 + (skill - 3) * 0.3;
  if (!e.private) { const ratio = e.price / d.ref; if (ratio <= 0.9) score += 0.5; else if (ratio >= 1.25) score -= 0.7; }
  if (attendees / e.cap > 0.95) score -= 0.3;
  if (rain) score -= 1;
  if (e.theme) score += (EVENT_THEMES[e.theme].pop - 1);
  score += Math.random() * 0.8 - 0.4;
  return clamp(Math.round(score), 1, 5);
}
function runEvents(lines) {
  for (const e of S.events.filter(x => x.day === S.day)) {
    const d = eventDef(e), lead = e.reservations[0];
    const refundAll = () => e.reservations.reduce((a, r) => a + r.paid, 0);
    if (!eventStaff(d, S.day).length) {
      const refund = refundAll(); if (refund) spend(refund, `Refunds: ${e.name} cancelled`);
      if (lead) addReview(lead.name, 1, 'The event was cancelled at the last minute.');
      lines.push({ text: `${e.name} was cancelled: nobody was available to run it. ${refund ? money(refund) + ' refunded. ' : ''}(1★ review)` });
      S.eventLog.push({ id: e.id, name: e.name, type: e.type, day: e.day, cancelled: true, attendees: 0, revenue: 0, cost: 0, stars: 0 });
      continue;
    }
    const sky = d.outdoor ? weatherOn(S.day).kind : 'sunny';
    if (sky === 'storm' && !e.private) {   // a storm calls a public outdoor event off; a private one carries on indoors like a wet day
      const refund = refundAll(); if (refund) spend(refund, `Refunds: ${e.name} called off`);
      lines.push({ text: `${e.name} was called off because of a storm. ${refund ? money(refund) + ' of tickets refunded.' : ''}`.trim() });
      postMail({ from: 'Events team', role: 'Events', subject: `${e.name} called off: storm`, body: `A storm hit on the night, so the event could not go ahead.${refund ? ` ${money(refund)} of tickets were refunded.` : ''}`, kind: 'event' });
      S.eventLog.push({ id: e.id, name: e.name, type: e.type, day: e.day, cancelled: true, storm: true, attendees: 0, revenue: 0, cost: 0, stars: 0 });
      continue;
    }
    const rain = sky === 'rain' || sky === 'storm';
    const booked = eventSold(e);
    let attendees = 0, refunded = 0;
    if (e.private) attendees = lead.size;
    else for (const r of e.reservations) {
      let came = 0;
      for (let i = 0; i < r.size; i++) if (chance(rain ? 0.5 : 1 - EVENT_NO_SHOW)) came++;
      attendees += came;
      if (rain && came < r.size && r.paid) { const back = Math.round(r.paid / r.size * (r.size - came)); refunded += back; }
    }
    if (refunded) spend(refunded, `Rain refunds: ${e.name}`);
    let door = 0;
    if (!e.private && !rain) door = Math.min(e.cap - booked, poisson(expectedDailySales(e) * 0.8));
    attendees += door;
    const tickets = e.reservations.reduce((a, r) => a + r.paid, 0) - refunded;
    let revenue = tickets;
    if (door && e.price) { earn(door * e.price, `Door sales: ${e.name}`); revenue += door * e.price; }
    if (e.private) { const balance = Math.max(0, e.cap * e.price - lead.paid); if (balance) { earn(balance, `Balance: ${e.name}`); revenue += balance; } }
    const extra = e.private ? 0 : attendees * d.extra;
    if (extra) { earn(extra, `Spend on the night: ${e.name}`); revenue += extra; }
    const cost = Math.round(attendees * (d.cost + (e.theme ? EVENT_THEMES[e.theme].cost : 0)) + d.fixed);
    spend(cost, `Costs: ${e.name}`);
    const stars = eventStars(e, attendees, rain);
    if (lead) addReview(lead.name, stars, pick(EVENT_REVIEW[stars]));
    for (const r of e.reservations) { const g = r.guestId ? guestById(r.guestId) : null; if (g) g.happiness = clamp(g.happiness + (stars - 3) * 4 + 4, 0, 100); }
    postMail({ from: 'Events team', role: 'Events', subject: `${e.name}: ${stars}★, ${signed(revenue - cost)}`, body: `${attendees} guests came${rain ? ' despite the rain' : ''}. Takings ${money(revenue)}, costs ${money(cost)}, profit ${signed(revenue - cost)}.`, kind: 'event' });
    lines.push({ text: `${e.name}: ${attendees} guests${rain ? ', rained off' : ''}, takings ${money(revenue)}, costs ${money(cost)}, profit ${signed(revenue - cost)} (${stars}★).` });
    S.eventLog.push({ id: e.id, name: e.name, type: e.type, day: e.day, cancelled: false, rain, attendees, revenue, cost, stars });
    S.stats.events++; tally('events'); if (e.type === 'wedding') S.stats.weddings++;
  }
  S.events = S.events.filter(x => x.day > S.day);
  S.eventLog = S.eventLog.slice(-20);
}
