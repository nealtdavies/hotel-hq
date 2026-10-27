'use strict';
/* ================= The phone desk: calls, messages and voicemail (no DOM access) =================
   Each morning a few guests are queued to ring. They ring one at a time while the player is playing (see phoneTick), and wait for the
   rest of the day. A caller says what they want in a few sentences; the player fills in the real booking form, and is scored on how much
   of it they caught. Writing is never marked: the name and note are kept as typed. What is unanswered becomes a voicemail for a couple
   of days, with no penalty. */

const PHONE = { ringMs: 30000, gapMs: 45000, keepDays: 2, noteMax: 120, replyMax: 200, welcomeMax: 120, maxAsks: 2, arriveSpread: 11 };
const CALL_ROOM_PHRASE = { 'Standard': 'a standard room', 'Ocean View': 'a room with a sea view', 'Family': 'a family room', 'Luxury Suite': 'your best suite' };
/* What a caller may ask for. `label` is the booking request it becomes, `say` is what they say, `needsKids` keeps a baby cot for families. */
const CALL_ASKS = [
  { key: 'quiet', label: 'Quiet room', say: 'We would like somewhere nice and quiet, please.' },
  { key: 'ground', label: 'Ground floor', say: 'Grandma cannot manage stairs, so the ground floor would be best.' },
  { key: 'cot', label: 'Baby cot', say: 'We will need a cot for the baby.', needsKids: true },
  { key: 'late', label: 'Late arrival', say: 'We will not get there until quite late in the evening.' },
  { key: 'dog', label: 'Dog stays too', say: 'We are bringing our little dog. Is that all right?' },
  { key: 'veg', label: 'Vegetarian meals', say: 'Some of us are vegetarian, if that helps the kitchen.' },
  { key: 'birthday', label: 'Birthday surprise', say: 'It is a birthday trip, so something special would be lovely.' },
  { key: 'view', label: 'Nice view', say: 'If there is a room with a lovely view, we would like that.' }
];
const CALL_GREETINGS = ['Hello! Is that {hotel}? My name is {name}.', 'Hi there, {name} speaking. I would like to book a stay at {hotel}, please.', 'Good morning, this is {name}. I am ringing about a room at {hotel}.', 'Hello, {name} here. Can you help me with a booking?'];
const CALL_CLOSINGS = ['Thank you so much!', 'That would be wonderful.', 'Please let me know if that works.', 'Lovely, thank you for your help.'];
const MESSAGE_TEMPLATES = [
  'Hello! Is there a pool at the hotel, and can children use it?',
  'Hi, we love the look of your hotel. What is breakfast like, and what time does it start?',
  'Good afternoon. We are coming with our dog. Is there somewhere nice to walk nearby?',
  'Hello, my daughter is nervous about staying in a hotel for the first time. Can you tell us what to expect when we arrive?',
  'Hi! It is my parents\' anniversary next month. Can you suggest something special we could do for them?',
  'Hello, what is the best thing to do in town when it rains?',
  'Hi, we have a long drive. Could you tell us the best time to arrive so check-in is easy?',
  'Good evening. Do you have anything for children to do in the afternoons?'
];

