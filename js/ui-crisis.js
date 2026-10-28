'use strict';

/* ================= Crises, preparing and standards on screen =================
   The warning and crisis banners on the Dashboard, the Crisis page (what people are saying, what she can do today, preparing, safeguards, medals
   and heroes), the pop-ups when a warning or crisis begins and ends, the hero certificate, the standards card, and the inspector's result in
   the day report. The skill games themselves are in ui-crisisgames.js. */

NAV.splice(NAV.findIndex(n => n[0] === 'incidents') + 1, 0, ['crisis', 'alert', 'Crisis', null, 'Hotel']);

const pct = p => `${Math.round(p * 100)}%`;
const GAME_NAMES = { timing: 'Timing game', tap: 'Tapping game', choice: 'Word game', order: 'Order game' };
const crisisEffects = c => {
  const def = CRISES[c.key], out = [];
  const rooms = c.roomIds.map(id => roomById(id)).filter(r => r && r.damaged);
  if (rooms.length) out.push(`${rooms.length} room${rooms.length > 1 ? 's' : ''} out of service`);
  if ((c.closes || []).includes('restaurant')) out.push('Restaurant closed');
  if (c.reviewHit) out.push('Reviews are being dragged down');
  if (def.mood) out.push('Guests get more upset every night');
  if (c.mild) out.push('Milder: you prepared');
  if (c.guarded) out.push('Milder: your safeguard');
  return out;
};
/* A picture for a crisis, if there is one. Crisis pictures are optional: with none, nothing shows. */
const crisisPicture = key => { const src = `assets/scenes/crisis-${key}.jpg`; return missingImgs.has(src) ? '' : imgHtml(src, { fb: 'none', alt: CRISES[key].name }); };
const warnDays = w => w.due - S.day <= 0 ? 'today' : w.due - S.day === 1 ? 'tomorrow' : 'the day after tomorrow';

/* ---------- On the Dashboard ---------- */
function crisisBanner() {
  const w = S.warning;
  const warn = w ? `<div class="card warn-card"><div class="row"><h3>Warning: ${esc(CRISES[w.key].name)} may be coming</h3><span class="chip warn">Prepared ${w.points} of ${CRISIS.warnPoints}</span><button class="btn primary right" data-act="nav" data-view="crisis">Prepare</button></div>
    <div class="small muted" style="margin-top:6px">${esc(CRISES[w.key].warn.text)} It may hit ${warnDays(w)}. Two preparations stop it completely.</div></div>` : '';
  return warn + S.crises.map(c => {
    const def = CRISES[c.key], tonight = clamp(c.trouble + crisisGrowth(def), 0, 100);
    return `<div class="card crisis-card"><div class="row"><h3>Crisis: ${esc(def.name)}</h3><span class="chip bad">Day ${c.daysOpen + 1}</span><button class="btn primary right" data-act="nav" data-view="crisis">Deal with it</button></div>
      <div class="row small" style="margin-top:8px"><span style="min-width:62px">Trouble</span><div class="bar bad" style="flex:1"><i style="width:${c.trouble}%"></i></div><b>${c.trouble}</b></div>
      <div class="row small"><span style="min-width:62px">Progress</span><div class="bar good" style="flex:1"><i style="width:${c.fix}%"></i></div><b>${c.fix}</b></div>
      <div class="small muted" style="margin-top:6px">${tonight >= 100 ? '<b>It will blow up tonight unless you act.</b>' : `Trouble will be ${tonight} tonight if nothing is done.`}</div></div>`;
  }).join('');
}

