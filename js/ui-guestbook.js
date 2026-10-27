'use strict';

/* ================= Guest notes, the guest book, review replies and the diary =================
   Notes sit on each guest's card; the guest book lists people who have stayed; reviews can be answered; the diary is the player's own words.
   Registers itself into the shared VIEWS, MODALS, actions and forms of ui.js. */

ICONS.book = '<path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h12M9 8h6"/>';
NAV.splice(NAV.findIndex(n => n[0] === 'finance') + 1, 0, ['diary', 'book', 'Diary', null, 'Business']);

/* ---------- Notes on the guest cards ---------- */
function guestMemo(g) {
  const p = g.pref ? prefOf(g.pref) : null;
  const chips = `${g.regularId ? '<span class="chip good">Returning guest</span>' : ''}${g.remembered ? '<span class="chip warn">You remembered!</span>' : ''}`;
  return `<div class="memo">${chips ? `<div class="row" style="margin-top:10px">${chips}</div>` : ''}${p ? `<div class="overheard small">Overheard: &ldquo;${esc(p.say)}&rdquo;</div>` : ''}
    <form data-form="guestNote" class="row" style="flex-wrap:nowrap;margin-top:8px"><input type="hidden" name="id" value="${g.id}"><input type="text" name="text" maxlength="${GUESTBOOK.noteMax}" value="${esc(g.note || '')}" placeholder="Write a note about this guest" aria-label="Note about ${esc(g.name)}" style="flex:1;min-width:0"><button class="btn sm ghost" type="submit">Save</button></form></div>`;
}
forms.guestNote = f => {
  const r = setGuestNote(Number(f.get('id')), f.get('text'));
  if (!r.ok) return toast(r.error, 'bad');
  writeSave(); toast(r.note ? 'Note saved. It goes in the guest book when they leave.' : 'Note cleared.', 'good');   // no redraw, so other notes being typed are not lost
};

/* ---------- The guest book ---------- */
function guestBookSection() {
  const list = S.regulars.slice().sort((a, b) => b.lastDay - a.lastDay).slice(0, 12);
  const cards = list.map(r => {
    const knows = r.note && noteMatches(r.note, r.pref);
    return `<div class="card stack"><div class="row">${imgHtml(guestFacePath(r.name, r.gender), { fb: 'avatar', size: 'md', ini: initials(r.name), alt: r.name })}<div style="flex:1;min-width:0"><b>${esc(r.name)}</b>
        <div class="muted small">${r.stays} ${r.stays === 1 ? 'stay' : 'stays'}, last on day ${r.lastDay + 1}</div></div>${r.happy >= GUESTBOOK.minHappy ? '<span class="chip good">Likes us</span>' : '<span class="chip">Not impressed</span>'}</div>
      ${knows ? `<div class="small">You know they ${esc(prefOf(r.pref).likes)}.</div>` : '<div class="small muted">You are not sure what they like yet.</div>'}
      <form data-form="bookNote" class="row" style="flex-wrap:nowrap"><input type="hidden" name="id" value="${r.id}"><input type="text" name="text" maxlength="${GUESTBOOK.noteMax}" value="${esc(r.note || '')}" placeholder="Write what you remember" aria-label="Note about ${esc(r.name)}" style="flex:1;min-width:0"><button class="btn sm ghost" type="submit">Save</button></form></div>`;
  }).join('');
  return `<div class="section-title"><h3>Guest book</h3><span class="chip">${S.regulars.length} ${S.regulars.length === 1 ? 'person' : 'people'}</span><span class="muted small">Guests who left happy sometimes ring again. A note that matches what they like delights them.</span></div>
    ${cards ? `<div class="grid g3">${cards}</div>` : '<div class="card empty">Nobody yet. Guests are added when they check out.</div>'}`;
}
forms.bookNote = f => {
  const r = setRegularNote(Number(f.get('id')), f.get('text'));
  if (!r.ok) return toast(r.error, 'bad');
  writeSave(); toast(r.note ? 'Note saved.' : 'Note cleared.', 'good');
};

