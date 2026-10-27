'use strict';

/* ================= Management mail (no DOM access) =================
   Two kinds of message reach the manager's inbox.
   Live items are worked out from the hotel as it is right now (a complaint waiting, a room to clean, an incident, a client request),
   so they are always current and vanish when dealt with. Stored mail records things that happened (reviews, event results, a
   contractor finishing, someone calling in sick, the nightly summary). Urgent items are marked red.
   The manager's own actions from the inbox are written to a "handled" log that the dashboard shows. */

const MAIL_MAX = 60, HANDLED_MAX = 40;
const DEPARTMENT = { 'Receptionist': 'Reception desk', 'Housekeeper': 'Housekeeping', 'Maintenance': 'Maintenance', 'Chef': 'Kitchen', 'Spa Therapist': 'Spa', 'Manager': 'Management', 'Accounts': 'Accounts', 'Events': 'Events team',
  'Kids Club Leader': 'Kids Club', 'Arcade Attendant': 'Arcade', 'Shop Assistant': 'Souvenir shop', 'Excursions Guide': 'Excursions' };
const staffFreeAt = s => Math.max(S.clock, shiftOf(s).start, S.timeline.filter(t => t.staffId === s.id).reduce((a, t) => Math.max(a, t.end), 0));

/* The person a message comes from: someone of that role, on shift if possible, otherwise the department. */
function mailSender(role) {
  const people = S.staff.filter(s => s.role === role);
  const person = people.find(s => ['busy', 'free'].includes(staffNow(s).state)) || people[0];
  return person ? { from: person.name, role: DEPARTMENT[role] || role, staffId: person.id } : { from: DEPARTMENT[role] || role, role: DEPARTMENT[role] || role, staffId: null };
}
function postMail(m) {
  if (!S.mail) return null;
  const sender = m.from ? { from: m.from, role: m.role || '', staffId: m.staffId || null } : mailSender(m.role || 'Receptionist');
  const item = { id: nid(), day: S.day, clock: S.clock, from: sender.from, role: sender.role, staffId: sender.staffId, subject: String(m.subject).slice(0, 90), body: String(m.body || ''), urgent: !!m.urgent, kind: m.kind || 'note', read: false };
  S.mail.items.unshift(item);
  S.mail.items = S.mail.items.slice(0, MAIL_MAX);
  return item;
}
/* A line of news for the morning report that also reaches the inbox. */
function announce(text, mail) {
  S.news.push(text);
  if (mail) postMail(Object.assign({ body: text }, mail));
}
function logHandled(text) {
  if (!S.mail) return;
  S.mail.handled.unshift({ id: nid(), day: S.day, clock: S.clock, text });
  S.mail.handled = S.mail.handled.slice(0, HANDLED_MAX);
}

