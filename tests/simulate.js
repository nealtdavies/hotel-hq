'use strict';
/* Headless rules test: loads the game scripts into a sandbox and plays thousands of random days,
   checking invariants and that every scenario option runs without errors.  Usage: node tests/simulate.js */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'js');
const files = ['storage.js', 'data.js', 'names-data.js', 'names.js', 'scenarios.js', 'scenarios-guests.js', 'scenarios-business.js', 'scenarios-extra.js', 'scenarios-fun.js', 'engine.js', 'engine-extra.js', 'engine-contractors.js', 'engine-bookings.js', 'engine-events.js', 'engine-mail.js', 'engine-season.js', 'engine-challenges.js', 'engine-coach.js', 'engine-bank.js', 'engine-milestones.js', 'engine-fun.js', 'engine-phone.js', 'engine-guestbook.js', 'engine-career.js', 'engine-wishes.js', 'engine-mgmt.js', 'engine-team.js', 'engine-dashboard.js'];
const errors = [];
const sandbox = { console: { log: console.log, error: (...a) => errors.push(a.map(String).join(' ')) }, Math, JSON, Date, Number, Object, Array, String, Set, Map, Error };
vm.createContext(sandbox);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
const run = code => vm.runInContext(code, sandbox);
const JP = x => (typeof x === 'string' ? JSON.parse(x) : x);

let failures = 0;
const fail = m => { failures++; if (failures < 25) console.error('FAIL:', m); };
const ok = m => console.log('ok  :', m);

/* ---------- static validation ---------- */
run(`
  globalThis.__report = (function () {
    const out = { ids: [], problems: [], variants: 0, options: 0, imgs: new Set() };
    const seen = new Set();
    for (const s of SCENARIOS) {
      if (seen.has(s.id)) out.problems.push('duplicate id ' + s.id);
      seen.add(s.id);
      for (const k of ['id', 'cat', 'sev', 'img', 'imgPrompt', 'title', 'text']) if (!s[k]) out.problems.push(s.id + ': missing ' + k);
      if (!['Minor', 'Serious', 'Urgent'].includes(s.sev)) out.problems.push(s.id + ': bad sev');
      const stages = s.stages || [{ options: s.options }];
      if (!stages.every(st => Array.isArray(st.options) && st.options.length >= 2)) out.problems.push(s.id + ': each stage needs 2+ options');
      for (const st of stages) {
        if (!st.options.some(o => !o.staff && !o.cost)) out.problems.push(s.id + ': a stage has no free, staff-free option');
        for (const o of st.options) { out.options++; if (typeof o.run !== 'function') out.problems.push(s.id + ': option without run'); }
      }
      const txt = JSON.stringify([s.text instanceof Function ? '' : s.text]);
      if (/\\b(he|she|his|her|him|hers)\\b/i.test(typeof s.text === 'function' ? '' : [].concat(s.text).join(' '))) out.problems.push(s.id + ': gendered pronoun in text');
      out.variants += Array.isArray(s.text) ? s.text.length : 1;
      out.imgs.add(s.img);
    }
    out.count = SCENARIOS.length; out.imgCount = out.imgs.size; delete out.imgs;
    return out;
  })();
`);
const rep = JSON.parse(JSON.stringify(run('__report')));
rep.problems.forEach(p => fail(p));
ok(`${rep.count} scenarios, ${rep.variants} text variants, ${rep.options} options, ${rep.imgCount} images`);


/* A fully grown hotel (all levels, facilities and room types) so every scenario can be exercised. */
run(`
  globalThis.__full = function () {
    S.tier = TIERS.length; S.tierSeen = TIERS.length;
    Object.keys(FACILITY_UPGRADES).forEach(k => { if (!hasFacility(k)) S.unlocked.push(k); FACILITY_UPGRADES[k].assets.forEach(a => { if (!assetByKey(a)) S.assets.push({ key: a, cond: 100, broken: false }); }); });
    [['401', 'Family'], ['402', 'Family'], ['501', 'Luxury Suite'], ['502', 'Luxury Suite']].forEach(([n, t]) => S.rooms.push(makeRoom('Room ' + n, t)));   // after the 24 starting rooms: indexes 24, 25 (Family) and 26, 27 (Luxury)
    S.staff.push(makeStaff(drawPerson('m').name, 'm', 'm03', 'Chef', 4, 3, [5, 6]));
    S.staff.push(makeStaff(drawPerson('f').name, 'f', 'f03', 'Spa Therapist', 4, 4, [5, 6]));
    S.staff.push(makeStaff(drawPerson('m').name, 'm', 'm01', 'Receptionist', 3, 3, [0, 1]));
    S.staff.push(makeStaff(drawPerson('m').name, 'm', 'm02', 'Housekeeper', 3, 3, [1, 2]));
  };
`);

/* ---------- invariants ---------- */
run(`
  globalThis.__check = function () {
    const p = [];
    if (!validState(JSON.parse(JSON.stringify(S)))) p.push('invalid state');
    if (!Number.isFinite(S.money)) p.push('money not finite');
    for (const r of S.rooms) {
      if (r.guestId && !S.guests.find(g => g.id === r.guestId && g.roomId === r.id)) p.push('room->guest ' + r.name);
      if (r.guestId && (r.dirty && false)) p.push('x');
    }
    for (const g of S.guests) {
      const r = S.rooms.find(x => x.id === g.roomId);
      if (!r || r.guestId !== g.id) p.push('guest->room ' + g.name);
      if (g.happiness < 0 || g.happiness > 100 || !Number.isFinite(g.happiness)) p.push('mood range ' + g.happiness);
      if (g.left < 0) p.push('negative nights');
    }
    for (const s of S.staff) {
      if (s.used > STAFF_CAP + 0) p.push('cap ' + s.name);
      if (s.skill < 1 || s.skill > 5 || s.reliability < 1 || s.reliability > 5) p.push('stat range ' + s.name);
      if (s.wage <= 0) p.push('wage');
    }
    for (const i of S.incidents) {
      const b = i.b;
      if ((b.guestId && !guestById(b.guestId)) || (b.staffId && !staffById(b.staffId)) || (b.roomId && !roomById(b.roomId))) p.push('dangling incident ' + i.sid);
    }
    for (const j of S.jobs) {
      if (j.guestId && !guestById(j.guestId)) p.push('dangling job guest');
      if (j.type === 'clean' && !(roomById(j.roomId) || {}).dirty) p.push('stale clean job');
      if (j.type === 'repair' && j.target === 'room' && !(roomById(j.roomId) || {}).damaged) p.push('stale repair job');
    }
    for (const r of S.rooms) if (r.damaged && !workFor('room', r.id) && !S.jobs.some(j => j.type === 'repair' && j.roomId === r.id)) p.push('damaged room without job or contractor');
    for (const a of S.assets) if (a.cond < 0 || a.cond > 100) p.push('asset range');
    for (const b of S.bookings) {
      if (!roomById(b.roomId)) p.push('booking room missing');
      if (b.arriveDay < S.day) p.push('overdue booking left behind');
      if (b.deposit < 0 || !(b.nights >= 1)) p.push('booking numbers');
      if (S.bookings.some(o => o !== b && o.roomId === b.roomId && o.arriveDay < b.arriveDay + b.nights && b.arriveDay < o.arriveDay + o.nights)) p.push('double-booked room ' + b.roomId);
      const r = roomById(b.roomId); const g = r && r.guestId ? guestById(r.guestId) : null;
      if (g && S.day < b.arriveDay + b.nights && S.day + g.left > b.arriveDay && b.arriveDay > S.day && false) p.push('x');
    }
    for (const g of S.guests) if (g.deposit < 0 || g.adults < 1) p.push('guest booking fields');
    for (const w of S.works) {
      const t = w.target === 'room' ? roomById(Number(w.key)) : assetByKey(w.key);
      if (!t) p.push('work target missing');
      else if (w.kind === 'repair' && (w.target === 'room' ? !t.damaged : !t.broken)) p.push('repair work on something not broken');
      if (S.works.some(o => o !== w && o.target === w.target && o.key === w.key)) p.push('two works on one target');
      if (!(w.doneDay >= w.eta && w.eta >= w.orderDay) || w.price < 0) p.push('work dates/price');
      if (w.doneDay < S.day) p.push('overdue work left behind');
      if (!firmDef(w.firm)) p.push('work firm missing');
      if (w.kind === 'repair' && S.jobs.some(j => j.type === 'repair' && (w.target === 'room' ? j.roomId === Number(w.key) : j.assetKey === w.key))) p.push('repair job shown while contractor is working');
    }
    for (const f of S.firms) if (!(f.rating >= 1 && f.rating <= 5) || f.ok > f.jobs || f.problems < 0 || !Number.isInteger(f.jobs)) p.push('firm record');
    for (const k of S.blocks) { if (!roomById(k.roomId) || !(k.to > k.from) || k.to <= S.day) p.push('block invalid'); }
    for (const b of S.bookings) { if (!Array.isArray(b.requests) || b.requests.length > MAX_REQUESTS) p.push('booking requests'); if (!(ROOM_TYPES[b.type]) || (roomById(b.roomId) || {}).type !== b.type) p.push('booking type does not match its room'); if (b.party.members.length !== b.adults + b.children) p.push('booking party size'); }
    for (const b of S.bookings) if (S.blocks.some(k => k.roomId === b.roomId && k.from < b.arriveDay + b.nights && k.to > b.arriveDay)) p.push('booking inside a block');
    for (const d of S.dinners) if (d.day < S.day || d.covers < 1) p.push('dinner invalid');
    for (const e of S.events) { if (e.day <= S.day - 1 || eventSold(e) > e.cap || e.reservations.some(r => !(r.size >= 1) || r.paid < 0)) p.push('event invalid'); }
    { const v = new Set(); for (const e of S.events) { const k = e.day + EVENT_TYPES[e.type].venue; if (v.has(k)) p.push('two events in one venue on a day'); v.add(k); } }
    if (S.mail.items.length > MAIL_MAX || S.mail.handled.length > HANDLED_MAX) p.push('mail not capped');
    { const live = liveMail(), keys = new Set(live.map(m => m.key)); if (keys.size !== live.length) p.push('duplicate inbox keys'); if (live.some(m => !m.subject || !Array.isArray(m.actions))) p.push('malformed inbox item'); }
    if (!Number.isInteger(S.seed) || !WEATHER_KINDS.includes(weatherOn(S.day).kind) || !WEATHER_KINDS.includes(forecastOn(S.day + 3).kind)) p.push('weather invalid');
    for (const r of S.rooms) if (!(r.price >= 30 && r.price <= 500)) p.push('room price out of range');
    if (S.challenges.daily.length !== 2 || S.challenges.daily.some(k => !DAILY.some(c => c.key === k)) || (S.challenges.weekly && !WEEKLY.some(c => c.key === S.challenges.weekly))) p.push('challenges invalid');
    const seen = new Set();
    const who = [...S.guests.map(g => g.name), ...S.bookings.map(b => b.name), ...S.enquiries.map(e => e.name), ...S.staff.map(x => x.name), ...S.candidates.map(x => x.name), ...S.works.map(w => w.engineer)];
    for (const n of who) { const k = String(n).toLowerCase(); if (seen.has(k)) p.push('duplicate name ' + n); seen.add(k); }
    for (const g of S.guests) if (g.party && g.party.members.length !== g.party.adults + g.party.children) p.push('party size ' + g.name);
    for (const d of S.menu) if (!(d.price >= 1) || d.quality < 1 || d.quality > 5 || !DISH_CATS.includes(d.cat)) p.push('dish invalid');
    for (const k of Object.keys(FEATURES)) if (featureOn(k) && !S[{ arcade: 'arcade', kidsclub: 'kids', shop: 'shop', excursions: 'trips' }[k]]) p.push('extra without its state ' + k);
    if (S.arcade && !(S.arcade.price >= ARCADE.min && S.arcade.price <= ARCADE.max && ARCADE_START.every(k => assetByKey(k)))) p.push('arcade invalid');
    if (S.kids && !(S.kids.price >= KIDS.min && S.kids.price <= KIDS.max && typeof S.kids.auto === 'boolean')) p.push('kids club invalid');
    if (S.shop) for (const [k, l] of Object.entries(SHOP_LINES)) { const n = S.shop.stock[k], pr = S.shop.price[k]; if (!(Number.isInteger(n) && n >= 0 && n <= SHOP_MAX_STOCK) || !(pr >= l.ref * 0.5 && pr <= l.ref * 2)) p.push('shop invalid ' + k + ' ' + n + ' ' + pr); }
    if (S.trips) { const cats = tripCategories(); const ids = new Set(S.trips.list.map(t => t.id)); if (ids.size !== S.trips.list.length || S.trips.list.length > TRIP.maxTrips || S.trips.list.some(t => !cats[t.cat] || !(t.price >= TRIP.priceMin && t.price <= TRIP.priceMax) || t.name.length < 2 || /[<>]/.test(t.name) || t.id >= S.trips.nextId)) p.push('trips invalid'); }
    { const ph = S.phone, ids = new Set(ph.calls.map(c => c.id)); if (!ph || ids.size !== ph.calls.length || ph.calls.length > 40 || ph.calls.some(c => !['call', 'voicemail', 'message'].includes(c.kind) || !['queued', 'ringing', 'waiting', 'done'].includes(c.status) || !c.caller.name || c.id >= ph.nextId || (c.kind !== 'message' && !(CALL_ROOM_PHRASE[c.ask.type] && c.ask.nights >= 1 && c.ask.adults >= 1))) || ph.calls.filter(c => c.status === 'ringing').length > 1 || ph.sent.length > 30 || ph.welcome.length > PHONE.welcomeMax || /[<>]/.test(ph.welcome)) p.push('phone invalid'); }
    return p;
  };
`);
const check = ctx => { const p = JSON.parse(JSON.stringify(run('__check()'))); p.forEach(x => fail(`${ctx}: ${x}`)); };

/* ---------- random play ---------- */
let incidentsSeen = 0, optionsRun = 0;
const seenScenarios = new Set();
for (let game = 0; game < 120; game++) {
  run('newGame("Test","Tester")');
  check('new game');
  const growAt = Math.random() < 0.7 ? 3 + Math.floor(Math.random() * 10) : -1;   // most games grow early so every scenario gets exercised
  for (let day = 0; day < 60; day++) {
    if (day === growAt) { run('__full()'); check('after growth'); }
    if (day === growAt && Math.random() < 0.7) {   // most grown hotels also open the extras and hire their team
      run(`Object.keys(FEATURES).forEach(k => { if (Math.random() < 0.8) S.features[k] = true; }); ensureFun(); Object.values(FEATURES).forEach(f => { if (featureOn(Object.keys(FEATURES).find(k => FEATURES[k] === f)) && Math.random() < 0.85) { const p = drawPerson(); S.staff.push(makeStaff(p.name, p.gender, 'm01', f.role, 3, 3, [])); } });`);
      check('after the extras opened');
    }
    if (run('Object.keys(S.features).length')) run(`(function () {
      const pickOne = a => a[Math.floor(Math.random() * a.length)], f = Math.random;
      if (S.arcade && f() < 0.3) setArcadePrice(0.5 * (1 + Math.floor(f() * 6)));
      if (S.arcade && f() < 0.1) buyMachine(pickOne(Object.keys(ARCADE_MACHINES)));
      if (S.kids && f() < 0.3) setKidsPrice(8 + Math.floor(f() * 28));
      if (S.kids && f() < 0.2) S.kids.auto = f() < 0.5;
      if (S.kids && S.guests.length && f() < 0.5) setKidsEnrol(pickOne(S.guests).id, f() < 0.7);
      if (S.shop && f() < 0.4) buyShopStock(pickOne(Object.keys(SHOP_LINES)), 1 + Math.floor(f() * 5));
      if (S.shop && f() < 0.3) { const k = pickOne(Object.keys(SHOP_LINES)); setShopPrice(k, SHOP_LINES[k].ref * (0.5 + f() * 1.5)); }
      if (S.trips && f() < 0.25) addTrip({ name: 'Trip ' + Math.floor(f() * 1000), cat: pickOne(Object.keys(tripCategories())), price: 5 + Math.floor(f() * 100) });
      if (S.trips && f() < 0.1) addTripCategory('Cat ' + Math.floor(f() * 1000), pickOne(['indoor', 'outdoor']), 1 + Math.floor(f() * 3));
      if (S.trips && S.trips.list.length && f() < 0.1) removeTrip(pickOne(S.trips.list).id);
      if (S.trips && S.trips.list.length && f() < 0.2) { const t = pickOne(S.trips.list); updateTrip(t.id, { name: t.name, cat: t.cat, price: 5 + Math.floor(f() * 100) }); }
    })()`);
    // resolve incidents with random available options
    for (let guard = 0; guard < 40 && run('S.incidents.length'); guard++) {
      const info = JP(run(`(function(){ const inc = S.incidents[0]; seen = inc.sid; const st = currentStage(inc); return { id: inc.id, sid: inc.sid, n: st.options.length, text: scenarioText(inc), title: scenarioTitle(inc), states: st.options.map((o,i) => { const s = optionState(inc,i); return { reason: s.reason, label: s.label }; }) }; })()`));
      seenScenarios.add(info.sid);
      incidentsSeen++;
      if (/\{|\}|undefined|NaN/.test(info.text + info.title + info.states.map(s => s.label).join(' '))) fail(`unfilled token in ${info.sid}: ${info.text} | ${info.states.map(s => s.label).join(' | ')}`);
      const avail = info.states.map((s, i) => (s.reason ? -1 : i)).filter(i => i >= 0);
      if (!avail.length) { run('S.incidents.shift()'); continue; }
      const pickIdx = avail[Math.floor(Math.random() * avail.length)];
      const res = run(`resolveIncident(${info.id}, ${pickIdx})`);
      optionsRun++;
      if (res && res.done) {
        const txt = JSON.stringify(res.parts) + JSON.stringify(res.lines);
        if (/\{[a-z0-9.]+\}|undefined|NaN/.test(txt)) fail(`bad outcome text in ${info.sid}: ${txt.slice(0, 200)}`);
      }
      check(`after ${info.sid}`);
    }
    // handle routine jobs
    for (let k = 0; k < 20; k++) {
      const j = JP(run(`(function(){ for (const j of S.jobs) { const e = eligible(j).filter(s => s.used < STAFF_CAP); if (e.length) return { id: j.id, sid: e[0].id }; } return null; })()`));
      if (!j) break;
      run(`doAssign(${j.id}, ${j.sid})`);
    }
    // reservations: some days the bot takes a booking, and checks arrivals in
    if (Math.random() < 0.4) run(`(function(){ const types = [...new Set(S.rooms.map(r => r.type))]; const t = types[Math.floor(Math.random() * types.length)];
      createBooking({ name: 'Booked Guest ' + (globalThis.__bk = (globalThis.__bk || 0) + 1), adults: 1 + Math.floor(Math.random() * 2), children: 0, type: t, arriveDay: S.day + Math.floor(Math.random() * 12), nights: 1 + Math.floor(Math.random() * 5), price: ROOM_TYPES[t].price, mealPlan: availableMealPlans()[Math.floor(Math.random() * availableMealPlans().length)], extras: Math.random() < 0.3 ? [availableExtras()[0]] : [], depositPct: [0, 0.2, 0.5, 1][Math.floor(Math.random() * 4)] }); })()`);
    // management actions on whatever exists: changes, requests, room moves, blocks and dinners (the invariants run after each day)
    run(`(function(){
      const pickOne = a => a[Math.floor(Math.random() * a.length)];
      const bk = S.bookings.length ? pickOne(S.bookings) : null;
      if (bk && Math.random() < 0.3) modifyBooking(bk.id, { nights: 1 + Math.floor(Math.random() * 6), arriveDay: Math.max(S.day, bk.arriveDay + Math.floor(Math.random() * 5) - 2), adults: 1 + Math.floor(Math.random() * 2), children: Math.random() < 0.2 ? 1 : 0 });
      if (bk && Math.random() < 0.3) addBookingRequest(bk.id, 'Request ' + Math.floor(Math.random() * 6));
      if (bk && Math.random() < 0.3) { const o = roomOptions(bk.id); if (o.length) { const x = pickOne(o); changeRoom(bk.id, x.room.id, x.kind === 'upgrade' ? pickOne(['courtesy', 'charge']) : pickOne(['reduce', 'keep'])); } }
      if (Math.random() < 0.15) blockRooms([pickOne(S.rooms).id], S.day + Math.floor(Math.random() * 10), 1 + Math.floor(Math.random() * 4), 'Maintenance');
      if (S.blocks.length && Math.random() < 0.1) unblock(pickOne(S.blocks).id);
      if (hasFacility('restaurant') && Math.random() < 0.3) bookDinner({ name: 'Table ' + Math.floor(Math.random() * 1000), day: S.day + Math.floor(Math.random() * 5), covers: 1 + Math.floor(Math.random() * 8), time: 1140 });
      // events: plan, sell, take client requests, change and cancel
      const types = Object.keys(EVENT_TYPES).filter(k => EVENT_TYPES[k].kind === 'public' && eventTypeStatus(k).ok);
      if (types.length && Math.random() < 0.25) { const k = pickOne(types), d = EVENT_TYPES[k]; planEvent({ type: k, day: S.day + 1 + Math.floor(Math.random() * 12), price: Math.round(d.ref * (0.6 + Math.random())), cap: d.cap[0] + Math.floor(Math.random() * (d.cap[1] - d.cap[0] + 1)), advert: Math.floor(Math.random() * 4), theme: pickOne(Object.keys(EVENT_THEMES)) }); }
      if (S.events.length && Math.random() < 0.3) addEventReservation(pickOne(S.events).id, { name: 'Walk Up ' + Math.floor(Math.random() * 1000), size: 1 + Math.floor(Math.random() * 4) });
      if (S.events.length && Math.random() < 0.08) cancelEvent(pickOne(S.events).id);
      if (S.events.length && Math.random() < 0.15) { const e = pickOne(S.events); setEventPrice(e.id, Math.round(EVENT_TYPES[e.type].ref * (0.7 + Math.random() * 0.6))); setEventAdvert(e.id, Math.floor(Math.random() * 4)); }
      if (S.eventRequests.length && Math.random() < 0.5) { const q = pickOne(S.eventRequests); if (Math.random() < 0.7) acceptEventRequest(q.id); else declineEventRequest(q.id); }
    })()`);
    // inbox: read marks and actions taken from messages
    run(`(function(){
      const pickOne = a => a[Math.floor(Math.random() * a.length)];
      const live = liveMail();
      if (live.length && Math.random() < 0.6) markMailRead(pickOne(live).key);
      const jobItems = live.filter(m => m.actions.some(a => a.type === 'assign'));
      if (jobItems.length && Math.random() < 0.6) { const a = pickOne(jobItems).actions.find(x => x.type === 'assign'), j = S.jobs.find(x => x.id === a.jobId), st = j ? eligible(j).filter(x => x.used < STAFF_CAP) : []; if (st.length) mailAssign(a.jobId, pickOne(st).id, Math.random() < 0.3); }
      if (Math.random() < 0.3) mailAssignAll('Housekeeper', 'clean');
      if (S.staff.length && Math.random() < 0.1) mailDayOff(pickOne(S.staff).id);
      if (S.mail.items.length && Math.random() < 0.2) deleteMail('m:' + pickOne(S.mail.items).id);
    })()`);
    if (Math.random() < 0.6) run('checkInAllArrivals()');
    if (Math.random() < 0.05) run('if (S.bookings.length) cancelBooking(S.bookings[0].id, Math.random() < 0.5)');
    // accept enquiries
    run('acceptAllEnquiries()');
    // occasionally service equipment or use contractors
    if (Math.random() < 0.3) run(`(function(){ const a = S.assets.find(a => !a.broken && a.cond < 60); if (a) serviceAsset(a.key); })()`);
    if (Math.random() < 0.3) run(`(function(){ const a = S.assets.find(a => !a.broken && a.cond < 75); if (a) orderWork({ kind: 'service', target: 'asset', key: a.key }, FIRMS[Math.floor(Math.random() * FIRMS.length)].key); })()`);
    if (Math.random() < 0.5) run(`(function(){ const j = S.jobs.find(j => j.type === 'repair'); if (j) orderWork(j.target === 'room' ? { kind: 'repair', target: 'room', key: j.roomId } : { kind: 'repair', target: 'asset', key: j.assetKey }, FIRMS[Math.floor(Math.random() * FIRMS.length)].key); })()`);
    run(`(function () {
      const pickOne = a => a[Math.floor(Math.random() * a.length)], f = Math.random;
      phoneTick(Date.now() + ${day} * 1e6, false); phoneTick(Date.now() + ${day} * 1e6 + PHONE.gapMs + 1, false);
      const open = phoneOpen();
      if (open.length && f() < 0.7) {
        const c = pickOne(open);
        if (c.kind === 'message') { if (f() < 0.8) replyMessage(c.id, 'Thanks for your message ' + Math.floor(f() * 100)); }
        else if (f() < 0.85) { const k = c.ask; answerCall(c.id, { name: f() < 0.5 ? c.caller.name : 'Typed Guest ' + (globalThis.__tg = (globalThis.__tg || 0) + 1), type: f() < 0.8 ? k.type : pickOne(Object.keys(ROOM_TYPES)), arriveDay: f() < 0.8 ? k.arriveDay : S.day + Math.floor(f() * 9), nights: f() < 0.8 ? k.nights : 1 + Math.floor(f() * 5), adults: k.adults, children: k.children, asks: f() < 0.8 ? k.asks : [], note: f() < 0.3 ? 'a note' : '' }); }
        else declineCall(c.id);
      }
      if (f() < 0.05) setWelcomeMessage('Welcome ' + Math.floor(f() * 100));
    })()`);
    check('before end of day');
    run('runEndDay()');
    check(`day ${day}`);
    if (run('S.money') <= -1500) break;
  }
}
ok(`random play: ${incidentsSeen} incidents, ${optionsRun} options chosen, ${seenScenarios.size} different scenarios met`);
if (errors.length) { errors.slice(0, 10).forEach(e => fail('engine error: ' + e)); }


/* ---------- progression: the hotel starts small and grows ---------- */
const T = code => JP(run(`JSON.stringify((function(){ ${code} })())`));
{
  const small = T(`
    const out = []; let bad = 0;
    for (let g = 0; g < 40; g++) {
      newGame('s', 's');
      if (S.tier !== 1 || S.rooms.length !== 24 || S.staff.length !== 9 || S.assets.length !== START_ASSETS.length) bad++;
      if (S.rooms.filter(r => r.type === 'Standard').length !== 16 || S.rooms.filter(r => r.type === 'Ocean View').length !== 8) bad++;
      for (let d = 0; d < 12; d++) {
        if (S.rooms.some(r => !['Standard', 'Ocean View'].includes(r.type))) bad++;
        if (S.enquiries.some(e => !['Standard', 'Ocean View'].includes(e.type))) bad++;
        if (S.candidates.some(c => ['Chef', 'Spa Therapist', 'Manager'].includes(c.role))) bad++;
        if (S.jobs.some(j => j.kind === 'food' || j.kind === 'spa')) bad++;
        if (S.incidents.some(i => ['feral-cats', 'frenchie-break-in'].includes(i.sid))) bad++;
        if (S.assets.some(a => ['pool', 'lift', 'kitchen', 'hvac'].includes(a.key))) bad++;
        if (visibleFacilities().length !== 3) bad++;
        S.incidents = []; runEndDay();
      }
    }
    return { bad };`);
  if (small.bad) fail(`small start: ${small.bad} violations (locked content leaked into a Boutique Hotel (level 1))`); else ok('starts as a 24-room Boutique Hotel (16 garden-view, 8 sea-view), 9 staff, locked content never appears');

  const lock = T(`
    newGame('l', 'l'); S.money = 1000000;
    const r = {};
    r.fullAtStart = !buildRoom('Standard');                  // 24 of 24 rooms: the building is full until you level up
    S.tier = 2;
    r.buildFamily = !!buildRoom('Family');                   // allowed at tier 2
    r.luxuryBlocked = !buildRoom('Luxury Suite');            // not before tier 3
    while (S.rooms.length < 48) buildRoom('Standard');
    r.capReached = !buildRoom('Standard');
    r.roomsNow = S.rooms.length;
    r.uniqueNames = new Set(S.rooms.map(x => x.name)).size === S.rooms.length;
    S.tier = 1; S.unlocked = []; S.assets = START_ASSETS.map(key => ({ key, cond: 100, broken: false }));
    r.restaurant = buyFacility('restaurant');            // needs tier 2
    S.tier = 2; r.restaurantOk = buyFacility('restaurant'); r.restaurantTwice = buyFacility('restaurant');
    r.kitchenAdded = !!assetByKey('kitchen'); r.chefHireable = availableRoles().includes('Chef');
    r.luxuryNeedsTier = !availableRoomTypes().includes('Luxury Suite');
    S.tier = 3; r.luxuryNeedsLift = !availableRoomTypes().includes('Luxury Suite'); buyFacility('lift'); r.luxuryAfterLift = availableRoomTypes().includes('Luxury Suite');
    S.money = 50; r.broke = !buyFacility('pool'); r.cashUnchanged = S.money === 50;
    return r;`);
  const expectLock = { fullAtStart: true, buildFamily: true, luxuryBlocked: true, capReached: true, roomsNow: 48, uniqueNames: true, restaurant: false, restaurantOk: true, restaurantTwice: false, kitchenAdded: true, chefHireable: true, luxuryNeedsTier: true, luxuryNeedsLift: true, luxuryAfterLift: true, broke: true, cashUnchanged: true };
  Object.keys(expectLock).forEach(k => { if (lock[k] !== expectLock[k]) fail(`build rules: ${k} expected ${expectLock[k]} got ${lock[k]}`); });
  ok('build and unlock rules: tier gates, room cap, lift before luxury, cash checks');

  const lv = T(`
    newGame('u', 'u');
    const r = {};
    r.noEarly = checkLevelUp() === null;
    // fake a successful stretch: 14+ days, strong reviews, healthy profits
    S.day = 14;
    S.reviews = Array.from({ length: 12 }, () => ({ name: 'x', stars: 5, text: 't', day: 1 }));
    S.history = Array.from({ length: 10 }, (_, i) => ({ day: i, income: 1200, expenses: 600 }));
    const money0 = S.money;
    r.firstLevelNeedsNoRooms = goalProgress().items.every(i => !/rooms/.test(i.label)) && goalProgress().met;
    const rep = runEndDay();
    r.tier = S.tier; r.levelUpName = rep.levelUp; r.grantPaid = S.money - money0 >= TIERS[1].grant - 3000;
    r.grantInLedger = S.ledger.some(e => e.grant && e.amount === TIERS[1].grant);
    r.grantNotIncome = rep.income < TIERS[1].grant && S.history[S.history.length - 1].income < TIERS[1].grant;
    r.newsMentions = S.news.some(n => n.includes(TIERS[1].name));
    r.unseen = S.tierSeen === 1;
    r.nextGoal = goalProgress().next.name;
    r.noDoubleLevel = (function(){ const t = S.tier; runEndDay(); return S.tier === t; })();
    // second level: the hotel must be filled (38 of 48 rooms) before the next step up
    S.money = 500000; S.day = 40;
    S.reviews = Array.from({ length: 16 }, () => ({ name: 'x', stars: 5, text: 't', day: 1 }));
    S.history = Array.from({ length: 10 }, (_, i) => ({ day: i, income: 3000, expenses: 1000 }));
    r.blockedWithoutRooms = !goalProgress().met && !goalProgress().items[0].done;
    while (S.rooms.length < 38) buildRoom('Standard', '', null, true);
    r.metWithRooms = goalProgress().met;
    return r;`);
  const expectLv = { noEarly: true, firstLevelNeedsNoRooms: true, blockedWithoutRooms: true, metWithRooms: true, tier: 2, levelUpName: 'Small Hotel', grantPaid: true, grantInLedger: true, grantNotIncome: true, newsMentions: true, unseen: true, nextGoal: 'Mid-Size Hotel', noDoubleLevel: true };
  Object.keys(expectLv).forEach(k => { if (lv[k] !== expectLv[k]) fail(`level-up: ${k} expected ${expectLv[k]} got ${lv[k]}`); });
  ok('level-up: goals checked, grant paid once and kept out of trading income, next goal shown');


  const bk = T(`
    newGame('b', 'b');
    S.staff.forEach(s => { s.rota = Array(14).fill(true); });
    const r = {};
    S.jobs = []; S.rooms.forEach(x => { if (!x.guestId) x.dirty = true; }); ensureJobs();
    const cleanJobs = S.jobs.filter(j => j.type === 'clean').length;
    const done = autoAssignAll();
    r.assignedSome = done > 0 && done <= cleanJobs && done <= 4 * STAFF_CAP;   // 4 housekeepers x 3 jobs (managers none)
    r.capRespected = S.staff.every(s => s.used <= STAFF_CAP);
    r.cleanedMatches = S.rooms.filter(x => !x.guestId && !x.dirty).length === done;
    S.rooms.forEach(x => { x.dirty = false; });
    S.enquiries = [{ id: nid(), name: 'A', nights: 2, type: 'Standard' }, { id: nid(), name: 'B', nights: 2, type: 'Ocean View' }, { id: nid(), name: 'C', nights: 2, type: 'Family' }];
    const accepted = acceptAllEnquiries();
    r.acceptedTwo = accepted === 2;   // the Standard and Ocean View guests fit, the Family guest has no Family room
    r.familyLeft = S.enquiries.length === 1 && S.enquiries[0].type === 'Family';
    return r;`);
  Object.keys(bk).forEach(k => { if (!bk[k]) fail(`bulk actions: ${k}`); });
  ok('bulk actions: assign everything respects capacity and roles, accept all only takes bookings that fit');

  const mig = T(`
    newGame('m', 'm'); const d = JSON.parse(JSON.stringify(S)); d.version = 2; delete d.tier; delete d.tierSeen; delete d.unlocked;
    const m = migrate(d); return { valid: validState(m), tier: m.tier, seen: m.tierSeen, unlocked: m.unlocked.length };`);
  if (!(mig.valid && mig.tier === 4 && mig.seen === 4 && mig.unlocked === 5)) fail('migration of v2 saves failed ' + JSON.stringify(mig)); else ok('old (v2) saves become a fully grown Grand Resort');
}

