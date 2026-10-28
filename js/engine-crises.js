'use strict';
/* ================= Crises: the big problems that last for days (no DOM access) =================
   An ordinary incident is settled in one choice. A crisis is not. It has two meters: Trouble, which grows every night and blows up the
   crisis at 100, and Progress, which the player builds up with actions until it reaches 100. Each action costs something real (cash, and
   jobs from the people on duty, which are also needed for the day's ordinary work) and the risky ones may fail, with the chance shown
   and better for a more experienced person. While a crisis lasts it can put rooms out of service, close the restaurant, upset guests
   and hurt reviews. Handled well it pays a reward; left to blow up it costs a fine, goodwill and standards.
   Nothing here injures anyone: these are mishaps with pipes, power, pests, weather and online gossip.
   S.crises is the list of live ones (at most CRISIS.maxActive). S.crisisLast is the day the last one began. */

const CRISIS = { minDay: 8, maxActive: 1, cooldown: 6, baseChance: 0.07, escalate: 0.25, startTrouble: 40, resolveBonus: 8 };

const crisisById = id => S.crises.find(c => c.id === id) || null;
const crisisClosed = key => S.crises.some(c => (c.closes || []).includes(key));
const crisisReviewHit = () => S.crises.reduce((a, c) => a + (c.reviewHit || 0), 0);
const crisisScale = () => 0.6 + 0.4 * S.tier;   // rewards and fines grow with the size of the hotel
const roomNamesOf = c => c.roomIds.map(id => (roomById(id) || {}).name).filter(Boolean).join(', ');
const crisisSpareRooms = () => S.rooms.filter(r => !r.guestId && !r.damaged).length;
function crisisMood(d) { for (const g of S.guests) g.happiness = clamp(g.happiness + d, 0, 100); }
/* Puts n of the crisis's damaged rooms back in service for free. */
function crisisRepair(c, n) { let k = 0; for (const id of c.roomIds) { const r = roomById(id); if (r && r.damaged && k < n) { fixRoom(r); k++; } } return k; }

/* Every action: label and hint for the player, what it costs (cost in £, and `jobs` jobs from someone of `role`, a Manager can always stand in),
   its chance of working (`odds`, null when it cannot fail, plus 8 points for each skill star above three), what a success does (`fix` progress,
   `relief` less Trouble) and what a failure does (`risk` more Trouble). `after(c)` is any extra effect of a success. */
