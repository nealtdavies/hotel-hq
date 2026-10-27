'use strict';

/* ================= Inbox: messages from the team and front desk =================
   Urgent messages are red. Messages carry their own actions: assign someone, decide an incident, call a contractor, answer a client.
   Whatever you do here shows on the Dashboard as it happens. Registers itself into the shared VIEWS and actions of ui.js. */

const MAIL_TABS = [['inbox', 'Inbox'], ['urgent', 'Urgent'], ['handled', 'Handled']];
const mailTime = m => m.day === S.day ? (m.live ? 'Today' : clockText(m.clock)) : `Day ${m.day + 1}`;
const mailAvatar = (m, size) => { const s = m.staffId ? staffById(m.staffId) : null; const c = m.callId ? callById(m.callId) : null; if (c) return callerFace(c, size); return s ? avatar(s, size) : `<div class="av-fb ${size || ''}">${esc(initials(m.from))}</div>`; };

function mailRow(m, selected) {
  return `<button type="button" class="mailrow ${m.unread ? 'unread' : ''} ${m.urgent ? 'urgent' : ''} ${selected ? 'selected' : ''}" data-act="mailOpen" data-key="${esc(m.key)}">
    ${mailAvatar(m, 'md')}<span class="mailtext"><span class="row" style="gap:6px;flex-wrap:nowrap"><b class="subj">${esc(m.subject)}</b></span>
    <span class="small muted prev">${esc(m.from)} · ${esc(m.body)}</span></span><span class="mailmeta">${m.urgent ? '<span class="chip bad">Urgent</span>' : ''}<span class="small muted">${esc(mailTime(m))}</span></span></button>`;
}

/* The buttons and pickers a message offers. */
function mailActionHtml(m) {
  return m.actions.map(a => {
    if (a.type === 'assign') {
      const j = S.jobs.find(x => x.id === a.jobId);
      if (!j) return '';
      const free = eligible(j).filter(s => s.used < STAFF_CAP).sort((x, y) => y.skill - x.skill);
      const chips = free.map(s => `<button class="pick" data-act="mailAssign" data-job="${j.id}" data-staff="${s.id}" data-discount="${ui.mailDiscount ? 1 : 0}">${avatar(s, 'sm')}<span>${esc(s.name.split(' ')[0])}<br><small>${stars(s.skill)} · free ${clockText(staffFreeAt(s))}</small></span></button>`).join('');
      return `<div class="mailact"><div class="small muted" style="margin-bottom:6px">Give it to</div>
        ${a.discount ? `<label class="row small" style="gap:6px;margin-bottom:8px"><input type="checkbox" data-act="mailDiscount" ${ui.mailDiscount ? 'checked' : ''}> Offer a discount (${money(DISCOUNT_COST)}) to calm the guest</label>` : ''}
        ${free.length ? `<div class="staffchips">${chips}</div><div style="margin-top:10px"><button class="btn sm" data-act="mailBest" data-job="${j.id}" data-discount="${ui.mailDiscount ? 1 : 0}">Best available</button></div>` : `<div class="alert warn">Everyone who can do this is off, sick or has done ${STAFF_CAP} jobs today.</div>`}</div>`;
    }
    if (a.type === 'assignAll') return `<button class="btn primary" data-act="mailAssignAll" data-role="${esc(a.role)}" data-jobtype="${esc(a.jobType)}">Send ${a.role === 'Housekeeper' ? 'housekeeping' : 'the team'}</button>`;
    if (a.type === 'call') { const c = callById(a.id); return c ? `<button class="btn primary" data-act="callOpen" data-id="${c.id}">${c.kind === 'email' ? 'Read it and make the booking' : 'Listen and make the booking'}</button>` : ''; }
    if (a.type === 'incident') return `<button class="btn primary" data-act="resolve" data-id="${a.id}">Make a decision</button>`;
    if (a.type === 'quotes') return `<button class="btn ghost" data-act="getQuotes" data-kind="${a.kindOf}" data-target="${a.target}" data-key="${esc(a.key)}">Get contractor quotes</button>`;
    if (a.type === 'service') return `<button class="btn primary" data-act="service" data-key="${esc(a.key)}">Service it in-house</button>`;
    if (a.type === 'acceptEvent') return `<button class="btn good" data-act="acceptEventReq" data-id="${a.id}">Accept and take the deposit</button>`;
    if (a.type === 'declineEvent') return `<button class="btn ghost" data-act="declineEventReq" data-id="${a.id}">Decline</button>`;
    if (a.type === 'checkInAll') return `<button class="btn good" data-act="arriveAll">Check them in</button>`;
    if (a.type === 'acceptAll') return `<button class="btn good" data-act="acceptAll">Accept all that fit</button>`;
    if (a.type === 'dayOff') return `<button class="btn primary" data-act="mailDayOff" data-staff="${a.staffId}">Give tomorrow off</button>`;
    if (a.type === 'nav') return `<button class="btn ghost" data-act="nav" data-view="${a.view}">Open ${NAV.find(n => n[0] === a.view)[2]}</button>`;
    return '';
  }).join('');
}
function mailPane(m) {
  const acts = mailActionHtml(m);
  return `<div class="card mailpane stack"><div class="row"><button class="btn sm ghost mailback" data-act="mailBack">&larr; Inbox</button><span class="spacer"></span>${m.live ? '' : `<button class="btn sm ghost" data-act="mailDelete" data-key="${esc(m.key)}">Delete</button>`}</div>
    <div class="row">${m.urgent ? '<span class="chip bad">Urgent</span>' : ''}<span class="chip">${esc(m.role || 'Message')}</span><span class="small muted">${esc(mailTime(m))}</span></div>
    <h2 style="font-size:1.5rem">${esc(m.subject)}</h2>
    <div class="row">${mailAvatar(m, 'md')}<div><b>${esc(m.from)}</b><div class="small muted">${esc(m.role)}</div></div></div>
    <p style="margin:6px 0;font-size:1.04rem">${esc(m.body)}</p>
    ${acts ? `<div class="mailacts stack">${acts}</div>` : (m.live ? '' : '<div class="muted small">Nothing to do. This is for your information.</div>')}</div>`;
}

