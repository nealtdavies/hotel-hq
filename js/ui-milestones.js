'use strict';
/* ================= Goals: the next earnings milestone, the full ladder, and the welcome-back screen ================= */

/* The player's own calendar date as YYYY-MM-DD, `back` days ago. */
function localDate(back) {
  const d = new Date(); d.setDate(d.getDate() - (back || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function milestoneCard() {
  const p = milestoneProgress();
  if (!p) return `<div class="card goal"><div class="row"><h3>Goals</h3><span class="chip good right">All reached</span></div><p class="muted small" style="margin:6px 0 0">You have reached every goal. You are a Hotel empire.</p></div>`;
  const reward = p.unlock ? `<span class="chip warn right">Unlocks ${esc(p.unlock.name)}</span>` : `<span class="chip right">${p.index + 1} of ${MILESTONES.length}</span>`;
  return `<div class="card goal"><div class="row"><h3>Next goal: ${esc(p.name)}</h3>${reward}</div>
    <div class="row goalline"><div class="bar" style="flex:1" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}"><i style="width:${p.pct}%"></i></div><b>${p.pct}%</b></div>
    <div class="row small"><span><b>${money(p.left)}</b> more income to go</span><button class="btn sm ghost right" data-act="openMilestones">All goals</button></div>
    ${p.unlock ? `<div class="muted small" style="margin-top:6px">${esc(p.unlock.blurb)} It costs nothing to open.</div>` : ''}</div>`;
}

MODALS.milestones = () => {
  const rows = MILESTONES.map((m, i) => {
    const done = i < S.milestones.done, f = m.unlock ? FEATURES[m.unlock] : null;
    return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="tick ${done ? 'done' : ''}" aria-hidden="true">${done ? '&#10003;' : ''}</span>
      <div style="flex:1;min-width:150px"><b class="${done ? 'muted' : ''}">${esc(m.name)}</b>${f ? `<div class="small ${done ? 'muted' : ''}">Unlocks: ${esc(f.name)}</div>` : ''}</div>
      <span class="small muted">${money(m.need)}</span></div>`;
  }).join('');
  return { wide: false, inner: `<h2>Goals</h2><p class="muted small">Income from guests adds up towards each goal, and it never goes down. Some goals open something new for your hotel, free.</p>
    <div class="row" style="margin:8px 0"><span class="chip good">Earned so far ${money(S.earned)}</span><span class="chip">Your title: ${esc(currentRank().name)}</span></div>
    ${S.career.certs.length ? `<div class="row" style="margin:8px 0">${S.career.certs.map((c, i) => `<button class="btn sm ghost" data-act="certOpen" data-i="${i}">Certificate: ${esc(c.rank)}</button>`).join('')}</div>` : ''}${rows}
    <div class="actions"><button class="btn primary" data-act="closeModal">Close</button></div>` };
};
actions.openMilestones = () => openModal({ type: 'milestones' });

/* Shown once on the first visit of each real day. */
MODALS.welcome = m => {
  const p = milestoneProgress(), v = m.visit, unread = S.mail.items.filter(x => !S.mail.read[x.id]).length;
  const goals = S.challenges.daily.map(k => challengeDef(k)).filter(Boolean).map(d => `<li>${esc(d.name)}</li>`).join('');
  return { inner: `<img class="logo-mid" src="icons/logo-small.png" alt="Hotel HQ" width="420" height="279"><h2 style="text-align:center">Welcome back, ${esc(S.owner)}!</h2>
    <div class="row" style="margin:6px 0 14px"><span class="chip good">${v.streak} ${v.streak === 1 ? 'day' : 'days'} in a row</span><span class="chip warn">+${money(v.bonus)} welcome back bonus</span></div>
    <p class="muted small" style="margin:0 0 12px">Come back every day to keep the streak going and the bonus growing, up to ${VISIT_STREAK_CAP} days.</p>
    <div class="card" style="box-shadow:none;background:var(--surface2)"><b>${esc(S.hotel)}</b><div class="small muted">${esc(tierInfo().name)}, day ${S.day + 1}. Cash ${money(S.money)}. Rating ${rating().toFixed(1)}.</div></div>
    ${p ? `<h3 style="margin-top:16px">Next goal: ${esc(p.name)}</h3><div class="bar" style="margin:6px 0"><i style="width:${p.pct}%"></i></div><div class="small muted">${money(p.left)} more income${p.unlock ? ` to open the ${esc(p.unlock.name)}` : ''}.</div>` : ''}
    ${goals ? `<h3 style="margin-top:16px">Today's challenges</h3><ul>${goals}</ul>` : ''}
    ${unread ? `<div class="small muted">${unread} unread ${unread === 1 ? 'message' : 'messages'} in your Inbox.</div>` : ''}
    <div class="actions"><button class="btn primary big" data-act="closeModal">Let's go</button></div>` };
};

/* Called when the game opens with a saved hotel. */
function welcomeBack() {
  if (!S || ui.modal) return;
  const v = registerVisit(localDate(0), localDate(1));
  if (!v) return;
  writeSave();
  sfx('cash');
  openModal({ type: 'welcome', visit: v });
}
