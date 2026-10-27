'use strict';
/* ================= Extras: arcade, kids club, souvenir shop and excursions (no DOM access) =================
   Each one opens free when its earnings milestone is reached (see engine-milestones.js), needs its own team member on duty to trade, and
   earns money every night through runFun(). Every figure below comes from one plan function per extra, so the screens can show the same
   expected numbers the night will use (the night adds a little luck). */

/* A price with pence only when it has them: 1.5 is £1.50, 2 is £2. */
const pounds = n => CURRENCY + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '');

/* ---------- Shared ---------- */
/* ensureFun gives an extra what it starts with: the arcade's first two machines, the shop's first stock and three starter excursions. It is safe to call any time. */
const isWeekendDay = day => (day % 7) >= 5;
const guestCount = () => S.guests.reduce((a, g) => a + (g.adults || 1) + (g.children || 0), 0);
const childCount = () => S.guests.reduce((a, g) => a + (g.children || 0), 0);
const luck = () => 0.9 + Math.random() * 0.2;
/* How much the weather changes a day's mood for indoor and outdoor fun. */
const WEATHER_OUTDOOR = { sunny: 1.2, cloudy: 0.9, rain: 0.25, storm: 0 };
const WEATHER_INDOOR = { sunny: 0.85, cloudy: 1, rain: 1.5, storm: 1.6 };
const festivalLift = () => (festivalOn(S.day) ? 1.2 : 1);
/* People of this role on duty today. Only the extra's own team member can run it: the Manager cannot stand in. */
function crewOnDuty(role) {
  return S.staff.filter(s => worksOn(s, S.day) && s.sickDays === 0 && s.role === role);
}
/* Arcade machines only wear out, break and upset guests while the arcade is being run. */
const arcadeRunning = () => featureOn('arcade') && crewOnDuty('Arcade Attendant').length > 0;
const assetInUse = a => !a.key.startsWith('arcade-') || arcadeRunning();
/* A price's pull on customers: 1 at the fair price, more below it, less above it. */
const priceFactor = (fair, price, strength) => clamp(1 + (fair - price) / fair * strength, 0.15, 1.7);

function ensureFun(d) {
  d = d || S;
  if (!d.features) return;
  if (d.features.arcade && !d.arcade) d.arcade = { price: ARCADE.ref };
  if (d.features.kidsclub && !d.kids) d.kids = { price: KIDS.ref, auto: true };
  if (d.features.shop && !d.shop) d.shop = { stock: Object.fromEntries(Object.entries(SHOP_LINES).map(([k, l]) => [k, l.start])), price: Object.fromEntries(Object.entries(SHOP_LINES).map(([k, l]) => [k, l.ref])) };
  if (d.features.excursions && !d.trips) d.trips = { list: STARTER_TRIPS.map((t, i) => ({ id: i + 1, name: t.name, cat: t.cat, price: tripFairPrice(t.cat, TRIP_CATS), photo: null })), cats: {}, nextId: STARTER_TRIPS.length + 1 };
  if (d.features.arcade && Array.isArray(d.assets)) for (const k of ARCADE_START) if (!d.assets.some(a => a.key === k)) d.assets.push({ key: k, cond: 90, broken: false });
}

/* ================= Arcade ================= */
const ARCADE = { ref: 1.5, min: 0.5, max: 3, step: 0.5, plays: 6, perMachine: 45, cost: 0.2 };   // £ per play; plays a person has in a day; plays a machine can serve; upkeep (prizes, power) per play
const ARCADE_MACHINES = {
  'arcade-claw':    { name: 'Claw machine', pull: 1.0, buy: 0, blurb: 'Grab a soft toy. Toys can get stuck, and children get upset.' },
  'arcade-racing':  { name: 'Racing game', pull: 1.2, buy: 0, blurb: 'Sit-down racer with a wheel and pedals. A favourite with older children.' },
  'arcade-pinball': { name: 'Pinball table', pull: 0.9, buy: 500, blurb: 'Flashing lights and loud bells. The flippers wear out.' },
  'arcade-dance':   { name: 'Dance pad game', pull: 1.1, buy: 650, blurb: 'Step to the beat. Gets the whole family moving.' }
};
const ARCADE_START = ['arcade-claw', 'arcade-racing'];
const arcadeMachines = () => Object.keys(ARCADE_MACHINES).filter(k => assetByKey(k)).map(k => ({ key: k, def: ARCADE_MACHINES[k], asset: assetByKey(k), working: !assetByKey(k).broken }));

