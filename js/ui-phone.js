'use strict';

/* ================= The phone desk =================
   A ringing button that follows the player from screen to screen, a Phone tab for calls, voicemails and written messages, the call and
   message pop-ups, and the confirmation card for a booking. Registers itself into the shared VIEWS, MODALS, actions and forms of ui.js. */

ICONS.phone = '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>';
NAV.splice(5, 0, ['phone', 'phone', 'Phone', null, 'Hotel']);

const leadGender = g => (g.party && g.party.members[0] && g.party.members[0].gender) || 'f';
const callerFace = (c, size) => imgHtml(guestFacePath(c.caller.name, c.caller.gender), { fb: 'avatar', size: size || '', ini: initials(c.caller.name), alt: c.caller.name });
const callAgo = c => (S.day - c.day <= 0 ? 'today' : S.day - c.day === 1 ? 'yesterday' : `${S.day - c.day} days ago`);

/* ---------- The ringing button ---------- */
function syncRingFab() {
  let el = document.getElementById('ringFab');
  const c = S && S.phone ? phoneRinging() : null;
  if (!c) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('button'); el.id = 'ringFab'; el.className = 'ring-fab'; el.dataset.act = 'openPhone'; document.body.appendChild(el); }
  const html = `${ic('phone')}<span class="rf-text"><b>${esc(c.caller.first)}</b> is calling</span>`;
  if (el.innerHTML !== html) el.innerHTML = html;
  el.setAttribute('aria-label', `${c.caller.name} is calling. Answer the phone.`);
}
AFTER_RENDER.push(syncRingFab);

/* ---------- Ringing while the game is open ---------- */
let ringTimers = [];
function ringPhone() {
  ringTimers.forEach(clearTimeout); ringTimers = [];
  sfx('ring');
  [1500, 3000].forEach(ms => ringTimers.push(setTimeout(() => { if (S && S.phone && phoneRinging()) sfx('ring'); }, ms)));
}
/* Something else has the player's attention: a pop-up, the guided tour, or a tab nobody is looking at. */
const phoneBlocked = () => document.hidden || !!ui.modal || !!(S && S.tour && !S.tour.done) || !isOnline();   // nothing rings while Management is offline
const phoneSignature = () => S.phone.calls.map(c => c.id + c.status).join(',');
function phoneBeat() {
  if (!S || !S.phone) return;
  const before = phoneSignature();
  const c = phoneTick(Date.now(), phoneBlocked());
  if (c) { if (c.status === 'ringing') ringPhone(); else sfx('ding'); }   // a call rings; emails, messages and voicemails only give a soft low ding
  if (phoneSignature() === before) return;   // nothing changed, so nothing to redraw
  writeSave();
  const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if (typing) syncRingFab(); else render();
}
setInterval(phoneBeat, 4000);

