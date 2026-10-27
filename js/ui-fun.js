'use strict';

/* ================= Extras: arcade, Kids Club, souvenir shop and excursions =================
   One screen with a tab for each extra that has been opened, and a card showing how close each locked one is. Registers itself into the shared
   VIEWS, MODALS, actions and forms of ui.js. */

const FUN_TABS = [['arcade', 'Arcade'], ['kidsclub', 'Kids Club'], ['shop', 'Shop'], ['excursions', 'Excursions']];
ICONS.fun = '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="16" cy="11.5" r="1"/><circle cx="18.5" cy="14" r="1"/>';
NAV.splice(5, 0, ['extras', 'fun', 'Extras', () => !!S && Object.keys(S.features).length > 0, 'Hotel']);
const openTabs = () => FUN_TABS.filter(t => featureOn(t[0]));

const statusChip = (open, why) => `<span class="chip ${open ? 'good' : 'bad'}">${open ? 'Open today' : 'Closed: ' + esc(why)}</span>`;
/* A control that moves a number up and down in fixed steps. */
const stepper = (what, key, text) => `<div class="row" style="gap:8px"><button class="btn sm ghost" data-act="funStep" data-what="${what}" data-key="${esc(key || '')}" data-dir="-1" aria-label="Lower the price">&minus;</button>
  <b style="min-width:84px;text-align:center">${esc(text)}</b><button class="btn sm ghost" data-act="funStep" data-what="${what}" data-key="${esc(key || '')}" data-dir="1" aria-label="Raise the price">+</button></div>`;
const kpi = (v, l, cls) => `<div class="card kpi"><div class="v ${cls || ''}">${v}</div><div class="l">${l}</div></div>`;
const hireLine = role => `<div class="alert info" style="margin-top:12px">Needs a <b>${esc(role)}</b> on duty. ${S.staff.some(s => s.role === role) ? 'Check the rota on the Team page.' : `You have not hired one yet: open the Team page and advertise for a ${esc(role)}.`}
  <button class="btn sm ghost" data-act="nav" data-view="staff" style="margin-left:8px">Team</button></div>`;

/* ---------- Arcade ---------- */
function tabArcade() {
  const p = arcadePlan(), machines = Object.entries(ARCADE_MACHINES).map(([key, def]) => {
    const a = assetByKey(key);
    return `<div class="card stack"><div class="row"><h3>${esc(def.name)}</h3>${a ? `<span class="chip ${a.broken ? 'bad' : 'good'} right">${a.broken ? 'Out of order' : 'Working'}</span>` : ''}</div>
      <div class="muted small">${esc(def.blurb)}</div>
      ${a ? `<div class="row small"><span>Condition ${Math.round(a.cond)}%</span></div><div class="bar ${a.cond < 40 ? 'bad' : ''}"><i style="width:${Math.round(a.cond)}%"></i></div>
        <div class="row"><button class="btn sm ghost" data-act="nav" data-view="maintenance">Service or repair</button></div>`
      : `<div class="row"><b>${money(def.buy)}</b><button class="btn sm primary right" data-act="buyMachine" data-key="${esc(key)}">Buy it</button></div>`}</div>`;
  }).join('');
  return `<div class="grid g4">${kpi(p.plays, 'Plays expected today')}${kpi(money(p.revenue - p.upkeep), 'Profit expected today', 'pos')}${kpi(`${p.machinesWorking} / ${arcadeMachines().length}`, 'Machines working')}${kpi(statusChip(p.open, p.why), 'Arcade')}</div>
    ${p.open ? '' : hireLine('Arcade Attendant')}
    <div class="card" style="margin-top:14px"><div class="row"><h3>Price per play</h3><span class="right">${stepper('arcade', '', pounds(S.arcade.price))}</span></div>
      <div class="muted small" style="margin-top:6px">The fair price is ${pounds(ARCADE.ref)}. Lower prices bring more plays, but each machine can only serve so many a day. Wet days and weekends are busy. Children play most.</div></div>
    <div class="section-title"><h3>Machines</h3></div><div class="grid g3">${machines}</div>`;
}