function arcadePlan(day) {
  const price = S.arcade.price, m = arcadeMachines().filter(x => x.working);
  const crew = crewOnDuty('Arcade Attendant').length;
  const kids = childCount(), adults = S.guests.reduce((a, g) => a + (g.adults || 1), 0), wx = weatherOn(S.day).kind;
  const locals = Math.round(clamp((rating() - 2) * 4, 0, 10) * (isWeekendDay(S.day) ? 1.5 : 1) * festivalLift() * WEATHER_INDOOR[wx]);
  const people = kids + adults * 0.15 + locals;
  const demand = people * ARCADE.plays * priceFactor(ARCADE.ref, price, 0.8);
  const capacity = m.reduce((a, x) => a + x.def.pull * ARCADE.perMachine, 0);
  const open = crew > 0 && m.length > 0;
  const plays = open ? Math.round(Math.min(demand, capacity)) : 0;
  return { open, why: crew === 0 ? 'no Arcade Attendant on duty' : m.length === 0 ? 'every machine is broken' : '', people: Math.round(people), locals, kids, demand: Math.round(demand), capacity: Math.round(capacity), plays, revenue: Math.round(plays * price), upkeep: Math.round(plays * ARCADE.cost), machinesWorking: m.length };
}
function setArcadePrice(price) {
  if (!featureOn('arcade')) return { ok: false, error: 'The arcade is not open yet.' };
  const p = Math.round(Number(price) * 2) / 2;
  if (!(p >= ARCADE.min && p <= ARCADE.max)) return { ok: false, error: `A play costs between ${pounds(ARCADE.min)} and ${pounds(ARCADE.max)}.` };
  S.arcade.price = p;
  return { ok: true };
}
function buyMachine(key) {
  const def = ARCADE_MACHINES[key];
  if (!featureOn('arcade') || !def) return { ok: false, error: 'That machine is not for sale.' };
  if (assetByKey(key)) return { ok: false, error: 'You already have one.' };
  if (!canAfford(def.buy)) return { ok: false, error: 'Not enough cash.' };
  spend(def.buy, `Arcade machine: ${def.name}`);
  S.assets.push({ key, cond: 100, broken: false });
  return { ok: true };
}

/* ================= Kids Club ================= */
const KIDS = { ref: 18, min: 8, max: 35, perLeader: 8, supplies: 3 };   // £ per child per day; children one leader can look after; supplies per child
const kidsLeaders = () => crewOnDuty('Kids Club Leader').length;
const kidsCapacity = () => kidsLeaders() * KIDS.perLeader;
const familiesInHouse = () => S.guests.filter(g => (g.children || 0) > 0);
/* Families in the order they would be taken: those who asked (or were put in) first, never more than the leaders can look after. */
function kidsAttending() {
  let room = kidsCapacity();
  const enrolled = familiesInHouse().filter(g => g.kidsClub === true), taken = [], waiting = [];
  for (const g of enrolled) { if (g.children <= room) { room -= g.children; taken.push(g); } else waiting.push(g); }
  return { taken, waiting, children: taken.reduce((a, g) => a + g.children, 0) };
}
function setKidsPrice(price) {
  if (!featureOn('kidsclub')) return { ok: false, error: 'The Kids Club is not open yet.' };
  const p = Math.round(Number(price));
  if (!(p >= KIDS.min && p <= KIDS.max)) return { ok: false, error: `A day costs between ${money(KIDS.min)} and ${money(KIDS.max)} a child.` };
  S.kids.price = p;
  return { ok: true };
}
function setKidsEnrol(guestId, on) {
  const g = guestById(guestId);
  if (!featureOn('kidsclub') || !g || !(g.children > 0)) return { ok: false, error: 'There are no children to book in.' };
  g.kidsClub = !!on;
  return { ok: true };
}
/* Each night, with automatic booking on and a leader on duty, families not yet decided are put in (a high price puts some off). Returns how many were added. */
function autoEnrolKids() {
  if (!S.kids.auto || kidsLeaders() === 0) return 0;   // no club to offer, so nobody is put in or let down
  const p = clamp(0.9 * priceFactor(KIDS.ref, S.kids.price, 0.9), 0.1, 1);
  let n = 0;
  for (const g of familiesInHouse()) if (g.kidsClub === undefined) { g.kidsClub = chance(p); if (g.kidsClub) n++; }
  return n;
}

