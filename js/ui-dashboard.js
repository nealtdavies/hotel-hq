'use strict';

/* ================= Hotel Dashboard =================
   The overview screen: the hotel, where every room stands, cash flow and forecast, progress towards the next level,
   and everything that needs maintenance or a decision. Registers itself into the shared VIEWS and actions of ui.js. */

const FORECAST_DAYS = 7;

function roomsOverviewCard() {
  const s = roomStatus();
  const parts = [['occupied', 'Occupied', s.occupied, 's-occ', 'var(--info)'], ['ready', 'Ready to let', s.ready, 's-ready', 'var(--good)'],
    ['cleaning', 'Needs cleaning', s.dirty, 's-dirty', '#c98b24'], ['damaged', 'Damaged', s.damaged, 's-dmg', 'var(--bad)']];
  const seg = parts.map(p => p[2] ? `<i class="${p[3]}" style="width:${(p[2] / s.total * 100).toFixed(2)}%" title="${p[1]}: ${p[2]}"></i>` : '').join('');
  const legend = parts.map(p => `<button type="button" data-act="openRooms" data-f="${p[0]}"><span class="sw" style="background:${p[4]}"></span>${p[1]} <b>${p[2]}</b></button>`).join('');
  return `<div class="card"><div class="row"><h3>Rooms</h3><span class="chip right">${s.total} of ${roomLimit()} built</span></div>
    <div class="seg" style="margin-top:14px" role="img" aria-label="Room status">${seg}</div><div class="legend">${legend}</div>
    <div class="list" style="margin-top:12px">${[...new Set(S.rooms.map(r => r.type))].map(t => { const of = S.rooms.filter(r => r.type === t), free = of.filter(isReady).length;
      return `<div class="row small"><b style="min-width:110px">${esc(t)}</b><div class="bar ${free === 0 ? 'bad' : free <= Math.max(1, Math.round(of.length * 0.2)) ? 'warn' : 'good'}" style="flex:1;min-width:80px"><i style="width:${Math.round(free / of.length * 100)}%"></i></div><span>${free} of ${of.length} ready</span></div>`; }).join('')}</div>
    <div class="row small" style="margin-top:14px"><span class="chip ${s.arrivingToday ? 'warn' : ''}">${s.arrivingToday} reserved, arriving today</span><span class="chip">${s.upcoming} reserved for later</span>${s.underWork ? `<span class="chip info">${s.underWork} being repaired by contractors</span>` : ''}</div>
    <div class="row" style="margin-top:14px"><button class="btn sm ghost" data-act="nav" data-view="rooms">All rooms</button><button class="btn sm ghost" data-act="nav" data-view="bookings">Bookings</button></div></div>`;
}

