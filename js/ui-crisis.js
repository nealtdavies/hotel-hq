'use strict';

/* ================= Crises and standards on screen =================
   The crisis banner on the Dashboard, the Crisis page where each day's actions are chosen (with the chance of each one working), the pop-ups when
   a crisis begins and ends, the standards card, and the inspector's result in the day report. */

NAV.splice(NAV.findIndex(n => n[0] === 'incidents') + 1, 0, ['crisis', 'alert', 'Crisis', () => S.crises.length > 0, 'Hotel']);

const pct = p => `${Math.round(p * 100)}%`;
const crisisEffects = c => {
  const def = CRISES[c.key], out = [];
  const rooms = c.roomIds.map(id => roomById(id)).filter(r => r && r.damaged);
  if (rooms.length) out.push(`${rooms.length} room${rooms.length > 1 ? 's' : ''} out of service`);
  if ((c.closes || []).includes('restaurant')) out.push('Restaurant closed');
  if (c.reviewHit) out.push('Reviews are being dragged down');
  if (def.mood) out.push('Guests get more upset every night');
  return out;
};

/* ---------- On the Dashboard ---------- */
function crisisBanner() {
  return S.crises.map(c => {
    const def = CRISES[c.key], tonight = clamp(c.trouble + def.growth, 0, 100);
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
function crisisActionRow(c, a) {
  const st = crisisActionState(c, a);
  const chips = [st.cost ? `<span class="chip warn">${money(st.cost)}</span>` : '', st.role ? `<span class="chip info">${st.jobs} job${st.jobs > 1 ? 's' : ''}, ${esc(st.role)}</span>` : '', a.odds !== null && a.odds !== undefined && !st.role ? `<span class="chip">${pct(st.odds)} chance</span>` : '', a.odds === null || a.odds === undefined ? '<span class="chip good">Certain</span>' : ''].join('');
  let control;
  if (!st.ok) control = `<div class="small muted">${esc(st.reason)}</div>`;
  else if (a.role) control = `<div class="small muted" style="margin:6px 0">Who will do it? The chance of success is shown for each person; more experienced people do better.</div><div class="staffchips">${st.staff.slice(0, 6).map(x => `<button class="pick" data-act="crisisAct" data-id="${c.id}" data-key="${a.key}" data-staff="${x.s.id}">${avatar(x.s, 'sm')}<span>${esc(x.s.name.split(' ')[0])} <small>${stars(x.s.skill)} ${a.odds === null ? '' : pct(x.odds)}</small></span></button>`).join('')}</div>`;
  else control = `<div><button class="btn primary sm" data-act="crisisAct" data-id="${c.id}" data-key="${a.key}">Do it${a.odds === null || a.odds === undefined ? '' : ` (${pct(st.odds)} chance)`}</button></div>`;
  return `<div class="card stack ${st.ok ? '' : 'dim'}" style="box-shadow:none;background:var(--surface2)"><div class="row"><b>${esc(a.label)}</b>${chips}</div><div class="small muted">${esc(a.hint)}</div>${control}</div>`;
}
function viewCrisis() {
  if (!S.crises.length) return `<div class="pagehead"><div><h2>Crisis</h2><p>Nothing is wrong right now. Keep standards high and crises stay rare.</p></div></div>${standardsCard()}
    ${S.crisisLog.length ? `<div class="section-title"><h3>Past crises</h3></div><div class="card list">${S.crisisLog.map(l => `<div class="row"><span class="chip ${l.outcome === 'resolved' ? 'good' : 'bad'}">${l.outcome === 'resolved' ? 'Handled' : 'Out of hand'}</span><span>${esc(l.name)}</span><span class="muted small right">Day ${l.day + 1}</span></div>`).join('')}</div>` : ''}`;
  return `<div class="pagehead"><div><h2>Crisis</h2><p>Trouble grows every night. Build Progress to 100 before Trouble reaches 100. Each action costs cash or jobs from your team, and some can fail.</p></div></div>
    ${S.crises.map(c => {
      const def = CRISES[c.key], tonight = clamp(c.trouble + def.growth, 0, 100), fx = crisisEffects(c);
      return `<div class="card stack crisis-card"><div class="row"><h3>${esc(def.name)}</h3><span class="chip bad">Day ${c.daysOpen + 1}</span></div>
        <p style="margin:0">${esc(c.log[0] ? c.log[0].text : '')}</p>
        <div class="row small"><span style="min-width:62px">Trouble</span><div class="bar bad" style="flex:1"><i style="width:${c.trouble}%"></i></div><b>${c.trouble}</b></div>
        <div class="small muted" style="margin-top:-6px">Goes up by ${def.growth} every night and blows up at 100. ${tonight >= 100 ? '<b>It will blow up tonight unless you act.</b>' : `Tonight it will be ${tonight}.`}</div>
        <div class="row small"><span style="min-width:62px">Progress</span><div class="bar good" style="flex:1"><i style="width:${c.fix}%"></i></div><b>${c.fix}</b></div>
        <div class="small muted" style="margin-top:-6px">Reach 100 to solve it and earn a reward of about ${money(Math.round(def.reward * crisisScale()))}. If it blows up it costs about ${money(Math.round(def.fine * crisisScale()))}.</div>
        ${fx.length ? `<div class="row">${fx.map(t => `<span class="chip warn">${esc(t)}</span>`).join('')}</div>` : ''}
        <h3 style="margin-top:8px">What you can do today</h3><div class="stack">${def.actions.map(a => crisisActionRow(c, a)).join('')}</div>
        ${c.log.length > 1 ? `<div class="small muted"><b>What has happened</b><ul style="margin:4px 0 0;padding-left:18px">${c.log.slice(1).reverse().slice(0, 6).map(l => `<li>Day ${l.day + 1}: ${esc(l.text)}</li>`).join('')}</ul></div>` : ''}</div>`;
    }).join('')}`;
}
VIEWS.crisis = viewCrisis;

actions.crisisAct = d => {
  const r = doCrisisAction(Number(d.id), d.key, d.staff);
  if (!r.ok) { toast(r.error, 'bad'); commit(); return; }
  if (r.resolved) { sfx('award'); ui.modal = { type: 'crisisDone', name: r.name, reward: r.reward, text: r.text }; commit(); return; }
  sfx(r.success ? 'good' : 'bad');
  toast(r.text, r.success ? 'good' : 'bad');
  commit();
};

/* ---------- Pop-ups ---------- */
MODALS.crisisIntro = m => {
  const c = crisisById(m.id);
  if (!c) return null;
  const def = CRISES[c.key], fx = crisisEffects(c);
  return { inner: `<div class="confcard" style="text-align:left"><div class="chip bad">Crisis</div><h2 style="margin-top:8px">${esc(def.name)}</h2><p>${esc(c.log[0] ? c.log[0].text : '')}</p>
    ${fx.length ? `<div class="row">${fx.map(t => `<span class="chip warn">${esc(t)}</span>`).join('')}</div>` : ''}
    <p class="muted small">This one will not go away by itself. Trouble grows every night, and if it reaches 100 the crisis blows up and costs you. Build Progress to 100 to solve it. Your team's jobs and your cash are both needed, so choose carefully.</p></div>
    <div class="actions"><button class="btn ghost" data-act="closeModal">Look later</button><button class="btn primary big" data-act="nav" data-view="crisis">Deal with it</button></div>` };
};
MODALS.crisisDone = m => ({ inner: `<div class="confcard"><div class="chip good">Crisis over</div><h2 style="margin-top:8px">${esc(m.name)}: solved</h2><p>${esc(m.text)}</p>
  <div class="row" style="justify-content:center"><span class="chip good">Thank-you bonus +${money(m.reward)}</span></div><p class="muted small">Any damage is put right, guests are happier, and standards went up.</p></div>
  <div class="actions"><button class="btn primary big" data-act="closeModal">Well done</button></div>` });

/* A crisis that began overnight is announced when the hotel opens. */
function crisisToAnnounce() { return S.crises.find(c => !c.seen) || null; }
function announceCrisis() {
  const c = crisisToAnnounce();
  if (!c || !isOnline()) return false;
  c.seen = true;
  ui.modal = { type: 'crisisIntro', id: c.id };
  sfx('bad');
  render();
  return true;
}

/* ---------- In the day report: the inspector ---------- */
function inspectionBlock(r) {
  const cls = r.result === 'Excellent' ? 'good' : r.result === 'Good' ? 'good' : r.result === 'Failed' ? 'bad' : 'warn';
  return `<div class="alert ${cls}" style="margin-bottom:12px"><b>Star Inspector: ${esc(r.result)}</b> (standards ${r.score}). ${esc(r.text)}${r.money > 0 ? ` Reward ${money(r.money)}.` : r.money < 0 ? ` Fine ${money(-r.money)}.` : ''}</div>`;
}