/* ================= Souvenir shop ================= */
const SHOP_LINES = {
  souvenir: { name: 'Souvenirs', cost: 5, ref: 12, per: 0.22, pack: 10, start: 20, blurb: 'Postcards, magnets and sun hats with the hotel on.' },
  snack:    { name: 'Snacks and drinks', cost: 1.2, ref: 3.5, per: 0.9, pack: 20, start: 40, blurb: 'Crisps, sweets and cold drinks.' },
  basics:   { name: 'Travel basics', cost: 2.5, ref: 6, per: 0.15, pack: 10, start: 15, blurb: 'Toothbrushes, sun cream, chargers and plasters.' }
};
const SHOP_MAX_STOCK = 200;
const shopStockValue = () => Math.round(Object.entries(S.shop.stock).reduce((a, [k, n]) => a + n * SHOP_LINES[k].cost, 0));

function shopPlan() {
  const crew = crewOnDuty('Shop Assistant').length, guests = guestCount(), wx = weatherOn(S.day).kind, open = crew > 0;
  const lift = festivalLift() * (wx === 'rain' || wx === 'storm' ? 1.15 : 1);
  const lines = Object.entries(SHOP_LINES).map(([k, l]) => {
    const price = S.shop.price[k], demand = guests * l.per * priceFactor(l.ref, price, 1.1) * lift, stock = S.shop.stock[k];
    const sold = open ? Math.min(stock, Math.round(demand)) : 0;
    return { key: k, name: l.name, price, stock, demand: Math.round(demand), sold, revenue: Math.round(sold * price), cost: Math.round(sold * l.cost), soldOut: open && demand > stock + 0.5 };
  });
  return { open, why: open ? '' : 'no Shop Assistant on duty', lines, revenue: lines.reduce((a, x) => a + x.revenue, 0), cost: lines.reduce((a, x) => a + x.cost, 0) };
}
function setShopPrice(key, price) {
  const l = SHOP_LINES[key];
  if (!featureOn('shop') || !l) return { ok: false, error: 'The shop is not open yet.' };
  const p = Math.round(Number(price) * 2) / 2;
  if (!(p >= l.ref * 0.5 && p <= l.ref * 2)) return { ok: false, error: `${l.name} can cost between ${pounds(l.ref * 0.5)} and ${pounds(l.ref * 2)}.` };
  S.shop.price[key] = p;
  return { ok: true };
}
function buyShopStock(key, packs) {
  const l = SHOP_LINES[key], n = Math.floor(Number(packs));
  if (!featureOn('shop') || !l) return { ok: false, error: 'The shop is not open yet.' };
  if (!(n >= 1)) return { ok: false, error: 'Choose how many packs to order.' };
  const units = n * l.pack;
  if (S.shop.stock[key] + units > SHOP_MAX_STOCK) return { ok: false, error: `The shelves hold ${SHOP_MAX_STOCK} of each.` };
  const cost = Math.round(units * l.cost);
  if (!canAfford(cost)) return { ok: false, error: 'Not enough cash.' };
  spend(cost, `Shop stock: ${l.name}`);
  S.shop.stock[key] += units;
  return { ok: true, units, cost };
}

/* ================= Excursions ================= */
const TRIP_CATS = {
  'Boat trip':       { outdoor: true,  appeal: 1.0, cost: 22 },
  'Nature walk':     { outdoor: true,  appeal: 0.8, cost: 8 },
  'Town tour':       { outdoor: false, appeal: 0.9, cost: 12 },
  'Adventure day':   { outdoor: true,  appeal: 1.1, cost: 28 },
  'Food and drink':  { outdoor: false, appeal: 0.9, cost: 18 },
  'Museum and arts': { outdoor: false, appeal: 0.7, cost: 10 }
};
const CUSTOM_CAT_COST = { 1: 8, 2: 16, 3: 26 };   // a category the player invents costs this much per person to run, by its level
const STARTER_TRIPS = [{ name: 'Harbour boat trip', cat: 'Boat trip' }, { name: 'Clifftop nature walk', cat: 'Nature walk' }, { name: 'Old town tour', cat: 'Town tour' }];
const TRIP = { seats: 14, perGuide: 2, minGuests: 4, maxTrips: 12, nameMax: 30, priceMin: 5, priceMax: 150, perGuest: 0.18 };