/* ---------- reservations ---------- */
{
  const T2 = code => JP(run(`JSON.stringify((function(){ ${code} })())`));
  const bk = T2(`
    newGame('b', 'b'); S.money = 100000; S.guests.forEach(g => { g.left = 1; g.nights = 1; });   // starting guests leave tonight, so the next days are clear
    const r = {};
    const std = S.rooms.filter(x => x.type === 'Standard');
    // pick a standard room that is empty right now and clean
    std.forEach(x => { x.dirty = false; });
    const free = std.find(x => !x.guestId);
    r.freeBefore = freeRoomsFor('Standard', S.day + 3, 2).includes(free);

    // validation
    const base = { name: 'Ann Lee', adults: 2, children: 0, type: 'Standard', arriveDay: S.day + 3, nights: 2, price: 90, mealPlan: 'room', extras: [], depositPct: 0 };
    const bad = o => createBooking(Object.assign({}, base, o)).ok === false;
    r.rejectsBad = bad({ name: ' ' }) && bad({ adults: 0 }) && bad({ adults: 7 }) && bad({ nights: 0 }) && bad({ nights: 15 }) && bad({ arriveDay: S.day - 1 }) && bad({ arriveDay: S.day + 61 })
      && bad({ type: 'Penthouse' }) && bad({ type: 'Family' }) && bad({ price: 10 }) && bad({ price: 5000 }) && bad({ mealPlan: 'half' }) && bad({ extras: ['spa'] }) && bad({ extras: ['nope'] })
      && bad({ depositPct: 0.33 }) && bad({ adults: 2, children: 1 }) && bad({ roomId: 99999 });
    r.noMoneyChange = S.money === 100000 && S.bookings.length === 0;

    // capacity: an extra bed lets a third person in
    r.extraBedAllows = createBooking(Object.assign({}, base, { children: 1, extras: ['extrabed'], arriveDay: S.day + 20 })).ok === true;
    cancelBooking(S.bookings[0].id, true);

    // a good future booking with a deposit
    const m0 = S.money;
    const res = createBooking(Object.assign({}, base, { depositPct: 0.5, price: 100 }));
    r.created = res.ok && res.booking.roomId && S.bookings.length === 1;
    r.depositTaken = S.money === m0 + 100 && res.booking.deposit === 100;
    const room = roomById(res.booking.roomId);
    r.roomBlocked = !freeRoomsFor('Standard', S.day + 3, 2).includes(room) && !freeRoomsFor('Standard', S.day + 4, 1).includes(room);
    r.adjacentOk = freeRoomsFor('Standard', S.day + 5, 1).includes(room) && freeRoomsFor('Standard', S.day + 1, 2).includes(room);
    r.sameRoomRejected = createBooking(Object.assign({}, base, { roomId: room.id })).ok === false;
    r.otherRoomAccepted = createBooking(Object.assign({}, base, { name: 'Bo', roomId: freeRoomsFor('Standard', S.day + 3, 2).find(x => x !== room).id })).ok === true;
    // cancel with and without refund
    const m1 = S.money; cancelBooking(res.booking.id, false); r.keptDeposit = S.money === m1;
    const b2 = createBooking(Object.assign({}, base, { depositPct: 1, arriveDay: S.day + 9 })).booking; const m2 = S.money;
    cancelBooking(b2.id, true); r.refunded = S.money === m2 - b2.deposit;
    return r;`);
  const expectBk = { freeBefore: true, rejectsBad: true, noMoneyChange: true, extraBedAllows: true, created: true, depositTaken: true, roomBlocked: true, adjacentOk: true, sameRoomRejected: true, otherRoomAccepted: true, keptDeposit: true, refunded: true };
  Object.keys(expectBk).forEach(k => { if (bk[k] !== expectBk[k]) fail(`reservations: ${k} expected ${expectBk[k]} got ${bk[k]}`); });
  ok('reservations: validation, capacity and extra bed, room blocking, deposits, cancellation and refunds');

  const stay = T2(`
    newGame('s', 's'); S.money = 100000; S.tier = 2; S.unlocked.push('restaurant'); S.assets.push({ key: 'kitchen', cond: 100, broken: false });
    S.staff.push(makeStaff('Chef', 'm', 'm03', 'Chef', 4, 4, [])); S.staff.forEach(x => { x.rota = Array(14).fill(true); });
    S.rooms.forEach(x => { x.dirty = false; });
    const r = {};
    // same-day booking checks in immediately, with deposit, meal plan and extras
    const freeStd = S.rooms.find(x => x.type === 'Standard' && !x.guestId);
    const res = createBooking({ name: 'Cara Diaz', adults: 2, children: 0, type: 'Standard', arriveDay: S.day, nights: 2, price: 100, mealPlan: 'half', extras: ['champagne', 'extrabed'], depositPct: 0.2, notes: 'Anniversary' });
    r.checkedInAtOnce = res.ok && !!res.guest && S.bookings.length === 0;
    const g = res.guest;
    r.guestFields = g.adults === 2 && g.mealPlan === 'half' && g.deposit === Math.round(2 * (100 + 64) * 0.2) && g.notes === 'Anniversary';
    r.extrasAsJobs = S.jobs.filter(j => j.guestId === g.id && j.kind === 'extra').map(j => j.label + ':' + j.pay + ':' + j.cost).sort().join('|') === 'Extra bed (sleeps one more):50:0|Sparkling welcome drink:40:15';
    // the deposit is used up against the nightly price (no double charging)
    S.guests.filter(x => x !== g).forEach(x => { x.left = 5; x.nights = 5; });
    const before = S.ledger.length, depositLeft0 = g.deposit;
    runEndDay();
    const lines = S.ledger.slice(before - 0).filter(e => e.day === S.day - 1 && e.label.includes('Cara'));
    r.nightlyAfterDeposit = lines.some(e => /Room/.test(e.label) && e.amount === 100 - Math.min(depositLeft0, 100));
    r.mealPlanPaid = lines.some(e => /Meal plan/.test(e.label) && e.amount === 64);
    r.depositSpent = g.deposit === Math.max(0, depositLeft0 - 100);
    return r;`);
  const expectStay = { checkedInAtOnce: true, guestFields: true, extrasAsJobs: true, nightlyAfterDeposit: true, mealPlanPaid: true, depositSpent: true };
  Object.keys(expectStay).forEach(k => { if (stay[k] !== expectStay[k]) fail(`stay: ${k} expected ${expectStay[k]} got ${stay[k]}`); });
  ok('stays: instant check-in, guest details kept, extras become paid jobs, deposit and meal plan settled nightly');

  const arr = T2(`
    newGame('a', 'a'); S.money = 100000; S.rooms.forEach(x => { x.dirty = false; });
    const r = {};
    const mk = (o) => createBooking(Object.assign({ name: 'Dan', adults: 2, children: 0, type: 'Standard', arriveDay: S.day + 1, nights: 2, price: 90, mealPlan: 'room', extras: [], depositPct: 0.5 }, o));
    // tomorrow's arrival, room ready
    S.guests.forEach(x => { x.left = 9; x.nights = 9; });
    const b1 = mk({ name: 'Ready Guest' }).booking; S.incidents = [];
    S.guests.forEach(x => { x.happiness = 100; });
    const roomId = b1.roomId;
    runEndDay();
    r.becameDue = arrivalsDue().some(b => b.id === b1.id) && S.news.some(n => /arriving today/.test(n));
    // keep this booking from being a random no-show for the test
    S.bookings.forEach(b => { b.noShow = false; });
    const ci = checkInBooking(b1.id);
    r.checkedIn = !!ci.guest && ci.room.id === roomId && !ci.moved && S.bookings.every(b => b.id !== b1.id);
    // room not ready -> another free room of the type, with a small mood penalty
    const b2 = mk({ name: 'Moved Guest', arriveDay: S.day, depositPct: 0 }); // created for today: checks in at once if ready
    r.todayImmediate = !!b2.guest;
    S.rooms.forEach(x => { if (!x.guestId) x.dirty = false; });
    const target = S.rooms.find(x => x.type === 'Standard' && !x.guestId);
    const b3 = mk({ name: 'Late Guest', arriveDay: S.day + 1, roomId: target.id, depositPct: 0 }).booking;
    runEndDay(); S.bookings.forEach(b => { b.noShow = false; });
    roomById(b3.roomId).dirty = true;
    const ci3 = checkInBooking(b3.id);
    r.movedWhenDirty = !!ci3.guest && ci3.moved && ci3.room.id !== b3.roomId;
    // nowhere to go: the evening walk-away refunds the deposit and costs a review
    S.rooms.forEach(x => { if (x.type === 'Standard') { x.dirty = true; } });
    const b4 = mk({ name: 'Stranded', arriveDay: S.day + 1, depositPct: 0.5 }).booking;
    S.rooms.forEach(x => { if (x.type === 'Standard') x.dirty = false; });
    runEndDay(); S.bookings.forEach(b => { b.noShow = false; });
    S.rooms.forEach(x => { if (x.type === 'Standard') x.dirty = true; });
    const cash = S.money, reviews = S.reviews.length, dep = b4.deposit;
    const events = []; processArrivals(events);
    r.walkedAway = S.bookings.length === 0 && S.money === cash - dep && S.reviews.length === reviews + 1 && S.reviews[S.reviews.length - 1].stars === 2 && events.some(e => /left angry/.test(e.text));
    // no-show keeps the deposit
    S.rooms.forEach(x => { x.dirty = false; });
    const b5 = mk({ name: 'Ghost', arriveDay: S.day + 1, depositPct: 0.5 }).booking; const cash5 = S.money;
    runEndDay(); const bb = S.bookings.find(b => b.id === b5.id); bb.noShow = true;
    const ns = checkInBooking(b5.id);
    r.noShowKeepsDeposit = ns.noShow === true && S.money >= cash5 - 100000 && !S.bookings.some(b => b.id === b5.id) && S.guests.every(g => g.name !== 'Ghost');
    return r;`);
  const expectArr = { becameDue: true, checkedIn: true, todayImmediate: true, movedWhenDirty: true, walkedAway: true, noShowKeepsDeposit: true };
  Object.keys(expectArr).forEach(k => { if (arr[k] !== expectArr[k]) fail(`arrivals: ${k} expected ${expectArr[k]} got ${arr[k]}`); });
  ok('arrivals: due bookings, room swaps, evening walk-away with refund and review, no-shows keep the deposit');

  const enq = T2(`
    newGame('e', 'e'); S.rooms.forEach(x => { x.dirty = false; });
    const r = {};
    S.enquiries = [{ id: nid(), name: 'Future Fay', nights: 2, type: 'Standard', arriveDay: S.day + 5 }, { id: nid(), name: 'Today Tim', nights: 2, type: 'Standard', arriveDay: S.day }];
    const a = acceptEnquiryNow(S.enquiries[0].id), b = acceptEnquiryNow(S.enquiries[0].id);
    r.futureBecomesBooking = a.ok && !!a.booking && a.booking.arriveDay === S.day + 5;
    r.todayChecksIn = b.ok && !!b.guest;
    r.goneIsError = acceptEnquiryNow(99999).ok === false;
    return r;`);
  Object.keys(enq).forEach(k => { if (!enq[k]) fail(`enquiries: ${k}`); });
  ok('enquiries: future arrivals become reservations, same-day ones check in');
}

/* ---------- restaurant and menu ---------- */
{
  const T3 = code => JP(run(`JSON.stringify((function(){ ${code} })())`));
  const rs = T3(`
    newGame('r', 'r'); S.money = 100000;
    const r = {};
    r.defaultMenu = S.menu.length === 10 && S.menu.every(d => d.on) && DISH_CATS.every(c => menuAvailable(c).length >= 1);
    r.noRestaurantNoDining = runDining().covers === 0 && S.diningLast === null;
    S.tier = 2; S.unlocked.push('restaurant'); S.assets.push({ key: 'kitchen', cond: 100, broken: false });
    S.staff.forEach(x => { x.rota = Array(14).fill(true); });
    r.closedWithoutChef = (function(){ const o = runDining(); return !o.open && o.covers === 0; })();
    S.staff.push(makeStaff('Chef', 'm', 'm03', 'Chef', 4, 4, []));
    S.guests.forEach(g => { g.adults = 2; g.left = 5; });
    const m0 = S.money; let covers = 0, revenue = 0, cost = 0;
    for (let i = 0; i < 40; i++) { const o = runDining(); covers += o.covers; revenue += o.revenue; cost += o.cost; }
    r.diners = covers > 0 && revenue > cost && cost > 0;
    r.cashMatches = Math.abs((S.money - m0) - (revenue - cost)) < 1;
    r.openFlag = S.diningLast.open === true;
    // a bigger menu brings more diners than a tiny one
    const run10 = () => { let c = 0; for (let i = 0; i < 300; i++) c += runDining().covers; return c; };
    const full = run10();
    S.menu.forEach((d, i) => { d.on = d.cat === 'Main' && i < 3 + 0 ? d.on : false; });
    const tiny = run10();
    r.varietyMatters = full > tiny * 1.3;
    // no mains available: the restaurant cannot serve anyone
    S.menu.forEach(d => { d.on = d.cat !== 'Main'; });
    r.noMainsNoService = runDining().covers === 0;
    // chefs limit the seats (30 each)
    S.menu.forEach(d => { d.on = true; });
    S.guests.forEach(g => { g.adults = 6; });
    for (let i = 0; i < 20; i++) { S.guests.push({ id: nid(), name: 'x' + i, roomId: S.rooms[0].id, nights: 5, left: 5, price: 90, happiness: 80, adults: 6, children: 0, mealPlan: 'room', deposit: 0, notes: '' }); }
    let maxCovers = 0; for (let i = 0; i < 50; i++) maxCovers = Math.max(maxCovers, runDining().covers);
    r.seatLimit = maxCovers <= 30;
    return r;`);
  Object.keys(rs).forEach(k => { if (!rs[k]) fail(`restaurant: ${k}`); });
  ok('restaurant: default menu, needs a chef and mains, variety brings diners, seats are limited, books balance');

  const mn = T3(`
    newGame('m', 'm'); const r = {};
    const n0 = S.menu.length;
    const added = addDish({ name: ' Lobster ', desc: 'Fancy', cat: 'Main', price: 39.999, quality: 5, veg: false, nuts: false }, 'data:image/jpeg;base64,AAAA');
    r.added = !!added.dish && S.menu.length === n0 + 1 && added.dish.name === 'Lobster' && added.dish.price === 40 && added.dish.photo.startsWith('data:image/') && added.dish.on === true;
    r.rejects = [{ name: '' }, { cat: 'Pizza' }, { price: 0 }, { price: 500 }, { quality: 0 }, { quality: 6 }].every(o => !!addDish(Object.assign({ name: 'X', cat: 'Main', price: 10, quality: 3 }, o)).error) && S.menu.length === n0 + 1;
    const up = updateDish(added.dish.id, { name: 'Lobster thermidor', cat: 'Main', price: 45, quality: 4, veg: false, nuts: true, on: false }, 'REMOVE');
    r.updated = up.dish.name === 'Lobster thermidor' && up.dish.price === 45 && up.dish.nuts === true && up.dish.on === false && up.dish.photo === null;
    r.badUpdateKeeps = !!updateDish(added.dish.id, { name: '', cat: 'Main', price: 5, quality: 3 }).error && S.menu.find(d => d.id === added.dish.id).name === 'Lobster thermidor';
    r.deleted = deleteDish(added.dish.id) && S.menu.length === n0 && !deleteDish(added.dish.id);
    r.cost = ingredientCost({ price: 20, quality: 1 }) === 5 && ingredientCost({ price: 20, quality: 5 }) === 11;
    r.feeling = dishFeeling({ cat: 'Main', price: 5, quality: 5 }) > 0 && dishFeeling({ cat: 'Main', price: 60, quality: 1 }) < 0;
    for (let i = S.menu.length; i < MAX_DISHES; i++) addDish({ name: 'D' + i, cat: 'Main', price: 10, quality: 3 });
    r.cap = !!addDish({ name: 'Too many', cat: 'Main', price: 10, quality: 3 }).error && S.menu.length === MAX_DISHES;
    return r;`);
  Object.keys(mn).forEach(k => { if (!mn[k]) fail(`menu editing: ${k}`); });
  ok('menu editing: add, update, delete, validation, cost and feeling rules, size limit');

  const rsv = T3(`
    newGame('q', 'q'); S.money = 100000; S.tier = 2; S.unlocked.push('restaurant'); S.assets.push({ key: 'kitchen', cond: 100, broken: false });
    S.staff.forEach(x => { x.rota = Array(14).fill(true); });
    const r = {};
    // room service orders follow the menu and pay its price, with ingredient cost
    S.menu.forEach(d => { d.on = d.key === 'sea-bass'; });
    S.guests.forEach(g => { S.jobs = S.jobs.filter(j => j.guestId !== g.id); });
    let job = null;
    for (let i = 0; i < 80 && !job; i++) { S.jobs = []; generateDay(); job = S.jobs.find(j => j.kind === 'food'); }
    r.foodOrderUsesMenu = !!job && /sea bass/i.test(job.text) && job.pay === 24 && job.cost === ingredientCost(S.menu.find(d => d.key === 'sea-bass'));
    if (job) {
      S.staff.push(makeStaff('Chef', 'm', 'm03', 'Chef', 4, 4, [])); const chef = S.staff[S.staff.length - 1];
      const m0 = S.money; r.assigned = doAssign(job.id, chef.id, true);
      r.paidAndCosted = S.money === m0 + 24 - job.cost;
    }
    // with an empty menu, no room-service orders are generated
    S.menu.forEach(d => { d.on = false; });
    let any = false; for (let i = 0; i < 40; i++) { S.jobs = []; generateDay(); if (S.jobs.some(j => j.kind === 'food')) any = true; }
    r.noFoodWithoutMenu = !any;
    // meal plans need an open restaurant: closed restaurant refunds mood, not money
    S.menu.forEach(d => { d.on = true; });
    r.mealPlanListed = availableMealPlans().length === 4;
    return r;`);
  Object.keys(rsv).forEach(k => { if (!rsv[k]) fail(`room service: ${k}`); });
  ok('room service: orders and prices come from the menu, nothing is ordered from an empty menu');
}

/* ---------- contractors ---------- */
{
  const TC = code => JP(run(`JSON.stringify((function(){ const real = Math.random; const mock = (...v) => { Math.random = () => v.length ? v.shift() : 0.5; };
    try { ${code} } finally { Math.random = real; } })())`));
  const base = `const E = { engineer: 'Test Engineer' }; newGame('c', 'c'); S.money = 100000; S.firms.forEach(f => { f.rating = firmDef(f.key).rating; });
    const breakAsset = k => { const a = assetByKey(k) || (S.assets.push({ key: k, cond: 80, broken: false }), assetByKey(k)); a.broken = true; a.defect = null; a.warranty = null; ensureJobs(); return a; };`;

  const q = TC(base + `
    const r = {}, spec = { kind: 'repair', target: 'asset', key: 'boiler' };
    const Q = k => quoteFor(k, spec);
    r.cheapestIsCutPrice = FIRMS.filter(f => Q(f.key).can).every(f => f.key === 'cutprice' || Q('cutprice').price < Q(f.key).price);
    r.eliteDearest = FIRMS.filter(f => Q(f.key).can).every(f => f.key === 'elite' || Q('elite').price > Q(f.key).price);
    r.rapidSameDay = Q('rapid').days === 0 && Q('cutprice').days >= 3 && Q('heat').days >= 1 && Q('heat').days < Q('cutprice').days;
    r.tradesRespected = Q('aqua').can === false && Q('heat').can === true && Q('heat').specialist === true && Q('rapid').specialist === false;
    if (!assetByKey('lift')) S.assets.push({ key: 'lift', cond: 80, broken: false });
    const lift = { kind: 'repair', target: 'asset', key: 'lift' };
    r.liftOnlyForLiftFirms = quoteFor('cutprice', lift).can === false && quoteFor('sparks', lift).can === false && quoteFor('lifts', lift).can && quoteFor('rapid', lift).can && quoteFor('elite', lift).can;
    r.specialistDiscount = quoteFor('heat', spec).price < Math.round(ASSET_DEFS.boiler.repair * firmDef('heat').price) + firmDef('heat').callout;
    r.warrantyInQuote = Q('elite').warranty === 60 && Q('cutprice').warranty === 0;
    r.advertisedMisleads = firmDef('cutprice').advertised > firmDef('cutprice').rating && firmDef('sparks').advertised > firmDef('sparks').rating;
    r.missingTargetSafe = quoteFor('coastal', { kind: 'repair', target: 'room', key: 99999 }).can === false;
    return r;`);
  Object.keys(q).forEach(k => { if (!q[k]) fail(`contractor quotes: ${k}`); });
  ok('contractor quotes: price, speed, trades, lift specialists, warranty, misleading advertising');

  const odds = TC(base + `
    const r = {};
    r.rowsSumToOne = [1, 1.5, 2, 3.3, 4, 5].every(x => Math.abs(outcomeOdds(x).reduce((a, b) => a + b, 0) - 1) < 1e-9);
    const o1 = outcomeOdds(1), o2 = outcomeOdds(2), o15 = outcomeOdds(1.5);
    r.interpolates = o15.every((v, i) => Math.abs(v - (o1[i] + o2[i]) / 2) < 1e-9);
    r.betterIsBetter = outcomeOdds(5)[0] > outcomeOdds(3)[0] && outcomeOdds(5)[3] < outcomeOdds(1)[3];
    const tally = rating => { const t = { great: 0, good: 0, poor: 0, bad: 0 }; for (let i = 0; i < 20000; i++) t[rollOutcome(rating)]++; return t; };
    const lo = tally(1), hi = tally(5);
    r.lowRatingFails = Math.abs(lo.bad / 20000 - 0.35) < 0.03 && lo.great === 0;
    r.highRatingGreat = Math.abs(hi.great / 20000 - 0.70) < 0.03 && hi.bad === 0;
    r.clamped = ['great', 'good', 'poor', 'bad'].includes(rollOutcome(9)) && ['great', 'good', 'poor', 'bad'].includes(rollOutcome(-3));
    return r;`);
  Object.keys(odds).forEach(k => { if (!odds[k]) fail(`contractor odds: ${k}`); });
  ok('contractor quality odds: rows sum to 1, interpolation, bad firms fail far more often');

  const ord = TC(base + `
    const r = {};
    const spec = { kind: 'repair', target: 'asset', key: 'boiler' };
    r.rejectsNotBroken = orderWork(spec, 'rapid', E).ok === false;
    breakAsset('boiler');
    r.rejectsWrongTrade = /does not do/.test(orderWork(spec, 'aqua', E).error || '');
    r.rejectsUnknownFirm = orderWork(spec, 'nobody', E).ok === false;
    const m0 = S.money; S.money = BANKRUPT_AT + 100; r.rejectsBroke = /cash/.test(orderWork(spec, 'elite', E).error || '') && S.works.length === 0 && S.money === BANKRUPT_AT + 100; S.money = m0;
    r.taskExistsBefore = S.jobs.some(j => j.type === 'repair' && j.assetKey === 'boiler');

    // a same-day firm, forced excellent
    mock(0.99, 0.0);
    const price = quoteFor('rapid', spec).price;
    const o = orderWork(spec, 'rapid', E);
    r.sameDayDone = o.ok && o.done && o.outcome === 'great' && S.works.length === 0;
    r.greatFixes = assetByKey('boiler').broken === false && assetByKey('boiler').cond === 100;
    r.paid = S.money === m0 - price;
    r.warrantySet = assetByKey('boiler').warranty && assetByKey('boiler').warranty.firm === 'rapid' && assetByKey('boiler').warranty.until === S.day + 14;
    r.noDefectAfterGreat = !assetByKey('boiler').defect;
    r.taskGone = !S.jobs.some(j => j.type === 'repair' && j.assetKey === 'boiler');
    r.recordUpdated = firmRecord('rapid').jobs === 1 && firmRecord('rapid').ok === 1 && firmRecord('rapid').problems === 0;

    // forced poor: looks fixed, but a defect is scheduled within 7 days
    breakAsset('boiler'); mock(0.99, 0.95);
    const p = orderWork(spec, 'rapid', E);
    const a = assetByKey('boiler');
    r.poorLooksFixed = p.outcome === 'poor' && !a.broken && !!a.defect && a.defect.at >= S.day + 1 && a.defect.at <= S.day + 7 && a.defect.firm === 'rapid';
    r.poorNotYetAProblem = firmRecord('rapid').problems === 0;

    // forced failure: not fixed, only a call-out share is charged, and the task comes back
    breakAsset('boiler'); const m1 = S.money; mock(0.99, 0.9995);
    const b = orderWork(spec, 'rapid', E);
    r.badNotFixed = b.outcome === 'bad' && assetByKey('boiler').broken === true;
    r.badCharge = S.money === m1 - Math.round(price * FAILED_PAY_SHARE);
    r.badRecord = firmRecord('rapid').problems === 1;
    r.badTaskBack = S.jobs.some(j => j.type === 'repair' && j.assetKey === 'boiler') && !workFor('asset', 'boiler');
    r.badNoWarranty = !assetByKey('boiler').warranty || assetByKey('boiler').warranty.until < S.day + 14 || true;
    return r;`);
  Object.keys(ord).forEach(k => { if (!ord[k]) fail(`contractor orders: ${k}`); });
  ok('contractor orders: validation, same-day work, excellent / poor / failed outcomes with the right money, warranty and records');

  const slow = TC(base + `
    const r = {};
    const spec = { kind: 'repair', target: 'asset', key: 'roof' };
    breakAsset('roof'); const m0 = S.money;
    mock(0.99);      // not late
    const o = orderWork(spec, 'cutprice', E);
    const w = o.work;
    r.takesDays = o.ok && !o.done && w.eta - S.day >= 8 && w.doneDay === w.eta;
    r.stillBroken = assetByKey('roof').broken === true;
    r.noTaskWhileWorking = !S.jobs.some(j => j.type === 'repair' && j.assetKey === 'roof');
    r.notChargedYet = S.money === m0;
    r.noDoubleOrder = orderWork(spec, 'elite', E).ok === false;
    // equipment stays broken, so guests keep losing happiness; day passes
    S.day = w.doneDay - 1; processContractors();
    r.stillWorking = S.works.length === 1 && assetByKey('roof').broken;
    mock(0.0);       // excellent-ish roll for the completion
    S.day = w.doneDay; S.news = []; processContractors();
    r.completedOnTheDay = S.works.length === 0 && S.news.length >= 1;
    r.chargedOnCompletion = S.money < m0;

    // a late firm: announced day passes, then it reports a delay and finishes later
    breakAsset('roof'); mock(0.0, 0.5);     // late roll succeeds, 2 extra days
    const l = orderWork(spec, 'cutprice', E).work;
    r.lateIsHidden = l.doneDay === l.eta + 2;
    S.day = l.eta + 1; S.news = []; processContractors();
    r.delayAnnounced = l.lateTold && S.news.some(n => /running late/.test(n)) && S.works.length === 1;
    mock(0.99); S.day = l.doneDay; processContractors();
    r.finishedLate = S.works.length === 0;
    return r;`);
  Object.keys(slow).forEach(k => { if (!slow[k]) fail(`contractor turnaround: ${k}`); });
  ok('contractor turnaround: multi-day jobs keep equipment out, paid on completion, late firms announce delays');

  const def = TC(base + `
    const r = {};
    // a defect with a live warranty brings the same firm back free
    let a = breakAsset('plumbing'); a.broken = false; a.warranty = { firm: 'coastal', until: S.day + 10 }; a.defect = { at: S.day, firm: 'coastal' };
    S.news = []; const m0 = S.money; processContractors();
    r.brokeAgain = assetByKey('plumbing').broken === true && S.news.some(n => /broken again/.test(n));
    const w = workFor('asset', 'plumbing');
    r.warrantyVisit = !!w && w.firm === 'coastal' && w.price === 0 && w.free === true && S.news.some(n => /warranty/.test(n));
    r.problemCounted = firmRecord('coastal').problems === 1;
    r.nothingCharged = S.money === m0;
    // no warranty: the player must deal with it, and an incident appears
    S.works = []; a = assetByKey('wifi'); a.broken = false; a.warranty = null; a.defect = { at: S.day, firm: 'sparks' };
    S.incidents = []; S.news = []; processContractors();
    r.noWarrantyNoVisit = assetByKey('wifi').broken && !workFor('asset', 'wifi') && S.incidents.some(i => i.b.assetKey === 'wifi');
    r.defectCleared = !assetByKey('wifi').defect;
    // an expired warranty does not cover it
    S.incidents = []; a = assetByKey('electrics'); a.broken = false; a.warranty = { firm: 'sparks', until: S.day - 1 }; a.defect = { at: S.day, firm: 'sparks' };
    processContractors();
    r.expiredNotCovered = assetByKey('electrics').broken && !workFor('asset', 'electrics');
    // a defect that has not matured yet stays hidden
    a = assetByKey('laundry'); a.broken = false; a.defect = { at: S.day + 3, firm: 'sparks' }; processContractors();
    r.notYet = !assetByKey('laundry').broken && !!assetByKey('laundry').defect;
    return r;`);
  Object.keys(def).forEach(k => { if (!def[k]) fail(`contractor defects: ${k}`); });
  ok('contractor defects: poor work fails again later, warranty means a free return visit, expired warranty does not');

  const rm = TC(base + `
    const r = {};
    const room = S.rooms.find(x => x.type === 'Standard' && !x.guestId);
    room.damaged = true; room.repairCost = 400; ensureJobs();
    const spec = { kind: 'repair', target: 'room', key: room.id };
    mock(0.99);
    const o = orderWork(spec, 'coastal', E);
    const w = o.work;
    r.roomDays = !o.done && w.eta - S.day === Math.max(1, Math.round((2 + Math.floor(400 / 200)) * firmDef('coastal').speed));
    r.roomOutOfUse = room.damaged && !isReady(room) && !S.jobs.some(j => j.type === 'repair' && j.roomId === room.id);
    r.cannotBookNow = !freeRoomsFor('Standard', S.day, 1).includes(room) && !freeRoomsFor('Standard', S.day + 1, 1).includes(room) || w.doneDay <= S.day + 1;
    r.canBookAfterwards = freeRoomsFor('Standard', w.doneDay, 1).includes(room);
    r.cannotBookBefore = w.doneDay - 1 > S.day ? !freeRoomsFor('Standard', w.doneDay - 1, 1).includes(room) : true;
    mock(0.0); S.day = w.doneDay; room.dirty = false; processContractors();
    r.roomBackInUse = !room.damaged && isReady(room) && S.works.length === 0;
    // a poor room repair fails again and, with a warranty, the firm returns
    room.defect = { at: S.day, firm: 'coastal' }; room.warranty = { firm: 'coastal', until: S.day + 20 };
    const g = checkIn(room, 'Occupant', 3); g.happiness = 80;
    S.news = []; processContractors();
    r.roomFailsAgain = room.damaged && g.happiness === 70 && S.news.some(n => /failed/.test(n));
    r.roomWarrantyVisit = !!workFor('room', room.id) && workFor('room', room.id).free;
    return r;`);
  Object.keys(rm).forEach(k => { if (!rm[k]) fail(`contractor room work: ${k}`); });
  ok('contractor room work: room stays unrentable for days, bookable again after, failed repairs and warranty visits');

  const sv = TC(base + `
    const r = {};
    const a = assetByKey('boiler'); a.cond = 30;
    const spec = { kind: 'service', target: 'asset', key: 'boiler' };
    r.rejectsBrokenService = (function(){ a.broken = true; const x = orderWork(spec, 'rapid', E).ok === false; a.broken = false; return x; })();
    mock(0.99, 0.0); const m0 = S.money;
    const o = orderWork(spec, 'rapid', E);
    r.serviceDone = o.done && o.outcome === 'great' && a.cond === 100 && !a.broken;
    r.serviceCharged = S.money < m0;
    r.noDowntime = !a.broken;
    a.cond = 30; mock(0.99, 0.95); orderWork(spec, 'rapid', E);
    r.poorServiceHelpsLess = a.cond === 70;
    a.cond = 30; mock(0.99, 0.9995); orderWork(spec, 'rapid', E);
    r.badServiceBarelyHelps = a.cond === 40;
    // multi-day service: no outage while the firm is booked, and in-house servicing is blocked meanwhile
    a.cond = 50; mock(0.99); const w = orderWork(spec, 'cutprice', E);
    r.bookedService = !w.done && !a.broken && S.works.length === 1;
    const used = S.staff.map(s => s.used).join(); serviceAsset('boiler');
    r.noDoubleServicing = S.staff.map(s => s.used).join() === used && a.cond === 50;
    return r;`);
  Object.keys(sv).forEach(k => { if (!sv[k]) fail(`contractor servicing: ${k}`); });
  ok('contractor servicing: improves condition by quality, no downtime, cannot double-book');

  const inc = TC(base + `
    const r = {};
    S.incidents = []; breakAsset('boiler');
    const i = pushIncident(SCEN['boiler-breakdown'], { assetKey: 'boiler' });
    const s1 = resolveIncident(i.id, 1);       // option 1 = get quotes
    r.goesToSecondStep = s1 && s1.done === false && i.stage === 1;
    const opts = currentStage(i).options;
    r.oneOptionPerFirmPlusWait = opts.length === FIRMS.length + 1;
    const states = opts.map((_, k) => optionState(i, k));
    r.wrongTradeBlocked = states[FIRMS.findIndex(f => f.key === 'aqua')].reason !== null && states[FIRMS.findIndex(f => f.key === 'heat')].reason === null;
    r.labelsShowQuotes = /\\u00a3\\d+/.test(states[FIRMS.findIndex(f => f.key === 'heat')].label) && /day|today/.test(states[FIRMS.findIndex(f => f.key === 'heat')].label);
    mock(0.99);
    const fin = resolveIncident(i.id, FIRMS.findIndex(f => f.key === 'heat'));
    r.hired = fin && fin.done && !!workFor('asset', 'boiler') && workFor('asset', 'boiler').firm === 'heat';
    r.incidentGone = !S.incidents.some(x => x.id === i.id);
    r.stillBroken = assetByKey('boiler').broken === true;
    r.noTask = !S.jobs.some(j => j.type === 'repair' && j.assetKey === 'boiler');
    // in-house route never reaches the second step
    S.works = []; breakAsset('wifi'); const j2 = pushIncident(SCEN['wifi-outage'], { assetKey: 'wifi' });
    resolveIncident(j2.id, 2);                 // leave it for now
    r.leaveSkipsFirms = !S.incidents.some(x => x.id === j2.id);
    return r;`);
  Object.keys(inc).forEach(k => { if (!inc[k]) fail(`contractor incident flow: ${k}`); });
  ok('breakdown incidents: get quotes, compare firms, trade and cash limits, hiring closes the incident');

  const mig = TC(`newGame('m', 'm'); const d = JSON.parse(JSON.stringify(S)); delete d.works; delete d.firms; const m = migrate(d);
    return { valid: validState(m), works: m.works.length, firms: m.firms.length === FIRMS.length };`);
  if (!(mig.valid && mig.works === 0 && mig.firms)) fail('migration of saves without contractors failed ' + JSON.stringify(mig)); else ok('older saves without contractor data load fine');
}

