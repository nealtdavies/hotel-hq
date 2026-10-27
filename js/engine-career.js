'use strict';
/* ================= Career ranks and the morning briefing (no DOM access) =================
   The player is promoted as the goals (see engine-milestones.js) are reached, with a certificate for each step. The briefing is what a
   duty manager would tell the team at the start of the day, and what to expect tomorrow. */

const RANKS = [
  { name: 'Trainee', goals: 0 }, { name: 'Receptionist', goals: 2 }, { name: 'Duty Manager', goals: 4 }, { name: 'Assistant Manager', goals: 6 },
  { name: 'General Manager', goals: 9 }, { name: 'Regional Manager', goals: 12 }, { name: 'Hotelier', goals: 16 }, { name: 'Hotel Director', goals: 19 }
];
const rankIndexFor = done => RANKS.reduce((best, r, i) => (done >= r.goals ? i : best), 0);
const currentRank = () => RANKS[S.career.rank];
/* Called each night after the goals are checked. Returns the ranks reached (a certificate is kept for each). */
function checkPromotion() {
  const now = rankIndexFor(S.milestones.done), won = [];
  while (S.career.rank < now) {
    S.career.rank++;
    const cert = { rank: RANKS[S.career.rank].name, day: S.day };
    S.career.certs.push(cert); won.push(cert);
    postMail({ from: 'The board', role: 'Board', subject: `You have been promoted to ${cert.rank}`, body: `Well done, ${S.owner}. Your goals have earned you a new title: ${cert.rank}. Your certificate is in the Goals list.` });
  }
  return won;
}
/* Saves from before ranks start at the rank they have already earned, with no certificates. */
function startCareer(d) {
  if (!d.career || typeof d.career !== 'object' || !Number.isInteger(d.career.rank) || !Array.isArray(d.career.certs)) {
    d.career = { rank: rankIndexFor(d.milestones ? d.milestones.done : 0), certs: [] };
  }
  d.career.rank = clamp(d.career.rank, 0, RANKS.length - 1);
}

/* ---------- The briefing ---------- */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
function briefing() {
  const today = [], tomorrow = [];
  const w = weatherOn(S.day), f = festivalOn(S.day);
  today.push({ kind: w.kind === 'storm' || w.kind === 'rain' ? 'warn' : 'info', text: `${WEATHER_WORD[w.kind]}, ${w.temp} degrees.${f ? ` ${f.name} is on, so expect more people.` : ''}` });
  const due = arrivalsDue();
  if (due.length) {
    const back = due.filter(b => b.regularId).map(b => b.name);
    today.push({ kind: 'info', text: `${plural(due.length, 'reservation')} arriving today.${back.length ? ` Returning: ${back.join(', ')}.` : ''}` });
  }
  for (const b of due.slice(0, 3)) { const gaps = bookingWishGaps(b); if (gaps.length) today.push({ kind: 'warn', text: `${b.name} asked for ${gaps.map(x => x.label).join(' and ')}. Move them to ${gaps.map(x => x.hint).join(' and ')} before they arrive.` }); }
  for (const r of stretchedRoles().slice(0, 2)) today.push({ kind: 'warn', text: recruitText(r) });
  const open = phoneOpen().length, queued = S.phone.calls.filter(c => c.status === 'queued').length;
  if (open + queued) today.push({ kind: 'info', text: `${open + queued} ${open + queued === 1 ? 'call or message is' : 'calls or messages are'} expected at the phone desk.` });
  const ev = S.events.filter(e => e.day === S.day);
  if (ev.length) today.push({ kind: 'info', text: `${ev.map(e => e.name).join(' and ')} tonight.` });
  const sick = S.staff.filter(s => s.sickDays > 0);
  if (sick.length) today.push({ kind: 'warn', text: `${sick.map(s => s.name).join(', ')} ${sick.length === 1 ? 'is' : 'are'} off sick.` });
  const broken = S.assets.filter(a => a.broken);
  if (broken.length) today.push({ kind: 'bad', text: `${broken.map(a => ASSET_DEFS[a.key].name).join(', ')} ${broken.length === 1 ? 'is' : 'are'} broken.` });
  const goals = S.challenges.daily.map(k => challengeDef(k)).filter(Boolean).map(d => d.name);
  if (goals.length) today.push({ kind: 'info', text: `Today's challenges: ${goals.join(' and ')}.` });

  const t = S.day + 1, fw = forecastOn(t), tf = festivalOn(t);
  tomorrow.push({ kind: fw.kind === 'storm' || fw.kind === 'rain' ? 'warn' : 'info', text: `Forecast: ${WEATHER_WORD[fw.kind].toLowerCase()}, ${fw.temp} degrees.${tf && !f ? ` ${tf.name} begins.` : ''}` });
  const arr = S.bookings.filter(b => b.arriveDay === t);
  if (arr.length) tomorrow.push({ kind: 'info', text: `${plural(arr.length, 'reservation')} arriving.${arr.some(b => b.regularId) ? ' A returning guest is among them.' : ''}` });
  const leaving = S.guests.filter(g => g.left === 1);
  if (leaving.length) tomorrow.push({ kind: 'info', text: `${plural(leaving.length, 'guest')} leaving, so ${plural(leaving.length, 'room')} to clean.` });
  const evt = S.events.filter(e => e.day === t);
  if (evt.length) tomorrow.push({ kind: 'info', text: `${evt.map(e => e.name).join(' and ')} is on tomorrow.` });
  const off = S.staff.filter(s => !worksOn(s, t));
  if (off.length && S.staff.length) tomorrow.push({ kind: 'info', text: `${plural(off.length, 'person', 'people')} off duty.` });
  return { today, tomorrow };
}
