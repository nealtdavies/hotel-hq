'use strict';
/* ================= The guest book: notes, returning guests, review replies and the diary (no DOM access) =================
   Real hotels write down what guests like. Some guests let slip something they like ("overheard"); the player can write a note about them. When
   a guest leaves happy, they go in the guest book, and now and then they ring again. If the note the player wrote matches what they like, they
   are delighted to have been remembered. Nothing the player writes is marked: a note is only checked for the guest's favourite thing, and a
   reply or a diary line is simply kept. */

const GUESTBOOK = { max: 60, prefChance: 0.6, returnChance: 0.15, minHappy: 55, awayDays: 3, noteMax: 120, replyMax: 200, diaryMax: 240, diaryKeep: 120,
  replyBonus: 5, replyBonusPerDay: 3, delight: 12, thanks: 4 };
const GUEST_PREFS = [
  { key: 'quiet', say: 'I do like a quiet room. I am a very light sleeper.', words: ['quiet', 'silent', 'calm', 'peace', 'light sleeper', 'sleep'], likes: 'like a quiet room' },
  { key: 'pillows', say: 'I can never sleep without a few extra pillows.', words: ['pillow', 'cushion'], likes: 'love extra pillows' },
  { key: 'sea', say: 'The sea view is my favourite part of any holiday.', words: ['sea', 'view', 'ocean', 'window'], likes: 'love a sea view' },
  { key: 'breakfast', say: 'I love an early breakfast, before it gets busy.', words: ['breakfast', 'early', 'morning'], likes: 'like an early breakfast' },
  { key: 'tea', say: 'A proper cup of tea first thing makes my whole day.', words: ['tea', 'cuppa', 'kettle'], likes: 'like a cup of tea in the morning' },
  { key: 'dog', say: 'I miss my dog terribly whenever we travel.', words: ['dog', 'pet', 'puppy'], likes: 'adore dogs' },
  { key: 'checkout', say: 'I never manage to leave early, so a late checkout is a dream.', words: ['late', 'checkout', 'check-out', 'check out', 'lie in', 'lie-in'], likes: 'like a late checkout' },
  { key: 'sweets', say: 'I have a terrible sweet tooth, I will admit.', words: ['sweet', 'chocolate', 'cake', 'treat', 'biscuit', 'sugar'], likes: 'have a sweet tooth' }
];
const prefOf = key => GUEST_PREFS.find(p => p.key === key) || null;
const noteMatches = (note, key) => { const p = prefOf(key), t = String(note || '').toLowerCase(); return !!p && !!t && p.words.some(w => t.includes(w)); };
const regularById = id => S.regulars.find(r => r.id === id) || null;

