'use strict';

/* ================= Daily and weekly challenges (no DOM access) =================
   Each morning two small daily challenges are set, and on Mondays one bigger weekly one. They are checked as the day ends (the first
   few from how the evening starts, so end-of-day checkouts cannot spoil them) and pay a cash bonus that is not counted as trading profit.
   Doing at least one daily challenge on consecutive days builds a streak, with extra bonuses at 3 and 7 days. */

const challengeReward = () => [100, 200, 400, 800][Math.min(S.tier, 4) - 1];
const byTier = arr => arr[Math.min(S.tier, arr.length) - 1];
const STREAK_BONUS = { 3: 1, 7: 3 };   // streak length: bonus as a multiple of the daily reward

/* `when` (optional): the challenge is only set when this is true, so nobody is given one they have no way to meet. */
/* measure(ctx): { have, need, text }. ctx is the end-of-day snapshot; without it the live state is used. */
const DAILY = [
  { key: 'clean-sweep', name: 'Clean sweep', desc: () => 'Start the evening with no dirty rooms.', measure: ctx => { const d = ctx ? ctx.dirty : S.rooms.filter(r => r.dirty).length; return { have: d === 0 ? 1 : 0, need: 1, text: d ? `${d} dirty room${d > 1 ? 's' : ''}` : 'All clean' }; } },
  { key: 'happy-guests', name: 'Happy guests', desc: () => 'Guests average 70% happy or better this evening.', measure: ctx => { const h = ctx ? ctx.happy : (S.guests.length ? Math.round(S.guests.reduce((a, g) => a + g.happiness, 0) / S.guests.length) : 100); return { have: h, need: 70, text: `${h}% happy` }; } },
  { key: 'busy-team', name: 'Busy team', desc: () => `Your team completes ${byTier([6, 8, 10, 12])} jobs today.`, measure: () => ({ have: S.tally.jobs || 0, need: byTier([6, 8, 10, 12]), text: `${S.tally.jobs || 0} done` }) },
  { key: 'full-books', name: 'Full books', desc: () => `Take ${byTier([4, 6, 8, 10])} bookings today.`, measure: () => ({ have: S.tally.bookings || 0, need: byTier([4, 6, 8, 10]), text: `${S.tally.bookings || 0} taken` }) },
  { key: 'profit-day', name: 'Profit target', desc: () => `Make ${money(byTier([400, 900, 2000, 4000]))} profit today.`, measure: ctx => { const p = ctx ? ctx.profit : ledgerDay(S.day).reduce((a, e) => a + e.amount, 0) + forecastCash(1)[0].net; return { have: Math.round(p), need: byTier([400, 900, 2000, 4000]), text: `${signed(p)} so far` }; } },
  { key: 'everyone-heard', name: 'Everyone heard', desc: () => 'Answer every complaint before the evening.', measure: ctx => { const n = ctx ? ctx.complaints : S.jobs.filter(j => j.type === 'complaint').length; return { have: n === 0 ? 1 : 0, need: 1, text: n ? `${n} waiting` : 'None waiting' }; } },
  { key: 'arcade-day', name: 'Game on', when: () => featureOn('arcade') && S.staff.some(s => s.role === 'Arcade Attendant'), desc: () => `Players have ${byTier([40, 80, 120, 160])} plays in the arcade today.`, measure: () => ({ have: S.tally.arcadePlays || 0, need: byTier([40, 80, 120, 160]), text: `${S.tally.arcadePlays || 0} plays` }) },
  { key: 'club-day', name: 'Busy club', when: () => featureOn('kidsclub') && S.staff.some(s => s.role === 'Kids Club Leader'), desc: () => `${byTier([6, 10, 14, 18])} children enjoy the Kids Club today.`, measure: () => ({ have: S.tally.kidsSessions || 0, need: byTier([6, 10, 14, 18]), text: `${S.tally.kidsSessions || 0} children` }) },
  { key: 'shop-day', name: 'Busy till', when: () => featureOn('shop') && S.staff.some(s => s.role === 'Shop Assistant'), desc: () => `Sell ${byTier([15, 30, 45, 60])} things in the shop today.`, measure: () => ({ have: S.tally.shopItems || 0, need: byTier([15, 30, 45, 60]), text: `${S.tally.shopItems || 0} sold` }) },
  { key: 'trip-day', name: 'Day trippers', when: () => featureOn('excursions') && S.staff.some(s => s.role === 'Excursions Guide'), desc: () => `Sell ${byTier([8, 14, 20, 26])} excursion tickets today.`, measure: () => ({ have: S.tally.tripTickets || 0, need: byTier([8, 14, 20, 26]), text: `${S.tally.tripTickets || 0} tickets` }) },
  { key: 'phone-day', name: 'Answer the phone', desc: () => `Answer ${byTier([2, 2, 3, 4])} calls at the phone desk today.`, measure: () => ({ have: S.tally.calls || 0, need: byTier([2, 2, 3, 4]), text: `${S.tally.calls || 0} answered` }) },
  { key: 'five-star-day', name: 'Five-star day', desc: () => 'Earn a 5-star review today.', measure: () => ({ have: S.tally.fiveStar || 0, need: 1, text: (S.tally.fiveStar || 0) ? 'Earned' : 'Not yet' }) }
];
const WEEKLY = [
  { key: 'week-stars', name: 'Five-star week', desc: () => 'Earn 3 five-star reviews this week.', measure: () => ({ have: S.wtally.fiveStar || 0, need: 3, text: `${S.wtally.fiveStar || 0} of 3` }) },
  { key: 'week-event', name: 'Event of the week', desc: () => 'Hold an event this week.', measure: () => ({ have: S.wtally.events || 0, need: 1, text: (S.wtally.events || 0) ? 'Held' : 'Not yet' }) },
  { key: 'week-profit', name: 'Profit week', desc: () => `Make ${money(byTier([400, 900, 2000, 4000]) * 4)} profit this week.`, measure: () => ({ have: Math.round(S.wtally.profit || 0), need: byTier([400, 900, 2000, 4000]) * 4, text: `${signed(S.wtally.profit || 0)} so far` }) },
  { key: 'week-full', name: 'Nearly full', desc: () => 'Reach 90% of rooms occupied on an evening this week.', measure: () => ({ have: Math.round((S.wtally.peak || 0) * 100), need: 90, text: `${Math.round((S.wtally.peak || 0) * 100)}% best` }) },
  { key: 'week-service', name: 'Look after the equipment', desc: () => 'Service 2 pieces of equipment this week.', measure: () => ({ have: S.wtally.services || 0, need: 2, text: `${S.wtally.services || 0} of 2` }) },
  { key: 'week-jobs', name: 'Hard-working week', desc: () => `Your team completes ${byTier([30, 45, 60, 80])} jobs this week.`, measure: () => ({ have: S.wtally.jobs || 0, need: byTier([30, 45, 60, 80]), text: `${S.wtally.jobs || 0} done` }) }
];
const challengeDef = key => DAILY.find(c => c.key === key) || WEEKLY.find(c => c.key === key);
const newChallengeState = () => ({ issued: -1, weekStart: -1, daily: [], weekly: null, dailyDone: {}, weeklyDone: false, completed: 0, streak: 0, lastDone: -2 });