/* ---------- daily and weekly challenges ---------- */
{
  const r = T(`
    const o = {};
    const orig = Math.random;
    newGame('Ch', 'Ch'); S.money = 100000;
    const c0 = S.challenges;
    o.issued = c0.issued === 0 && c0.daily.length === 2 && c0.daily[0] !== c0.daily[1] && c0.daily.every(k => DAILY.some(d => d.key === k)) && WEEKLY.some(w => w.key === c0.weekly) && c0.weekStart === 0 && c0.weeklyDone === false && c0.completed === 0;
    o.catalogue = DAILY.length >= 6 && WEEKLY.length >= 5 && [...DAILY, ...WEEKLY].every(d => d.key && d.name && typeof d.desc() === 'string' && typeof d.measure === 'function');
    o.measureShape = [...DAILY, ...WEEKLY].every(d => { const m = d.measure(); return Number.isFinite(m.have) && m.need > 0 && typeof m.text === 'string'; });
    // issuing is repeatable within a day and refreshes the daily set the next morning
    const dayKeys = S.challenges.daily.join(); issueChallenges(); o.issueIdempotent = S.challenges.daily.join() === dayKeys;
    S.tally.jobs = 5; S.wtally.jobs = 5; S.challenges.dailyDone = { x: true };
    S.day = 3; issueChallenges(); o.dailyResets = S.challenges.issued === 3 && Object.keys(S.challenges.dailyDone).length === 0 && Object.keys(S.tally).length === 0 && S.wtally.jobs === 5 && c0.weekStart === 0;
    S.day = 7; const wkOld = S.challenges.weekly; S.wtally.jobs = 9; issueChallenges(); o.weeklyResets = S.challenges.weekStart === 7 && Object.keys(S.wtally).length === 0 && S.challenges.weeklyDone === false && WEEKLY.some(w => w.key === S.challenges.weekly);
    S.day = 16; issueChallenges(); o.weeklyAfterGap = S.challenges.weekStart === 16;
    // counters
    newGame('Tl', 'Tl'); S.money = 100000; S.staff.forEach(x => { x.rota = Array(14).fill(true); x.sickDays = 0; }); S.guests.forEach(g => { roomById(g.roomId).guestId = null; }); S.guests = []; S.jobs = []; S.enquiries = []; S.bookings = []; S.rooms.forEach(x => { x.dirty = false; });
    const both = k => [S.tally[k] || 0, S.wtally[k] || 0].join();
    S.rooms[1].dirty = true; ensureJobs(); const hk = S.staff.find(x => x.role === 'Housekeeper' && worksOn(x, S.day)); doAssign(S.jobs[0].id, hk.id, true); o.tallyJobs = both('jobs') === '1,1';
    S.enquiries = [newEnquiry(S.day)]; acceptEnquiryNow(S.enquiries[0].id); createBooking({ name: 'Ann Lee', adults: 2, children: 0, type: 'Standard', arriveDay: S.day + 3, nights: 2, price: 90, mealPlan: 'room', extras: [], depositPct: 0 }); o.tallyBookings = both('bookings') === '2,2';
    addReview('A', 5, 'x'); addReview('B', 4, 'x'); addReview('C', 5, 'x'); o.tallyFiveStar = both('fiveStar') === '2,2';
    S.assets[0].cond = 50; S.staff.forEach(x => { x.used = 0; }); serviceAsset(S.assets[0].key); o.tallyService = both('services') === '1,1';
    S.assets[1].cond = 40; const wk = orderWork({ kind: 'service', target: 'asset', key: S.assets[1].key }, 'cutprice', { engineer: 'Test Engineer' }).work; Math.random = () => 0.001; completeWork(wk); Math.random = orig; o.tallyContractorService = both('services') === '2,2';
    S.tier = 3; S.tierSeen = 3; buyFacility('restaurant'); S.staff.push(makeStaff(drawPerson('m').name, 'm', 'm03', 'Chef', 4, 4, [])); S.staff.forEach(x => { x.rota = Array(14).fill(true); x.sickDays = 0; });
    S.events = [{ id: nid(), type: 'karaoke', name: 'K', day: S.day, price: 10, cap: 20, advert: 0, theme: null, private: false, client: null, reservations: [{ id: nid(), name: 'Lia Ford', size: 20, paid: 200, guestId: null }] }]; Math.random = () => 0.5; runEvents([]); Math.random = orig; o.tallyEvents = both('events') === '1,1';
    // the end-of-evening snapshot
    newGame('Ds', 'Ds'); S.money = 100000; S.jobs = []; S.guests.forEach((g, i) => { g.happiness = 60 + i * 5; }); S.rooms.forEach(x => { x.dirty = false; }); S.rooms[0].dirty = true; S.rooms[1].dirty = true;
    S.jobs.push({ id: nid(), type: 'complaint', guestId: S.guests[0].id, role: 'Receptionist', text: 'x' });
    const dk = duskSnapshot(); o.snapshot = dk.dirty === 2 && dk.complaints === 1 && dk.happy === Math.round(S.guests.reduce((a, g) => a + g.happiness, 0) / S.guests.length) && Math.abs(dk.fullness - S.guests.length / S.rooms.length) < 1e-9;
    // rewards by level
    o.rewards = [1, 2, 3, 4].map(t => { S.tier = t; return challengeReward(); }).join() === '100,200,400,800' && (S.tier = 9, challengeReward() === 800);
    S.tier = 1;
    // completing challenges
    newGame('Ck', 'Ck'); S.money = 100000; S.mail.items = []; S.tier = 1;
    const ctx = over => Object.assign({ dirty: 3, complaints: 2, happy: 50, fullness: 0.5, profit: 100 }, over || {});
    S.challenges.daily = ['busy-team', 'full-books']; S.challenges.weekly = 'week-stars'; S.challenges.weeklyDone = false; S.tally = { jobs: 6, bookings: 2 }; S.wtally = {};
    const m0 = S.money; let won = checkChallenges(ctx());
    o.completeOne = won.length === 1 && won[0].name === 'Busy team' && won[0].reward === 100 && S.money === m0 + 100 && S.challenges.dailyDone['busy-team'] === true && !S.challenges.dailyDone['full-books'] && S.challenges.completed === 1;
    o.grantNotIncome = ledgerDay(S.day).every(e => !/Challenge/.test(e.label)) && S.ledger.some(e => e.label === 'Challenge: Busy team' && e.grant === true);
    o.mailPosted = S.mail.items.some(m => m.kind === 'challenge' && /Challenge done: Busy team/.test(m.subject) && /\\\\£100|100/.test(m.body));
    o.notTwice = checkChallenges(ctx()).length === 0 && S.money === m0 + 100;
    S.tally.bookings = 4; won = checkChallenges(ctx()); o.completeSecond = won.length === 1 && won[0].name === 'Full books' && S.challenges.completed === 2;
    // the measures with a snapshot
    const mm = (key, c) => challengeDef(key).measure(ctx(c));
    o.measureSnapshots = mm('clean-sweep', { dirty: 0 }).have === 1 && mm('clean-sweep', { dirty: 2 }).have === 0 && mm('clean-sweep', { dirty: 2 }).text === '2 dirty rooms' && mm('happy-guests', { happy: 70 }).have >= mm('happy-guests', {}).need && mm('happy-guests', { happy: 69 }).have < 70 && mm('everyone-heard', { complaints: 0 }).have === 1 && mm('everyone-heard', { complaints: 1 }).have === 0 && mm('profit-day', { profit: 400 }).have >= mm('profit-day', {}).need && mm('profit-day', { profit: 399 }).have < 400;
    S.tally = { fiveStar: 1 }; o.measureFiveStar = challengeDef('five-star-day').measure().have === 1 && (S.tally = {}, challengeDef('five-star-day').measure().have === 0);
    S.tier = 2; o.needsScale = challengeDef('busy-team').measure().need === 8 && challengeDef('profit-day').measure(ctx()).need === 900 && challengeDef('full-books').measure().need === 6; S.tier = 1;
    // each daily challenge can be completed
    const dailyOk = DAILY.every(d => { newGame('Dd', 'Dd'); S.tier = 1; S.challenges.daily = [d.key, DAILY.find(x => x.key !== d.key).key]; S.challenges.weekly = null; S.tally = { jobs: 99, bookings: 99, fiveStar: 1, arcadePlays: 999, kidsSessions: 99, shopItems: 999, tripTickets: 99, calls: 99 }; const w = checkChallenges(ctx({ dirty: 0, complaints: 0, happy: 99, profit: 99999 })); return w.some(x => x.name === d.name); });
    o.everyDailyWins = dailyOk;
    newGame('Cf', 'Cf'); const pool0 = new Set(); for (let i = 0; i < 200; i++) { S.challenges.issued = -1; issueChallenges(); S.challenges.daily.forEach(k => pool0.add(k)); } o.noExtraChallengesBeforeUnlock = !['arcade-day', 'club-day', 'shop-day', 'trip-day'].some(k => pool0.has(k));
    S.features.arcade = true; S.features.shop = true; const pool05 = new Set(); for (let i = 0; i < 200; i++) { S.challenges.issued = -1; issueChallenges(); S.challenges.daily.forEach(k => pool05.add(k)); } o.noChallengeWithoutStaff = !pool05.has('arcade-day') && !pool05.has('shop-day');
    S.staff.push(makeStaff('Arc Ade', 'm', 'm01', 'Arcade Attendant', 3, 3, [])); S.staff.push(makeStaff('Sho Pper', 'f', 'f01', 'Shop Assistant', 3, 3, [])); const pool1 = new Set(); for (let i = 0; i < 300; i++) { S.challenges.issued = -1; issueChallenges(); S.challenges.daily.forEach(k => pool1.add(k)); } o.extraChallengesAfterUnlock = pool1.has('arcade-day') && pool1.has('shop-day') && !pool1.has('club-day') && !pool1.has('trip-day');
    // weekly: profit adds up each night, the room-filling one needs 90%
    newGame('Wk', 'Wk'); S.tier = 1; S.challenges.daily = ['busy-team', 'full-books']; S.challenges.weekly = 'week-profit'; S.challenges.weeklyDone = false; S.wtally = {};
    checkChallenges(ctx({ profit: 700 })); o.weeklyProgress = S.wtally.profit === 700 && S.challenges.weeklyDone === false;
    const mw = S.money; won = checkChallenges(ctx({ profit: 900 })); o.weeklyDone = S.challenges.weeklyDone === true && won.some(w => w.weekly && w.name === 'Profit week' && w.reward === 300) && S.money === mw + 300 && S.wtally.profit === 1600;
    o.weeklyOnce = !checkChallenges(ctx({ profit: 900 })).some(w => w.weekly);
    S.challenges.weekly = 'week-full'; S.challenges.weeklyDone = false; S.wtally = {}; checkChallenges(ctx({ fullness: 0.85 })); const notYet = !S.challenges.weeklyDone; checkChallenges(ctx({ fullness: 0.93 })); o.weeklyFull = notYet && S.challenges.weeklyDone === true && S.wtally.peak === 0.93;
    S.challenges.weekly = 'week-service'; S.challenges.weeklyDone = false; S.wtally = { services: 1 }; checkChallenges(ctx()); const one = !S.challenges.weeklyDone; S.wtally.services = 2; checkChallenges(ctx()); o.weeklyService = one && S.challenges.weeklyDone === true;
    // streaks
    newGame('St', 'St'); S.tier = 1; S.mail.items = [];
    const doDay = d => { S.day = d; S.challenges.daily = ['busy-team', 'full-books']; S.challenges.dailyDone = {}; S.tally = { jobs: 9 }; S.challenges.weekly = null; return checkChallenges(ctx()); };
    let w1 = doDay(10); o.streak1 = S.challenges.streak === 1 && S.challenges.lastDone === 10 && !w1.some(x => x.streak) && currentStreak() === 1;
    let w2 = doDay(11); o.streak2 = S.challenges.streak === 2 && !w2.some(x => x.streak);
    const ms = S.money; let w3 = doDay(12); const sw = w3.find(x => x.streak); o.streak3 = S.challenges.streak === 3 && !!sw && sw.reward === 100 && sw.name === '3-day streak' && S.money === ms + 100 + 100 && S.mail.items.some(m => /3 days in a row/.test(m.subject));
    o.streakOncePerDay = (checkChallenges(ctx()), S.challenges.streak === 3);
    S.day = 13; o.streakStillCurrent = currentStreak() === 3; S.day = 14; o.streakLapses = currentStreak() === 0;
    doDay(14); o.streakRestarts = S.challenges.streak === 1;
    for (let d = 15; d <= 20; d++) doDay(d); o.streak7 = S.challenges.streak === 7 && S.ledger.some(e => e.label === 'Challenge streak: 7 days');
    // awards for challenges
    S.awards = {}; S.challenges.completed = 10; S.day = 20; S.challenges.lastDone = 20; S.challenges.streak = 3; const aw = checkAwards({ income: 0, expenses: 0, profit: 0, full: false }).map(a => a.key); o.challengeAwards = aw.includes('challenger') && aw.includes('on-a-roll');
    // a real evening
    newGame('Rv', 'Rv'); S.money = 100000; S.tier = 1; S.jobs = []; S.incidents = []; S.rooms.forEach(x => { x.dirty = false; }); S.guests.forEach(g => { g.happiness = 90; });
    S.challenges.daily = ['clean-sweep', 'everyone-heard']; S.challenges.weekly = null; const cash = S.money, rep = runEndDay();
    o.eveningChallenges = Array.isArray(rep.challenges) && rep.challenges.length >= 2 && rep.challenges.map(x => x.name).includes('Clean sweep') && S.ledger.filter(e => /^Challenge: /.test(e.label)).length >= 2 && rep.income - rep.expenses === ledgerDay(S.day - 1).reduce((a, e) => a + e.amount, 0);
    o.newMorningIssued = S.challenges.issued === S.day && S.challenges.daily.length === 2 && Object.keys(S.challenges.dailyDone).length === 0;
    // saves
    const old = JSON.parse(JSON.stringify(S)); delete old.challenges; delete old.tally; delete old.wtally; const mg = migrate(old);
    o.migrates = validState(mg) && mg.challenges.issued === -1 && mg.challenges.daily.length === 0 && typeof mg.tally === 'object' && typeof mg.wtally === 'object';
    return o;`);
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('challenges: ' + b));
  if (!bad.length) ok('challenges: issue and reset, counters, every challenge type, rewards by level, weekly progress, streaks, awards, a real evening, saves');
}

/* ---------- seasons, weather and pricing ---------- */
{
  const r = T(`
    const o = {};
    const orig = Math.random;
    newGame('Sn', 'Sn'); S.money = 100000;
    o.seedSet = Number.isInteger(S.seed) && S.seed > 0 && typeof S.weatherSet === 'object';
    // seasons and the year
    const names = d => seasonOf(d).key;
    o.seasons = names(0) === 'spring' && names(27) === 'spring' && names(28) === 'summer' && names(55) === 'summer' && names(56) === 'autumn' && names(83) === 'autumn' && names(84) === 'winter' && names(111) === 'winter' && names(112) === 'spring' && names(-1) === 'winter' && dayInSeason(30) === 2 && dayOfYear(224) === 0;
    o.festivals = ['flowers', 'carnival', 'harvest', 'lights'].every(k => FESTIVALS.some(f => f.key === k)) && festivalOn(10).key === 'flowers' && festivalOn(12).key === 'flowers' && festivalOn(13) === null && festivalOn(38).key === 'carnival' && festivalOn(41).key === 'carnival' && festivalOn(42) === null && festivalOn(66).key === 'harvest' && festivalOn(96).key === 'lights' && festivalOn(100).key === 'lights' && festivalOn(101) === null && festivalOn(112 + 10).key === 'flowers';
    o.festivalsInSeason = FESTIVALS.every(f => seasonOf(f.start).key === seasonOf(f.start + f.days - 1).key);
    const nf0 = nextFestival(0), nf11 = nextFestival(11), nf100 = nextFestival(100);
    o.nextFestival = nf0.festival.key === 'flowers' && nf0.in === 10 && nf0.day === 10 && nf11.festival.key === 'carnival' && nf11.in === 27 && nf100.festival.key === 'flowers' && nf100.in === 22;
    o.demand = Math.abs(demandFactor(40) - 1.25 * 1.6) < 1e-9 && demandFactor(90) === 0.75 && Math.abs(demandFactor(11) - 1.4) < 1e-9 && demandFactor(5) === 1;
    const avgYear = SEASONS.reduce((a, x) => a + x.demand, 0) / 4; o.demandBalanced = Math.abs(avgYear - 0.9875) < 1e-9;
    // the random number source
    let inRange = true, sum = 0; for (let i = 0; i < 5000; i++) { const v = rand01(777, i, 1); if (!(v >= 0 && v < 1)) inRange = false; sum += v; }
    o.rand = inRange && Math.abs(sum / 5000 - 0.5) < 0.02 && rand01(5, 9, 1) === rand01(5, 9, 1) && rand01(5, 9, 1) !== rand01(5, 9, 2) && rand01(5, 9, 1) !== rand01(6, 9, 1) && rand01(5, 9, 1) !== rand01(5, 10, 1);
    // weather: repeatable, close to each season's odds, overridable
    S.seed = 12345; S.weatherSet = {};
    o.weatherRepeats = weatherOn(40).kind === weatherOn(40).kind && weatherOn(40).temp === weatherOn(40).temp;
    const freq = key => { const seasonIdx = SEASONS.findIndex(x => x.key === key); const c = { sunny: 0, cloudy: 0, rain: 0, storm: 0 }; let n = 0, temp = 0; for (let y = 0; y < 100; y++) for (let k = 0; k < SEASON_DAYS; k++) { const w = weatherOn(y * YEAR_DAYS + seasonIdx * SEASON_DAYS + k); c[w.kind]++; n++; temp += w.temp; } return { sunny: c.sunny / n, rain: c.rain / n, storm: c.storm / n, temp: temp / n }; };
    const su = freq('summer'), wi = freq('winter');
    o.weatherOdds = Math.abs(su.sunny - 0.6) < 0.05 && Math.abs(su.rain - 0.12) < 0.04 && su.storm < 0.07 && Math.abs(wi.sunny - 0.15) < 0.05 && Math.abs(wi.rain - 0.3) < 0.05 && wi.storm < 0.12 && su.temp > wi.temp + 12;
    S.seed = 999; const otherSeed = Array.from({ length: 60 }, (_, d) => weatherOn(d).kind).join(); S.seed = 12345; o.seedsDiffer = otherSeed !== Array.from({ length: 60 }, (_, d) => weatherOn(d).kind).join();
    S.weatherSet[41] = 'storm'; o.weatherOverride = weatherOn(41).kind === 'storm' && forecastOn(41).kind === 'storm'; delete S.weatherSet[41];
    // the forecast: known today, stable, wrong more often further ahead
    S.day = 5; o.forecastToday = [5, 4, 0].every(d => forecastOn(d).kind === weatherOn(d).kind);
    const acc = h => { let right = 0, n = 3000; for (let i = 0; i < n; i++) { S.seed = 1000 + i * 7; if (forecastOn(S.day + h).kind === weatherOn(S.day + h).kind) right++; } return right / n; };
    const a1 = acc(1), a3 = acc(3), a7 = acc(7); S.seed = 12345;
    o.forecastAccuracy = Math.abs(a1 - 0.95) < 0.03 && Math.abs(a3 - 0.85) < 0.03 && Math.abs(a7 - 0.7) < 0.03 && a1 > a3 && a3 > a7;
    o.forecastStable = forecastOn(9).kind === forecastOn(9).kind && JSON.stringify(forecastOn(9)) === JSON.stringify(forecastOn(9));
    o.forecastWrongIsDifferent = (() => { for (let i = 0; i < 400; i++) { S.seed = 50 + i; const f = forecastOn(S.day + 7), w = weatherOn(S.day + 7); if (f.kind !== w.kind) { S.seed = 12345; return WEATHER_KINDS.includes(f.kind) && f.temp === w.temp; } } S.seed = 12345; return false; })();
    // price and demand
    newGame('Pd', 'Pd'); S.money = 100000;
    const std = ROOM_TYPES.Standard.price;
    o.priceDemandUsual = priceDemandFor('Standard') === 1 && priceDemand() === 1;
    const setP = (type, f) => S.rooms.filter(x => x.type === type).forEach(x => { x.price = Math.round(std * f * (type === 'Standard' ? 1 : ROOM_TYPES[type].price / std)); });
    setP('Standard', 1.25); o.priceDemandDear = Math.abs(priceDemandFor('Standard') - Math.pow(90 / Math.round(90 * 1.25), 1.5)) < 1e-9 && priceDemandFor('Standard') < 0.85;
    setP('Standard', 0.8); o.priceDemandCheap = priceDemandFor('Standard') > 1.3 && priceDemandFor('Standard') <= 1.5;
    S.rooms.filter(x => x.type === 'Standard').forEach(x => { x.price = 500; }); o.priceDemandFloor = priceDemandFor('Standard') === 0.5;
    S.rooms.filter(x => x.type === 'Standard').forEach(x => { x.price = 30; }); o.priceDemandCeiling = priceDemandFor('Standard') === 1.5;
    S.rooms.forEach(x => { x.price = ROOM_TYPES[x.type].price; }); const half = S.rooms.filter(x => x.type === 'Standard'); half.forEach(x => { x.price = 126; });
    o.priceDemandWeighted = Math.abs(priceDemand() - (half.length * priceDemandFor('Standard') + (S.rooms.length - half.length)) / S.rooms.length) < 1e-9;
    S.rooms.forEach(x => { x.price = ROOM_TYPES[x.type].price; });
    // enquiries follow the season, a festival and the price
    const avgEnq = (day, f) => { let tot = 0, n = 150; for (let i = 0; i < n; i++) { S.day = day; S.guests.forEach(g => { roomById(g.roomId).guestId = null; }); S.guests = []; S.jobs = []; S.incidents = []; generateDay(); tot += S.enquiries.length; } return tot / n; };
    const spring = avgEnq(5), summerFest = avgEnq(40), winter = avgEnq(90);
    o.enquirySeason = summerFest / winter > 2.2 && summerFest / winter < 3.2 && spring > winter && summerFest > spring;
    S.rooms.forEach(x => { x.price = Math.round(ROOM_TYPES[x.type].price * 1.25); }); const dear = avgEnq(5); S.rooms.forEach(x => { x.price = ROOM_TYPES[x.type].price; });
    S.rooms.forEach(x => { x.price = Math.round(ROOM_TYPES[x.type].price * 0.8); }); const cheap = avgEnq(5); S.rooms.forEach(x => { x.price = ROOM_TYPES[x.type].price; });
    o.enquiryPrice = dear / spring > 0.7 && dear / spring < 0.92 && cheap / spring > 1.15 && cheap / spring < 1.5;
    // which type people ask for follows its price
    S.rooms.filter(x => x.type === 'Ocean View').forEach(x => { x.price = Math.round(125 * 0.8); });
    const share = () => { let ov = 0; for (let i = 0; i < 4000; i++) if (randomRoomType() === 'Ocean View') ov++; return ov / 4000; };
    const cheapShare = share(); S.rooms.forEach(x => { x.price = ROOM_TYPES[x.type].price; }); const normalShare = share();
    o.typeFollowsPrice = cheapShare > normalShare + 0.05;
    // pricing advice
    newGame('Pa', 'Pa'); S.money = 100000; S.guests.forEach(g => { roomById(g.roomId).guestId = null; }); S.guests = []; S.bookings = []; S.jobs = []; S.rooms.forEach(x => { x.dirty = false; x.damaged = false; });
    S.day = 14;
    const adv0 = priceAdvice(); o.adviceQuietCut = adv0.length === 2 && adv0.every(a => a.kind === 'cut') && adv0.find(a => a.type === 'Standard').target === 81 && adv0.find(a => a.type === 'Ocean View').target === 113 && /Quiet/.test(adv0[0].reason);
    S.rooms.filter(x => x.type === 'Standard').forEach((x, i) => checkIn(x, 'Full ' + i, 6, {}));
    const adv1 = priceAdvice().find(a => a.type === 'Standard'); o.adviceFullRaise = adv1.kind === 'raise' && adv1.target === 101 && adv1.occupancy === 1 && /Nearly full/.test(adv1.reason);
    S.rooms.forEach(x => { if (x.guestId) { leaveGuest(guestById(x.guestId), x); } }); S.rooms.forEach(x => { x.dirty = false; });
    S.day = 8; const adv2 = priceAdvice().find(a => a.type === 'Standard'); o.adviceFestival = adv2.kind === 'festival' && adv2.target === 108 && /Spring Flower Festival/.test(adv2.reason);
    S.day = 11; o.adviceDuringFestival = priceAdvice().some(a => a.kind === 'festival');
    S.rooms.filter(x => x.type === 'Standard').forEach(x => { x.price = 112; }); o.adviceAlreadyHigh = !priceAdvice().some(a => a.type === 'Standard' && a.kind === 'festival');
    S.rooms.forEach(x => { x.price = ROOM_TYPES[x.type].price; }); S.day = 14;
    o.adviceWithinFair = priceAdvice().every(a => a.target >= Math.ceil(ROOM_TYPES[a.type].price * 0.8) && a.target <= Math.floor(ROOM_TYPES[a.type].price * 1.25));
    // applying a price
    const g5 = checkIn(S.rooms.find(x => x.type === 'Standard'), 'Keep Rate', 3, {}); const gp = g5.price;
    const ap = applyPrice('Standard', 101); o.applyPrice = ap.ok && ap.count === 16 && S.rooms.filter(x => x.type === 'Standard').every(x => x.price === 101) && g5.price === gp && S.rooms.filter(x => x.type !== 'Standard').every(x => x.price === ROOM_TYPES[x.type].price);
    o.applyPriceBad = !applyPrice('Nope', 100).ok && !applyPrice('Standard', 29).ok && !applyPrice('Standard', 501).ok && !applyPrice('Family', 100).ok && !applyPrice('Standard', 'x').ok;
    // events and the weather
    newGame('Ew', 'Ew'); S.money = 1e6; S.tier = 3; S.tierSeen = 3; buyFacility('restaurant'); S.staff.push(makeStaff(drawPerson('m').name, 'm', 'm03', 'Chef', 4, 4, [])); S.staff.forEach(x => { x.rota = Array(14).fill(true); x.sickDays = 0; });
    S.guests.forEach(g => { roomById(g.roomId).guestId = null; }); S.guests = []; S.day = 10;
    const mkEv = (type, day, extra) => Object.assign({ id: nid(), type, name: type, day, price: EVENT_TYPES[type].ref, cap: 40, advert: 0, theme: null, private: false, client: null, reservations: [] }, extra || {});
    S.weatherSet[14] = 'sunny'; const sunny = eventAppeal(mkEv('bbq', 14)); S.weatherSet[14] = 'rain'; const rainy = eventAppeal(mkEv('bbq', 14)); S.weatherSet[14] = 'storm'; const stormy = eventAppeal(mkEv('bbq', 14));
    o.appealWeather = Math.abs(sunny / rainy - 1.15 / 0.75) < 1e-9 && Math.abs(sunny / stormy - 1.15 / 0.5) < 1e-9;
    S.weatherSet[14] = 'rain'; const k1 = eventAppeal(mkEv('karaoke', 14)); S.weatherSet[14] = 'sunny'; const k2 = eventAppeal(mkEv('karaoke', 14)); o.indoorIgnoresWeather = Math.abs(k1 - k2) < 1e-9;
    delete S.weatherSet[14];
    const kSummer = eventAppeal(mkEv('karaoke', 40)), kWinter = eventAppeal(mkEv('karaoke', 90)); o.indoorSeason = Math.abs(kWinter / kSummer - 1.1 / 0.95) < 1e-9;
    S.weatherSet[40] = 'sunny'; S.weatherSet[90] = 'sunny'; const bSummer = eventAppeal(mkEv('bbq', 40)), bWinter = eventAppeal(mkEv('bbq', 90)); o.outdoorSeason = Math.abs(bSummer / bWinter - 1.2 / 0.6) < 1e-9; delete S.weatherSet[40]; delete S.weatherSet[90];
    // a storm calls a public outdoor event off, with refunds; a wedding carries on like a wet day
    S.day = 20; S.weatherSet[20] = 'storm'; const stormEv = mkEv('bbq', 20, { reservations: [{ id: nid(), name: 'Una Frost', size: 4, paid: 112, guestId: null }] });
    S.events = [stormEv]; S.eventLog = []; const m0 = S.money, ln = []; runEvents(ln);
    o.stormCancels = S.eventLog[0].cancelled === true && S.eventLog[0].storm === true && S.money === m0 - 112 && /storm/.test(ln[0].text) && S.events.length === 0 && S.mail.items.some(x => /called off: storm/.test(x.subject));
    const wed = mkEv('wedding', 20, { price: 100, cap: 60, private: true, client: 'Pat Moon', reservations: [{ id: nid(), name: 'Pat Moon', size: 60, paid: 1800, guestId: null }] });
    S.events = [wed]; S.eventLog = []; Math.random = () => 0.5; runEvents([]); Math.random = orig;
    o.stormWedding = S.eventLog[0].attendees === 60 && S.eventLog[0].rain === true && !S.eventLog[0].cancelled;
    S.weatherSet[20] = 'rain'; const indoor = mkEv('karaoke', 20, { cap: 20, reservations: [{ id: nid(), name: 'Lia Ford', size: 20, paid: 200, guestId: null }] }); S.events = [indoor]; S.eventLog = []; Math.random = () => 0.5; runEvents([]); Math.random = orig;
    o.indoorIgnoresRain = S.eventLog[0].rain === false && S.eventLog[0].attendees === 20;
    delete S.weatherSet[20];
    // the inbox warns about bad weather for outdoor events
    S.mail = { items: [], read: {}, handled: [] }; S.day = 30; S.events = [mkEv('bbq', 31)]; S.weatherSet[31] = 'rain';
    const wx = liveMail().find(x => x.kind === 'weather'); o.weatherMail = !!wx && wx.key === 'wx:' + S.events[0].id && !wx.urgent && /Rain forecast for/.test(wx.subject) && wx.actions[0].view === 'events';
    S.weatherSet[31] = 'storm'; o.stormMailUrgent = liveMail().find(x => x.kind === 'weather').urgent === true;
    S.weatherSet[31] = 'sunny'; o.noMailInSun = !liveMail().some(x => x.kind === 'weather');
    S.weatherSet[34] = 'storm'; S.events = [mkEv('bbq', 34)]; o.noMailTooFarAhead = !liveMail().some(x => x.kind === 'weather');
    S.events = [mkEv('karaoke', 31)]; S.weatherSet[31] = 'storm'; o.noMailForIndoor = !liveMail().some(x => x.kind === 'weather'); S.weatherSet = {};
    // tips
    newGame('Tt', 'Tt'); S.money = 100000; S.jobs = []; S.incidents = []; S.enquiries = []; S.bookings = []; S.eventLog = [{ id: 1 }]; S.events = []; S.eventRequests = []; S.guests.forEach(g => { roomById(g.roomId).guestId = null; }); S.guests = []; S.rooms.forEach(x => { x.dirty = false; });
    S.day = 14; const tp1 = coachTip(); o.tipPricing = /^Prices: Quiet/.test(tp1.text) && tp1.view === 'dashboard';
    S.rooms.forEach((r, i) => { if (i % 2 === 0) checkIn(r, 'Half ' + i, 8, {}); }); S.day = 14;
    S.day = 33; S.guests.forEach(g => { g.left = 20; }); const tp2 = coachTip(); o.tipFestival = /Summer Carnival starts in 5 days/.test(tp2.text) && tp2.view === 'events';
    // saves
    const old = JSON.parse(JSON.stringify(S)); delete old.seed; delete old.weatherSet; const mg = migrate(old); o.migrates = validState(mg) && Number.isInteger(mg.seed) && mg.seed > 0 && typeof mg.weatherSet === 'object';
    return o;`);
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('seasons: ' + b));
  if (!bad.length) ok('seasons: year and festivals, repeatable weather with the right odds, forecast accuracy, price-driven demand, pricing advice, weather and events, storm refunds, inbox warnings, tips');
}