const STD_PARTS = [['clean', 'Cleanliness', 'Get dirty and damaged rooms cleaned and repaired.'], ['kit', 'Equipment', 'Service worn equipment and repair what is broken.'], ['care', 'Guest care', 'Deal with complaints and guest requests.']];
function standardsCard() {
  const st = S.standards, word = standardsWord(st.score), cls = st.score >= 80 ? 'good' : st.score >= 60 ? '' : st.score >= 45 ? 'warn' : 'bad';
  const weakest = STD_PARTS.slice().sort((a, b) => st.parts[a[0]] - st.parts[b[0]])[0], days = inspectionDays();
  const visit = st.noticed ? `<b>The Star Inspector visits ${days <= 0 ? 'tonight' : days === 1 ? 'tomorrow' : `in ${days} days`}.</b> Get everything ready.` : `The Star Inspector visits in about ${Math.max(days, 1)} days.`;
  return `<div class="card"><div class="row"><h3>Hotel standards</h3><span class="chip ${cls}">${esc(word)}</span><b class="right" style="font-size:1.4rem">${st.score}<span class="muted" style="font-size:.9rem">/100</span></b></div>
    <div class="bar ${cls}" style="margin:6px 0 10px"><i style="width:${st.score}%"></i></div>
    <div class="grid g3">${STD_PARTS.map(([k, l]) => `<div><div class="row small"><span>${l}</span><b class="right">${st.parts[k]}</b></div><div class="bar ${st.parts[k] >= 80 ? 'good' : st.parts[k] >= 55 ? '' : 'bad'}"><i style="width:${st.parts[k]}%"></i></div></div>`).join('')}</div>
    <div class="small muted" style="margin-top:10px">${visit} ${st.score < 80 ? `Weakest: ${weakest[1].toLowerCase()}. ${weakest[2]}` : 'Keep it up: a high score makes crises rarer.'}${st.last ? ` Last visit: ${esc(st.last.result)} (${st.last.score}).` : ''}</div></div>`;
}

/* ---------- The Crisis page ---------- */
const voiceFace = v => v.kind === 'staff' && staffById(v.staffId) ? avatar(staffById(v.staffId), 'md') : imgHtml(guestFacePath(v.name, v.gender), { fb: 'avatar', size: 'md', ini: initials(v.name), alt: v.name });
const voicesHtml = c => `<div class="voices">${crisisVoices(c).map(v => `<div class="voice"><span class="vface">${voiceFace(v)}</span><div class="vbody"><b class="small">${esc(v.name)}${v.kind === 'staff' ? ` <span class="muted">(${esc(staffById(v.staffId).role)})</span>` : ''}</b><div class="bubble" style="animation:none">${esc(v.text)}</div></div></div>`).join('')}</div>`;
const staffEdge = (x, a) => x.edge ? `<small class="edge">${esc(x.s.trait)}: ${TRAIT_HELP[a.game.type]}</small>` : '';