/* Counts something for today and this week. */
function tally(key, n) {
  S.tally[key] = (S.tally[key] || 0) + (n === undefined ? 1 : n);
  S.wtally[key] = (S.wtally[key] || 0) + (n === undefined ? 1 : n);
}

/* Each morning: two new daily challenges, and a weekly one on the first day of a new week. */
function issueChallenges() {
  const c = S.challenges;
  if (c.issued === S.day) return;
  c.issued = S.day; S.tally = {}; c.dailyDone = {};
  const pool = DAILY.filter(d => !d.when || d.when()); c.daily = [];
  for (let i = 0; i < 2; i++) { const x = pick(pool); pool.splice(pool.indexOf(x), 1); c.daily.push(x.key); }
  if (c.weekly === null || S.day % 7 === 0 || S.day - c.weekStart >= 7) {
    c.weekStart = S.day; c.weekly = pick(WEEKLY).key; c.weeklyDone = false; S.wtally = {};
  }
}
/* How the evening begins, taken before checkouts and penalties change anything. */
function duskSnapshot() {
  return { dirty: S.rooms.filter(r => r.dirty).length, complaints: S.jobs.filter(j => j.type === 'complaint').length,
    happy: S.guests.length ? Math.round(S.guests.reduce((a, g) => a + g.happiness, 0) / S.guests.length) : 100, fullness: S.rooms.length ? S.guests.length / S.rooms.length : 0 };
}
function bonus(amount, label) {
  S.money += amount;
  S.ledger.push({ day: S.day, label, amount, grant: true });
}
/* Checks today's challenges at dusk. ctx: the snapshot plus the day's profit. Returns [{ name, reward, weekly, streak }]. */
function checkChallenges(ctx) {
  const c = S.challenges, won = [], reward = challengeReward();
  S.wtally.profit = (S.wtally.profit || 0) + ctx.profit;
  S.wtally.peak = Math.max(S.wtally.peak || 0, ctx.fullness);
  for (const key of c.daily) {
    const def = challengeDef(key), m = def.measure(ctx);
    if (c.dailyDone[key] || m.have < m.need) continue;
    c.dailyDone[key] = true; c.completed++;
    bonus(reward, `Challenge: ${def.name}`);
    won.push({ name: def.name, reward });
    postMail({ from: 'Hotel HQ', role: 'Challenge', subject: `Challenge done: ${def.name}`, body: `${def.desc()} You earned a bonus of ${money(reward)}.`, kind: 'challenge' });
  }
  if (won.length && c.lastDone !== S.day) {
    c.streak = c.lastDone === S.day - 1 ? c.streak + 1 : 1; c.lastDone = S.day;
    if (STREAK_BONUS[c.streak]) {
      const extra = reward * STREAK_BONUS[c.streak];
      bonus(extra, `Challenge streak: ${c.streak} days`);
      won.push({ name: `${c.streak}-day streak`, reward: extra, streak: true });
      postMail({ from: 'Hotel HQ', role: 'Challenge', subject: `${c.streak} days in a row!`, body: `You did a daily challenge ${c.streak} days running. Bonus ${money(extra)}.`, kind: 'challenge' });
    }
  }
  if (c.weekly && !c.weeklyDone) {
    const def = challengeDef(c.weekly), m = def.measure(ctx);
    if (m.have >= m.need) {
      c.weeklyDone = true; c.completed++;
      const r = reward * 3;
      bonus(r, `Weekly challenge: ${def.name}`);
      won.push({ name: def.name, reward: r, weekly: true });
      postMail({ from: 'Hotel HQ', role: 'Challenge', subject: `Weekly challenge done: ${def.name}`, body: `${def.desc()} You earned a bonus of ${money(r)}.`, kind: 'challenge' });
    }
  }
  return won;
}
/* A streak only counts while it is current. */
const currentStreak = () => (S.challenges.lastDone >= S.day - 1 ? S.challenges.streak : 0);