/* ---------- Live items ---------- */
function liveMail() {
  const items = [], read = S.mail.read;
  const add = (key, kind, role, urgent, subject, body, actions) => { const s = mailSender(role); items.push({ key, live: true, kind, urgent, from: s.from, role: s.role, staffId: s.staffId, subject, body, actions, day: S.day, clock: DAY_START, unread: !read[key] }); };
  for (const inc of S.incidents) {
    const sc = SCEN[inc.sid];
    add(`inc:${inc.id}`, 'incident', 'Manager', sc.sev === 'Urgent', scenarioTitle(inc), `${sc.cat} · ${sc.sev}. This needs your decision. If you leave it until tonight it gets worse.`, [{ type: 'incident', id: inc.id }]);
  }
  for (const j of S.jobs) {
    const g = j.guestId ? guestById(j.guestId) : null, room = g ? roomById(g.roomId) : null;
    if (j.guestId && !(g && room)) continue;   // the guest has gone
    if (j.type === 'complaint') add(`job:${j.id}`, 'complaint', 'Receptionist', true, `Complaint: ${g.name}, ${room.name}`, `${g.name} in ${room.name} says: "${j.text}" They are ${g.happiness < 40 ? 'very unhappy' : 'unhappy'}. Unresolved complaints make guests angrier every night.`, [{ type: 'assign', jobId: j.id, discount: true }]);
    else if (j.type === 'request') add(`job:${j.id}`, 'request', 'Receptionist', false, `Request: ${j.label}${g ? ', ' + room.name : ''}`, `${g ? g.name + ' in ' + room.name : 'A guest'} asks: "${j.text}"${j.pay ? ` They will pay ${money(j.pay)}.` : ''} Requests not handled by the end of the day are lost.`, [{ type: 'assign', jobId: j.id }]);
    else if (j.type === 'repair') {
      const asset = j.target === 'asset';
      add(`job:${j.id}`, 'repair', 'Maintenance', asset, `Repair needed: ${asset ? ASSET_DEFS[j.assetKey].name : roomById(j.roomId).name}`, j.text, [{ type: 'assign', jobId: j.id }, { type: 'quotes', kindOf: 'repair', target: asset ? 'asset' : 'room', key: asset ? j.assetKey : j.roomId }]);
    }
  }
  const dirty = S.jobs.filter(j => j.type === 'clean');
  if (dirty.length) add('clean:all', 'clean', 'Housekeeper', arrivalsDue().length > S.rooms.filter(isReady).length, `${dirty.length} room${dirty.length > 1 ? 's' : ''} need cleaning`,
    `${dirty.slice(0, 6).map(j => roomById(j.roomId).name).join(', ')}${dirty.length > 6 ? ` and ${dirty.length - 6} more` : ''}. ${arrivalsDue().length ? `${arrivalsDue().length} reservation${arrivalsDue().length > 1 ? 's are' : ' is'} due today.` : ''}`.trim(), [{ type: 'assignAll', role: 'Housekeeper', jobType: 'clean' }]);
  const due = arrivalsDue();
  if (due.length) add('arr', 'arrivals', 'Receptionist', true, `${due.length} guest${due.length > 1 ? 's' : ''} arriving today`, `${due.slice(0, 4).map(b => b.name).join(', ')}${due.length > 4 ? ` and ${due.length - 4} more` : ''}. Anyone still waiting tonight is checked in if their room is ready, or leaves angry.`, [{ type: 'checkInAll' }, { type: 'nav', view: 'bookings' }]);
  if (S.enquiries.length) add('enq', 'enquiries', 'Receptionist', false, `${S.enquiries.length} booking enquir${S.enquiries.length > 1 ? 'ies' : 'y'}`, `${S.enquiries.slice(0, 4).map(e => e.name).join(', ')}${S.enquiries.length > 4 ? ` and ${S.enquiries.length - 4} more` : ''} would like to stay. Accept the ones that fit.`, [{ type: 'acceptAll' }, { type: 'nav', view: 'guests' }]);
  for (const q of S.eventRequests) {
    const def = EVENT_TYPES[q.type];
    add(`evreq:${q.id}`, 'eventRequest', 'Manager', false, `${def.name} request from ${q.client}`, `${q.client} would like to hold a ${def.name.toLowerCase()} for ${q.guests} guests on ${dayLabel(q.day)}, paying ${money(q.offer)} a head (${money(q.guests * q.offer)}). Deposit ${money(Math.round(q.guests * q.offer * PRIVATE_DEPOSIT))}. Answer within ${Math.max(0, q.expires - S.day)} day${q.expires - S.day === 1 ? '' : 's'}.`, [{ type: 'acceptEvent', id: q.id }, { type: 'declineEvent', id: q.id }]);
  }
  for (const e of S.events) {
    if (!EVENT_TYPES[e.type].outdoor || e.day < S.day || e.day - S.day > 2) continue;
    const f = forecastOn(e.day);
    if (f.kind === 'rain' || f.kind === 'storm') add(`wx:${e.id}`, 'weather', 'Events', f.kind === 'storm', `${WEATHER_WORD[f.kind]} forecast for ${e.name}`, `The forecast for ${dayLabel(e.day)} says ${f.kind}. ${f.kind === 'storm' ? 'A storm would call a public outdoor event off and refund the tickets.' : 'Rain halves the crowd, and those who stay home are refunded.'}`, [{ type: 'nav', view: 'events' }]);
  }
  for (const a of S.assets) if (!a.broken && a.cond < 40) add(`wear:${a.key}`, 'equipment', 'Maintenance', false, `${ASSET_DEFS[a.key].name} is at ${a.cond}%`, `Below 50% the risk of a breakdown rises quickly. Service it before it fails.`, [{ type: 'service', key: a.key }, { type: 'quotes', kindOf: 'service', target: 'asset', key: a.key }]);
  if (S.money < 0) add('cash', 'cash', 'Accounts', true, 'You are overdrawn', `The balance is ${money(S.money)}. Earn more or cut costs. At ${money(BANKRUPT_AT)} the bank closes you down.`, [{ type: 'nav', view: 'finance' }]);
  for (const s of S.staff) if (s.mood < 35) add(`tired:${s.id}`, 'staff', 'Manager', s.mood < 20, `${s.name} is ${s.mood < 20 ? 'exhausted' : 'stressed'}`, `${s.name} (${s.role}) has worked ${s.streak} day${s.streak === 1 ? '' : 's'} in a row and is ${moodWordStaff(s.mood).toLowerCase()}. Unhappy staff call in sick more often.`, [{ type: 'dayOff', staffId: s.id }, { type: 'nav', view: 'staff' }]);
  items.sort((a, b) => (b.urgent - a.urgent) || a.key.localeCompare(b.key));
  return items;
}

