'use strict';

/* ================= Game state & rules (no DOM access) ================= */
let S = null;   // saved game state

const nid = () => S.nextId++;
const dow = () => S.day % 7;
const rotaIdx = day => ((day % ROTA_DAYS) + ROTA_DAYS) % ROTA_DAYS;
const worksOn = (s, day) => !!s.rota[rotaIdx(day)];
const fortnight = rotaOff => Array.from({ length: ROTA_DAYS }, (_, i) => !rotaOff.includes(i % 7));   // days off by weekday, repeated for both weeks
const roomById = id => S.rooms.find(r => r.id === id);
const guestById = id => S.guests.find(g => g.id === id);
const staffById = id => S.staff.find(s => s.id === id);
const assetByKey = k => S.assets.find(a => a.key === k);
/* ---------- Progression: levels, goals, unlocks ---------- */
const tierInfo = () => TIERS[S.tier - 1];
const hasFacility = k => S.unlocked.includes(k);
function roleAvailable(role) {
  if (role === 'Chef') return hasFacility('restaurant');
  if (role === 'Spa Therapist') return hasFacility('spa');
  if (role === 'Manager') return S.tier >= 2;
  if (ENTERTAINERS[role]) return featureOn(ENTERTAINERS[role].feature);
  return true;
}
const availableRoles = () => Object.keys(ROLES).filter(roleAvailable);
const availableRoomTypes = () => tierInfo().types.filter(t => t !== 'Luxury Suite' || hasFacility('lift'));
const visibleFacilities = () => FACILITIES.filter(f => (!f.unlock || hasFacility(f.unlock)) && (!f.feature || featureOn(f.feature)));
const roomLimit = () => tierInfo().rooms;
const staffLimit = () => tierInfo().staff;
const runningCost = () => Math.round(tierInfo().overhead + RUNNING_PER_ROOM * S.rooms.length + RUNNING_GUEST_SHARE * S.guests.reduce((a, g) => a + g.price, 0));
const maxPendingIncidents = () => MAX_PENDING_INCIDENTS + Math.floor(S.rooms.length / 40);
const ledgerDay = day => S.ledger.filter(e => e.day === day && !e.grant);   // grants are one-off and never counted as trading income
function randomRoomType() {
  const weights = { 'Standard': 4, 'Ocean View': 2.5, 'Family': 2, 'Luxury Suite': 1.5 };
  const types = [...new Set(S.rooms.map(r => r.type))];
  const w = t => weights[t] * priceDemandFor(t);
  let x = Math.random() * types.reduce((a, t) => a + w(t), 0);
  for (const t of types) { x -= w(t); if (x <= 0) return t; }
  return types[0] || 'Standard';
}
function averageProfit(days) {
  const h = S.history.slice(-days);
  return h.length < days ? null : h.reduce((a, x) => a + x.income - x.expenses, 0) / days;
}
/* Progress towards the next level: null when already at the top. */
function goalProgress() {
  const next = TIERS[S.tier];
  if (!next) return null;
  const g = next.goal, r = rating(), ap = averageProfit(7), day = S.day + 1;
  const items = [
    ...(g.rooms ? [{ label: `Fill the hotel: have ${g.rooms} rooms`, have: `${S.rooms.length} rooms`, need: `${g.rooms}`, pct: S.rooms.length / g.rooms, done: S.rooms.length >= g.rooms }] : []),
    { label: `Reach day ${g.day}`, have: `Day ${day}`, need: `Day ${g.day}`, pct: day / g.day, done: day >= g.day },
    { label: `Guest rating ${g.rating.toFixed(1)} or better (from ${g.reviews}+ reviews)`, have: `${r.toFixed(1)} (${Math.min(S.reviews.length, 999)} reviews)`, need: `${g.rating.toFixed(1)}`,
      pct: Math.min(r / g.rating, S.reviews.length / g.reviews), done: S.reviews.length >= g.reviews && r >= g.rating },
    { label: `Average profit ${money(g.profit)} a day over a week`, have: ap == null ? 'Not enough days yet' : money(ap), need: money(g.profit),
      pct: ap == null ? 0 : Math.max(0, ap / g.profit), done: ap != null && ap >= g.profit }
  ];
  items.forEach(i => { i.pct = clamp(i.pct, 0, 1); });
  return { next, items, met: items.every(i => i.done) };
}
function unlocksOf(t) {
  const prev = TIERS[t.id - 2];
  const out = [];
  t.types.filter(x => !prev.types.includes(x)).forEach(x => out.push(`${x} rooms`));
  Object.values(FACILITY_UPGRADES).filter(f => f.tier === t.id).forEach(f => out.push(f.name));
  out.push(`Up to ${t.rooms} rooms and ${t.staff} staff`);
  return out;
}
/* Called each morning: pays the grant and moves up a level when every goal is met. */
function checkLevelUp() {
  const gp = goalProgress();
  if (!gp || !gp.met) return null;
  S.tier++;
  const t = tierInfo();
  S.money += t.grant;
  S.ledger.push({ day: S.day, label: `Investor funding: ${t.name}`, amount: t.grant, grant: true });
  return t;
}
function buyFacility(key) {
  const f = FACILITY_UPGRADES[key];
  if (!f || hasFacility(key)) return false;
  if (S.tier < f.tier) { notify(`Unlocks at ${TIERS[f.tier - 1].name}.`, 'bad'); return false; }
  if (!canAfford(f.cost)) { notify('Not enough cash.', 'bad'); return false; }
  spend(f.cost, `Built: ${f.name}`);
  S.unlocked.push(key);
  f.assets.forEach(a => { if (!assetByKey(a)) S.assets.push({ key: a, cond: 100, broken: false }); });
  notify(`${f.name} is open for business.`, 'good');
  return true;
}
function nextRoomName() {
  const used = new Set(S.rooms.map(r => r.name));
  for (let n = 101; ; n++) { if (!used.has('Room ' + n)) return 'Room ' + n; }
}
function buildRoom(type, name, photo, quiet) {
  const say = quiet ? m => { if (m.startsWith('Not enough') || m.includes('limited')) notify(m, 'bad'); } : notify;
  if (S.rooms.length >= roomLimit()) { say(`${tierInfo().name}s are limited to ${roomLimit()} rooms. Level up to build more.`, 'bad'); return null; }
  if (!availableRoomTypes().includes(type)) { say('That room type is not available yet.', 'bad'); return null; }
  const cost = ROOM_BUILD_COST[type];
  if (!canAfford(cost)) { say('Not enough cash to build that room.', 'bad'); return null; }
  const room = makeRoom((name || '').trim().slice(0, 30) || nextRoomName(), type);
  if (photo) room.photo = photo;
  S.rooms.push(room);
  spend(cost, `Built ${room.name}`);
  say(`${room.name} is ready.`, 'good');
  return room;
}
const isReady = r => !r.guestId && !r.dirty && !r.damaged;
const notify = (msg, kind) => { if (typeof toast === 'function') toast(msg, kind); };

/* Average of the latest 15 reviews, smoothed with three imaginary 4-star reviews so one early review cannot swing it. */
function rating() {
  const r = S.reviews.slice(-15);
  return (r.reduce((a, x) => a + x.stars, 0) + 4 * 3) / (r.length + 3);
}