/* A note about a guest who is staying. */
function setGuestNote(guestId, text) {
  const g = guestById(guestId);
  if (!g) return { ok: false, error: 'That guest has left.' };
  g.note = cleanText(text, GUESTBOOK.noteMax);
  return { ok: true, note: g.note };
}
/* Called as a guest leaves. Someone who left happy goes into the guest book, with the note written about them. */
function rememberGuest(g) {
  if (!S.regulars) return;
  const lead = (g.party && g.party.members[0]) || { first: String(g.name).split(' ')[0], gender: 'f' };
  const key = String(g.name).toLowerCase();
  let r = S.regulars.find(x => x.name.toLowerCase() === key);
  if (!r) { r = { id: nid(), name: g.name, first: lead.first, gender: lead.gender, stays: 0, lastDay: S.day, happy: 0, pref: g.pref || null, note: '', party: null }; S.regulars.push(r); }
  r.stays++; r.lastDay = S.day; r.happy = Math.round(g.happiness);
  r.pref = g.pref || r.pref;
  if (g.note) r.note = g.note;
  r.party = g.party ? { rel: g.party.rel, members: g.party.members.map(m => ({ n: m.n, first: m.first, last: m.last, kid: !!m.kid, gender: m.gender })) } : r.party;
  if (S.regulars.length > GUESTBOOK.max) { S.regulars.sort((a, b) => b.lastDay - a.lastDay); S.regulars.length = GUESTBOOK.max; }
}
function setRegularNote(id, text) {
  const r = regularById(id);
  if (!r) return { ok: false, error: 'That guest is not in the guest book.' };
  r.note = cleanText(text, GUESTBOOK.noteMax);
  return { ok: true, note: r.note };
}
/* Someone from the guest book who could ring again: happy last time, away for a few days, not here and not already booked. */
function pickRegular() {
  if (!S.regulars.length || !chance(GUESTBOOK.returnChance)) return null;
  const busy = new Set([...S.guests.map(g => g.name), ...S.bookings.map(b => b.name), ...S.phone.calls.map(c => c.caller.name)].map(n => n.toLowerCase()));
  const ok = S.regulars.filter(r => r.happy >= GUESTBOOK.minHappy && S.day - r.lastDay >= GUESTBOOK.awayDays && !busy.has(r.name.toLowerCase()));
  return ok.length ? pick(ok) : null;
}
/* A guest from the guest book has arrived. Their note decides how pleased they are. Returns what happened. */
function welcomeBack(g, regularId) {
  const r = regularById(regularId);
  if (!r) return { kind: 'none' };
  g.regularId = r.id; g.pref = r.pref; g.note = r.note;
  if (r.note && noteMatches(r.note, r.pref)) {
    g.happiness = clamp(g.happiness + GUESTBOOK.delight, 0, 100); g.remembered = true; S.stats.remembered = (S.stats.remembered || 0) + 1; tally('remembered');
    postMail({ role: 'Receptionist', subject: `${g.name} is delighted you remembered`, body: `Your note said "${r.note}". They love that you remembered they ${prefOf(r.pref).likes}.`, kind: 'regular' });
    if (chance(0.7)) addReview(g.name, 5, `What a lovely surprise: the hotel remembered that we ${prefOf(r.pref).likes}. We will be back again!`);
    return { kind: 'remembered', note: r.note };
  }
  if (r.note) {
    g.happiness = clamp(g.happiness + GUESTBOOK.thanks, 0, 100);
    postMail({ role: 'Receptionist', subject: `${g.name} is back`, body: `A returning guest. Your note said "${r.note}", and they appreciate you thought of them.`, kind: 'regular' });
    return { kind: 'noted', note: r.note };
  }
  postMail({ role: 'Receptionist', subject: `${g.name} is back`, body: 'A returning guest, but there were no notes from last time. Next time, write down what they like!', kind: 'regular' });
  return { kind: 'blank' };
}

/* ---------- Replying to reviews ---------- */
function replyReview(id, text) {
  const r = S.reviews.find(x => x.id === id), t = cleanText(text, GUESTBOOK.replyMax);
  if (!r) return { ok: false, error: 'That review has gone.' };
  if (t.length < 3) return { ok: false, error: 'Write a few words in reply.' };
  const first = !r.reply;
  r.reply = t;
  let reward = 0;
  if (first && (S.tally.replies || 0) < GUESTBOOK.replyBonusPerDay) { reward = GUESTBOOK.replyBonus; bonus(reward, `Reply to ${r.name}`); }
  if (first) tally('replies');
  return { ok: true, reward, edited: !first };
}

/* ---------- The diary ---------- */
/* One entry for each day, written when the day ends. Writing nothing removes the entry. */
function writeDiary(day, text) {
  const t = cleanText(text, GUESTBOOK.diaryMax);
  S.diary = S.diary.filter(e => e.day !== day);
  if (!t) return { ok: true, cleared: true };
  S.diary.push({ day, text: t, cash: Math.round(S.money), rating: Math.round(rating() * 10) / 10, guests: S.guests.length });
  S.diary.sort((a, b) => a.day - b.day);
  S.diary = S.diary.slice(-GUESTBOOK.diaryKeep);
  return { ok: true, cleared: false };
}
/* The whole diary as plain text, for the "Export diary" button. */
function diaryText() {
  const lines = [`${S.hotel}: the diary of ${S.owner}`, ''];
  for (const e of S.diary) lines.push(`Day ${e.day + 1} (${DAYS_LONG[e.day % 7]}). Cash ${money(e.cash)}, rating ${e.rating}, ${e.guests} guest${e.guests === 1 ? '' : 's'}.`, e.text, '');
  return lines.join('\n');
}