function crisisActionRow(c, a) {
  const st = crisisActionState(c, a);
  const chips = [st.cost ? `<span class="chip warn">${money(st.cost)}</span>` : '', st.role ? `<span class="chip info">${st.jobs} job${st.jobs > 1 ? 's' : ''}, ${esc(st.role)}</span>` : '',
    a.game ? `<span class="chip good">${GAME_NAMES[a.game.type]}</span>` : a.write ? '<span class="chip good">Your own words</span>' : a.odds === null || a.odds === undefined ? '<span class="chip good">Certain</span>' : `<span class="chip">${pct(st.odds)} chance</span>`].join('');
  let control;
  if (!st.ok) control = `<div class="small muted">${esc(st.reason)}</div>`;
  else if (a.write) control = `<form data-form="crisisNotice" class="stack"><input type="hidden" name="id" value="${c.id}"><textarea name="text" rows="3" maxlength="160" placeholder="Dear guests, ..." required></textarea><div><button class="btn primary sm" type="submit">Put the notice up</button></div></form>`;
  else if (a.role) control = `<div class="small muted" style="margin:6px 0">Who will do it? ${a.game ? 'Experience and the right trait make the game easier.' : 'The chance is shown for each person.'}</div><div class="staffchips">${st.staff.slice(0, 6).map(x => `<button class="pick" data-act="${a.game ? 'crisisPlay' : 'crisisAct'}" data-id="${c.id}" data-key="${a.key}" data-staff="${x.s.id}">${avatar(x.s, 'sm')}<span>${esc(x.s.name.split(' ')[0])} <small>${stars(x.s.skill)}${a.game ? '' : ' ' + pct(x.odds)}</small>${staffEdge(x, a)}</span></button>`).join('')}</div>`;
  else if (a.game) control = `<div><button class="btn primary sm" data-act="crisisPlay" data-id="${c.id}" data-key="${a.key}">Play it</button> <span class="small muted">or leave it to chance (${pct(st.odds)}) from inside.</span></div>`;
  else control = `<div><button class="btn primary sm" data-act="crisisAct" data-id="${c.id}" data-key="${a.key}">Do it${a.odds === null || a.odds === undefined ? '' : ` (${pct(st.odds)} chance)`}</button></div>`;
  return `<div class="card stack ${st.ok ? '' : 'dim'}" style="box-shadow:none;background:var(--surface2)"><div class="row"><b>${esc(a.label)}</b>${chips}</div><div class="small muted">${esc(a.hint)}</div>${control}</div>`;
}
function prepRow(p) {
  const st = prepState(p);
  const chips = [st.cost ? `<span class="chip warn">${money(st.cost)}</span>` : '', st.role ? `<span class="chip info">${st.jobs} job, ${esc(st.role)}</span>` : '', '<span class="chip good">Certain</span>'].join('');
  let control;
  if (S.warning.done[p.key]) control = '<span class="chip good">Done</span>';
  else if (!st.ok) control = `<div class="small muted">${esc(st.reason)}</div>`;
  else if (p.role) control = `<div class="staffchips">${st.staff.slice(0, 6).map(s => `<button class="pick" data-act="prepAct" data-key="${p.key}" data-staff="${s.id}">${avatar(s, 'sm')}<span>${esc(s.name.split(' ')[0])} <small>${stars(s.skill)}</small></span></button>`).join('')}</div>`;
  else control = `<div><button class="btn primary sm" data-act="prepAct" data-key="${p.key}">Do it</button></div>`;
  return `<div class="card stack ${S.warning.done[p.key] ? 'dim' : ''}" style="box-shadow:none;background:var(--surface2)"><div class="row"><b>${esc(p.label)}</b>${chips}</div><div class="small muted">${esc(p.hint)}</div>${control}</div>`;
}
function warningCard() {
  const w = S.warning, def = CRISES[w.key];
  return `<div class="card stack warn-card"><div class="row"><h3>Warning: ${esc(def.name)} may be coming</h3><span class="chip warn">It may hit ${warnDays(w)}</span></div>
    <p style="margin:0">${esc(def.warn.text)}</p>
    <div class="row small"><span style="min-width:90px">Prepared</span><div class="bar good" style="flex:1"><i style="width:${Math.min(100, w.points / CRISIS.warnPoints * 100)}%"></i></div><b>${w.points} of ${CRISIS.warnPoints}</b></div>
    <div class="small muted" style="margin-top:-6px">Two preparations stop it completely. One makes it milder. None, and it hits in full.</div>
    <div class="stack">${def.warn.prep.map(prepRow).join('')}</div></div>`;
}
function crisisCard(c) {
  const def = CRISES[c.key], tonight = clamp(c.trouble + crisisGrowth(def), 0, 100), fx = crisisEffects(c);
  return `<div class="card stack crisis-card">${crisisPicture(c.key)}<div class="row"><h3>${esc(def.name)}</h3><span class="chip bad">Day ${c.daysOpen + 1}</span></div>
    <p style="margin:0">${esc(c.log[0] ? c.log[0].text : '')}</p>
    ${voicesHtml(c)}
    <div class="row small"><span style="min-width:62px">Trouble</span><div class="bar bad" style="flex:1"><i style="width:${c.trouble}%"></i></div><b>${c.trouble}</b></div>
    <div class="small muted" style="margin-top:-6px">Goes up by ${crisisGrowth(def)} every night and blows up at 100. ${tonight >= 100 ? '<b>It will blow up tonight unless you act.</b>' : `Tonight it will be ${tonight}.`}</div>
    <div class="row small"><span style="min-width:62px">Progress</span><div class="bar good" style="flex:1"><i style="width:${c.fix}%"></i></div><b>${c.fix}</b></div>
    <div class="small muted" style="margin-top:-6px">Reach 100 to solve it and earn about ${money(Math.round(def.reward * crisisScale() * (1 + crisisPerks().reward)))}. If it blows up it costs about ${money(Math.round(def.fine * crisisScale()))}.</div>
    ${fx.length ? `<div class="row">${fx.map(t => `<span class="chip warn">${esc(t)}</span>`).join('')}</div>` : ''}
    <h3 style="margin-top:8px">What you can do today</h3><div class="stack">${crisisActionsOf(def).map(a => crisisActionRow(c, a)).join('')}</div>
    ${c.notice ? `<div class="small"><b>Your notice:</b> &ldquo;${esc(c.notice)}&rdquo;</div>` : ''}
    ${c.log.length > 1 ? `<div class="small muted"><b>What has happened</b><ul style="margin:4px 0 0;padding-left:18px">${c.log.slice(1).reverse().slice(0, 6).map(l => `<li>Day ${l.day + 1}: ${esc(l.text)}${l.perfect ? ' Perfect!' : ''}</li>`).join('')}</ul></div>` : ''}</div>`;
}

