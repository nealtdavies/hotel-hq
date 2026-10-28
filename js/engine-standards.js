'use strict';
/* ================= Hotel standards and inspections (no DOM access) =================
   Standards is a score out of 100 for how well the hotel is looked after, worked out from three things: how many rooms are clean and in
   service (cleanliness), how worn or broken the equipment is (equipment), and how many complaints and requests are waiting (guest care).
   It moves a little each evening towards what those three say, so one good day does not fix a bad week. Every so often an inspector visits,
   with two days' warning, and the score on the evening of the visit decides the result. A high score also makes crises rarer. */

const STANDARDS = { start: 75, drift: 0.3, firstVisit: [12, 18], gap: [12, 20], notice: 2,
  tiers: [[80, 'Excellent'], [60, 'Good'], [45, 'Needs work'], [0, 'Failed']], reward: { Excellent: 150, Good: 60 }, fine: 120 };

function newStandards() { return { score: STANDARDS.start, parts: { clean: 100, kit: 100, care: 100 }, next: null, noticed: false, last: null }; }
/* New games and older saves. `d` is the state being filled in. */
function ensureStandards(d) {
  d = d || S;
  const base = newStandards();
  if (!d.standards || typeof d.standards !== 'object' || !Number.isFinite(d.standards.score) || !d.standards.parts) d.standards = base;
  for (const k of ['clean', 'kit', 'care']) if (!Number.isFinite(d.standards.parts[k])) d.standards.parts[k] = 100;
  if (d.standards.next === undefined || (d.standards.next !== null && !Number.isInteger(d.standards.next))) d.standards.next = null;
  if (typeof d.standards.noticed !== 'boolean') d.standards.noticed = false;
  if (d.standards.next === null) d.standards.next = (d.day || 0) + rndRange(STANDARDS.firstVisit[0], STANDARDS.firstVisit[1]);
}

/* What the hotel looks like right now, each part from 0 to 100. */
function standardsParts() {
  const rooms = S.rooms.length || 1, away = S.rooms.filter(r => r.dirty || r.damaged).length;
  const clean = Math.round(100 * (1 - away / rooms));
  const kit = S.assets.length ? Math.round(S.assets.reduce((a, x) => a + (x.broken ? 0 : x.cond), 0) / S.assets.length) : 100;
  const care = clamp(100 - 12 * S.jobs.filter(j => j.type === 'complaint').length - 4 * S.jobs.filter(j => j.type === 'request').length, 0, 100);
  return { clean: clamp(clean, 0, 100), kit: clamp(kit, 0, 100), care };
}
const standardsTarget = p => Math.round(0.4 * p.clean + 0.35 * p.kit + 0.25 * p.care);
const standardsWord = score => STANDARDS.tiers.find(t => score >= t[0])[1];

/* Called each evening: the score moves towards the three parts. */
function updateStandards() {
  const st = S.standards, p = standardsParts();
  st.parts = p;
  st.score = clamp(Math.round(st.score * (1 - STANDARDS.drift) + standardsTarget(p) * STANDARDS.drift), 0, 100);
  return st.score;
}
/* A crisis, a win or a failure nudges the score directly. */
function nudgeStandards(d) { S.standards.score = clamp(S.standards.score + d, 0, 100); }
/* Crises are rarer in a well-kept hotel and commoner in a neglected one. */
const crisisChanceFactor = () => { const s = S.standards.score; return s >= 80 ? 0.5 : s >= 60 ? 1 : s >= 45 ? 1.5 : 2.2; };

/* The week of the inspector. Called each morning: the warning goes out two days before. */
function inspectionNotice() {
  const st = S.standards;
  if (st.noticed || S.day !== st.next - STANDARDS.notice) return false;
  st.noticed = true;
  announce(`The Star Inspector will visit in ${STANDARDS.notice} days. Clean, service and fix before then.`, { role: 'Manager', subject: 'The Star Inspector is coming', kind: 'inspection', urgent: true });
  return true;
}
const inspectionDays = () => S.standards.next - S.day;

/* The evening of the visit. Returns null on other days, otherwise { result, score, parts, money, text }. */
function runInspection(events) {
  const st = S.standards;
  if (S.day !== st.next) return null;
  const score = st.score, result = standardsWord(score), mult = 0.6 + 0.4 * S.tier;
  let money = 0, text;
  if (result === 'Excellent') { money = Math.round(STANDARDS.reward.Excellent * mult); bonus(money, 'Star Inspector: excellent'); S.guests.forEach(g => { g.happiness = clamp(g.happiness + 5, 0, 100); }); text = 'The inspector was delighted. A glowing report is on its way, and your guests heard about it.'; }
  else if (result === 'Good') { money = Math.round(STANDARDS.reward.Good * mult); bonus(money, 'Star Inspector: good'); text = 'A good report. The inspector left a few small suggestions.'; }
  else if (result === 'Needs work') text = 'The inspector found things that need putting right and will come back. No fine this time.';
  else { money = -Math.round(STANDARDS.fine * mult); spend(-money, 'Star Inspector: fine'); S.guests.forEach(g => { g.happiness = clamp(g.happiness - 8, 0, 100); }); text = 'The inspector was not happy. There is a fine, and word got round.'; }
  const out = { result, score, parts: Object.assign({}, st.parts), money, text, day: S.day };
  st.last = out;
  st.next = S.day + rndRange(STANDARDS.gap[0], STANDARDS.gap[1]);
  st.noticed = false;
  S.stats.inspections = (S.stats.inspections || 0) + 1;
  if (result === 'Excellent') { S.stats.excellent = (S.stats.excellent || 0) + 1; if (S.stats.excellent >= 2) awardMedal('favourite'); }
  events.push({ text: `Star Inspector: ${result} (standards ${score}).${money > 0 ? ` Reward £${money}.` : money < 0 ? ` Fine £${-money}.` : ''}` });
  postMail({ role: 'Manager', subject: `Star Inspector report: ${result}`, body: `${text} Standards on the day: ${score} out of 100.`, kind: 'inspection', urgent: result === 'Failed' });
  return out;
}