function tripCategories() {
  const all = {};
  for (const [k, c] of Object.entries(TRIP_CATS)) all[k] = Object.assign({ custom: false }, c);
  for (const [k, c] of Object.entries(S.trips.cats)) all[k] = { custom: true, outdoor: c.kind === 'outdoor', appeal: 0.9, cost: CUSTOM_CAT_COST[c.level] || 16, kind: c.kind, level: c.level };
  return all;
}
const tripFairPrice = (cat, cats) => Math.round(((cats || tripCategories())[cat].cost * 2.2) / 5) * 5;
const cleanLabel = (s, max) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

function tripsPlan() {
  const cats = tripCategories(), guides = crewOnDuty('Excursions Guide').length, wx = weatherOn(S.day).kind;
  const pool = S.guests.reduce((a, g) => a + (g.adults || 1) + (g.children || 0) * 0.6, 0);
  const rows = S.trips.list.map(t => {
    const c = cats[t.cat] || { outdoor: false, appeal: 0.8, cost: 15 }, fair = tripFairPrice(t.cat, cats);
    const demand = pool * TRIP.perGuest * c.appeal * priceFactor(fair, t.price, 1) * (c.outdoor ? WEATHER_OUTDOOR[wx] : 1) * festivalLift();
    return { trip: t, cat: c, demand, fair, weather: c.outdoor && wx !== 'sunny' ? wx : '' };
  }).sort((a, b) => b.demand - a.demand);
  const slots = guides * TRIP.perGuide;
  const plan = rows.map((r, i) => {
    const runs = i < slots && r.demand >= TRIP.minGuests, tickets = runs ? Math.min(TRIP.seats, Math.round(r.demand)) : 0;
    return { id: r.trip.id, name: r.trip.name, cat: r.trip.cat, price: r.trip.price, fair: r.fair, demand: Math.round(r.demand), runs, tickets, revenue: tickets * r.trip.price, cost: tickets * r.cat.cost, note: runs ? '' : guides === 0 ? 'no Excursions Guide on duty' : i >= slots ? 'no guide free for it today' : r.weather === 'storm' || r.weather === 'rain' ? 'too wet' : 'not enough guests' };
  });
  return { open: guides > 0, why: guides ? '' : 'no Excursions Guide on duty', slots, rows: plan, tickets: plan.reduce((a, x) => a + x.tickets, 0), revenue: plan.reduce((a, x) => a + x.revenue, 0), cost: plan.reduce((a, x) => a + x.cost, 0) };
}
function addTripCategory(name, kind, level) {
  if (!featureOn('excursions')) return { ok: false, error: 'Excursions are not open yet.' };
  const n = cleanLabel(name, 24);
  if (n.length < 2) return { ok: false, error: 'Give the category a name.' };
  if (!['outdoor', 'indoor'].includes(kind) || ![1, 2, 3].includes(Number(level))) return { ok: false, error: 'Choose indoor or outdoor, and how costly it is to run.' };
  if (Object.keys(tripCategories()).some(k => k.toLowerCase() === n.toLowerCase())) return { ok: false, error: 'There is already a category with that name.' };
  if (Object.keys(S.trips.cats).length >= 8) return { ok: false, error: 'You can invent up to 8 categories.' };
  S.trips.cats[n] = { kind, level: Number(level) };
  return { ok: true, name: n };
}
function tripFields(d) {
  const cats = tripCategories(), name = cleanLabel(d.name, TRIP.nameMax), price = Math.round(Number(d.price));
  if (name.length < 2) return { error: 'Give the excursion a name.' };
  if (!cats[d.cat]) return { error: 'Choose a category.' };
  if (!(price >= TRIP.priceMin && price <= TRIP.priceMax)) return { error: `A ticket costs between ${money(TRIP.priceMin)} and ${money(TRIP.priceMax)}.` };
  return { name, cat: d.cat, price };
}
function addTrip(d, photo) {
  if (!featureOn('excursions')) return { ok: false, error: 'Excursions are not open yet.' };
  if (S.trips.list.length >= TRIP.maxTrips) return { ok: false, error: `You can run up to ${TRIP.maxTrips} excursions.` };
  const f = tripFields(d);
  if (f.error) return { ok: false, error: f.error };
  const t = { id: S.trips.nextId++, name: f.name, cat: f.cat, price: f.price, photo: typeof photo === 'string' && photo.startsWith('data:image/') ? photo : null };
  S.trips.list.push(t);
  return { ok: true, trip: t };
}
function updateTrip(id, d, photo) {
  const t = S.trips.list.find(x => x.id === Number(id));
  if (!t) return { ok: false, error: 'That excursion is gone.' };
  const f = tripFields(d);
  if (f.error) return { ok: false, error: f.error };
  Object.assign(t, f);
  if (photo === 'REMOVE') t.photo = null; else if (typeof photo === 'string' && photo.startsWith('data:image/')) t.photo = photo;
  return { ok: true, trip: t };
}
function removeTrip(id) {
  const i = S.trips.list.findIndex(x => x.id === Number(id));
  if (i < 0) return { ok: false, error: 'That excursion is gone.' };
  S.trips.list.splice(i, 1);
  return { ok: true };
}