function cashFlowCard() {
  const fc = forecastCash(FORECAST_DAYS), tonight = fc[0];
  const so = ledgerDay(S.day), earned = so.filter(e => e.amount > 0).reduce((a, e) => a + e.amount, 0), spent = so.filter(e => e.amount < 0).reduce((a, e) => a - e.amount, 0);
  const closing = S.money + tonight.net;
  const week = fc.reduce((a, d) => ({ income: a.income + d.income, costs: a.costs + d.costs }), { income: 0, costs: 0 });
  const max = Math.max(1, ...fc.map(d => Math.max(d.income, d.costs)));
  const bars = fc.map((d, i) => `<div class="col"><div class="pair"><div class="b inc" style="height:${Math.round(d.income / max * 100)}%" title="Income ${money(d.income)}"></div><div class="b exp" style="height:${Math.round(d.costs / max * 100)}%" title="Costs ${money(d.costs)}"></div></div>
    <small class="muted">${i === 0 ? 'Today' : DAYS[d.day % 7]}</small><small class="${d.net >= 0 ? 'pos' : 'neg'}"><b>${money(d.net)}</b></small></div>`).join('');
  return `<div class="card"><div class="row"><h3>Cash flow</h3><span class="chip right ${closing < 0 ? 'bad' : 'good'}">Tonight's close ${money(closing)}</span></div>
    <div class="flow"><span>Cash in bank now</span><span class="a">${money(S.money)}</span>
      <span class="muted">Taken today so far</span><span class="a pos">${earned ? signed(earned) : money(0)}</span>
      <span class="muted">Paid out today so far</span><span class="a neg">${spent ? signed(-spent) : money(0)}</span>
      <span class="muted">Room income due tonight</span><span class="a pos">${signed(tonight.income)}</span>
      <span class="muted">Staff wages tonight</span><span class="a neg">${signed(-tonight.wages)}</span>
      <span class="muted">Running costs tonight</span><span class="a neg">${signed(-tonight.running)}</span>
      <span class="t">Expected close of day</span><span class="a t ${closing < 0 ? 'neg' : ''}">${money(closing)}</span></div>
    <div class="section-title" style="margin-top:18px"><h3>Next 7 days</h3><span class="chip good">Income</span><span class="chip bad">Costs</span></div>
    <div class="bars tight" style="height:130px">${bars}</div>
    <div class="row small" style="margin-top:10px"><span>Week: <b class="pos">${signed(week.income)}</b> in, <b class="neg">${signed(-week.costs)}</b> out, <b class="${week.income - week.costs >= 0 ? 'pos' : 'neg'}">${signed(week.income - week.costs)}</b> net</span></div>
    <p class="muted small" style="margin:8px 0 0">Counts guests in the house, confirmed reservations, wages and running costs. It leaves out restaurant takings, extras, new enquiries and no-shows.</p></div>`;
}

function maintenanceCard() {
  const watch = equipmentWatch();
  const rows = watch.map(a => `<div class="row small" style="padding:6px 0"><span style="min-width:150px"><b>${esc(ASSET_DEFS[a.key].name)}</b></span>
    <div class="bar ${a.broken ? 'bad' : condClass(a.cond)}" style="flex:1;min-width:80px"><i style="width:${a.broken ? 100 : a.cond}%"></i></div>
    <span class="chip ${a.broken ? 'bad' : condClass(a.cond)}">${a.broken ? 'Broken' : condWord(a.cond) + ' ' + a.cond + '%'}</span>${workFor('asset', a.key) ? workChip('asset', a.key) : ''}</div>`).join('');
  const damaged = S.rooms.filter(r => r.damaged).map(r => `<div class="row small" style="padding:6px 0"><b style="min-width:150px">${esc(r.name)}</b><span class="chip bad">Damaged</span>${roomUnderWork(r) ? workChip('room', r.id) : '<span class="chip warn">Needs a repair job</span>'}</div>`).join('');
  return `<div class="card"><div class="row"><h3>Maintenance and issues</h3><button class="btn sm ghost right" data-act="nav" data-view="maintenance">Maintenance</button></div>
    ${rows || damaged ? `<div class="list" style="margin-top:6px">${damaged}${rows}</div>` : '<div class="alert good" style="margin-top:10px">All equipment is in good condition and every room is usable.</div>'}</div>`;
}

/* A short checklist for new players, and a tip that fits the moment. */
function startCard() {
  if (!firstsVisible()) return '';
  const done = firstsDone(), n = FIRSTS.length;
  const rows = FIRSTS.map(([k, label, view]) => `<div class="row"><span class="tick ${S.firsts[k] ? 'done' : ''}" aria-hidden="true">${S.firsts[k] ? '&#10003;' : ''}</span><span class="${S.firsts[k] ? 'muted' : ''}" style="${S.firsts[k] ? 'text-decoration:line-through' : ''}">${esc(label)}</span>${S.firsts[k] ? '' : `<button class="btn sm ghost right" data-act="nav" data-view="${view}">Go</button>`}</div>`).join('');
  return `<div class="card"><div class="row"><h3>Getting started</h3><span class="chip right">${done} of ${n} done</span></div><div class="bar" style="margin:10px 0 4px"><i style="width:${Math.round(done / n * 100)}%"></i></div>
    <div class="list">${rows}</div><div class="row" style="margin-top:8px"><button class="btn sm ghost" data-act="hideFirsts">Hide this</button></div></div>`;
}
function tipBanner() {
  const t = coachTip();
  return `<div class="alert info tip row"><span><b>Tip:</b> ${esc(t.text)}</span><button class="btn sm ghost right" data-act="nav" data-view="${t.view}">Show me</button></div>`;
}