function safeguardsCard() {
  return `<div class="section-title"><h3>Prepare for trouble</h3></div>
    <div class="card"><p class="muted small" style="margin-top:0">A safeguard, bought once, makes that kind of crisis much rarer, and milder if it does come. Preparing costs less than a crisis.</p>
    <div class="grid g2">${Object.keys(SAFEGUARDS).map(k => { const g = SAFEGUARDS[k], own = hasGuard(k);
      return `<div class="card stack ${own ? 'dim' : ''}" style="box-shadow:none;background:var(--surface2)"><div class="row"><b>${esc(g.name)}</b>${own ? '<span class="chip good right">Owned</span>' : `<span class="chip warn right">${money(g.cost)}</span>`}</div><div class="small muted">${esc(g.text)}</div>
        ${own ? '' : `<div><button class="btn sm primary" data-act="buyGuard" data-key="${k}">Buy it</button></div>`}</div>`; }).join('')}</div></div>`;
}
function medalsCard() {
  const n = medalCount(), next = CRISIS_PERKS.find(p => p[0] > n);
  return `<div class="section-title"><h3>Medals</h3><span class="chip">${n} of ${MEDALS.length}</span></div>
    <div class="card"><div class="medals">${MEDALS.map(m => `<div class="medal ${S.medals[m.key] !== undefined ? 'won' : ''}" title="${esc(m.desc)}"><b>${esc(m.name)}</b><small>${esc(m.desc)}</small>${S.medals[m.key] !== undefined ? `<span class="chip good">Day ${S.medals[m.key] + 1}</span>` : ''}</div>`).join('')}</div>
    <h3 style="margin-top:14px">Perks</h3><div class="stack">${CRISIS_PERKS.map(p => `<div class="row small"><span class="chip ${n >= p[0] ? 'good' : ''}">${n >= p[0] ? 'Unlocked' : `${p[0]} medals`}</span><b>${esc(p[1])}</b><span class="muted">${esc(p[2])}</span></div>`).join('')}</div>
    ${next ? `<div class="small muted" style="margin-top:8px">${next[0] - n} more medal${next[0] - n > 1 ? 's' : ''} to unlock ${esc(next[1])}.</div>` : ''}</div>`;
}
function heroesCard() {
  if (!S.heroLog.length) return '';
  return `<div class="section-title"><h3>Heroes of the hotel</h3></div><div class="card list">${S.heroLog.map((h, i) => `<div class="row"><b>${esc(h.name)}</b><span class="muted small">${esc(h.role)}, ${esc(h.crisis)}, day ${h.day + 1}</span>${h.promoted ? '<span class="chip good">Promoted</span>' : ''}<button class="btn sm ghost right" data-act="heroCert" data-i="${i}">Certificate</button></div>`).join('')}</div>`;
}
function viewCrisis() {
  const quiet = !S.crises.length && !S.warning;
  return `<div class="pagehead"><div><h2>Crisis</h2><p>${quiet ? 'Nothing is wrong right now. Keep standards high, prepare, and crises stay rare.' : 'Trouble grows every night. Build Progress to 100 before Trouble reaches 100. Each action costs cash or jobs from your team. Play the skill games well and it goes better.'}</p></div></div>
    ${S.warning ? warningCard() : ''}${S.crises.map(crisisCard).join('')}
    ${standardsCard()}${safeguardsCard()}${medalsCard()}${heroesCard()}
    ${S.crisisLog.length ? `<div class="section-title"><h3>Past crises</h3></div><div class="card list">${S.crisisLog.map(l => `<div class="row"><span class="chip ${l.outcome === 'resolved' ? 'good' : 'bad'}">${l.outcome === 'resolved' ? 'Handled' : 'Out of hand'}</span><span>${esc(l.name)}</span><span class="muted small right">Day ${l.day + 1}</span></div>`).join('')}</div>` : ''}`;
}
VIEWS.crisis = viewCrisis;

