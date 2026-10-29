'use strict';
/* Browser test: plays through the real interface and takes screenshots.  Usage: node tests/ui.test.js [outputDir] */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.argv[2] || require("os").tmpdir() + "/hotelhq-shots";
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let failed = 0;
/* Real artwork (assets/games) is set aside for the whole run and put back on exit, so no check depends on it and the stand-in pictures used by the artwork checks can never touch it. */
const gamesDir = path.join(__dirname, '..', 'assets', 'games'), keepDir = gamesDir + '.kept-by-test', hadReal = fs.existsSync(gamesDir), tmpArt = [];
if (hadReal) fs.renameSync(gamesDir, keepDir);
const restoreReal = () => {
  tmpArt.forEach(f => { try { fs.unlinkSync(path.join(gamesDir, f)); } catch (e) { /* already gone */ } });
  if (hadReal && fs.existsSync(keepDir)) { try { fs.rmSync(gamesDir, { recursive: true, force: true }); } catch (e) { /* nothing to clear */ } fs.renameSync(keepDir, gamesDir); }
  else { try { fs.rmdirSync(gamesDir); } catch (e) { /* not empty or gone */ } }
};
process.on('exit', restoreReal);   // the real artwork always comes back, even if a check fails
/* Walks through the setup steps. Every step has one main button; the photo and bank answers are optional. */
async function runSetup(page, o) {
  const next = () => page.click('.setup-step button.primary');
  await page.click("text=Let's start");
  await page.fill('#i-o', o.owner); await next();
  if (o.photo) { await page.setInputFiles('input[data-change="photo"]', o.photo); await page.waitForFunction(() => ui.photo && ui.photo.startsWith('data:image/jpeg')); }
  await next();
  await page.fill('#i-h', o.hotel); await next();
  if (o.bankName) await page.fill('#b-n', o.bankName);
  if (o.colour) await page.check('input[name="bankColour"][value="' + o.colour + '"]', { force: true });
  await next(); await next();
  await page.click('text=Open my hotel');
}
/* Ending a day takes Management offline; this opens the next one, as the player would. */
const goLive = page => page.evaluate(() => { if (!S.mgmt.online) actions.goOnline(); ui.modal = null; render(); });
const assert = (c, m) => { if (!c) { failed++; console.error('FAIL:', m); } else console.log('ok  :', m); };

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL);

  assert(await page.locator('text=Welcome to Hotel HQ').count() === 1, 'intro shows');
  await runSetup(page, { hotel: 'Sunny <b>Bay</b>', owner: 'Ella' });
  assert(await page.evaluate(() => !S.mgmt.online && /^\d{4}-\d{2}-\d{2}$/.test(S.mgmt.since)) && await page.locator('.modal').count() === 0 && await page.locator('.mgmt-banner').count() === 1, 'a new hotel opens with Management offline, nothing happening, and a banner saying so');
  assert((await page.locator('.btn.mgmt').innerText()).trim() === 'Management Online', 'the button says Management Online');
  await page.click('.btn.mgmt');
  assert((await page.locator('.btn.mgmt').innerText()).trim() === 'Management Offline' && await page.locator('.mgmt-banner').count() === 0, 'once live the button says Management Offline');
  assert(await page.locator('.modal.wide').count() === 1, 'first incident pops up on day 1');
  await page.screenshot({ path: OUT + '/incident-first.png' });
  assert(await page.locator('.opt').count() >= 2, 'incident has options');

  // work through any incident chain via the UI
  async function clearIncidents() {
    for (let i = 0; i < 30; i++) {
      if (await page.locator('.modal.wide .opt').count()) {
        const enabled = page.locator('.modal.wide .opt:not([disabled])');
        if (await enabled.count()) await enabled.first().click(); else await page.click('[data-act="decideLater"]');
      } else if (await page.locator('[data-act="continueIncident"]').count()) {
        await page.click('[data-act="continueIncident"]');
      } else if (await page.locator('.modal .chip:text-is("Crisis"), .modal .chip:text-is("Warning")').count()) {   // a crisis announced when the hotel opens
        await page.click('.modal [data-act="closeModal"]');
      } else break;
    }
  }
  await clearIncidents();
  assert(await page.locator('.modal').count() === 0, 'incident flow completes and closes');

  assert(await page.locator('.hname').innerText() === 'Sunny <b>Bay</b>', 'hotel name escaped');
  await page.evaluate(() => { S.tour.done = true; render(); });   // the tour has its own test, in a fresh game, at the end
  const start = await page.evaluate(() => ({ rooms: S.rooms.length, staff: S.staff.length, tier: S.tier, types: [...new Set(S.rooms.map(r => r.type))].join() }));
  assert(start.rooms === 24 && start.staff === 9 && start.tier === 1 && start.types === 'Standard,Ocean View', 'game starts as a 24-room boutique hotel: ' + JSON.stringify(start));
  await page.click('.nav[data-view="expansion"]');
  assert(await page.locator('text=Next level: Small Hotel').count() === 1, 'expansion page shows the next level goals');
  assert(await page.locator('[data-act="newRoom"][data-type]:not([disabled])').count() === 0, 'the 24-room hotel is full, so no room can be built until the first level up');
  assert(await page.locator('[data-act="buyFacility"][disabled]').count() === 5, 'all 5 facilities are locked at the start');
  await page.click('.nav[data-view="dashboard"]');
  assert(await page.locator('text=Facilities and news').count() === 1 && await page.locator('.fac').count() === 3, 'dashboard shows only the 3 starting facilities');

  for (const v of ['dashboard', 'rooms', 'guests', 'incidents', 'tasks', 'staff', 'maintenance', 'expansion', 'finance', 'settings']) {
    await page.click(`.nav[data-view="${v}"]`);
    await page.screenshot({ path: `${OUT}/v-${v}.png`, fullPage: true });
  }
  for (const t of ['rota', 'hire']) { await page.click('.nav[data-view="staff"]'); await page.click(`[data-tab="${t}"]`); await page.screenshot({ path: `${OUT}/staff-${t}.png`, fullPage: true }); }

  // ---- team panel ----
  await page.click('.nav[data-view="staff"]'); await page.click('[data-tab="shift"]');
  assert(await page.locator('text=On shift now').count() === 1 && await page.locator('.shiftbar').count() >= 1, 'team shows who is on shift with shift progress bars');
  const t0 = await page.evaluate(() => S.clock);
  await page.click('[data-act="advanceTime"][data-mins="180"]');
  assert(await page.evaluate(() => S.clock) === t0 + 180 && (await page.locator('.kpi .v').first().innerText()) === '09:00', 'the clock moves on three hours');
  await page.click('[data-act="advanceTime"][data-mins="end"]');
  assert(await page.evaluate(() => S.clock === DAY_END) && await page.locator('[data-act="advanceTime"][disabled]').count() === 3, 'the clock stops at close and the buttons disable');
  assert(await page.locator('text=Finished for the day').count() === 1, 'everyone on shift is shown as finished at close');
  await page.click('[data-tab="rota"]');
  assert(await page.locator('table.rota [data-act="rota"]').count() === (await page.evaluate(() => S.staff.length)) * 14, 'the rota shows 14 days for everyone');
  const cell = await page.evaluate(() => { const s = S.staff[0], i = rotaIdx(S.day + 5); return { id: s.id, i, was: s.rota[i] }; });
  await page.click(`[data-act="rota"][data-id="${cell.id}"][data-i="${cell.i}"]`);
  assert(await page.evaluate(([id, i]) => staffById(id).rota[i], [cell.id, cell.i]) === !cell.was, 'tapping a rota cell flips that day');
  await page.click('[data-tab="people"]');
  const idle = await page.evaluate(() => { const s = S.staff.find(x => x.used === 0 && !S.timeline.some(t => t.staffId === x.id)); return { id: s.id, shift: s.shift }; });
  const pick = idle.shift === 'late' ? 'early' : 'late';
  await page.click(`[data-act="staffShift"][data-id="${idle.id}"][data-shift="${pick}"]`);
  assert(await page.evaluate(id => staffById(id).shift, idle.id) === pick, 'a shift button changes the shift');
  const busy = await page.evaluate(() => { const s = S.staff[0]; scheduleWork(s, 'Test job', 'clean'); return { id: s.id, shift: s.shift }; });
  await page.click(`[data-act="staffShift"][data-id="${busy.id}"][data-shift="${busy.shift === 'late' ? 'early' : 'late'}"]`);
  assert(await page.evaluate(id => staffById(id).shift, busy.id) === busy.shift, 'a shift cannot change once someone has worked today');
  assert(await page.locator('.bar').count() > 0 && await page.locator('text=Mood').count() >= 1, 'people show mood and stats');

  // ---- bookings ----
  await page.click('.nav[data-view="bookings"]');
  await page.click('[data-act="bookingTab"][data-tab="calendar"]');
  assert(await page.locator('text=Free rooms, next 14 days').count() === 1 && await page.locator('table.calendar tbody tr').count() === (await page.evaluate(() => S.rooms.length)), 'bookings calendar shows availability and every room');
  await page.click('[data-act="bookingTab"][data-tab="rooms"]');
  await page.click('[data-act="addGuest"]');
  assert(await page.locator('#bk-meal option').count() === 1, 'only room-only meals before the restaurant exists');
  assert(await page.locator('input[value="spa"]').count() === 0 && await page.locator('input[value="dinner"]').count() === 0, 'facility extras hidden until built');
  await page.fill('#bk-name', 'Test Booker'); await page.fill('#bk-ad', '3');
  await page.waitForTimeout(100);
  assert((await page.locator('#bkPreview').innerText()).includes('sleep'), 'form warns when the party is too big for the room');
  await page.click('#bkForm button[type=submit]');
  assert(await page.locator('#bkForm').count() === 1, 'invalid booking keeps the form open');
  await page.fill('#bk-ad', '2'); await page.selectOption('#bk-day', { index: 4 }); await page.fill('#bk-n', '3'); await page.selectOption('#bk-dep', '0.5'); await page.check('input[value="champagne"]');
  await page.selectOption('#bk-rel', 'unmarried'); await page.fill('#bk-others', 'Pat Moon');
  await page.waitForTimeout(100);
  assert((await page.locator('#bkPreview').innerText()).includes('Deposit due now'), 'form shows the deposit due');
  const cashBk = await page.evaluate(() => S.money);
  await page.click('#bkForm button[type=submit]');
  const bkState = await page.evaluate(() => ({ n: S.bookings.length, b: S.bookings[0], cash: S.money }));
  assert(bkState.n === 1 && bkState.b.name === 'Test Booker' && bkState.b.arriveDay === 4 && bkState.b.deposit > 0 && bkState.cash === cashBk + bkState.b.deposit && bkState.b.extras[0] === 'champagne', 'booking saved with deposit taken: ' + JSON.stringify(bkState.b));
  assert(bkState.b.party.rel === 'unmarried' && bkState.b.party.members[1].n.startsWith('Pat ') && bkState.b.party.members[1].last !== 'Booker', 'party type and typed guest name saved with unmarried surname logic: ' + JSON.stringify(bkState.b.party));
  assert(await page.locator('text=Test Booker').count() >= 1, 'booking listed under upcoming reservations');
  assert((await page.locator('text=Couple (not married): with Pat').count()) === 1, 'booking row shows the party type and companions');
  await page.click('[data-act="cancelBookingAsk"]');
  await page.click('[data-act="cancelBookingDo"][data-refund="1"]');
  assert(await page.evaluate(() => S.bookings.length) === 0 && await page.evaluate(() => S.money) === cashBk, 'cancelling with refund returns the deposit');
  // customise an enquiry
  await page.click('.nav[data-view="guests"]');
  if (await page.locator('[data-act="customiseEnquiry"]').count()) {
    await page.click('[data-act="customiseEnquiry"] >> nth=0');
    assert((await page.locator('#bk-name').inputValue()).length > 0, 'Customise opens the booking form with the guest filled in');
    const pre = await page.evaluate(() => ({ ad: document.getElementById('bk-ad').value, rel: document.getElementById('bk-rel').value, others: document.getElementById('bk-others').value }));
    assert(Number(pre.ad) >= 1 && pre.rel !== 'auto' && (Number(pre.ad) === 1 || pre.others.length > 0), 'Customise carries the party over: ' + JSON.stringify(pre));
    await page.click('[data-act="closeModal"] >> nth=-1');
  }

  // ---- managing bookings: edit, requests, move room, blocks ----
  await page.click('.nav[data-view="bookings"]');
  const mid = await page.evaluate(() => { const r = createBooking({ name: 'Manage Me', adults: 2, children: 0, type: 'Standard', arriveDay: S.day + 5, nights: 2, price: 90, mealPlan: 'room', extras: [], depositPct: 0 }); render(); return r.booking.id; });
  await page.click(`[data-act="editBooking"][data-id="${mid}"]`);
  await page.fill('#eb-n', '4'); await page.fill('#eb-price', '100');
  await page.click('.modal button[type=submit]');
  assert(await page.evaluate(id => { const b = S.bookings.find(x => x.id === id); return b.nights === 4 && b.price === 100; }, mid) && await page.locator('.modal').count() === 0, 'editing a booking saves the new nights and rate');
  await page.click(`[data-act="editBooking"][data-id="${mid}"]`);
  await page.fill('#eb-ad', '5'); await page.click('.modal button[type=submit]');
  assert(await page.locator('.modal').count() === 1 && await page.evaluate(id => S.bookings.find(x => x.id === id).adults, mid) === 2, 'an invalid edit keeps the form open and changes nothing');
  await page.click('.modal [data-act="closeModal"] >> nth=0');
  await page.click(`[data-act="bookingRequests"][data-id="${mid}"]`);
  await page.fill('#rq-text', 'Birthday cake'); await page.click('form[data-form="addRequest"] button[type=submit]');
  assert(await page.evaluate(id => S.bookings.find(x => x.id === id).requests.map(q => q.text).join(), mid) === 'Birthday cake' && await page.locator('.modal').count() === 1, 'a request is added and the dialog stays open');
  await page.click('[data-act="removeRequest"]');
  assert(await page.evaluate(id => S.bookings.find(x => x.id === id).requests.length, mid) === 0, 'a request can be removed');
  await page.click('.modal [data-act="closeModal"] >> nth=-1');
  await page.click(`[data-act="moveBooking"][data-id="${mid}"]`);
  assert(await page.locator('[data-act="doMove"][data-mode="courtesy"]').count() > 0 && await page.locator('text=Upgrade').count() >= 1, 'move room lists upgrades with a free upgrade option');
  await page.click('[data-act="doMove"][data-mode="courtesy"] >> nth=0');
  assert(await page.evaluate(id => { const b = S.bookings.find(x => x.id === id); return b.type === 'Ocean View' && b.moodBonus === 12 && roomById(b.roomId).type === 'Ocean View'; }, mid), 'a free upgrade moves the booking to an Ocean View room and delights the guest');
  await page.click('[data-act="bookingTab"][data-tab="blocks"]');
  const blockFrom = await page.evaluate(() => S.day + 30);
  await page.selectOption('#bl-scope', 'type:Standard'); await page.selectOption('#bl-from', String(blockFrom)); await page.fill('#bl-n', '2'); await page.selectOption('#bl-r', 'Renovation');
  await page.click('form[data-form="block"] button[type=submit]');
  const nStd = await page.evaluate(() => S.rooms.filter(r => r.type === 'Standard').length);
  assert(await page.evaluate(() => S.blocks.length) === nStd && await page.locator('text=Renovation').count() >= 1, 'blocking all Standard rooms takes them off sale');
  await page.click('[data-act="unblockGroup"]');
  assert(await page.evaluate(() => S.blocks.length) === 0, 'allowing bookings again clears the block');
  await page.click('[data-act="bookingTab"][data-tab="dinner"]');
  assert(await page.locator('text=Build the restaurant').count() === 1, 'dinner tab explains the restaurant is needed first');
  await page.click('[data-act="bookingTab"][data-tab="events"]');
  await page.click('[data-act="bookingTab"][data-tab="rooms"]');

  // ---- rooms filters and bulk actions ----
  await page.click('.nav[data-view="rooms"]');
  const allCards = await page.locator('.pagehead + .tabs + .grid .card').count();
  assert(allCards === 24, 'rooms page lists all 24 rooms (' + allCards + ')');
  await page.click('[data-act="roomFilter"][data-f="occupied"]');
  assert(await page.locator('.pagehead + .tabs + .grid .card').count() === await page.evaluate(() => S.rooms.filter(r => r.guestId).length), 'occupied filter shows only occupied rooms');
  await page.click('[data-act="roomFilter"][data-f="all"]');
  await page.click('.nav[data-view="guests"]');
  const guests0 = await page.evaluate(() => S.guests.length);
  if (await page.locator('[data-act="acceptAll"]').count()) { await page.click('[data-act="acceptAll"]'); assert(await page.evaluate(() => S.guests.length) > guests0, 'Accept all that fit checks guests in'); }
  await page.click('.nav[data-view="tasks"]');
  const jobs0 = await page.evaluate(() => S.jobs.length);
  await page.click('[data-act="assignAll"]');
  assert(await page.evaluate(() => S.jobs.length) < jobs0, 'Assign everything clears jobs (' + jobs0 + ' before)');

  // ---- level-up flow through the UI ----
  await page.evaluate(() => {
    S.incidents = []; S.jobs = []; S.guests.forEach(g => { g.happiness = 100; }); ui.modal = null; S.day = 14; S.money = 20000;
    S.reviews = Array.from({ length: 12 }, () => ({ name: 'x', stars: 5, text: 't', day: 1 }));
    S.history = Array.from({ length: 10 }, (_, i) => ({ day: i, income: 1200, expenses: 600 })); render();
  });
  const cash0 = await page.evaluate(() => S.money);
  await page.click('[data-act="endDayAsk"]');
  if (await page.locator('.modal [data-act="endDay"]').count()) await page.click('.modal [data-act="endDay"]');
  assert(await page.locator('text=Level up!').count() === 1, 'end-of-day report announces the level up');
  await page.click('.modal [data-act="closeModal"]');
  assert(await page.locator('text=You are now a Small Hotel').count() === 1, 'level-up screen appears after the report');
  await page.screenshot({ path: OUT + '/levelup.png' });
  assert(await page.evaluate(() => S.money) > cash0 + 25000, 'investor funding was paid');
  await page.click('[data-act="levelUpGo"]');
  assert(await page.locator('.pagehead h2:has-text("Expansion")').count() === 1, 'Start expanding opens the Expansion page');
  const rooms0 = await page.evaluate(() => S.rooms.length), money1 = await page.evaluate(() => S.money);
  await page.click('[data-act="newRoom"][data-type="Ocean View"]');
  assert(await page.locator('#r-t').inputValue() === 'Ocean View', 'build dialog preselects the room type');
  await page.click('.modal button[type=submit]');
  assert(await page.evaluate(() => S.rooms.length) === rooms0 + 1 && await page.evaluate(() => S.money) === money1 - 1200, 'built an Ocean View room for its cost');
  await page.click('[data-act="buyFacility"][data-key="restaurant"]');
  assert(await page.evaluate(() => hasFacility('restaurant') && !!assetByKey('kitchen')), 'restaurant facility bought and kitchen equipment added');
  assert(await page.locator('[data-act="buyFacility"][data-key="pool"][disabled]').count() === 1, 'pool still locked until Mid-Size Hotel');
  await goLive(page);
  // ---- restaurant menu ----
  assert(await page.locator('.nav[data-view="events"]').count() === 1, 'Events and Food is in the navigation');
  await page.click('.nav[data-view="events"]'); await page.click('[data-act="eventTab"][data-tab="menu"]');
  assert(await page.locator('.card.flush h3').count() === 10, 'starting menu has 10 dishes');
  await page.click('[data-act="addDish"]');
  await page.fill('#d-n', 'Lobster thermidor'); await page.fill('#d-p', '45'); await page.selectOption('#d-q', '5'); await page.check('input[name="nuts"]');
  await page.setInputFiles('input[data-change="photo"]', path.join(OUT, 'p.png'));
  await page.waitForFunction(() => ui.photo && ui.photo.startsWith('data:image/jpeg'));
  assert((await page.locator('#dishPreview').innerText()).includes('to make'), 'dish form shows the cost and profit');
  await page.click('#dishForm button[type=submit]');
  const dish = await page.evaluate(() => S.menu.find(d => d.name === 'Lobster thermidor'));
  assert(dish && dish.price === 45 && dish.quality === 5 && dish.nuts && dish.photo && dish.photo.startsWith('data:image/jpeg'), 'dish added with photo');
  await page.click(`[data-act="toggleDish"][data-id="${dish.id}"]`);
  assert(await page.evaluate(id => !S.menu.find(d => d.id === id).on, dish.id), 'dish can be taken off the menu');
  await page.click(`[data-act="editDish"][data-id="${dish.id}"]`);
  await page.fill('#d-n', 'Lobster'); await page.click('#dishForm button[type=submit]');
  assert(await page.evaluate(id => S.menu.find(d => d.id === id).name, dish.id) === 'Lobster', 'dish can be edited');
  await page.click(`[data-act="deleteDishAsk"][data-id="${dish.id}"]`); await page.click('.modal [data-act="deleteDishDo"]');
  assert(await page.evaluate(id => !S.menu.some(d => d.id === id), dish.id), 'dish can be deleted');
  await page.screenshot({ path: OUT + '/menu.png', fullPage: true });
  await page.screenshot({ path: OUT + '/expansion.png', fullPage: true });
  // grow the rest of the hotel so every later check has all equipment
  await page.evaluate(() => {
    S.tier = 4; S.tierSeen = 4; ['hvac', 'pool', 'spa', 'lift', 'restaurant'].forEach(k => { if (!hasFacility(k)) S.unlocked.push(k); FACILITY_UPGRADES[k].assets.forEach(a => { if (!assetByKey(a)) S.assets.push({ key: a, cond: 100, broken: false }); }); });
    S.staff.push(makeStaff(drawPerson('m').name, 'm', 'm03', 'Chef', 4, 3, [5, 6])); render();
  });

  // trashed room scenario, forced, through the UI
  await page.evaluate(() => {
    S.day = 6; S.staff.forEach(s => { s.rota = Array(14).fill(true); s.sickDays = 0; s.used = 0; });
    S.incidents = []; const g = S.guests[0]; pushIncident(SCEN['trashed-room'], { guestId: g.id, roomId: g.roomId }); ui.modal = { type: 'incident', id: S.incidents[0].id }; render();
  });
  await page.screenshot({ path: OUT + '/trashed-step1.png' });
  const money0 = await page.evaluate(() => S.money);
  await page.click('.opt >> nth=0');
  assert(await page.locator('.log').count() === 1, 'step 2 shows the log of step 1');
  assert(await page.locator('text=a) Evict').count() === 1, 'guest options (evict, fine, warn, police) appear in step 2');
  await page.screenshot({ path: OUT + '/trashed-step2.png' });
  await page.click('text=d) Call the police');
  assert(await page.locator('.effects').count() >= 0 && await page.locator('[data-act="continueIncident"]').count() === 1, 'outcome screen appears');
  await page.screenshot({ path: OUT + '/trashed-outcome.png' });
  await page.click('[data-act="continueIncident"]');
  assert(await page.evaluate(() => S.money) !== money0, 'repair cost / damages changed cash');

  // equipment: servicing and breakdown
  await page.evaluate(() => { S.assets.find(a => a.key === 'boiler').cond = 30; render(); });
  await page.click('.nav[data-view="maintenance"]');
  const before = await page.evaluate(() => S.assets.find(a => a.key === 'boiler').cond);
  await page.click('[data-act="service"][data-key="boiler"]');
  assert(await page.evaluate(() => S.assets.find(a => a.key === 'boiler').cond) === before + 45, 'in-house service restores 45%');

  // broken equipment shows an incident and a repair task
  await page.evaluate(() => { const a = assetByKey('pool'); a.broken = true; pushIncident(SCEN['pool-green'], { assetKey: 'pool' }); ensureJobs(); ui.autoInc = false; render(); });
  await page.click('.nav[data-view="tasks"]');
  assert(await page.locator('text=Repair: Swimming pool').count() === 1, 'repair task created for broken pool');
  await page.screenshot({ path: OUT + '/tasks-repair.png', fullPage: true });
  // ---- dinner reservations (the restaurant exists by now) ----
  await page.click('.nav[data-view="bookings"]'); await page.click('[data-act="bookingTab"][data-tab="dinner"]');
  await page.evaluate(() => { S.staff.forEach(x => { x.rota = Array(14).fill(true); x.sickDays = 0; }); render(); });
  await page.fill('#dn-name', 'Ivy Cole'); await page.fill('#dn-n', '4');
  const openDay = await page.evaluate(() => { const o = [...document.querySelectorAll('#dn-day option')].find(x => !x.disabled); return o.value; });
  await page.selectOption('#dn-day', openDay); await page.selectOption('#dn-t', '1200');
  await page.click('form[data-form="dinner"] button[type=submit]');
  assert(await page.evaluate(() => S.dinners.length === 1 && S.dinners[0].covers === 4 && S.dinners[0].time === 1200 && S.dinners[0].name === 'Ivy Cole') && await page.locator('text=Ivy Cole').count() >= 1, 'a dinner table is booked and listed');
  await page.click('[data-act="cancelDinner"]');
  assert(await page.evaluate(() => S.dinners.length) === 0, 'a dinner table can be cancelled');
  await page.click('[data-act="bookingTab"][data-tab="rooms"]');
  // ---- events and food ----
  await page.click('.nav[data-view="events"]'); await page.click('[data-act="eventTab"][data-tab="plan"]');
  await page.evaluate(() => { S.staff.forEach(x => { x.rota = Array(14).fill(true); x.sickDays = 0; }); render(); });
  assert(await page.locator('[data-act="openPlan"]').count() >= 4 && await page.locator('text=Wedding').count() >= 1, 'the plan tab lists the events that can be planned and shows the wedding as client-booked or locked');
  await page.click('[data-act="openPlan"][data-key="excursion"]');
  assert((await page.locator('#evPreview').innerText()).includes('Forecast'), 'the planning form shows a live forecast');
  await page.fill('#ev-price', '150'); await page.waitForTimeout(80);
  assert((await page.locator('#evPreview').innerText()).includes('well above the usual rate'), 'the forecast warns about an overpriced ticket');
  await page.fill('#ev-price', '45'); await page.fill('#ev-cap', '20'); await page.selectOption('#ev-adv', '1');
  const cashEv = await page.evaluate(() => S.money);
  await page.click('#evForm button[type=submit]');
  assert(await page.evaluate(() => S.events.length === 1 && S.events[0].type === 'excursion' && S.events[0].price === 45 && S.events[0].advert === 1) && await page.evaluate(c => S.money === c - 60, cashEv), 'planning an event saves it and charges the advertising');
  assert(await page.locator('text=Planned').count() >= 1 && await page.locator('[data-act="eventRes"]').count() === 1, 'the planned tab lists the event');
  await page.click('[data-act="eventRes"]');
  await page.fill('#er-name', 'Una Frost'); await page.fill('#er-size', '3'); await page.click('form[data-form="addEventRes"] button[type=submit]');
  assert(await page.evaluate(() => eventSold(S.events[0])) === 3 && await page.locator('text=Una Frost').count() >= 1, 'a reservation is added to the event');
  await page.click('[data-act="cancelEventRes"]');
  assert(await page.evaluate(() => eventSold(S.events[0])) === 0, 'a reservation can be cancelled');
  await page.click('.modal [data-act="closeModal"] >> nth=-1');
  await page.click('[data-act="eventEdit"]'); await page.fill('#ee-price', '50'); await page.selectOption('#ee-adv', '2'); await page.click('form[data-form="editEvent"] button[type=submit]');
  assert(await page.evaluate(() => S.events[0].price === 50 && S.events[0].advert === 2), 'price and advertising can be changed');
  await page.click('.nav[data-view="bookings"]'); await page.click('[data-act="bookingTab"][data-tab="events"]');
  assert(await page.locator('text=Excursion').count() >= 1, 'event reservations show on the Bookings page');
  await page.evaluate(() => { S.eventRequests = []; });   // clients ask by chance as the days pass
  await page.click('.nav[data-view="events"]'); await page.click('[data-act="eventTab"][data-tab="requests"]');
  assert(await page.locator('text=No client requests').count() === 1, 'requests tab explains when there are none');
  await page.evaluate(() => { S.tier = Math.max(S.tier, 3); S.tierSeen = S.tier; S.eventRequests.push({ id: nid(), type: 'party', client: 'Rae Moon', guests: 20, day: S.day + 12, offer: 40, expires: S.day + 3 }); render(); });
  assert(await page.locator('text=Rae Moon').count() >= 1, 'a client request is shown with its offer');
  await page.click('[data-act="acceptEventReq"]');
  assert(await page.evaluate(() => S.events.length === 2 && S.events.some(e => e.private && e.client === 'Rae Moon') && S.eventRequests.length === 0), 'accepting a request books the private event and takes a deposit');
  await page.click('[data-act="eventTab"][data-tab="planned"]');
  await page.click('[data-act="cancelEventAsk"] >> nth=-1'); await page.click('[data-act="cancelEventDo"]');
  assert(await page.evaluate(() => S.events.length) === 1, 'an event can be cancelled after confirming');
  await page.evaluate(() => { S.eventLog.push({ id: 1, name: 'Karaoke evening', type: 'karaoke', day: S.day - 1, cancelled: false, rain: false, attendees: 30, revenue: 900, cost: 400, stars: 4 }); });
  await page.click('[data-act="eventTab"][data-tab="results"]');
  assert(await page.locator('text=Karaoke evening').count() >= 1 && await page.locator('text=Events held').count() === 1, 'the results tab shows past events');
  await page.screenshot({ path: OUT + '/events.png', fullPage: true });
  await page.evaluate(() => { S.events = []; S.eventRequests = []; });

  // ---- inbox ----
  await page.click('.nav[data-view="inbox"]');
  assert(await page.locator('.nav[data-view="inbox"] .badge').count() >= 1, 'the inbox shows an unread count in the navigation');
  const cj = await page.evaluate(() => { S.mail = { items: [], read: {}, handled: [] }; S.timeline = []; S.clock = DAY_START; S.staff.forEach(x => { x.rota = Array(14).fill(true); x.sickDays = 0; x.used = 0; });
    S.jobs = S.jobs.filter(x => x.type !== 'complaint'); const g = S.guests[0]; const j = { id: nid(), type: 'complaint', guestId: g.id, role: 'Receptionist', text: 'The air-con is too loud.' }; S.jobs.push(j); render(); return { id: j.id, guest: g.name }; });
  assert(await page.locator('.mailrow.urgent', { hasText: 'Complaint: ' + cj.guest }).count() === 1, 'a complaint arrives as an urgent (red) message');
  await page.click(`.mailrow:has-text("Complaint: ${cj.guest}")`);
  assert(await page.locator('.mailpane').count() === 1 && await page.locator('text=Give it to').count() === 1 && await page.locator('text=The air-con is too loud').count() >= 1, 'opening a message shows it with staff to assign');
  assert(await page.evaluate(id => unreadMail().every(m => m.key !== 'job:' + id), cj.id), 'opening a message marks it read');
  await page.click('.mailpane [data-act="mailDiscount"]');
  assert(await page.evaluate(() => ui.mailDiscount) === true, 'the discount choice can be switched on');
  const cashMail = await page.evaluate(() => S.money);
  await page.click('.mailpane .pick >> nth=0');
  assert(await page.evaluate(id => !S.jobs.some(j => j.id === id), cj.id) && await page.evaluate(() => S.timeline.length === 1 && S.mail.handled.length === 1) && await page.evaluate(c => S.money === c - DISCOUNT_COST, cashMail), 'assigning from the message does the job, with the discount');
  await page.click('.nav[data-view="dashboard"]');
  assert(await page.locator('text=Team activity').count() === 1 && await page.locator('.act').count() >= 1 && await page.locator('text=You handled').count() === 1, 'the dashboard shows the team activity and what you handled');
  await page.click('.nav[data-view="inbox"]'); await page.click('[data-act="mailTab"][data-tab="handled"]');
  assert(await page.locator('text=with a discount').count() >= 1, 'the handled tab lists what you did');
  await page.click('[data-act="mailTab"][data-tab="inbox"]');
  await page.evaluate(() => { addReview('Pat Lee', 1, 'Awful stay.'); render(); });
  assert(await page.locator('.mailrow.urgent', { hasText: '1★ review from Pat Lee' }).count() === 1, 'a bad review arrives as an urgent message');
  await page.click('.mailrow:has-text("1★ review from Pat Lee")');
  await page.click('[data-act="mailDelete"]');
  assert(await page.evaluate(() => !S.mail.items.some(m => m.subject.includes('Pat Lee'))) && await page.locator('.mailpane').count() === 0, 'a stored message can be deleted');
  await page.evaluate(() => { S.rooms[6].dirty = true; ensureJobs(); render(); });
  await page.click('.mailrow:has-text("need cleaning"), .mailrow:has-text("needs cleaning")');
  await page.click('[data-act="mailAssignAll"]');
  assert(await page.evaluate(() => !S.rooms[6].dirty), 'one tap sends housekeeping to the dirty rooms');
  await page.click('[data-act="mailTab"][data-tab="urgent"]');
  assert(await page.locator('.mailrow').count() === await page.evaluate(() => inboxItems().filter(m => m.urgent).length), 'the urgent tab lists only urgent messages');
  await page.click('[data-act="mailTab"][data-tab="inbox"]');
  if (await page.locator('[data-act="mailReadAll"]').count()) await page.click('[data-act="mailReadAll"]');
  assert(await page.evaluate(() => unreadMail().length) === 0 && await page.locator('.nav[data-view="inbox"] .badge').count() === 0, 'mark all read clears the badge');
  await page.click('.nav[data-view="staff"]');   // leave a neutral page for the steps that follow

  await page.click('.nav[data-view="tasks"]');   // back to the repair task for the contractor steps below
  // ---- contractors: quotes, hiring, time out of service ----
  await page.click(`[data-act="getQuotes"][data-key="pool"]`);
  assert(await page.locator('.modal .firm').count() === 8, 'quotes screen lists every contractor firm');
  assert(await page.locator('.modal .firm.off').count() >= 2, 'firms that do not do this trade are shown greyed out');
  assert(await page.locator('.modal .chip:has-text("Cheapest")').count() === 1 && await page.locator('.modal .chip:has-text("Fastest")').count() >= 1, 'cheapest and fastest firms are flagged');
  await page.screenshot({ path: OUT + '/quotes.png' });
  const cashBeforeHire = await page.evaluate(() => S.money);
  await page.click('.modal [data-act="hireFirm"][data-firm="cutprice"]');
  const slowWork = await page.evaluate(() => S.works.find(w => w.key === 'pool'));
  assert(slowWork && slowWork.firm === 'cutprice' && slowWork.eta > 0, 'hiring books a firm that takes days');
  assert(await page.evaluate(() => assetByKey('pool').broken) === true && await page.evaluate(() => S.money) === cashBeforeHire, 'equipment stays broken and nothing is paid until the work is done');
  assert(await page.locator('text=Contractors on site').count() === 1, 'Tasks shows the contractors on site');
  assert(await page.locator('[data-act="getQuotes"][data-key="pool"]').count() === 0, 'no second repair task while a contractor is working');
  await page.click('.nav[data-view="maintenance"]');
  assert(await page.locator('text=Contractor directory').count() === 1 && await page.locator('.equip .chip:has-text("Cut-Price Fixers")').count() === 1, 'Maintenance shows the work in progress and the directory');
  await page.screenshot({ path: OUT + '/maintenance-works.png', fullPage: true });
  // finish the job: jump to the completion day
  await page.evaluate(() => { const w = S.works[0]; S.day = w.doneDay; processContractors(); ensureJobs(); render(); });
  assert(await page.evaluate(() => S.works.length) === 0 && await page.evaluate(() => S.money) < cashBeforeHire, 'work completes on its day and is then paid for');
  await page.evaluate(() => { const a = assetByKey('pool'); a.broken = false; a.defect = null; a.warranty = null; S.incidents = S.incidents.filter(i => i.sid !== 'pool-green'); ensureJobs(); render(); });
  // an instant same-day firm through the UI
  await page.evaluate(() => { const a = assetByKey('boiler'); a.broken = true; ensureJobs(); ui.view = 'tasks'; render(); });
  await page.click('[data-act="getQuotes"][data-key="boiler"]');
  await page.evaluate(() => { window.__realRandom = Math.random; const q = [0.99, 0.0]; Math.random = () => (q.length ? q.shift() : 0.5); });   // not late, excellent work
  await page.click('.modal [data-act="hireFirm"][data-firm="rapid"]');
  await page.evaluate(() => { Math.random = window.__realRandom; });
  assert(await page.evaluate(() => S.works.length) === 0 && (await page.locator('.toast').last().innerText()).includes('Rapid Response'), 'a same-day firm finishes at once');
  await page.evaluate(() => { const a = assetByKey('boiler'); a.broken = false; ensureJobs(); render(); });
  assert(await page.evaluate(() => !S.incidents.some(i => i.sid === 'pool-green')), 'stale breakdown incident removed once fixed');

  // photo upload (staff headshot)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC', 'base64');
  fs.writeFileSync(path.join(OUT, 'p.png'), png);
  await page.click('.nav[data-view="staff"]'); await page.click('[data-tab="people"]');
  await page.click('[data-act="editStaff"] >> nth=0');
  await page.setInputFiles('input[data-change="photo"]', path.join(OUT, 'p.png'));
  await page.waitForFunction(() => ui.photo && ui.photo.startsWith('data:image/jpeg'));
  await page.click('.modal button[type=submit]');
  assert(await page.evaluate(() => S.staff[0].photo && S.staff[0].photo.startsWith('data:image/jpeg')), 'headshot upload saved');

  // play 40 days
  for (let d = 0; d < 40; d++) {
    await page.evaluate(() => {
      for (const e of [...S.enquiries]) { const r = S.rooms.find(x => x.type === e.type && isReady(x)); if (r) { checkIn(r, e.name, e.nights); S.enquiries = S.enquiries.filter(x => x !== e); } }
      for (let k = 0; k < 30; k++) { const j = S.jobs.find(j => eligible(j).some(s => s.used < STAFF_CAP)); if (!j) break; doAssign(j.id, eligible(j).find(s => s.used < STAFF_CAP).id); }
      render();
    });
    await page.click('[data-act="endDayAsk"]');
    if (await page.locator('.modal [data-act="endDay"]').count()) await page.click('.modal [data-act="endDay"]');
    if (await page.locator('text=gone bankrupt').count()) { console.log('bankrupt on day', d + 1); break; }
    if (d === 4) await page.screenshot({ path: OUT + '/report.png' });
    await page.click('.modal [data-act="closeModal"]');
    await page.evaluate(() => { if (!S.mgmt.online) actions.goOnline(); });
    await clearIncidents();
  }
  console.log('day', await page.evaluate(() => S.day + 1), 'cash', await page.evaluate(() => S.money));
  await page.screenshot({ path: OUT + '/late.png', fullPage: true });

  // persistence + save/load
  const day = await page.evaluate(() => S.day);
  await page.reload();
  assert(await page.evaluate(() => S.day) === day, 'state persists across reload');
  await page.click('.nav[data-view="settings"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="exportSave"]')]);
  await dl.saveAs(OUT + '/save.json');
  await page.setInputFiles('#importFile', OUT + '/save.json');
  await page.click('.modal [data-act="importApply"]');
  assert(await page.evaluate(() => S.day) === day, 'import works');

  // mobile
  await page.setViewportSize({ width: 390, height: 800 });
  for (const v of ['dashboard', 'rooms', 'bookings', 'events', 'inbox', 'incidents', 'tasks', 'maintenance', 'staff']) {
    if (!['dashboard', 'staff', 'bookings', 'events', 'inbox'].includes(v)) await page.click('.nav.more-btn');   // phones keep four tabs and a More sheet
    await page.click(`.nav[data-view="${v}"]:visible`);
    if (v === 'staff') await page.click('[data-tab="rota"]');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const wide = overflow ? await page.evaluate(() => [...document.querySelectorAll('main *, #app *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 4).map(e => `${e.tagName}.${e.className}`).join(' | ')) : '';
    assert(!overflow, `no horizontal scroll on phone: ${v} ${wide}`);
    if (v === 'dashboard' || v === 'maintenance') await page.screenshot({ path: `${OUT}/mobile-${v}.png` });
  }
  await page.evaluate(() => { S.incidents = []; const g = S.guests[0]; if (g) { pushIncident(SCEN['lost-pet'], { guestId: g.id, roomId: g.roomId }); ui.modal = { type: 'incident', id: S.incidents[0].id }; render(); } });
  await page.screenshot({ path: OUT + '/mobile-incident.png' });

  // ---- gentle difficulty and coaching ----
  await page.evaluate(() => { ui.modal = null; S.firsts = {}; ui.view = 'dashboard'; render(); });
  assert(await page.locator('text=Getting started').count() === 1 && await page.locator('text=0 of 6 done').count() === 1 && await page.locator('.alert.tip').count() === 1, 'a new game shows the getting started checklist and a tip');
  await page.evaluate(() => { noteFirst('read'); noteFirst('team'); render(); });
  assert(await page.locator('text=2 of 6 done').count() === 1 && await page.locator('.card:has(h3:has-text("Getting started")) .tick.done').count() === 2, 'finished steps are ticked');
  await page.click('[data-act="hideFirsts"]');
  assert(await page.locator('text=Getting started').count() === 0, 'the checklist can be hidden');
  await page.evaluate(() => { actions.nav({ view: 'settings' }); });
  const abBefore = await page.evaluate(() => S.autoBook);
  await page.click('[data-act="toggleAutoBook"]');
  assert(await page.evaluate(() => S.autoBook) === !abBefore, 'the Reception setting can be switched');
  await page.evaluate(() => { S.autoBook = true; });
  await page.evaluate(() => { ui.modal = null; S.incidents = []; S.lifelines = 0; S.money = BANKRUPT_AT - 5000; ui.view = 'dashboard'; render(); actions.endDay(); });
  assert(await page.locator('.modal:has-text("stepped in")').count() === 1 && await page.locator('.modal .headline').count() === 1 && await page.locator('.modal:has-text("Tip:")').count() === 1, 'the end-of-day report shows a headline, a tip and the bank stepping in instead of game over');
  assert(await page.evaluate(() => S.money > BANKRUPT_AT && S.lifelines === 1) && await page.locator('.modal:has-text("gone bankrupt")').count() === 0, 'running out of money uses a lifeline rather than ending the game');
  await page.click('.modal [data-act="closeModal"]');
  await goLive(page);
  await page.evaluate(() => { ui.modal = null; S.awards = {}; render(); });
  await page.evaluate(() => { actions.nav({ view: 'expansion' }); });
  assert(await page.locator('.award').count() === await page.evaluate(() => AWARDS.length) && await page.locator('.award.locked').count() === await page.evaluate(() => AWARDS.length), 'the expansion page lists every award, all locked');
  await page.evaluate(() => { checkAwards({ income: 2000, expenses: 500, profit: 1500, full: false }); render(); });
  assert(await page.locator('.award:not(.locked)').count() >= 2 && await page.locator('text=Big day').count() >= 1, 'an earned award is shown as unlocked');
  await page.evaluate(() => { S.money = 50000; S.lifelines = 0; });
  await page.evaluate(() => { actions.nav({ view: 'dashboard' }); });

  // every screen at phone, iPad (portrait and landscape) and laptop sizes: no sideways scrolling, and the right navigation for each
  await page.evaluate(() => { ui.modal = null; render(); });
  const ALL_VIEWS = ['dashboard', 'rooms', 'guests', 'bookings', 'events', 'inbox', 'incidents', 'tasks', 'staff', 'expansion', 'maintenance', 'finance', 'settings', 'extras'];
  for (const [label, w, h] of [['phone', 390, 844], ['small phone', 360, 640], ['iPad portrait', 820, 1180], ['iPad landscape', 1180, 820], ['laptop', 1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    const nav = await page.evaluate(() => ({ more: getComputedStyle(document.querySelector('.nav.more-btn')).display !== 'none', labels: getComputedStyle(document.querySelector('.nav .lbl')).display !== 'none',
      sideBottom: Math.round(document.querySelector('.side').getBoundingClientRect().top) > innerHeight / 2, tabs: [...document.querySelectorAll('.side > .nav, .side > .more-hidden > .nav')].filter(e => e.offsetParent !== null).length }));
    assert(nav.more === (w < 700), `${label}: More button only on phones`);
    assert((label === 'phone' || label === 'small phone') ? nav.sideBottom && nav.tabs === 6 : !nav.sideBottom, `${label}: navigation placed correctly (${JSON.stringify(nav)})`);
    for (const v of ALL_VIEWS) {
      await page.evaluate(v => { ui.view = v; render(); window.scrollTo(0, 0); }, v);
      const o = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      const who = o ? await page.evaluate(() => [...document.querySelectorAll('#app *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 4).map(e => `${e.tagName}.${e.className}:${(e.textContent || '').slice(0, 30)}`).join(' | ')) : '';
      assert(!o, `${label}: no sideways scroll on ${v} ${who}`);
    }
    await page.evaluate(() => { ui.view = 'dashboard'; render(); });
    await page.screenshot({ path: `${OUT}/layout-${label.replace(' ', '-')}.png` });
  }


  // ---- seasons, weather and pricing ----
  const dayNow = await page.evaluate(() => S.day);
  await page.evaluate(() => { ui.modal = null; S.firsts.hidden = true; S.day = 8; S.weatherSet = { 8: 'sunny', 9: 'rain', 10: 'storm' }; S.rooms.forEach(r => { r.price = ROOM_TYPES[r.type].price; }); S.guests.forEach(g => { g.left = 20; }); actions.nav({ view: 'dashboard' }); });
  assert(await page.locator('.card h3:has-text("Spring")').count() === 1 && await page.locator('.forecast .fc').count() === 4 && await page.locator('text=Sunny, ').count() >= 1, 'the dashboard shows the season, today\'s weather and a four-day forecast');
  assert(await page.locator('text=Spring Flower Festival').count() >= 1 && await page.locator('text=People asking to stay').count() === 1, 'the dashboard announces the festival and demand');
  assert(await page.locator('.forecast .fc:has-text("Rain")').count() >= 1 && await page.locator('.forecast .fc:has-text("Storm")').count() >= 1, 'the forecast shows rain and storm days');
  assert(await page.locator('[data-act="applyAdvice"][data-type="Standard"]').count() === 1, 'the prices card suggests a festival price for Standard rooms');
  const target = await page.evaluate(() => Number(document.querySelector('[data-act="applyAdvice"][data-type="Standard"]').dataset.price));
  await page.click('[data-act="applyAdvice"][data-type="Standard"]');
  assert(await page.evaluate(t => S.rooms.filter(r => r.type === 'Standard').every(r => r.price === t), target) && target > 90, 'one tap sets the suggested price for every Standard room');
  await page.evaluate(() => { actions.nav({ view: 'events' }); ui.eventTab = 'plan'; S.staff.forEach(x => { x.rota = Array(14).fill(true); x.sickDays = 0; }); render(); });
  await page.click('[data-act="openPlan"][data-key="bbq"]');
  assert(await page.locator('#ev-day option:has-text("forecast")').count() > 3 && (await page.locator('#evPreview').innerText()).includes('forecast for that day'), 'planning an outdoor event shows the forecast for each day');
  await page.click('.modal [data-act="closeModal"]');
  await page.evaluate(d => { S.day = d; S.weatherSet = {}; S.rooms.forEach(r => { r.price = ROOM_TYPES[r.type].price; }); actions.nav({ view: 'dashboard' }); }, dayNow);

  // ---- challenges ----
  await page.evaluate(() => { ui.modal = null; S.firsts.hidden = true; S.incidents = []; S.jobs = S.jobs.filter(j => j.type !== 'complaint' && j.type !== 'clean'); S.rooms.forEach(r => { r.dirty = false; });
    S.challenges.daily = ['clean-sweep', 'everyone-heard']; S.challenges.dailyDone = {}; S.challenges.weekly = 'week-event'; S.challenges.weeklyDone = false; S.guests.forEach(g => { g.happiness = 90; }); actions.nav({ view: 'dashboard' }); });
  assert(await page.locator('.card h3:has-text("Challenges")').count() === 1 && await page.locator('.card:has(h3:has-text("Challenges")) .tick').count() === 3 && await page.locator('.card:has(h3:has-text("Challenges")) .chip:has-text("Weekly")').count() === 1, 'the dashboard lists two daily challenges and a weekly one');
  assert(await page.locator('text=Clean sweep').count() >= 1 && await page.locator('text=Everyone heard').count() >= 1 && await page.locator('text=Event of the week').count() >= 1, 'each challenge is named and described');
  const cashCh = await page.evaluate(() => S.money);
  await page.evaluate(() => { actions.endDay(); });
  assert(await page.locator('.modal:has-text("Challenge done: Clean sweep")').count() === 1 && await page.locator('.modal:has-text("Challenge done: Everyone heard")').count() === 1, 'the end-of-day report shows the challenges that were done');
  assert(await page.evaluate(() => S.challenges.completed >= 2 && S.ledger.some(e => /^Challenge: /.test(e.label) && e.grant)), 'completed challenges pay a bonus');
  await page.click('.modal [data-act="closeModal"]');
  await goLive(page);
  await page.evaluate(() => { ui.modal = null; actions.nav({ view: 'dashboard' }); });
  assert(await page.locator('.card:has(h3:has-text("Challenges")) .tick.done').count() === 0 && await page.locator('.card:has(h3:has-text("Challenges")) .chip:has-text("-day streak")').count() === 1, 'a new day brings new challenges and a streak counter');

  // ---- guided first day and sound, in a fresh game of their own ----
  {
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx2.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.goto(URL);
    // the walkthrough, one question at a time, with Back keeping the answers
    assert(await page.locator('.setup-step[data-step="welcome"]').count() === 1 && await page.locator('.setup-dots i').count() === 7, 'setup starts with a welcome and shows seven steps');
    await page.click("text=Let's start");
    await page.click('.setup-step button.primary');
    assert(await page.locator('.setup-step[data-step="name"]').count() === 1, 'the name step will not go on without a name');
    await page.fill('#i-o', 'Ella'); await page.click('.setup-step button.primary');
    assert(await page.locator('.setup-step[data-step="photo"]').count() === 1 && await page.locator('[data-act="setupSkip"]').count() === 1, 'then a photo step that can be skipped');
    await page.setInputFiles('input[data-change="photo"]', path.join(OUT, 'p.png'));
    await page.waitForFunction(() => ui.photo && ui.photo.startsWith('data:image/jpeg'));
    await page.click('.setup-step button.primary');
    await page.click('[data-act="diceHotel"]');
    assert((await page.inputValue('#i-h')).length > 5, 'the hotel name step can suggest a name');
    await page.fill('#i-h', 'Tour Hotel'); await page.click('.setup-step button.primary');
    assert(await page.locator('#b-n').inputValue() === 'Hotel HQ Bank' && await page.locator('input[name="bankColour"]').count() === 6, 'the bank step offers a bank name and six colours');
    assert(await page.locator('input[name="bankNumber"], input[name="accountNumber"], input[name="cardNumber"]').count() === 0, 'setup never asks for account or card numbers');
    await page.fill('#b-n', 'Piggy Bank'); await page.check('input[name="bankColour"][value="plum"]', { force: true });
    await page.click('[data-act="setupBack"]'); await page.click('.setup-step button.primary');
    assert(await page.locator('#b-n').inputValue() === 'Piggy Bank' && await page.inputValue('#b-n') === 'Piggy Bank' && await page.evaluate(() => ui.setup.hotel === 'Tour Hotel' && ui.setup.owner === 'Ella'), 'going back and forward keeps every answer');
    await page.click('.setup-step button.primary');
    assert(await page.locator('.setup-step[data-step="how"] .card').count() >= 5 && (await page.locator('.setup-step').innerText()).includes('Management Offline'), 'a how-it-works step explains the game and Management online and offline');
    await page.click('.setup-step button.primary');
    assert((await page.locator('.setup-step').innerText()).includes('Tour Hotel') && (await page.locator('.setup-step').innerText()).includes('Piggy Bank'), 'the last step shows a summary');
    await page.click('text=Open my hotel');
    assert(await page.evaluate(() => S.bank.name === 'Piggy Bank' && S.bank.colour === 'plum' && /^HQ [0-9]{4} [0-9]{4}$/.test(S.bank.account) && S.ownerPhoto && S.ownerPhoto.startsWith('data:image/jpeg')), 'a new game keeps the bank name, colour, invented account number and the manager photo');
    assert(await page.locator('.top .me img.av').count() === 1, 'the manager photo shows in the control bar');
    await page.evaluate(() => { ui.modal = null; actions.nav({ view: 'finance' }); });
    assert((await page.locator('.bankcard').innerText()).includes('Piggy Bank') && (await page.locator('.bankcard').innerText()).includes('HQ '), 'Finance shows the bank card with its name and invented number');
    const editId = await page.evaluate(() => S.staff[0].id); await page.evaluate(id => openModal({ type: 'staff', id }), editId);   // opened directly: visiting the Team screen would complete a tour step
    await page.click('[data-act="useMyPhoto"]');
    assert(await page.evaluate(() => ui.photo === S.ownerPhoto), 'the manager photo can be given to a team member');
    await page.click('.modal button[type=submit]');
    assert(await page.evaluate(id => staffById(id).photo === S.ownerPhoto, editId), 'and is saved on that team member');
    await page.evaluate(() => { actions.nav({ view: 'dashboard' }); });
    async function clearIncidents() {
      for (let i = 0; i < 30; i++) {
        if (await page.locator('.modal.wide .opt').count()) {
          const enabled = page.locator('.modal.wide .opt:not([disabled])');
          if (await enabled.count()) await enabled.first().click(); else await page.click('[data-act="decideLater"]');
        } else if (await page.locator('[data-act="continueIncident"]').count()) await page.click('[data-act="continueIncident"]');
        else if (await page.locator('.modal .chip:text-is("Crisis"), .modal .chip:text-is("Warning")').count()) await page.click('.modal [data-act="closeModal"]');
        else break;
      }
    }
    await clearIncidents();

  const cardText = async () => (await page.locator('.tour-card').count()) ? await page.locator('.tour-card').innerText() : '';
  assert((await cardText()).includes('Welcome to your hotel!') && await page.locator('.tour-ring').count() === 0, 'a new game starts with the welcome step');
  await page.click('[data-act="tourNext"]');
  assert((await cardText()).includes('Your control bar') && await page.locator('.tour-ring').count() === 1, 'the tour points at the control bar');
  await page.click('[data-act="tourNext"]');
  assert((await cardText()).includes('Open the hotel') && await page.locator('.tour-ring').count() === 1, 'the tour asks for Management Online to be pressed');
  await page.click('.btn.mgmt');
  assert(await page.evaluate(() => S.mgmt.online === true), 'pressing it opens the hotel');
  await clearIncidents();
  assert((await cardText()).includes('Read your messages') && await page.locator('.tour-ring').count() === 1, 'then the tour points at the Inbox');
  await page.click('.nav[data-view="inbox"]');
  assert((await cardText()).includes('Tap a message to read it'), 'on the Inbox the tour asks for a message to be opened');
  await page.click('.mailrow >> nth=0');
  assert((await cardText()).includes('Take a booking'), 'reading a message moves the tour on by itself');
  await page.click('.nav[data-view="guests"]');
  assert((await cardText()).includes('Tap Accept on a booking') && await page.locator('.tour-ring').count() === 1, 'the tour points at an Accept button');
  await page.click('[data-act="acceptEnquiry"]:not([disabled]) >> nth=0');
  assert((await cardText()).includes('Get a room cleaned'), 'accepting a booking moves the tour on');
  await page.click('.nav[data-view="tasks"]');
  const cleanJob = await page.evaluate(() => { const j = S.jobs.find(x => x.type === 'clean'); return j ? j.id : null; });
  assert(cleanJob !== null && (await cardText()).includes('Choose a cleaner'), 'the tour points at the cleaning job');
  await page.click(`.pick[data-job="${cleanJob}"] >> nth=0`);
  assert((await cardText()).includes('Meet your team'), 'cleaning a room moves the tour on');
  await page.click('.nav[data-view="staff"]');
  assert((await cardText()).includes('Close the day'), 'visiting the Team page moves the tour on');
  await page.evaluate(() => { actions.endDay(); });
  assert(await page.locator('.tour-card').count() === 0, 'the tour steps aside while a dialog is open');
  await page.click('.modal [data-act="closeModal"]');
  await clearIncidents();
  assert((await cardText()).includes('You did it!'), 'ending the day finishes the tour');
  await page.click('[data-act="tourNext"]');
  assert(await page.evaluate(() => S.tour.done) === true && await page.locator('.tour-card').count() === 0, 'finishing the tour closes it for good');
  await page.evaluate(() => { S.tour = { step: 0, done: false }; ui.view = 'dashboard'; render(); });
  assert((await cardText()).includes('Welcome to your hotel!'), 'a tour can be started again');
  await page.click('[data-act="tourSkip"]');
  assert(await page.evaluate(() => S.tour.done) === true && await page.locator('.tour-card').count() === 0, 'the tour can be skipped');
  const reloadTour = await page.evaluate(() => JSON.parse(localStorage.getItem(SAVE_KEY)).tour);
  assert(reloadTour.done === true, 'the tour choice is saved');
  assert(await page.evaluate(() => !S.mgmt.online && S.morningPending === true), 'ending the day takes Management offline and holds the next morning back');
  await page.evaluate(() => { actions.goOnline(); ui.modal = null; render(); });
  assert(await page.evaluate(() => S.mgmt.online && S.morningPending === false), 'Management Online opens the next day');

    // ---- sound ----
  await page.evaluate(() => {
    window.__tones = [];
    window.AudioContext = class { constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; } resume() { return Promise.resolve(); }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
      createOscillator() { const o = { frequency: { value: 0 }, type: '', connect() {}, start() { window.__tones.push(o.frequency.value); }, stop() {} }; return o; } };
    sound.ctx = null; sound.last = 0; sound.on = true;
  });
  await page.evaluate(() => { toast('Well done', 'good'); });
  assert(await page.evaluate(() => __tones.join()) === '660,990', 'a good message plays a rising two-note sound');
  await page.evaluate(() => { sound.last = 0; __tones.length = 0; toast('Oh dear', 'bad'); });
  assert(await page.evaluate(() => __tones.join()) === '247,196', 'a bad message plays a low falling sound');
  await page.evaluate(() => { sound.last = 0; __tones.length = 0; addReview('Pat Lee', 3, 'ok'); render(); });
  assert(await page.evaluate(() => __tones.join()) === '784,1047', 'a new message in the inbox plays the mail sound');
  await page.evaluate(() => { actions.toggleSound(); sound.last = 0; __tones.length = 0; toast('Quiet', 'good'); });
  assert(await page.evaluate(() => sound.on === false && __tones.length === 0 && localStorage.getItem(SOUND_KEY) === 'off'), 'sound can be switched off and the choice is kept on the device');
  await page.evaluate(() => { actions.toggleSound(); });
  assert(await page.evaluate(() => sound.on === true && localStorage.getItem(SOUND_KEY) === 'on'), 'and back on again');

    // ---- goals and the welcome-back screen ----
    await page.evaluate(() => { ui.modal = null; ui.view = 'dashboard'; render(); });
    assert((await page.locator('.card.goal').innerText()).includes('Next goal: First guests') && await page.locator('.card.goal [role=progressbar]').count() === 1, 'the dashboard shows the next goal with a progress bar');
    await page.evaluate(() => { S.earned = 4400; render(); });
    assert((await page.locator('.card.goal').innerText()).includes('Next goal: First guests'), 'goals only move on at the end of the day');
    await page.click('[data-act="openMilestones"]');
    assert((await page.locator('.modal').innerText()).includes('Arcade') && await page.locator('.modal .tick.done').count() === 0, 'the goals list opens, with nothing ticked yet');
    assert(await page.locator('.modal .row .tick').count() === await page.evaluate(() => MILESTONES.length), 'the goals list shows every goal');
    await page.click('.modal [data-act="closeModal"]');
    await page.evaluate(() => { S.earned = 4990; S.incidents = []; S.money = 20000; actions.endDay(); });
    assert((await page.locator('.modal:has-text("Goal reached")').count()) === 1 && await page.locator('.modal:has-text("unlocked the Arcade")').count() === 1, 'the end-of-day report announces a goal and the free unlock');
    await page.click('.modal [data-act="closeModal"]');
    await goLive(page);
    assert(await page.evaluate(() => featureOn('arcade')), 'the unlock is kept');

    await page.evaluate(() => { ui.modal = null; S.visit = { date: localDate(1), streak: 2, best: 2 }; S.tour.done = true; writeSave(); });
    const cashBefore = await page.evaluate(() => S.money);
    await page.reload();
    assert(await page.locator('.modal:has-text("Welcome back")').count() === 1 && (await page.locator('.modal').innerText()).includes('3 days in a row'), 'opening the game on a new day greets the player with their streak');
    assert(await page.evaluate(b => S.money === b + VISIT_BONUS * 3, cashBefore), 'and pays the welcome back bonus for that streak');
    await page.click('.modal [data-act="closeModal"]');
    await page.reload();
    assert(await page.locator('.modal').count() === 0, 'opening it again the same day shows no greeting and pays nothing more');
    await page.evaluate(() => { S.visit = { date: localDate(5), streak: 6, best: 6 }; writeSave(); });
    await page.reload();
    assert((await page.locator('.modal').innerText()).includes('1 day in a row'), 'missing days starts the streak again');
    await page.click('.modal [data-act="closeModal"]');

    // ---- extras: arcade, Kids Club, shop and excursions ----
    await page.setViewportSize({ width: 1280, height: 900 });
    const hireIn = role => page.evaluate(r => { const p = drawPerson(); S.staff.push(makeStaff(p.name, p.gender, 'm01', r, 3, 3, [])); S.staff.forEach(x => { x.rota = Array(14).fill(true); x.sickDays = 0; }); render(); }, role);
    await page.evaluate(() => { ui.modal = null; S.incidents = []; S.firsts.hidden = true; S.money = 50000; S.weatherSet[S.day] = 'cloudy'; ui.view = 'dashboard'; render(); });
    assert(await page.locator('.nav[data-view="extras"]').count() === 1, 'once something is unlocked the Extras screen appears in the navigation');
    await page.click('.nav[data-view="extras"]');
    assert(await page.locator('.tab.active:has-text("Arcade")').count() === 1 && await page.locator('.tab').count() === 1, 'the Extras screen shows a tab for each unlocked extra');
    assert((await page.locator('.chip.bad').first().innerText()).includes('no Arcade Attendant') && await page.locator('.alert:has-text("advertise for a Arcade Attendant")').count() === 1, 'the arcade says it is closed and what is missing');
    assert(await page.locator('.card:has-text("Locked")').count() === 3 && await page.locator('text=Opens free when you have earned').count() === 3, 'locked extras show how close they are');
    await hireIn('Arcade Attendant');
    assert((await page.locator('.chip.good:has-text("Open today")').count()) === 1, 'with an attendant the arcade is open');
    await page.click('[data-act="funStep"][data-what="arcade"][data-dir="1"]');
    assert(await page.evaluate(() => S.arcade.price) === 2 && (await page.locator('.card:has-text("Price per play")').innerText()).includes('£2'), 'the price per play can be raised');
    for (let i = 0; i < 5; i++) await page.click('[data-act="funStep"][data-what="arcade"][data-dir="-1"]');
    assert(await page.evaluate(() => S.arcade.price) === 0.5 && (await page.locator('.card:has-text("Price per play")').innerText()).includes('£0.50'), 'and lowered, but never below the minimum');
    const before = await page.evaluate(() => S.money);
    await page.click('[data-act="buyMachine"][data-key="arcade-pinball"]');
    assert(await page.evaluate(b => !!assetByKey('arcade-pinball') && S.money === b - 500, before) && await page.locator('[data-act="buyMachine"]').count() === 1, 'a machine can be bought, once');

    await page.evaluate(() => { Object.keys(FEATURES).forEach(k => { S.features[k] = true; }); ensureFun(); S.rooms.filter(r => !r.guestId && !r.damaged).slice(0, 3).forEach(r => checkIn(r, 'Family ' + r.id, 3, { adults: 2, children: 2 })); render(); });
    await hireIn('Kids Club Leader'); await hireIn('Shop Assistant'); await hireIn('Excursions Guide');
    assert(await page.locator('.tab').count() === 4 && await page.locator('text=Still to unlock').count() === 0, 'every extra has a tab once all are unlocked');
    await page.click('[data-act="funTab"][data-tab="kidsclub"]');
    assert(await page.locator('.card.kpi:has-text("Club leaders on duty")').count() === 1 && await page.locator('.chip.good:has-text("Open today")').count() === 1, 'the Kids Club shows its leader and opens');
    await page.evaluate(() => { S.guests.forEach(g => { delete g.kidsClub; }); render(); });
    const fam = await page.evaluate(() => familiesInHouse().length);
    assert(fam >= 3 && await page.locator('[data-act="kidsEnrol"]').count() === fam, 'every family staying is listed');
    await page.click('[data-act="kidsEnrol"] >> nth=0');
    assert(await page.evaluate(() => familiesInHouse().filter(g => g.kidsClub === true).length) === 1 && await page.locator('.chip.good:has-text("Booked in")').count() === 1, 'a family can be booked in');
    await page.click('[data-act="kidsEnrol"][data-on="0"]');
    assert(await page.evaluate(() => familiesInHouse().filter(g => g.kidsClub === true).length) === 0 && await page.locator('.chip:has-text("Not booking")').count() === 1, 'and taken out again');
    await page.click('[data-act="funStep"][data-what="kids"][data-dir="1"]');
    assert(await page.evaluate(() => S.kids.price) === 19, 'the Kids Club price can be changed');
    const auto = await page.evaluate(() => S.kids.auto); await page.click('[data-act="toggleKidsAuto"]');
    assert(await page.evaluate(() => S.kids.auto) === !auto, 'automatic booking can be switched');

    await page.click('[data-act="funTab"][data-tab="shop"]');
    const stock0 = await page.evaluate(() => S.shop.stock.souvenir), cash0 = await page.evaluate(() => S.money);
    await page.click('[data-act="buyStock"][data-key="souvenir"][data-packs="1"]');
    assert(await page.evaluate(([a, c]) => S.shop.stock.souvenir === a + 10 && S.money === c - 50, [stock0, cash0]), 'stock can be ordered for the shop');
    await page.click('[data-act="funStep"][data-what="shop"][data-key="snack"][data-dir="1"]');
    assert(await page.evaluate(() => S.shop.price.snack) === 4 && (await page.locator('.card:has-text("Snacks and drinks")').innerText()).includes('£4'), 'a price can be changed');

    await page.click('[data-act="funTab"][data-tab="excursions"]');
    assert(await page.locator('.card.flush').count() === 3, 'three starter excursions are shown');
    await page.click('[data-act="addTrip"]');
    await page.fill('#t-n', 'Pirate <b>cove</b>'); await page.selectOption('#t-c', 'Adventure day'); await page.fill('#t-p', '33');
    await page.setInputFiles('input[data-change="photo"]', path.join(OUT, 'p.png'));
    await page.waitForFunction(() => ui.photo && ui.photo.startsWith('data:image/jpeg'));
    assert((await page.locator('#tripPreview').innerText()).includes('to run'), 'the excursion form shows costs and profit');
    await page.waitForTimeout(400);   // let the form finish sliding in
    await page.click('#tripForm button[type=submit]');
    assert(await page.locator('.card.flush').count() === 4 && await page.locator('.card.flush img.photo').count() === 1 && await page.locator('.card.flush:has-text("Pirate bcove/b")').count() === 1, 'a made-up excursion appears with its own name and picture');
    assert(await page.evaluate(() => S.trips.list.some(t => t.name === 'Pirate bcove/b' && t.price === 33 && t.cat === 'Adventure day' && t.photo.startsWith('data:image/jpeg'))), 'and is saved');
    await page.click('.card.flush:has-text("Pirate") [data-act="editTrip"]'); await page.fill('#t-p', '44'); await page.click('#tripForm button[type=submit]');
    assert(await page.evaluate(() => S.trips.list.find(t => t.name === 'Pirate bcove/b').price) === 44, 'an excursion can be edited');
    await page.click('[data-act="addTripCat"]'); await page.fill('#c-n', 'Pirate treasure'); await page.check('input[name="kind"][value="indoor"]'); await page.check('input[name="level"][value="2"]'); await page.click('.modal button[type=submit]');
    assert(await page.evaluate(() => tripCategories()['Pirate treasure'].cost === 16 && !tripCategories()['Pirate treasure'].outdoor), 'a new category can be invented');
    await page.click('[data-act="addTrip"]');
    assert(await page.locator('#t-c option:has-text("Pirate treasure (yours)")').count() === 1, 'the new category can be chosen for an excursion');
    await page.click('.modal [data-act="closeModal"]');
    await page.click('.card.flush:has-text("Pirate") [data-act="deleteTripAsk"]'); await page.click('.modal [data-act="deleteTripDo"]');
    assert(await page.locator('.card.flush').count() === 3, 'an excursion can be deleted');

    for (const [w, h] of [[390, 844], [360, 640], [820, 1180]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const tab of ['arcade', 'kidsclub', 'shop', 'excursions']) {
        await page.evaluate(t => { ui.funTab = t; ui.view = 'extras'; render(); window.scrollTo(0, 0); }, tab);
        const o = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert(!o, `no sideways scroll on Extras (${tab}) at ${w} wide`);
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { ui.modal = null; S.incidents = []; S.guests.forEach(g => { g.left = Math.max(g.left, 3); }); S.weatherSet[S.day] = 'cloudy'; actions.endDay(); });
    const rep = await page.locator('.modal').innerText();
    assert(/Arcade/i.test(rep) && /shop/i.test(rep) && /excursion/i.test(rep), 'the end-of-day report lists the arcade, shop and excursions');
    await page.evaluate(() => closeModal());
    await goLive(page);

    // ---- the phone desk ----
    await page.setViewportSize({ width: 1280, height: 900 });
    const queueCall = () => page.evaluate(() => { ui.modal = null; S.phone.calls = []; S.phone.lastRing = 1; S.phone.lastMail = 0; const c = makeCall('call'); c.ask = { type: 'Standard', arriveDay: S.day + 3, nights: 2, adults: 2, children: 0, asks: ['quiet', 'late'] }; S.phone.calls.push(c); render(); return c.id; });
    await page.evaluate(() => { S.phone.welcome = 'Welcome, friend'; S.blocks = []; render(); });
    const callId = await queueCall();
    await page.evaluate(() => {   // the page was reloaded earlier, so listen for sounds again
      window.__tones = [];
      window.AudioContext = class { constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; } resume() { return Promise.resolve(); }
        createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
        createOscillator() { const o = { frequency: { value: 0 }, type: '', connect() {}, start() { window.__tones.push(o.frequency.value); }, stop() {} }; return o; } };
      sound.ctx = null; sound.last = 0; sound.on = true; phoneBeat();
    });
    assert(await page.locator('#ringFab').count() === 1 && (await page.locator('#ringFab').innerText()).includes('is calling'), 'a call rings: a ringing button appears');
    assert(await page.evaluate(() => __tones.slice(0, 2).join()) === '1046,1318', 'and the phone ring sound is played');
    assert(await page.locator('.nav[data-view="phone"] .badge.red').count() === 1, 'the Phone tab shows a red badge');
    await page.evaluate(() => { actions.nav({ view: 'dashboard' }); });
    assert(await page.locator('#ringFab').count() === 1, 'the ringing button follows the player to other screens');
    await page.click('#ringFab'); await page.waitForTimeout(500);
    assert(await page.locator('.modal .speech .bubble').count() === 6 && await page.locator('.call-head .av-fb, .call-head img.av').count() === 1, 'answering shows the caller and what they say');
    const callerName = await page.evaluate(id => callById(id).caller.name, callId);
    await page.click('[data-act="fillName"]');
    assert(await page.inputValue('#c-n') === callerName, '"Fill it in for me" writes the caller\'s name');
    await page.fill('#c-n', 'Zed Quill'); await page.selectOption('#c-t', 'Standard'); await page.selectOption('#c-d', String(await page.evaluate(() => S.day + 3)));
    await page.fill('#c-nn', '2'); await page.fill('#c-a', '2'); await page.fill('#c-k', '0');
    await page.check('input[name="ask"][value="quiet"]'); await page.check('input[name="ask"][value="late"]'); await page.fill('#c-note', 'Likes <b>tea</b>');
    const cashBefore2 = await page.evaluate(() => S.money);
    await page.click('#callForm button[type=submit]'); await page.waitForTimeout(400);
    const card = await page.locator('.confcard').innerText();
    assert(/HQ-[0-9]{5}/.test(card) && card.includes('Zed Quill') && card.includes('Standard') && card.includes('Quiet room') && card.includes('Welcome, friend'), 'a booking confirmation card shows the reference, guest, room, requests and her welcome message');
    assert((await page.locator('.modal').innerText()).includes('Perfect') && await page.evaluate(b => S.money === b + 30, cashBefore2), 'a perfect call is celebrated and earns a bonus');
    assert(await page.evaluate(() => S.bookings.some(b => b.name === 'Zed Quill' && b.notes === 'Likes tea' && b.requests.length === 2)) && await page.locator('#ringFab').count() === 0, 'the booking is made as typed, and the ringing stops');
    await page.evaluate(() => closeModal());

    // a call nobody answers stops ringing and waits; the player is not interrupted by a pop-up
    await queueCall();
    await page.evaluate(() => { openModal({ type: 'milestones' }); phoneBeat(); });
    assert(await page.locator('#ringFab').count() === 0 && await page.evaluate(() => !phoneRinging()), 'nothing rings while a pop-up is open');
    await page.evaluate(() => { closeModal(); phoneBeat(); });
    assert(await page.locator('#ringFab').count() === 1, 'it rings once the pop-up is closed');
    await page.evaluate(() => { phoneTick(Date.now() + PHONE.ringMs + 5, true); render(); });
    assert(await page.locator('#ringFab').count() === 0 && await page.evaluate(() => phoneOpen().length === 1 && !phoneRinging()), 'an unanswered call stops ringing and waits');
    await page.evaluate(() => { actions.nav({ view: 'phone' }); });
    assert(await page.locator('.card:has-text("Waiting on the line")').count() === 1 && await page.locator('.card.kpi:has-text("Calls and voicemails waiting")').count() === 1, 'the Phone tab lists it');
    await page.evaluate(() => { S.day += 1; phoneNewDay(); render(); });
    assert(await page.locator('.card:has-text("Left a voicemail yesterday")').count() === 1 && await page.locator('[data-act="callOpen"]:has-text("Call back")').count() === 1, 'by the next morning it is a voicemail she can return');
    await page.evaluate(() => { S.day -= 1; });

    // an email: quiet, kept in the Inbox, easier than a call
    await page.evaluate(() => { ui.modal = null; S.phone.calls = []; S.phone.lastRing = 1; S.phone.lastMail = 0; S.phone.answerphone = false; const e = makeCall('email'); e.ask = { type: 'Standard', arriveDay: S.day + 2, nights: 2, adults: 2, children: 0, asks: ['quiet'] }; S.phone.calls.push(e); window.__tones = []; sound.last = 0; phoneBeat(); actions.nav({ view: 'phone' }); });
    assert(await page.locator('#ringFab').count() === 0 && await page.evaluate(() => S.phone.calls[0].status === 'waiting' && !phoneRinging()), 'an email arrives quietly: nothing rings');
    assert(await page.evaluate(() => __tones.join()) === '523', 'and it gives one low, soft ding and nothing else');
    assert(await page.locator('.card:has-text("Email, today") [data-act="callOpen"]:has-text("Read and book")').count() === 1 && await page.locator('.card.kpi:has-text("Emails waiting") .v:text-is("1")').count() === 1, 'the Phone tab lists it as an email');
    await page.evaluate(() => { actions.nav({ view: 'inbox' }); });
    assert(await page.locator('.mailrow:has-text("Booking enquiry:")').count() === 1 && await page.locator('.mailrow.unread:has-text("Booking enquiry:")').count() === 1, 'it also waits in the Inbox, titled as a booking enquiry');
    await page.click('.mailrow:has-text("Booking enquiry:")');
    assert((await page.locator('.mailpane').innerText()).includes('Dear ') && await page.locator('.mailpane [data-act="callOpen"]:has-text("Read it and make the booking")').count() === 1, 'opening it shows the email and a button to make the booking');
    await page.click('.mailpane [data-act="callOpen"]'); await page.waitForTimeout(400);
    assert((await page.locator('.call-head h2').innerText()).startsWith('Email:') && await page.locator('.modal .speech .bubble').count() === 7, 'the booking screen shows the whole email at once');
    const cashEm = await page.evaluate(() => S.money);
    await page.fill('#c-n', 'Eve Mail'); await page.selectOption('#c-t', 'Standard'); await page.selectOption('#c-d', String(await page.evaluate(() => S.day + 2)));
    await page.fill('#c-nn', '2'); await page.fill('#c-a', '2'); await page.fill('#c-k', '0'); await page.check('input[name="ask"][value="quiet"]');
    await page.click('#callForm button[type=submit]'); await page.waitForTimeout(400);
    assert((await page.locator('.modal').innerText()).includes('Perfect') && await page.evaluate(b => S.money === b + 15, cashEm) && await page.evaluate(() => S.bookings.some(b => b.name === 'Eve Mail')), 'a perfect email booking is made and pays half a call');
    await page.evaluate(() => closeModal());
    assert(await page.locator('.mailrow:has-text("Booking enquiry:")').count() === 0, 'and it leaves the Inbox');
    // the answerphone: calls never ring, they become voicemails in the Inbox
    await page.evaluate(() => { actions.nav({ view: 'phone' }); });
    assert(await page.locator('.card:has-text("Answerphone"):has-text("Off")').count() >= 1, 'the Phone tab shows the answerphone, off to begin with');
    await page.click('[data-act="toggleAnswerphone"]');
    assert(await page.evaluate(() => S.phone.answerphone === true) && (await page.locator('.content').innerText()).includes('Callers leave a voicemail'), 'it can be turned on');
    await queueCall(); await page.evaluate(() => { __tones.length = 0; sound.last = 0; phoneBeat(); });
    assert(await page.evaluate(() => __tones.join()) === '523', 'a voicemail gives the same single soft ding, with no ring');
    assert(await page.locator('#ringFab').count() === 0 && await page.evaluate(() => { const c = S.phone.calls[0]; return !phoneRinging() && c.kind === 'voicemail' && c.via === 'answerphone' && c.status === 'waiting'; }), 'with it on the call does not ring and is left as a voicemail');
    await page.evaluate(() => { actions.nav({ view: 'inbox' }); });
    assert(await page.locator('.mailrow:has-text("Voicemail:"):has-text("booking enquiry")').count() === 1, 'the voicemail is in the Inbox, titled Voicemail with a booking enquiry');
    await page.click('.mailrow:has-text("Voicemail:")');
    assert(await page.locator('.mailpane [data-act="callOpen"]:has-text("Listen and make the booking")').count() === 1, 'and can be listened to from there');
    await page.evaluate(() => { S.phone.answerphone = false; S.phone.calls = []; ui.mailSel = null; render(); });

    // a written message
    await page.evaluate(() => { S.phone.calls = []; S.phone.lastRing = 1; S.phone.lastMail = 0; const m = makeMessage(); S.phone.calls.push(m); window.__tones.length = 0; sound.last = 0; phoneBeat(); ui.view = 'phone'; render(); });
    assert(await page.locator('.card:has-text("Message,")').count() === 1 && await page.locator('#ringFab').count() === 0, 'a message arrives quietly, with no ringing');
    await page.click('[data-act="msgOpen"]'); await page.waitForTimeout(400);
    await page.fill('#m-t', 'Dear guest, we would love to see you!');
    const cash3 = await page.evaluate(() => S.money);
    await page.click('.modal form button[type=submit]');
    assert(await page.evaluate(b => S.money === b + 5 && S.phone.sent.length >= 1 && /love to see you/.test(S.phone.sent[0].text), cash3) && await page.locator('.section-title:has-text("Replies you have sent") + .card:has-text("love to see you")').count() === 1, 'a written reply is sent, kept and rewarded');

    // "Suggest a name" for bookings and the team; typing your own always works
    await page.evaluate(() => { actions.addGuest(); }); await page.waitForTimeout(400);
    await page.click('[data-act="diceName"][data-target="bk-name"]');
    const suggested = await page.inputValue('#bk-name');
    assert(suggested.length > 3 && /^[^0-9]+$/.test(suggested), 'the booking form can suggest a guest name');
    await page.fill('#bk-ad', '2'); await page.fill('#bk-ch', '2'); await page.click('[data-act="diceOthers"]');
    const others = (await page.inputValue('#bk-others')).split(',').map(x => x.trim()).filter(Boolean);
    assert(others.length === 3 && others.every(n => n.includes(' ')), 'and the other guests in the party');
    await page.fill('#bk-name', 'Pat Typed'); assert(await page.inputValue('#bk-name') === 'Pat Typed', 'typing your own name still works');
    await page.evaluate(() => closeModal());
    await page.evaluate(() => { const s = S.staff[0]; window.__oldName = s.name; openModal({ type: 'staff', id: s.id }); }); await page.waitForTimeout(400);
    await page.click('[data-act="diceName"][data-target="e-n"]');
    assert(await page.inputValue('#e-n') !== await page.evaluate(() => window.__oldName), 'a team member can be given a suggested name');
    await page.evaluate(() => closeModal());

    // layout: the Phone tab and a call, at phone and iPad sizes
    for (const [w, h] of [[390, 844], [360, 640], [820, 1180]]) {
      await page.setViewportSize({ width: w, height: h });
      await queueCall();
      await page.evaluate(() => { phoneBeat(); ui.view = 'phone'; render(); });
      assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `no sideways scroll on the Phone tab at ${w} wide`);
      await page.evaluate(id => { openModal({ type: 'call', id }); }, await page.evaluate(() => S.phone.calls[0].id)); await page.waitForTimeout(450);
      assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.querySelector('.modal').scrollWidth > document.querySelector('.modal').clientWidth + 1)), `no sideways scroll in a call at ${w} wide`);
      await page.evaluate(() => closeModal());
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { S.phone.calls = []; render(); });

    // ---- guest notes, the guest book, review replies, the diary, the briefing and ranks ----
    await page.evaluate(() => { ui.modal = null; S.incidents = []; S.guests.forEach((g, i) => { g.pref = i === 0 ? 'quiet' : null; g.regularId = null; g.remembered = false; }); ui.view = 'guests'; render(); });
    assert((await page.locator('.overheard').first().innerText()).includes('light sleeper') && await page.locator('.overheard').count() === 1, 'a guest who likes something lets it slip, so there is something to write down');
    await page.fill('.memo form >> nth=0 >> input[name="text"]', 'Likes a quiet room');
    await page.click('.memo form >> nth=0 >> button');
    assert(await page.evaluate(() => S.guests[0].note) === 'Likes a quiet room', 'a note about a guest can be written and saved');
    await page.evaluate(() => { const g = S.guests[1]; g.regularId = 1; g.remembered = true; render(); });
    assert(await page.locator('.chip:has-text("Returning guest")').count() === 1 && await page.locator('.chip:has-text("You remembered!")').count() === 1, 'returning guests are marked, and so is being remembered');
    await page.evaluate(() => { const g = S.guests[0]; g.happiness = 80; const name = g.name; leaveGuest(g, roomById(g.roomId)); window.__leftName = name; render(); });
    assert(await page.locator('.section-title:has-text("Guest book")').count() === 1 && await page.evaluate(() => S.regulars.some(r => r.name === window.__leftName && r.note === 'Likes a quiet room')), 'a guest who leaves goes in the guest book with the note');
    await page.fill('.card:has-text("Likes us") form[data-form="bookNote"] input[name="text"] >> nth=0', 'Always asks for the quiet room');
    await page.click('.card:has-text("Likes us") form[data-form="bookNote"] button >> nth=0');
    assert(await page.evaluate(() => S.regulars.some(r => r.note === 'Always asks for the quiet room')), 'notes in the guest book can be changed');
    // replying to a review
    await page.evaluate(() => { addReview('Pat Reviewer', 4, 'Lovely hotel and friendly staff.'); S.tally.replies = 0; ui.view = 'guests'; render(); });
    const cashR = await page.evaluate(() => S.money);
    await page.click('[data-act="reviewOpen"] >> nth=0'); await page.waitForTimeout(400);
    await page.fill('#rv-t', 'Thank you, Pat! Come back soon.'); await page.click('.modal form button[type=submit]');
    assert(await page.evaluate(b => S.reviews[S.reviews.length - 1].reply === 'Thank you, Pat! Come back soon.' && S.money === b + 5, cashR) && await page.locator('.reply:has-text("Come back soon")').count() === 1, 'a review can be answered: the reply is kept, shown and rewarded');
    // the diary
    await page.evaluate(() => { actions.nav({ view: 'diary' }); });
    assert(await page.locator('.nav[data-view="diary"]').count() === 1 && await page.locator('h2:has-text("Diary")').count() === 1, 'the Diary has its own place in the menu');
    await page.fill('#dy-t', 'Today we took the best booking yet.'); await page.click('form[data-form="diary"] button');
    assert(await page.evaluate(() => S.diary.some(e => e.day === S.day && e.text === 'Today we took the best booking yet.')), 'a diary line can be written for today');
    await page.evaluate(() => render());
    assert(await page.locator('.card:has-text("best booking yet")').count() >= 1, 'and shows in the diary');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="exportDiary"]')]);
    const saved = fs.readFileSync(await download.path(), 'utf8');
    assert(/-diary\.txt$/.test(download.suggestedFilename()) && saved.includes('best booking yet') && saved.includes('Tour Hotel'), 'the diary can be exported as a text file');
    // the end of the day: tomorrow at a glance, the diary field, and a promotion
    await page.evaluate(() => { ui.modal = null; S.incidents = []; S.earned = 60000; S.money = 80000; S.guests.forEach(g => { g.left = Math.max(g.left, 3); }); actions.endDay(); });
    await page.waitForTimeout(450);
    const reportText = await page.locator('.modal').innerText();
    assert(reportText.includes('Tomorrow at a glance') && await page.locator('.modal #dy-t').count() === 1, 'the day report previews tomorrow and offers a diary line');
    assert(/Promoted to .+!/.test(reportText) && reportText.includes('Goal reached'), 'the day report announces a promotion');
    await page.fill('.modal #dy-t', 'A day to remember.'); await page.click('.modal form[data-form="diary"] button');
    assert(await page.evaluate(() => S.diary.some(e => e.day === S.day - 1 && e.text === 'A day to remember.')) && await page.locator('.modal').count() === 1, 'a diary line from the report is saved for the day that ended, and the report stays open');
    await page.evaluate(() => { closeModal(); for (let i = 0; i < 4 && ui.modal; i++) { ui.autoInc = false; closeModal(); } });   // closing the report can open the day's first incident, which is random
    await goLive(page);
    // the briefing and the title
    await page.evaluate(() => { ui.view = 'dashboard'; render(); });
    assert(await page.locator('.card:has-text("Morning briefing") li.brief').count() >= 3 && (await page.locator('.hero p').innerText()).includes('('), 'the dashboard shows a morning briefing and the player\'s title');
    await page.click('[data-act="openMilestones"]'); await page.waitForTimeout(400);
    assert(await page.locator('.modal .chip:has-text("Your title:")').count() === 1 && await page.locator('[data-act="certOpen"]').count() >= 1, 'the goals list shows the title and a certificate for each promotion');
    await page.click('[data-act="certOpen"] >> nth=0'); await page.waitForTimeout(400);
    assert(/certificate of promotion/i.test(await page.locator('.confcard').innerText()) && (await page.locator('.confcard').innerText()).includes('Receptionist'), 'a certificate can be opened');
    await page.evaluate(() => closeModal());
    // layout
    for (const [w, h] of [[390, 844], [360, 640], [820, 1180]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const v of ['guests', 'diary', 'dashboard']) {
        await page.evaluate(vw => { ui.view = vw; render(); window.scrollTo(0, 0); }, v);
        assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `no sideways scroll on ${v} at ${w} wide`);
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    // ---- what guests asked for: a sea view and a dish ----
    await page.evaluate(() => {
      ui.modal = null; S.jobs = S.jobs.filter(j => j.type !== 'complaint');
      S.bookings = []; S.blocks = [];
      const room = S.rooms.find(r => r.type === 'Standard'); if (room.guestId) leaveGuest(guestById(room.guestId), room); room.dirty = false; room.damaged = false; S.jobs = S.jobs.filter(j => j.roomId !== room.id);
      const b = createBooking({ name: 'Vera Wish', adults: 1, children: 0, type: 'Standard', arriveDay: S.day + 1, nights: 2, price: 90, depositPct: 0, roomId: room.id }).booking;
      addBookingRequest(b.id, 'Sea view'); b.arriveDay = S.day; ui.view = 'bookings'; ui.bkTab = 'rooms'; ui.bkFilter = 'all'; render();
    });
    assert(await page.locator('.card:has-text("Vera Wish") .chip.warn:has-text("Sea view: needs an Ocean View room")').count() === 1, 'a reservation shows when its room would not give the sea view asked for');
    await page.evaluate(() => { ui.view = 'dashboard'; render(); });
    assert(await page.locator('li.brief.warn:has-text("Vera Wish asked for a sea view")').count() === 1, 'the morning briefing warns about it');
    await page.evaluate(() => { ui.view = 'bookings'; render(); });
    await page.click('.card:has-text("Vera Wish") [data-act="arriveCheckIn"]'); await page.waitForTimeout(200);
    assert((await page.locator('#toasts').innerText()).includes('asked for a sea view and did not get it'), 'checking them in says they did not get what they asked for');
    await page.evaluate(() => { ui.view = 'guests'; render(); });
    assert(await page.locator('.card:has-text("Vera Wish") .chip.warn:has-text("Asked for: Sea view. Not delivered")').count() === 1, 'the guest card shows it was not delivered');
    await page.evaluate(() => { ui.view = 'tasks'; render(); });
    assert(await page.locator('.card:has-text("Complaint: Vera Wish"):has-text("sea view")').count() === 1, 'and a complaint waits in Tasks');
    await page.evaluate(() => { ui.view = 'guests'; const g = S.guests.find(x => x.name === 'Vera Wish'); g.wishes[0] = { key: 'view', met: true }; render(); });
    assert(await page.locator('.card:has-text("Vera Wish") .chip.good:has-text("Asked for: Sea view. Delivered")').count() === 1, 'a wish that was met shows as delivered');
    await page.evaluate(() => { S.jobs = S.jobs.filter(j => j.type !== 'complaint'); });

    // ---- management online and offline ----
    await page.evaluate(() => { ui.modal = null; S.incidents = []; ui.view = 'dashboard'; render(); });
    assert((await page.locator('.btn.mgmt').innerText()).trim() === 'Management Offline', 'a live hotel shows Management Offline');
    await page.click('[data-act="endDayAsk"]');
    if (await page.locator('.modal [data-act="endDay"]').count()) await page.click('.modal [data-act="endDay"]');
    assert((await page.locator('.modal').innerText()).includes('Management is now offline') && await page.locator('.modal [data-act="goOnline"]').count() === 1 && await page.locator('.modal [data-act="closeModal"]:has-text("Stay offline")').count() === 1, 'the day report says Management is offline and offers Management Online');
    await page.click('.modal [data-act="closeModal"]');
    assert(await page.locator('.modal').count() === 0 && await page.locator('.mgmt-banner').count() === 1 && (await page.locator('.btn.mgmt').innerText()).trim() === 'Management Online', 'staying offline leaves the hotel paused with a banner');
    // locked while offline
    await page.evaluate(() => { ui.view = 'guests'; render(); });
    const enq0 = await page.evaluate(() => S.enquiries.length);
    if (enq0 > 0) {
      await page.click('[data-act="acceptEnquiry"]:not([disabled]) >> nth=0');
      assert((await page.locator('#toasts').innerText()).includes('Management is offline') && await page.evaluate(() => S.enquiries.length) === enq0, 'taking a booking is locked while offline');
    }
    await page.evaluate(() => { ui.view = 'tasks'; render(); });
    const pick0 = await page.evaluate(() => S.jobs.length);
    if (await page.locator('.pick[data-act="assign"]').count()) { await page.click('.pick[data-act="assign"] >> nth=0'); assert(await page.evaluate(() => S.jobs.length) === pick0, 'sending staff to a task is locked while offline'); }
    await page.evaluate(() => { S.phone.calls = [makeCall('call')]; S.phone.lastRing = 0; phoneBeat(); });
    assert(await page.evaluate(() => S.phone.calls.every(c => c.status === 'queued')), 'the phone does not ring while offline');
    // but changes are allowed
    await page.evaluate(() => { if (!hasFacility('restaurant')) S.unlocked.push('restaurant'); ui.view = 'events'; ui.eventTab = 'menu'; render(); });
    const dish0 = await page.evaluate(() => S.menu[0].on);
    await page.click('[data-act="toggleDish"] >> nth=0');
    assert(await page.evaluate(() => S.menu[0].on) === !dish0, 'menus can be changed while offline');
    await page.click('[data-act="toggleDish"] >> nth=0');
    // coming back after being away
    await page.evaluate(() => { S.mgmt.since = localDate(3); ui.view = 'dashboard'; render(); });
    assert((await page.locator('.mgmt-banner').innerText()).includes('hotel will have run by itself for 2 of them'), 'the banner warns when time has passed');
    const dayAway = await page.evaluate(() => S.day);
    await page.click('.btn.mgmt');
    assert((await page.locator('.modal h2').innerText()) === 'While you were away' && await page.locator('.modal .card').count() === 2 && await page.evaluate(d => S.day === d + 2 && S.mgmt.online, dayAway), 'going online after days away shows what the hotel did by itself');
    await page.click('.modal [data-act="closeModal"]');
    // left online past midnight, while the game is open
    await page.evaluate(() => { ui.modal = null; S.incidents = []; S.mgmt = { online: true, since: localDate(1) }; render(); return mgmtClockCheck(); });
    assert((await page.locator('.modal h2').innerText()) === 'While you were away' && await page.locator('.modal .card').count() === 1, 'a hotel left online past midnight runs by itself and says so');
    await page.click('.modal [data-act="closeModal"]');
    // and when the game is opened on a later day
    await page.evaluate(() => { ui.modal = null; S.mgmt = { online: true, since: localDate(2) }; S.visit = { date: localDate(0), streak: 2, best: 2 }; writeSave(); });
    await page.reload();
    assert((await page.locator('.modal h2').innerText()) === 'While you were away' && await page.evaluate(() => S.mgmt.since === localDate(0)), 'opening the game on a later day shows what happened overnight');
    await page.click('.modal [data-act="closeModal"]');
    // the Trip Scorer logo sits by the review average
    await page.evaluate(() => { ui.modal = null; ui.view = 'guests'; render(); });
    await page.waitForFunction(() => { const i = document.querySelector('.chip.scorer img'); return i && i.complete; });   // the picture loads after the page is drawn
    assert(await page.locator('.chip.scorer img[alt="Trip Scorer"]').count() === 1 && await page.evaluate(() => { const i = document.querySelector('.chip.scorer img'); return i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().height <= 34; }), 'the Trip Scorer logo shows, small, beside the review average');
    await page.evaluate(() => { if (!S.mgmt.online) actions.goOnline(); ui.modal = null; render(); });

    // ---- a stretched team: advice to recruit, and how to choose ----
    await page.evaluate(() => {
      ui.modal = null; S.staff.forEach(x => { x.rota = Array(14).fill(true); x.used = 0; x.sickDays = 0; });
      S.jobs = Array.from({ length: 30 }, () => ({ id: nid(), type: 'clean', roomId: S.rooms[0].id, role: 'Housekeeper', text: 'x' }));
      actions.nav({ view: 'tasks' });
    });
    assert(await page.locator('.card:has-text("Your team is stretched") .alert.warn:has-text("Recruit another Housekeeper")').count() === 1, 'the Tasks page says when the team cannot do all the jobs, and to recruit');
    const cashAd = await page.evaluate(() => S.money);
    await page.click('[data-act="recruitNow"][data-role="Housekeeper"]');
    assert(await page.evaluate(() => S.candidates.length === 3 && S.candidates.every(c => c.role === 'Housekeeper') && ui.view === 'staff' && ui.staffTab === 'hire'), 'one tap advertises for that role and shows the applicants');
    assert(await page.evaluate(c => S.money === c - ADVERT_COST, cashAd), 'and the advert costs what it says');
    const guide = await page.locator('.content').innerText();
    assert(guide.includes('Choosing who to hire') && guide.includes('Skill is experience') && guide.includes('Reliability is about sick days') && /Housekeeper:.*barely matters/s.test(guide), 'the Recruitment page explains skill, reliability and wages for the role');
    assert(await page.locator('.card.stack:has-text("per day") >> text=/a day is .*the usual wage/').count() === 3, 'every applicant shows their wage against the usual wage');
    assert(await page.locator('.content >> text=/Off sick about \\d+ days in 100/').count() === 3, 'and how often they are off sick');
    await page.evaluate(() => { ui.view = 'dashboard'; render(); });
    assert(await page.locator('li.brief.warn:has-text("Recruit another Housekeeper")').count() === 1, 'the morning briefing says it too');
    for (const [w, h] of [[390, 844], [820, 1180]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const v of ['tasks', 'staff']) { await page.evaluate(vw => { ui.view = vw; ui.staffTab = 'hire'; render(); window.scrollTo(0, 0); }, v); assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `no sideways scroll on ${v} at ${w} wide`); }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { S.jobs = []; S.candidates = []; render(); });

    // ---- crises, skill games, preparing, medals and heroes ----
    const lucky = () => page.evaluate(() => { window.__rand = Math.random; Math.random = () => 0.001; });
    const normal = () => page.evaluate(() => { if (window.__rand) Math.random = window.__rand; });
    const closeToasts = () => page.evaluate(() => { document.getElementById('toasts').innerHTML = ''; });
    await page.evaluate(() => {
      ui.modal = null; S.incidents = []; S.jobs = []; S.crises = []; S.warning = null; S.crisisLast = -99; S.money = Math.max(S.money, 50000); S.medals = {}; S.medalQueue = []; S.heroLog = []; S.safeguards = {}; S.crisisKinds = {};
      S.rooms.forEach(r => { if (r.guestId) leaveGuest(guestById(r.guestId), r); r.dirty = false; r.damaged = false; });
      S.staff.forEach(x => { x.rota = Array(14).fill(true); x.used = 0; x.sickDays = 0; x.trait = 'Always on time'; });
      S.standards.next = S.day + 30; S.standards.noticed = false;
      startCrisis('pipe', false); S.crises[0].seen = true; actions.nav({ view: 'dashboard' });
    });
    assert(await page.locator('.crisis-card:has-text("Crisis: Burst pipe") .bar.bad').count() === 1 && await page.locator('.crisis-card:has-text("Progress")').count() === 1, 'a crisis shows on the Dashboard with its Trouble and Progress');
    assert(await page.locator('.crisis-btn:has-text("Crisis")').count() === 1 && await page.locator('.nav[data-view="crisis"], .more-hidden .nav[data-view="crisis"]').count() >= 1, 'it adds a Crisis button and a menu entry');
    assert(await page.locator('.card:has(h3:has-text("Hotel standards")) .bar').count() === 4 && (await page.locator('.card:has(h3:has-text("Hotel standards"))').innerText()).includes('Star Inspector visits in'), 'the Dashboard shows the standards score, its three parts and the inspector countdown');
    await page.click('.crisis-card [data-act="nav"][data-view="crisis"]');
    assert(await page.locator('.pagehead h2:has-text("Crisis")').count() === 1 && await page.locator('.crisis-card .card.stack').count() === 5, 'the Crisis page lists five things she can do, including a notice');
    assert(await page.locator('.crisis-card .voice').count() === 3 && await page.locator('.crisis-card .voice .bubble').count() === 3, 'guests and a member of staff say what they think');
    assert(await page.locator('.crisis-card .pick[data-act="crisisPlay"][data-key="valve"]').count() >= 1 && await page.locator('.crisis-card .chip:has-text("Timing game")').count() === 1 && await page.locator('.crisis-card .chip:has-text("Tapping game")').count() === 1 && await page.locator('.crisis-card .chip:has-text("Word game")').count() === 1, 'actions say which game they are, and people can be chosen for them');
    // a word game: the plumber
    const cashC = await page.evaluate(() => S.money);
    await page.click('.crisis-card [data-act="crisisPlay"][data-key="plumber"]'); await page.waitForTimeout(250);
    assert(await page.locator('.modal .chip:has-text("Word game")').count() === 1 && await page.locator('.modal .opt').count() === 3 && await page.locator('.modal [data-act="crisisSkip"]:has-text("Leave it to chance (90%)")').count() === 1, 'a word game offers three answers, and leaving it to chance shows the odds');
    const best = await page.evaluate(() => ui.game.spec.options.findIndex(o => o.score === 2));
    await page.click(`.modal [data-act="gameChoice"][data-i="${best}"]`);
    assert((await page.locator('.modal').innerText()).includes('The best answer!'), 'picking the best answer says so');
    await page.click('.modal [data-act="gameDone"]'); await page.waitForTimeout(200);
    assert(await page.evaluate(c => S.money === c - 350 + CRISIS.medalBonus && S.crises[0].fix === 44 && S.crises[0].trouble === 15, cashC) && (await page.locator('#toasts').innerText()).includes('Perfect! Extra progress') && (await page.locator('#toasts').innerText()).includes('Medal won: Bullseye'), 'a perfect answer gives extra progress and the Bullseye medal');
    assert(await page.locator('.crisis-card [data-act="crisisPlay"][data-key="plumber"]').count() === 0 && (await page.locator('.crisis-card').innerText()).includes('Done today'), 'each action can be done once a day');
    await closeToasts();
    // a timing game: the valve
    await page.click('.crisis-card .pick[data-key="valve"] >> nth=0'); await page.waitForTimeout(250);
    assert(await page.locator('.modal .tg-bar .tg-zone').count() === 1 && await page.locator('.modal [data-act="tgStop"]').count() === 1, 'a timing game shows a green zone and a Stop button');
    const markMoves = await page.evaluate(async () => { const a = document.getElementById('tgMark').style.left; await new Promise(r => setTimeout(r, 300)); return a !== document.getElementById('tgMark').style.left; });
    assert(markMoves, 'the marker moves');
    await page.evaluate(() => { ui.game.frozen = true; ui.game.pos = ui.game.spec.center; });
    await page.click('.modal [data-act="tgStop"]'); await page.waitForTimeout(200);
    assert(await page.evaluate(() => S.crises[0].fix === 44 + 25 && S.crises[0].trouble === 0 && ui.game === null && S.crises[0].credit && Object.values(S.crises[0].credit).includes(3)), 'stopping in the middle of the zone is a perfect hit');
    await closeToasts();
    // a tapping game: drying the rooms (the zone and the timer are separate games)
    await page.click('.crisis-card .pick[data-key="dry"] >> nth=0'); await page.waitForTimeout(250);
    assert(await page.locator('.modal .patch:not(.gone)').count() === 6 && (await page.locator('.modal #tapTime').innerText()).includes('seconds left'), 'a tapping game shows six patches and a timer');
    await page.evaluate(() => { ui.game.frozen = true; });   // the clock is held so the test taps at its own pace
    assert(await page.evaluate(() => ui.game.spec.taps === 10 && ui.game.spec.seconds >= 10), 'each patch needs ten taps, and there is a fair amount of time for them');
    await page.click('.modal .patch:not(.gone) >> nth=0');
    const op1 = await page.evaluate(() => parseFloat(document.querySelector('.modal .patch').style.opacity));
    for (let i = 0; i < 8; i++) await page.click('.modal .patch:not(.gone) >> nth=0');
    const op9 = await page.evaluate(() => parseFloat(document.querySelector('.modal .patch').style.opacity));
    assert(op1 < 1 && op1 > 0.8 && op9 < 0.25 && op9 > 0.05 && await page.locator('.modal .patch:not(.gone)').count() === 6, 'each tap makes the patch fainter, and nine taps leave it almost clear but still there');
    await page.click('.modal .patch:not(.gone) >> nth=0');
    assert(await page.locator('.modal .patch:not(.gone)').count() === 5 && (await page.locator('.modal .muted.right').innerText()).includes('1 of 6 cleared'), 'the tenth tap clears the patch');
    for (let i = 0; i < 50; i++) await page.click('.modal .patch:not(.gone) >> nth=0');
    await page.waitForTimeout(200);
    assert(await page.evaluate(() => S.crises.length === 1 ? S.crises[0].acted.dry === S.day : true) && (await page.locator('#toasts').innerText().catch(() => '')).length >= 0, 'tapping every patch finishes the game');
    // leaving it to chance still works
    await page.evaluate(() => { S.crises[0].fix = 10; S.crises[0].acted = {}; S.staff.forEach(x => { x.used = 0; }); render(); });
    await lucky(); await page.click('.crisis-card .pick[data-key="valve"] >> nth=0'); await page.waitForTimeout(200); await page.click('.modal [data-act="crisisSkip"]'); await normal(); await page.waitForTimeout(200);
    assert(await page.evaluate(() => S.crises[0].fix === 30 && ui.game === null), 'leaving a game to chance uses the odds');
    // the notice, in her own words
    await page.evaluate(() => { S.crises[0].acted = {}; render(); });
    await page.fill('.crisis-card textarea[name="text"]', 'Dear guests, sorry about the water. We are fixing it and the lounge has free cake.');
    await page.click('.crisis-card form[data-form="crisisNotice"] button');
    assert(await page.evaluate(() => S.crises[0].notice.startsWith('Dear guests') && S.crises[0].fix === 30 + 5 + 3) && (await page.locator('.crisis-card').innerText()).includes('Your notice:'), 'a notice written in her own words helps, and is shown');
    // the announcement when a crisis begins overnight
    await page.evaluate(() => { S.crises[0].seen = false; announceCrisis(); });
    assert(await page.locator('.modal h2:has-text("Burst pipe")').count() === 1 && await page.locator('.modal [data-act="nav"][data-view="crisis"]').count() === 1, 'a new crisis is announced with a pop-up');
    await page.evaluate(() => closeModal());
    // solving it: a hero, a certificate and medals
    await page.evaluate(() => { S.crises[0].fix = 95; S.crises[0].acted = {}; S.staff.forEach(x => { x.used = 0; }); ui.view = 'crisis'; render(); });
    await lucky(); await page.click('.crisis-card [data-act="crisisAct"][data-key="treat"]'); await normal();
    await page.evaluate(() => { S.crises[0].acted = {}; S.crises[0].fix = 95; render(); });
    await page.click('.crisis-card .pick[data-key="valve"] >> nth=0'); await page.waitForTimeout(200); await lucky(); await page.click('.modal [data-act="crisisSkip"]'); await normal(); await page.waitForTimeout(250);
    const done = await page.locator('.modal').innerText();
    assert(done.includes('solved') && done.includes('Thank-you bonus') && /is the hero of the hotel/.test(done) && /Medal: Cool head/.test(done), 'finishing a crisis pays a bonus, names a hero and shows the medals');
    await page.click('.modal [data-act="heroCert"]'); await page.waitForTimeout(250);
    assert(/hero of the hotel/i.test(await page.locator('.confcard').innerText()) && await page.evaluate(() => (document.querySelector('.confcard .conf-title').innerText) === S.heroLog[0].name), 'the hero gets a certificate');
    await page.evaluate(() => closeModal());
    assert(await page.locator('.crisis-btn').count() === 0 && await page.locator('.crisis-card').count() === 0 && (await page.locator('.content').innerText()).includes('Nothing is wrong right now'), 'and the crisis is gone');
    assert(await page.locator('.medal.won').count() >= 3 && (await page.locator('.content').innerText()).includes('Perks') && await page.locator('.medal').count() === 18, 'the medals page shows eighteen medals and the perks they unlock');
    assert(await page.locator('.section-title:has-text("Heroes of the hotel") + .card [data-act="heroCert"]').count() === 1, 'heroes are listed');
    await page.evaluate(() => { ui.staffTab = 'people'; actions.nav({ view: 'staff' }); });
    assert(await page.locator('.card:has-text("Hero") .chip.warn:text-is("Hero")').count() >= 1, 'a hero shows a Hero badge in the team list'); await page.evaluate(() => { ui.staffTab = 'shift'; });
    // preparing for a warning
    await page.evaluate(() => { S.crises = []; S.crisisLast = -99; S.warning = null; S.staff.forEach(x => { x.used = 0; }); startWarning('roof'); S.warning.seen = true; ui.view = 'dashboard'; render(); });
    assert(await page.locator('.warn-card:has-text("Storm damage may be coming")').count() === 1 && await page.locator('.crisis-btn:has-text("Warning")').count() === 1, 'a warning shows on the Dashboard and in the header');
    await page.evaluate(() => { actions.nav({ view: 'crisis' }); });
    assert(await page.locator('.warn-card .card.stack').count() === 2 && (await page.locator('.warn-card').innerText()).includes('Two preparations stop it completely'), 'the Crisis page offers two preparations');
    const cashW = await page.evaluate(() => S.money);
    await page.click('.warn-card [data-act="prepAct"][data-key="tarpaulin"]');
    assert(await page.evaluate(c => S.warning.points === 1 && S.money === c - 40, cashW) && (await page.locator('.warn-card').innerText()).includes('1 of 2'), 'a preparation costs what it says and counts');
    await page.click('.warn-card .pick[data-act="prepAct"][data-key="tiles"] >> nth=0');
    assert(await page.evaluate(() => S.warning.points === 2), 'a second preparation completes it');
    const cashP = await page.evaluate(() => S.money);
    await page.evaluate(() => { S.day = S.warning.due; rollCrises(); render(); });
    assert(await page.evaluate(() => S.warning === null && S.crises.length === 0 && S.medals.sharpeyes !== undefined) && await page.evaluate(c => S.money > c, cashP) && (await page.locator('#toasts').innerText()).includes('Medal won: Sharp eyes'), 'two preparations stop the crisis, with a bonus and a medal');
    await page.evaluate(() => { S.day -= 1; S.day += 1; });
    // safeguards
    await page.evaluate(() => { actions.nav({ view: 'crisis' }); });
    const cashG = await page.evaluate(() => S.money);
    await page.click('[data-act="buyGuard"][data-key="pipe"]');
    assert(await page.evaluate(c => hasGuard('pipe') && S.money === c - SAFEGUARDS.pipe.cost, cashG) && await page.locator('.card:has-text("Plumbing check-up") .chip:has-text("Owned")').count() === 1, 'a safeguard can be bought once');
    // crisis actions are live: locked while Management is offline
    await page.evaluate(() => { ui.modal = null; S.incidents = []; S.guests.forEach(g => { g.left = Math.max(g.left, 3); }); S.standards.next = S.day; S.standards.score = 95; actions.endDay(); });
    await page.waitForTimeout(400);
    assert((await page.locator('.modal').innerText()).includes('Star Inspector: Excellent'), 'the inspector\'s verdict is in the day report');
    await page.evaluate(() => closeModal());
    await page.evaluate(() => { S.crises = []; S.crisisLast = -99; startCrisis('power', false); S.crises[0].seen = true; actions.nav({ view: 'crisis' }); });
    const trouble0 = await page.evaluate(() => S.crises[0].trouble);
    await page.click('.crisis-card [data-act="crisisPlay"][data-key="phone"]');
    assert((await page.locator('#toasts').innerText()).includes('Management is offline') && await page.evaluate(t => S.crises[0].trouble === t && !S.crises[0].acted.phone && ui.game === null, trouble0), 'crisis actions and games are locked while Management is offline');
    await page.evaluate(() => { S.crises = []; ui.view = 'dashboard'; render(); });
    await goLive(page);
    // artwork behind the games, served by the test: scenes, a set of pictures that follow the marker, and transparent patches
    const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const tinyWebp = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');   // a real 1-pixel WebP
    const putArt = f => { fs.mkdirSync(gamesDir, { recursive: true }); fs.writeFileSync(path.join(gamesDir, f), f.endsWith('.webp') ? tinyWebp : tinyPng); tmpArt.push(f); };
    const dropArt = f => { try { fs.unlinkSync(path.join(gamesDir, f)); } catch (e) { /* already gone */ } };
    const cleanArt = () => tmpArt.forEach(dropArt);
    ['pipe-valve-bg.jpg', 'pipe-valve-f1.webp', 'pipe-valve-f2.webp', 'pipe-valve-f3.webp', 'pipe-valve-f4.webp', 'pipe-valve-f5.webp', 'pipe-dry-bg.jpg', 'patch-wet.webp', 'pipe-plumber-bg.jpg'].forEach(putArt);
    await page.evaluate(() => { ui.modal = null; S.crises = []; S.crisisLast = -99; S.warning = null; S.rooms.forEach(r => { r.damaged = false; }); S.staff.forEach(x => { x.used = 0; x.trait = 'Always on time'; }); startCrisis('pipe', false); S.crises[0].seen = true; actions.nav({ view: 'crisis' }); });
    await page.click('.crisis-card .pick[data-key="valve"] >> nth=0'); await page.waitForTimeout(400);
    assert(await page.locator('.modal .gstage .gbg').count() === 1 && await page.locator('.modal .gframe').count() === 5 && await page.locator('.modal .gframe.on').count() === 1, 'a timing game draws its scene and only the pictures that exist, one showing at a time');
    assert(await page.evaluate(() => ui.game.spec.center === 0.5), 'with pictures, the middle of the sweep is the target');
    await page.evaluate(() => { ui.game.frozen = true; ui.game.pos = 0; });
    await page.waitForTimeout(150);
    const first = await page.evaluate(() => [...document.querySelectorAll('.gframe')].findIndex(f => f.classList.contains('on')));
    await page.evaluate(() => { ui.game.pos = 1; });
    await page.waitForTimeout(150);
    const last = await page.evaluate(() => [...document.querySelectorAll('.gframe')].findIndex(f => f.classList.contains('on')));
    await page.evaluate(() => { ui.game.pos = 0.5; });
    await page.waitForTimeout(150);
    const mid = await page.evaluate(() => [...document.querySelectorAll('.gframe')].findIndex(f => f.classList.contains('on')));
    assert(first === 0 && last === 4 && mid === 2, 'the picture follows the marker, from the first to the last, with the middle one in the middle');
    await page.click('.modal [data-act="tgStop"]'); await page.waitForTimeout(250);
    assert(await page.evaluate(() => ui.game === null && S.crises[0].acted.valve === S.day), 'and the game still finishes as usual');
    await page.evaluate(() => { S.staff.forEach(x => { x.used = 0; }); render(); });
    await page.click('.crisis-card .pick[data-key="dry"] >> nth=0'); await page.waitForTimeout(400);
    assert(await page.locator('.modal .tapstage .patch.art .patchimg').count() === 6 && await page.locator('.modal .tapstage .gbg').count() === 1, 'a tapping game puts transparent patches on its scene');
    await page.evaluate(() => { ui.game.frozen = true; });
    for (let i = 0; i < 60; i++) await page.click('.modal .tapstage .patch >> nth=0');
    await page.waitForTimeout(250);
    assert(await page.evaluate(() => ui.game === null && S.crises[0].acted.dry === S.day), 'tapping them finishes the game');
    assert(await page.evaluate(() => S.gameStats.tap && S.gameStats.tap.plays >= 1 && S.gameStats.tap.wins >= 1 && S.gameStats.tap.n >= 1 && S.gameStats.timing && S.gameStats.timing.plays >= 1 && S.gameStats.timing.n >= 1), 'playing the games is counted (tapping speed and timing accuracy)');
    await page.evaluate(() => { actions.nav({ view: 'crisis' }); });
    const gs = await page.locator('.content').innerText();
    assert(/How the games are going/.test(gs) && /Tapping game/.test(gs) && /taps a second on average/.test(gs) && /ms from the middle on average/.test(gs), 'the Crisis page shows how the games are going');
    // the maths game, played through the real screen: a right answer, a wrong one, and running out of time
    await page.evaluate(() => { S.unlocked.push('pool'); S.crises = []; S.crisisLast = -99; S.warning = null; S.rooms.forEach(r => { r.damaged = false; }); S.staff.forEach(x => { x.used = 0; x.trait = 'Always on time'; x.skill = 3; }); S.money = 50000; startCrisis('pool', false); S.crises[0].seen = true; S.crises[0].skipNight = false; S.guests.forEach(g => { g.happiness = 50; }); actions.nav({ view: 'crisis' }); });
    assert(await page.locator('.crisis-card [data-act="crisisPlay"][data-key="lollies"]').count() === 1 && (await page.locator('.crisis-card').innerText()).includes('Maths game'), 'a number-based action says it is a maths game');
    const t0 = await page.evaluate(() => S.crises[0].trouble), mood0 = await page.evaluate(() => S.guests.length ? S.guests[0].happiness : 0);
    await page.click('.crisis-card [data-act="crisisPlay"][data-key="lollies"]'); await page.waitForTimeout(400);
    assert(await page.locator('.modal .chip:text-is("Maths game")').count() === 1 && await page.locator('.modal [data-act="gameChoice"]').count() === 4 && (await page.locator('.modal #tapTime').innerText()).includes('seconds left'), 'the maths game shows a question, four answers and a clock');
    const promptA = await page.evaluate(() => ui.game.spec.prompt); await page.click('.modal [data-act="crisisCancel"]'); await page.waitForTimeout(150);
    await page.click('.crisis-card [data-act="crisisPlay"][data-key="lollies"]'); await page.waitForTimeout(400);
    assert(await page.evaluate(p => ui.game.spec.prompt === p, promptA), 'closing and reopening a game gives the same question, so it cannot be re-rolled');
    await page.evaluate(() => { ui.game.left = ui.game.spec.seconds; });
    const rightIdx = await page.evaluate(() => ui.game.spec.options.findIndex(o => o.correct));
    await page.click(`.modal [data-act="gameChoice"][data-i="${rightIdx}"]`); await page.waitForTimeout(200);
    assert((await page.locator('.modal').innerText()).includes('The right answer') && (await page.locator('.modal').innerText()).includes('The working:') && await page.locator('.modal [data-act="gameDone"]').count() === 1, 'a right answer is marked and the working is shown');
    assert(await page.locator('.modal [data-act="crisisSkip"]').count() === 0 && await page.locator('.modal [data-act="crisisCancel"]').count() === 0, 'once an answer is picked there is only Continue, so a bad result cannot be swapped for the dice');
    await page.click('.modal [data-act="gameDone"]'); await page.waitForTimeout(300);
    assert(await page.evaluate(([t0]) => ui.game === null && S.crises[0].acted.lollies === S.day && S.crises[0].trouble < t0, [t0]), 'a right answer finishes the game and eases Trouble');
    await page.evaluate(() => { S.crises[0].acted = {}; S.staff.forEach(x => { x.used = 0; }); render(); });
    const t1 = await page.evaluate(() => S.crises[0].trouble);
    await page.click('.crisis-card [data-act="crisisPlay"][data-key="lollies"]'); await page.waitForTimeout(400);
    const wrongIdx = await page.evaluate(() => ui.game.spec.options.findIndex(o => !o.correct));
    await page.click(`.modal [data-act="gameChoice"][data-i="${wrongIdx}"]`); await page.waitForTimeout(200);
    assert((await page.locator('.modal').innerText()).includes('Not quite') && (await page.locator('.modal').innerText()).includes('The right answer') && (await page.locator('.modal').innerText()).includes('The working:'), 'a wrong answer shows the right one and the working');
    await page.click('.modal [data-act="gameDone"]'); await page.waitForTimeout(300);
    assert(await page.evaluate(([t1]) => S.crises[0].trouble === t1 + CRISES.pool.actions.find(a => a.key === 'lollies').risk, [t1]), 'a wrong answer costs a little Trouble');
    await page.evaluate(() => { S.crises[0].acted = {}; S.staff.forEach(x => { x.used = 0; }); render(); });
    const t2 = await page.evaluate(() => S.crises[0].trouble);
    await page.click('.crisis-card [data-act="crisisPlay"][data-key="lollies"]'); await page.waitForTimeout(400);
    await page.evaluate(() => { ui.game.left = 0.2; }); await page.waitForTimeout(700);
    assert(await page.evaluate(([t2]) => ui.game === null && S.crises[0].trouble > t2 && S.gameStats.maths.plays >= 3, [t2]), 'running out of time counts as a wrong answer');
    assert(await page.evaluate(() => S.gameStats.maths.plays === 3 && S.gameStats.maths.wins === 1 && S.gameStats.maths.n === 3), 'the maths games are counted');
    await page.evaluate(() => { S.crises = []; S.crisisLast = -99; S.warning = null; S.rooms.forEach(r => { r.damaged = false; }); S.staff.forEach(x => { x.used = 0; }); startCrisis('pipe', false); S.crises[0].seen = true; actions.nav({ view: 'crisis' }); });   // back to the burst pipe for the checks that follow
    await page.click('.crisis-card [data-act="crisisPlay"][data-key="plumber"]'); await page.waitForTimeout(400);
    assert(await page.locator('.modal .gstage.banner .gbg').count() === 1, 'a word game shows its picture as a banner');
    await page.click('.modal [data-act="crisisCancel"]'); await page.waitForTimeout(150);
    await page.evaluate(() => { S.crises = []; S.crisisLast = -99; S.rooms.forEach(r => { r.damaged = false; }); S.staff.forEach(x => { x.used = 0; }); startCrisis('mice', false); S.crises[0].seen = true; actions.nav({ view: 'crisis' }); });
    await page.click('.crisis-card .pick[data-key="clean"] >> nth=0'); await page.waitForTimeout(400);   // no pictures were made for this one
    assert(await page.locator('.modal .gstage').count() === 0 && await page.locator('.modal .patches .patch').count() === 6 && await page.locator('.modal .patchimg').count() === 0, 'with no artwork the games draw plainly, exactly as before');
    await page.click('.modal [data-act="crisisCancel"]'); await page.waitForTimeout(150);
    cleanArt();
    await page.evaluate(() => { S.crises = []; S.rooms.forEach(r => { r.damaged = false; }); render(); });
    // the odds on an ordinary repair
    await page.evaluate(() => {
      ui.modal = null; if (!S.assets.some(a => a.key === 'boiler')) S.assets.push({ key: 'boiler', cond: 20, broken: false });
      S.assets.find(a => a.key === 'boiler').broken = true; S.incidents = []; const inc = pushIncident(SCEN['boiler-breakdown'], { assetKey: 'boiler' }); openModal({ type: 'incident', id: inc.id });
    });
    assert(await page.locator('.opt:has-text("repair it") .chip:has-text("% chance")').count() === 1, 'repairing it in-house shows the chance it will work');
    await page.evaluate(() => { S.incidents = []; closeModal(); });
    for (const [w, h] of [[390, 844], [820, 1180]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => { S.crises = []; S.warning = null; S.crisisLast = -99; S.staff.forEach(x => { x.used = 0; }); startCrisis('mice', false); S.crises[0].seen = true; });
      for (const v of ['dashboard', 'crisis']) { await page.evaluate(vw => { ui.view = vw; render(); window.scrollTo(0, 0); }, v); assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `no sideways scroll on ${v} with a crisis at ${w} wide`); }
      await page.click('.crisis-card [data-act="crisisPlay"][data-key="pest"]'); await page.waitForTimeout(250);
      assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) && !(await page.evaluate(() => { const m = document.querySelector('.modal'); return m.scrollWidth > m.clientWidth + 1; })), `a game pop-up fits at ${w} wide`);
      await page.click('.modal [data-act="crisisCancel"]'); await page.waitForTimeout(150);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { S.crises = []; S.warning = null; S.rooms.forEach(r => { r.damaged = false; }); render(); });

    // ---- the children's menu ----
    await page.evaluate(() => { ui.modal = null; S.unlocked.push('restaurant'); ui.view = 'events'; ui.eventTab = 'menu'; render(); });
    assert(await page.locator('.card:has-text("Children\'s menu")').count() === 1 && await page.locator('[data-act="addKidsMenu"]:has-text("(10)")').count() === 1, 'the menu offers the children\'s dishes');
    await page.click('[data-act="addKidsMenu"]');
    assert(await page.evaluate(() => S.menu.filter(d => d.kids).length) === 10 && await page.locator('.card.flush').count() === 20 && await page.locator('.chip:has-text("Children")').count() >= 10, 'adding them puts ten children\'s dishes on the menu');
    assert(await page.locator('[data-act="addKidsMenu"]').count() === 0 && await page.locator('.card:has-text("Children\'s menu") .chip.good:has-text("Added")').count() === 1, 'and the offer is replaced by "Added"');
    await page.click('[data-act="addDish"]'); await page.waitForTimeout(400);
    await page.fill('#d-n', 'Dino bites'); await page.fill('#d-p', '5'); await page.check('input[name="kids"]');
    assert((await page.locator('#dishPreview').innerText()).includes('fair price'), 'the dish form shows a fair price');
    await page.click('#dishForm button[type=submit]');
    assert(await page.evaluate(() => S.menu.some(d => d.name === 'Dino bites' && d.kids === true)), 'a dish of your own can be marked as a children\'s dish');
    await ctx2.close();
  }

  assert(errors.length === 0, 'no console or page errors ' + JSON.stringify(errors));
  await browser.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : '\nALL UI CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})();