const CRISES = {
  pipe: { name: 'Burst pipe', w: 3, rooms: 3, repairCost: 240, growth: 12, mood: 5, fine: 500, reward: 400, reviewText: 'Water through the ceiling and nobody seemed to know what to do.',
    can: () => crisisSpareRooms() >= 4,
    intro: c => `A pipe has burst and water is pouring through the ceiling. ${roomNamesOf(c)} ${c.roomIds.length === 1 ? 'is' : 'are'} out of service, guests are worried, and the water is still running.`,
    actions: [
      { key: 'valve', label: 'Shut off the water', hint: 'Stops it getting worse. The valve can be stiff.', role: 'Maintenance', jobs: 1, odds: 0.85, fix: 20, relief: 15, risk: 10, ok: 'The water is off and the flood has stopped.', bad: 'The valve was stuck fast and the water kept coming.' },
      { key: 'plumber', label: 'Call an emergency plumber', hint: 'Expensive, but they know what they are doing.', cost: 350, odds: 0.9, fix: 35, relief: 20, risk: 5, ok: 'The plumber fixed the pipe properly.', bad: 'The plumber was stuck in traffic and arrived too late to help.' },
      { key: 'dry', label: 'Dry out the rooms', hint: 'Towels, fans and elbow grease. Two jobs for housekeeping.', role: 'Housekeeper', jobs: 2, odds: 0.8, fix: 20, relief: 10, risk: 8, ok: 'The rooms are drying out nicely.', bad: 'The carpets are still soaking.', after: c => crisisRepair(c, 1) },
      { key: 'treat', label: 'Give guests a free treat', hint: 'Hot drinks and cake in the lounge. Cheers everyone up.', cost: 80, odds: null, fix: 0, relief: 8, ok: 'The guests enjoyed the treat and calmed down.', after: () => crisisMood(6) }
    ] },
  power: { name: 'Power cut', w: 3, rooms: 0, closes: ['restaurant'], growth: 14, mood: 4, fine: 400, reward: 300, reviewText: 'The lights went out and the hotel had no plan.',
    can: () => true,
    intro: () => 'The whole hotel has gone dark. The lights, the lifts and the kitchen are off, and guests are feeling their way down the corridors.',
    actions: [
      { key: 'generator', label: 'Start the generator', hint: 'Needs a bit of fuel and a steady hand.', cost: 120, role: 'Maintenance', jobs: 1, odds: 0.7, fix: 35, relief: 20, risk: 10, ok: 'The generator roared into life.', bad: 'It spluttered and died. It needs another go.' },
      { key: 'phone', label: 'Ring the power company', hint: 'Free, but they are very busy.', odds: 0.6, fix: 20, relief: 10, risk: 5, ok: 'They promise an engineer and the power starts to come back.', bad: 'You waited in a queue and got nowhere.' },
      { key: 'candles', label: 'Hand out candles and snacks', hint: 'Housekeeping brings light and biscuits to every floor.', cost: 60, role: 'Housekeeper', jobs: 1, odds: null, fix: 0, relief: 12, ok: 'Guests are cosy and a lot happier.', after: () => crisisMood(8) },
      { key: 'barbecue', label: 'Cook dinner on the barbecue', hint: 'If it works, the restaurant can open tonight.', cost: 150, role: 'Chef', jobs: 1, odds: 0.75, fix: 15, relief: 8, risk: 6, ok: 'Dinner is served by torchlight and everyone loves it.', bad: 'The barbecue would not light.', after: c => { c.closes = []; crisisMood(6); } }
    ] },
  mice: { name: 'Pest scare in the kitchen', w: 2, rooms: 0, closes: ['restaurant'], reviewHit: 1, growth: 11, mood: 3, fine: 450, reward: 350, reviewText: 'Heard there was a pest problem in the kitchen. Not good enough.',
    can: () => hasFacility('restaurant'),
    intro: () => 'A guest has spotted a mouse near the kitchen. The restaurant has to close until it is sorted, and word is getting round.',
    actions: [
      { key: 'clean', label: 'Deep-clean the kitchen', hint: 'Every cupboard and corner. Two jobs for housekeeping.', role: 'Housekeeper', jobs: 2, odds: 0.85, fix: 25, relief: 12, risk: 8, ok: 'The kitchen is spotless.', bad: 'Something was missed and there are signs of a mouse again.' },
      { key: 'pest', label: 'Call pest control', hint: 'The experts. It costs, but it works.', cost: 300, odds: 0.9, fix: 40, relief: 20, risk: 5, ok: 'Pest control found the way in and blocked it up.', bad: 'They could not come until tomorrow.' },
      { key: 'restock', label: 'Throw out and restock the food', hint: 'Better safe than sorry.', cost: 200, odds: null, fix: 10, relief: 10, ok: 'Fresh food is in and the old stock is gone.' },
      { key: 'honest', label: 'Tell guests honestly', hint: 'An honest note on the desk. Stops the bad reviews, and guests respect it.', odds: null, fix: 5, relief: 10, ok: 'Guests appreciated being told the truth.', after: c => { c.reviewHit = 0; crisisMood(3); } }
    ] },
  roof: { name: 'Storm damage', w: 2, rooms: 2, roomType: 'Ocean View', repairCost: 300, growth: 10, mood: 3, fine: 450, reward: 350, reviewText: 'A leaking roof and no real help from the staff.',
    can: () => crisisSpareRooms() >= 4 && ['rain', 'storm'].includes(weatherOn(S.day).kind),
    intro: c => `The storm has lifted some tiles off the roof and rain is coming in. ${roomNamesOf(c)} ${c.roomIds.length === 1 ? 'is' : 'are'} out of service.`,
    actions: [
      { key: 'tarp', label: 'Cover the roof with a tarpaulin', hint: 'Quick and cheap, in the wind and rain.', cost: 90, role: 'Maintenance', jobs: 1, odds: 0.8, fix: 20, relief: 20, risk: 10, ok: 'The tarpaulin is tied down and the rain is kept out.', bad: 'The wind whipped the tarpaulin away.' },
      { key: 'roofer', label: 'Book a roofer', hint: 'Costly, but it fixes the roof properly.', cost: 450, odds: 0.9, fix: 35, relief: 20, risk: 5, ok: 'The roofer replaced the tiles.', bad: 'The roofer could not get up in the weather.' },
      { key: 'dry', label: 'Dry and re-make the rooms', hint: 'Two jobs for housekeeping.', role: 'Housekeeper', jobs: 2, odds: 0.8, fix: 20, relief: 10, risk: 8, ok: 'The rooms are dry and fresh again.', bad: 'It is still damp in there.', after: c => crisisRepair(c, 1) },
      { key: 'move', label: 'Move guests to dry rooms', hint: 'A bit of effort, and the guests are happy to move.', odds: null, fix: 0, relief: 8, ok: 'Everyone is settled in dry rooms.', after: () => crisisMood(4) }
    ] },
  gossip: { name: 'Bad reviews online', w: 2, rooms: 0, reviewHit: 1, growth: 9, mood: 2, fine: 350, reward: 300, reviewText: 'Not what the nasty posts said, but not great either.',
    can: () => S.reviews.length >= 3,
    intro: () => 'Someone has posted a very unfair review about the hotel and it is being shared. New guests are reading it, and reviews are coming in lower.',
    actions: [
      { key: 'reply', label: 'Reply politely to your reviews', hint: 'Kind, careful replies. A skilled receptionist does this much better. Two jobs.', role: 'Receptionist', jobs: 2, odds: 0.75, fix: 25, relief: 15, risk: 8, ok: 'The replies were kind and people noticed.', bad: 'The replies came across badly.' },
      { key: 'tea', label: 'Invite unhappy guests to a free tea', hint: 'Turn grumbles into smiles.', cost: 120, odds: null, fix: 10, relief: 10, ok: 'The tea party went down a treat.', after: () => crisisMood(5) },
      { key: 'ask', label: 'Ask happy guests to write a review', hint: 'It may or may not work, but a glowing review helps a lot.', role: 'Receptionist', jobs: 1, odds: 0.65, fix: 30, relief: 10, risk: 5, ok: 'A guest wrote a lovely review.', bad: 'Nobody got round to it.', after: () => addReview(drawPerson().name, 5, 'Staying here was wonderful, and the staff could not do enough for us.') },
      { key: 'apology', label: 'Post an honest message', hint: 'Explain what really happened. Free, and it takes the sting out.', odds: null, fix: 5, relief: 10, ok: 'People respected the honest message.', after: c => { c.reviewHit = 0; } }
    ] }
};

