'use strict';

/* ================= Contractors (no DOM access) =================
   Loaded after engine-extra.js. A work order sends a firm to repair or service a room or piece of equipment.
   Repairs take days, during which the target stays out of use. Quality is hidden: a poor job looks fixed but fails again later. */

const firmDef = key => FIRMS.find(f => f.key === key);
const firmRecord = key => S.firms.find(f => f.key === key);
const workFor = (target, key) => S.works.find(w => w.target === target && String(w.key) === String(key)) || null;
const roomUnderWork = room => workFor('room', room.id);

function newFirmRecords() {
  // Real quality varies a little from game to game, and the advertised rating may not match it.
  return FIRMS.map(f => ({ key: f.key, rating: f.allSpecialist ? f.rating : clamp(f.rating + pick([-1, 0, 0, 0, 1]), 1, 5), jobs: 0, ok: 0, problems: 0 }));
}

/* ---------- Quotes ---------- */
const tradeOf = spec => spec.target === 'room' ? 'building' : ASSET_TRADE[spec.key];
function specTarget(spec) { return spec.target === 'room' ? roomById(Number(spec.key)) : assetByKey(spec.key); }
function specLabel(spec) {
  if (spec.target === 'room') return `${spec.kind === 'service' ? 'Service' : 'Repair'}: ${(roomById(Number(spec.key)) || {}).name}`;
  return `${spec.kind === 'service' ? 'Service' : 'Repair'}: ${ASSET_DEFS[spec.key].name}`;
}
function baseCostOf(spec) {
  if (spec.kind === 'service') return ASSET_DEFS[spec.key].service;
  return spec.target === 'room' ? (roomById(Number(spec.key)).repairCost || 150) : ASSET_DEFS[spec.key].repair;
}
function baseDaysOf(spec) {
  if (spec.kind === 'service') return 1;
  if (spec.target === 'room') return clamp(2 + Math.floor((roomById(Number(spec.key)).repairCost || 150) / 200), 2, 7);
  return ASSET_REPAIR_DAYS[spec.key];
}
function firmCan(def, trade) {
  if (def.allSpecialist) return true;
  if (def.trades.length) return def.trades.includes(trade);
  return trade !== 'lift' || !!def.lift;
}
const isSpecialist = (def, trade) => !!def.allSpecialist || def.trades.includes(trade);
/* What a firm would charge and how long it would take. { can:false } when the firm does not do this kind of work. */
function quoteFor(firmKey, spec) {
  const def = firmDef(firmKey), trade = tradeOf(spec);
  if (!def || !specTarget(spec) || !firmCan(def, trade)) return { can: false };
  const specialist = isSpecialist(def, trade);
  const base = baseCostOf(spec), baseDays = baseDaysOf(spec);
  const price = Math.round(base * def.price * (specialist ? 0.9 : 1)) + (spec.kind === 'service' ? Math.round(def.callout / 2) : def.callout);
  const days = def.speed === 0 ? (baseDays <= 2 ? 0 : 1) : Math.max(1, Math.round(baseDays * def.speed));
  return { can: true, price, days, specialist, trade, warranty: def.warranty, advertised: def.advertised, firm: def };
}
function allQuotes(spec) { return FIRMS.map(f => Object.assign({ key: f.key }, quoteFor(f.key, spec))); }

/* ---------- Ordering and completing work ---------- */
function validateSpec(spec) {
  const t = specTarget(spec);
  if (!t) return 'That job no longer exists.';
  if (workFor(spec.target, spec.key)) return 'A contractor is already working on that.';
  if (spec.kind === 'repair' && (spec.target === 'room' ? !t.damaged : !t.broken)) return 'There is nothing to repair.';
  if (spec.kind === 'service' && (spec.target === 'room' || t.broken)) return 'That cannot be serviced now.';
  return null;
}
/* spec: { kind: 'repair' | 'service', target: 'asset' | 'room', key, free? }. opts.engineer names the tradesperson (drawn from the name lists when omitted).
   Returns { ok, error, work, done, text }. */