/* ---------- Actions ---------- */
/* Shows what an action did: a note on screen, or the celebration when it solved the crisis. */
function crisisOutcome(r) {
  if (!r.ok) { toast(r.error, 'bad'); commit(); return; }
  if (r.resolved) { sfx('award'); ui.modal = { type: 'crisisDone', name: r.name, reward: r.reward, text: r.text, hero: r.hero, medals: r.medals.map(m => m.name) }; commit(); return; }
  sfx(r.perfect ? 'award' : r.success ? 'good' : 'bad');
  toast(`${r.text}${r.perfect ? ' Perfect! Extra progress.' : ''}`, r.success ? 'good' : 'bad');
  commit();
}
actions.crisisAct = d => crisisOutcome(doCrisisAction(Number(d.id), d.key, d.staff));
forms.crisisNotice = f => crisisOutcome(doCrisisAction(Number(f.get('id')), 'notice', null, undefined, f.get('text')));
actions.prepAct = d => {
  const r = doPrep(d.key, d.staff);
  if (!r.ok) { toast(r.error, 'bad'); commit(); return; }
  sfx('good'); toast(r.text, 'good'); commit();
};
actions.buyGuard = d => {
  const r = buySafeguard(d.key);
  if (!r.ok) { toast(r.error, 'bad'); commit(); return; }
  sfx('cash'); toast(`${r.name} bought.`, 'good'); commit();
};
actions.heroCert = d => openModal({ type: 'heroCert', index: Number(d.i) });