/* The whole inbox: live items, then stored mail newest first. */
function inboxItems() {
  const stored = S.mail.items.map(m => ({ key: `m:${m.id}`, live: false, kind: m.kind, urgent: m.urgent, from: m.from, role: m.role, staffId: m.staffId, subject: m.subject, body: m.body, actions: [], day: m.day, clock: m.clock, unread: !m.read }));
  return [...liveMail(), ...stored];
}
const unreadMail = () => inboxItems().filter(m => m.unread);
function markMailRead(key) {
  noteFirst('read');
  if (key.startsWith('m:')) { const m = S.mail.items.find(x => `m:${x.id}` === key); if (m) m.read = true; }
  else S.mail.read[key] = true;
}
function deleteMail(key) {
  if (!key.startsWith('m:')) return false;
  const n = S.mail.items.length;
  S.mail.items = S.mail.items.filter(x => `m:${x.id}` !== key);
  return S.mail.items.length < n;
}
/* Forget read marks for live items that no longer exist. */
function pruneMailRead() {
  const keys = new Set(liveMail().map(m => m.key));
  for (const k of Object.keys(S.mail.read)) if (!keys.has(k)) delete S.mail.read[k];
}

/* ---------- Actions on live items (each returns { ok, text } or { ok:false, error }) ---------- */
function mailAssign(jobId, staffId, discount) {
  const j = S.jobs.find(x => x.id === jobId), s = staffById(staffId);
  if (!j) return { ok: false, error: 'That job has already been dealt with.' };
  if (!s) return { ok: false, error: 'That person has gone.' };
  const label = jobLabel(j);
  if (j.type === 'complaint') j.discount = !!discount;
  if (!doAssign(jobId, staffId, true)) return { ok: false, error: `${s.name} cannot take that job (they may be off, full or the cash is short).` };
  const t = S.timeline.filter(x => x.staffId === s.id).pop();
  const text = `${s.name}: ${label.toLowerCase()}${t ? `, ${clockText(t.start)} to ${clockText(t.end)}` : ''}${discount && j.type === 'complaint' ? ', with a discount' : ''}`;
  logHandled(text);
  return { ok: true, text };
}
function mailAssignAll(role, jobType) {
  let n = 0;
  for (const j of [...S.jobs].filter(x => x.type === jobType)) { const s = bestStaff(role); if (s && doAssign(j.id, s.id, true)) n++; }
  if (!n) return { ok: false, error: 'Nobody is free to take those jobs.' };
  const text = `${n} ${jobType === 'clean' ? 'room' + (n > 1 ? 's' : '') + ' sent for cleaning' : 'job' + (n > 1 ? 's' : '') + ' assigned'}`;
  logHandled(text);
  return { ok: true, text };
}
function mailDayOff(staffId) {
  const s = staffById(staffId);
  if (!s) return { ok: false, error: 'That person has gone.' };
  const idx = rotaIdx(S.day + 1);
  if (!s.rota[idx]) return { ok: false, error: `${s.name} is already off tomorrow.` };
  setRotaDay(s.id, idx, false);
  const text = `${s.name} given tomorrow off`;
  logHandled(text);
  return { ok: true, text };
}