function orderWork(spec, firmKey, opts) {
  const err = validateSpec(spec);
  if (err) return { ok: false, error: err };
  if (!firmDef(firmKey)) return { ok: false, error: 'That contractor does not exist.' };
  const q = quoteFor(firmKey, spec);
  if (!q.can) return { ok: false, error: `${firmDef(firmKey).name} does not do ${TRADE_NAMES[q.trade || tradeOf(spec)] || 'that'} work.` };
  const price = spec.free ? 0 : q.price;
  if (price && !canAfford(price)) return { ok: false, error: 'Not enough cash for that quote.' };
  const late = chance(firmDef(firmKey).late) ? rndRange(1, 3) : 0;
  const w = { id: nid(), kind: spec.kind, target: spec.target, key: String(spec.key), firm: firmKey, orderDay: S.day, eta: S.day + q.days, doneDay: S.day + q.days + late, price, free: !!spec.free, label: specLabel(spec), engineer: (opts && opts.engineer) || drawPerson().name, lateTold: false };
  S.works.push(w);
  ensureJobs();   // the repair task disappears while the contractor is on site
  if (w.doneDay <= S.day) { const r = completeWork(w); ensureJobs(); return { ok: true, work: w, done: true, text: r.text, outcome: r.outcome }; }
  return { ok: true, work: w, done: false, text: `${w.engineer} from ${firmDef(firmKey).name} will be done ${w.eta === S.day ? 'today' : `around ${dayLabel(w.eta)}`}.` };
}
function outcomeOdds(rating) {
  const r = clamp(rating, 1, 5), lo = Math.floor(r), hi = Math.ceil(r), t = r - lo;
  return OUTCOME_ODDS[lo].map((p, i) => p + (OUTCOME_ODDS[hi][i] - p) * t);
}
function rollOutcome(rating) {
  let x = Math.random();
  const names = ['great', 'good', 'poor', 'bad'], odds = outcomeOdds(rating);
  for (let i = 0; i < 4; i++) { x -= odds[i]; if (x <= 0) return names[i]; }
  return 'good';
}
function completeWork(w) {
  S.works = S.works.filter(x => x !== w);
  const def = firmDef(w.firm), rec = firmRecord(w.firm);
  const target = w.target === 'room' ? roomById(Number(w.key)) : assetByKey(w.key);
  if (!target) return { outcome: 'cancelled', text: 'The job was cancelled.' };
  const rating = clamp(rec.rating + (isSpecialist(def, tradeOf(w)) ? SPECIALIST_BONUS : 0), 1, 5);
  const outcome = rollOutcome(rating);
  const cost = w.free ? 0 : outcome === 'bad' ? Math.round(w.price * FAILED_PAY_SHARE) : w.price;
  if (cost) spend(cost, `Contractor: ${def.name}, ${w.label}`);
  rec.jobs++;
  if (outcome === 'great' || outcome === 'good') rec.ok++;
  if (outcome === 'bad') rec.problems++;
  const name = w.target === 'room' ? target.name : ASSET_DEFS[target.key].name.toLowerCase();
  if (w.kind === 'service') {
    if (outcome !== 'bad') tally('services');
    if (outcome === 'great') target.cond = 100;
    else if (outcome === 'good') target.cond = Math.max(target.cond, 90);
    else if (outcome === 'poor') target.cond = Math.max(target.cond, 70);
    else target.cond = Math.min(100, target.cond + 10);
    return { outcome, text: outcome === 'bad' ? `${w.engineer} from ${def.name} did a sloppy service and barely improved the ${name}.` : `${w.engineer} from ${def.name} serviced the ${name}.` };
  }
  if (outcome === 'bad') return { outcome, text: `${w.engineer} from ${def.name} could not fix the ${name} and charged a ${money(cost)} call-out fee. It is still out of action.` };
  if (w.target === 'room') fixRoom(target); else fixAsset(target, outcome === 'great');
  target.warranty = def.warranty ? { firm: w.firm, until: S.day + def.warranty } : null;
  if (outcome === 'poor') target.defect = { at: S.day + rndRange(1, 7), firm: w.firm };
  return { outcome, text: `${w.engineer} from ${def.name} finished work on the ${name}.${w.free ? ' (Warranty visit, no charge.)' : ''}` };
}

/* ---------- Morning processing ---------- */
function defectFires(target, isRoom) {
  const d = target.defect;
  target.defect = null;
  const def = firmDef(d.firm);
  const covered = !!(target.warranty && target.warranty.firm === d.firm && target.warranty.until >= S.day);
  const rec = firmRecord(d.firm);
  rec.problems++;
  if (isRoom) {
    if (target.damaged) return;
    target.damaged = true; target.repairCost = 150; target.damageKind = 'trashed';
    const g = target.guestId ? guestById(target.guestId) : null;
    if (g) g.happiness = clamp(g.happiness - 10, 0, 100);
    announce(`The repair in ${target.name} by ${def.name} has failed. The room is out of use again.`, { role: 'Maintenance', subject: `The repair in ${target.name} has failed`, urgent: true, kind: 'contractor' });
    if (covered) { const r = orderWork({ kind: 'repair', target: 'room', key: target.id, free: true }, d.firm); if (r.ok) S.news.push(`${def.name} will come back under warranty at no charge.`); }
    return;
  }
  if (target.broken) return;
  target.broken = true;
  announce(`The ${ASSET_DEFS[target.key].name.toLowerCase()} has broken again. ${def.name}'s repair did not last.`, { role: 'Maintenance', subject: `The ${ASSET_DEFS[target.key].name.toLowerCase()} has broken again`, urgent: true, kind: 'contractor' });
  if (covered) { const r = orderWork({ kind: 'repair', target: 'asset', key: target.key, free: true }, d.firm); if (r.ok) S.news.push(`${def.name} will come back under warranty at no charge.`); }
  else {
    // not covered: it is the manager's problem again, with the usual breakdown decision
    const sc = SCEN[pick(ASSET_DEFS[target.key].fail)];
    if (sc && !S.incidents.some(i => i.b.assetKey === target.key) && S.incidents.length < maxPendingIncidents()) pushIncident(sc, { assetKey: target.key });
  }
}
function processContractors() {
  for (const w of [...S.works]) {
    if (w.doneDay <= S.day) {
      const r = completeWork(w);
      announce(r.text, { role: 'Maintenance', subject: `${w.engineer} has finished: ${w.label}`, kind: 'contractor' });
    } else if (!w.lateTold && S.day > w.eta) {
      w.lateTold = true;
      announce(`${w.engineer} from ${firmDef(w.firm).name} is running late on "${w.label}". They now expect to finish around ${dayLabel(w.doneDay)}.`, { role: 'Maintenance', subject: `${firmDef(w.firm).name} is running late`, kind: 'contractor' });
    }
  }
  for (const a of S.assets) if (a.defect && a.defect.at <= S.day) defectFires(a, false);
  for (const r of S.rooms) if (r.defect && r.defect.at <= S.day) defectFires(r, true);
}
