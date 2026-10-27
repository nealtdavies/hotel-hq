'use strict';

/* ================= Team: who is on shift, the 14-day rota, people and recruitment =================
   Registers itself into the shared VIEWS and actions of ui.js. */

const SHIFT_STATE = { busy: ['Working', 'info'], free: ['Available', 'good'], before: ['Not started', ''], after: ['Finished', ''], off: ['Day off', ''], sick: ['Sick', 'warn'] };
const staffMoodClass = m => m >= 75 ? 'good' : m >= 50 ? '' : m >= 30 ? 'warn' : 'bad';
const STATE_ORDER = ['busy', 'free', 'before', 'after', 'sick', 'off'];

function clockCard() {
  const pct = Math.round((S.clock - DAY_START) / (DAY_END - DAY_START) * 100), over = S.clock >= DAY_END;
  const working = onShiftNow().length;
  return `<div class="card"><div class="row"><div><div class="kpi"><div class="v">${clockText(S.clock)}</div><div class="l">${DAYS_LONG[dow()]}, day ${S.day + 1}</div></div></div>
      <div class="right row"><button class="btn sm ghost" data-act="advanceTime" data-mins="60" ${over ? 'disabled' : ''}>+1 hour</button><button class="btn sm ghost" data-act="advanceTime" data-mins="180" ${over ? 'disabled' : ''}>+3 hours</button><button class="btn sm" data-act="advanceTime" data-mins="end" ${over ? 'disabled' : ''}>To close</button></div></div>
    <div class="bar" style="margin-top:16px"><i style="width:${pct}%"></i></div>
    <div class="row small muted" style="margin-top:6px"><span>${clockText(DAY_START)}</span><span class="right">${clockText(DAY_END)}</span></div>
    <div class="row small" style="margin-top:8px"><span class="chip good">${working} on shift now</span><span class="muted">Move the clock to watch shifts start and jobs finish. The day itself still ends when you press End day.</span></div></div>`;
}

function shiftCard(s) {
  const n = staffNow(s), sh = shiftOf(s), [word, cls] = SHIFT_STATE[n.state];
  const dim = ['off', 'after', 'before'].includes(n.state) ? ' style="opacity:.78"' : '';
  const when = n.state === 'off' || n.state === 'sick' ? '' : `<div class="shiftbar" aria-label="Shift progress"><div class="bar ${n.state === 'after' ? 'good' : ''}"><i style="width:${Math.round(n.pct * 100)}%"></i></div>
      <div class="row small muted"><span>${clockText(sh.start)}</span><span class="right">${clockText(sh.end)}</span></div></div>`;
  const next = n.next ? ` Next: ${esc(n.next.label)} at ${clockText(n.next.start)}.` : '';
  return `<div class="card stack"${dim}><div class="row">${avatar(s, 'lg')}<div style="min-width:0"><h3>${esc(s.name)}</h3><div>${esc(s.role)}</div><div class="muted small">${esc(sh.name)} shift${n.state === 'off' || n.state === 'sick' ? '' : ', ' + clockText(sh.start) + ' to ' + clockText(sh.end)}</div></div></div>
    <div class="row"><span class="chip ${cls}">${word}</span><span class="small">${esc(n.label)}${n.until ? ` until ${clockText(n.until)}` : ''}${next}</span></div>
    ${when}
    <div class="row small"><span class="chip ${staffMoodClass(s.mood)}">${moodWordStaff(s.mood)}</span><span class="chip">Jobs ${s.used}/${STAFF_CAP}</span><button class="btn sm ghost right" data-act="editStaff" data-id="${s.id}">Edit</button></div></div>`;
}

function tabShift() {
  const groups = {};
  S.staff.forEach(s => { (groups[staffNow(s).state] = groups[staffNow(s).state] || []).push(s); });
  const titles = { busy: 'Working now', free: 'Available now', before: 'Starting later', after: 'Finished for the day', sick: 'Off sick', off: 'Day off today' };
  const sections = STATE_ORDER.filter(k => groups[k]).map(k => `<div class="section-title"><h3>${titles[k]}</h3><span class="chip">${groups[k].length}</span></div><div class="grid g3">${groups[k].map(shiftCard).join('')}</div>`).join('');
  return `<div class="page">${clockCard()}</div>${sections || '<div class="card empty">You have no staff. Open Recruitment.</div>'}`;
}