/* ---------- The Phone tab ---------- */
function callCard(c) {
  if (c.kind === 'email') return `<div class="card stack"><div class="row">${callerFace(c, 'lg')}<div style="flex:1;min-width:0"><b>${esc(c.caller.name)}</b><div class="muted small">Email, ${callAgo(c)}</div></div><span class="chip info">Email</span></div>
    <div class="row"><button class="btn primary" data-act="callOpen" data-id="${c.id}">Read and book</button></div></div>`;
  if (c.kind === 'message') return `<div class="card stack"><div class="row">${callerFace(c, 'lg')}<div style="flex:1;min-width:0"><b>${esc(c.caller.name)}</b><div class="muted small">Message, ${callAgo(c)}</div></div><span class="chip info">Message</span></div>
    <div class="bubble">${esc(c.text)}</div><div class="row"><button class="btn primary" data-act="msgOpen" data-id="${c.id}">Write a reply</button></div></div>`;
  const ringing = c.status === 'ringing', vm = c.kind === 'voicemail';
  return `<div class="card stack ${ringing ? 'ringing' : ''}"><div class="row">${callerFace(c, 'lg')}<div style="flex:1;min-width:0"><b>${esc(c.caller.name)}</b><div class="muted small">${ringing ? 'Ringing now' : vm ? `${c.via === 'answerphone' ? 'Left a message on the answerphone' : 'Missed call, left a voicemail'} ${callAgo(c)}` : 'Waiting on the line'}</div></div>
    <span class="chip ${ringing ? 'bad' : vm ? 'warn' : 'good'}">${ringing ? 'Ringing' : vm ? 'Voicemail' : 'Waiting'}</span></div>
    <div class="row"><button class="btn primary" data-act="callOpen" data-id="${c.id}">${vm ? 'Call back' : 'Answer'}</button></div></div>`;
}
function viewPhone() {
  const open = phoneOpen(), p = S.phone, today = S.tally.calls || 0, queued = p.calls.filter(c => c.status === 'queued').length;
  const calls = open.filter(c => c.kind === 'call' || c.kind === 'voicemail'), emails = open.filter(c => c.kind === 'email'), msgs = open.filter(c => c.kind === 'message');
  const sent = p.sent.slice(0, 5).map(m => `<div class="row small" style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="muted" style="min-width:64px">Day ${m.day + 1}</span><span style="flex:1;min-width:0"><b>${esc(m.to)}</b>: ${esc(m.text)}</span></div>`).join('');
  return `<div class="pagehead"><div><h2>Phone desk</h2><p>Guests ring, email and write while you play. Emails are the easy ones: read them as often as you like. Calls you miss, and calls while the answerphone is on, are kept as voicemails in your Inbox for a couple of days.</p></div></div>
    <div class="card"><div class="row"><div style="flex:1;min-width:200px"><h3>Answerphone</h3><div class="muted small">${p.answerphone ? 'On. The phone never rings. Callers leave a voicemail, which waits in your Inbox as "Voicemail" with their booking enquiry.' : 'Off. The phone rings now and then while you play. Turn it on if you would rather answer later.'}</div></div>
      <span class="chip ${p.answerphone ? 'good' : ''}">${p.answerphone ? 'On' : 'Off'}</span><button class="btn ${p.answerphone ? 'ghost' : 'primary'}" data-act="toggleAnswerphone">${p.answerphone ? 'Turn off' : 'Turn on'}</button></div></div>
    <div class="grid g4" style="margin-top:14px">${[[calls.length, 'Calls and voicemails waiting'], [emails.length, 'Emails waiting'], [msgs.length, 'Messages to answer'], [today, 'Bookings taken today']].map(([v, l]) => `<div class="card kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div>
    ${open.length ? `<div class="grid g2" style="margin-top:14px">${open.map(callCard).join('')}</div>` : `<div class="card empty" style="margin-top:14px">Nothing waiting. ${queued ? 'The phone will ring soon, so keep playing.' : 'No more calls today. New ones arrive in the morning.'}</div>`}
    <div class="section-title"><h3>Your welcome message</h3></div>
    <div class="card"><form data-form="welcomeMsg"><label class="f" for="w-m">Printed on every booking confirmation</label>
      <input type="text" id="w-m" name="text" maxlength="${PHONE.welcomeMax}" value="${esc(p.welcome)}" placeholder="Write something friendly to your guests">
      <div class="actions"><button class="btn primary" type="submit">Save message</button></div></form></div>
    ${sent ? `<div class="section-title"><h3>Replies you have sent</h3></div><div class="card">${sent}</div>` : ''}`;
}
VIEWS.phone = viewPhone;

/* ---------- Answering a call ---------- */
const callTypes = () => [...new Set(S.rooms.map(r => r.type))];
MODALS.call = m => {
  const c = callById(m.id);
  if (!c || c.kind === 'message') return null;
  const email = c.kind === 'email', lines = email ? emailLines(c) : callScript(c), days = Array.from({ length: 14 }, (_, i) => S.day + i);
  return { inner: `<div class="call-head">${callerFace(c, 'lg')}<div><h2 style="margin:0">${email ? 'Email' : c.kind === 'voicemail' ? 'Voicemail' : 'Phone call'}: ${esc(c.caller.name)}</h2><div class="muted small">${email ? 'Read it, then fill in the booking.' : 'Listen, then fill in the booking.'}</div></div></div>
    <div class="call-body"><div class="speech">${lines.map((l, i) => `<div class="bubble" style="animation-delay:${email ? 0 : i * 0.45}s">${esc(l)}</div>`).join('')}</div>
    <form data-form="call" id="callForm" class="stack">
      <label class="f" for="c-n">Guest name</label>
      <div class="row" style="flex-wrap:nowrap"><input type="text" id="c-n" name="name" maxlength="30" placeholder="Write the name down" required data-autofocus style="flex:1;min-width:0"><button type="button" class="btn sm ghost" data-act="fillName" data-id="${c.id}">Fill it in for me</button></div>
      <div class="cols2"><div><label class="f" for="c-t">Room</label><select id="c-t" name="type">${callTypes().map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select></div>
        <div><label class="f" for="c-d">Arriving</label><select id="c-d" name="arriveDay">${days.map(d => `<option value="${d}">${esc(callDayLabel(d))}</option>`).join('')}</select></div></div>
      <div class="cols3"><div><label class="f" for="c-nn">Nights</label><input type="number" id="c-nn" name="nights" min="1" max="14" value="1"></div>
        <div><label class="f" for="c-a">Adults</label><input type="number" id="c-a" name="adults" min="1" max="6" value="2"></div>
        <div><label class="f" for="c-k">Children</label><input type="number" id="c-k" name="children" min="0" max="4" value="0"></div></div>
      <label class="f">Anything they asked for? (up to ${MAX_REQUESTS})</label>
      <div class="checks">${CALL_ASKS.map(a => `<label class="row small" style="gap:6px"><input type="checkbox" name="ask" value="${a.key}"> ${esc(a.label)}</label>`).join('')}</div>
      <label class="f" for="c-note">A note for the booking book (optional)</label>
      <input type="text" id="c-note" name="note" maxlength="${PHONE.noteMax}" placeholder="Anything you want to remember about this guest">
      <div class="actions"><button class="btn ghost" type="button" data-act="phoneDecline" data-id="${c.id}">Say sorry, no room</button><button class="btn primary" type="submit">Book it</button></div></form></div>` };
};
actions.toggleAnswerphone = () => { const on = setAnswerphone(!S.phone.answerphone); toast(on ? 'Answerphone on. Calls will go to voicemail in your Inbox.' : 'Answerphone off. The phone will ring again.', 'good'); commit(); };
actions.openPhone = () => { const c = phoneRinging(); if (c) openModal({ type: 'call', id: c.id }); else { ui.view = 'phone'; render(); window.scrollTo(0, 0); } };
actions.callOpen = d => openModal({ type: 'call', id: Number(d.id) });
actions.fillName = d => { const c = callById(Number(d.id)), el = document.getElementById('c-n'); if (c && el) { el.value = c.caller.name; el.focus(); } };
actions.phoneDecline = d => { const r = declineCall(Number(d.id)); ui.modal = null; toast(r.ok ? 'You said sorry and wished them luck elsewhere.' : r.error, r.ok ? '' : 'bad'); commit(); };
forms.call = f => {
  const c = callById(ui.modal.id);
  const r = answerCall(ui.modal.id, { name: f.get('name'), type: f.get('type'), arriveDay: Number(f.get('arriveDay')), nights: Number(f.get('nights')), adults: Number(f.get('adults')), children: Number(f.get('children')), asks: f.getAll('ask'), note: f.get('note') });
  if (!r.ok) return toast(r.error, 'bad');
  sfx(r.stars === 3 ? 'award' : 'cash');
  if (r.guest) sfx('bell');
  ui.modal = { type: 'confirmation', result: { name: r.name, stars: r.stars, right: r.right, total: r.total, reward: r.reward, ref: r.ref, type: r.booking.type, arriveDay: r.booking.arriveDay, nights: r.booking.nights, adults: r.booking.adults, children: r.booking.children, requests: (r.booking.requests || []).map(q => q.text), today: !!r.guest, room: r.guest ? (roomById(r.guest.roomId) || {}).name : null, voicemail: !!c && c.kind === 'voicemail' } };
  commit();
};

/* ---------- The confirmation card ---------- */
MODALS.confirmation = m => {
  const r = m.result, nightsText = `${r.nights} night${r.nights > 1 ? 's' : ''}`;
  const when = r.today ? 'today' : r.arriveDay - S.day === 1 ? 'tomorrow' : DAYS_LONG[r.arriveDay % 7] + ` (day ${r.arriveDay + 1})`;
  const verdict = r.stars === 3 ? 'Perfect! You caught every detail.' : r.stars === 2 ? 'Nicely done. You missed a little.' : 'Booked, but a few details were wrong. The guest may be a bit grumpy.';
  return { inner: `<div class="confcard"><img class="logo-mid" src="icons/logo-small.png" alt="" width="420" height="279"><div class="conf-title">${esc(S.hotel)}</div><div class="conf-sub">Booking confirmation</div>
    <div class="conf-ref">${esc(r.ref)}</div>
    <div class="conf-rows"><div><span>Guest</span><b>${esc(r.name)}</b></div><div><span>Room</span><b>${esc(r.type)}</b></div><div><span>Arriving</span><b>${esc(when)}</b></div><div><span>Stay</span><b>${nightsText}</b></div>
      <div><span>Party</span><b>${r.adults} adult${r.adults > 1 ? 's' : ''}${r.children ? `, ${r.children} child${r.children > 1 ? 'ren' : ''}` : ''}</b></div>${r.requests.length ? `<div><span>Requests</span><b>${r.requests.map(esc).join(', ')}</b></div>` : ''}${r.room ? `<div><span>Room number</span><b>${esc(r.room)}</b></div>` : ''}</div>
    ${S.phone.welcome ? `<div class="conf-welcome">&ldquo;${esc(S.phone.welcome)}&rdquo;<small>${esc(S.owner)}, ${esc(S.hotel)}</small></div>` : ''}</div>
    <div class="row" style="margin-top:14px"><span class="chip ${r.stars === 3 ? 'good' : r.stars === 2 ? 'warn' : 'bad'}">${'&#9733;'.repeat(r.stars)}${'&#9734;'.repeat(3 - r.stars)}</span><span class="small">${esc(verdict)} ${r.right} of ${r.total}.</span><span class="chip good right">+${money(r.reward)}</span></div>
    ${S.phone.welcome ? '' : '<div class="muted small" style="margin-top:8px">Tip: write a welcome message on the Phone tab and it will be printed here.</div>'}
    <div class="actions"><button class="btn primary big" data-act="closeModal">Done</button></div>` };
};

/* ---------- "Suggest a name": the player can always type their own instead ---------- */
function setField(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value; el.focus();
  el.dispatchEvent(new Event('input', { bubbles: true }));   // so live summaries (the booking preview) update
}
actions.diceName = d => { const p = drawPerson(d.gender === 'm' || d.gender === 'f' ? d.gender : undefined); setField(d.target, p.name); };
actions.diceOthers = () => {
  const form = document.getElementById('bkForm');
  if (!form) return;
  const f = new FormData(form), adults = clamp(Math.round(Number(f.get('adults'))) || 1, 1, 6), children = clamp(Math.round(Number(f.get('children'))) || 0, 0, 4);
  if (adults + children < 2) return toast('There are no other guests in this booking.');
  const lead = parseTypedName(f.get('name') || '');
  const party = newParty({ adults, children, rel: f.get('rel'), lead: lead.first ? lead : null });
  setField('bk-others', party.members.slice(1).map(m => m.n).join(', '));
};
actions.diceHotel = d => setField(d.target, pick(HOTEL_NAME_IDEAS));

/* ---------- Written messages ---------- */
MODALS.message = m => {
  const c = callById(m.id);
  if (!c || c.kind !== 'message') return null;
  return { inner: `<div class="call-head">${callerFace(c, 'lg')}<div><h2 style="margin:0">${esc(c.caller.name)} wrote to you</h2><div class="muted small">Write a friendly reply. There is no wrong answer.</div></div></div>
    <div class="bubble" style="margin:14px 0">${esc(c.text)}</div>
    <form data-form="message"><label class="f" for="m-t">Your reply</label><textarea id="m-t" name="text" rows="4" maxlength="${PHONE.replyMax}" placeholder="Dear ${esc(c.caller.first)}, ..." required data-autofocus></textarea>
      <div class="actions"><button class="btn ghost" type="button" data-act="closeModal">Later</button><button class="btn primary" type="submit">Send reply</button></div></form>` };
};
actions.msgOpen = d => openModal({ type: 'message', id: Number(d.id) });
forms.message = f => {
  const r = replyMessage(ui.modal.id, f.get('text'));
  if (!r.ok) return toast(r.error, 'bad');
  sfx('cash'); toast(`Reply sent. +${money(r.reward)}`, 'good'); ui.modal = null; commit();
};
forms.welcomeMsg = f => { setWelcomeMessage(f.get('text')); toast(S.phone.welcome ? 'Welcome message saved.' : 'Welcome message cleared.', 'good'); commit(); };