/* ================= The night ================= */
/* Called once each evening from runEndDay, before guests pay for the night. Adds to `events` (the lines on the end-of-day report). */
function runFun(events) {
  if (featureOn('arcade')) {
    const p = arcadePlan(), plays = p.open ? Math.round(p.plays * luck()) : 0;
    if (plays) {
      const revenue = Math.round(plays * S.arcade.price), upkeep = Math.round(plays * ARCADE.cost);
      earn(revenue, `Arcade: ${plays} plays`); if (upkeep) spend(upkeep, 'Arcade: prizes and power');
      tally('arcadePlays', plays);
      events.push({ text: `Arcade: ${plays} plays, takings ${money(revenue)}.` });
    } else events.push({ text: `The arcade was closed: ${p.why}.` });
  }
  if (featureOn('kidsclub')) {
    const added = autoEnrolKids(), at = kidsAttending();
    for (const g of familiesInHouse().filter(x => x.kidsClub === true)) {
      if (at.taken.includes(g)) g.happiness = clamp(g.happiness + 8, 0, 100);
      else g.happiness = clamp(g.happiness - 3, 0, 100);
    }
    if (at.children) {
      const revenue = at.children * S.kids.price, supplies = at.children * KIDS.supplies;
      earn(revenue, `Kids Club: ${at.children} ${at.children === 1 ? 'child' : 'children'}`); spend(supplies, 'Kids Club: craft and snacks');
      tally('kidsSessions', at.children);
      events.push({ text: `Kids Club: ${at.children} ${at.children === 1 ? 'child' : 'children'} had a great day, takings ${money(revenue)}.${at.waiting.length ? ` ${at.waiting.length} ${at.waiting.length === 1 ? 'family' : 'families'} had to wait: not enough leaders.` : ''}` });
    } else if (familiesInHouse().some(g => g.kidsClub === true)) events.push({ text: kidsLeaders() ? 'The Kids Club was full.' : 'The Kids Club was closed: no Kids Club Leader on duty. Booked families were disappointed.' });
  }
  if (featureOn('shop')) {
    const p = shopPlan();
    if (p.open) {
      let revenue = 0, items = 0;
      for (const l of p.lines) {
        const sold = Math.min(S.shop.stock[l.key], Math.round(l.demand * luck()));
        if (!sold) continue;
        S.shop.stock[l.key] -= sold; items += sold; revenue += Math.round(sold * l.price);
      }
      if (revenue) { earn(revenue, `Shop: ${items} items`); tally('shopItems', items); }
      events.push({ text: revenue ? `Shop: ${items} items sold, takings ${money(revenue)}.` : 'The shop made no sales today.' });
      const out = p.lines.filter(l => l.soldOut).map(l => l.name.toLowerCase());
      if (out.length) events.push({ text: `The shop ran short of ${out.join(' and ')}.` });
    } else events.push({ text: `The shop was closed: ${p.why}.` });
  }
  if (featureOn('excursions')) {
    const p = tripsPlan(), ran = [];
    for (const r of p.rows) {
      if (!r.runs) continue;
      const tickets = Math.min(TRIP.seats, Math.round(r.tickets * luck())), cat = tripCategories()[r.cat];
      if (!tickets) continue;
      earn(tickets * r.price, `Excursion: ${r.name}`); spend(tickets * cat.cost, `Excursion costs: ${r.name}`);
      tally('tripTickets', tickets); ran.push(`${r.name} (${tickets})`);
    }
    events.push({ text: ran.length ? `Excursions today: ${ran.join(', ')}.` : p.open ? 'No excursions ran today.' : `No excursions today: ${p.why}.` });
  }
}