function tabPeople() {
  if (!S.staff.length) return '<div class="card empty">You have no staff. Open Recruitment.</div>';
  return `<div class="grid g3">${S.staff.map(s => { const st = rotaStats(s); return `<div class="card stack">
      <div class="row">${avatar(s, 'lg')}<div style="min-width:0"><h3>${esc(s.name)}</h3><div>${esc(s.role)}</div><div class="muted small">${esc(s.trait)}</div></div></div>
      <div class="row small"><span>Skill</span><span class="stars">${stars(s.skill)}</span><span class="muted" style="margin-left:10px">Reliability</span><span class="stars">${stars(s.reliability)}</span></div>
      <div><div class="row small"><span>Mood</span><span class="chip ${staffMoodClass(s.mood)} right">${moodWordStaff(s.mood)} ${s.mood}</span></div><div class="bar ${staffMoodClass(s.mood) || 'good'}" style="margin-top:4px"><i style="width:${s.mood}%"></i></div>
        <div class="muted small" style="margin-top:4px">${s.streak ? `${s.streak} day${s.streak > 1 ? 's' : ''} worked in a row.` : 'Rested.'} ${s.streak >= 6 ? 'Needs a day off.' : ''}</div></div>
      <div class="row small"><b>${money(s.wage)}</b><span class="muted">per day worked</span><span class="right muted">${st.days} days, ${st.hours} hours a fortnight</span></div>
      <div class="row" role="group" aria-label="Shift">${Object.entries(SHIFTS).map(([k, v]) => `<button class="btn sm ${s.shift === k ? 'primary' : 'ghost'}" data-act="staffShift" data-id="${s.id}" data-shift="${k}" title="${clockText(v.start)} to ${clockText(v.end)}">${v.name}</button>`).join('')}</div>
      <div class="row"><button class="btn sm ghost" data-act="editStaff" data-id="${s.id}">Edit and photo</button><button class="btn sm danger right" data-act="fireAsk" data-id="${s.id}">Fire</button></div></div>`; }).join('')}</div>`;
}

function tabRota() {
  const days = Array.from({ length: ROTA_DAYS }, (_, i) => S.day + i);
  const head = days.map((day, i) => `<th class="${i === 0 ? 'today' : ''}">${DAYS[day % 7]}<br><small>${day + 1}</small></th>`).join('');
  const rows = S.staff.map(s => `<tr><td class="l sticky"><div class="row" style="flex-wrap:nowrap">${avatar(s, 'sm')}<div><b>${esc(s.name)}</b><div class="muted small">${esc(s.role)}, ${esc(shiftOf(s).name.toLowerCase())}</div></div></div></td>
    ${days.map((day, i) => { const idx = rotaIdx(day), on = s.rota[idx], sick = on && i < s.sickDays;
      return `<td class="${i === 0 ? 'today' : ''}"><button class="cell ${on ? (sick ? 'sick' : 'on') : ''}" data-act="rota" data-id="${s.id}" data-i="${idx}" aria-label="${esc(s.name)}, ${DAYS[day % 7]} day ${day + 1}: ${on ? (sick ? 'sick' : 'working') : 'off'}">${on ? (sick ? 'Sick' : 'On') : 'Off'}</button></td>`; }).join('')}
    <td class="small"><b>${money(rotaStats(s).cost)}</b></td></tr>`).join('');
  const roles = [...new Set(S.staff.map(s => s.role))];
  const coverRows = roles.map(role => `<tr><td class="l sticky"><b>${esc(role)}</b></td>${days.map((day, i) => { const n = dayCover(day)[role] || 0; return `<td class="${i === 0 ? 'today' : ''}"><span class="mark ${n ? 'ok' : 'no'}">${n}</span></td>`; }).join('')}<td></td></tr>`).join('');
  const facRows = visibleFacilities().map(f => `<tr><td class="l sticky"><b>${f.name}</b></td>${days.map((day, i) => `<td class="${i === 0 ? 'today' : ''}">${facilityStatus(f, day).open ? '<span class="mark ok">Open</span>' : '<span class="mark no">Shut</span>'}</td>`).join('')}<td></td></tr>`).join('');
  const bill = S.staff.reduce((a, s) => a + rotaStats(s).cost, 0);
  return `<div class="card scroll-x"><table class="rota"><thead><tr><th class="l sticky">Team</th>${head}<th>Cost</th></tr></thead><tbody>${rows}
      <tr><td class="l sticky" colspan="16" style="padding-top:20px"><b>People on each day</b> <span class="muted small">Red zero means nobody. Managers cover any role.</span></td></tr>${coverRows}
      <tr><td class="l sticky" colspan="16" style="padding-top:20px"><b>Is each facility open?</b> <span class="muted small">Broken equipment also closes a facility.</span></td></tr>${facRows}</tbody></table></div>
    <div class="row" style="margin-top:14px"><b>Wage bill for the fortnight: ${money(bill)}</b><span class="muted small">The rota repeats every 14 days. Tap a cell to switch a day on or off. Changing today takes effect straight away.</span></div>`;
}