/* ---------- Persistence ---------- */
function validState(d) {
  return !!d && d.version === SAVE_VERSION && Number.isInteger(d.day) && typeof d.money === 'number' && Number.isInteger(d.nextId) && Number.isInteger(d.tier) && d.tier >= 1 && d.tier <= TIERS.length && Array.isArray(d.unlocked) &&
    ['rooms', 'staff', 'guests', 'jobs', 'enquiries', 'candidates', 'reviews', 'ledger', 'history', 'news', 'assets', 'incidents', 'incidentLog', 'bookings', 'menu', 'works', 'firms', 'blocks', 'dinners', 'events', 'eventRequests', 'eventLog'].every(k => Array.isArray(d[k])) && d.mail && Array.isArray(d.mail.items) && Array.isArray(d.mail.handled) && !!d.mail.read &&
    d.cooldown && typeof d.cooldown === 'object' &&
    d.staff.every(s => Array.isArray(s.rota) && s.rota.length === ROTA_DAYS && SHIFTS[s.shift] && s.mood >= 0 && s.mood <= 100) && Number.isInteger(d.clock) && Array.isArray(d.timeline);
}
/* Older saves: 'Suite' room type, and v2 hotels (all facilities, no levels) become a fully grown Grand Resort. */
function migrate(d) {
  if (!d || !Array.isArray(d.rooms)) return d;
  d.rooms.forEach(r => { if (r.type === 'Suite') { r.type = 'Luxury Suite'; r.variant = 1; } });
  (d.enquiries || []).forEach(e => { if (e.type === 'Suite') e.type = 'Luxury Suite'; });
  if (d.version === 2) {
    d.version = 3; d.tier = TIERS.length; d.tierSeen = TIERS.length;
    d.unlocked = Object.keys(FACILITY_UPGRADES);
  }
  if (d.tierSeen === undefined) d.tierSeen = d.tier;
  startMilestones(d);
  ensureFun(d);
  if (!d.mgmt || typeof d.mgmt !== 'object') startMgmt(d, true);
  ensureCrises(d);
  ensureStandards(d);
  if (typeof d.morningPending !== 'boolean') d.morningPending = false;
  if (!d.phone || typeof d.phone !== 'object' || !Array.isArray(d.phone.calls)) d.phone = newPhoneState();
  else {   // saves from the first phone desk: fill in anything missing
    const base = newPhoneState();
    for (const k of Object.keys(base)) if (d.phone[k] === undefined || typeof d.phone[k] !== typeof base[k]) d.phone[k] = base[k];
    d.phone.calls = d.phone.calls.filter(c => c && c.caller && (c.ask || c.text));
  }
  if (!d.bank || typeof d.bank !== 'object') d.bank = makeBank();
  if (typeof d.ownerPhoto !== 'string') d.ownerPhoto = null;
  if (!Array.isArray(d.bookings)) d.bookings = [];
  if (!Array.isArray(d.works)) d.works = [];
  if (!Array.isArray(d.namesUsed)) d.namesUsed = [];
  if (!Array.isArray(d.timeline)) d.timeline = [];
  if (typeof d.autoBook !== 'boolean') d.autoBook = false;
  if (!Number.isInteger(d.lifelines)) d.lifelines = 0;
  if (!d.firsts || typeof d.firsts !== 'object') d.firsts = { hidden: true };   // a game already in progress skips the first-steps checklist
  if (!d.challenges || typeof d.challenges !== 'object') d.challenges = newChallengeState();
  if (!d.tally || typeof d.tally !== 'object') d.tally = {};
  if (!d.wtally || typeof d.wtally !== 'object') d.wtally = {};
  if (!Number.isInteger(d.seed)) d.seed = Math.floor(Math.random() * 2147483647) + 1;
  if (!d.weatherSet || typeof d.weatherSet !== 'object') d.weatherSet = {};
  if (!d.tour || typeof d.tour !== 'object') d.tour = { step: 0, done: true };
  if (!d.awards || typeof d.awards !== 'object') d.awards = {};
  if (!d.stats || typeof d.stats !== 'object') d.stats = {};
  ['jobs', 'events', 'weddings', 'fiveStar', 'remembered'].forEach(k => { if (!Number.isInteger(d.stats[k])) d.stats[k] = 0; });
  if (!Array.isArray(d.regulars)) d.regulars = [];
  if (!Array.isArray(d.diary)) d.diary = [];
  startCareer(d);
  d.reviews.forEach(r => { if (!r.id) r.id = d.nextId++; if (r.reply === undefined) r.reply = null; });
  if (!Array.isArray(d.blocks)) d.blocks = [];
  if (!Array.isArray(d.dinners)) d.dinners = [];
  ['events', 'eventRequests', 'eventLog'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  if (!d.mail || !Array.isArray(d.mail.items) || !Array.isArray(d.mail.handled) || typeof d.mail.read !== 'object') d.mail = { items: [], read: {}, handled: [] };
  (d.bookings || []).forEach(b => { if (!Array.isArray(b.requests)) b.requests = []; if (!Number.isFinite(b.moodBonus)) b.moodBonus = 0; });
  if (!Number.isInteger(d.clock)) d.clock = DAY_START;
  (d.staff || []).forEach(s => {
    if (Array.isArray(s.rota) && s.rota.length === 7) s.rota = s.rota.concat(s.rota);
    if (!SHIFTS[s.shift]) s.shift = ROLE_SHIFT[s.role] || 'day';
    if (!(s.mood >= 0 && s.mood <= 100)) s.mood = 70;
    if (!Number.isInteger(s.streak)) s.streak = 0;
  });
  if (!Array.isArray(d.firms)) d.firms = FIRMS.map(f => ({ key: f.key, rating: f.rating, jobs: 0, ok: 0, problems: 0 }));
  if (!Array.isArray(d.menu) && Number.isInteger(d.nextId)) d.menu = DEFAULT_MENU.map(m => Object.assign({ id: d.nextId++, photo: null, img: `assets/menu/${m.key}.jpg`, on: true }, m));
  return d;
}
function loadSave() {
  try {
    const raw = storage.get(SAVE_KEY) || storage.get(LEGACY_SAVE_KEY);
    if (!raw) return null;
    const d = migrate(JSON.parse(raw));
    return validState(d) ? d : null;
  } catch (e) { return null; }
}
function writeSave() {
  if (!S) return true;
  S.ledger = S.ledger.slice(-400);
  S.history = S.history.slice(-60);
  S.reviews = S.reviews.slice(-40);
  S.incidentLog = S.incidentLog.slice(-30);
  if (storage.set(SAVE_KEY, JSON.stringify(S))) return true;
  notify('Could not save: storage is full. Try smaller photos or export your save.', 'bad');
  return false;
}

/* ---------- Money ---------- */
function earn(amount, label) { S.money += amount; S.ledger.push({ day: S.day, label, amount }); }
function spend(amount, label) { S.money -= amount; S.ledger.push({ day: S.day, label, amount: -amount }); }

/* ---------- People ---------- */
function takePortrait(gender, extraUsed) {
  const used = new Set(S.staff.map(s => s.portrait).concat(extraUsed || []));
  const all = Array.from({ length: PORTRAIT_COUNT }, (_, i) => gender + String(i + 1).padStart(2, '0'));
  const free = all.filter(p => !used.has(p));
  return pick(free.length ? free : all);
}
const wageFor = (role, skill) => ROLES[role].base + (skill - 3) * 8;

function makeStaff(name, gender, portrait, role, skill, reliability, rotaOff, shift) {
  return {
    id: nid(), name, gender, portrait, role, skill, reliability, wage: wageFor(role, skill), photo: null,
    trait: pick(TRAITS), rota: fortnight(rotaOff), shift: SHIFTS[shift] ? shift : ROLE_SHIFT[role] || 'day', mood: 70, streak: 0, sickDays: 0, used: 0
  };
}
function makeCandidate(role, extraUsed) {
  const roles = availableRoles().filter(r => r !== 'Manager');
  role = role || (S.tier >= 2 && chance(0.08) ? 'Manager' : pick(roles));
  const ent = ENTERTAINERS[role], own = ent && !S.staff.some(s => s.portrait === ent.portrait) && !(extraUsed || []).includes(ent.portrait);
  const p = drawPerson(own ? ent.portrait[0] : undefined);
  const skill = rndRange(1, 5);
  return {
    id: nid(), name: p.name, gender: p.gender, portrait: own ? ent.portrait : takePortrait(p.gender, extraUsed), role, skill,
    reliability: rndRange(1, 5), wage: wageFor(role, skill), trait: pick(TRAITS)
  };
}
function makeRoom(name, type) {
  const variant = (S.rooms.filter(r => r.type === type).length % ROOM_TYPES[type].variants) + 1;
  return { id: nid(), name, type, variant, price: ROOM_TYPES[type].price, photo: null, guestId: null, dirty: false, damaged: false, repairCost: 0, damageKind: null };
}

/* opts (all optional): price, adults, children, mealPlan, deposit, extras, notes. */
function checkIn(room, name, nights, opts) {
  opts = opts || {};
  const price = opts.price || room.price;
  const def = ROOM_TYPES[room.type].price;
  const perks = (hasFacility('hvac') ? 3 : 0) + (hasFacility('pool') ? 3 : 0);
  const happiness = clamp(Math.round(75 - (price - def) / def * 50 + (rating() - 4) * 3 + perks), 20, 90);
  const g = { id: nid(), name, roomId: room.id, nights, left: nights, price, happiness,
    adults: opts.adults || (opts.party ? opts.party.adults : 1), children: opts.children || (opts.party ? opts.party.children : 0), mealPlan: opts.mealPlan || 'room', deposit: opts.deposit || 0, notes: opts.notes || '',
    party: opts.party || soloParty(name) };
  g.pref = opts.pref !== undefined ? opts.pref : (chance(GUESTBOOK.prefChance) ? pick(GUEST_PREFS).key : null);   // something they like, which they may let slip
  g.note = opts.note || '';                                                                                         // what the player writes about them
  S.guests.push(g);
  room.guestId = g.id;
  for (const key of opts.extras || []) {
    const x = EXTRAS[key];
    if (!x) continue;
    S.jobs.push({ id: nid(), type: 'request', kind: 'extra', label: x.name, guestId: g.id, role: x.role, pay: x.perNight ? x.price * nights : x.price, cost: x.cost || 0, text: `Booked with the room: ${x.name}.`, needsAsset: x.asset || null });
  }
  return g;
}
function leaveGuest(g, room) {
  rememberGuest(g);
  S.guests = S.guests.filter(x => x !== g);
  S.jobs = S.jobs.filter(j => j.guestId !== g.id);
  if (room) { room.guestId = null; room.dirty = true; }
  pruneIncidents();
}
function addReview(name, stars, text) {
  if (stars === 5) { S.stats.fiveStar++; tally('fiveStar'); }
  S.reviews.push({ id: nid(), name, stars, text: text || pick(REVIEW_TEXT[stars]), day: S.day, reply: null });
  postMail({ role: 'Receptionist', subject: `New ${stars}★ review from ${name}`, body: `"${S.reviews[S.reviews.length - 1].text}"`, urgent: stars <= 2, kind: 'review' });
}

/* ---------- New game ---------- */
function newGame(hotel, owner, opts) {
  opts = opts || {};
  S = {
    version: SAVE_VERSION, hotel: hotel || 'The Grand Plaza', owner: owner || 'Manager', ownerPhoto: opts.photo || null, bank: makeBank(opts.bankName, opts.bankColour), day: 0, money: START_MONEY, nextId: 1,
    tier: 1, tierSeen: 1, unlocked: [],
    rooms: [], staff: [], guests: [], jobs: [], enquiries: [], candidates: [], reviews: [], ledger: [], history: [], news: [],
    assets: START_ASSETS.map(key => ({ key, cond: rndRange(80, 100), broken: false })),
    incidents: [], incidentLog: [], cooldown: {}, bookings: [], menu: [], diningLast: null, works: [], firms: [], namesUsed: [], clock: DAY_START, timeline: [], blocks: [], dinners: [], events: [], eventRequests: [], eventLog: [], mail: { items: [], read: {}, handled: [] }, autoBook: false, lifelines: 0, seed: Math.floor(Math.random() * 2147483647) + 1, weatherSet: {}, challenges: newChallengeState(), earned: 0, features: {}, milestones: { done: 0 }, visit: { date: null, streak: 0, best: 0 }, phone: newPhoneState(), regulars: [], diary: [], career: { rank: 0, certs: [] }, tally: {}, wtally: {}, tour: { step: 0, done: true }, firsts: {}, awards: {}, stats: { jobs: 0, events: 0, weddings: 0, fiveStar: 0, remembered: 0 }
  };
  startMgmt(S, true);
  ensureCrises(S);
  ensureStandards(S);
  S.firms = newFirmRecords();
  S.menu = defaultMenu();
  // 24 rooms: 16 garden-view Standard rooms on floors 1-2 and 8 sea-view rooms on floor 3
  for (let n = 101; n <= 108; n++) S.rooms.push(makeRoom('Room ' + n, 'Standard'));
  for (let n = 201; n <= 208; n++) S.rooms.push(makeRoom('Room ' + n, 'Standard'));
  for (let n = 301; n <= 308; n++) S.rooms.push(makeRoom('Room ' + n, 'Ocean View'));
  // role, portrait (its first letter sets the gender of the name drawn), skill, reliability, days off
  const team = [
    ['Receptionist', 'f01', 4, 4, [1, 2], 'early'], ['Receptionist', 'm01', 3, 3, [3, 4], 'late'], ['Receptionist', 'f05', 3, 4, [5, 6], 'early'],
    ['Housekeeper', 'f02', 4, 4, [0, 1], 'early'], ['Housekeeper', 'm02', 3, 3, [2, 3], 'day'], ['Housekeeper', 'f06', 3, 4, [4, 5], 'day'], ['Housekeeper', 'm05', 3, 3, [6, 0], 'late'],
    ['Maintenance', 'm04', 3, 4, [5, 6], 'day'], ['Maintenance', 'm06', 3, 3, [1, 2], 'early']
  ];
  team.forEach(([role, portrait, skill, reliability, off, shift]) => { const gender = portrait[0], p = drawPerson(gender); S.staff.push(makeStaff(p.name, gender, portrait, role, skill, reliability, off, shift)); });
  [0, 2, 4, 8, 10, 12, 17, 19].forEach(ri => { const room = S.rooms[ri], c = enquiryComposition(room.type), party = newParty(c); checkIn(room, party.members[0].n, rndRange(1, 4), { adults: c.adults, children: c.children, party }); });
  [1, 5, 14].forEach(ri => { S.rooms[ri].dirty = true; });
  generateDay();
}

/* ---------- Jobs: cleaning, repairs, guest requests ---------- */
function ensureJobs() {
  for (const r of S.rooms) {
    if (r.dirty && !S.jobs.some(j => j.type === 'clean' && j.roomId === r.id)) {
      S.jobs.push({ id: nid(), type: 'clean', roomId: r.id, role: 'Housekeeper', text: `${r.name} needs cleaning.` });
    }
    if (r.damaged && !workFor('room', r.id) && !S.jobs.some(j => j.type === 'repair' && j.target === 'room' && j.roomId === r.id)) {
      S.jobs.push({ id: nid(), type: 'repair', target: 'room', roomId: r.id, role: 'Maintenance', text: `${r.name} is damaged and out of service.` });
    }
  }
  for (const a of S.assets) {
    if (a.broken && !workFor('asset', a.key) && !S.jobs.some(j => j.type === 'repair' && j.target === 'asset' && j.assetKey === a.key)) {
      S.jobs.push({ id: nid(), type: 'repair', target: 'asset', assetKey: a.key, role: 'Maintenance', text: `${ASSET_DEFS[a.key].name} has broken down. ${ASSET_DEFS[a.key].effect}.` });
    }
  }
  S.jobs = S.jobs.filter(j => {
    if (j.type === 'clean') { const r = roomById(j.roomId); return r && r.dirty; }
    if (j.type === 'repair') return j.target === 'room' ? !!(roomById(j.roomId) || {}).damaged && !workFor('room', j.roomId) : !!(assetByKey(j.assetKey) || {}).broken && !workFor('asset', j.assetKey);
    return true;
  });
  pruneIncidents();
}
function repairQuote(j) {
  const base = j.target === 'room' ? (roomById(j.roomId).repairCost || 150) : ASSET_DEFS[j.assetKey].repair;
  return { house: Math.round(base * 0.6) };
}
function eligible(job) {
  if (job.needsAsset && (assetByKey(job.needsAsset) || {}).broken) return [];
  return S.staff.filter(s => worksOn(s, S.day) && s.sickDays === 0 && (s.role === job.role || s.role === 'Manager'));
}
function eligibleForRole(role) {
  return S.staff.filter(s => worksOn(s, S.day) && s.sickDays === 0 && (s.role === role || s.role === 'Manager'));
}
/* Best on-duty person for a role who still has capacity: exact role first, then highest skill. */
function bestStaff(role) {
  return eligibleForRole(role).filter(s => s.used < STAFF_CAP)
    .sort((a, b) => (b.role === role) - (a.role === role) || b.skill - a.skill)[0] || null;
}
function canAfford(cost) { return S.money - cost > BANKRUPT_AT; }

function fixRoom(room) { room.damaged = false; room.repairCost = 0; room.damageKind = null; }
function fixAsset(a, full) { a.broken = false; a.cond = full ? 100 : Math.max(a.cond, 75); }

function doAssign(jobId, staffId, quiet) {
  const say = quiet ? () => {} : notify;
  const j = S.jobs.find(x => x.id === jobId), s = staffById(staffId);
  if (!j || !s) return false;
  if (!eligible(j).includes(s)) { say(`${s.name} cannot do that job today.`, 'bad'); return false; }
  if (s.used >= STAFF_CAP) { say(`${s.name} has already done ${STAFF_CAP} jobs today.`, 'bad'); return false; }
  if (j.type === 'clean') {
    const r = roomById(j.roomId);
    r.dirty = false;
    say(`${s.name} cleaned ${r.name}.`, 'good');
  } else if (j.type === 'repair') {
    const q = repairQuote(j);
    if (!canAfford(q.house)) { say('Not enough cash for the parts.', 'bad'); return false; }
    if (j.target === 'room') { const r = roomById(j.roomId); spend(q.house, `Parts: repair ${r.name}`); fixRoom(r); say(`${s.name} repaired ${r.name}.`, 'good'); }
    else { const a = assetByKey(j.assetKey); spend(q.house, `Parts: repair ${ASSET_DEFS[a.key].name}`); fixAsset(a, false); say(`${s.name} repaired the ${ASSET_DEFS[a.key].name.toLowerCase()}.`, 'good'); }
  } else {
    const g = guestById(j.guestId);
    if (j.type === 'complaint') {
      g.happiness = clamp(g.happiness + 12 + s.skill * 3 + (j.discount ? 15 : 0), 0, 100);
      if (j.discount) spend(DISCOUNT_COST, `Discount for ${g.name}`);
      say(`${s.name} resolved ${g.name}'s complaint.`, 'good');
    } else if (j.dishId && !dishServable(j.dishId)) {   // the guest asked for a particular dish and the kitchen can no longer make it
      g.happiness = clamp(g.happiness - WISH_MEAL_UPSET, 0, 100);
      raiseComplaint(g, `I asked for the ${j.dishName}, and that is not what I was given.`, 'dish');
      say(`${s.name} could not make the ${j.dishName} for ${g.name}: it is not on the menu. They have complained.`, 'bad');
    } else {
      g.happiness = clamp(g.happiness + 6 + s.skill * 2, 0, 100);
      if (j.pay) earn(j.pay, `${j.label}: ${g.name}`);
      if (j.cost) spend(j.cost, `Ingredients and supplies: ${j.label}`);
      if (j.feel) g.happiness = clamp(g.happiness + j.feel, 0, 100);
      say(`${s.name} completed the request${j.pay ? ' (+' + money(j.pay) + ')' : ''}.`, 'good');
    }
  }
  s.used++;
  S.stats.jobs++; tally('jobs');
  if (j.type === 'clean') noteFirst('cleaned');
  scheduleWork(s, jobLabel(j), j.type);
  S.jobs = S.jobs.filter(x => x !== j);
  ensureJobs();
  return true;
}
/* ---------- Bulk actions for bigger hotels ---------- */
/* Hands every open job to the best available person: most relevant role first, then the most skilled. Complaints get no discount. */
function autoAssignAll() {
  const order = { complaint: 0, repair: 1, request: 2, clean: 3 };
  let done = 0;
  for (const j of [...S.jobs].sort((a, b) => order[a.type] - order[b.type])) {
    if (!S.jobs.includes(j)) continue;
    const st = bestStaff(j.role);
    if (st && doAssign(j.id, st.id, true)) done++;
  }
  return done;
}
/* Evening: with Reception handling bookings, enquiries still waiting are accepted where a room fits. Needs a receptionist or manager on the rota. */
function autoBookEnquiries(events) {
  if (!S.autoBook || !S.enquiries.length || !staffCovered('Receptionist', S.day)) return 0;
  const n = acceptAllEnquiries();
  if (n) events.push({ text: `Reception booked ${n} guest${n > 1 ? 's' : ''} in for you.` });
  return n;
}
/* When the money runs out the bank steps in (a limited number of times) instead of closing the hotel. Returns what it paid, or 0. */
function applyLifeline() {
  if (S.money > BANKRUPT_AT || S.lifelines >= LIFELINE_MAX) return 0;
  const amount = LIFELINE_CASH - S.money;
  S.lifelines++;
  S.money += amount;
  S.ledger.push({ day: S.day, label: 'Bank lifeline', amount, grant: true });
  postMail({ from: bankName(), role: 'Bank', subject: `${bankName()} has stepped in`, body: `You had run out of money, so the bank has covered your bills and your balance is now ${money(S.money)}. ${LIFELINE_MAX - S.lifelines ? `It will only do this ${LIFELINE_MAX - S.lifelines === 1 ? 'one more time' : LIFELINE_MAX - S.lifelines + ' more times'}.` : 'This was the last time.'} Check your costs and fill your rooms.`, urgent: true, kind: 'bank' });
  return amount;
}
function acceptAllEnquiries() {
  let done = 0;
  for (const e of [...S.enquiries]) if (acceptEnquiryNow(e.id).ok) done++;
  return done;
}

/* Preventive servicing keeps equipment from breaking. */
function serviceQuote(key) { return { house: Math.round(ASSET_DEFS[key].service * 0.5) }; }
function serviceAsset(key) {
  const a = assetByKey(key), q = serviceQuote(key);
  if (!a || a.broken || workFor('asset', key)) return;
  const s = bestStaff('Maintenance');
  if (!s) return notify('Nobody from Maintenance is available today.', 'bad');
  if (!canAfford(q.house)) return notify('Not enough cash for the parts.', 'bad');
  spend(q.house, `Parts: service ${ASSET_DEFS[key].name}`);
  s.used++;
  tally('services');
  scheduleWork(s, `Servicing the ${ASSET_DEFS[key].name.toLowerCase()}`, 'service');
  a.cond = Math.min(100, a.cond + 45);
  notify(`${s.name} serviced the ${ASSET_DEFS[key].name.toLowerCase()}.`, 'good');
}

/* ---------- Facilities ---------- */
/* day: an absolute day number (default today). */
function staffCovered(role, day) {
  const isToday = day === S.day;
  return S.staff.some(s => worksOn(s, day) && (!isToday || s.sickDays === 0) && (s.role === role || (s.role === 'Manager' && !ENTERTAINERS[role])));
}
function facilityStatus(f, day) {
  if (day === undefined) day = S.day;
  if (crisisClosed(f.key)) return { open: false, why: 'closed during a crisis' };
  if (f.asset && (assetByKey(f.asset) || {}).broken) return { open: false, why: `${ASSET_DEFS[f.asset].name} broken` };
  if (f.role && !staffCovered(f.role, day)) return { open: false, why: `no ${f.role.toLowerCase()}` };
  return { open: true, why: '' };
}

/* ================= Scenario (incident) engine ================= */
const SCEN = {};
SCENARIOS.forEach(s => { SCEN[s.id] = s; });
const FAIL_IDS = new Set(Object.values(ASSET_DEFS).flatMap(d => d.fail));

function ctxOf(inc) {
  const b = inc.b || {};
  const c = { inc, s: SCEN[inc.sid], d: inc.d || {}, guest: guestById(b.guestId) || null, room: roomById(b.roomId) || null,
    staff: staffById(b.staffId) || null, asset: b.assetKey ? assetByKey(b.assetKey) : null };
  c.def = c.asset ? ASSET_DEFS[c.asset.key] : null;
  return c;
}
function fill(str, c, st, st2) {
  const first = n => String(n || '').split(' ')[0];
  return String(str)
    .replace(/\{guest\}/g, c.guest ? c.guest.name : 'the guest')
    .replace(/\{first\}/g, c.guest ? first(c.guest.name) : 'the guest')
    .replace(/\{room\}/g, c.room ? c.room.name : 'the room')
    .replace(/\{staff\}/g, c.staff ? c.staff.name : 'a staff member')
    .replace(/\{sfirst\}/g, c.staff ? first(c.staff.name) : 'a staff member')
    .replace(/\{asset\}/g, c.def ? c.def.name.toLowerCase() : 'equipment')
    .replace(/\{s2\}/g, st2 ? first(st2.name) : 'another team member')
    .replace(/\{s\}/g, st ? first(st.name) : 'a team member')
    .replace(/\{d\.(\w+)\}/g, (m, k) => (c.d && c.d[k] !== undefined ? c.d[k] : ''));
}
const scenarioText = inc => { const c = ctxOf(inc); const t = c.s.text; const arr = typeof t === 'function' ? [t(c)] : Array.isArray(t) ? t : [t]; return fill(arr[inc.v % arr.length], c); };
const scenarioTitle = inc => { const c = ctxOf(inc); return fill(typeof c.s.title === 'function' ? c.s.title(c) : c.s.title, c); };
const optionCost = (o, c) => Math.round(typeof o.cost === 'function' ? o.cost(c) : (o.cost || 0));

function bindScenario(s, taken) {
  const b = {};
  for (const n of (s.needs || [])) {
    if (n === 'guest' || n.startsWith('guest:')) {
      const type = n.startsWith('guest:') ? n.slice(6) : null;   // a room type, or 'children' for a family
      const pool = S.guests.filter(g => !taken.has('g' + g.id) && (!type || (type === 'children' ? g.children > 0 : (roomById(g.roomId) || {}).type === type)));
      if (!pool.length) return null;
      const g = pick(pool); b.guestId = g.id; b.roomId = g.roomId;
    } else if (n === 'emptyRoom') {
      const pool = S.rooms.filter(isReady);
      if (!pool.length) return null;
      b.roomId = pick(pool).id;
    } else if (n === 'staff') {
      if (!S.staff.length) return null;
      b.staffId = pick(S.staff).id;
    } else if (n.startsWith('role:')) {
      const pool = S.staff.filter(x => x.role === n.slice(5));
      if (!pool.length) return null;
      b.staffId = pick(pool).id;
    } else if (n.startsWith('asset:')) {
      const a = assetByKey(n.slice(6));
      if (!a || a.broken) return null;
      b.assetKey = a.key;
    }
  }
  if (s.min && s.min.guests && S.guests.length < s.min.guests) return null;
  if (s.min && s.min.staff && S.staff.length < s.min.staff) return null;
  if (s.wx && !s.wx.includes(weatherOn(S.day).kind)) return null;
  if (s.seasons && !s.seasons.includes(seasonOf(S.day).key)) return null;
  if (s.when && !s.when(S)) return null;
  return b;
}
function pushIncident(s, b) {
  const inc = { id: nid(), sid: s.id, b, day: S.day, v: rnd(1000), d: {} };
  inc.d = s.init ? s.init(ctxOf(inc)) : {};
  S.incidents.push(inc);
  S.cooldown[s.id] = S.day;
  return inc;
}
function rollIncidents() {
  const r = Math.random();
  const extra = S.rooms.length / 60;
  const n = S.day === 0 ? 1 : (r < 0.2 ? 0 : r < 0.7 ? 1 : r < 0.92 ? 2 : 3) + Math.floor(extra) + (chance(extra % 1) ? 1 : 0);
  const taken = new Set(S.incidents.filter(i => i.b.guestId).map(i => 'g' + i.b.guestId));
  for (let k = 0; k < n && S.incidents.length < maxPendingIncidents(); k++) {
    const pool = SCENARIOS.filter(s => !FAIL_IDS.has(s.id) && (s.minDay || 0) <= S.day && S.day - (S.cooldown[s.id] ?? -99) >= INCIDENT_COOLDOWN);
    for (let attempt = 0; attempt < 15 && pool.length; attempt++) {
      const total = pool.reduce((a, s) => a + (s.w || 1), 0);
      let x = Math.random() * total, s = pool[0];
      for (const p of pool) { x -= (p.w || 1); if (x <= 0) { s = p; break; } }
      const b = bindScenario(s, taken);
      if (b) { if (b.guestId) taken.add('g' + b.guestId); pushIncident(s, b); break; }
    }
  }
}
function rollAssetFailures() {
  if (S.day < 2) return;
  for (const a of S.assets) {
    if (a.broken || !assetInUse(a)) continue;
    const p = a.cond < 50 ? (50 - a.cond) / 100 * 0.8 + 0.02 : 0.004;
    if (chance(p)) {
      const def = ASSET_DEFS[a.key], s = SCEN[pick(def.fail)];
      a.broken = true;
      if (s) pushIncident(s, { assetKey: a.key });
    }
  }
}
/* Drop incidents whose guest, room or staff member no longer exists. */
function pruneIncidents() {
  S.incidents = S.incidents.filter(i => {
    if (i.busy) return true;
    const b = i.b || {};
    if (FAIL_IDS.has(i.sid) && (!(assetByKey(b.assetKey) || {}).broken || (workFor('asset', b.assetKey) && !i.wantsContractor))) return false;
    return (!b.guestId || guestById(b.guestId)) && (!b.roomId || roomById(b.roomId)) && (!b.staffId || staffById(b.staffId)) && SCEN[i.sid];
  });
}

/* The set of things a scenario outcome is allowed to do. Every call is recorded for the outcome screen. */
function makeAPI(c) {
  const lines = [];
  const log = (t, kind, amt) => lines.push({ t, kind: kind || '', amt: amt ?? null });
  const A = {
    lines,
    roll: p => Math.random() < p,
    pay(n, label) { n = Math.round(n); if (n > 0) { const l = label || scenarioTitle(c.inc); spend(n, l); log(l, 'bad', -n); } },
    earn(n, label) { n = Math.round(n); if (n > 0) { const l = label || scenarioTitle(c.inc); earn(n, l); log(l, 'good', n); } },
    mood(g, d) { if (d !== 0 && g && guestById(g.id)) { g.happiness = clamp(g.happiness + d, 0, 100); log(`${g.name}: satisfaction ${d > 0 ? '+' : ''}${d}`, d > 0 ? 'good' : 'bad'); } },
    moodAll(d, why) { for (const g of S.guests) g.happiness = clamp(g.happiness + d, 0, 100); if (S.guests.length) log(`All guests: satisfaction ${d > 0 ? '+' : ''}${d}${why ? ' (' + why + ')' : ''}`, d > 0 ? 'good' : 'bad'); },
    review(stars, text, name) { addReview(name || drawPerson().name, stars, text); log(`New ${stars}★ review`, stars >= 4 ? 'good' : stars <= 2 ? 'bad' : ''); },
    evict(g) { if (g && guestById(g.id)) { const r = roomById(g.roomId); leaveGuest(g, r); log(`${g.name} has left the hotel`); } },
    refund(g, nights) { if (g) { const n = Math.min(nights, g.left); const amt = n * g.price; spend(amt, `Refund: ${g.name}`); log(`Refund to ${g.name}`, 'bad', -amt); } },
    damageRoom(room, cost, kind) { if (room) { room.damaged = true; room.repairCost = Math.round(cost); room.damageKind = kind || 'trashed'; log(`${room.name} damaged and out of service`, 'bad'); } },
    dirty(room) { if (room && !room.guestId) { room.dirty = true; } },
    clean(room) { if (room) { room.dirty = false; log(`${room.name} cleaned`, 'good'); } },
    repairRoom(room) { if (room) { fixRoom(room); log(`${room.name} repaired`, 'good'); } },
    breakAsset(key) { const a = assetByKey(key); if (a) { a.broken = true; log(`${ASSET_DEFS[key].name} out of action`, 'bad'); } },
    fixAsset(key, full) { const a = assetByKey(key); if (a) { fixAsset(a, !!full); log(`${ASSET_DEFS[key].name} fixed`, 'good'); } },
    wear(key, d) { const a = assetByKey(key); if (a) { a.cond = clamp(a.cond + d, 0, 100); log(`${ASSET_DEFS[key].name} condition ${d > 0 ? '+' : ''}${d}`, d > 0 ? 'good' : 'bad'); } },
    loseStock(frac) {
      if (!S.shop) return 0;
      let value = 0;
      for (const k of Object.keys(S.shop.stock)) { const n = Math.floor(S.shop.stock[k] * frac); S.shop.stock[k] -= n; value += n * SHOP_LINES[k].cost; }
      value = Math.round(value);
      if (value) log(`Shop stock lost, worth ${money(value)}`, 'bad');
      return value;
    },
    skill(s, d) { if (s && staffById(s.id)) { s.skill = clamp(s.skill + d, 1, 5); log(`${s.name}: skill ${d > 0 ? 'up' : 'down'} to ${s.skill}★`, d > 0 ? 'good' : 'bad'); } },
    raise(s, amt) { if (s && staffById(s.id)) { s.wage += amt; log(`${s.name}'s wage is now ${money(s.wage)} a day`); } },
    sick(s, days) { if (s && staffById(s.id)) { s.sickDays = Math.max(s.sickDays, days); log(`${s.name} is off sick for ${days} day${days > 1 ? 's' : ''}`, 'bad'); } },
    quit(s) { if (s && staffById(s.id)) { S.staff = S.staff.filter(x => x !== s); pruneIncidents(); log(`${s.name} has left the hotel`, 'bad'); } },
    enquiries(n) { for (let i = 0; i < n; i++) { const e = newEnquiry(S.day); e.nights = rndRange(1, 4); S.enquiries.push(e); } log(`${n} extra booking enquir${n > 1 ? 'ies' : 'y'}`, 'good'); },
    reliab(s, d) { if (d !== 0 && s && staffById(s.id)) { s.reliability = clamp(s.reliability + d, 1, 5); log(`${s.name}: reliability ${d > 0 ? 'up' : 'down'} to ${s.reliability}★`, d > 0 ? 'good' : 'bad'); } },
    moveGuest(g, room) {
      const old = g && roomById(g.roomId);
      if (!old || !room || !isReady(room) || roomBusy(room, S.day, S.day + g.left)) return false;
      old.guestId = null; old.dirty = true; room.guestId = g.id; g.roomId = room.id;
      log(`${g.name} moved to ${room.name}`);
      return true;
    },
    groupBook(n, nights, discount, who) {
      const rooms = S.rooms.filter(r => isReady(r) && !roomBusy(r, S.day, S.day + nights)).slice(0, n);
      rooms.forEach(r => {
        // corporate guests travel alone, tour groups are couples, wedding guests are couples and families
        const c = who === 'Corporate' ? { adults: 1, children: 0 } : who === 'Tour' ? { adults: 2, children: 0 } : who === 'Wedding' ? (chance(0.5) ? { adults: 2, children: rndRange(0, 2) } : { adults: 2, children: 0 }) : { adults: 1, children: 0 };
        const cap = ROOM_TYPES[r.type].cap, adults = Math.min(c.adults, cap), children = Math.min(c.children, cap - adults);
        const party = newParty({ adults, children, rel: who === 'Corporate' ? 'solo' : 'auto' });
        const g = checkIn(r, party.members[0].n, nights, { adults, children, party, notes: `${who || 'Group'} party` });
        g.price = Math.round(r.price * (1 - (discount || 0)));
      });
      if (rooms.length) log(`${rooms.length} rooms booked for ${nights} night${nights > 1 ? 's' : ''}`, 'good');
      return rooms.length;
    },
    demand(n, days) { S.demand = { n, until: S.day + (days || 3) }; log(`Booking demand ${n > 0 ? 'up' : 'down'} for ${days || 3} days`, n > 0 ? 'good' : 'bad'); },
    note(t, kind) { log(t, kind); }
  };
  return A;
}

const stagesOf = s => s.stages || [{ options: s.options }];
const currentStage = inc => stagesOf(SCEN[inc.sid])[inc.stage || 0];
/* State of one option for the UI: cost, who would do it, and whether it can be chosen. */
function optionState(inc, i) {
  const c = ctxOf(inc), o = currentStage(inc).options[i];
  const roles = o.staff ? [].concat(o.staff) : [];
  const sts = [];
  let missing = null;
  for (const role of roles) {
    const st = eligibleForRole(role).filter(s => s.used < STAFF_CAP && !sts.includes(s))
      .sort((a, b) => (b.role === role) - (a.role === role) || b.skill - a.skill)[0];
    if (!st) { missing = role; break; }
    sts.push(st);
  }
  const cost = optionCost(o, c);
  let reason = null;
  if (missing) reason = `No ${missing.toLowerCase()} available today`;
  else if (cost && !canAfford(cost)) reason = 'Cannot afford this';
  else if (o.when && !o.when(c)) reason = o.whenText || 'Not possible right now';
  const lab = typeof o.label === 'function' ? o.label(c) : o.label;
  const hint = typeof o.hint === 'function' ? o.hint(c) : (o.hint || '');
  const odds = o.odds && sts[0] ? o.odds(c, sts[0]) : null;   // the chance of success, when the option says what it is
  return { label: fill(lab, c, sts[0], sts[1]), hint: fill(hint, c, sts[0], sts[1]), cost, sts, reason, odds };
}

/* Applies one choice. Returns null if blocked, {done:false} if another step follows, or the final outcome. */
function resolveIncident(id, idx) {
  const inc = S.incidents.find(i => i.id === id);
  if (!inc) return null;
  const os = optionState(inc, idx);
  if (os.reason) { notify(os.reason, 'bad'); return null; }
  inc.busy = true;
  noteFirst('incident');
  const c = ctxOf(inc), o = currentStage(inc).options[idx];
  const imgPrimary = c.s.imgFor ? c.s.imgFor(c) : null;
  os.sts.forEach(s => { s.used++; scheduleWork(s, scenarioTitle(inc), 'incident'); });
  const A = makeAPI(c);
  if (os.cost) A.pay(os.cost, `${scenarioTitle(inc)}: ${os.label}`.slice(0, 70));
  let text = '';
  try { text = o.run ? o.run(c, A, os.sts[0], os.sts[1]) : ''; }
  catch (e) { console.error('Scenario error', inc.sid, e); text = 'The situation resolved itself.'; }
  inc.parts = (inc.parts || []).concat([{ choice: os.label, text: fill(text || '', c, os.sts[0], os.sts[1]) }]);
  inc.lines = (inc.lines || []).concat(A.lines);

  const all = stagesOf(c.s);
  let next = (inc.stage || 0) + 1;
  const c2 = ctxOf(inc);
  while (next < all.length && all[next].when && !all[next].when(c2)) next++;
  if (next < all.length) { inc.stage = next; inc.busy = false; ensureJobs(); return { done: false }; }

  S.incidents = S.incidents.filter(i => i !== inc);
  const title = scenarioTitle(inc);
  S.incidentLog.push({ day: S.day, title, choice: inc.parts.map(p => p.choice).join(' → '), result: inc.parts.map(p => p.text).filter(Boolean).join(' ') });
  pruneIncidents();
  ensureJobs();
  return { done: true, title, parts: inc.parts, lines: inc.lines, img: c.s.img, imgPrimary };
}
function ignoreIncident(inc) {
  inc.busy = true;
  const c = ctxOf(inc), A = makeAPI(c);
  try { if (c.s.ignore) c.s.ignore(c, A); else if (c.guest) A.mood(c.guest, -20); }
  catch (e) { console.error('Scenario ignore error', inc.sid, e); }
  const grown = escalateIncident(inc);   // an urgent problem left alone may grow into a crisis
  if (grown) A.lines.push(grown);
  S.incidentLog.push({ day: S.day, title: scenarioTitle(inc), choice: 'Ignored', result: A.lines.map(l => l.t).join('; ') });
  return A.lines;
}

/* A booking enquiry from a party that suits the room type, with real surname logic. */
function newEnquiry(arriveDay) {
  const type = randomRoomType(), c = enquiryComposition(type), party = newParty(c);
  return { id: nid(), name: party.members[0].n, nights: rndRange(1, 5), type, adults: c.adults, children: c.children, party, arriveDay: arriveDay ?? S.day + (chance(0.3) ? rndRange(1, 10) : 0) };
}

/* ================= Daily cycle ================= */
function generateDay() {
  S.news = [];
  S.clock = DAY_START; S.timeline = []; S.blocks = S.blocks.filter(k => k.to > S.day);
  processContractors();
  for (const s of S.staff) {
    s.used = 0;
    if (worksOn(s, S.day) && s.sickDays === 0 && chance((6 - s.reliability) * 0.03 + (s.mood < 40 ? 0.04 : 0))) {
      s.sickDays = rndRange(1, 3);
      announce(`${s.name} (${s.role}) called in sick for ${s.sickDays} day${s.sickDays > 1 ? 's' : ''}.`, { role: 'Receptionist', subject: `${s.name} has called in sick`, kind: 'sick' });
    }
  }
  for (const g of S.guests) {
    if (S.jobs.some(j => j.guestId === g.id)) continue;
    const pc = clamp(0.06 + (70 - g.happiness) / 250, 0.04, 0.35);
    const x = Math.random();
    const room = roomById(g.roomId);
    if (x < pc) {
      S.jobs.push({ id: nid(), type: 'complaint', guestId: g.id, role: 'Receptionist', text: pick(COMPLAINTS), discount: false });
      S.news.push(`${g.name} in ${room.name} has a complaint.`);
    } else if (x < pc + 0.25) {
      const dishes = menuAvailable().filter(d => d.cat !== 'Drink');
      const q = pick(REQUESTS.filter(x => (!x.facility || hasFacility(x.facility)) && (x.kind !== 'food' || dishes.length)));
      const job = { id: nid(), type: 'request', kind: q.kind, label: q.label, guestId: g.id, role: q.role, pay: q.pay, text: q.text, needsAsset: q.asset || null };
      if (q.kind === 'food') { const dish = pick(dishes); Object.assign(job, { dishId: dish.id, dishName: dish.name, label: `Room service: ${dish.name}`, text: `Could I order the ${dish.name} to the room, please?`, pay: dish.price, cost: ingredientCost(dish), feel: dishFeeling(dish) }); }
      S.jobs.push(job);
    }
  }
  const r = rating();
  const base = S.rooms.length * 0.4 + (r >= 4.5 ? 2 : r >= 3.5 ? 1 : 0);   // then the season, any festival and your prices change how many ask
  const n = Math.max(0, Math.round(base * demandFactor(S.day) * priceDemand()) + rnd(2) + (S.demand && S.demand.until >= S.day ? S.demand.n : 0));
  S.enquiries = Array.from({ length: n }, () => newEnquiry());
  S.candidates = [];
  for (let i = 0; i < 6; i++) S.candidates.push(makeCandidate(null, S.candidates.map(c => c.portrait)));
  markArrivals();
  rollAssetFailures();
  rollIncidents();
  rollCrises();
  inspectionNotice();
  sellEventTickets();
  makeEventRequests();
  phoneNewDay();
  issueChallenges();
  ensureJobs();
  if (S.news.length === 0) S.news.push('A quiet morning at the hotel.');
}

function runEndDay(opts) {
  openMorning();   // a day that was never opened still has to happen before it can end
  const d = dow();
  noteFirst('endDay');
  const fullAtDusk = S.rooms.length > 0 && S.guests.length >= S.rooms.length;
  const dusk = duskSnapshot();
  const events = [];

  // 0. Incidents left undecided get their "ignored" consequence
  for (const inc of [...S.incidents]) {
    if (!S.incidents.includes(inc)) continue;
    const lines = ignoreIncident(inc);
    events.push({ text: `Ignored: ${scenarioTitle(inc)}${lines.length ? ' (' + lines.map(l => l.t).join('; ') + ')' : ''}` });
  }
  S.incidents = [];
  pruneIncidents();

  // 0a. Reception books in anyone you have not got round to, if it is set to and someone is on the desk
  autoBookEnquiries(events);

  // 0b. Reservations still waiting are checked in, or walk away if there is no room
  processArrivals(events);

  // 1. Unresolved guest problems
  for (const j of S.jobs) {
    const g = guestById(j.guestId);
    if (!g) continue;
    g.happiness = clamp(g.happiness - (j.type === 'complaint' ? 10 : 6), 0, 100);
    if (j.type === 'request') events.push({ text: `${g.name} gave up waiting for: ${j.label}.` });
  }
  const lostOrders = S.jobs.filter(j => j.type === 'request' && j.dishId);
  S.jobs = S.jobs.filter(j => j.type !== 'request');
  for (const j of lostOrders) { const g = guestById(j.guestId); if (g && raiseComplaint(g, `I ordered the ${j.dishName} to my room, and it never arrived.`, 'dish')) events.push({ text: `${g.name} ordered the ${j.dishName} and it never came. They have complained.` }); }

  // 2. Broken equipment upsets guests
  for (const a of S.assets) {
    if (!a.broken || !S.guests.length || !assetInUse(a)) continue;
    const def = ASSET_DEFS[a.key];
    for (const g of S.guests) g.happiness = clamp(g.happiness - def.hit, 0, 100);
    events.push({ text: `${def.name} still broken: ${def.effect.toLowerCase()}.` });
  }

  // 2b. Restaurant evening service
  const dining = runDining();
  if (dining.covers) events.push({ text: `Restaurant: ${dining.covers} covers${dining.reserved ? ` (${dining.reserved} reserved)` : ''}, takings ${money(dining.revenue)}, ingredients ${money(dining.cost)}.` });
  else if (hasFacility('restaurant')) events.push({ text: dining.open ? 'The restaurant had no diners tonight.' : 'The restaurant was closed tonight.' });

  if (dining.cancelled) events.push({ text: `${dining.cancelled} dinner reservation${dining.cancelled > 1 ? 's' : ''} had to be cancelled: the restaurant could not open.` });
  judgeMealWishes(events);

  // 2c. Events
  runEvents(events);

  // 2d. The extras: arcade, Kids Club, shop and excursions
  runFun(events);

  // 2e. Crises run on, the standards score moves, and the inspector may call
  runCrises(events);
  updateStandards();
  const inspection = runInspection(events);

  // 3. Guests: storm out, pay for the night, or check out
  for (const g of [...S.guests]) {
    const room = roomById(g.roomId);
    if (g.happiness <= 0) {
      addReview(g.name, 1);
      events.push({ text: `${g.name} left ${room.name} in anger (1★ review).` });
      leaveGuest(g, room);
      continue;
    }
    const fromDeposit = Math.min(g.deposit || 0, g.price);
    g.deposit = (g.deposit || 0) - fromDeposit;
    if (g.price - fromDeposit > 0) earn(g.price - fromDeposit, `${room.name}: ${g.name}`);
    if ((g.mealPlan || 'room') !== 'room') {
      if (restaurantOpen()) { const m = mealPerNight(g.mealPlan, g.adults || 1, g.children || 0); if (m) earn(m, `Meal plan: ${g.name}`); }
      else { g.happiness = clamp(g.happiness - 6, 0, 100); events.push({ text: `${g.name} is on ${MEAL_PLANS[g.mealPlan].name.toLowerCase()} but the restaurant was closed.` }); }
    }
    g.left--;
    g.happiness = clamp(g.happiness + 2, 0, 100);
    if (g.left <= 0) {
      const sc = clamp(Math.ceil(g.happiness / 20) - crisisReviewHit(), 1, 5);   // a crisis that is spreading drags reviews down
      addReview(g.name, sc);
      events.push({ text: `${g.name} checked out of ${room.name} and left ${sc}★.` });
      leaveGuest(g, room);
    }
  }

  // 4. Costs
  let wages = 0, sickPay = 0;
  for (const s of S.staff) {
    if (!worksOn(s, S.day)) continue;
    if (s.sickDays > 0) sickPay += Math.round(s.wage / 2); else wages += s.wage;
  }
  if (wages) spend(wages, 'Staff wages');
  if (sickPay) spend(sickPay, 'Sick pay (half wage)');
  spend(runningCost(), 'Running costs (energy, laundry, food)');

  updateStaffMood();

  // 5. Equipment wear
  for (const a of S.assets) if (!a.broken && assetInUse(a)) a.cond = Math.max(0, a.cond - rndRange(ASSET_DEFS[a.key].decay[0], ASSET_DEFS[a.key].decay[1]));

  // 6. Report
  const today = ledgerDay(S.day);
  const income = today.filter(e => e.amount > 0).reduce((a, e) => a + e.amount, 0);
  const expenses = -today.filter(e => e.amount < 0).reduce((a, e) => a + e.amount, 0);
  S.history.push({ day: S.day, income, expenses });
  S.earned += income;
  postMail({ role: 'Accounts', subject: `Day ${S.day + 1} summary: ${signed(income - expenses)}`, body: `Income ${money(income)}, costs ${money(expenses)}, profit ${signed(income - expenses)}. Cash in the bank ${money(S.money)}.${events.length ? ' ' + events.slice(0, 4).map(x => x.text).join(' ') : ''}`, kind: 'summary' });
  const report = { day: S.day, dayLabel: `${DAYS_LONG[d]}, day ${S.day + 1}`, income, expenses, lines: today.map(e => ({ label: e.label, amount: e.amount })), events };

  const won = checkAwards({ income, expenses, profit: income - expenses, full: fullAtDusk });
  if (won.length) report.awards = won.map(a => a.name);
  const cw = checkChallenges(Object.assign({}, dusk, { profit: income - expenses }));
  if (cw.length) report.challenges = cw;
  if (inspection) report.inspection = inspection;
  report.headline = dayHeadline(income - expenses);
  const reached = checkMilestones();
  if (reached.length) report.milestones = reached;
  const promoted = checkPromotion();
  if (promoted.length) report.promotions = promoted;
  const lifeline = applyLifeline();
  if (lifeline) report.lifeline = { amount: lifeline, left: LIFELINE_MAX - S.lifelines };

  // 7. Next morning
  for (const s of S.staff) if (s.sickDays > 0) s.sickDays--;
  S.day++;
  const up = checkLevelUp();
  if (opts && opts.defer) { ensureJobs(); S.morningPending = true; }   // the next morning waits until Management goes online
  else generateDay();
  pruneMailRead();
  report.tip = coachTip();
  if (up) { report.levelUp = up.name; S.news.unshift(`You are now a ${up.name}! Investors have paid ${money(up.grant)}.`); postMail({ from: 'The investors', role: 'Board', subject: `Congratulations: you are now a ${up.name}`, body: `Your results have convinced us. ${money(up.grant)} has been paid into your account so you can grow.`, kind: 'levelup' }); }
  return report;
}