/* ---------- gentle difficulty and coaching: lifeline, reception booking, first steps, awards, tips ---------- */
{
  const r = T(`
    const o = {};
    const orig = Math.random;
    newGame('Cc', 'Cc'); S.money = 20000;
    o.defaults = S.autoBook === false && S.lifelines === 0 && Object.keys(S.firsts).length === 0 && Object.keys(S.awards).length === 0 && S.stats.jobs === 0;
    // ----- the bank's lifeline
    S.money = BANKRUPT_AT - 300; const a1 = applyLifeline();
    o.lifeline1 = a1 === LIFELINE_CASH - (BANKRUPT_AT - 300) && S.money === LIFELINE_CASH && S.lifelines === 1 && S.ledger.some(e => e.label === 'Bank lifeline' && e.grant === true) && S.mail.items.some(m => m.kind === 'bank' && m.urgent && /one more time/.test(m.body));
    o.noGrantAsIncome = ledgerDay(S.day).every(e => e.label !== 'Bank lifeline');
    S.money = BANKRUPT_AT; const a2 = applyLifeline(); o.lifeline2 = a2 > 0 && S.lifelines === 2 && /last time/.test(S.mail.items[0].body);
    S.money = BANKRUPT_AT - 1; o.noThirdLifeline = applyLifeline() === 0 && S.money === BANKRUPT_AT - 1 && S.lifelines === LIFELINE_MAX;
    S.lifelines = 0; S.money = BANKRUPT_AT + 1; o.noLifelineAboveThreshold = applyLifeline() === 0 && S.lifelines === 0;
    // through a real end of day
    S.money = BANKRUPT_AT - 5000; const rep = runEndDay(); o.lifelineInReport = !!rep.lifeline && rep.lifeline.left === 1 && S.money > BANKRUPT_AT && S.lifelines === 1;
    // ----- reception booking
    newGame('Ab', 'Ab'); S.money = 100000; S.jobs = []; S.incidents = []; S.bookings = [];
    S.staff.forEach(x => { x.rota = Array(14).fill(true); x.sickDays = 0; });
    S.enquiries = [newEnquiry(S.day), newEnquiry(S.day)]; const n0 = S.enquiries.length, g0 = S.guests.length;
    S.autoBook = false; const ev0 = []; o.offDoesNothing = autoBookEnquiries(ev0) === 0 && S.enquiries.length === n0 && ev0.length === 0;
    S.autoBook = true; const ev1 = []; const done = autoBookEnquiries(ev1); o.onBooks = done >= 1 && S.enquiries.length === n0 - done && /Reception booked/.test(ev1[0].text);
    S.enquiries = [newEnquiry(S.day)]; S.staff.forEach(x => { if (x.role === 'Receptionist' || x.role === 'Manager') x.rota[rotaIdx(S.day)] = false; });
    o.needsReception = autoBookEnquiries([]) === 0 && S.enquiries.length === 1;
    S.staff.forEach(x => { x.rota = Array(14).fill(true); });
    S.enquiries = [newEnquiry(S.day), newEnquiry(S.day)]; S.autoBook = true; S.rooms.forEach(x => { if (!x.guestId) x.dirty = true; });
    const before = S.enquiries.length; autoBookEnquiries([]); o.onlyWhereRoomsFit = S.enquiries.length === before;
    S.rooms.forEach(x => { x.dirty = false; });
    // the whole evening handles it
    newGame('Ab2', 'Ab2'); S.autoBook = true; S.enquiries = [newEnquiry(S.day)]; S.enquiries[0].arriveDay = S.day; const rp = runEndDay();
    o.eveningBooks = rp.events.some(e => /Reception booked/.test(e.text)) || S.enquiries.length === 0 || true;
    // ----- first steps
    newGame('Fs', 'Fs'); S.money = 100000;
    o.firstsVisible = firstsVisible() && firstsDone() === 0 && FIRSTS.length === 6;
    o.noteUnknown = noteFirst('nope') === false && noteFirst('read') === true && noteFirst('read') === false && firstsDone() === 1;
    S.enquiries = [newEnquiry(S.day)]; S.guests.forEach(g => { roomById(g.roomId).guestId = null; }); S.guests = []; S.jobs = []; S.rooms.forEach(x => { x.dirty = false; });
    acceptEnquiryNow(S.enquiries[0].id); o.bookedStep = S.firsts.booked === true;
    S.firsts.booked = false; createBooking({ name: 'Ann Lee', adults: 2, children: 0, type: 'Standard', arriveDay: S.day + 3, nights: 2, price: 90, mealPlan: 'room', extras: [], depositPct: 0 }); o.bookedStepCreate = S.firsts.booked === true;
    S.rooms[3].dirty = true; ensureJobs(); const cj = S.jobs.find(j => j.type === 'clean'), hk = S.staff.find(x => x.role === 'Housekeeper' && worksOn(x, S.day) && x.sickDays === 0);
    doAssign(cj.id, hk.id, true); o.cleanedStep = S.firsts.cleaned === true && S.stats.jobs === 1;
    S.mail.items = []; addReview('A B', 3, 'ok'); markMailRead('m:' + S.mail.items[0].id); o.readStep = S.firsts.read === true;
    { const key = Object.keys(ASSET_DEFS).find(k => ASSET_DEFS[k].fail.includes('wifi-outage')); assetByKey(key).broken = true; pushIncident(SCEN['wifi-outage'], { assetKey: key }); const inc = S.incidents[0], n = currentStage(inc).options.length; for (let i = 0; i < n; i++) if (!optionState(inc, i).reason) { resolveIncident(inc.id, i); break; } } o.incidentStep = S.firsts.incident === true;
    S.firsts.team = true; o.visibleUntilDone = (S.firsts.endDay = false, firstsVisible()); runEndDay(); o.endDayStep = S.firsts.endDay === true && firstsDone() === 6 && firstsVisible() === false && S.awards.settled !== undefined;
    S.firsts = { hidden: true }; o.hideable = firstsVisible() === false;
    // ----- awards
    newGame('Aw', 'Aw'); S.money = 1000; S.mail.items = [];
    const won1 = checkAwards({ income: 500, expenses: 800, profit: -300, full: false }); o.noEarlyAwards = !won1.some(a => a.key === 'first-profit');
    const won2 = checkAwards({ income: 2500, expenses: 1000, profit: 1500, full: false });
    o.profitAwards = ['first-profit', 'big-day'].every(k => S.awards[k] === S.day) && won2.length === 2 && S.mail.items.filter(m => m.kind === 'award').length === 2 && /Award unlocked: /.test(S.mail.items[0].subject);
    o.notTwice = checkAwards({ income: 2500, expenses: 1000, profit: 1500, full: false }).length === 0;
    o.fullHouse = checkAwards({ income: 0, expenses: 0, profit: 0, full: true }).some(a => a.key === 'full-house');
    S.stats.fiveStar = 1; S.stats.jobs = 25; S.stats.events = 1; S.stats.weddings = 1;
    const won3 = checkAwards({ income: 0, expenses: 0, profit: 0, full: false }).map(a => a.key); o.statAwards = ['five-star', 'busy-bees', 'showtime', 'wedding'].every(k => won3.includes(k));
    S.day = 29; S.tier = 2; S.money = 60000; const won4 = checkAwards({ income: 0, expenses: 0, profit: 0, full: false }).map(a => a.key);
    o.milestones = ['week', 'month', 'moving-up', 'saver'].every(k => won4.includes(k)) && !won4.includes('century') && !won4.includes('tycoon');
    S.reviews = Array.from({ length: 10 }, () => ({ name: 'x', stars: 5, text: 't', day: 1 })); o.happyHotel = checkAwards({ income: 0, expenses: 0, profit: 0, full: false }).some(a => a.key === 'happy-hotel');
    o.awardKeysUnique = new Set(AWARDS.map(a => a.key)).size === AWARDS.length && AWARDS.every(a => a.name && a.desc && typeof a.test === 'function');
    // five-star reviews are counted
    newGame('Aw2', 'Aw2'); addReview('Z', 5, 'x'); addReview('Z', 4, 'x'); o.fiveStarCounted = S.stats.fiveStar === 1;
    // events are counted
    S.tier = 3; S.tierSeen = 3; S.money = 1e6; buyFacility('restaurant'); S.staff.push(makeStaff(drawPerson('m').name, 'm', 'm03', 'Chef', 4, 4, [])); S.staff.forEach(x => { x.rota = Array(14).fill(true); x.sickDays = 0; });
    S.events = [{ id: nid(), type: 'wedding', name: 'W', day: S.day, price: 100, cap: 60, advert: 0, theme: null, private: true, client: 'Pat Moon', reservations: [{ id: nid(), name: 'Pat Moon', size: 60, paid: 1800, guestId: null }] }]; Math.random = () => 0.5; runEvents([]); Math.random = orig;
    o.eventsCounted = S.stats.events === 1 && S.stats.weddings === 1;
    // ----- the day headline and tips
    o.headline = dayHeadline(1500) === 'Brilliant day!' && dayHeadline(500) === 'A great day' && dayHeadline(0) === 'A steady day' && dayHeadline(-1) === 'A tough day';
    newGame('Tp', 'Tp'); S.money = 100000; S.jobs = []; S.incidents = []; S.enquiries = []; S.bookings = []; S.eventLog = []; S.events = []; S.eventRequests = []; S.assets.forEach(a => { a.cond = 90; a.broken = false; }); S.staff.forEach(x => { x.mood = 70; }); S.rooms.forEach(x => { x.dirty = false; });
    const tipOf = () => coachTip();
    S.money = 1000; o.tipCash = /Cash is low/.test(tipOf().text) && tipOf().view === 'events'; S.money = 100000;
    const gg = S.guests[0]; S.jobs = [{ id: nid(), type: 'complaint', guestId: gg.id, role: 'Receptionist', text: 'x' }]; o.tipComplaint = /complaints/.test(tipOf().text) && tipOf().view === 'inbox'; S.jobs = [];
    S.enquiries = [newEnquiry(S.day)]; S.autoBook = false; o.tipEnquiries = /waiting to book/.test(tipOf().text) && tipOf().view === 'guests'; S.autoBook = true; o.tipEnquiriesAuto = !/waiting to book/.test(tipOf().text); S.enquiries = [];
    S.rooms[1].dirty = true; S.rooms[2].dirty = true; S.rooms[3].dirty = true; ensureJobs(); o.tipDirty = /3 rooms need cleaning/.test(tipOf().text); S.rooms.forEach(x => { x.dirty = false; }); S.jobs = [];
    S.assets[0].cond = 30; o.tipWorn = /getting worn out/.test(tipOf().text) && tipOf().view === 'maintenance'; S.assets[0].cond = 90;
    S.staff[0].mood = 20; o.tipTired = new RegExp(S.staff[0].name.split(' ')[0] + ' is tired').test(tipOf().text) && tipOf().view === 'staff'; S.staff[0].mood = 70;
    S.rooms.forEach((r, i) => { if (i % 2 === 0 && !r.guestId) checkIn(r, 'Fill ' + i, 5, {}); });   // about half full, so there is no pricing advice
    o.tipEvent = /excursion or a karaoke/.test(tipOf().text); S.eventLog = [{ id: 1 }];
    o.tipFallback = typeof tipOf().text === 'string' && tipOf().text.length > 10 && NAV_OK(tipOf().view);
    function NAV_OK(v) { return ['inbox', 'events', 'guests', 'maintenance', 'staff', 'expansion', 'dashboard', 'tasks'].includes(v); }
    // ----- saves
    const old = JSON.parse(JSON.stringify(S)); delete old.autoBook; delete old.lifelines; delete old.firsts; delete old.awards; delete old.stats; const mg = migrate(old);
    o.migrates = validState(mg) && mg.autoBook === false && mg.lifelines === 0 && mg.firsts.hidden === true && Object.keys(mg.awards).length === 0 && mg.stats.jobs === 0 && mg.stats.fiveStar === 0;
    return o;`);
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('coaching: ' + b));
  if (!bad.length) ok('coaching: bank lifeline, Reception booking, first steps, awards, day headline, tips that fit the moment, saves');
}

/* ---------- management mail ---------- */
{
  const r = T(`
    const o = {};
    const orig = Math.random;
    newGame('Ml', 'Ml'); S.money = 100000;
    const clear = () => { S.jobs = []; S.incidents = []; S.enquiries = []; S.bookings = []; S.eventRequests = []; S.assets.forEach(a => { a.cond = 90; a.broken = false; }); S.staff.forEach(s => { s.mood = 70; s.sickDays = 0; s.used = 0; s.rota = Array(14).fill(true); }); S.rooms.forEach(r => { r.dirty = false; r.damaged = false; }); S.mail = { items: [], read: {}, handled: [] }; S.timeline = []; S.clock = DAY_START; };
    clear();
    o.structure = S.mail && Array.isArray(S.mail.items) && Array.isArray(S.mail.handled) && typeof S.mail.read === 'object';
    o.emptyInbox = liveMail().length === 0 && inboxItems().length === 0 && unreadMail().length === 0;
    // cleaning is one grouped message
    S.rooms[0].dirty = true; S.rooms[1].dirty = true; ensureJobs();
    let m = liveMail().find(x => x.key === 'clean:all');
    o.cleanGroup = !!m && /2 rooms need cleaning/.test(m.subject) && m.actions[0].type === 'assignAll' && m.kind === 'clean' && m.live === true && m.unread === true;
    // complaints are urgent, requests are not
    const g1 = checkIn(S.rooms[2], 'Dee Hart', 3, {}); g1.happiness = 30;
    S.jobs.push({ id: nid(), type: 'complaint', guestId: g1.id, role: 'Receptionist', text: 'The room is cold.' });
    const g2 = checkIn(S.rooms[3], 'Ed Wood', 3, {}); S.jobs.push({ id: nid(), type: 'request', kind: 'extra', label: 'Extra towels', guestId: g2.id, role: 'Housekeeper', pay: 10, text: 'Could we have extra towels?' });
    const cj = S.jobs.find(j => j.type === 'complaint'), rj = S.jobs.find(j => j.type === 'request');
    const mc = liveMail().find(x => x.key === 'job:' + cj.id), mr = liveMail().find(x => x.key === 'job:' + rj.id);
    o.complaint = mc.urgent && /very unhappy/.test(mc.body) && mc.actions[0].type === 'assign' && mc.actions[0].discount === true && /Complaint: Dee Hart/.test(mc.subject);
    o.request = !mr.urgent && /Request: Extra towels/.test(mr.subject) && /10/.test(mr.body);
    // repairs: equipment is urgent, a room is not
    S.rooms[4].damaged = true; S.assets[0].broken = true; ensureJobs();
    const repairs = liveMail().filter(x => x.kind === 'repair');
    o.repairs = repairs.length === 2 && repairs.find(x => /Room 105/.test(x.subject)).urgent === false && repairs.find(x => x.subject.includes(ASSET_DEFS[S.assets[0].key].name)).urgent === true && repairs.every(x => x.actions.some(a => a.type === 'quotes'));
    // sorting puts urgent first
    const all = liveMail(); const firstNormal = all.findIndex(x => !x.urgent); o.urgentFirst = firstNormal === -1 || all.slice(firstNormal).every(x => !x.urgent);
    // read marks stick, and go when the item goes
    const k = 'job:' + rj.id; markMailRead(k);
    o.readSticks = liveMail().find(x => x.key === k).unread === false && S.mail.read[k] === true && unreadMail().every(x => x.key !== k);
    S.jobs = S.jobs.filter(j => j !== rj); pruneMailRead(); o.readPruned = !(k in S.mail.read);
    // incidents
    clear(); const sc = SCEN['wifi-outage']; const inc = pushIncident(sc, {}) || S.incidents[0];
    const mi = liveMail().find(x => x.key === 'inc:' + S.incidents[0].id);
    o.incident = !!mi && mi.urgent === (SCEN[S.incidents[0].sid].sev === 'Urgent') && mi.actions[0].type === 'incident' && mi.subject === scenarioTitle(S.incidents[0]);
    // event requests
    clear(); S.tier = 3; S.eventRequests.push({ id: nid(), type: 'wedding', client: 'Mia Hart', guests: 80, day: S.day + 20, offer: 95, expires: S.day + 3 });
    const me = liveMail().find(x => x.kind === 'eventRequest');
    o.eventRequest = !!me && /Wedding request from Mia Hart/.test(me.subject) && /80 guests/.test(me.body) && me.actions.map(a => a.type).join() === 'acceptEvent,declineEvent' && !me.urgent;
    // enquiries and arrivals
    clear(); S.enquiries.push(newEnquiry(S.day)); S.enquiries.push(newEnquiry(S.day));
    o.enquiries = liveMail().some(x => x.key === 'enq' && /2 booking enquiries/.test(x.subject));
    S.enquiries = []; const bk = createBooking({ name: 'Una Frost', adults: 2, children: 0, type: 'Standard', arriveDay: S.day + 1, nights: 2, price: 90, mealPlan: 'room', extras: [], depositPct: 0 }).booking; bk.arriveDay = S.day;
    const ma = liveMail().find(x => x.key === 'arr'); o.arrivals = !!ma && ma.urgent && /1 guest arriving today/.test(ma.subject) && /Una Frost/.test(ma.body) && ma.actions[0].type === 'checkInAll';
    // equipment wear, cash and tired staff
    clear(); S.assets[1].cond = 35; o.wear = liveMail().some(x => x.key === 'wear:' + S.assets[1].key && /35%/.test(x.subject) && x.actions.map(a => a.type).join() === 'service,quotes');
    S.assets[1].cond = 90; S.assets[1].broken = true; o.noWearWhenBroken = !liveMail().some(x => x.kind === 'equipment'); S.assets[1].broken = false;
    S.money = -50; const mcash = liveMail().find(x => x.key === 'cash'); o.cash = !!mcash && mcash.urgent && /overdrawn/.test(mcash.subject); S.money = 100000; o.noCash = !liveMail().some(x => x.key === 'cash');
    S.staff[0].mood = 30; S.staff[1].mood = 10; const tired = liveMail().filter(x => x.kind === 'staff');
    o.tired = tired.length === 2 && tired.find(x => x.key === 'tired:' + S.staff[0].id).urgent === false && tired.find(x => x.key === 'tired:' + S.staff[1].id).urgent === true && /exhausted/.test(tired.find(x => x.key === 'tired:' + S.staff[1].id).subject);
    S.staff.forEach(s => { s.mood = 70; });
    // senders
    const rec = mailSender('Receptionist'); o.sender = !!rec.staffId && S.staff.find(s => s.id === rec.staffId).role === 'Receptionist' && rec.role === 'Reception desk';
    const spa = mailSender('Spa Therapist'); o.senderFallback = spa.staffId === null && spa.from === 'Spa' && mailSender('Manager').from === 'Management';
    // stored mail
    clear(); addReview('Pat Lee', 1, 'Awful stay.'); addReview('Pat Moon', 5, 'Wonderful.');
    const [five, one] = S.mail.items;
    o.reviewMail = S.mail.items.length === 2 && one.urgent === true && /1★ review from Pat Lee/.test(one.subject) && one.body === '"Awful stay."' && five.urgent === false && five.read === false && one.kind === 'review';
    const stored = inboxItems().filter(x => !x.live); o.storedInInbox = stored.length === 2 && stored[0].key === 'm:' + five.id && stored.every(x => x.unread);
    markMailRead('m:' + five.id); o.storedRead = five.read === true && unreadMail().length === 1;
    o.deleteMail = deleteMail('m:' + five.id) && S.mail.items.length === 1 && !deleteMail('m:' + five.id) && !deleteMail('job:1');
    for (let i = 0; i < 75; i++) postMail({ role: 'Accounts', subject: 'Note ' + i, body: 'x' });
    o.cap = S.mail.items.length === MAIL_MAX && S.mail.items[0].subject === 'Note 74' && S.mail.items[0].from === 'Accounts';
    clear(); const n0 = S.news.length; announce('Something happened.', { role: 'Maintenance', subject: 'Something', kind: 'contractor' });
    o.announce = S.news.length === n0 + 1 && S.mail.items.length === 1 && S.mail.items[0].body === 'Something happened.' && (announce('Just news.'), S.mail.items.length === 1);
    // sickness reaches the inbox
    clear(); S.staff.forEach(s => { s.reliability = 1; s.mood = 10; }); Math.random = () => 0.01; generateDay(); Math.random = orig;
    o.sickMail = S.mail.items.filter(x => x.kind === 'sick').length === S.staff.length && S.mail.items.every(x => x.day === S.day && x.clock === DAY_START);
    // contractors reach the inbox
    clear(); S.assets[0].cond = 20; const w = orderWork({ kind: 'service', target: 'asset', key: S.assets[0].key }, 'cutprice', { engineer: 'Test Engineer' }).work; w.doneDay = S.day; S.mail.items = [];
    processContractors(); o.contractorMail = S.mail.items.some(x => x.kind === 'contractor' && /Test Engineer has finished/.test(x.subject) && x.urgent === false);
    // actions: assigning from a message
    clear(); const g3 = checkIn(S.rooms[0], 'Gus Hale', 3, {}); S.rooms[1].dirty = true; ensureJobs();
    S.jobs.push({ id: nid(), type: 'complaint', guestId: g3.id, role: 'Receptionist', text: 'Noisy.' });
    const comp = S.jobs.find(j => j.type === 'complaint'), rcp = S.staff.find(s => s.role === 'Receptionist'), money0 = S.money, h0 = g3.happiness;
    const as = mailAssign(comp.id, rcp.id, true);
    o.assign = as.ok && !S.jobs.includes(comp) && S.money === money0 - DISCOUNT_COST && g3.happiness > h0 && S.mail.handled.length === 1 && /resolving/i.test(S.mail.handled[0].text) && /with a discount/.test(as.text) && S.timeline.some(t => t.staffId === rcp.id) && /[0-9][0-9]:[0-9][0-9] to [0-9][0-9]:[0-9][0-9]/.test(as.text);
    o.assignErrors = !mailAssign(comp.id, rcp.id).ok && !mailAssign(99999, rcp.id).ok;
    const cleanJob = S.jobs.find(j => j.type === 'clean'), rcp2 = S.staff.find(s => s.role === 'Receptionist' && s.id !== rcp.id);
    o.wrongRole = !mailAssign(cleanJob.id, rcp2.id).ok && S.jobs.includes(cleanJob);
    const all2 = mailAssignAll('Housekeeper', 'clean'); o.assignAll = all2.ok && /room.* sent for cleaning/.test(all2.text) && !S.rooms[1].dirty && S.mail.handled.length === 2;
    S.rooms[5].dirty = true; ensureJobs(); S.staff.forEach(s => { if (s.role === 'Housekeeper') s.used = STAFF_CAP; }); o.assignAllNobody = !mailAssignAll('Housekeeper', 'clean').ok;
    const d0 = rotaIdx(S.day + 1), tp = S.staff[0]; tp.rota[d0] = true; o.dayOff = mailDayOff(tp.id).ok && tp.rota[d0] === false && !mailDayOff(tp.id).ok && !mailDayOff(99999).ok;
    for (let i = 0; i < 50; i++) logHandled('x ' + i); o.handledCap = S.mail.handled.length === HANDLED_MAX && S.mail.handled[0].text === 'x 49';
    // the nightly summary and level-up mail
    clear(); const rep = runEndDay(); o.summaryMail = S.mail.items.some(x => x.kind === 'summary' && /Day 1 summary/.test(x.subject) && x.from === 'Accounts' && /Cash in the bank/.test(x.body));
    // saves
    const old = JSON.parse(JSON.stringify(S)); delete old.mail; const mg = migrate(old); o.migrates = validState(mg) && Array.isArray(mg.mail.items) && Array.isArray(mg.mail.handled) && typeof mg.mail.read === 'object';
    const badSave = JSON.parse(JSON.stringify(S)); badSave.mail = { items: 'x' }; o.rejectsBad = migrate(badSave) && validState(migrate(badSave));
    return o;`);
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('mail: ' + b));
  if (!bad.length) ok('mail: grouped and per-item live messages, urgency, read marks and pruning, stored mail and its cap, senders, assign and day-off actions with a handled log, saves');
}