/* ---------- Pop-ups ---------- */
MODALS.crisisIntro = m => {
  const c = crisisById(m.id);
  if (!c) return null;
  const def = CRISES[c.key], fx = crisisEffects(c);
  return { inner: `<div class="confcard" style="text-align:left">${crisisPicture(c.key)}<div class="chip bad">Crisis</div><h2 style="margin-top:8px">${esc(def.name)}</h2><p>${esc(c.log[0] ? c.log[0].text : '')}</p>
    ${fx.length ? `<div class="row">${fx.map(t => `<span class="chip warn">${esc(t)}</span>`).join('')}</div>` : ''}
    <p class="muted small">This one will not go away by itself. Trouble grows every night, and if it reaches 100 the crisis blows up and costs you. Build Progress to 100 to solve it. Your team's jobs and your cash are both needed, so choose carefully, and play the skill games well.</p></div>
    <div class="actions"><button class="btn ghost" data-act="closeModal">Look later</button><button class="btn primary big" data-act="nav" data-view="crisis">Deal with it</button></div>` };
};
MODALS.warningIntro = () => {
  const w = S.warning;
  if (!w) return null;
  const def = CRISES[w.key];
  return { inner: `<div class="confcard" style="text-align:left"><div class="chip warn">Warning</div><h2 style="margin-top:8px">${esc(def.name)} may be coming</h2><p>${esc(def.warn.text)}</p>
    <p class="muted small">It may hit ${warnDays(w)}. Do two of the preparations and it never happens. Do one and it is milder. Do none and it hits in full.</p></div>
    <div class="actions"><button class="btn ghost" data-act="closeModal">Later</button><button class="btn primary big" data-act="nav" data-view="crisis">Prepare</button></div>` };
};
MODALS.crisisDone = m => ({ inner: `<div class="confcard"><div class="chip good">Crisis over</div><h2 style="margin-top:8px">${esc(m.name)}: solved</h2><p>${esc(m.text)}</p>
  <div class="row" style="justify-content:center"><span class="chip good">Thank-you bonus +${money(m.reward)}</span></div>
  ${m.hero ? `<div class="alert good" style="margin-top:12px;text-align:left"><b>${esc(m.hero.name)} is the hero of the hotel!</b> ${m.hero.promoted ? 'They have been promoted, with a higher wage to match.' : 'They could not be more experienced already.'}</div>` : ''}
  ${m.medals && m.medals.length ? `<div class="row" style="justify-content:center;margin-top:8px">${m.medals.map(n => `<span class="chip warn">Medal: ${esc(n)}</span>`).join('')}</div>` : ''}
  <p class="muted small">Any damage is put right, guests are happier, and standards went up.</p></div>
  <div class="actions">${m.hero ? '<button class="btn ghost" data-act="heroCert" data-i="0">See the certificate</button>' : ''}<button class="btn primary big" data-act="closeModal">Well done</button></div>` });
MODALS.heroCert = m => {
  const h = S.heroLog[m.index];
  if (!h) return null;
  return { inner: `<div class="confcard"><img class="logo-mid" src="icons/logo-small.png" alt="" width="420" height="279"><div class="conf-sub">Hero of the hotel</div>
    <p style="margin:10px 0">This certifies that</p><div class="conf-title">${esc(h.name)}</div>
    <p style="margin:10px 0">of the ${esc(h.role)} team</p><p style="margin:10px 0">saved the day during the ${esc(h.crisis.toLowerCase())}, on day ${h.day + 1}.</p>
    <div class="conf-welcome">${esc(S.owner)}<small>${esc(S.hotel)}</small></div></div>
    <div class="actions"><button class="btn primary big" data-act="closeModal">Done</button></div>` };
};

/* A warning or crisis that began overnight is announced when the hotel opens. */
function announceCrisis() {
  if (!isOnline()) return false;
  const c = S.crises.find(x => !x.seen);
  if (c) { c.seen = true; ui.modal = { type: 'crisisIntro', id: c.id }; sfx('bad'); render(); return true; }
  if (S.warning && !S.warning.seen) { S.warning.seen = true; ui.modal = { type: 'warningIntro' }; sfx('tick'); render(); return true; }
  return false;
}
/* Medals that were just won are announced once, wherever they were won. */
AFTER_RENDER.push(function announceMedals() {
  if (!S || !S.medalQueue || !S.medalQueue.length) return;
  const names = S.medalQueue.splice(0).map(k => (MEDALS.find(m => m.key === k) || {}).name).filter(Boolean);
  names.forEach(n => toast(`Medal won: ${n}!`, 'good'));
  if (names.length) sfx('award');
});

/* ---------- In the day report: the inspector ---------- */
function inspectionBlock(r) {
  const cls = r.result === 'Excellent' ? 'good' : r.result === 'Good' ? 'good' : r.result === 'Failed' ? 'bad' : 'warn';
  return `<div class="alert ${cls}" style="margin-bottom:12px"><b>Star Inspector: ${esc(r.result)}</b> (standards ${r.score}). ${esc(r.text)}${r.money > 0 ? ` Reward ${money(r.money)}.` : r.money < 0 ? ` Fine ${money(-r.money)}.` : ''}</div>`;
}