/* ---------- Starting one ---------- */
function ensureCrises(d) {
  d = d || S;
  if (!Array.isArray(d.crises)) d.crises = [];
  if (!Number.isInteger(d.crisisLast)) d.crisisLast = -99;
  if (!Array.isArray(d.crisisLog)) d.crisisLog = [];
  d.crises = d.crises.filter(c => c && CRISES[c.key] && Number.isFinite(c.trouble) && Number.isFinite(c.fix) && Array.isArray(c.roomIds));
}
const crisisEligible = () => Object.keys(CRISES).filter(k => CRISES[k].can());

/* Begins a crisis. `night` is true when it begins in the evening (from an ignored incident), so tonight's effects are skipped. */
function startCrisis(key, night) {
  const def = CRISES[key];
  if (!def) return null;
  const c = { id: nid(), key, day: S.day, trouble: CRISIS.startTrouble, fix: 0, roomIds: [], closes: (def.closes || []).slice(), reviewHit: def.reviewHit || 0, acted: {}, daysOpen: 0, log: [], skipNight: !!night };
  if (def.rooms) {
    const spare = S.rooms.filter(r => !r.guestId && !r.damaged).sort((a, b) => (b.type === def.roomType) - (a.type === def.roomType) || Math.random() - 0.5);
    for (const r of spare.slice(0, def.rooms)) { r.damaged = true; r.repairCost = def.repairCost; r.damageKind = 'crisis'; c.roomIds.push(r.id); }
  }
  S.crises.push(c);
  S.crisisLast = S.day;
  ensureJobs();
  const text = def.intro(c);
  c.log.push({ day: S.day, text });
  S.news.push(`Crisis: ${def.name}. ${text}`);
  postMail({ role: 'Manager', subject: `Crisis: ${def.name}`, body: `${text} This will get worse every night until it is dealt with. Open Crisis to see what you can do.`, kind: 'crisis', urgent: true });
  S.stats.crises = (S.stats.crises || 0) + 1;
  return c;
}
/* Each morning there is a small chance of a crisis, higher in a neglected hotel and lower in a well-kept one. */
function rollCrises() {
  if (S.day < CRISIS.minDay || S.crises.length >= CRISIS.maxActive || S.day - S.crisisLast < CRISIS.cooldown) return null;
  if (!chance(CRISIS.baseChance * crisisChanceFactor())) return null;
  const keys = crisisEligible();
  if (!keys.length) return null;
  const total = keys.reduce((a, k) => a + CRISES[k].w, 0);
  let x = Math.random() * total, key = keys[0];
  for (const k of keys) { x -= CRISES[k].w; if (x <= 0) { key = k; break; } }
  return startCrisis(key, false);
}
/* An urgent incident that was ignored may grow into a crisis. Returns the line to show, or null. */
function escalateIncident(inc) {
  const sc = SCEN[inc.sid];
  if (!sc || sc.sev !== 'Urgent' || S.day < CRISIS.minDay - 3 || S.crises.length >= CRISIS.maxActive || S.day - S.crisisLast < CRISIS.cooldown || !chance(CRISIS.escalate)) return null;
  const keys = crisisEligible();
  if (!keys.length) return null;
  const c = startCrisis(pick(keys), true);
  return c ? { t: `It has grown into a crisis: ${CRISES[c.key].name}`, kind: 'bad', amt: null } : null;
}

