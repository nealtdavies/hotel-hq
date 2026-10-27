'use strict';

/* ================= Coaching and rewards (no DOM access) =================
   Gentle guidance for new and young players: a short first-steps checklist, awards to unlock, a friendly headline for each day and one
   helpful tip that fits what is happening in the hotel right now. Nothing here changes how the game plays. */

/* ---------- First steps ---------- */
const FIRSTS = [
  ['read', 'Read a message in your Inbox', 'inbox'],
  ['booked', 'Accept a booking from the Guests page', 'guests'],
  ['cleaned', 'Send someone to clean a dirty room', 'tasks'],
  ['incident', 'Decide what to do about an incident', 'incidents'],
  ['team', 'Look at your Team and the rota', 'staff'],
  ['endDay', 'Go offline to finish your first day', 'dashboard']
];
function noteFirst(key) {
  if (!S.firsts || S.firsts[key] || !FIRSTS.some(f => f[0] === key)) return false;
  S.firsts[key] = true;
  return true;
}
const firstsDone = () => FIRSTS.filter(f => S.firsts[f[0]]).length;
const firstsVisible = () => !S.firsts.hidden && firstsDone() < FIRSTS.length;

/* ---------- Awards ---------- */
/* test(ctx): ctx has the day's income, expenses and profit and how many rooms were full that evening. */
const AWARDS = [
  { key: 'settled', name: 'Settled in', desc: 'Finish the first-steps checklist.', test: () => firstsDone() === FIRSTS.length },
  { key: 'first-profit', name: 'In the black', desc: 'Finish a day with a profit.', test: c => c.profit > 0 },
  { key: 'big-day', name: 'Big day', desc: 'Make £1,000 profit in a single day.', test: c => c.profit >= 1000 },
  { key: 'full-house', name: 'Full house', desc: 'Have every room occupied on the same evening.', test: c => c.full },
  { key: 'five-star', name: 'Five stars', desc: 'Earn a 5-star review.', test: () => S.stats.fiveStar > 0 },
  { key: 'happy-hotel', name: 'Happy hotel', desc: 'Reach a 4.5 rating with at least 10 reviews.', test: () => S.reviews.length >= 10 && rating() >= 4.5 },
  { key: 'week', name: 'One week in', desc: 'Run your hotel for 7 days.', test: () => S.day + 1 >= 7 },
  { key: 'month', name: 'One month in', desc: 'Run your hotel for 30 days.', test: () => S.day + 1 >= 30 },
  { key: 'century', name: 'A hundred days', desc: 'Run your hotel for 100 days.', test: () => S.day + 1 >= 100 },
  { key: 'busy-bees', name: 'Busy bees', desc: 'Your team completes 25 jobs.', test: () => S.stats.jobs >= 25 },
  { key: 'showtime', name: 'Showtime', desc: 'Hold your first event.', test: () => S.stats.events >= 1 },
  { key: 'wedding', name: 'Wedding bells', desc: 'Host a wedding.', test: () => S.stats.weddings >= 1 },
  { key: 'moving-up', name: 'Moving up', desc: 'Grow into a Small Hotel.', test: () => S.tier >= 2 },
  { key: 'grand', name: 'Grand Resort', desc: 'Reach the top level.', test: () => S.tier >= TIERS.length },
  { key: 'challenger', name: 'Challenger', desc: 'Complete 10 challenges.', test: () => S.challenges.completed >= 10 },
  { key: 'on-a-roll', name: 'On a roll', desc: 'Do a daily challenge three days in a row.', test: () => currentStreak() >= 3 },
  { key: 'saver', name: 'Saving up', desc: 'Have £50,000 in the bank.', test: () => S.money >= 50000 },
  { key: 'tycoon', name: 'Hotel tycoon', desc: 'Have £250,000 in the bank.', test: () => S.money >= 250000 },
  { key: 'top-chef', name: 'Top chef', desc: 'Offer 8 or more dishes with an average quality of 4 stars.', test: () => { const on = menuAvailable(); return hasFacility('restaurant') && on.length >= 8 && on.reduce((a, d) => a + d.quality, 0) / on.length >= 4; } }
];
/* Awards earned now. Each one is remembered with the day, and arrives as an inbox message. */
function checkAwards(ctx) {
  const won = [];
  for (const a of AWARDS) {
    if (S.awards[a.key] !== undefined || !a.test(ctx)) continue;
    S.awards[a.key] = S.day;
    won.push(a);
    postMail({ from: 'Hotel HQ', role: 'Award', subject: `Award unlocked: ${a.name}`, body: a.desc, kind: 'award' });
  }
  return won;
}

