'use strict';
/* Difficulty and pacing check. Plays many games with three play styles and reports bankruptcies and the day each level was reached.
   Usage: node tests/balance.js [games] [days] [styles, comma separated] */
const vm = require('vm'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'js');
const sb = { console: { log() {}, error() {} }, Math, JSON, Date, Number, Object, Array, String, Set, Map, Error };
vm.createContext(sb);
for (const f of ['storage.js', 'data.js', 'names-data.js', 'names.js', 'scenarios.js', 'scenarios-guests.js', 'scenarios-business.js', 'scenarios-extra.js', 'scenarios-fun.js', 'engine.js', 'engine-extra.js', 'engine-contractors.js', 'engine-bookings.js', 'engine-events.js', 'engine-mail.js', 'engine-season.js', 'engine-challenges.js', 'engine-coach.js', 'engine-bank.js', 'engine-milestones.js', 'engine-fun.js', 'engine-phone.js', 'engine-guestbook.js', 'engine-career.js', 'engine-wishes.js', 'engine-mgmt.js', 'engine-team.js', 'engine-dashboard.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sb);
const run = c => vm.runInContext(c, sb);
const GAMES = Number(process.argv[2]) || 60, DAYS = Number(process.argv[3]) || 120;

/* One day of play. `grow` decides whether the bot reinvests: hires, builds rooms and buys facilities. */
/* A young or distracted player: takes about half the bookings, deals with about half the jobs, picks incident options without thinking
   hard (a random one that is available), and never services equipment or hires. `care` is the share of things they get round to. */
function sloppyDay(care) {
  run(`(function () { const care = ${care};
    for (const e of [...S.enquiries]) if (Math.random() < care) acceptEnquiryNow(e.id);
    for (const j of [...S.jobs]) { if (Math.random() >= care || !S.jobs.includes(j)) continue; const st = bestStaff(j.role); if (st) doAssign(j.id, st.id, true); }
    for (let g = 0; g < 30 && S.incidents.length; g++) { const inc = S.incidents[0]; const n = currentStage(inc).options.length; const open = []; for (let i = 0; i < n; i++) if (!optionState(inc, i).reason) open.push(i); if (open.length && Math.random() < 0.9) resolveIncident(inc.id, open[Math.floor(Math.random() * open.length)]); else S.incidents.shift(); }
    for (const b of [...arrivalsDue()]) if (Math.random() < care) checkInBooking(b.id);
  })()`);
}
/* The extras, looked after: hires one person for each, keeps the shop stocked, buys the arcade's other machines, services the machines. */
function funDay() {
  run(`(function () {
    const need = { arcade: 'Arcade Attendant', kidsclub: 'Kids Club Leader', shop: 'Shop Assistant', excursions: 'Excursions Guide' };
    for (const [k, role] of Object.entries(need)) if (featureOn(k) && !S.staff.some(s => s.role === role) && S.staff.length < staffLimit() && S.money > 3000) { const c = makeCandidate(role); S.candidates.push(c); hireCandidate(c.id); S.staff[S.staff.length - 1].rota = Array(14).fill(true); }
    if (S.shop) for (const k of Object.keys(SHOP_LINES)) if (S.shop.stock[k] < 30 && S.money > 3000) buyShopStock(k, 3);
    if (S.arcade && S.money > 5000) { buyMachine('arcade-pinball'); buyMachine('arcade-dance'); }
    for (const a of S.assets) if (a.key.startsWith('arcade-') && !a.broken && a.cond < 55) serviceAsset(a.key, 'house');
  })()`);
}
function botDay(style) {
  if (style === 'idle') return;
  if (style === 'casual') return sloppyDay(0.6);
  if (style === 'distracted') return sloppyDay(0.25);
  run(`acceptAllEnquiries()`);
  run(`autoAssignAll()`);
  if (style === 'fun') funDay();
  run(`for (let g = 0; g < 30 && S.incidents.length; g++) { const inc = S.incidents[0]; const n = currentStage(inc).options.length; let done = false; for (let i = 0; i < n; i++) { if (!optionState(inc, i).reason) { resolveIncident(inc.id, i); done = true; break; } } if (!done) S.incidents.shift(); }`);
  if (style === 'careful' || style === 'grower' || style === 'fun') run(`for (const a of S.assets) { if (!a.broken && a.cond < 55) serviceAsset(a.key, 'house'); }`);
  if (style === 'grower') run(`(function () {
    const reserve = 6000;
    const count = role => S.staff.filter(s => s.role === role).length;
    const want = { Housekeeper: Math.ceil(S.rooms.length / 6), Receptionist: Math.ceil(S.rooms.length / 8), Maintenance: Math.ceil(S.rooms.length / 12), Chef: hasFacility('restaurant') ? 2 + Math.floor(S.rooms.length / 25) : 0, 'Spa Therapist': hasFacility('spa') ? 2 + Math.floor(S.rooms.length / 40) : 0 };
    const restagger = role => { const grp = S.staff.filter(s => s.role === role); grp.forEach((s, i) => { s.rota = fortnight([(i * 2) % 7, (i * 2 + 1) % 7]); }); };
    for (const role of Object.keys(want)) {
      let hired = false;
      while (count(role) < want[role] && S.staff.length < staffLimit() && S.money > reserve) {
        const c = S.candidates.find(x => x.role === role && x.skill >= 3) || S.candidates.find(x => x.role === role);
        if (!c) { if (canAfford(ADVERT_COST) && S.money > reserve) { spend(ADVERT_COST, 'ad'); S.candidates = [makeCandidate(role), makeCandidate(role), makeCandidate(role)]; continue; } break; }
        hireCandidate(c.id); S.staff[S.staff.length - 1].rota = Array(14).fill(true);
        hired = true;
      }
      if (hired) restagger(role);
    }
    for (const k of ['hvac', 'restaurant', 'lift', 'pool', 'spa']) { const f = FACILITY_UPGRADES[k]; if (!hasFacility(k) && S.tier >= f.tier && S.money > f.cost + reserve) buyFacility(k); }
    const order = availableRoomTypes().slice().sort((a, b) => ROOM_TYPES[b].price / ROOM_BUILD_COST[b] - ROOM_TYPES[a].price / ROOM_BUILD_COST[a]);
    for (const t of order) { let n = 0; while (S.rooms.length < roomLimit() && S.money > ROOM_BUILD_COST[t] + reserve && n < 10) { buildRoom(t, '', null, true); n++; } }
  })()`);
}

let extrasIncome = 0;
function play(style) {
  extrasIncome = 0;
  run('newGame("B","B")');
  run('S.autoBook = true;');   // the game's default for new players: Reception books anyone not dealt with
  const reached = {};
  for (let day = 0; day < DAYS; day++) {
    botDay(style);
    run('runEndDay()');
    extrasIncome += run(`ledgerDay(S.day - 1).filter(e => /^(Arcade|Kids Club|Shop|Excursion)/.test(e.label)).reduce((a, e) => a + e.amount, 0)`);
    const t = run('S.tier');
    if (!reached[t]) reached[t] = day + 1;
    if (run('S.money') <= run('BANKRUPT_AT')) return { day, bankrupt: true, reached, lifelines: run('S.lifelines') };
  }
  return { extras: extrasIncome, features: run('Object.keys(S.features).length'), day: DAYS, bankrupt: false, lifelines: run('S.lifelines'), money: run('S.money'), rating: run('rating()'), rooms: run('S.rooms.length'), staff: run('S.staff.length'), tier: run('S.tier'), reached };
}
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
for (const style of (process.argv[4] ? process.argv[4].split(',') : ['idle', 'distracted', 'casual', 'attentive', 'careful', 'fun', 'grower'])) {
  const res = Array.from({ length: GAMES }, () => play(style));
  const bk = res.filter(r => r.bankrupt), ok = res.filter(r => !r.bankrupt);
  const tierDays = t => { const d = res.filter(r => r.reached[t]).map(r => r.reached[t]); return d.length ? `T${t}: ${d.length}/${GAMES} reached, median day ${median(d)}` : `T${t}: none`; };
  const rescued = res.filter(r => r.lifelines > 0).length;
  console.log(`${style.padEnd(10)} bankrupt ${bk.length}/${GAMES}${bk.length ? ' (median day ' + median(bk.map(r => r.day)) + ')' : ''}, used a bank lifeline ${rescued}/${GAMES}` +
    (ok.length ? `  extras net £${median(ok.map(r => r.extras))} (${median(ok.map(r => r.features))} opened)  survivors: median cash £${median(ok.map(r => r.money))}, rooms ${median(ok.map(r => r.rooms))}, staff ${median(ok.map(r => r.staff))}, rating ${median(ok.map(r => r.rating)).toFixed(1)}` : ''));
  console.log('           ' + [2, 3, 4].map(tierDays).join(' | '));
}