/* ---------- Taking an action ---------- */
const crisisOdds = (a, staff) => a.odds === null || a.odds === undefined ? 1 : clamp(a.odds + (staff ? (staff.skill - 3) * 0.08 : 0), 0.05, 0.97);
const crisisCost = a => a.cost || 0;
/* Everyone who could do the job today: on duty and with enough jobs left. */
const crisisStaffFor = a => a.role ? eligibleForRole(a.role).filter(s => s.used + a.jobs <= STAFF_CAP).sort((x, y) => (y.role === a.role) - (x.role === a.role) || y.skill - x.skill) : [];
/* What the screen needs to know about one action: { ok, reason, cost, staff: [{ s, odds }], odds }. */
function crisisActionState(c, a) {
  let reason = null;
  if (c.acted[a.key] === S.day) reason = 'Done today';
  else if (crisisCost(a) && !canAfford(crisisCost(a))) reason = 'Cannot afford this';
  const staff = crisisStaffFor(a);
  if (!reason && a.role && !staff.length) reason = `No ${a.role.toLowerCase()} free today`;
  return { ok: !reason, reason, cost: crisisCost(a), role: a.role || null, jobs: a.jobs || 0, staff: staff.map(s => ({ s, odds: crisisOdds(a, s) })), odds: a.role ? null : crisisOdds(a, null) };
}
/* Returns { ok, error } or { ok, success, text, resolved, name, reward }. */
function doCrisisAction(id, key, staffId) {
  const c = crisisById(id), def = c && CRISES[c.key], a = def && def.actions.find(x => x.key === key);
  if (!a) return { ok: false, error: 'That crisis has ended.' };
  const st = crisisActionState(c, a);
  if (!st.ok) return { ok: false, error: st.reason };
  let who = null;
  if (a.role) {
    who = st.staff.map(x => x.s).find(s => s.id === Number(staffId));
    if (!who) return { ok: false, error: 'Choose who will do it.' };
    who.used += a.jobs;
    for (let i = 0; i < a.jobs; i++) scheduleWork(who, `${def.name}: ${a.label}`, 'incident');
    S.stats.jobs++; tally('jobs');
  }
  if (a.cost) spend(a.cost, `Crisis: ${a.label}`);
  c.acted[a.key] = S.day;
  const success = Math.random() < crisisOdds(a, who);
  let text;
  if (success) {
    c.fix = clamp(c.fix + (a.fix || 0), 0, 100); c.trouble = clamp(c.trouble - (a.relief || 0), 0, 100);
    if (a.after) a.after(c);
    text = a.ok;
  } else {
    c.trouble = clamp(c.trouble + (a.risk || 0), 0, 100);
    text = a.bad;
  }
  c.log.push({ day: S.day, text: `${a.label}: ${text}` });
  c.log = c.log.slice(-12);
  const out = { ok: true, success, text, name: def.name, resolved: false };
  if (c.fix >= 100) Object.assign(out, resolveCrisis(c));
  return out;
}