/* ---------- The day ---------- */
function dayHeadline(profit) {
  return profit >= 1000 ? 'Brilliant day!' : profit >= 400 ? 'A great day' : profit >= 0 ? 'A steady day' : 'A tough day';
}

/* One helpful tip for the way things stand, most useful first. Returns { text, view }. */
function coachTip() {
  const arrivals = arrivalsDue().length, ready = S.rooms.filter(isReady).length, dirty = S.jobs.filter(j => j.type === 'clean').length;
  const complaints = S.jobs.filter(j => j.type === 'complaint').length;
  const worn = S.assets.find(a => !a.broken && a.cond < 50);
  const tired = S.staff.find(s => s.mood < 35);
  const empty = S.rooms.length ? 1 - (S.guests.length / S.rooms.length) : 0;
  if (S.money < 1500) return { text: 'Cash is low. Fill more rooms, and try a cheap event to bring money in.', view: 'events' };
  if (complaints) return { text: 'Deal with complaints today. Unhappy guests leave bad reviews and your rating drops.', view: 'inbox' };
  const stretched = stretchedRoles()[0];
  if (stretched) return { text: `${stretched.role} work is piling up: ${stretched.jobs} jobs and room for ${stretched.free}. Recruit another ${stretched.role}, and check their skill, reliability and wage first.`, view: 'staff' };
  if (arrivals > ready) return { text: 'More guests are arriving than there are clean rooms. Send housekeeping to the dirty ones.', view: 'inbox' };
  if (S.enquiries.length && !S.autoBook) return { text: 'People are waiting to book. Accept them so empty rooms start earning.', view: 'guests' };
  if (dirty >= 3) return { text: `${dirty} rooms need cleaning. A clean room is ready to sell.`, view: 'inbox' };
  if (worn) return { text: `The ${ASSET_DEFS[worn.key].name.toLowerCase()} is getting worn out. Service it before it breaks down.`, view: 'maintenance' };
  if (tired) return { text: `${tired.name.split(' ')[0]} is tired. A day off on the rota brings their mood back up.`, view: 'staff' };
  const advice = priceAdvice()[0];
  if (advice) return { text: `Prices: ${advice.reason} Try ${money(advice.target)} for ${advice.type} rooms.`, view: 'dashboard' };
  const fest = festivalOn(S.day) ? null : nextFestival(S.day);
  if (fest && fest.in <= 6 && !S.events.some(e => e.day >= fest.day && e.day < fest.day + fest.festival.days)) return { text: `${fest.festival.name} starts in ${fest.in} day${fest.in > 1 ? 's' : ''}. Plan an event to catch the crowds.`, view: 'events' };
  if (!S.eventLog.length && !S.events.length) return { text: 'Try an excursion or a karaoke night on the Events page. They cost little and can earn a nice profit.', view: 'events' };
  if (empty > 0.5 && S.day > 2) return { text: 'Lots of empty rooms. Advertise an event, or check that your prices are fair.', view: 'events' };
  if (S.eventRequests.length) return { text: 'A client wants to hold an event at your hotel. Weddings and parties pay well.', view: 'inbox' };
  const goal = goalProgress();
  if (goal && !goal.met) { const next = goal.items.find(i => !i.done); if (next) return { text: `Next level goal: ${next.label.charAt(0).toLowerCase() + next.label.slice(1)}.`, view: 'expansion' }; }
  return { text: 'Your hotel is running well. Check the Inbox to see what your team has to say.', view: 'inbox' };
}