/* ---------- Kids Club ---------- */
function tabKids() {
  const at = kidsAttending(), fams = familiesInHouse(), open = kidsLeaders() > 0, cap = kidsCapacity();
  const rows = fams.map(g => {
    const state = g.kidsClub === true ? (at.taken.includes(g) ? ['good', 'Booked in'] : ['warn', 'Waiting: no space']) : g.kidsClub === false ? ['', 'Not booking'] : ['info', 'Not decided'];
    return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><div style="flex:1;min-width:160px"><b>${esc(g.name)}</b><div class="muted small">${g.children} ${g.children === 1 ? 'child' : 'children'} &middot; ${esc(roomById(g.roomId).name)}</div></div>
      <span class="chip ${state[0]}">${state[1]}</span>
      <button class="btn sm ${g.kidsClub === true ? 'ghost' : 'primary'}" data-act="kidsEnrol" data-id="${g.id}" data-on="${g.kidsClub === true ? '0' : '1'}">${g.kidsClub === true ? 'Take out' : 'Book in'}</button></div>`;
  }).join('');
  return `<div class="grid g4">${kpi(`${kidsLeaders()}`, 'Club leaders on duty')}${kpi(`${at.children} / ${cap}`, 'Children booked / places')}${kpi(money(at.children * (S.kids.price - KIDS.supplies)), 'Profit expected today', 'pos')}${kpi(statusChip(open, 'no Kids Club Leader on duty'), 'Kids Club')}</div>
    ${open ? '' : hireLine('Kids Club Leader')}
    <div class="alert info" style="margin-top:12px">Each leader looks after up to <b>${KIDS.perLeader}</b> children. Only a Kids Club Leader can run the club, not the Manager. Families that cannot fit wait and are less happy.</div>
    <div class="card" style="margin-top:14px"><div class="row"><h3>Price per child, per day</h3><span class="right">${stepper('kids', '', money(S.kids.price))}</span></div>
      <label class="row" style="gap:10px;margin-top:10px"><input type="checkbox" data-act="toggleKidsAuto" ${S.kids.auto ? 'checked' : ''}> <b>Book families in automatically</b></label>
      <div class="muted small">With this on, families you have not decided about are offered a place each evening. A high price puts some off. The fair price is ${money(KIDS.ref)}.</div></div>
    <div class="section-title"><h3>Families staying</h3><span class="chip">${fams.length}</span></div>
    <div class="card">${rows || '<div class="muted">No children are staying right now. Families book Family rooms and some other rooms too.</div>'}</div>`;
}

/* ---------- Shop ---------- */
function tabShop() {
  const p = shopPlan();
  const lines = p.lines.map(l => {
    const def = SHOP_LINES[l.key], pct = Math.min(100, Math.round(l.stock / SHOP_MAX_STOCK * 100));
    return `<div class="card stack"><div class="row"><h3>${esc(def.name)}</h3>${l.soldOut ? '<span class="chip warn right">Will run out</span>' : ''}</div>
      <div class="muted small">${esc(def.blurb)}</div>
      <div class="row small"><span>In stock <b>${l.stock}</b></span><span class="muted">cost ${pounds(def.cost)} each</span></div><div class="bar ${l.stock < 10 ? 'bad' : ''}"><i style="width:${pct}%"></i></div>
      <div class="row"><span class="small">Price</span><span class="right">${stepper('shop', l.key, pounds(l.price))}</span></div>
      <div class="small muted">Fair price ${pounds(def.ref)}. Expected sales today: <b>${l.sold}</b> for ${money(l.revenue)}, a profit of ${money(l.revenue - l.cost)}.</div>
      <div class="row"><button class="btn sm primary" data-act="buyStock" data-key="${esc(l.key)}" data-packs="1">Order ${def.pack} for ${money(def.pack * def.cost)}</button><button class="btn sm ghost" data-act="buyStock" data-key="${esc(l.key)}" data-packs="3">Order ${def.pack * 3}</button></div></div>`;
  }).join('');
  return `<div class="grid g4">${kpi(money(p.revenue), 'Sales expected today')}${kpi(money(p.revenue - p.cost), 'Profit expected today', 'pos')}${kpi(money(shopStockValue()), 'Stock on the shelves (at cost)')}${kpi(statusChip(p.open, p.why), 'Shop')}</div>
    ${p.open ? '' : hireLine('Shop Assistant')}
    <div class="alert info" style="margin-top:12px">Guests buy a little each day. Keep the shelves stocked and the prices fair. A busy shop with a lot of stock can attract thieves, and a closed shop is easier to break into.</div>
    <div class="section-title"><h3>What you sell</h3></div><div class="grid g3">${lines}</div>`;
}

/* ---------- Excursions ---------- */
function tripCard(r) {
  const t = S.trips.list.find(x => x.id === r.id);
  return `<div class="card flush">${imgHtml(safeImg(t.photo), { fb: 'photo', label: t.cat, alt: t.name })}<div class="stack" style="padding:16px">
    <div class="row"><h3>${esc(t.name)}</h3><span class="chip right">${esc(t.cat)}</span></div>
    <div class="row small"><span>Ticket <b>${money(t.price)}</b></span><span class="muted">fair price ${money(r.fair)}</span></div>
    <div class="small ${r.runs ? '' : 'muted'}">${r.runs ? `Runs today: about <b>${r.tickets}</b> tickets, profit ${money(r.revenue - r.cost)}` : `Not running today: ${esc(r.note)}`}</div>
    <div class="row"><button class="btn sm ghost" data-act="editTrip" data-id="${t.id}">Edit</button><button class="btn sm danger right" data-act="deleteTripAsk" data-id="${t.id}">Delete</button></div></div></div>`;
}
function tabTrips() {
  const p = tripsPlan(), guides = crewOnDuty('Excursions Guide').length, custom = Object.keys(S.trips.cats).length;
  return `<div class="grid g4">${kpi(p.rows.filter(r => r.runs).length + ' / ' + S.trips.list.length, 'Excursions running today')}${kpi(p.tickets, 'Tickets expected')}${kpi(money(p.revenue - p.cost), 'Profit expected today', 'pos')}${kpi(statusChip(p.open, p.why), 'Excursions')}</div>
    ${p.open ? '' : hireLine('Excursions Guide')}
    <div class="alert info" style="margin-top:12px">Each guide on duty can lead <b>${TRIP.perGuide}</b> excursions a day (${guides} on duty now, so ${p.slots}). The most popular run first. Outdoor trips need good weather, and guests like a fair price.</div>
    <div class="row" style="margin-top:14px"><button class="btn primary" data-act="addTrip">Create an excursion</button><button class="btn ghost" data-act="addTripCat">Invent a category${custom ? ` (${custom} of 8)` : ''}</button></div>
    <div class="grid g3" style="margin-top:14px">${p.rows.map(tripCard).join('') || '<div class="card empty">No excursions yet. Create one!</div>'}</div>`;
}

/* ---------- The screen ---------- */
function lockedCard(key) {
  const f = FEATURES[key], i = MILESTONES.findIndex(m => m.unlock === key), m = MILESTONES[i], from = i ? MILESTONES[i - 1].need : 0;
  const pct = Math.max(0, Math.min(100, Math.round((S.earned - from) / (m.need - from) * 100)));
  return `<div class="card stack" style="opacity:.85"><div class="row"><h3>${esc(f.name)}</h3><span class="chip right">Locked</span></div><div class="muted small">${esc(f.blurb)}</div>
    <div class="bar"><i style="width:${pct}%"></i></div><div class="small">Opens free when you have earned ${money(m.need)} from guests: <b>${money(Math.max(0, m.need - S.earned))}</b> to go.</div></div>`;
}
function viewExtras() {
  const tabs = openTabs();
  if (!tabs.some(t => t[0] === ui.funTab)) ui.funTab = tabs.length ? tabs[0][0] : null;
  const body = { arcade: tabArcade, kidsclub: tabKids, shop: tabShop, excursions: tabTrips }[ui.funTab];
  const locked = Object.keys(FEATURES).filter(k => !featureOn(k));
  return `<div class="pagehead"><div><h2>Extras</h2><p>They cost nothing to open. Each one needs its own team member, and brings in new income.</p></div></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${ui.funTab === k ? 'active' : ''}" data-act="funTab" data-tab="${k}">${l}</button>`).join('')}</div>
    ${body ? body() : ''}
    ${locked.length ? `<div class="section-title"><h3>Still to unlock</h3></div><div class="grid g3">${locked.map(lockedCard).join('')}</div>` : ''}`;
}
VIEWS.extras = viewExtras;

/* ---------- Actions ---------- */
actions.funTab = d => { ui.funTab = d.tab; render(); };
actions.funStep = d => {
  const dir = Number(d.dir) < 0 ? -1 : 1;
  const r = d.what === 'arcade' ? setArcadePrice(S.arcade.price + dir * 0.5)
    : d.what === 'kids' ? setKidsPrice(S.kids.price + dir)
    : d.what === 'shop' && SHOP_LINES[d.key] ? setShopPrice(d.key, S.shop.price[d.key] + dir * 0.5) : { ok: false, error: 'Nothing to change.' };
  if (!r.ok) return toast(r.error, 'bad');
  commit();
};
actions.buyMachine = d => { const r = buyMachine(d.key); if (!r.ok) return toast(r.error, 'bad'); toast(`${ARCADE_MACHINES[d.key].name} installed.`, 'good'); commit(); };
actions.kidsEnrol = d => { const r = setKidsEnrol(Number(d.id), d.on === '1'); if (!r.ok) return toast(r.error, 'bad'); commit(); };
actions.toggleKidsAuto = () => { S.kids.auto = !S.kids.auto; commit(); };
actions.buyStock = d => { const r = buyShopStock(d.key, Number(d.packs)); if (!r.ok) return toast(r.error, 'bad'); toast(`Ordered ${r.units} for ${money(r.cost)}.`, 'good'); commit(); };

/* ---------- Excursion form ---------- */
MODALS.trip = m => {
  const cats = tripCategories();
  const t = m.id ? S.trips.list.find(x => x.id === m.id) : { name: '', cat: Object.keys(cats)[0], price: tripFairPrice(Object.keys(cats)[0], cats), photo: null };
  if (!t) return null;
  return { inner: `<form data-form="trip" id="tripForm"><h2>${m.id ? 'Edit ' + esc(t.name) : 'Create an excursion'}</h2>
    <label class="f" for="t-n">Name</label><input type="text" id="t-n" name="name" maxlength="${TRIP.nameMax}" value="${esc(t.name)}" placeholder="Name your own trip" required data-autofocus>
    <div class="cols2"><div><label class="f" for="t-c">Category</label><select id="t-c" name="cat">${Object.entries(cats).map(([k, c]) => `<option value="${esc(k)}" ${k === t.cat ? 'selected' : ''}>${esc(k)}${c.custom ? ' (yours)' : ''}</option>`).join('')}</select></div>
      <div><label class="f" for="t-p">Ticket price (${CURRENCY}${TRIP.priceMin} to ${CURRENCY}${TRIP.priceMax})</label><input type="number" id="t-p" name="price" min="${TRIP.priceMin}" max="${TRIP.priceMax}" step="1" value="${t.price}"></div></div>
    <div id="tripPreview" class="log" style="margin-top:14px"></div>
    ${photoField(safeImg(t.photo), 'trip')}
    <div class="actions"><button class="btn ghost" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">${m.id ? 'Save excursion' : 'Add excursion'}</button></div></form>` };
};
function tripPreview() {
  const form = document.getElementById('tripForm');
  if (!form || !S || !S.trips) return;
  const f = new FormData(form), cats = tripCategories(), c = cats[f.get('cat')], price = Number(f.get('price')) || 0;
  if (!c) return;
  const fair = tripFairPrice(f.get('cat'), cats);
  document.getElementById('tripPreview').innerHTML = `It costs about <b>${money(c.cost)}</b> a guest to run, so you earn <b>${money(price - c.cost)}</b> a ticket. A fair price is about ${money(fair)}.
    <br>${c.outdoor ? 'An outdoor trip: it sells best in sunshine and not at all in storms.' : 'An indoor trip: weather hardly matters.'}`;
}
AFTER_RENDER.push(tripPreview);
document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#tripForm')) tripPreview(); });
document.addEventListener('change', e => { if (e.target.closest && e.target.closest('#tripForm')) tripPreview(); });
forms.trip = f => {
  const d = { name: f.get('name'), cat: f.get('cat'), price: f.get('price') };
  const r = ui.modal.id ? updateTrip(ui.modal.id, d, ui.photo) : addTrip(d, ui.photo && ui.photo !== 'REMOVE' ? ui.photo : null);
  if (!r.ok) return toast(r.error, 'bad');
  toast(ui.modal.id ? `${r.trip.name} updated.` : `${r.trip.name} added.`, 'good');
  ui.modal = null; ui.photo = null; commit();
};
actions.addTrip = () => { if (S.trips.list.length >= TRIP.maxTrips) toast(`You can run up to ${TRIP.maxTrips} excursions.`, 'bad'); else openModal({ type: 'trip', id: null }); };
actions.editTrip = d => openModal({ type: 'trip', id: Number(d.id) });
actions.deleteTripAsk = d => { const t = S.trips.list.find(x => x.id === Number(d.id)); if (t) confirmModal(`Delete ${t.name}?`, 'The excursion will be removed for good.', 'deleteTripDo', 'Delete excursion', { id: t.id }, true); };
actions.deleteTripDo = d => { removeTrip(Number(d.id)); ui.modal = null; toast('Excursion deleted.'); commit(); };

/* ---------- Category form ---------- */
MODALS.tripCat = () => ({ inner: `<form data-form="tripCat"><h2>Invent a category</h2>
  <p class="muted small">Group your own excursions under a name you make up, such as Pirate treasure hunt. Tell the game how costly it is and where it happens.</p>
  <label class="f" for="c-n">Category name</label><input type="text" id="c-n" name="name" maxlength="24" placeholder="Name it" required data-autofocus>
  <label class="f">Where does it happen?</label><div class="row"><label class="row small" style="gap:6px"><input type="radio" name="kind" value="outdoor" checked> Outdoors</label><label class="row small" style="gap:6px"><input type="radio" name="kind" value="indoor"> Indoors</label></div>
  <label class="f">How costly is it to run?</label><div class="row"><label class="row small" style="gap:6px"><input type="radio" name="level" value="1" checked> Low (${money(CUSTOM_CAT_COST[1])} a guest)</label><label class="row small" style="gap:6px"><input type="radio" name="level" value="2"> Medium (${money(CUSTOM_CAT_COST[2])})</label><label class="row small" style="gap:6px"><input type="radio" name="level" value="3"> High (${money(CUSTOM_CAT_COST[3])})</label></div>
  <div class="actions"><button class="btn ghost" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Add category</button></div></form>` });
forms.tripCat = f => {
  const r = addTripCategory(f.get('name'), f.get('kind'), Number(f.get('level')));
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.name} is ready to use.`, 'good'); ui.modal = null; commit();
};
actions.addTripCat = () => openModal({ type: 'tripCat' });
