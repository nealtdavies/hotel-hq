'use strict';
/* ================= Earnings milestones, free unlocks and daily visits (no DOM access) =================
   Milestones count everything the hotel has earned from guests so far (never grants or bonuses), so progress only ever goes up and a bad day
   cannot take it away. Reaching a milestone can unlock an extra for the hotel. Unlocks cost nothing; the extras then bring new income, and
   each one opens the matching job for the entertainment team (see ENTERTAINERS in data.js). */
const FEATURES = {
  arcade: { name: 'Arcade', role: 'Arcade Attendant', blurb: 'Machines that earn on every play. They jam and break, and Maintenance has to fix them. Hire an Arcade Attendant to run it.' },
  kidsclub: { name: 'Kids Club', role: 'Kids Club Leader', blurb: 'Families can book their children in for supervised fun. Hire a Kids Club Leader to run it.' },
  shop: { name: 'Souvenir Shop', role: 'Shop Assistant', blurb: 'Stock and sell souvenirs and basics to guests. Keep it safe, because shops attract shoplifters. Hire a Shop Assistant to run it.' },
  excursions: { name: 'Excursions', role: 'Excursions Guide', blurb: 'Invent your own trips, name them, price them and add a picture. Good weather sells them. Hire an Excursions Guide to lead them.' }
};
/* need: total earned from guests. Early steps come quickly so a new player sees something new every visit; later ones stretch out. */
const MILESTONES = [
  { name: 'First guests', need: 2000 },
  { name: 'Game on', need: 5000, unlock: 'arcade' },
  { name: 'Local favourite', need: 9000 },
  { name: 'Family friendly', need: 15000, unlock: 'kidsclub' },
  { name: 'Rising star', need: 25000 },
  { name: 'Gift of the town', need: 40000, unlock: 'shop' },
  { name: 'Town talk', need: 55000 },
  { name: 'Adventure awaits', need: 75000, unlock: 'excursions' },
  { name: 'Hotel legend', need: 100000 },
  { name: 'Chain star 1', need: 150000 }, { name: 'Chain star 2', need: 220000 }, { name: 'Chain star 3', need: 350000 }, { name: 'Chain star 4', need: 500000 },
  { name: 'Chain star 5', need: 750000 }, { name: 'Chain star 6', need: 1000000 }, { name: 'Chain star 7', need: 1500000 }, { name: 'Chain star 8', need: 2000000 },
  { name: 'Chain star 9', need: 3000000 }, { name: 'Hotel empire', need: 5000000 }
];
const VISIT_BONUS = 250, VISIT_STREAK_CAP = 7;   // a small thank-you for the first visit on each real day, growing for up to a week in a row

const featureOn = key => !!(S.features && S.features[key]);

/* The next milestone to reach, or null when all are done. */
function milestoneProgress() {
  const m = MILESTONES[S.milestones.done];
  if (!m) return null;
  const from = S.milestones.done ? MILESTONES[S.milestones.done - 1].need : 0;
  return { index: S.milestones.done, name: m.name, need: m.need, from, have: S.earned, left: Math.max(0, m.need - S.earned), pct: Math.max(0, Math.min(100, Math.round((S.earned - from) / (m.need - from) * 100))), unlock: m.unlock ? FEATURES[m.unlock] : null };
}
/* Called each night after income is counted. Returns the milestones reached tonight (more than one if earnings jumped). */
function checkMilestones() {
  const reached = [];
  while (S.milestones.done < MILESTONES.length && S.earned >= MILESTONES[S.milestones.done].need) {
    const m = MILESTONES[S.milestones.done++];
    if (m.unlock) {
      S.features[m.unlock] = true;
      ensureFun();
      postMail({ role: 'Manager', subject: `New for your hotel: ${FEATURES[m.unlock].name}`, body: `${FEATURES[m.unlock].blurb} It is free to open: you earned it by reaching ${money(m.need)} in income.` });
    }
    reached.push({ name: m.name, need: m.need, unlock: m.unlock || null });
  }
  return reached;
}
/* Saves from before milestones count their earnings, and give every extra that was already earned without announcing it. */
function startMilestones(d) {
  if (!Number.isFinite(d.earned)) d.earned = (d.history || []).reduce((a, h) => a + (h.income || 0), 0);
  if (!d.features || typeof d.features !== 'object') d.features = {};
  if (!d.milestones || !Number.isInteger(d.milestones.done)) {
    let n = 0;
    while (n < MILESTONES.length && d.earned >= MILESTONES[n].need) { if (MILESTONES[n].unlock) d.features[MILESTONES[n].unlock] = true; n++; }
    d.milestones = { done: n };
  }
  if (!d.visit || typeof d.visit !== 'object') d.visit = { date: null, streak: 0, best: 0 };
}
/* A visit on a new real day: extends or restarts the streak. `date` is the player's local date as YYYY-MM-DD; `yesterday` the day before.
   Returns null when today has already been counted, otherwise { streak, bonus }. The bonus is paid straight away as a grant. */
function registerVisit(date, yesterday) {
  const v = S.visit;
  if (v.date === date) return null;
  v.streak = v.date === yesterday ? v.streak + 1 : 1;
  v.best = Math.max(v.best, v.streak);
  v.date = date;
  const bonus = VISIT_BONUS * Math.min(v.streak, VISIT_STREAK_CAP);
  S.money += bonus;
  S.ledger.push({ day: S.day, label: v.streak > 1 ? `Welcome back bonus (${v.streak} days in a row)` : 'Welcome back bonus', amount: bonus, grant: true });
  return { streak: v.streak, bonus };
}
