'use strict';

/* ================= Team: shifts, the in-day clock, activity and mood (no DOM access) =================
   The game still resolves each day as a whole, but a day now has a clock (06:00 to 23:00). Everyone works a shift on days their
   14-day rota marks as on. Jobs a person is given are placed on their timeline so you can see who is doing what, and when. */

const IDLE_ACTIVITY = { 'Receptionist': 'On the front desk', 'Housekeeper': 'Checking the corridors', 'Chef': 'Prepping the kitchen',
  'Maintenance': 'Walking the building', 'Spa Therapist': 'Preparing the treatment rooms', 'Manager': 'Walking the floor',
  'Kids Club Leader': 'Setting out the craft table', 'Arcade Attendant': 'Checking the machines', 'Shop Assistant': 'Straightening the shelves', 'Excursions Guide': 'Planning the day trips' };
const shiftOf = s => SHIFTS[s.shift] || SHIFTS.day;
const shiftHours = s => (shiftOf(s).end - shiftOf(s).start) / 60;

function jobLabel(j) {
  const g = j.guestId ? guestById(j.guestId) : null;
  if (j.type === 'clean') return `Cleaning ${(roomById(j.roomId) || {}).name || 'a room'}`;
  if (j.type === 'repair') return `Repairing ${j.target === 'room' ? (roomById(j.roomId) || {}).name || 'a room' : (ASSET_DEFS[j.assetKey] || { name: 'equipment' }).name.toLowerCase()}`;
  if (j.type === 'complaint') return `Resolving ${g ? g.name + "'s" : 'a'} complaint`;
  return `${j.label || 'Guest request'}${g ? ' for ' + g.name : ''}`;
}

/* Puts a piece of work on someone's timeline: it starts at the later of the clock, their shift start and the end of their last job. */
function scheduleWork(s, label, kind) {
  if (!s || !worksOn(s, S.day)) return null;
  const minutes = JOB_MINUTES[kind] || 30;
  const last = S.timeline.filter(t => t.staffId === s.id).reduce((a, t) => Math.max(a, t.end), 0);
  const start = Math.max(S.clock, shiftOf(s).start, last);
  const entry = { id: nid(), day: S.day, staffId: s.id, label, kind, start, end: start + minutes };
  S.timeline.push(entry);
  return entry;
}

/* What someone is doing at the given clock time. state: sick, off, before, busy, free, after. pct: how far through the shift they are. */
function staffNow(s, clock) {
  if (clock === undefined) clock = S.clock;
  const sh = shiftOf(s), rostered = worksOn(s, S.day);
  if (s.sickDays > 0) return { state: 'sick', label: `Off sick, ${s.sickDays} day${s.sickDays > 1 ? 's' : ''} left`, pct: 0 };
  if (!rostered) return { state: 'off', label: 'Day off', pct: 0 };
  if (clock < sh.start) return { state: 'before', label: `Starts at ${clockText(sh.start)}`, pct: 0 };
  if (clock >= sh.end) return { state: 'after', label: 'Shift finished', pct: 1 };
  const pct = (clock - sh.start) / (sh.end - sh.start);
  const cur = S.timeline.find(t => t.staffId === s.id && t.start <= clock && clock < t.end);
  if (cur) return { state: 'busy', label: cur.label, pct, until: cur.end };
  const next = S.timeline.filter(t => t.staffId === s.id && t.start > clock).sort((a, b) => a.start - b.start)[0];
  return { state: 'free', label: IDLE_ACTIVITY[s.role] || 'Ready for jobs', pct, next: next || null };
}
const onShiftNow = () => S.staff.filter(s => ['busy', 'free'].includes(staffNow(s).state));

function advanceClock(minutes) {
  const to = Math.min(DAY_END, S.clock + Math.max(0, Math.round(minutes) || 0));
  const done = S.timeline.filter(t => t.end > S.clock && t.end <= to);
  S.clock = to;
  return done;
}

/* ---------- Mood ---------- */
const moodWordStaff = m => m >= 75 ? 'Happy' : m >= 50 ? 'Content' : m >= 30 ? 'Stressed' : 'Unhappy';
/* Called each night. Working takes a little out of people, a day off puts it back, a flat-out day or a long run of days hurts, and a
   very good or very bad mood drifts back towards the middle. Low mood makes someone more likely to call in sick (see generateDay). */
function updateStaffMood() {
  for (const s of S.staff) {
    const worked = worksOn(s, S.day) && s.sickDays === 0;
    s.streak = worked ? s.streak + 1 : 0;
    let delta = worked ? -1 : s.sickDays > 0 ? -1 : 4;
    if (worked && s.used >= STAFF_CAP) delta -= 2;
    if (worked && s.used === 0) delta += 1;
    if (s.streak >= 6) delta -= 3;
    if (s.mood > 75) delta -= 1;
    s.mood = clamp(s.mood + delta, 0, 100);
  }
}

/* ---------- Rota editing ---------- */
function setRotaDay(staffId, idx, on) {
  const s = staffById(staffId);
  if (!s) return { ok: false, error: 'That person has gone.' };
  if (!Number.isInteger(idx) || idx < 0 || idx >= ROTA_DAYS) return { ok: false, error: 'That day is not on the rota.' };
  if (idx === rotaIdx(S.day) && !on && s.used > 0) return { ok: false, error: `${s.name} has already worked today.` };
  s.rota[idx] = !!on;
  return { ok: true };
}
function setShift(staffId, key) {
  const s = staffById(staffId);
  if (!s) return { ok: false, error: 'That person has gone.' };
  if (!SHIFTS[key]) return { ok: false, error: 'Unknown shift.' };
  if (s.used > 0 || S.timeline.some(t => t.staffId === s.id)) return { ok: false, error: `${s.name} has already worked today. The new shift starts tomorrow.` };
  s.shift = key;
  return { ok: true };
}
/* Days on, hours and wage for the fortnight. */
function rotaStats(s) {
  const days = s.rota.filter(Boolean).length;
  return { days, hours: days * shiftHours(s), cost: days * s.wage };
}
/* How many people of each role are rostered on a day (sick people only count today). */
function dayCover(day) {
  const out = {};
  for (const s of S.staff) if (worksOn(s, day) && (day !== S.day || s.sickDays === 0)) out[s.role] = (out[s.role] || 0) + 1;
  return out;
}

/* ---------- Hiring ---------- */
function hireCandidate(id) {
  if (S.staff.length >= staffLimit()) return { ok: false, error: `A ${tierInfo().name} can employ ${staffLimit()} people. Level up to hire more.` };
  const c = S.candidates.find(x => x.id === id);
  if (!c) return { ok: false, error: 'That candidate has gone.' };
  const staff = { id: nid(), name: c.name, gender: c.gender, portrait: c.portrait, role: c.role, skill: c.skill, reliability: c.reliability, wage: c.wage,
    photo: null, trait: c.trait, rota: fortnight([5, 6]), shift: ROLE_SHIFT[c.role] || 'day', mood: 70, streak: 0, sickDays: 0, used: 0 };
  S.staff.push(staff);
  S.candidates = S.candidates.filter(x => x !== c);
  return { ok: true, staff };
}