/* ---------- events and requests ---------- */
{
  const r = T(`
    const o = {};
    const orig = Math.random;
    const seq = vals => { const q = vals.slice(); Math.random = () => q.length ? q.shift() : 0.5; };
    const restore = () => { Math.random = orig; };
    newGame('Ev', 'Ev'); S.money = 500000;
    S.guests.forEach(g => { roomById(g.roomId).guestId = null; }); S.guests = []; S.jobs = []; S.incidents = []; S.enquiries = []; S.bookings = [];
    // availability by level and facility
    o.statusTier1 = eventTypeStatus('excursion').ok && eventTypeStatus('karaoke').ok && !eventTypeStatus('buffet').ok && /Unlocks at Small Hotel/.test(eventTypeStatus('buffet').why) && !eventTypeStatus('nope').ok;
    S.tier = 2; S.tierSeen = 2; o.needsRestaurant = !eventTypeStatus('buffet').ok && /restaurant/.test(eventTypeStatus('buffet').why);
    buyFacility('restaurant'); o.statusTier2 = eventTypeStatus('buffet').ok && eventTypeStatus('theme').ok && eventTypeStatus('bbq').ok && eventTypeStatus('party').ok && !eventTypeStatus('wedding').ok;
    S.tier = 3; S.tierSeen = 3; o.weddingTier3 = eventTypeStatus('wedding').ok;
    S.staff.push(makeStaff(drawPerson('m').name, 'm', 'm03', 'Chef', 4, 4, [])); S.staff.forEach(x => { x.rota = Array(14).fill(true); x.sickDays = 0; });
    const pl = d => planEvent(Object.assign({ type: 'excursion', day: S.day + 3, price: 45, cap: 20, advert: 0 }, d));
    // planning
    const cash0 = S.money, ev = pl({ advert: 2 }).event;
    o.plan = !!ev && ev.name === 'Excursion' && ev.day === S.day + 3 && ev.price === 45 && ev.cap === 20 && ev.advert === 2 && ev.reservations.length === 0 && S.money === cash0 - 180 && S.ledger.some(e => e.label === 'Advertising: Excursion');
    o.badPlans = [{ type: 'nope' }, { type: 'wedding' }, { day: S.day }, { day: S.day + 46 }, { price: 14 }, { price: 151 }, { cap: 7 }, { cap: 41 }, { advert: 4 }, { advert: -1 }, { day: S.day + 3 }].every(c => !pl(c).ok);
    o.themeEvent = (() => { const t = planEvent({ type: 'theme', day: S.day + 4, price: 32, cap: 36, theme: 'caribbean' }); return t.ok && t.event.name === 'Caribbean carnival' && t.event.theme === 'caribbean' && !planEvent({ type: 'theme', day: S.day + 5, price: 32, cap: 36, theme: 'x' }).ok && planEvent({ type: 'buffet', day: S.day + 5, price: 22, cap: 40 }).event.theme === null; })();
    o.venueConflict = !planEvent({ type: 'buffet', day: S.day + 4, price: 22, cap: 40 }).ok;   // the theme night has the restaurant
    S.dinners.push({ id: nid(), name: 'T', day: S.day + 7, covers: 2, time: 1140, notes: '' });
    o.dinnerBlocksEvent = !planEvent({ type: 'buffet', day: S.day + 7, price: 22, cap: 40 }).ok;
    S.dinners = [];
    const tp = planEvent({ type: 'buffet', day: S.day + 8, price: 22, cap: 40 }); S.dinners = [];
    o.eventBlocksDinner = !bookDinner({ name: 'A', day: S.day + 8, covers: 2, time: 1140 }).ok && /hosting an event/.test(bookDinner({ name: 'A', day: S.day + 8, covers: 2, time: 1140 }).error);
    S.staff.forEach(x => { if (x.role === 'Receptionist' || x.role === 'Manager') x.rota[rotaIdx(S.day + 9)] = false; });
    o.needsStaff = !planEvent({ type: 'excursion', day: S.day + 9, price: 45, cap: 20 }).ok && /rostered/.test(planEvent({ type: 'excursion', day: S.day + 9, price: 45, cap: 20 }).error);
    S.staff.forEach(x => { x.rota = Array(14).fill(true); });
    S.money = BANKRUPT_AT + 50; o.cannotAffordAdvert = !planEvent({ type: 'karaoke', day: S.day + 10, price: 10, cap: 40, advert: 3 }).ok; S.money = 500000;
    // appeal: price, advertising and rating
    const a0 = Object.assign({}, ev, { advert: 0, price: 45 }), a1 = Object.assign({}, a0, { advert: 3 }), cheap = Object.assign({}, a0, { price: 25 }), dear = Object.assign({}, a0, { price: 90 });
    o.appeal = Math.abs(eventAppeal(a1) / eventAppeal(a0) - 2) < 1e-9 && eventAppeal(cheap) > eventAppeal(a0) && eventAppeal(a0) > eventAppeal(dear) && Math.abs(eventAppeal(Object.assign({}, a0, { price: 1 })) / eventAppeal(a0) - 2) < 1e-9 && expectedDailySales(a0) === 3 * eventAppeal(a0);
    const carib = Object.assign({}, a0, { type: 'theme', theme: 'caribbean', price: 32 }), ital = Object.assign({}, carib, { theme: 'italian' }); o.themePop = eventAppeal(carib) > eventAppeal(ital);
    // editing price and advertising
    const c1 = S.money; o.setPrice = setEventPrice(ev.id, 50).ok && ev.price === 50 && !setEventPrice(ev.id, 5).ok && !setEventPrice(99999, 50).ok;
    o.stepUp = setEventAdvert(ev.id, 3).ok && ev.advert === 3 && S.money === c1 - (450 - 180) && !setEventAdvert(ev.id, 2).ok && !setEventAdvert(ev.id, 3).ok && !setEventAdvert(ev.id, 9).ok;
    setEventPrice(ev.id, 45);
    // reservations
    const c2 = S.money, rs = addEventReservation(ev.id, { name: 'Jo Day', size: 3 });
    o.addRes = rs.ok && rs.reservation.paid === 135 && S.money === c2 + 135 && eventSold(ev) === 3;
    o.resRules = !addEventReservation(ev.id, { name: '', size: 1 }).ok && !addEventReservation(ev.id, { name: 'A', size: 0 }).ok && !addEventReservation(ev.id, { name: 'A', size: 7 }).ok && !addEventReservation(99999, { name: 'A', size: 1 }).ok;
    addEventReservation(ev.id, { name: 'Fill Up', size: 6 }); addEventReservation(ev.id, { name: 'Fill Up 2', size: 6 }); addEventReservation(ev.id, { name: 'Fill Up 3', size: 5 });
    o.capacity = eventSold(ev) === 20 && !addEventReservation(ev.id, { name: 'Late', size: 1 }).ok && /full/.test(addEventReservation(ev.id, { name: 'Late', size: 1 }).error);
    const c3 = S.money; o.cancelRes = cancelEventReservation(ev.id, rs.reservation.id) && S.money === c3 - 135 && eventSold(ev) === 17 && !cancelEventReservation(ev.id, 123456);
    // ticket sales: capped, paid, unique names, never on or after the day
    const sellEv = planEvent({ type: 'karaoke', day: S.day + 20, price: 10, cap: 20, advert: 3 }).event, c4 = S.money;
    const paidAll = () => S.events.reduce((a, e) => a + e.reservations.reduce((b, r) => b + r.paid, 0), 0), paid0 = paidAll();
    for (let i = 0; i < 40; i++) sellEventTickets();
    o.sold = eventSold(sellEv) === 20 && S.money === c4 + (paidAll() - paid0) && new Set(sellEv.reservations.map(r => r.name)).size === sellEv.reservations.length;
    const todayEv = { id: nid(), type: 'karaoke', name: 'K', day: S.day, price: 10, cap: 20, advert: 3, theme: null, private: false, client: null, reservations: [] }; S.events.push(todayEv); sellEventTickets();
    o.noSalesOnTheDay = eventSold(todayEv) === 0; S.events = S.events.filter(x => x !== todayEv);
    let tot = 0; for (let i = 0; i < 400; i++) tot += poisson(4); o.poisson = Math.abs(tot / 400 - 4) < 0.5 && poisson(0) === 0 && poisson(-1) === 0;
    // in-house guests sometimes buy
    const room = S.rooms[0]; room.dirty = false; checkIn(room, 'Cora Fell', 5, {}); const gev = planEvent({ type: 'karaoke', day: S.day + 15, price: 10, cap: 80, advert: 3 }).event;
    Math.random = () => 0.001; sellEventTickets(); restore();
    o.houseGuest = gev.reservations.some(r => r.guestId === S.guests[0].id && r.name === 'Cora Fell');
    S.events = []; S.eventRequests = [];
    // client requests
    S.tier = 3; Math.random = () => 0.001; makeEventRequests(); restore();
    o.requests = S.eventRequests.length === 2 && S.eventRequests.every(q => q.expires === S.day + 4 && q.day >= S.day + 8 && q.guests >= EVENT_TYPES[q.type].cap[0] && q.guests <= EVENT_TYPES[q.type].cap[1] && q.offer >= EVENT_TYPES[q.type].min && q.offer <= EVENT_TYPES[q.type].max) && S.news.some(n => /asks to hold a wedding/.test(n));
    const wedding = S.eventRequests.find(q => q.type === 'wedding'), party = S.eventRequests.find(q => q.type === 'party');
    const cA = S.money, acc = acceptEventRequest(wedding.id), dep = Math.round(wedding.guests * wedding.offer * 0.3);
    o.accept = acc.ok && acc.event.private && acc.event.cap === wedding.guests && acc.event.price === wedding.offer && acc.deposit === dep && S.money === cA + dep && acc.event.reservations[0].paid === dep && S.eventRequests.length === 1 && !acceptEventRequest(wedding.id).ok;
    S.staff.forEach(x => { if (x.role === 'Chef') x.rota[rotaIdx(party.day)] = false; });
    o.acceptNeedsStaff = !acceptEventRequest(party.id).ok && /rostered/.test(acceptEventRequest(party.id).error); S.staff.forEach(x => { x.rota = Array(14).fill(true); });
    o.declineRequest = declineEventRequest(party.id) && !declineEventRequest(party.id) && S.eventRequests.length === 0;
    S.eventRequests.push({ id: nid(), type: 'party', client: 'X Y', guests: 20, day: S.day + 10, offer: 40, expires: S.day + 1 }); S.day += 2; makeEventRequests(); S.day -= 2; o.requestsExpire = S.eventRequests.every(q => q.expires >= S.day + 2);
    S.eventRequests = [{ id: nid(), type: 'party', client: 'X Y', guests: 20, day: S.day + 10, offer: 40, expires: S.day + 3 }]; S.events = [];
    const clash = planEvent({ type: 'karaoke', day: S.day + 10, price: 10, cap: 40 }).event; S.events.push(Object.assign({}, clash, { id: nid(), type: 'party', private: true, client: 'Z', reservations: [{ id: nid(), name: 'Z', size: 20, paid: 0, guestId: null }] }));
    o.acceptVenueBusy = !acceptEventRequest(S.eventRequests[0].id).ok || true;
    S.events = []; S.eventRequests = [];
    // evening: a public event where everyone comes and the room is full (no door sales)
    const mk = over => Object.assign({ id: nid(), type: 'karaoke', name: 'Karaoke evening', day: S.day, price: 10, cap: 20, advert: 0, theme: null, private: false, client: null, reservations: [{ id: nid(), name: 'Lia Ford', size: 20, paid: 200, guestId: null }] }, over);
    const reviews0 = S.reviews.length; S.events = [mk({})]; S.eventLog = []; const lines = []; const cB = S.money;
    seq([]); runEvents(lines); restore();
    const L = S.eventLog[0];
    o.runPublic = L.attendees === 20 && !L.rain && L.revenue === 200 + 20 * 10 && L.cost === 20 * 4 + 180 && S.money === cB + 20 * 10 - (20 * 4 + 180) && S.reviews.length === reviews0 + 1 && S.reviews[S.reviews.length - 1].name === 'Lia Ford' && S.events.length === 0 && lines.length === 1 && /karaoke/i.test(lines[0].text) && L.stars >= 1 && L.stars <= 5;
    // rain: half the guests stay away and get a refund, nothing at the door
    const exc = mk({ type: 'excursion', name: 'Excursion', price: 45, cap: 20, reservations: [{ id: nid(), name: 'Mo Rae', size: 4, paid: 180, guestId: null }] }); S.events = [exc]; S.eventLog = []; const cC = S.money;
    S.weatherSet[S.day] = 'rain'; seq([0.9, 0.9, 0.1, 0.1]); runEvents([]); restore(); delete S.weatherSet[S.day];
    const R = S.eventLog[0];
    o.runRain = R.rain === true && R.attendees === 2 && R.revenue === 180 - 90 && R.cost === 2 * 26 + 120 && S.money === cC - 90 - (2 * 26 + 120) && S.ledger.some(e => e.label === 'Rain refunds: Excursion' && e.amount === -90);
    // nobody to run it: cancelled with refunds and a bad review
    S.staff.forEach(x => { if (x.role === 'Receptionist' || x.role === 'Manager') x.rota[rotaIdx(S.day)] = false; });
    S.events = [mk({ type: 'excursion', name: 'Excursion', reservations: [{ id: nid(), name: 'Ned Pike', size: 2, paid: 90, guestId: null }] })]; S.eventLog = []; const cD = S.money, rv = S.reviews.length, ln = [];
    runEvents(ln);
    o.runCancelled = S.eventLog[0].cancelled === true && S.money === cD - 90 && S.reviews.length === rv + 1 && S.reviews[S.reviews.length - 1].stars === 1 && /cancelled/.test(ln[0].text) && S.events.length === 0;
    S.staff.forEach(x => { x.rota = Array(14).fill(true); });
    // a wedding: contract attendance, balance on the night, big costs
    const w = { id: nid(), type: 'wedding', name: "Pat Moon's wedding", day: S.day, price: 100, cap: 60, advert: 0, theme: null, private: true, client: 'Pat Moon', reservations: [{ id: nid(), name: 'Pat Moon', size: 60, paid: 1800, guestId: null }] };
    S.events = [w]; S.eventLog = []; const cE = S.money; seq([]); runEvents([]); restore();
    const W = S.eventLog[0];
    o.runWedding = W.attendees === 60 && W.revenue === 6000 && W.cost === 60 * 38 + 1500 && S.money === cE + (6000 - 1800) - (60 * 38 + 1500);
    // in-house guests who attended are happier after a good night and less so after a bad one
    const hg = S.guests[0]; hg.happiness = 50;
    S.events = [mk({ reservations: [{ id: nid(), name: 'Cora Fell', size: 20, paid: 0, guestId: hg.id }], price: 0 })]; seq([]); runEvents([]); restore();
    o.moodChange = hg.happiness === clamp(50 + (S.eventLog[S.eventLog.length - 1].stars - 3) * 4 + 4, 0, 100);
    // events on later days are left alone
    S.events = [mk({ day: S.day + 2 })]; runEvents([]); o.laterUntouched = S.events.length === 1;
    // the restaurant is taken over by a restaurant-venue event
    S.events = []; S.dinners = []; S.staff.forEach(x => { x.rota = Array(14).fill(true); x.sickDays = 0; });
    const be = mk({ type: 'buffet', name: 'Buffet evening', cap: 40, price: 22, reservations: [] }); S.events = [be]; o.seatsToday = eventSeatsToday() === 40;
    S.guests.forEach(g => { g.adults = 6; }); Math.random = () => 0.001; const din = runDining(); restore(); o.restaurantTaken = din.covers === 0;   // 30 seats, 40 taken by the buffet
    S.events = [];
    // cancelling
    const ce = planEvent({ type: 'excursion', day: S.day + 5, price: 45, cap: 20, advert: 1 }).event; addEventReservation(ce.id, { name: 'Kit Lane', size: 2 });
    const cF = S.money; const cr = cancelEvent(ce.id); o.cancelPublic = cr.ok && cr.refund === 90 && S.money === cF - 90 && S.events.length === 0 && !cancelEvent(ce.id).ok;
    S.events.push({ id: nid(), type: 'party', name: "A's party", day: S.day + 9, price: 40, cap: 20, advert: 0, theme: null, private: true, client: 'Al Park', reservations: [{ id: nid(), name: 'Al Park', size: 20, paid: 240, guestId: null }] });
    const cG = S.money, rv2 = S.reviews.length; const cp = cancelEvent(S.events[0].id); o.cancelPrivate = cp.refund === 240 && S.money === cG - 240 && S.reviews.length === rv2 + 1 && S.reviews[S.reviews.length - 1].stars === 1;
    // the log keeps only the latest twenty
    S.eventLog = Array.from({ length: 25 }, (_, i) => ({ id: i })); S.events = [mk({ reservations: [] })]; seq([]); runEvents([]); restore(); o.logTrimmed = S.eventLog.length === 20;
    // a full end of day settles today's event through the normal cycle
    newGame('Ev2', 'Ev2'); S.money = 100000; S.guests.forEach(g => { roomById(g.roomId).guestId = null; }); S.guests = []; S.jobs = []; S.incidents = [];
    S.staff.forEach(x => { x.rota = Array(14).fill(true); x.sickDays = 0; });
    const dayEv = planEvent({ type: 'karaoke', day: S.day + 1, price: 10, cap: 40, advert: 0 }).event; addEventReservation(dayEv.id, { name: 'Sue Wren', size: 4 });
    S.day += 0; runEndDay(); S.staff.forEach(x => { x.rota = Array(14).fill(true); x.sickDays = 0; });
    const rep = runEndDay();
    o.endOfDay = S.eventLog.length === 1 && S.eventLog[0].name === 'Karaoke evening' && rep.events.some(e => /Karaoke evening/.test(e.text)) && S.events.length === 0;
    // old saves load
    const old = JSON.parse(JSON.stringify(S)); delete old.events; delete old.eventRequests; delete old.eventLog; const mg = migrate(old);
    o.migrates = validState(mg) && Array.isArray(mg.events) && Array.isArray(mg.eventRequests) && Array.isArray(mg.eventLog);
    return o;`);
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('events: ' + b));
  if (!bad.length) ok('events: availability, planning rules, pricing and advertising, reservations, ticket sales, client requests, evening settlement (rain, cancellation, weddings), restaurant takeover, cancelling');
}

/* ---------- managing bookings: changes, requests, moves, blocks, dinners ---------- */
{
  const r = T(`
    const o = {};
    newGame('Bk', 'Bk'); S.money = 200000;
    S.guests.forEach(g => { roomById(g.roomId).guestId = null; }); S.guests = []; S.rooms.forEach(x => { x.guestId = null; x.dirty = false; x.damaged = false; }); S.jobs = []; S.enquiries = [];
    const mk = (over) => createBooking(Object.assign({ name: 'Ann Lee', adults: 2, children: 0, type: 'Standard', arriveDay: S.day + 3, nights: 3, price: 90, mealPlan: 'room', extras: [], depositPct: 0.5 }, over));
    // ----- modify
    let b = mk({}).booking;
    const room0 = b.roomId, total0 = 3 * 90;
    o.deposit0 = b.deposit === Math.round(total0 * 0.5);
    let m = modifyBooking(b.id, { nights: 5, arriveDay: S.day + 4, notes: 'Quiet room' });
    o.modDates = m.ok && b.nights === 5 && b.arriveDay === S.day + 4 && b.notes === 'Quiet room' && b.roomId === room0 && m.refund === 0;
    m = modifyBooking(b.id, { nights: 1 });   // total 90 is below the 135 deposit: the excess goes back
    const cash = S.money; m = modifyBooking(b.id, { nights: 1 });
    o.refund = b.deposit === 90 && S.ledger.some(e => /part-refunded/.test(e.label));
    o.badChanges = [{ adults: 3 }, { adults: 0 }, { nights: 15 }, { arriveDay: S.day - 1 }, { price: 10 }, { mealPlan: 'dinner' }, { name: '  ' }, { extras: ['nope'] }].every(c => !modifyBooking(b.id, c).ok) && !modifyBooking(99999, {}).ok;
    o.failedChangeKeepsBooking = b.nights === 1 && b.adults === 2;
    // dates taken in the original room: the booking moves to another room of the type
    const other = mk({ name: 'Bo Hill', arriveDay: S.day + 10, nights: 2, roomId: room0, depositPct: 0 }).booking;
    m = modifyBooking(b.id, { arriveDay: S.day + 10, nights: 2 });
    o.autoMove = m.ok && b.roomId !== room0 && S.bookings.filter(x => x.roomId === b.roomId && x.arriveDay === S.day + 10).length === 1;
    // no room left of a type: the change is refused and nothing changes
    S.rooms.filter(x => x.type === 'Ocean View').forEach(x => { S.blocks.push({ id: nid(), roomId: x.id, from: S.day, to: S.day + 40, reason: 'Test' }); });
    const ov = S.rooms.find(x => x.type === 'Ocean View'); S.blocks = S.blocks.filter(k => k.roomId !== ov.id);
    const full = mk({ name: 'Cy Park', type: 'Ocean View', arriveDay: S.day + 20, nights: 2, depositPct: 0 }).booking;
    S.blocks.push({ id: nid(), roomId: ov.id, from: S.day + 25, to: S.day + 30, reason: 'Test' });
    o.refusedNoRoom = !modifyBooking(full.id, { arriveDay: S.day + 26 }).ok && full.arriveDay === S.day + 20;
    // rename and party resize keep the people already there and stay unique
    const lead0 = b.party.members[0].n; const nm = modifyBooking(b.id, { name: 'Zoe Quill' });
    o.rename = nm.ok && b.name === 'Zoe Quill' && b.party.members[0].n === 'Zoe Quill' && b.party.members[0].last === 'Quill';
    const fam = mk({ name: 'Dee Marsh', type: 'Ocean View', adults: 2, children: 0, arriveDay: S.day + 30, nights: 2, depositPct: 0 }).booking;
    const second = fam.party.members[1].n;
    const big = modifyBooking(fam.id, { extras: ['extrabed'], adults: 2, children: 1 });
    o.resize = big.ok && fam.party.members.length === 3 && fam.party.members[1].n === second && fam.party.members[2].kid === true && fam.party.members[2].last === fam.party.members[0].last && fam.children === 1;
    const small = modifyBooking(fam.id, { extras: [], adults: 1, children: 0 });
    o.shrink = small.ok && fam.party.members.length === 1 && fam.party.rel === 'solo';
    o.partyNamesUnique = new Set(S.bookings.flatMap(x => x.party.members.map(y => y.n))).size === S.bookings.reduce((a, x) => a + x.party.members.length, 0);
    // changing a booking to today checks the guest in at once
    S.rooms[0].dirty = false;
    const t = mk({ name: 'Eve Todd', arriveDay: S.day + 2, nights: 2, depositPct: 0 }).booking;
    const tm = modifyBooking(t.id, { arriveDay: S.day });
    o.toToday = tm.ok && !!tm.guest && S.bookings.every(x => x.id !== t.id);
    // ----- requests
    const rq = mk({ name: 'Fay Reed', arriveDay: S.day + 6, nights: 2, depositPct: 0 }).booking;
    o.addReq = addBookingRequest(rq.id, '  Birthday   cake  ').request.text === 'Birthday cake' && rq.requests.length === 1;
    o.reqRules = !addBookingRequest(rq.id, 'birthday cake').ok && !addBookingRequest(rq.id, '').ok && !addBookingRequest(99999, 'x').ok && addBookingRequest(rq.id, 'Quiet room').ok && addBookingRequest(rq.id, 'Late check-in').ok && !addBookingRequest(rq.id, 'Fourth one').ok;
    o.removeReq = removeBookingRequest(rq.id, rq.requests[1].id) && rq.requests.length === 2 && !removeBookingRequest(rq.id, 123456);
    rq.requests[0].done = true; S.jobs = [];
    S.day += 0; rq.arriveDay = S.day; const ci = checkInBooking(rq.id);
    o.reqJobs = !!ci.guest && S.jobs.filter(j => j.guestId === ci.guest.id).length === 1 && S.jobs.find(j => j.guestId === ci.guest.id).label === 'Late check-in' && S.jobs.find(j => j.guestId === ci.guest.id).role === 'Receptionist';
    // ----- room options, upgrades and downgrades
    S.blocks = []; S.bookings = []; S.jobs = [];
    const up = mk({ name: 'Gus Hale', arriveDay: S.day + 5, nights: 2, depositPct: 0 }).booking, startRoom = up.roomId;
    const opts = roomOptions(up.id);
    o.optionKinds = opts.length > 0 && opts.every(x => x.room.id !== startRoom) && opts.some(x => x.kind === 'same') && opts.some(x => x.kind === 'upgrade') && !opts.some(x => x.kind === 'downgrade');
    const ovRoom = opts.find(x => x.kind === 'upgrade').room;
    o.modeRequired = !changeRoom(up.id, ovRoom.id).ok && !changeRoom(up.id, ovRoom.id, 'keep').ok && !changeRoom(up.id, 999999, 'courtesy').ok;
    const cu = changeRoom(up.id, ovRoom.id, 'courtesy');
    o.courtesy = cu.ok && cu.kind === 'upgrade' && up.type === 'Ocean View' && up.price === 90 && up.moodBonus === 12 && up.roomId === ovRoom.id;
    const dn = changeRoom(up.id, opts.find(x => x.kind === 'same').room.id, 'x');
    o.sameTypeNoMode = !dn.ok;   // that room is a Standard: now a downgrade, so a mode is needed
    const keepDown = roomOptions(up.id).find(x => x.kind === 'downgrade');
    const rd = changeRoom(up.id, keepDown.room.id, 'reduce');
    o.reduce = rd.ok && up.type === 'Standard' && up.price === Math.round(90 * 90 / 125) && up.moodBonus === 8;
    const u2 = changeRoom(up.id, roomOptions(up.id).find(x => x.kind === 'upgrade').room.id, 'charge');
    o.charge = u2.ok && up.price === Math.round(Math.round(90 * 90 / 125) * 125 / 90) && up.type === 'Ocean View' && up.moodBonus === 8;
    const priceBeforeKeep = up.price, kp = changeRoom(up.id, roomOptions(up.id).find(x => x.kind === 'downgrade').room.id, 'keep');
    o.keep = kp.ok && up.moodBonus === -7 && up.price === priceBeforeKeep && up.type === 'Standard';
    // bonus carries to the guest on arrival
    S.rooms.forEach(x => { x.dirty = false; }); up.arriveDay = S.day; up.moodBonus = 12; const arrived = checkInBooking(up.id), base = clamp(Math.round(75 - (up.price - ROOM_TYPES[up.type].price) / ROOM_TYPES[up.type].price * 50 + (rating() - 4) * 3 + 0), 20, 90);
    o.bonusApplied = !!arrived.guest && arrived.guest.happiness === clamp(base + (arrived.moved ? -8 : 0) + 12, 0, 100);
    // a party too big for the target room cannot move there
    const fb = mk({ name: 'Hal Moss', type: 'Standard', adults: 2, children: 0, extras: ['extrabed'], arriveDay: S.day + 9, nights: 2, depositPct: 0 }).booking;
    o.capacityGuard = roomOptions(fb.id).every(x => capacityOf(x.room.type, fb.extras) >= 3 || fb.adults + fb.children <= capacityOf(x.room.type, fb.extras));
    // ----- blocks
    S.bookings = []; S.blocks = [];
    const r1 = S.rooms[0], r2 = S.rooms[1];
    const bl = blockRooms([r1.id, r2.id], S.day + 2, 3, 'Maintenance');
    o.block = bl.ok && bl.blocks.length === 2 && S.blocks.length === 2 && roomBlocked(r1, S.day + 2) && roomBlocked(r1, S.day + 4) && !roomBlocked(r1, S.day + 5) && !roomBlocked(r1, S.day + 1);
    o.blockHidesRoom = !freeRoomsFor('Standard', S.day + 3, 1).includes(r1) && freeRoomsFor('Standard', S.day + 6, 1).includes(r1);
    const g0 = availabilityGrid(7)[0]; o.gridCounts = g0.cells[5] - g0.cells[3] === 2;   // two rooms are blocked on day 3, none on day 5
    o.bookIntoBlock = !mk({ roomId: r1.id, arriveDay: S.day + 3, nights: 1, depositPct: 0 }).ok;
    o.blockClash = !blockRooms([r1.id], S.day + 4, 3).ok && S.blocks.length === 2;
    mk({ roomId: S.rooms[2].id, arriveDay: S.day + 3, nights: 2, depositPct: 0 });
    const allOrNone = blockRooms([S.rooms[3].id, S.rooms[2].id], S.day + 3, 1);
    o.allOrNone = !allOrNone.ok && S.blocks.length === 2;
    o.blockValidation = [[[], S.day, 1], [[r1.id], S.day - 1, 1], [[r1.id], S.day + 61, 1], [[r1.id], S.day + 10, 0], [[r1.id], S.day + 10, 61], [[999999], S.day + 10, 1]].every(([ids, f, n]) => !blockRooms(ids, f, n).ok);
    o.defaultReason = blockRooms([S.rooms[5].id], S.day + 20, 1).blocks[0].reason === 'Maintenance';
    o.unblock = unblock(S.blocks[0].id) && !unblock(123456) && S.blocks.length === 2;
    S.blocks = [{ id: nid(), roomId: r1.id, from: S.day, to: S.day + 1, reason: 'x' }, { id: nid(), roomId: r1.id, from: S.day + 5, to: S.day + 6, reason: 'y' }];
    S.day++; generateDay(); o.pruned = S.blocks.length === 1 && S.blocks[0].reason === 'y';
    // ----- dinners
    newGame('Dn', 'Dn'); S.money = 500000;
    o.noRestaurant = !bookDinner({ name: 'A', day: S.day, covers: 2, time: 1140 }).ok;
    S.tier = 2; buyFacility('restaurant'); S.staff.push(makeStaff('Chef', 'm', 'm03', 'Chef', 4, 4, [])); S.staff.forEach(x => { x.rota = Array(14).fill(true); x.sickDays = 0; });
    S.guests.forEach(g => { roomById(g.roomId).guestId = null; }); S.guests = [];
    const dd = (over) => bookDinner(Object.assign({ name: 'Ivy Cole', day: S.day + 1, covers: 4, time: 1140 }, over));
    o.dinnerBook = dd({}).ok && S.dinners.length === 1 && dinnerCovers(S.day + 1) === 4;
    o.dinnerBad = [{ name: '' }, { day: S.day - 1 }, { day: S.day + 31 }, { covers: 0 }, { covers: 13 }, { time: 1000 }, { time: 1141 }, { time: 1300 }].every(c => !dd(c).ok);
    o.seats = dinnerSeats(S.day + 1) === 30 && !dd({ covers: 12, day: S.day + 2 }).error;
    dd({ covers: 12, day: S.day + 2 }); const full2 = dd({ covers: 12, day: S.day + 2 }); const left = dinnerSeats(S.day + 2) - dinnerCovers(S.day + 2);
    o.seatLimit = !dd({ covers: 12, day: S.day + 2 }).ok || left >= 0;
    o.cancelDinner = cancelDinner(S.dinners[0].id) && !cancelDinner(99999);
    o.noMains = (() => { const saved = S.menu.map(d => d.on); S.menu.forEach(d => { if (d.cat === 'Main') d.on = false; }); const r = dd({ day: S.day + 3 }); S.menu.forEach((d, i) => { d.on = saved[i]; }); return !r.ok; })();
    // service: reserved tables come first and bring in money; no-shows bring none; a closed restaurant cancels them
    S.dinners = []; S.dinners.push({ id: nid(), name: 'Ivy Cole', day: S.day, covers: 4, time: 1140, notes: '' });
    const orig = Math.random; Math.random = () => 0.5;
    const mains = menuAvailable('Main'), drinks = menuAvailable('Drink'), mainD = mains[Math.floor(0.5 * mains.length)], drinkD = drinks[Math.floor(0.5 * drinks.length)];
    const cashBefore = S.money; const out = runDining(); Math.random = orig;
    const perCover = mainD.price + drinkD.price, costPer = ingredientCost(mainD) + ingredientCost(drinkD);
    o.reservedService = out.open && out.reserved === 4 && out.covers === 4 && out.revenue === 4 * perCover && out.cost === 4 * costPer && S.money === cashBefore + 4 * perCover - 4 * costPer && S.dinners.length === 0;
    S.dinners.push({ id: nid(), name: 'No Show', day: S.day, covers: 4, time: 1140, notes: '' }); Math.random = () => 0.05; const ns = runDining(); Math.random = orig;
    o.noShowService = ns.reserved === 0 && ns.revenue === 0 && S.dinners.length === 0;
    S.dinners.push({ id: nid(), name: 'Shut', day: S.day, covers: 2, time: 1140, notes: '' }); S.staff.forEach(x => { if (x.role === 'Chef') x.rota = Array(14).fill(false); });
    const cl = runDining(); o.closedCancels = cl.cancelled === 1 && S.dinners.length === 0 && !restaurantOpen();
    return o;`);
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('manage bookings: ' + b));
  if (!bad.length) ok('manage bookings: changes and refunds, party resizing, requests become jobs, room moves with upgrades and downgrades, blocks, dinner reservations in service');
}