function tabHire() {
  return `${hireGuide()}<div class="card"><h3>Advertise for a specific role (${money(ADVERT_COST)})</h3>
    <div class="row" style="margin-top:12px">${availableRoles().map(r => `<button class="btn sm ghost" data-act="advert" data-role="${esc(r)}">${esc(r)}</button>`).join('')}</div></div>
    <div class="section-title"><h3>Applicants</h3><span class="chip">${S.candidates.length}</span><span class="chip">Team ${S.staff.length} of ${staffLimit()}</span><span class="muted small">New applicants arrive every morning.</span></div>
    ${S.candidates.length ? `<div class="grid g3">${S.candidates.map(c => `<div class="card stack">
      <div class="row">${avatar(c, 'lg')}<div><b>${esc(c.name)}</b><div>${esc(c.role)}</div><div class="muted small">${esc(c.trait)}</div></div></div>
      <div class="row small"><span>Skill</span><span class="stars">${stars(c.skill)}</span><span class="muted" style="margin-left:10px">Reliability</span><span class="stars">${stars(c.reliability)}</span></div>
      ${candidateAdvice(c)}
      <div class="row"><b>${money(c.wage)}</b><span class="muted small">per day, ${esc(SHIFTS[ROLE_SHIFT[c.role] || 'day'].name.toLowerCase())} shift</span><button class="btn sm good right" data-act="hire" data-id="${c.id}">Hire</button></div></div>`).join('')}</div>` : '<div class="card empty">No applicants right now.</div>'}`;
}

function viewStaff() {
  const tabs = [['shift', 'On shift'], ['people', 'People'], ['rota', '14-day rota'], ['hire', 'Recruitment']];
  if (!tabs.some(t => t[0] === ui.staffTab)) ui.staffTab = 'shift';
  const body = { shift: tabShift, people: tabPeople, rota: tabRota, hire: tabHire }[ui.staffTab]();
  return `<div class="pagehead"><div><h2>Team</h2><p>${onDutyNow().length} of ${S.staff.length} working today. ${S.staff.filter(s => s.sickDays > 0).length ? S.staff.filter(s => s.sickDays > 0).length + ' off sick.' : 'Nobody off sick.'}</p></div></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${ui.staffTab === k ? 'active' : ''}" data-act="staffTab" data-tab="${k}">${l}</button>`).join('')}</div>${body}`;
}
VIEWS.staff = viewStaff;

actions.staffTab = d => { ui.staffTab = d.tab; render(); };
actions.advanceTime = d => {
  const done = advanceClock(d.mins === 'end' ? DAY_END - S.clock : Number(d.mins));
  if (done.length) toast(`${done.length} job${done.length > 1 ? 's' : ''} finished.`, 'good');
  commit();
};
actions.rota = d => {
  const s = staffById(Number(d.id));
  if (!s) return;
  const r = setRotaDay(s.id, Number(d.i), !s.rota[Number(d.i)]);
  if (!r.ok) toast(r.error, 'bad');
  commit();
};
actions.staffShift = d => {
  const r = setShift(Number(d.id), d.shift);
  if (!r.ok) toast(r.error, 'bad');
  commit();
};