/* ---------- Reviews and replies ---------- */
function reviewRow(r) {
  return `<div class="stack" style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="row" style="align-items:flex-start;flex-wrap:nowrap"><span class="stars">${stars(r.stars)}</span><span style="flex:1;min-width:0"><b>${esc(r.name)}</b>: ${esc(r.text)}</span>
      <button class="btn sm ghost" data-act="reviewOpen" data-id="${r.id}">${r.reply ? 'Edit reply' : 'Reply'}</button></div>
    ${r.reply ? `<div class="reply small"><b>Your reply:</b> ${esc(r.reply)}</div>` : ''}</div>`;
}
MODALS.reviewReply = m => {
  const r = S.reviews.find(x => x.id === m.id);
  if (!r) return null;
  return { inner: `<h2>Reply to ${esc(r.name)}</h2><div class="row" style="margin:6px 0"><span class="stars">${stars(r.stars)}</span></div><div class="bubble" style="margin:10px 0">${esc(r.text)}</div>
    <form data-form="reviewReply"><input type="hidden" name="id" value="${r.id}"><label class="f" for="rv-t">Your reply</label><textarea id="rv-t" name="text" rows="4" maxlength="${GUESTBOOK.replyMax}" placeholder="Dear ${esc(String(r.name).split(' ')[0])}, thank you for..." required data-autofocus>${esc(r.reply || '')}</textarea>
      <div class="actions"><button class="btn ghost" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Send reply</button></div></form>` };
};
actions.reviewOpen = d => openModal({ type: 'reviewReply', id: Number(d.id) });
forms.reviewReply = f => {
  const r = replyReview(Number(f.get('id')), f.get('text'));
  if (!r.ok) return toast(r.error, 'bad');
  if (r.reward) sfx('cash');
  toast(r.edited ? 'Reply updated.' : r.reward ? `Reply sent. +${money(r.reward)}` : 'Reply sent.', 'good');
  ui.modal = null; commit();
};

/* ---------- The diary ---------- */
function diaryForm(day) {
  const e = S.diary.find(x => x.day === day);
  return `<form data-form="diary" class="stack" style="margin-top:14px"><input type="hidden" name="day" value="${day}"><label class="f" for="dy-t">Dear diary... (optional)</label>
    <div class="row" style="flex-wrap:nowrap"><input type="text" id="dy-t" name="text" maxlength="${GUESTBOOK.diaryMax}" value="${esc(e ? e.text : '')}" placeholder="Write about today in your own words" style="flex:1;min-width:0"><button class="btn sm ghost" type="submit">Save</button></div></form>`;
}
forms.diary = f => {
  const r = writeDiary(Number(f.get('day')), f.get('text'));
  writeSave(); toast(r.cleared ? 'Diary line removed.' : 'Saved in your diary.', 'good');   // the day report stays open
};
function viewDiary() {
  const list = S.diary.slice().reverse().map(e => `<div class="card stack"><div class="row"><h3>Day ${e.day + 1}, ${DAYS_LONG[e.day % 7]}</h3><span class="chip right">${money(e.cash)}</span><span class="chip">${e.rating} stars</span><span class="chip">${e.guests} ${e.guests === 1 ? 'guest' : 'guests'}</span></div>
    <p style="margin:0;white-space:pre-wrap">${esc(e.text)}</p></div>`).join('');
  return `<div class="pagehead"><div><h2>Diary</h2><p>Your own story of the hotel. A line is written when a day ends, and you can add one for today here.</p></div><span class="spacer"></span>${S.diary.length ? '<button class="btn" data-act="exportDiary">Export diary</button>' : ''}</div>
    <div class="card"><h3>Today, day ${S.day + 1}</h3>${diaryForm(S.day)}</div>
    <div class="section-title"><h3>Earlier entries</h3><span class="chip">${S.diary.length}</span></div>
    ${list ? `<div class="stack">${list}</div>` : '<div class="card empty">Nothing written yet. Your first line can go in at the end of the day.</div>'}`;
}
VIEWS.diary = viewDiary;
actions.exportDiary = () => {
  const url = URL.createObjectURL(new Blob([diaryText()], { type: 'text/plain' })), a = document.createElement('a');
  a.href = url; a.download = `${S.hotel.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'hotel'}-diary.txt`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Your diary was saved as a text file.', 'good');
};

/* ---------- What is coming tomorrow, at the end of the day ---------- */
function tomorrowBlock() {
  const lines = briefing().today.filter(x => x.kind !== 'bad').slice(0, 4);
  return lines.length ? `<h3 style="margin-top:16px">Tomorrow at a glance</h3><ul>${lines.map(l => `<li>${esc(l.text)}</li>`).join('')}</ul>` : '';
}