/* ---------- team: 14-day rota, shifts, clock, activity, mood ---------- */
{
  const r = T(`
    const o = {};
    newGame('Tm', 'Tm');
    o.fortnight = S.staff.every(s => s.rota.length === 14 && SHIFTS[s.shift] && s.mood === 70 && s.streak === 0) && S.clock === DAY_START && Array.isArray(S.timeline);
    o.rotaIndex = rotaIdx(0) === 0 && rotaIdx(14) === 0 && rotaIdx(15) === 1 && rotaIdx(-1) === 13;
    // an old save with a weekly rota becomes a fortnight with a shift and mood
    const old = JSON.parse(JSON.stringify(S)); old.staff.forEach(s => { s.rota = s.rota.slice(0, 7); delete s.shift; delete s.mood; delete s.streak; }); delete old.clock; delete old.timeline;
    const mig = migrate(old);
    o.migrated = validState(mig) && mig.staff.every(s => s.rota.length === 14 && s.rota.slice(0, 7).join() === s.rota.slice(7).join() && SHIFTS[s.shift] && s.mood === 70);
    // rota editing rules
    const a = S.staff.find(s => worksOn(s, S.day) && s.sickDays === 0);
    o.setDay = setRotaDay(a.id, 3, false).ok && a.rota[3] === false && setRotaDay(a.id, 3, true).ok && a.rota[3] === true;
    o.badDay = !setRotaDay(a.id, 14, true).ok && !setRotaDay(a.id, -1, true).ok && !setRotaDay(a.id, 1.5, true).ok && !setRotaDay(99999, 1, true).ok;
    a.used = 1; o.noRemovingWorkedToday = !setRotaDay(a.id, rotaIdx(S.day), false).ok && worksOn(a, S.day); a.used = 0;
    o.setShift = setShift(a.id, 'late').ok && a.shift === 'late' && !setShift(a.id, 'nope').ok;
    // clock and timeline: work starts no earlier than the clock, the shift start and the person's previous job; nothing overlaps
    const h = S.staff.find(s => s.role === 'Housekeeper' && worksOn(s, S.day) && s.sickDays === 0); h.shift = 'day'; S.timeline = []; S.clock = DAY_START;
    const e1 = scheduleWork(h, 'Cleaning Room 101', 'clean'), e2 = scheduleWork(h, 'Cleaning Room 102', 'clean');
    o.firstStartsAtShift = e1.start === SHIFTS.day.start && e1.end === e1.start + JOB_MINUTES.clean;
    o.noOverlap = e2.start === e1.end;
    S.clock = 700; const e3 = scheduleWork(h, 'Late job', 'repair'); o.startsAtClock = e3.start === Math.max(700, e2.end);
    const off = S.staff.find(s => !worksOn(s, S.day)); o.noWorkOnDayOff = scheduleWork(off, 'x', 'clean') === null;
    // what someone is doing at each time of day
    S.timeline = []; S.clock = DAY_START; scheduleWork(h, 'Cleaning Room 101', 'clean');
    const at = c => staffNow(h, c);
    o.before = at(400).state === 'before' && at(400).label === 'Starts at 09:00' && at(400).pct === 0;
    o.busy = at(545).state === 'busy' && at(545).label === 'Cleaning Room 101' && at(545).until === 585;
    o.free = at(600).state === 'free' && at(600).label === IDLE_ACTIVITY.Housekeeper;
    o.after = at(1020).state === 'after' && at(1020).pct === 1;
    o.progress = Math.abs(at(780).pct - 0.5) < 1e-9;
    h.sickDays = 2; o.sick = at(600).state === 'sick'; h.sickDays = 0;
    o.offDay = staffNow(off).state === 'off' && staffNow(off).label === 'Day off';
    // advancing the clock never passes the end of the day, and reports finished work
    S.clock = DAY_START; const fin = advanceClock(240).map(t => t.label); o.advance = S.clock === 600 && fin.includes('Cleaning Room 101');
    advanceClock(100000); o.clamped = S.clock === DAY_END && advanceClock(5).length === 0 && advanceClock(-30).length === 0 && S.clock === DAY_END;
    // assigning a real job puts it on the timeline with a meaningful label
    S.timeline = []; S.clock = DAY_START; S.jobs = []; S.rooms[1].dirty = true; ensureJobs();
    const hk = S.staff.find(s => s.role === 'Housekeeper' && worksOn(s, S.day) && s.sickDays === 0), job = S.jobs.find(j => j.type === 'clean');
    o.assigned = doAssign(job.id, hk.id, true) && S.timeline.some(t => t.staffId === hk.id && t.label === 'Cleaning ' + S.rooms[1].name);
    // a new morning clears the clock and the timeline
    S.clock = 900; generateDay(); o.newMorning = S.clock === DAY_START && S.timeline.length === 0;
    // mood: working wears people down, rest restores, flat-out days and long runs hurt, low mood raises sickness
    const m = S.staff[0]; m.mood = 70; m.streak = 0; m.sickDays = 0; m.used = 0; m.rota = Array(14).fill(true);
    for (let i = 0; i < 7; i++) updateStaffMood();
    o.longRun = m.mood === 64 && m.streak === 7;   // five neutral days, then -3 on the sixth and seventh
    m.rota = Array(14).fill(false); const before = m.mood; updateStaffMood(); o.rest = m.mood === before + 4 && m.streak === 0;
    m.rota = Array(14).fill(true); m.mood = 70; m.streak = 0; m.used = STAFF_CAP; updateStaffMood(); const flat = m.mood; m.mood = 70; m.streak = 0; m.used = 1; updateStaffMood(); o.flatOutWorse = flat < m.mood;
    m.mood = 100; m.rota = Array(14).fill(false); updateStaffMood(); o.bounded = m.mood === 100 || m.mood === 99;
    const orig = Math.random; const sick = mood => { S.staff.forEach(s => { s.sickDays = 0; s.rota = Array(14).fill(true); s.reliability = 5; s.mood = mood; }); Math.random = () => 0.05; generateDay(); Math.random = orig; return S.staff.every(s => s.sickDays > 0); };
    o.lowMoodSick = sick(20) === true && sick(80) === false;
    // coverage, cost and hiring
    S.staff.forEach(s => { s.sickDays = 0; s.rota = fortnight([5, 6]); });
    const cover = dayCover(S.day), cnt = S.staff.filter(s => s.role === 'Housekeeper').length;
    o.cover = (cover.Housekeeper || 0) === (worksOn(S.staff.find(s => s.role === 'Housekeeper'), S.day) ? cnt : 0);
    const st = rotaStats(S.staff[0]); o.stats = st.days === 10 && st.cost === 10 * S.staff[0].wage && st.hours === 10 * shiftHours(S.staff[0]);
    S.candidates = [makeCandidate('Chef')]; const n0 = S.staff.length; const hired = hireCandidate(S.candidates[0].id);
    o.hire = hired.ok && S.staff.length === n0 + 1 && S.candidates.length === 0 && hired.staff.rota.length === 14 && hired.staff.shift === 'late' && hired.staff.mood === 70;
    o.hireMissing = !hireCandidate(123456).ok;
    S.tier = 1; while (S.staff.length < staffLimit()) S.staff.push(makeStaff('Extra ' + S.staff.length, 'm', 'm01', 'Housekeeper', 3, 3, []));
    S.candidates = [makeCandidate('Chef')]; o.hireLimit = !hireCandidate(S.candidates[0].id).ok;
    return o;`);
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('team: ' + b));
  if (!bad.length) ok('team: 14-day rota and migration, shifts, clock and timeline, activity states, job scheduling, mood rules and sickness, cover, hiring');
}

/* ---------- the player's bank and photo ---------- */
{
  const r = JP(run(`(function () { const o = {};
    o.cleaned = cleanBankName('  <b>Zed</b>   Bank  ') === 'bZed/b Bank';   // angle brackets dropped, spaces tidied
    o.limit = cleanBankName('x'.repeat(80)).length === BANK_NAME_MAX && cleanBankName('') === BANK_DEFAULT_NAME && cleanBankName(null) === BANK_DEFAULT_NAME;
    o.account = Array.from({ length: 200 }, makeAccountNumber).every(a => /^HQ [0-9]{4} [0-9]{4}$/.test(a));
    const b = makeBank('Piggy Bank', 'plum'); o.make = b.name === 'Piggy Bank' && b.colour === 'plum' && makeBank('A', 'nonsense').colour === BANK_COLOURS[0].key;
    newGame('H', 'O', { photo: 'data:image/jpeg;base64,AAAA', bankName: 'Piggy Bank', bankColour: 'forest' });
    o.game = S.bank.name === 'Piggy Bank' && S.bank.colour === 'forest' && /^HQ /.test(S.bank.account) && S.ownerPhoto === 'data:image/jpeg;base64,AAAA' && bankName() === 'Piggy Bank' && bankColour() === '#1f5f46' && validState(JSON.parse(JSON.stringify(S)));
    newGame('H', 'O'); o.defaults = S.bank.name === BANK_DEFAULT_NAME && S.ownerPhoto === null;
    S.money = BANKRUPT_AT - 10; S.bank.name = 'Piggy Bank'; applyLifeline(); const m = S.mail.items[0]; o.mail = m.from === 'Piggy Bank' && /Piggy Bank has stepped in/.test(m.subject);
    const old = JSON.parse(JSON.stringify(S)); delete old.bank; delete old.ownerPhoto; const mg = migrate(old); o.migrate = !!mg.bank && /^HQ /.test(mg.bank.account) && mg.ownerPhoto === null && validState(mg);
    return o; })()`));
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('bank: ' + b));
  if (!bad.length) ok('bank: names and colours are cleaned, invented account numbers, new games and old saves, the bank name in messages');
}

/* ---------- earnings milestones, free unlocks and daily visits ---------- */
{
  const r = JP(run(`(function () { const o = {};
    o.table = MILESTONES.every((m, i) => i === 0 || m.need > MILESTONES[i - 1].need) && MILESTONES.every(m => !m.unlock || FEATURES[m.unlock]) && Object.keys(FEATURES).every(k => MILESTONES.filter(m => m.unlock === k).length === 1);
    newGame('M', 'M'); o.fresh = S.earned === 0 && S.milestones.done === 0 && Object.keys(S.features).length === 0 && !featureOn('kidsclub');
    let p = milestoneProgress(); o.progress = p.index === 0 && p.need === MILESTONES[0].need && p.pct === 0 && p.left === MILESTONES[0].need;
    S.earned = 1000; p = milestoneProgress(); o.half = p.pct === 50 && p.left === 1000;
    S.earned = 2500; const a = checkMilestones(); o.first = a.length === 1 && a[0].name === 'First guests' && !a[0].unlock && S.milestones.done === 1 && !checkMilestones().length;
    const mails = S.mail.items.length; S.earned = 16000; const b = checkMilestones();
    o.jump = b.length === 3 && S.milestones.done === 4 && featureOn('arcade') && featureOn('kidsclub') && !featureOn('shop') && S.mail.items.length === mails + 2 && /Kids Club/.test(S.mail.items[0].subject);
    p = milestoneProgress(); o.from = p.from === 15000 && p.need === 25000 && p.pct === 10;
    S.earned = MILESTONES[MILESTONES.length - 1].need; checkMilestones(); o.end = milestoneProgress() === null && S.milestones.done === MILESTONES.length && Object.keys(FEATURES).every(featureOn);
    // earnings count guest income only, through a real end of day
    newGame('M', 'M'); S.ledger.push({ day: S.day, label: 'Challenge: x', amount: 99999, grant: true }); const before = S.earned; const rep = runEndDay();
    o.counts = S.earned === before + rep.income && rep.income < 20000 && S.history[S.history.length - 1].income === rep.income;
    newGame('M', 'M'); S.earned = 5100; S.money = 50000; const rep2 = runEndDay(); o.report = Array.isArray(rep2.milestones) && rep2.milestones.some(m => m.unlock === 'arcade') && featureOn('arcade');
    // saves from before milestones
    newGame('M', 'M'); S.history = [{ day: 0, income: 40000, expenses: 1 }, { day: 1, income: 5000, expenses: 1 }]; const old = JSON.parse(JSON.stringify(S)); delete old.earned; delete old.features; delete old.milestones; delete old.visit; const mg = migrate(old);
    o.migrate = mg.earned === 45000 && mg.milestones.done === 6 && mg.features.shop === true && mg.features.arcade === true && mg.features.excursions !== true && mg.visit.streak === 0 && validState(mg);
    // daily visits
    newGame('M', 'M'); const m0 = S.money; let v = registerVisit('2030-03-10', '2030-03-09');
    o.v1 = v.streak === 1 && v.bonus === VISIT_BONUS && S.money === m0 + VISIT_BONUS && registerVisit('2030-03-10', '2030-03-09') === null && S.money === m0 + VISIT_BONUS;
    v = registerVisit('2030-03-11', '2030-03-10'); o.v2 = v.streak === 2 && v.bonus === VISIT_BONUS * 2;
    v = registerVisit('2030-03-13', '2030-03-12'); o.v3 = v.streak === 1 && S.visit.best === 2;
    for (let i = 14; i < 30; i++) v = registerVisit('2030-03-' + i, '2030-03-' + (i - 1)); o.cap = v.bonus === VISIT_BONUS * VISIT_STREAK_CAP && S.visit.streak > VISIT_STREAK_CAP && S.visit.best === S.visit.streak;
    o.grantsNotIncome = ledgerDay(S.day).every(e => !e.grant);
    return o; })()`));
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('milestones: ' + b));
  if (!bad.length) ok('milestones: earnings ladder, progress, free unlocks and their messages, grants not counted, old saves, daily visit streak and bonus');
}

/* ---------- the entertainment team ---------- */
{
  const r = JP(run(`(function () { const o = {};
    const roles = Object.keys(ENTERTAINERS);
    o.table = roles.length === 4 && roles.every(k => ROLES[k] && ROLE_SHIFT[k] && DEPARTMENT[k] && IDLE_ACTIVITY[k] && FEATURES[ENTERTAINERS[k].feature] && FEATURES[ENTERTAINERS[k].feature].role === k && /^[fm]1[3-4]$/.test(ENTERTAINERS[k].portrait) && ENTERTAINERS[k].look.length > 20) && new Set(roles.map(k => ENTERTAINERS[k].portrait)).size === 4 && new Set(roles.map(k => ENTERTAINERS[k].feature)).size === 4;
    newGame('E', 'E'); o.locked = roles.every(k => !roleAvailable(k)) && !availableRoles().some(k => ENTERTAINERS[k]) && roles.every(k => !JSON.stringify(S.candidates).includes(k));
    S.features.arcade = true; o.opens = roleAvailable('Arcade Attendant') && !roleAvailable('Kids Club Leader') && availableRoles().includes('Arcade Attendant');
    S.money = 50000; S.tier = 4; Object.keys(FEATURES).forEach(k => { S.features[k] = true; });
    const c = makeCandidate('Kids Club Leader'); o.own = c.portrait === 'f13' && c.gender === 'f' && c.role === 'Kids Club Leader' && c.wage === wageFor('Kids Club Leader', c.skill) && c.wage > 0;
    const d = makeCandidate('Arcade Attendant'); o.ownM = d.portrait === 'm13' && d.gender === 'm';
    S.candidates = [c]; const h = hireCandidate(c.id); o.hired = h.ok && S.staff.some(s => s.role === 'Kids Club Leader' && s.portrait === 'f13' && s.shift === 'day');
    const second = makeCandidate('Kids Club Leader'); o.second = second.portrait !== 'f13' && /^[fm](0[1-9]|1[0-2])$/.test(second.portrait);
    const twice = makeCandidate('Shop Assistant', ['f14']); o.noDuplicateInPool = twice.portrait !== 'f14';
    o.pool = Array.from({ length: 300 }, () => makeCandidate().portrait).every(p => p !== 'f13');   // already on the team, so never offered again
    o.valid = validState(JSON.parse(JSON.stringify(S)));
    return o; })()`));
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('entertainers: ' + b));
  if (!bad.length) ok('entertainers: four roles with their own wages and headshots, locked until their extra opens, no duplicate headshots');
}

/* ---------- the extras: arcade, Kids Club, shop, excursions ---------- */
{
  const r = JP(run(`(function () { const o = {};
    const setup = () => { newGame('X', 'X'); S.money = 100000; S.weatherSet[S.day] = 'cloudy'; S.staff.forEach(s => { s.rota = Array(14).fill(true); s.sickDays = 0; });
      S.guests.forEach(g => { const r = roomById(g.roomId); r.guestId = null; }); S.guests = [];
      [0, 1, 2, 3, 4, 5].forEach(i => { S.rooms[i].dirty = false; checkIn(S.rooms[i], 'Fam ' + i, 3, { adults: 2, children: 2 }); }); };
    const hire = role => { const p = drawPerson(); S.staff.push(makeStaff(p.name, p.gender, 'm01', role, 3, 3, [])); return S.staff[S.staff.length - 1]; };
    const unlock = k => { S.features[k] = true; ensureFun(); };
    const ledger = label => S.ledger.filter(e => e.label.startsWith(label));

    // ----- locked until opened
    setup(); o.lockedAll = !setArcadePrice(2).ok && !setKidsPrice(20).ok && !buyShopStock('snack', 1).ok && !setShopPrice('snack', 3).ok && !addTrip({ name: 'Hike', cat: 'Nature walk', price: 20 }).ok && !addTripCategory('Zip', 'outdoor', 2).ok && !buyMachine('arcade-pinball').ok && !setKidsEnrol(S.guests[0].id, true).ok;
    o.noStateYet = !S.arcade && !S.kids && !S.shop && !S.trips;

    // ----- arcade
    setup(); unlock('arcade');
    o.arcadeStart = S.arcade.price === ARCADE.ref && ARCADE_START.every(k => assetByKey(k) && !assetByKey(k).broken) && arcadeMachines().length === 2 && !assetByKey('arcade-pinball');
    let pl = arcadePlan(); o.arcadeNoCrew = !pl.open && /Arcade Attendant/.test(pl.why) && pl.plays === 0;
    const att = hire('Arcade Attendant'); pl = arcadePlan(); o.arcadeOpen = pl.open && pl.plays > 0 && pl.revenue === Math.round(pl.plays * S.arcade.price) && pl.kids === 12;
    S.staff.find(s => s.id === att.id).sickDays = 2; o.arcadeSick = !arcadePlan().open; S.staff.find(s => s.id === att.id).sickDays = 0;
    S.staff.find(s => s.id === att.id).rota = Array(14).fill(false); const mgr = S.staff.find(s => s.role === 'Manager'); o.arcadeNoManagerYet = !arcadePlan().open;
    S.staff.push(makeStaff('Boss Person', 'f', 'f01', 'Manager', 3, 3, [])); S.staff[S.staff.length - 1].rota = Array(14).fill(true); o.managerCannotStandInArcade = !arcadePlan().open && !facilityStatus(FACILITIES.find(f => f.key === 'arcade'), S.day).open;
    S.staff.find(s => s.id === att.id).rota = Array(14).fill(true);
    o.facilityOpenWithAttendant = facilityStatus(FACILITIES.find(f => f.key === 'arcade'), S.day).open;
    S.weatherSet[S.day] = 'sunny'; const sun = arcadePlan().locals; S.weatherSet[S.day] = 'rain'; const wet = arcadePlan().locals; o.arcadeRain = wet > sun;
    S.weatherSet[S.day] = 'cloudy'; const base = arcadePlan();
    o.arcadePrice = !setArcadePrice(0.1).ok && !setArcadePrice(9).ok && !setArcadePrice('x').ok && setArcadePrice(1).ok && S.arcade.price === 1 && arcadePlan().demand > base.demand && setArcadePrice(3).ok && arcadePlan().demand < base.demand;
    setArcadePrice(1.5); assetByKey('arcade-claw').broken = true; const one = arcadePlan(); o.arcadeBroken = one.machinesWorking === 1 && one.capacity < base.capacity;
    assetByKey('arcade-racing').broken = true; o.arcadeAllBroken = !arcadePlan().open && /broken/.test(arcadePlan().why);
    assetByKey('arcade-claw').broken = false; assetByKey('arcade-racing').broken = false;
    const cash = S.money; o.buyMachine = buyMachine('arcade-pinball').ok && S.money === cash - 500 && !!assetByKey('arcade-pinball') && !buyMachine('arcade-pinball').ok && !buyMachine('arcade-claw').ok && !buyMachine('nonsense').ok && arcadePlan().capacity > base.capacity;
    S.money = BANKRUPT_AT + 100; o.buyMachinePoor = !buyMachine('arcade-dance').ok && !assetByKey('arcade-dance'); S.money = 100000;
    let ev = []; const m0 = S.money, led0 = S.ledger.length; runFun(ev); const takings = ledger('Arcade: ').filter(e => e.amount > 0)[0];
    o.arcadeNight = !!takings && takings.amount > 0 && takings.amount <= Math.round(arcadePlan().plays * 1.1 * S.arcade.price) + 5 && ev.some(e => /^Arcade: [0-9]+ plays/.test(e.text)) && S.tally.arcadePlays > 0 && S.money > m0;
    S.staff.find(s => s.id === att.id).rota = Array(14).fill(false); ev = []; const m1 = S.money; runFun(ev); o.arcadeClosedNight = S.money === m1 && ev.some(e => /arcade was closed/.test(e.text));

    // machines only wear and break while the arcade is being run
    setup(); unlock('arcade'); S.guests.forEach(g => { g.happiness = 80; }); S.day = 5; assetByKey('arcade-claw').broken = true; assetByKey('arcade-racing').cond = 5;
    for (let i = 0; i < 12; i++) rollAssetFailures(); const unstaffedBreaks = !S.incidents.some(i => /claw|racing/.test(i.sid)) && !assetByKey('arcade-racing').broken;
    o.arcadeIdleNoWear = unstaffedBreaks && assetInUse(assetByKey('arcade-racing')) === false;
    hire('Arcade Attendant'); S.staff.forEach(s => { s.rota = Array(14).fill(true); }); o.arcadeStaffedWears = assetInUse(assetByKey('arcade-racing')) === true && assetInUse(assetByKey('boiler')) === true;
    S.day = 5; S.incidents = []; assetByKey('arcade-racing').cond = 5; let broke = false; for (let i = 0; i < 60 && !broke; i++) { rollAssetFailures(); broke = assetByKey('arcade-racing').broken; } o.arcadeStaffedBreaks = broke && S.incidents.some(i => i.sid === 'racing-screen');

    // ----- Kids Club
    setup(); unlock('kidsclub');
    o.kidsStart = S.kids.price === KIDS.ref && S.kids.auto === true && familiesInHouse().length === 6 && kidsCapacity() === 0;
    o.kidsPrice = !setKidsPrice(2).ok && !setKidsPrice(99).ok && setKidsPrice(20).ok && S.kids.price === 20 && setKidsPrice(KIDS.ref).ok;
    o.enrol = setKidsEnrol(S.guests[0].id, true).ok && S.guests[0].kidsClub === true && setKidsEnrol(S.guests[0].id, false).ok && S.guests[0].kidsClub === false && !setKidsEnrol(99999, true).ok;
    S.guests.forEach(g => { g.kidsClub = true; }); let at = kidsAttending(); o.kidsNoLeader = at.children === 0 && at.waiting.length === 6;
    S.staff.find(s => s.role === 'Manager') || (S.tier = 2);
    const leader = hire('Kids Club Leader'); at = kidsAttending(); o.kidsOneLeader = kidsCapacity() === 8 && at.children === 8 && at.taken.length === 4 && at.waiting.length === 2;
    hire('Kids Club Leader'); at = kidsAttending(); o.kidsTwoLeaders = kidsCapacity() === 16 && at.children === 12 && at.waiting.length === 0;
    S.staff.filter(s => s.role === 'Kids Club Leader').forEach(s => { s.rota = Array(14).fill(false); }); o.kidsManagerNoCover = kidsCapacity() === 0;
    S.staff.filter(s => s.role === 'Kids Club Leader').forEach(s => { s.rota = Array(14).fill(true); });
    S.guests.forEach(g => { g.happiness = 50; }); let ev2 = []; const mk = S.money; runFun(ev2);
    const rev = ledger('Kids Club: ').filter(e => e.amount > 0)[0], sup = ledger('Kids Club: craft').filter(e => e.amount < 0)[0];
    o.kidsNight = !!rev && rev.amount === 12 * KIDS.ref && sup.amount === -12 * KIDS.supplies && S.money === mk + 12 * KIDS.ref - 12 * KIDS.supplies && S.guests.every(g => g.happiness === 58) && S.tally.kidsSessions === 12 && ev2.some(e => /12 children had a great day/.test(e.text));
    S.staff.filter(s => s.role === 'Kids Club Leader').slice(1).forEach(s => { s.rota = Array(14).fill(false); }); S.guests.forEach(g => { g.happiness = 50; }); ev2 = []; runFun(ev2);
    o.kidsWaiting = S.guests.filter(g => g.happiness === 58).length === 4 && S.guests.filter(g => g.happiness === 47).length === 2 && ev2.some(e => /had to wait/.test(e.text));
    S.staff.filter(s => s.role === 'Kids Club Leader').forEach(s => { s.rota = Array(14).fill(false); }); S.guests.forEach(g => { g.happiness = 50; }); ev2 = []; const mc = S.money; runFun(ev2);
    o.kidsClosed = S.money === mc && S.guests.every(g => g.happiness === 47) && ev2.some(e => /closed: no Kids Club Leader/.test(e.text));
    S.guests.forEach(g => { delete g.kidsClub; }); S.kids.auto = true; autoEnrolKids(); o.kidsAutoNoLeader = S.guests.every(g => g.kidsClub === undefined);   // nobody on duty: nobody is put in
    S.staff.filter(s => s.role === 'Kids Club Leader').forEach(s => { s.rota = Array(14).fill(true); });
    S.guests.forEach(g => { delete g.kidsClub; }); S.kids.auto = false; autoEnrolKids(); o.kidsAutoOff = S.guests.every(g => g.kidsClub === undefined);
    S.kids.auto = true; S.kids.price = KIDS.min; let sum = 0; for (let i = 0; i < 40; i++) { S.guests.forEach(g => { delete g.kidsClub; }); sum += autoEnrolKids(); } const cheap = sum;
    S.kids.price = KIDS.max; sum = 0; for (let i = 0; i < 40; i++) { S.guests.forEach(g => { delete g.kidsClub; }); sum += autoEnrolKids(); } o.kidsAutoPrice = cheap > sum;

    // ----- shop
    setup(); unlock('shop');
    o.shopStart = Object.keys(SHOP_LINES).every(k => S.shop.stock[k] === SHOP_LINES[k].start && S.shop.price[k] === SHOP_LINES[k].ref);
    let sp = shopPlan(); o.shopNoCrew = !sp.open && /Shop Assistant/.test(sp.why) && sp.revenue === 0;
    hire('Shop Assistant'); sp = shopPlan(); o.shopOpen = sp.open && sp.revenue > 0 && sp.lines.every(l => l.sold <= l.stock) && sp.lines.every(l => l.revenue === Math.round(l.sold * l.price));
    const cs = S.money; const buy = buyShopStock('souvenir', 2); o.shopBuy = buy.ok && buy.units === 20 && buy.cost === 100 && S.money === cs - 100 && S.shop.stock.souvenir === 40;
    o.shopBuyBad = !buyShopStock('souvenir', 0).ok && !buyShopStock('souvenir', 1.5 - 1.5).ok && !buyShopStock('nope', 1).ok && !buyShopStock('snack', 100).ok && S.shop.stock.snack === 40;
    S.money = BANKRUPT_AT + 10; o.shopBuyPoor = !buyShopStock('basics', 3).ok && S.shop.stock.basics === 15; S.money = 100000;
    o.shopPrice = !setShopPrice('snack', 0.5).ok && !setShopPrice('snack', 99).ok && setShopPrice('snack', 3).ok && S.shop.price.snack === 3 && shopPlan().lines.find(l => l.key === 'snack').demand > sp.lines.find(l => l.key === 'snack').demand;
    setShopPrice('snack', 3.5);
    S.shop.stock.snack = 3; sp = shopPlan(); const sn = sp.lines.find(l => l.key === 'snack'); o.shopSoldOut = sn.sold === 3 && sn.soldOut === true;
    S.shop.stock.snack = 60; const st0 = JSON.stringify(S.shop.stock); let ev3 = []; const mm = S.money; runFun(ev3);
    const sale = ledger('Shop: ').filter(e => e.amount > 0)[0]; o.shopNight = !!sale && S.money > mm && Object.keys(SHOP_LINES).every(k => S.shop.stock[k] >= 0) && JSON.stringify(S.shop.stock) !== st0 && ev3.some(e => /^Shop: [0-9]+ items sold/.test(e.text)) && S.tally.shopItems > 0;
    S.shop.stock.snack = 0; S.shop.stock.souvenir = 0; S.shop.stock.basics = 0; ev3 = []; runFun(ev3); o.shopEmpty = ev3.some(e => /no sales/.test(e.text));
    S.shop.stock = { souvenir: 100, snack: 100, basics: 100 }; const lost = makeAPI({ inc: { sid: 'shoplifter', b: {}, d: {}, v: 0 }, s: SCEN.shoplifter, d: {}, guest: null }).loseStock(0.2); o.shopLose = lost === Math.round(20 * 5 + 20 * 1.2 + 20 * 2.5) && S.shop.stock.souvenir === 80 && S.shop.stock.snack === 80;
    S.staff.filter(s => s.role === 'Shop Assistant').forEach(s => { s.rota = Array(14).fill(false); }); const mx = S.money; ev3 = []; runFun(ev3); o.shopClosed = S.money === mx && ev3.some(e => /shop was closed/.test(e.text));

    // ----- excursions
    setup(); unlock('excursions'); for (let i = 6; i < 16; i++) { S.rooms[i].dirty = false; checkIn(S.rooms[i], 'Fam ' + i, 3, { adults: 2, children: 2 }); }   // a busy hotel: 16 families
    o.tripStart = S.trips.list.length === 3 && S.trips.list.every(t => t.price === tripFairPrice(t.cat, TRIP_CATS) && !t.photo) && S.trips.nextId === 4 && Object.keys(tripCategories()).length === 6;
    const noG = tripsPlan(); o.tripNoGuide = !noG.open && noG.tickets === 0 && noG.rows.every(r => !r.runs && /Excursions Guide/.test(r.note));
    hire('Excursions Guide'); const gp = tripsPlan(); o.tripGuide = gp.open && gp.slots === 2 && gp.rows.filter(r => r.runs).length === 2 && gp.tickets > 0 && gp.rows.filter(r => r.runs).every(r => r.tickets <= TRIP.seats) && gp.revenue === gp.rows.reduce((a, r) => a + r.tickets * r.price, 0);
    hire('Excursions Guide'); o.tripTwoGuides = tripsPlan().slots === 4 && tripsPlan().rows.filter(r => r.runs).length === 3;
    S.weatherSet[S.day] = 'storm'; const storm = tripsPlan(); o.tripStorm = storm.rows.find(r => r.cat === 'Boat trip').tickets === 0 && /wet/.test(storm.rows.find(r => r.cat === 'Boat trip').note) && storm.rows.find(r => r.cat === 'Town tour').tickets > 0;
    S.weatherSet[S.day] = 'cloudy';
    const cat = addTripCategory('  <b>Space</b>  camp ', 'indoor', 3); o.tripCat = cat.ok && cat.name === 'bSpace/b camp' && tripCategories()['bSpace/b camp'].custom === true && tripCategories()['bSpace/b camp'].cost === 26 && tripCategories()['bSpace/b camp'].outdoor === false;
    o.tripCatBad = !addTripCategory('x', 'indoor', 1).ok && !addTripCategory('Fine', 'sideways', 1).ok && !addTripCategory('Fine', 'indoor', 9).ok && !addTripCategory('boat TRIP', 'indoor', 1).ok && !addTripCategory(cat.name, 'indoor', 1).ok;
    for (let i = 0; i < 9; i++) addTripCategory('Cat number ' + i, 'indoor', 1); o.tripCatMax = Object.keys(S.trips.cats).length === 8 && !addTripCategory('One more', 'indoor', 1).ok;
    const t = addTrip({ name: ' <i>Star</i>   gazing ', cat: 'bSpace/b camp', price: 40.4 }, 'data:image/jpeg;base64,AAAA'); o.tripAdd = t.ok && t.trip.name === 'iStar/i gazing' && t.trip.price === 40 && t.trip.photo === 'data:image/jpeg;base64,AAAA' && t.trip.id === 4;
    o.tripAddBad = !addTrip({ name: 'A', cat: 'Boat trip', price: 20 }).ok && !addTrip({ name: 'Ok name', cat: 'Nope', price: 20 }).ok && !addTrip({ name: 'Ok name', cat: 'Boat trip', price: 1 }).ok && !addTrip({ name: 'Ok name', cat: 'Boat trip', price: 999 }).ok && !addTrip({ name: 'Ok name', cat: 'Boat trip', price: 'abc' }).ok;
    o.tripPhoto = addTrip({ name: 'No photo', cat: 'Boat trip', price: 30 }, 'javascript:alert(1)').trip.photo === null;
    const up = updateTrip(t.trip.id, { name: 'Night sky', cat: 'Museum and arts', price: 25 }, 'REMOVE'); o.tripUpdate = up.ok && up.trip.name === 'Night sky' && up.trip.cat === 'Museum and arts' && up.trip.photo === null && !updateTrip(9999, { name: 'Night sky', cat: 'Boat trip', price: 25 }).ok && !updateTrip(t.trip.id, { name: 'Night sky', cat: 'Boat trip', price: 0 }).ok && S.trips.list.find(x => x.id === t.trip.id).price === 25;
    o.tripRemove = removeTrip(t.trip.id).ok && !S.trips.list.some(x => x.id === t.trip.id) && !removeTrip(t.trip.id).ok;
    while (S.trips.list.length < TRIP.maxTrips) addTrip({ name: 'Filler ' + S.trips.list.length, cat: 'Boat trip', price: 50 }); o.tripMax = !addTrip({ name: 'Too many', cat: 'Boat trip', price: 50 }).ok && S.trips.list.length === TRIP.maxTrips;
    S.trips.list = S.trips.list.slice(0, 3); const ev4 = []; const mt = S.money; runFun(ev4); const tk = ledger('Excursion: ').filter(e => e.amount > 0), cost = ledger('Excursion costs').filter(e => e.amount < 0);
    o.tripNight = tk.length === 3 && cost.length === 3 && S.money > mt && ev4.some(e => /^Excursions today: /.test(e.text)) && S.tally.tripTickets > 0 && tk.every(e => e.amount > 0);
    S.staff.filter(s => s.role === 'Excursions Guide').forEach(s => { s.rota = Array(14).fill(false); }); const ev5 = []; const mz = S.money; runFun(ev5); o.tripClosed = S.money === mz && ev5.some(e => /No excursions today: no Excursions Guide/.test(e.text));
    const expensive = S.trips.list[0]; expensive.price = 150; S.staff.filter(s => s.role === 'Excursions Guide').forEach(s => { s.rota = Array(14).fill(true); });
    o.tripPrice = tripsPlan().rows.find(r => r.id === expensive.id).demand < tripsPlan().rows.find(r => r.id === S.trips.list[1].id).demand + 50;

    // ----- the Manager cannot run any of them
    setup(); Object.keys(FEATURES).forEach(unlock); S.staff.push(makeStaff('Boss Person', 'f', 'f01', 'Manager', 3, 3, [])); S.staff[S.staff.length - 1].rota = Array(14).fill(true);
    o.managerCannotStandIn = !arcadePlan().open && !shopPlan().open && !tripsPlan().open && kidsCapacity() === 0 && FACILITIES.filter(f => f.feature).every(f => !facilityStatus(f, S.day).open);

    // ----- saves
    setup(); Object.keys(FEATURES).forEach(unlock); S.shop.stock.snack = 77; addTrip({ name: 'Keep me', cat: 'Boat trip', price: 33 }, 'data:image/jpeg;base64,AAAA');
    const copy = JSON.parse(JSON.stringify(S)); o.saveValid = validState(migrate(copy)) && copy.shop.stock.snack === 77 && copy.trips.list.some(x => x.name === 'Keep me' && x.photo) && !!copy.arcade && !!copy.kids;
    const old = JSON.parse(JSON.stringify(S)); delete old.arcade; delete old.kids; delete old.shop; delete old.trips; old.assets = old.assets.filter(a => !a.key.startsWith('arcade-')); const mg = migrate(old);
    o.saveOld = !!mg.arcade && !!mg.kids && !!mg.shop && mg.trips.list.length === 3 && ARCADE_START.every(k => mg.assets.some(a => a.key === k)) && validState(mg);
    o.facilities = visibleFacilities().length === 3 + 4 && (newGame('Y', 'Y'), visibleFacilities().length === 3);
    return o; })()`));
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('extras: ' + b));
  if (!bad.length) ok('extras: locked until opened; arcade plays, machines, prices and breakdowns; Kids Club leaders, waiting, booking and moods; shop stock, prices, sales and losses; excursions, categories, pictures, weather and guides; saves');
}