/* ---------- Season, weather and pricing ---------- */
const wxIcon = kind => ic({ sunny: 'sun', cloudy: 'cloud', rain: 'rain', storm: 'storm' }[kind]);
function seasonCard() {
  const s = seasonOf(S.day), today = weatherOn(S.day), fest = festivalOn(S.day), next = nextFestival(S.day);
  const days = [1, 2, 3, 4].map(k => ({ day: S.day + k, f: forecastOn(S.day + k) }));
  const festLine = fest ? `<b>${esc(fest.name)}</b> is on now. Demand is up ${Math.round((fest.demand - 1) * 100)}%.` : next ? `Next: <b>${esc(next.festival.name)}</b> in ${next.in} day${next.in > 1 ? 's' : ''}.` : '';
  return `<div class="card"><div class="row"><h3>${esc(s.name)}</h3><span class="chip right">Day ${dayInSeason(S.day) + 1} of ${SEASON_DAYS}</span></div>
    <div class="row" style="margin-top:12px;gap:14px"><span class="wx big">${wxIcon(today.kind)}</span><div><b style="font-size:1.2rem">${WEATHER_WORD[today.kind]}, ${today.temp}&deg;C</b><div class="muted small">Today</div></div></div>
    <div class="forecast">${days.map(d => `<div class="fc"><div class="small muted">${DAYS[d.day % 7]}</div><span class="wx">${wxIcon(d.f.kind)}</span><div class="small">${WEATHER_WORD[d.f.kind]}</div><div class="small muted">${d.f.temp}&deg;</div></div>`).join('')}</div>
    <p class="small" style="margin:10px 0 0">${festLine}</p>
    <p class="small muted" style="margin:6px 0 0">People asking to stay: <b>${Math.round(demandFactor(S.day) * 100)}%</b> of normal for the time of year. Forecasts are a guide and can be wrong, more so further ahead.</p></div>`;
}
function pricingCard() {
  const adv = priceAdvice();
  const rows = adv.map(a => `<div class="row"><div style="flex:1;min-width:160px"><b>${esc(a.type)}</b> <span class="chip ${a.kind === 'cut' ? '' : 'good'}">${a.kind === 'cut' ? 'Lower' : 'Raise'}</span><div class="muted small">${esc(a.reason)} Now ${money(a.current)}, suggested ${money(a.target)}.</div></div>
    <button class="btn sm primary" data-act="applyAdvice" data-type="${esc(a.type)}" data-price="${a.target}">Set to ${money(a.target)}</button></div>`).join('');
  return `<div class="card"><div class="row"><h3>Prices</h3><button class="btn sm ghost right" data-act="nav" data-view="rooms">Rooms</button></div>
    <p class="muted small" style="margin:4px 0 0">Guests ask for fewer rooms when prices rise and more when they fall. Charge more when you are nearly full.</p>
    <div class="list" style="margin-top:6px">${rows || '<div class="muted small">Your prices look right for now.</div>'}</div></div>`;
}