function viewInbox() {
  if (!MAIL_TABS.some(t => t[0] === ui.mailTab)) ui.mailTab = 'inbox';
  const all = inboxItems();
  if (ui.mailSel && !all.some(m => m.key === ui.mailSel)) ui.mailSel = null;
  const counts = { inbox: all.length, urgent: all.filter(m => m.urgent).length, handled: S.mail.handled.length };
  const unread = all.filter(m => m.unread).length;
  const tabs = `<div class="tabs">${MAIL_TABS.map(([k, l]) => `<button class="tab ${ui.mailTab === k ? 'active' : ''}" data-act="mailTab" data-tab="${k}">${l} (${counts[k]})</button>`).join('')}</div>`;
  let body;
  if (ui.mailTab === 'handled') {
    body = S.mail.handled.length ? `<div class="card list">${S.mail.handled.map(h => `<div class="row"><span class="chip good">Done</span><span>${esc(h.text)}</span><span class="small muted right">${h.day === S.day ? clockText(h.clock) : 'Day ' + (h.day + 1)}</span></div>`).join('')}</div>` : '<div class="card empty">Nothing handled yet. Actions you take from messages are listed here.</div>';
  } else {
    const list = ui.mailTab === 'urgent' ? all.filter(m => m.urgent) : all;
    const sel = ui.mailSel ? all.find(m => m.key === ui.mailSel) : null;
    body = `<div class="mail ${sel ? 'reading' : ''}"><div class="maillist card flush">${list.length ? list.map(m => mailRow(m, sel && sel.key === m.key)).join('') : `<div class="empty">${ui.mailTab === 'urgent' ? 'Nothing urgent. Well done.' : 'Your inbox is empty.'}</div>`}</div>
      <div class="mailview">${sel ? mailPane(sel) : '<div class="card empty mailplaceholder">Choose a message to read it and act on it.</div>'}</div></div>`;
  }
  return `<div class="pagehead"><div><h2>Inbox</h2><p>${unread ? `${unread} unread. ` : 'All read. '}${counts.urgent ? `${counts.urgent} urgent.` : 'Nothing urgent.'}</p></div><span class="spacer"></span>${unread ? '<button class="btn ghost" data-act="mailReadAll">Mark all read</button>' : ''}</div>${tabs}${body}`;
}
VIEWS.inbox = viewInbox;

const mailResult = r => { if (!r.ok) toast(r.error, 'bad'); else toast(r.text.charAt(0).toUpperCase() + r.text.slice(1) + '.', 'good'); commit(); };
actions.mailTab = d => { ui.mailTab = d.tab; ui.mailSel = null; render(); };
actions.mailOpen = d => { ui.mailSel = d.key; markMailRead(d.key); commit(); };
actions.mailBack = () => { ui.mailSel = null; render(); };
actions.mailReadAll = () => { inboxItems().forEach(m => markMailRead(m.key)); commit(); };
actions.mailDiscount = () => { ui.mailDiscount = !ui.mailDiscount; render(); };
actions.mailAssign = d => mailResult(mailAssign(Number(d.job), Number(d.staff), d.discount === '1'));
actions.mailBest = d => {
  const j = S.jobs.find(x => x.id === Number(d.job)), s = j ? bestStaff(j.role) : null;
  if (!s) return toast('Nobody is free to take that job.', 'bad');
  mailResult(mailAssign(j.id, s.id, d.discount === '1'));
};
actions.mailAssignAll = d => mailResult(mailAssignAll(d.role, d.jobtype));
actions.mailDayOff = d => mailResult(mailDayOff(Number(d.staff)));
actions.mailDelete = d => { deleteMail(d.key); ui.mailSel = null; commit(); };