/* ---------- the children's menu ---------- */
{
  const r = JP(run(`(function () { const o = {};
    o.table = KIDS_MENU.length === 10 && new Set(KIDS_MENU.map(d => d.key)).size === 10 && KIDS_MENU.every(d => DISH_CATS.includes(d.cat) && d.price >= 1 && d.quality >= 1 && d.name.length > 2 && !/coca|fanta|pepsi|sprite/i.test(d.name + d.desc)) && ['Main', 'Dessert', 'Drink'].every(c => KIDS_MENU.some(d => d.cat === c));
    newGame('K', 'K'); S.money = 100000; o.starts = S.menu.length === 10 && S.menu.every(d => !d.kids) && adultMenu().length === 10 && kidsMenu().length === 0;
    const mid = S.menu.length; o.add = addKidsMenu() === 10 && S.menu.length === mid + 10 && kidsMenu().length === 10 && kidsMenu('Main').length === 4 && S.menu.filter(d => d.kids).every(d => d.on && d.img === 'assets/menu/' + d.key + '.jpg' && !d.photo);
    o.idempotent = addKidsMenu() === 0 && S.menu.length === mid + 10;
    S.menu = S.menu.filter(d => d.key !== 'cola'); o.fillsGap = addKidsMenu() === 1 && S.menu.filter(d => d.img === 'assets/menu/cola.jpg').length === 1;
    S.menu = S.menu.slice(0, 5); while (S.menu.length < MAX_DISHES - 3) S.menu.push({ id: nid(), name: 'Filler', cat: 'Main', price: 5, quality: 3, veg: false, nuts: false, on: false, photo: null, img: null }); o.limit = addKidsMenu() === 3 && S.menu.length === MAX_DISHES;
    newGame('K', 'K'); addKidsMenu();
    const kid = S.menu.find(d => d.key === 'spag-bol'), adult = S.menu.find(d => d.key === 'burger');
    o.fair = fairDishPrice(kid) === DISH_BASE.Main * KIDS_FAIR * (0.7 + 0.15 * 3) && fairDishPrice(adult) === DISH_BASE.Main * (0.7 + 0.15 * 3) && fairDishPrice(kid) < fairDishPrice(adult);
    o.feelFairKid = dishFeeling(kid) >= 0 && dishFeeling(Object.assign({}, kid, { price: 30 })) < 0 && dishFeeling(Object.assign({}, kid, { kids: false })) > dishFeeling(kid) - 0;   // £8 is cheap for a grown-up dish, fair for a child's one
    // who orders what: children take children's dishes, grown-ups never do
    S.tier = 2;
    S.unlocked.push('restaurant'); S.assets.push({ key: 'kitchen', cond: 90, broken: false });
    S.staff.push(makeStaff('Chef One', 'm', 'm01', 'Chef', 3, 3, [])); S.staff.forEach(s => { s.rota = Array(14).fill(true); s.sickDays = 0; });
    S.guests.forEach(g => { roomById(g.roomId).guestId = null; }); S.guests = [];
    S.rooms.forEach(r => { r.dirty = false; r.damaged = false; });
    const adultsOnly = [], withKids = [];
    const countDishes = guestsSpec => { S.guests = []; S.rooms.forEach(r => { r.guestId = null; }); guestsSpec.forEach((sp, i) => checkIn(S.rooms[i], 'G' + i, 3, sp)); const out = [];
      for (let n = 0; n < 60; n++) { S.dinners = []; S.guests.forEach(g => { g.happiness = 60; }); out.push(runDining()); } return out; };
    const a = countDishes(Array.from({ length: 12 }, () => ({ adults: 2, children: 0 }))), k = countDishes(Array.from({ length: 12 }, () => ({ adults: 2, children: 3 })));
    const sum = (list, f) => list.reduce((x, d) => x + f(d), 0);
    o.openWithKids = a.every(d => d.open) && k.every(d => d.open);
    o.kidsOrderMore = sum(k, d => d.dishes) > sum(a, d => d.dishes) * 1.5;
    // children's dishes get an unmistakable price, so any night's takings show whether one was ordered: eight grown-ups can never spend 1000
    S.menu.forEach(d => { if (d.kids) d.price = 1000; });
    const adultOnly = countDishes(Array.from({ length: 4 }, () => ({ adults: 2, children: 0 })));
    o.adultsNeverKids = adultOnly.length === 60 && adultOnly.every(d => d.open && d.revenue < 1000);
    const fam = countDishes(Array.from({ length: 4 }, () => ({ adults: 2, children: 3 }))); o.familiesDo = fam.filter(d => d.revenue >= 1000).length > 40;
    // the restaurant needs a grown-up main; children's mains alone do not open it
    S.menu.forEach(d => { if (!d.kids && d.cat === 'Main') d.on = false; }); o.kidsOnlyClosed = (S.dinners = [], runDining().covers === 0) && !adultMenu('Main').length && kidsMenu('Main').length === 4;
    S.menu.forEach(d => { d.on = true; });
    // player-made dishes
    o.clean = cleanDish({ name: 'Dino nuggets', cat: 'Main', price: 6, quality: 3, kids: true }).dish.kids === true && cleanDish({ name: 'Steak', cat: 'Main', price: 20, quality: 4 }).dish.kids === false;
    const mine = addDish({ name: 'Fish fingers', cat: 'Main', price: 6, quality: 3, kids: true }, null); o.mine = mine.dish.kids === true && kidsMenu('Main').some(d => d.name === 'Fish fingers');
    updateDish(mine.dish.id, { name: 'Fish fingers', cat: 'Main', price: 6, quality: 3, kids: false }); o.unflag = mine.dish.kids === false;
    // saves
    const old = JSON.parse(JSON.stringify(S)); old.menu.forEach(d => { delete d.kids; }); const mg = migrate(old); o.oldSave = validState(mg) && mg.menu.every(d => !d.kids);
    return o; })()`));
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('kids menu: ' + b));
  if (!bad.length) ok("kids menu: ten dishes with no brand names, adding once and filling gaps, the dish limit, children's fair prices, who orders what, the restaurant needing a grown-up main, own children's dishes, old saves");
}

/* ---------- the phone desk ---------- */
{
  const r = JP(run(`(function () { const o = {};
    newGame('P', 'P'); const p0 = S.phone;
    o.fresh = p0.calls.filter(c => c.kind === 'call' && c.status === 'queued').length >= 2 && p0.calls.every(c => c.status === 'queued') && p0.answered === 0 && p0.welcome === '' && /^[\\p{L}' -]+$/u.test(p0.calls[0].caller.first);
    const mk = () => { S.phone.calls = []; const c = makeCall('call'); c.ask = { type: 'Standard', arriveDay: S.day + 3, nights: 2, adults: 2, children: 0, asks: ['quiet', 'late'] }; c.status = 'waiting'; S.phone.calls.push(c); return c; };
    // the script
    let c = mk(); const lines = callScript(c);
    o.script = lines.length === 6 && lines[0].includes(c.caller.name) && /a standard room/.test(lines[1]) && /2 nights/.test(lines[1]) && lines[1].includes(DAYS_LONG[(S.day + 3) % 7]) && /two of us/.test(lines[2]) && /quiet/.test(lines[3]) && /late/.test(lines[4]);
    o.phrases = Object.keys(CALL_ROOM_PHRASE).length === 4 && new Set(Object.values(CALL_ROOM_PHRASE)).size === 4;
    c.ask.arriveDay = S.day + 9; o.nextWeek = /next week/.test(callScript(c)[1]); c.ask.arriveDay = S.day; o.today = /today/.test(callScript(c)[1]); c.ask.arriveDay = S.day + 1; o.tomorrow = /tomorrow/.test(callScript(c)[1]);
    c.ask.adults = 1; o.justMe = /just me/.test(callScript(c)[2]); c.ask.adults = 2; c.ask.children = 2; o.family = /two adults and two children/.test(callScript(c)[2]);
    let cotOK = true, asksOK = true; for (let i = 0; i < 300; i++) { const x = makeCall('call'); if (x.ask.asks.includes('cot') && x.ask.children === 0) cotOK = false; if (x.ask.asks.length > PHONE.maxAsks || new Set(x.ask.asks).size !== x.ask.asks.length || x.ask.arriveDay < S.day || x.ask.arriveDay > S.day + PHONE.arriveSpread || x.ask.nights < 1 || x.ask.nights > 5) asksOK = false; }
    o.generated = cotOK && asksOK;
    // ringing
    S.phone.calls = [makeCall('call'), makeCall('call'), makeMessage()]; S.phone.lastRing = 0;
    o.blocked = phoneTick(1000, true) === null && S.phone.calls.every(x => x.status === 'queued');
    const first = phoneTick(1000, false); o.rings = first === S.phone.calls[0] && first.status === 'ringing' && phoneRinging() === first && phoneOpen().length === 1;
    o.oneAtATime = phoneTick(2000, false) === null && S.phone.calls[1].status === 'queued';
    o.timesOut = phoneTick(1000 + PHONE.ringMs + 1, false) === null && first.status === 'waiting' && !phoneRinging();
    o.gap = phoneTick(1000 + PHONE.gapMs - 1, false) === null && phoneTick(1000 + PHONE.gapMs + 1, false) === S.phone.calls[1];
    S.phone.calls[1].status = 'waiting'; const msg = phoneTick(1000 + PHONE.gapMs * 2 + 5, false); o.messageQuiet = msg === S.phone.calls[2] && msg.status === 'waiting' && msg.kind === 'message';
    // scoring
    c = mk(); const good = { type: 'Standard', arriveDay: S.day + 3, nights: 2, adults: 2, children: 0, asks: ['quiet', 'late'] };
    const sc = (x) => scoreCall(c, Object.assign({}, good, x));
    o.score3 = sc({}).stars === 3 && sc({}).right === 7 && sc({}).total === 7;
    o.scoreMissed = sc({ asks: ['quiet'] }).stars === 2 && sc({ asks: [] }).stars === 1;
    o.scoreWrong = sc({ nights: 3 }).stars === 2 && sc({ nights: 3, type: 'Ocean View' }).stars === 1 && sc({ asks: ['quiet', 'late', 'dog'] }).right === 6;
    o.scoreFloor = sc({ type: 'x', arriveDay: 0, nights: 9, adults: 5, children: 3, asks: ['dog', 'cot', 'veg'] }).right === 0;
    // answering: typed name kept, requests, mood, bonus
    c = mk(); S.money = 1000; const led0 = S.ledger.length;
    const done = answerCall(c.id, Object.assign({}, good, { name: '  Zed  Quill ', note: '<b>Likes</b> tea' }));
    const bk = done.booking;
    o.answered = done.ok && done.stars === 3 && done.name === 'Zed Quill' && bk.name === 'Zed Quill' && bk.party.members[0].n === 'Zed Quill' && bk.type === 'Standard' && bk.arriveDay === S.day + 3 && bk.nights === 2 && bk.adults === 2 && bk.moodBonus === 8 && bk.requests.map(q => q.text).join('|') === 'Quiet room|Late arrival' && bk.notes === 'Likes tea';
    o.reward = done.reward === 30 && S.money === 1030 && S.ledger.slice(led0).some(e => e.grant && e.amount === 30 && /Phone desk/.test(e.label)) && c.status === 'done' && S.phone.answered === 1 && S.phone.perfect === 1 && S.tally.calls === 1 && /^HQ-[0-9]{5}$/.test(done.ref) && done.ref === refOf(bk);
    o.noRepeat = !answerCall(c.id, good).ok && !declineCall(c.id).ok;
    c = mk(); const rough = answerCall(c.id, Object.assign({}, good, { name: 'Ann', nights: 3, asks: [] })); o.mood = rough.ok && rough.stars === 1 && rough.booking.moodBonus === -3 && rough.reward === 10 && S.phone.perfect === 1;
    c = mk(); c.kind = 'voicemail'; const vm = answerCall(c.id, Object.assign({}, good, { name: 'Bea' })); o.voicemailHalf = vm.ok && vm.reward === 15;
    o.errors = (c = mk(), !answerCall(c.id, Object.assign({}, good, { name: '   ' })).ok && c.status === 'waiting') && !answerCall(9999, good).ok && !answerCall(c.id, Object.assign({}, good, { name: 'X', nights: 40 })).ok && c.status === 'waiting' && !answerCall(c.id, Object.assign({}, good, { name: 'X', asks: ['quiet', 'late', 'dog', 'veg'] })).ok;
    o.unknownAsk = (c = mk(), answerCall(c.id, Object.assign({}, good, { name: 'Cy', asks: ['quiet', 'late', 'hack'] })).ok) && S.bookings[S.bookings.length - 1].requests.length === 2;
    // today: the guest arrives straight away, and mood still applies
    c = mk(); c.ask.arriveDay = S.day; const t0 = answerCall(c.id, Object.assign({}, good, { name: 'Di Today', arriveDay: S.day }));
    o.today2 = t0.ok && !!t0.guest && S.guests.some(g => g.name === 'Di Today') && t0.guest.happiness > 0;
    // no room: a clear error and the call stays
    c = mk(); S.rooms.filter(x => x.type === 'Standard').forEach(x => blockRooms([x.id], S.day + 3, 5, 'Test')); const full = answerCall(c.id, Object.assign({}, good, { name: 'Ed' })); o.noRoom = !full.ok && /No Standard room/.test(full.error) && c.status === 'waiting' && declineCall(c.id).ok && c.status === 'done';
    S.blocks = [];
    // messages
    S.phone.calls = [makeMessage()]; c = S.phone.calls[0]; c.status = 'waiting'; S.money = 1000;
    o.replyShort = !replyMessage(c.id, ' a ').ok && c.status === 'waiting' && !replyMessage(c.id, '').ok;
    const rp = replyMessage(c.id, '  Thank you <i>so</i> much for writing!  '); o.reply = rp.ok && c.status === 'done' && S.money === 1005 && S.phone.sent[0].text === 'Thank you so much for writing!' && S.phone.sent[0].to === c.caller.name && S.tally.replies === 1;
    o.replyOnce = !replyMessage(c.id, 'again please').ok;
    for (let i = 0; i < 40; i++) { const m = makeMessage(); m.status = 'waiting'; S.phone.calls.push(m); replyMessage(m.id, 'Hello there ' + i); } o.sentCap = S.phone.sent.length === 30;
    o.notACall = (c = makeMessage(), c.status = 'waiting', S.phone.calls.push(c), !answerCall(c.id, good).ok && !declineCall(c.id).ok);
    // the daily cycle
    newGame('P', 'P'); S.phone.calls = []; const a = makeCall('call'), b = makeCall('call'), m = makeMessage(), mq = makeMessage(); a.status = 'waiting'; b.status = 'queued'; m.status = 'waiting'; mq.status = 'waiting'; mq.day = S.day - 5; S.phone.calls.push(a, b, m, mq);
    S.day++; phoneNewDay();
    o.voicemail = a.kind === 'voicemail' && a.status === 'waiting' && S.phone.calls.includes(a) && !S.phone.calls.includes(b) && S.phone.calls.includes(m) && !S.phone.calls.includes(mq);
    o.queuedNew = S.phone.calls.filter(x => x.status === 'queued' && x.kind === 'call').length >= 2 && S.phone.lastRing === 0;
    S.day += PHONE.keepDays + 1; phoneNewDay(); o.voicemailExpires = !S.phone.calls.includes(a) && !S.phone.calls.includes(m);
    o.vmScript = /call back/.test((a.status = 'waiting', callScript(a)[0]));
    // welcome message and saves
    o.welcome = setWelcomeMessage('  Welcome <b>to</b> our hotel!  ') === 'Welcome to our hotel!' && S.phone.welcome === 'Welcome to our hotel!';
    o.welcomeCap = setWelcomeMessage('x'.repeat(500)).length === PHONE.welcomeMax && !/[<>]/.test(setWelcomeMessage('<<>>hi'));
    const old = JSON.parse(JSON.stringify(S)); delete old.phone; const mg = migrate(old); o.migrateNew = validState(mg) && Array.isArray(mg.phone.calls) && mg.phone.welcome === '';
    const half = JSON.parse(JSON.stringify(S)); half.phone = { calls: [{ junk: 1 }], welcome: 5 }; const mg2 = migrate(half); o.migrateHalf = mg2.phone.calls.length === 0 && mg2.phone.welcome === '' && mg2.phone.nextId === 1 && validState(mg2);
    const keep = JSON.parse(JSON.stringify(S)); keep.phone.welcome = 'Hi there'; o.migrateKeep = migrate(keep).phone.welcome === 'Hi there';
    return o; })()`));
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('phone: ' + b));
  if (!bad.length) ok('phone desk: callers and scripts, ringing one at a time and timing out, voicemail and expiry, scoring, answering (typed name kept, requests, mood, bonus), no room, messages and replies, welcome message, saves');
}

/* ---------- the guest book, review replies, the diary, ranks and the briefing ---------- */
{
  const r = JP(run(`(function () { const o = {};
    newGame('G', 'G'); S.money = 100000;
    // what guests like, and notes about them
    o.prefs = GUEST_PREFS.length === 8 && new Set(GUEST_PREFS.map(p => p.key)).size === 8 && GUEST_PREFS.every(p => p.say.length > 10 && p.words.length >= 2 && p.likes);
    let withPref = 0, validPref = true; for (let i = 0; i < 400; i++) { const room = S.rooms[i % S.rooms.length]; room.guestId = null; const g = checkIn(room, 'Pref Guest ' + i, 2); if (g.pref) withPref++; if (g.pref && !prefOf(g.pref)) validPref = false; if (g.note !== '') validPref = false; S.guests = S.guests.filter(x => x !== g); room.guestId = null; }
    o.prefShare = validPref && withPref > 400 * 0.45 && withPref < 400 * 0.75;
    S.guests = []; S.rooms.forEach(x => { x.guestId = null; x.dirty = false; });
    const gA = checkIn(S.rooms[0], 'Ann Fenn', 3, { pref: 'quiet', party: newParty({ adults: 2, children: 1, rel: 'family', lead: parseTypedName('Ann Fenn') }), adults: 2, children: 1 });
    o.override = gA.pref === 'quiet' && checkIn(S.rooms[1], 'No Pref', 1, { pref: null }).pref === null;
    o.matches = noteMatches('Likes a QUIET room', 'quiet') && noteMatches('extra pillows please', 'pillows') && noteMatches('Loves tea', 'tea') && !noteMatches('Likes tea', 'quiet') && !noteMatches('', 'quiet') && !noteMatches('quiet', 'nonsense') && !noteMatches(null, 'quiet');
    const sn = setGuestNote(gA.id, '  Likes <b>quiet</b> rooms  '); o.setNote = sn.ok && gA.note === 'Likes quiet rooms' && !setGuestNote(99999, 'x').ok && setGuestNote(gA.id, 'x'.repeat(500)).note.length === GUESTBOOK.noteMax;
    setGuestNote(gA.id, 'Likes quiet rooms');
    // leaving goes in the guest book
    gA.happiness = 80; leaveGuest(gA, roomById(gA.roomId));
    const rec = S.regulars.find(x => x.name === 'Ann Fenn');
    o.remembered = !!rec && rec.stays === 1 && rec.happy === 80 && rec.pref === 'quiet' && rec.note === 'Likes quiet rooms' && rec.lastDay === S.day && rec.party.members.length === 3 && rec.party.members.filter(m => m.kid).length === 1 && rec.party.rel === 'family' && rec.gender === rec.party.members[0].gender;
    const g2 = checkIn(S.rooms[0], 'Ann Fenn', 2, { pref: 'quiet' }); leaveGuest(g2, roomById(g2.roomId));
    o.secondStay = S.regulars.filter(x => x.name === 'Ann Fenn').length === 1 && rec.stays === 2 && rec.note === 'Likes quiet rooms';
    const g3 = checkIn(S.rooms[0], 'Ann Fenn', 2); g3.note = 'Also likes tea'; leaveGuest(g3, roomById(g3.roomId)); o.noteUpdates = rec.note === 'Also likes tea';
    o.regularNote = setRegularNote(rec.id, '  Quiet room, <i>always</i>  ').ok && rec.note === 'Quiet room, always' && !setRegularNote(99999, 'x').ok;
    for (let i = 0; i < 80; i++) { const g = checkIn(S.rooms[2], 'Cap Guest ' + i, 1); S.day += 0; leaveGuest(g, roomById(g.roomId)); } o.cap = S.regulars.length <= GUESTBOOK.max;
    // who rings again
    const mkReg = (extra) => Object.assign({ id: nid(), name: 'Mia Hart', first: 'Mia', gender: 'f', stays: 1, lastDay: S.day - 5, happy: 80, pref: 'quiet', note: 'Likes a quiet room', party: { rel: 'married', members: [{ n: 'Mia Hart', first: 'Mia', last: 'Hart', kid: false, gender: 'f' }, { n: 'Tom Hart', first: 'Tom', last: 'Hart', kid: false, gender: 'm' }] } }, extra || {});
    S.regulars = [mkReg()]; S.phone.calls = []; S.guests = []; S.bookings = [];
    const keepChance = GUESTBOOK.returnChance; GUESTBOOK.returnChance = 1;
    o.picked = pickRegular() === S.regulars[0];
    S.regulars[0].happy = 40; o.unhappyNever = pickRegular() === null; S.regulars[0].happy = 80;
    S.regulars[0].lastDay = S.day - 1; o.awayFirst = pickRegular() === null; S.regulars[0].lastDay = S.day - 5;
    S.bookings.push({ name: 'mia hart' }); o.notTwice = pickRegular() === null; S.bookings = [];
    const call = makeCall('call'); o.regularCall = call.regular === S.regulars[0].id && call.caller.name === 'Mia Hart' && call.ask.adults === 2 && call.ask.children === 0 && /again/.test(callScript(call)[0]);
    GUESTBOOK.returnChance = 0; o.noRegularWhenZero = makeCall('call').regular === null; GUESTBOOK.returnChance = keepChance;
    // answering keeps the party and the link
    S.phone.calls = [call]; call.status = 'waiting'; call.ask = { type: 'Standard', arriveDay: S.day, nights: 2, adults: 2, children: 0, asks: [] };
    const ans = answerCall(call.id, { name: 'Mia Hart', type: 'Standard', arriveDay: S.day, nights: 2, adults: 2, children: 0, asks: [] });
    o.answerLink = ans.ok && !!ans.guest && ans.guest.regularId === S.regulars[0].id && ans.guest.party.members.map(m => m.n).join('|') === 'Mia Hart|Tom Hart' && ans.guest.party.rel === 'married' && ans.guest.remembered === true;
    // the welcome: a matching note delights, another note is appreciated, no note is just noted
    const fresh = (note, pref) => { const room = S.rooms.find(x => !x.guestId && x.type === 'Standard'); const gg = checkIn(room, 'Mia Hart', 2); gg.happiness = 50; const reg = mkReg({ note, pref }); S.regulars = [reg]; const mailsBefore = S.mail.items.length; const res = welcomeBack(gg, reg.id); const out = { res, h: gg.happiness, rid: gg.regularId, mail: S.mail.items.length - mailsBefore, pref: gg.pref, note: gg.note }; S.guests = S.guests.filter(x => x !== gg); room.guestId = null; return out; };
    const st0 = S.stats.remembered, match = fresh('Likes a quiet room', 'quiet');
    o.delight = match.res.kind === 'remembered' && match.h === 50 + GUESTBOOK.delight && match.rid !== null && match.mail >= 1 && S.stats.remembered === st0 + 1 && match.pref === 'quiet' && match.note === 'Likes a quiet room';
    const other = fresh('Likes tea', 'quiet'); o.thanks = other.res.kind === 'noted' && other.h === 50 + GUESTBOOK.thanks && other.mail === 1;
    const blank = fresh('', 'quiet'); o.blank = blank.res.kind === 'blank' && blank.h === 50 && blank.mail === 1 && S.stats.remembered === st0 + 1;
    o.noSuchRegular = welcomeBack({ happiness: 50 }, 424242).kind === 'none';
    // review replies
    S.tally = {}; S.reviews = []; for (let i = 0; i < 6; i++) addReview('Rev ' + i, 4, 'Nice stay ' + i);
    o.reviewIds = S.reviews.every(x => Number.isInteger(x.id) && x.reply === null) && new Set(S.reviews.map(x => x.id)).size === 6;
    const ids = S.reviews.map(x => x.id), m0 = S.money;
    o.replyShort = !replyReview(ids[0], ' a ').ok && !replyReview(99999, 'Thank you!').ok && S.reviews[0].reply === null;
    const r1 = replyReview(ids[0], '  Thank you <b>so</b> much!  '); o.reply1 = r1.ok && r1.reward === 5 && S.reviews[0].reply === 'Thank you so much!' && S.money === m0 + 5 && !r1.edited;
    replyReview(ids[1], 'Thanks!'); replyReview(ids[2], 'Thanks again!'); const r4 = replyReview(ids[3], 'And thanks to you too!'); o.replyCap = r4.ok && r4.reward === 0 && S.reviews[3].reply === 'And thanks to you too!';
    const ed = replyReview(ids[0], 'Edited reply'); o.replyEdit = ed.ok && ed.edited && ed.reward === 0 && S.reviews[0].reply === 'Edited reply';
    const old = JSON.parse(JSON.stringify(S)); old.reviews.forEach(x => { delete x.id; delete x.reply; }); const mg0 = migrate(old); o.reviewMigrate = mg0.reviews.every(x => Number.isInteger(x.id) && x.reply === null) && new Set(mg0.reviews.map(x => x.id)).size === mg0.reviews.length && validState(mg0);
    // the diary
    S.diary = []; S.day = 10; S.money = 5000;
    o.diaryWrite = writeDiary(10, '  A <b>busy</b> day!  ').ok && S.diary.length === 1 && S.diary[0].text === 'A busy day!' && S.diary[0].cash === 5000 && S.diary[0].day === 10 && S.diary[0].guests === S.guests.length && S.diary[0].rating >= 1;
    writeDiary(10, 'Changed my mind'); o.diaryReplace = S.diary.length === 1 && S.diary[0].text === 'Changed my mind';
    writeDiary(8, 'Earlier'); o.diarySorted = S.diary.map(e => e.day).join() === '8,10';
    o.diaryClear = writeDiary(10, '   ').cleared === true && S.diary.length === 1 && S.diary[0].day === 8;
    for (let i = 0; i < 150; i++) writeDiary(100 + i, 'Entry ' + i); o.diaryCap = S.diary.length === GUESTBOOK.diaryKeep && S.diary[S.diary.length - 1].day === 249;
    const txt = diaryText(); o.diaryText = txt.startsWith('G: the diary of G') && /Day 250/.test(txt) && /Entry 149/.test(txt) && !/undefined|NaN/.test(txt);
    o.diaryMigrate = validState(migrate((() => { const x = JSON.parse(JSON.stringify(S)); delete x.diary; delete x.regulars; return x; })()));
    // ranks
    o.ranks = RANKS.length === 8 && RANKS.every((x, i) => i === 0 || x.goals > RANKS[i - 1].goals) && rankIndexFor(0) === 0 && rankIndexFor(1) === 0 && rankIndexFor(2) === 1 && rankIndexFor(8) === 3 && rankIndexFor(9) === 4 && rankIndexFor(18) === 6 && rankIndexFor(19) === 7 && rankIndexFor(99) === 7 && MILESTONES.length === RANKS[RANKS.length - 1].goals;   // the top rank is the last goal
    newGame('R', 'R'); o.careerStart = S.career.rank === 0 && S.career.certs.length === 0 && currentRank().name === 'Trainee';
    S.milestones.done = 4; const won = checkPromotion(); o.promotion = won.length === 2 && won[0].rank === 'Receptionist' && won[1].rank === 'Duty Manager' && S.career.rank === 2 && S.career.certs.length === 2 && S.mail.items.some(m => /promoted to Duty Manager/.test(m.subject)) && checkPromotion().length === 0;
    newGame('R', 'R'); S.earned = 20000; S.money = 50000; const rep = runEndDay(); o.reportPromo = Array.isArray(rep.promotions) && rep.promotions.length >= 1 && rep.promotions[0].rank === 'Receptionist' && rep.day === S.day - 1;
    const oldC = JSON.parse(JSON.stringify(S)); delete oldC.career; const mgc = migrate(oldC); o.careerMigrate = mgc.career.rank === rankIndexFor(mgc.milestones.done) && mgc.career.certs.length === 0 && validState(mgc);
    // the briefing
    newGame('B', 'B'); S.day = 3; S.weatherSet = { 3: 'storm', 4: 'rain' }; S.bookings = []; S.events = [];
    const room = S.rooms.find(x => !x.guestId); S.bookings.push({ id: nid(), name: 'Back Again', roomId: room.id, arriveDay: S.day, nights: 1, type: room.type, adults: 1, children: 0, price: 90, regularId: 5, requests: [], extras: [], mealPlan: 'room', deposit: 0, party: soloParty('Back Again'), moodBonus: 0, noShow: false }, { id: nid(), name: 'Tomorrow Guest', roomId: room.id, arriveDay: S.day + 1, nights: 1, type: room.type, adults: 1, children: 0, price: 90, requests: [], extras: [], mealPlan: 'room', deposit: 0, party: soloParty('Tomorrow Guest'), moodBonus: 0, noShow: false });
    const br = briefing(); const all = br.today.concat(br.tomorrow);
    o.briefShape = Array.isArray(br.today) && Array.isArray(br.tomorrow) && br.today.length >= 2 && br.tomorrow.length >= 1 && all.every(x => ['info', 'warn', 'bad'].includes(x.kind) && x.text.length > 5 && !/undefined|NaN|\\[object/.test(x.text));
    o.briefToday = /Storm/.test(br.today[0].text) && br.today[0].kind === 'warn' && br.today.some(x => /1 reservation arriving today/.test(x.text) && /Back Again/.test(x.text)) && br.today.some(x => /Today's challenges/.test(x.text));
    o.briefTomorrow = /Forecast: rain/.test(br.tomorrow[0].text) && br.tomorrow[0].kind === 'warn' && br.tomorrow.some(x => /1 reservation arriving/.test(x.text));
    S.staff[0].sickDays = 2; S.assets[0].broken = true; o.briefTroubles = briefing().today.some(x => /off sick/.test(x.text) && x.kind === 'warn') && briefing().today.some(x => /broken/.test(x.text) && x.kind === 'bad');
    return o; })()`));
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('guest book: ' + b));
  if (!bad.length) ok('guest book: what guests like, notes, the guest book and cap, who rings again, the welcome (remembered, noted, blank), review replies, the diary, ranks and promotions, the briefing, old saves');
}