/* Today's challenges and the week's. */
function challengeCard() {
  const c = S.challenges, reward = challengeReward();
  const row = (key, rew, weekly) => {
    const def = challengeDef(key), m = def.measure(), done = weekly ? c.weeklyDone : c.dailyDone[key], pct = Math.round(Math.min(1, m.have / m.need) * 100);
    return `<div class="stack" style="gap:6px;padding:10px 0"><div class="row"><span class="tick ${done ? 'done' : ''}" aria-hidden="true">${done ? '&#10003;' : ''}</span><b>${esc(def.name)}</b>${weekly ? '<span class="chip info">Weekly</span>' : ''}<span class="chip ${done ? 'good' : 'warn'} right">${done ? 'Done' : '+' + money(rew)}</span></div>
      <div class="small muted">${esc(def.desc())}</div><div class="row"><div class="bar ${done ? 'good' : ''}" style="flex:1"><i style="width:${done ? 100 : pct}%"></i></div><span class="small muted">${esc(m.text)}</span></div></div>`;
  };
  const streak = currentStreak();
  return `<div class="card"><div class="row"><h3>Challenges</h3>${streak ? `<span class="chip good right">${streak}-day streak</span>` : '<span class="chip right">Bonus cash</span>'}</div>
    <div class="list" style="margin-top:4px">${c.daily.map(k => row(k, reward, false)).join('')}${c.weekly ? row(c.weekly, reward * 3, true) : ''}</div>
    <p class="muted small" style="margin:6px 0 0">Checked when you end the day. Do one on three days in a row for a streak bonus.</p></div>`;
}

const SEVERITY = { bad: 0, warn: 1, info: 2 };
const SHOW_ATTENTION = 4;
function attentionCard() {
  const items = attentionItems().sort((a, b) => SEVERITY[a.kind] - SEVERITY[b.kind]);
  const line = x => `<div class="row"><span class="chip ${x.kind}">${x.kind === 'bad' ? 'Urgent' : x.kind === 'warn' ? 'Soon' : 'Info'}</span><span>${esc(x.text)}</span><button class="btn sm ghost right" data-act="nav" data-view="${x.act}">Open</button></div>`;
  const rest = items.slice(SHOW_ATTENTION);
  return `<div class="card"><div class="row"><h3>Needs your attention</h3>${items.length ? `<span class="chip ${items.some(x => x.kind === 'bad') ? 'bad' : 'warn'} right">${items.length}</span>` : ''}</div>
    <div class="list" style="margin-top:6px">${items.length ? items.slice(0, SHOW_ATTENTION).map(line).join('') : '<div class="alert good">Everything is under control.</div>'}</div>
    ${rest.length ? `<details class="fold" style="margin-top:6px"><summary class="small muted">Show ${rest.length} more</summary><div class="list body">${rest.map(line).join('')}</div></details>` : ''}</div>`;
}
function todayCard() {
  return `<details class="card fold" open><summary><h3>Facilities and news</h3></summary><div class="body">
    <div class="list">${visibleFacilities().map(f => { const st = facilityStatus(f, dow()); return `<div class="fac"><span class="dot ${st.open ? '' : 'off'}"></span><b>${f.name}</b><span class="right chip ${st.open ? 'good' : 'bad'}">${st.open ? 'Open' : 'Closed: ' + esc(st.why)}</span></div>`; }).join('')}</div>
    <ul class="news" style="padding-left:18px;margin:12px 0 0">${S.news.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div></details>`;
}

/* What the team is doing right now, from the timeline. Whatever you assign from the Inbox or Tasks shows here as it happens. */
const ACT_WORD = { doing: ['In progress', 'info'], queued: ['Queued', ''], done: ['Done', 'good'] };
function activityCard() {
  const state = t => S.clock >= t.end ? 'done' : S.clock >= t.start ? 'doing' : 'queued', rank = { doing: 0, queued: 1, done: 2 };
  const list = S.timeline.slice().sort((a, b) => rank[state(a)] - rank[state(b)] || a.start - b.start);
  const rows = list.slice(0, 7).map(t => {
    const s = staffById(t.staffId), st = state(t), pct = st === 'done' ? 100 : st === 'doing' ? Math.round((S.clock - t.start) / (t.end - t.start) * 100) : 0;
    return `<div class="act">${s ? avatar(s, 'sm') : ''}<div class="what"><b>${esc(s ? s.name.split(' ')[0] : 'Someone')}</b> <span class="small">${esc(t.label)}</span><div class="muted small">${clockText(t.start)} to ${clockText(t.end)}</div></div>
      <div class="bar ${st === 'done' ? 'good' : ''}"><i style="width:${pct}%"></i></div><span class="chip ${ACT_WORD[st][1]}">${ACT_WORD[st][0]}</span></div>`;
  }).join('');
  const handled = S.mail.handled.slice(0, 3).map(h => `<div class="row small"><span class="chip good">You</span><span>${esc(h.text)}</span><span class="muted right">${h.day === S.day ? clockText(h.clock) : 'Day ' + (h.day + 1)}</span></div>`).join('');
  return `<div class="card"><div class="row"><h3>Team activity</h3><span class="chip right">${clockText(S.clock)}</span></div>
    <div class="list" style="margin-top:6px">${rows || '<div class="muted small">Nobody has been given a job yet. Open the Inbox to hand out work.</div>'}</div>
    ${list.length > 7 ? `<div class="small muted" style="margin-top:6px">and ${list.length - 7} more</div>` : ''}
    ${handled ? `<div class="section-title" style="margin:16px 0 6px"><h3 style="font-size:1rem">You handled</h3></div><div class="list">${handled}</div>` : ''}
    <div class="row" style="margin-top:14px"><button class="btn sm ghost" data-act="nav" data-view="inbox">Open inbox</button><button class="btn sm ghost" data-act="nav" data-view="staff">Team</button></div></div>`;
}