const newPhoneState = () => ({ calls: [], lastRing: 0, nextId: 1, answered: 0, perfect: 0, sent: [], welcome: '' });
const callById = id => S.phone.calls.find(c => c.id === id);
const phoneOpen = () => S.phone.calls.filter(c => c.status === 'ringing' || c.status === 'waiting');
const phoneRinging = () => S.phone.calls.find(c => c.status === 'ringing') || null;
const refOf = b => 'HQ-' + String(10000 + (Math.abs(b.id) * 7919) % 89999);
const cleanText = (s, max) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const callDayLabel = day => {
  const n = day - S.day;
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `${DAYS_LONG[day % 7]}${n > 6 ? ' next week' : ''}`;
};
const countWord = n => ({ 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' })[n] || String(n);

/* A caller with a request that can be met: a room type and arrival day with a room free, when there is one. */
function makeCall(kind) {
  let types = [...new Set(S.rooms.map(r => r.type))];
  let reg = pickRegular();   // now and then it is someone from the guest book, ringing again
  if (reg) { const need = reg.party ? reg.party.members.length : 1; types = types.filter(t => ROOM_TYPES[t].cap >= need); if (!types.length) { reg = null; types = [...new Set(S.rooms.map(r => r.type))]; } }
  let type = pick(types), arriveDay = S.day + rnd(PHONE.arriveSpread), nights = rndRange(1, 5);
  for (let i = 0; i < 6; i++) {
    type = pick(types); arriveDay = S.day + rnd(PHONE.arriveSpread); nights = rndRange(1, 5);
    if (freeRoomsFor(type, arriveDay, nights).length) break;
  }
  const kids = reg && reg.party ? reg.party.members.filter(m => m.kid).length : 0;
  const comp = reg ? { adults: reg.party ? reg.party.members.length - kids : 1, children: kids } : enquiryComposition(type);
  const caller = reg ? { name: reg.name, first: reg.first, gender: reg.gender } : drawPerson();
  const pool = CALL_ASKS.filter(a => !a.needsKids || comp.children > 0);
  const asks = [];
  for (let i = rnd(PHONE.maxAsks + 1); i > 0 && pool.length; i--) { const a = pick(pool.filter(x => !asks.includes(x.key))); if (a) asks.push(a.key); }
  return { id: S.phone.nextId++, kind: kind || 'call', status: 'queued', day: S.day, ringAt: 0, caller: { name: caller.name, first: caller.first, gender: caller.gender }, regular: reg ? reg.id : null,
    ask: { type, arriveDay, nights, adults: comp.adults, children: comp.children, asks }, v: rnd(1000) };
}
function makeMessage() {
  const caller = drawPerson();
  return { id: S.phone.nextId++, kind: 'message', status: 'queued', day: S.day, ringAt: 0, caller: { name: caller.name, first: caller.first, gender: caller.gender }, text: pick(MESSAGE_TEMPLATES), v: rnd(1000) };
}
/* What the caller says, sentence by sentence. */
function callScript(c) {
  const a = c.ask, party = a.children ? `${countWord(a.adults)} adult${a.adults > 1 ? 's' : ''} and ${countWord(a.children)} ${a.children > 1 ? 'children' : 'child'}` : a.adults === 1 ? 'just me' : `${countWord(a.adults)} of us`;
  const lines = [];
  lines.push(c.kind === 'voicemail' ? `Hello, it is ${c.caller.name}. I rang earlier about a room, and I would love a call back.` : c.regular ? `Hello! It is ${c.caller.name} again. We stayed with you before and we loved it.` : CALL_GREETINGS[c.v % CALL_GREETINGS.length].replace('{hotel}', S.hotel).replace('{name}', c.caller.name));
  lines.push(`I would like ${CALL_ROOM_PHRASE[a.type] || 'a room'} for ${a.nights} night${a.nights > 1 ? 's' : ''}, arriving ${callDayLabel(a.arriveDay)}.`);
  lines.push(`There will be ${party}.`);
  for (const k of a.asks) lines.push(CALL_ASKS.find(x => x.key === k).say);
  lines.push(CALL_CLOSINGS[c.v % CALL_CLOSINGS.length]);
  return lines;
}

/* ---------- The daily cycle ---------- */
/* Called each morning from generateDay: yesterday's unanswered calls become voicemails, old ones are dropped, and today's are queued. */
function phoneNewDay() {
  const p = S.phone;
  for (const c of p.calls) {
    if (c.status === 'queued') c.status = 'gone';
    else if ((c.status === 'ringing' || c.status === 'waiting') && c.kind === 'call') { c.kind = 'voicemail'; c.status = 'waiting'; c.day = S.day - 1; }
    if ((c.kind === 'voicemail' || c.kind === 'message') && c.status === 'waiting' && S.day - c.day > PHONE.keepDays) c.status = 'gone';
  }
  p.calls = p.calls.filter(c => c.status === 'waiting' || c.status === 'ringing');
  p.sent = p.sent.slice(0, 30);
  const calls = 2 + rnd(2) + S.tier - 1, messages = chance(0.6) ? 1 + (S.tier >= 3 ? 1 : 0) : 0;
  for (let i = 0; i < calls; i++) p.calls.push(makeCall('call'));
  for (let i = 0; i < messages; i++) p.calls.push(makeMessage());
  p.lastRing = 0;
}
/* Called every few seconds while the game is open. `now` is a time in milliseconds; `blocked` is true when something else has the player's attention
   (a pop-up, the guided tour, a hidden tab). A ringing call that nobody answers stops ringing and waits. Returns the call that has just started ringing. */
function phoneTick(now, blocked) {
  const p = S.phone, ringing = phoneRinging();
  if (ringing && now - ringing.ringAt > PHONE.ringMs) ringing.status = 'waiting';
  if (blocked || phoneRinging()) return null;
  if (p.lastRing && now - p.lastRing < PHONE.gapMs) return null;
  const next = p.calls.find(c => c.status === 'queued');
  if (!next) return null;
  next.status = 'ringing'; next.ringAt = now; p.lastRing = now;
  if (next.kind === 'message') next.status = 'waiting';   // a message arrives quietly with a ping, not a ring
  return next;
}

/* ---------- Answering ---------- */
/* How much of the call the player caught: the room, the day, the nights, the people and each request, with a request that was not made
   counting against them. Returns { right, total, stars }. */
function scoreCall(c, a) {
  const k = c.ask, asked = new Set(k.asks), got = new Set(a.asks || []);
  let right = 0;
  if (a.type === k.type) right++;
  if (Number(a.arriveDay) === k.arriveDay) right++;
  if (Number(a.nights) === k.nights) right++;
  if (Number(a.adults) === k.adults) right++;
  if (Number(a.children || 0) === k.children) right++;
  const total = 5 + asked.size;
  for (const x of asked) if (got.has(x)) right++;
  for (const x of got) if (!asked.has(x)) right--;
  right = clamp(right, 0, total);
  const ratio = right / total;
  return { right, total, stars: ratio >= 0.999 ? 3 : ratio >= 0.75 ? 2 : 1 };
}
const CALL_MOOD = [0, -3, 3, 8];   // by stars: a guest whose booking was written down wrongly arrives a little annoyed
/* a: { name, type, arriveDay, nights, adults, children, asks: [keys], note }. Returns { ok, error } or { ok, booking, stars, right, total, ref }. */
function answerCall(id, a) {
  const c = callById(id);
  if (!c || c.kind === 'message' || !(c.status === 'ringing' || c.status === 'waiting')) return { ok: false, error: 'That call is no longer there.' };
  const name = cleanText(a.name, 30);
  if (!name) return { ok: false, error: 'Write down the guest\'s name first.' };
  const asks = [...new Set(a.asks || [])].filter(x => CALL_ASKS.some(y => y.key === x));
  if (asks.length > MAX_REQUESTS) return { ok: false, error: `A booking can hold ${MAX_REQUESTS} requests.` };
  const type = a.type, price = Math.round(averagePrice(type) || (ROOM_TYPES[type] || {}).price || 0);
  // someone from the guest book keeps their party if the player wrote the same name and the same numbers
  const reg = c.regular ? regularById(c.regular) : null, p = reg && reg.party, same = !!p && name.toLowerCase() === c.caller.name.toLowerCase() && Number(a.adults) === p.members.filter(m => !m.kid).length && Number(a.children || 0) === p.members.filter(m => m.kid).length;
  const made = createBooking({ name, adults: a.adults, children: a.children || 0, type, arriveDay: a.arriveDay, nights: a.nights, price, mealPlan: 'room', extras: [], depositPct: 0, rel: same ? p.rel : 'auto', others: same ? p.members.slice(1).map(m => m.n).join(', ') : '', notes: cleanText(a.note, PHONE.noteMax), regularId: reg ? reg.id : null });
  if (!made.ok) return made;
  const score = scoreCall(c, { type, arriveDay: a.arriveDay, nights: a.nights, adults: a.adults, children: a.children || 0, asks });
  const b = made.booking, stillBooked = S.bookings.includes(b);
  if (stillBooked) { b.moodBonus = CALL_MOOD[score.stars]; for (const k of asks) addBookingRequest(b.id, CALL_ASKS.find(x => x.key === k).label); }
  else if (made.guest) {   // arriving today: the guest is already in a room, so the wishes are judged now
    made.guest.happiness = clamp(made.guest.happiness + CALL_MOOD[score.stars], 0, 100);
    giveWishes(made.guest, [...new Set(asks.map(k => wishFromText(CALL_ASKS.find(x => x.key === k).label)).filter(Boolean))]);
    judgeRoomWishes(made.guest, roomById(made.guest.roomId));
  }
  const reward = Math.round(score.stars * 10 * (c.kind === 'voicemail' ? 0.5 : 1));
  bonus(reward, `Phone desk: ${name}`);
  c.status = 'done'; c.result = { stars: score.stars, right: score.right, total: score.total, reward };
  S.phone.answered++; if (score.stars === 3) S.phone.perfect++;
  tally('calls');
  return { ok: true, booking: b, guest: made.guest || null, stars: score.stars, right: score.right, total: score.total, reward, ref: refOf(b), name };
}
function declineCall(id) {
  const c = callById(id);
  if (!c || c.kind === 'message' || !(c.status === 'ringing' || c.status === 'waiting')) return { ok: false, error: 'That call is no longer there.' };
  c.status = 'done'; c.result = { declined: true };
  return { ok: true };
}
/* A written reply to a guest's message. Never marked: any sentence earns the small thank-you. */
function replyMessage(id, text) {
  const c = callById(id), t = cleanText(text, PHONE.replyMax);
  if (!c || c.kind !== 'message' || c.status !== 'waiting') return { ok: false, error: 'That message is no longer there.' };
  if (t.length < 3) return { ok: false, error: 'Write a few words in reply.' };
  c.status = 'done'; c.result = { reply: t, reward: 5 };
  S.phone.sent.unshift({ day: S.day, to: c.caller.name, text: t });
  S.phone.sent = S.phone.sent.slice(0, 30);
  bonus(5, `Reply to ${c.caller.name}`);
  tally('replies');
  return { ok: true, reward: 5 };
}
function setWelcomeMessage(text) { S.phone.welcome = cleanText(text, PHONE.welcomeMax); return S.phone.welcome; }