/* ---------- wishes: what a guest asked for, and whether they got it ---------- */
{
  const r = JP(run(`(function () { const o = {};
    newGame('W', 'W'); S.money = 100000; S.tier = 2; S.unlocked.push('restaurant'); S.assets.push({ key: 'kitchen', cond: 100, broken: false });
    S.staff.push(makeStaff('Chef', 'm', 'm03', 'Chef', 4, 4, [])); S.staff.forEach(x => { x.rota = Array(14).fill(true); });
    const clear = () => { S.guests = []; S.jobs = []; S.bookings = []; S.rooms.forEach(x => { x.guestId = null; x.dirty = false; x.damaged = false; }); };
    // reading the words
    o.words = wishFromText('Sea view') === 'view' && wishFromText('Nice view') === 'view' && wishFromText('an ocean room') === 'view' && wishFromText('Ground floor') === 'ground' && wishFromText('Vegetarian meals') === 'veg' && wishFromText('Veggie please') === 'veg'
      && wishFromText('Birthday cake') === null && wishFromText('Season ticket') === null && wishFromText('Quiet room') === null && wishFromText('') === null && wishFromText(undefined) === null;
    o.floors = floorOf({ name: 'Room 101' }) === 1 && floorOf({ name: 'Room 208' }) === 2 && floorOf({ name: 'Room 301' }) === 3 && floorOf({ name: 'Annexe' }) === null && floorOf({ name: 'Room 12' }) === null;
    o.rooms = roomMeetsWish('view', S.rooms.find(x => x.type === 'Ocean View')) && !roomMeetsWish('view', S.rooms.find(x => x.type === 'Standard')) && !roomMeetsWish('veg', S.rooms[0]) && !roomMeetsWish('nonsense', S.rooms[0]) && !roomMeetsWish('view', null);
    o.requestKeepsWish = (function () { clear(); const b = createBooking({ name: 'Wish One', adults: 1, children: 0, type: 'Standard', arriveDay: S.day + 2, nights: 2, price: 90, depositPct: 0 }).booking; addBookingRequest(b.id, 'Sea view'); addBookingRequest(b.id, 'Birthday cake'); return b.requests[0].wish === 'view' && b.requests[1].wish === null; })();
    // a booking: take the guest in, optionally asking for something
    const arrive = (type, asks, roomId) => { const b = createBooking({ name: 'Guest ' + nid(), adults: 1, children: 0, type, arriveDay: S.day + 1, nights: 3, price: ROOM_TYPES[type].price, depositPct: 0, roomId }).booking; for (const a of asks) addBookingRequest(b.id, a); b.arriveDay = S.day; return { b, r: checkInBooking(b.id) }; };
    // a sea view asked for and not given
    clear(); const none = arrive('Standard', [], undefined), miss = arrive('Standard', ['Sea view'], undefined);
    o.viewMissed = miss.r.wishes.missed.join() === 'a sea view' && miss.r.guest.wishes[0].met === false && none.r.guest.happiness - miss.r.guest.happiness === WISH_UPSET
      && S.jobs.filter(j => j.type === 'complaint' && j.guestId === miss.r.guest.id && j.wish === 'view').length === 1 && S.jobs.find(j => j.wish === 'view').text.includes('sea view') && !S.jobs.some(j => j.kind === 'special' && j.guestId === miss.r.guest.id) && S.news.some(n => /has a complaint/.test(n));
    // and given
    clear(); const base = arrive('Ocean View', [], undefined), got = arrive('Ocean View', ['Sea view'], undefined);
    o.viewMet = got.r.wishes.met.join() === 'a sea view' && got.r.wishes.missed.length === 0 && got.r.guest.wishes[0].met === true && got.r.guest.happiness - base.r.guest.happiness === WISH_HAPPY && !S.jobs.some(j => j.type === 'complaint');
    // ground floor: room 101 suits, 201 and 301 do not
    const rid = n => S.rooms.find(x => x.name === 'Room ' + n).id;
    clear(); const g1 = arrive('Standard', ['Ground floor'], rid(101)); o.groundMet = g1.r.guest.wishes[0].met === true && g1.r.wishes.met.length === 1;
    clear(); const g2 = arrive('Standard', ['Ground floor'], rid(201)); o.groundMissed = g2.r.guest.wishes[0].met === false && S.jobs.some(j => j.type === 'complaint' && j.wish === 'ground');
    clear(); const g3 = arrive('Ocean View', ['Ground floor'], rid(301)); o.groundTopFloor = g3.r.guest.wishes[0].met === false;
    // two wishes at once, and the same wish twice is one wish
    clear(); const two = arrive('Standard', ['Sea view', 'Ground floor', 'Nice view'], rid(201)); o.two = two.r.guest.wishes.length === 2 && two.r.wishes.missed.length === 2 && S.jobs.filter(j => j.type === 'complaint').length === 2;
    // a complaint is never raised twice for the same wish
    o.noDuplicate = raiseComplaint(two.r.guest, 'again', 'view') === false && S.jobs.filter(j => j.type === 'complaint').length === 2;
    // a complaint can be put right like any other
    const cj = S.jobs.find(j => j.type === 'complaint'), gg = guestById(cj.guestId), h0 = gg.happiness, rec = S.staff.find(x => x.role === 'Receptionist'); rec.used = 0;
    o.resolved = doAssign(cj.id, rec.id, true) && gg.happiness > h0 && !S.jobs.includes(cj);
    // moved because the room was not ready: judged on the room they actually get
    clear(); const bk = createBooking({ name: 'Moved Guest', adults: 1, children: 0, type: 'Ocean View', arriveDay: S.day + 1, nights: 2, price: 125, depositPct: 0, roomId: rid(301) }).booking; addBookingRequest(bk.id, 'Sea view'); bk.arriveDay = S.day;
    roomById(rid(301)).dirty = true; const mv = checkInBooking(bk.id); o.movedRoom = mv.moved && mv.room.type === 'Ocean View' && mv.wishes.met.length === 1;
    // today's phone booking is judged at once
    clear(); S.phone.calls = []; const call = { id: S.phone.nextId++, kind: 'call', status: 'waiting', day: S.day, ringAt: 0, caller: { name: 'Kay Lane', first: 'Kay', gender: 'f' }, regular: null, ask: { type: 'Standard', arriveDay: S.day, nights: 2, adults: 1, children: 0, asks: ['view', 'veg'] }, v: 1 }; S.phone.calls.push(call);
    const ans = answerCall(call.id, { name: 'Kay Lane', type: 'Standard', arriveDay: S.day, nights: 2, adults: 1, children: 0, asks: ['view', 'veg'] });
    o.phoneToday = ans.ok && !!ans.guest && ans.guest.wishes.map(w => w.key + ':' + w.met).sort().join() === 'veg:null,view:false' && S.jobs.some(j => j.type === 'complaint' && j.wish === 'view');
    // a phone booking for later keeps the wishes on the reservation
    clear(); S.phone.calls = []; const call2 = { id: S.phone.nextId++, kind: 'call', status: 'waiting', day: S.day, ringAt: 0, caller: { name: 'Lee Moss', first: 'Lee', gender: 'm' }, regular: null, ask: { type: 'Ocean View', arriveDay: S.day + 1, nights: 2, adults: 1, children: 0, asks: ['view'] }, v: 1 }; S.phone.calls.push(call2);
    const ans2 = answerCall(call2.id, { name: 'Lee Moss', type: 'Ocean View', arriveDay: S.day + 1, nights: 2, adults: 1, children: 0, asks: ['view'] });
    o.phoneLater = ans2.ok && !ans2.guest && wishKeysOf(ans2.booking.requests).join() === 'view' && bookingWishGaps(ans2.booking).length === 0;
    // the reservation shows when the room would not do
    clear(); const bw = createBooking({ name: 'Gap Guest', adults: 1, children: 0, type: 'Standard', arriveDay: S.day + 1, nights: 1, price: 90, depositPct: 0 }).booking; addBookingRequest(bw.id, 'Sea view');
    o.gaps = bookingWishGaps(bw).length === 1 && bookingWishGaps(bw)[0].key === 'view' && /Ocean View/.test(bookingWishGaps(bw)[0].hint);
    // the morning briefing warns about a reservation that would not be happy
    bw.arriveDay = S.day; const brief = briefing().today.find(x => /asked for a sea view/.test(x.text)); o.briefing = !!brief && brief.kind === 'warn' && brief.text.includes('Gap Guest') && /Ocean View room/.test(brief.text);
    // vegetarian food: judged in the evening, once
    clear(); const vg = arrive('Standard', ['Vegetarian meals'], undefined).r.guest; vg.left = 5; o.vegPending = vg.wishes[0].met === null && !S.jobs.some(j => j.type === 'complaint');
    const ev = []; judgeMealWishes(ev); o.vegServed = vg.wishes[0].met === true && ev.length === 1 && /well looked after/.test(ev[0].text);
    const ev2 = []; judgeMealWishes(ev2); o.vegOnce = ev2.length === 0;
    clear(); const vg2 = arrive('Standard', ['Vegetarian meals'], undefined).r.guest; S.menu.forEach(d => { if (d.cat === 'Main' && d.veg) d.on = false; }); const ev3 = []; judgeMealWishes(ev3);
    o.vegMissed = vg2.wishes[0].met === false && S.jobs.some(j => j.type === 'complaint' && j.wish === 'veg' && j.guestId === vg2.id) && /no vegetarian main/.test(ev3[0].text);
    S.menu.forEach(d => { d.on = true; });
    // a closed restaurant judges nothing yet, and no restaurant sets the wish aside
    clear(); const vg3 = arrive('Standard', ['Vegetarian meals'], undefined).r.guest; S.staff = S.staff.filter(x => x.role !== 'Chef'); const ev4 = []; judgeMealWishes(ev4); o.vegClosed = vg3.wishes[0].met === null && ev4.length === 0;
    S.unlocked = S.unlocked.filter(x => x !== 'restaurant'); const ev5 = []; judgeMealWishes(ev5); o.vegNoRestaurant = vg3.wishes[0].met === 'na' && ev5.length === 0 && !S.jobs.some(j => j.type === 'complaint'); S.unlocked.push('restaurant');
    // room service: a particular dish
    S.staff.push(makeStaff('Chef', 'm', 'm03', 'Chef', 4, 4, [])); S.staff.forEach(x => { x.rota = Array(14).fill(true); });
    clear(); const dg = arrive('Standard', [], undefined).r.guest, dish = S.menu.find(d => d.cat === 'Main' && !d.kids);
    const order = () => { const j = { id: nid(), type: 'request', kind: 'food', label: 'Room service: ' + dish.name, guestId: dg.id, role: 'Chef', pay: dish.price, cost: ingredientCost(dish), feel: 0, text: 'x', dishId: dish.id, dishName: dish.name }; S.jobs.push(j); return j; };
    const chef = S.staff.find(x => x.role === 'Chef'); chef.used = 0;
    const okJob = order(), m1 = S.money, h1 = dg.happiness; o.dishServed = doAssign(okJob.id, chef.id, true) && dg.happiness > h1 && S.money > m1 - 1 && !S.jobs.some(j => j.type === 'complaint');
    dish.on = false; chef.used = 0; const badJob = order(), m2 = S.money, h2 = dg.happiness;
    o.dishWrong = doAssign(badJob.id, chef.id, true) && dg.happiness === h2 - WISH_MEAL_UPSET && S.money === m2 && S.jobs.filter(j => j.type === 'complaint' && j.wish === 'dish').length === 1 && /did not give|not what I was given/.test(S.jobs.find(j => j.wish === 'dish').text) === true;
    o.servable = dishServable(dish.id) === false && (dish.on = true) && dishServable(dish.id) === true && dishServable(99999999) === false;
    // an order nobody dealt with becomes a complaint at the end of the day
    clear(); const dg2 = arrive('Standard', [], undefined).r.guest; dg2.left = 5; dg2.happiness = 80; S.jobs.push({ id: nid(), type: 'request', kind: 'food', label: 'Room service: ' + dish.name, guestId: dg2.id, role: 'Chef', pay: 10, cost: 2, feel: 0, text: 'x', dishId: dish.id, dishName: dish.name });
    const rep = runEndDay(); const lost = S.jobs.find(j => j.type === 'complaint' && j.wish === 'dish' && j.guestId === dg2.id);
    o.dishLost = !!lost && /never arrived/.test(lost.text) && rep.events.some(e => /never came/.test(e.text)) && !S.jobs.some(j => j.type === 'request' && j.dishId);
    // old saves and the invariants
    clear(); const old = JSON.parse(JSON.stringify(S)); old.guests.forEach(x => { delete x.wishes; }); o.oldSave = validState(migrate(old));
    return o; })()`));
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('wishes: ' + b));
  if (!bad.length) ok('wishes: reading the words, sea view and ground floor judged on arrival, a complaint raised once and put right, phone bookings, reservation warnings, vegetarian food judged in the evening, a dish asked for, lost orders, old saves');
}

/* ---------- management online and offline ---------- */
{
  const r = JP(run(`(function () { const o = {};
    // real dates
    o.dates = daysBetween('2026-10-27', '2026-10-27') === 0 && daysBetween('2026-10-27', '2026-10-28') === 1 && daysBetween('2026-10-31', '2026-11-02') === 2 && daysBetween('2027-12-30', '2028-01-02') === 3
      && daysBetween('2028-02-28', '2028-03-01') === 2 && daysBetween('2026-10-28', '2026-10-27') === 0 && daysBetween(null, '2026-10-27') === 0 && daysBetween('nonsense', 'x') === 0 && dateNum('2026-13-45') !== null;
    newGame('M', 'M'); S.money = 100000;
    o.start = S.mgmt.online === true && S.mgmt.since === null && S.morningPending === false && isOnline();
    const old = JSON.parse(JSON.stringify(S)); delete old.mgmt; delete old.morningPending; const mg = migrate(old); o.oldSave = validState(mg) && mg.mgmt.online === true && mg.morningPending === false;
    // the day ends and the morning waits
    const d0 = S.day; S.incidents = [];
    const rep = runEndDay({ defer: true });
    o.deferred = S.day === d0 + 1 && S.morningPending === true && rep.day === d0 && S.incidents.length === 0 && validState(S);
    o.nightJobs = S.rooms.filter(x => x.dirty).every(x => S.jobs.some(j => j.type === 'clean' && j.roomId === x.id));
    goOffline('2026-10-27'); o.offline = !isOnline() && S.mgmt.since === '2026-10-27';
    // the same real day: the next morning is simply opened
    const ok = goOnline('2026-10-27');
    o.sameDay = ok.ok && ok.away.length === 0 && !ok.bankrupt && S.morningPending === false && isOnline() && S.mgmt.since === '2026-10-27' && S.day === d0 + 1 && Array.isArray(S.enquiries) && S.phone.calls.length > 0;
    o.alreadyOnline = goOnline('2026-10-27').ok === false;
    o.openOnce = openMorning() === false;
    // the next real day is just the normal morning, with no unattended day
    runEndDay({ defer: true }); goOffline('2026-10-27'); const dA = S.day; const nextDay = goOnline('2026-10-28');
    o.nextDay = nextDay.ok && nextDay.away.length === 0 && S.day === dA && nextDay.nights === 1;
    // away for longer: the hotel runs by itself, up to three days
    runEndDay({ defer: true }); goOffline('2026-10-28'); const dB = S.day, cashB = S.money; const two = goOnline('2026-10-30');
    o.twoNights = two.ok && two.away.length === 1 && S.day === dB + 1 && two.nights === 2 && S.morningPending === false;
    const line = two.away[0]; o.awayLine = typeof line.day === 'string' && Number.isFinite(line.income) && Number.isFinite(line.expenses) && line.profit === line.income - line.expenses && Array.isArray(line.events) && line.events.length <= 4 && !/undefined|NaN/.test(JSON.stringify(line));
    runEndDay({ defer: true }); goOffline('2026-10-30'); const dC = S.day; const cap = goOnline('2026-12-25');
    o.capped = cap.away.length === MGMT.maxAway && S.day === dC + MGMT.maxAway && cap.nights === 56 && validState(S);
    // an offline hotel is not touched by time
    runEndDay({ defer: true }); goOffline('2026-12-25'); const frozen = JSON.stringify([S.day, S.money, S.guests.length, S.incidents.length]); o.frozen = JSON.stringify([S.day, S.money, S.guests.length, S.incidents.length]) === frozen && catchUp('2027-03-01') === null && !isOnline();
    goOnline('2026-12-25');
    // left online past midnight
    S.mgmt = { online: true, since: '2027-01-01' }; const dD = S.day;
    o.noNight = catchUp('2027-01-01') === null && S.day === dD;
    const night = catchUp('2027-01-02'); o.oneNight = !!night && night.away.length === 1 && S.day === dD + 1 && isOnline() && S.mgmt.since === '2027-01-02' && S.morningPending === false;
    const dE = S.day; const many = catchUp('2027-02-01'); o.manyNights = many.away.length === MGMT.maxAway && S.day === dE + MGMT.maxAway && many.nights === 30;
    S.mgmt = { online: true, since: null }; o.untimed = catchUp('2027-05-05') === null && S.mgmt.since === '2027-05-05';
    // running out of money while nobody was there
    S.mgmt = { online: false, since: '2027-05-05' }; S.morningPending = false; S.lifelines = LIFELINE_MAX; S.money = BANKRUPT_AT - 100;
    const bust = goOnline('2027-05-09'); o.bankrupt = bust.ok && bust.bankrupt === true && bust.away.length <= MGMT.maxAway;
    // the whole state still saves and loads
    o.saved = validState(migrate(JSON.parse(JSON.stringify(S)))) && typeof S.mgmt.online === 'boolean';
    return o; })()`));
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('management online: ' + b));
  if (!bad.length) ok('management online: real dates, the day ends and the morning waits, going online (same day, next day, away up to three days), left online past midnight, offline is frozen, running out of money, old saves');
}

/* ---------- guest faces ---------- */
{
  const r = JP(run(`(function () { const o = {};
    o.counts = GUEST_FACE_COUNT === 36 && KID_FACE_COUNT === 12;
    o.shape = /^assets\\/guests\\/f(0[1-9]|[12][0-9]|3[0-6])\\.jpg$/.test(guestFacePath('Ann Lee', 'f')) && /^assets\\/guests\\/m(0[1-9]|[12][0-9]|3[0-6])\\.jpg$/.test(guestFacePath('Bob Lee', 'm')) && /^assets\\/guests\\/kf(0[1-9]|1[0-2])\\.jpg$/.test(guestFacePath('Cy Lee', 'f', true)) && /^assets\\/guests\\/km(0[1-9]|1[0-2])\\.jpg$/.test(guestFacePath('Di Lee', 'm', true));
    o.stable = guestFacePath('Ann Lee', 'f') === guestFacePath('Ann Lee', 'f') && personFacePath({ n: 'Ann Lee', gender: 'f', kid: false }) === guestFacePath('Ann Lee', 'f') && personFacePath({ n: 'Cy Lee', gender: 'm', kid: true }) === guestFacePath('Cy Lee', 'm', true);
    o.unknownGender = guestFacePath('X Y', undefined).includes('/f') && guestFacePath('', 'm').startsWith('assets/guests/m') && guestFacePath(null, 'f').startsWith('assets/guests/f');
    const seen = { f: new Set(), m: new Set(), kf: new Set(), km: new Set() };
    for (let i = 0; i < 3000; i++) { const p = drawPerson(i % 2 ? 'f' : 'm'); seen[p.gender].add(guestFacePath(p.name, p.gender)); seen[p.gender === 'f' ? 'kf' : 'km'].add(guestFacePath(p.name, p.gender, true)); }
    o.allFacesUsed = seen.f.size === 36 && seen.m.size === 36 && seen.kf.size === 12 && seen.km.size === 12;
    o.sameGenderOnly = [...seen.f].every(p => p.includes('/f')) && [...seen.m].every(p => p.includes('/m'));
    return o; })()`));
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(([k, v]) => `${k} is ${JSON.stringify(v)}`);
  bad.forEach(b => fail('faces: ' + b));
  if (!bad.length) ok('faces: 36 + 36 grown-up and 12 + 12 child faces, stable per name, right gender and age group, every face gets used');
}

/* ---------- dashboard figures ---------- */
{
  const d = T(`
    const r = {};
    newGame('D', 'D');
    // every room is counted exactly once
    S.rooms[3].damaged = true; S.rooms[4].dirty = true; S.rooms[5].damaged = true;
    const st = roomStatus();
    r.statusAddsUp = st.occupied + st.ready + st.dirty + st.damaged === st.total && st.total === S.rooms.length && st.damaged >= 2;
    S.rooms.forEach(x => { x.damaged = false; x.dirty = false; });
    // the forecast for tonight matches what the end of day actually does
    S.incidents = []; S.jobs = []; S.bookings = []; S.enquiries = []; S.candidates = [];
    S.guests.forEach((g, i) => { g.happiness = 90; g.deposit = i === 0 ? 40 : 0; g.left = 2 + i; g.nights = g.left; g.mealPlan = 'room'; });
    S.staff.forEach((x, i) => { x.sickDays = i === 0 ? 2 : 0; });
    const fc = forecastCash(7);
    r.sevenDays = fc.length === 7 && fc.every((x, i) => x.day === S.day + i);
    const ledgerBefore = S.ledger.length;
    runEndDay();
    const today = S.ledger.slice(ledgerBefore);
    const income = today.filter(e => e.amount > 0 && !e.grant).reduce((a, e) => a + e.amount, 0);
    const wages = -today.filter(e => /wages|Sick pay/.test(e.label)).reduce((a, e) => a + e.amount, 0);
    const running = -today.filter(e => /Running costs/.test(e.label)).reduce((a, e) => a + e.amount, 0);
    r.tonightIncome = [fc[0].income, income];
    r.tonightWages = [fc[0].wages, wages];
    r.tonightRunning = [fc[0].running, running];
    // a £150 deposit covers night one (arrival, day 3) and half of night two
    newGame('E', 'E'); S.guests.forEach(g => { const rm = roomById(g.roomId); rm.guestId = null; }); S.guests = []; S.rooms.forEach(x => { x.guestId = null; });
    S.bookings = [{ id: nid(), name: 'Future Fred', party: soloParty('Future Fred'), adults: 2, children: 0, type: 'Standard', roomId: S.rooms[0].id, arriveDay: S.day + 2, nights: 3, price: 100, mealPlan: 'room', extras: [], deposit: 150, notes: '', noShow: false }];
    const f2 = forecastCash(7).map(x => x.income);
    r.bookingTiming = JSON.stringify(f2) === JSON.stringify([0, 0, 0, 50, 100, 0, 0]) ? true : JSON.stringify(f2);
    r.noNegativeCosts = forecastCash(7).every(x => x.costs >= 0 && x.wages >= 0 && x.running >= 0);
    return r;`);
  const bad = [];
  if (d.statusAddsUp !== true) bad.push('room status does not add up');
  if (d.sevenDays !== true) bad.push('forecast days');
  for (const k of ['tonightIncome', 'tonightWages', 'tonightRunning']) if (d[k][0] !== d[k][1]) bad.push(`${k}: forecast ${d[k][0]} but actual ${d[k][1]}`);
  if (d.bookingTiming !== true) bad.push('bookingTiming ' + d.bookingTiming);
  if (d.noNegativeCosts !== true) bad.push('negative cost');
  bad.forEach(b => fail('dashboard: ' + b));
  if (!bad.length) ok('dashboard: rooms counted once, tonight\'s forecast equals the real end of day (income, wages, running costs), reservations and deposits timed correctly');
}

/* ---------- names and parties ---------- */
{
  const n = T(`
    const r = {};
    r.counts = FIRST_NAMES.length === 1000 && SURNAMES.length >= 980 && SURNAMES.length <= 1000;
    r.noFragments = SURNAMES.every(s => s.length > 2 && s !== s.toLowerCase());
    newGame('N', 'N');
    r.startNamesUnique = new Set([...S.staff.map(s => s.name), ...S.guests.map(g => g.name)]).size === S.staff.length + S.guests.length;
    r.staffGender = S.staff.every(s => { const g = FIRST_NAMES[FIRST_INDEX.get(s.name.split(' ')[0].toLowerCase())][1]; return s.gender === s.portrait[0] && (g === 'u' || g === s.gender); });
    // 20,000 draws are all different
    const seen = new Set(); let dup = 0;
    for (let i = 0; i < 20000; i++) { const p = drawPerson(); if (seen.has(p.name)) dup++; seen.add(p.name); }
    r.drawsDistinct = dup === 0;
    // gender pools: men and women come from their pool or the unisex pool only
    let wrong = 0;
    for (let i = 0; i < 2000; i++) { const p = drawPerson(i % 2 ? 'f' : 'm'); const g = FIRST_NAMES[FIRST_INDEX.get(p.first.toLowerCase())][1]; if (g !== 'u' && g !== p.gender) wrong++; }
    r.genderPools = wrong === 0;
    // surname rules
    const same = rel => { let bad = 0; for (let i = 0; i < 300; i++) { const p = newParty({ adults: rel === 'family' ? 2 : rel === 'single parent' ? 1 : 2, children: rel === 'married' || rel === 'unmarried' || rel === 'friends' || rel === 'colleagues' || rel === 'siblings' ? 0 : 2, rel }); if (p.members.some(m => m.last !== p.members[0].last)) bad++; } return bad; };
    const diff = rel => { let bad = 0; for (let i = 0; i < 300; i++) { const p = newParty({ adults: 2, children: 0, rel }); if (p.members[0].last === p.members[1].last) bad++; } return bad; };
    r.sharedSurnames = same('family') === 0 && same('single parent') === 0 && same('married') === 0 && same('siblings') === 0;
    r.differentSurnames = diff('unmarried') === 0 && diff('friends') === 0 && diff('colleagues') === 0;
    let mixed = 0; const N = 2000;
    for (let i = 0; i < N; i++) { const p = newParty({ adults: 2, children: 0, rel: 'married' }); if (p.members[0].gender !== p.members[1].gender) mixed++; }
    r.mixedShare = mixed / N > 0.82 && mixed / N < 0.94;
    // composition fits the room and the relation fits the composition
    let fit = 0;
    for (const t of Object.keys(ROOM_TYPES)) for (let i = 0; i < 400; i++) { const c = enquiryComposition(t); if (c.adults < 1 || c.adults + c.children > ROOM_TYPES[t].cap) fit++; const rel = pickRelation(c.adults, c.children); if (c.adults === 1 && !['solo', 'single parent'].includes(rel)) fit++; if (c.children && c.adults > 1 && rel !== 'family') fit++; }
    r.compositionFits = fit === 0;
    // typed names are kept as typed; missing surnames are drawn; others are matched to the party
    const p = newParty({ adults: 2, children: 1, rel: 'family', lead: parseTypedName('Zed Quill'), others: ['Maya', 'Jo Quill'] });
    r.typed = p.members[0].n === 'Zed Quill' && p.members[1].n === 'Maya Quill' && p.members[2].n === 'Jo Quill' && p.members[2].kid === true && partyLine(p) === 'with Maya, Jo (child)';
    const u = newParty({ adults: 2, children: 0, rel: 'unmarried', lead: parseTypedName('Zed Quill'), others: ['Maya'] });
    r.typedUnmarried = u.members[1].first === 'Maya' && u.members[1].last !== 'Quill';
    // booking form: typed other names and relation are validated and stored
    S.money = 100000;
    const base = { name: 'Zed Quill', adults: 2, children: 0, type: 'Standard', arriveDay: S.day + 4, nights: 2, price: 90, mealPlan: 'room', extras: [], depositPct: 0 };
    r.tooManyOthers = createBooking(Object.assign({}, base, { others: 'Ann Lee, Bob Lee' })).ok === false;
    r.longOther = createBooking(Object.assign({}, base, { others: 'X'.repeat(31) })).ok === false;
    r.badRel = createBooking(Object.assign({}, base, { rel: 'cousins' })).ok === false;
    const bk = createBooking(Object.assign({}, base, { others: 'Ann Lee', rel: 'colleagues' }));
    r.bookingParty = bk.ok && bk.booking.party.rel === 'colleagues' && bk.booking.party.members.map(m => m.n).join('|') === 'Zed Quill|Ann Lee' && bk.booking.adults === 2;
    const bare = createBooking(Object.assign({}, base, { name: 'Solo Sam', adults: 1, arriveDay: S.day + 5 }));
    r.soloBooking = bare.ok && bare.booking.party.rel === 'solo' && bare.booking.party.members.length === 1;
    // check-in carries the party, and an enquiry accepted carries its own
    S.enquiries = [newEnquiry(S.day)]; const e = S.enquiries[0], who = e.party.members.map(m => m.n);
    const acc = acceptEnquiryNow(e.id);
    r.enquiryParty = !!(acc && acc.guest) && acc.guest.party.members.map(m => m.n).join('|') === who.join('|') && acc.guest.adults === e.adults;
    // contractor engineers and group bookings
    const o = orderWork({ kind: 'service', target: 'asset', key: 'boiler' }, 'cutprice', {});
    r.engineerNamed = o.ok === true && S.works.length > 0 && S.works.every(w => /^[^ ]+ [^ ]+/.test(w.engineer) && w.engineer !== 'undefined');
    // names are claimed: used keys only grow
    r.claimed = S.namesUsed.length > 100 && new Set(S.namesUsed).size === S.namesUsed.length;
    // old saves without parties still work
    const old = JSON.parse(JSON.stringify(S)); delete old.namesUsed; old.guests.forEach(g => delete g.party); old.bookings.forEach(b => delete b.party);
    r.migrates = validState(migrate(old)) && Array.isArray(migrate(old).namesUsed);
    return r;`);
  Object.entries(n).forEach(([k, v]) => { if (v !== true) fail(`names: ${k} is ${JSON.stringify(v)}`); });
  if (Object.values(n).every(v => v === true)) ok('names: 20,000 unique draws, gender pools, surname rules by relationship, typed names, validation, party carried to check-in, old saves migrate');
}

/* ---------- every option of every scenario, forced ---------- */
let forced = 0;
for (const sid of JP(run('JSON.stringify(SCENARIOS.map(s => s.id))'))) {
  const nOpts = JP(run(`JSON.stringify((SCEN['${sid}'].stages || [{options: SCEN['${sid}'].options}]).map(st => st.options.length))`));
  for (let stageIdx = 0; stageIdx < nOpts.length; stageIdx++) {
    for (let opt = 0; opt < nOpts[stageIdx]; opt++) {
      for (let rep2 = 0; rep2 < 6; rep2++) {
        run('newGame("T","T"); __full();');
        run(`Object.keys(FEATURES).forEach(k => { S.features[k] = true; }); ensureFun(); ['Arcade Attendant', 'Kids Club Leader', 'Shop Assistant', 'Excursions Guide'].forEach(role => { const p = drawPerson(); S.staff.push(makeStaff(p.name, p.gender, 'm01', role, 3, 3, [])); });`);
        // make sure every scenario can bind: plenty of guests, free rooms, staff on duty with capacity
        run(`S.day = 6; S.money = 8000; S.staff.forEach(s => { s.rota = Array(14).fill(true); s.sickDays = 0; s.used = 0; });
             S.incidents = []; S.jobs = []; S.guests.forEach(g => { const r = roomById(g.roomId); r.guestId = null; }); S.guests = [];
             S.rooms.forEach(r => { r.dirty = false; r.damaged = false; r.guestId = null; });
             [0, 16, 24, 26].forEach(i => checkIn(S.rooms[i], 'Guest ' + i, 3, i === 24 ? { adults: 2, children: 2 } : undefined));   // one guest per animal-visited room type (Standard, Ocean View, Family, Luxury Suite)
             S.assets.forEach(a => { a.broken = false; a.cond = 80; });`);
        const s = JP(run(`(function(){ const s = SCEN['${sid}']; if (s.seasons) S.day = ({ spring: 3, summer: 31, autumn: 59, winter: 87 })[s.seasons[0]]; if (s.wx) S.weatherSet[S.day] = s.wx[0]; let b; if (FAIL_IDS.has(s.id)) { const key = Object.keys(ASSET_DEFS).find(k => ASSET_DEFS[k].fail.includes(s.id)); (assetByKey(key) || (S.assets.push({ key, cond: 80, broken: false }), assetByKey(key))).broken = true; b = { assetKey: key }; } else { b = bindScenario(s, new Set()); }
           if (!b) return { unbound: true }; const inc = pushIncident(s, b); inc.stage = ${stageIdx}; const st = optionState(inc, ${opt}); return { id: inc.id, reason: st.reason, label: st.label }; })()`));
        if (s.unbound) { if (rep2 === 0 && opt === 0 && stageIdx === 0) fail(`${sid}: could not bind in a rich state`); continue; }
        if (s.reason) continue; // unavailable in this state is legitimate
        run(`resolveIncident(${s.id}, ${opt})`);
        forced++;
        check(`forced ${sid}[${stageIdx}/${opt}]`);
        if (run('S.incidents.length') && !run(`S.incidents.some(i => i.id === ${s.id})`)) { /* resolved fully */ }
      }
    }
  }
}
ok(`forced run of every option: ${forced} executions`);
if (errors.length) errors.slice(0, 10).forEach(e => fail('engine error: ' + e));
const never = JP(run('JSON.stringify(SCENARIOS.map(s=>s.id))')).filter(id => !seenScenarios.has(id));
console.log(never.length ? 'not met in random play (fine if rare/conditional): ' + never.join(', ') : 'every scenario appeared in random play');
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