function viewDashboard() {
  const total = S.rooms.length, occ = S.guests.length, t = tierInfo(), gp = goalProgress();
  const heroSrc = tierImage(S.tier), heroImg = missingImgs.has(heroSrc) ? '' : `background-image:url('${heroSrc}')`;
  const net = ledgerDay(S.day).reduce((a, e) => a + e.amount, 0), tonight = forecastCash(1)[0];
  return `<div class="page">
  <div class="hero tall" style="${heroImg}"><h2>${esc(S.hotel)}</h2><p>${esc(t.name)} (${t.stars}-star). ${DAYS_LONG[dow()]}, day ${S.day + 1}. Welcome back, ${esc(S.owner)} (${esc(currentRank().name)}).</p>
    <div class="chips row"><span class="chip">${S.rooms.length} of ${roomLimit()} rooms, ${S.staff.length} of ${staffLimit()} staff</span><span class="chip">${occ} of ${total} rooms occupied (${total ? Math.round(occ / total * 100) : 0}%)</span></div></div>
  <div class="kpis">
    <div class="card kpi"><div class="v ${S.money < 0 ? 'neg' : ''}">${money(S.money)}</div><div class="l">Cash in bank</div></div>
    <div class="card kpi"><div class="v ${net + tonight.net < 0 ? 'neg' : 'pos'}">${signed(net + tonight.net)}</div><div class="l">Profit today, confirmed stays</div></div>
    <div class="card kpi"><div class="v">${rating().toFixed(1)} <span class="stars" style="font-size:1rem">${stars(Math.round(rating()))}</span></div><div class="l">Guest rating</div></div>
    <div class="card kpi"><div class="v">${onDutyNow().length}<span class="muted" style="font-size:1.1rem"> / ${S.staff.length}</span></div><div class="l">Staff on duty</div></div>
  </div>
  ${milestoneCard()}${briefingCard()}${tipBanner()}${startCard()}
  <div class="duo">${attentionCard()}${challengeCard()}</div>
  <div class="duo">${roomsOverviewCard()}${cashFlowCard()}</div>
  <div class="duo">${gp ? goalCard(gp, true) : '<div class="card"><h3>Grand Resort</h3><div class="alert good" style="margin-top:10px">You have reached the top level. Keep guests happy and the hotel thriving.</div></div>'}${maintenanceCard()}</div>
  <div class="duo">${seasonCard()}${pricingCard()}</div>
  <div class="duo">${activityCard()}${todayCard()}</div>${worksPanel()}</div>`;
}
VIEWS.dashboard = viewDashboard;

actions.openRooms = d => { ui.roomFilter = ROOM_FILTERS.some(f => f[0] === d.f) ? d.f : 'all'; ui.view = 'rooms'; render(); window.scrollTo(0, 0); };

actions.applyAdvice = d => {
  const r = applyPrice(d.type, Number(d.price));
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${d.type} rooms are now ${money(Number(d.price))} a night.`, 'good');
  commit();
};