/* ---------- The end of a crisis ---------- */
function endCrisis(c, outcome) {
  S.crises = S.crises.filter(x => x !== c);
  S.crisisLast = S.day;
  S.crisisLog.unshift({ key: c.key, name: CRISES[c.key].name, day: c.day, ended: S.day, outcome });
  S.crisisLog = S.crisisLog.slice(0, 12);
}
/* Progress reached 100: the problem is solved, remaining damage is put right, and there is a reward. */
function resolveCrisis(c) {
  const def = CRISES[c.key], reward = Math.round(def.reward * crisisScale());
  crisisRepair(c, c.roomIds.length);
  bonus(reward, `Crisis handled: ${def.name}`);
  crisisMood(CRISIS.resolveBonus);
  nudgeStandards(5);
  endCrisis(c, 'resolved');
  S.stats.crisesSolved = (S.stats.crisesSolved || 0) + 1;
  postMail({ role: 'Manager', subject: `Well handled: ${def.name}`, body: `The crisis is over. Guests noticed how calmly it was dealt with. A thank-you bonus of £${reward} has been paid, and the damage is put right.`, kind: 'crisis' });
  return { resolved: true, reward };
}
/* Trouble reached 100: it blows up. */
function blowUpCrisis(c, events) {
  const def = CRISES[c.key], fine = Math.round(def.fine * crisisScale());
  spend(fine, `Crisis got out of hand: ${def.name}`);
  crisisMood(-15);
  nudgeStandards(-8);
  addReview(drawPerson().name, 2, def.reviewText);
  endCrisis(c, 'blown');
  events.push({ text: `The ${def.name.toLowerCase()} got out of hand. Costs £${fine}, guests are upset and standards fell.` });
  postMail({ role: 'Manager', subject: `Crisis out of hand: ${def.name}`, body: `Nobody got on top of it in time. It cost £${fine}, and word got round. Any damaged rooms still need repairing.`, kind: 'crisis', urgent: true });
}

/* ---------- Every evening ---------- */
/* Guests suffer, Trouble grows, and a crisis that has run away blows up. Adds lines for the day report. */
function runCrises(events) {
  for (const c of [...S.crises]) {
    const def = CRISES[c.key];
    if (c.skipNight) { c.skipNight = false; continue; }
    c.daysOpen++;
    const hit = Math.round(def.mood * (0.5 + c.trouble / 100));
    if (hit && S.guests.length) crisisMood(-hit);
    c.trouble = clamp(c.trouble + def.growth, 0, 100);
    if (c.trouble >= 100) { blowUpCrisis(c, events); continue; }
    events.push({ text: `Crisis, ${def.name}: still going. Trouble ${c.trouble}, progress ${c.fix}.` });
  }
}
