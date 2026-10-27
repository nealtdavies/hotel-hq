'use strict';

/* ================= Restaurant menu editor =================
   Registers itself into the shared VIEWS, MODALS, actions and forms of ui.js. */

const QUALITY_WORDS = ['', 'Basic', 'Decent', 'Good', 'Excellent', 'Gourmet'];

function dishImage(d) {
  return imgHtml(safeImg(d.photo) || menuImagePath(d), { fb: 'photo', label: d.name, alt: d.name });
}
function dishCard(d) {
  const cost = ingredientCost(d), profit = d.price - cost;
  return `<div class="card flush" style="${d.on ? '' : 'opacity:.6'}">${dishImage(d)}
    <div style="padding:14px" class="stack">
      <div class="row"><h3>${esc(d.name)}</h3><span class="chip right">${money(d.price)}</span></div>
      <div class="small muted">${esc(d.desc || 'No description.')}</div>
      <div class="row"><span class="stars" title="${QUALITY_WORDS[d.quality]}">${stars(d.quality)}</span><span class="muted small">${QUALITY_WORDS[d.quality]}</span>
        ${d.kids ? '<span class="chip info">Children</span>' : ''}${d.veg ? '<span class="chip good">Vegetarian</span>' : ''}${d.nuts ? '<span class="chip warn">Contains nuts</span>' : ''}${d.on ? '' : '<span class="chip bad">Off the menu</span>'}</div>
      <div class="small muted">Costs about ${money(cost)} to make, profit ${money(profit)} each.</div>
      <div class="row"><button class="btn sm ghost" data-act="editDish" data-id="${d.id}">Edit</button>
        <button class="btn sm ghost" data-act="toggleDish" data-id="${d.id}">${d.on ? 'Take off menu' : 'Put on menu'}</button>
        <button class="btn sm danger right" data-act="deleteDishAsk" data-id="${d.id}">Delete</button></div></div></div>`;
}

/* The children's set: ten dishes children order instead of the grown-up ones. */
function kidsSetCard() {
  const missing = KIDS_MENU.filter(d => !S.menu.some(x => x.img === `assets/menu/${d.key}.jpg`)).length;
  return `<div class="card" style="margin-top:12px"><div class="row"><h3>Children's menu</h3>${missing ? `<button class="btn sm primary right" data-act="addKidsMenu">Add the children's dishes (${missing})</button>` : '<span class="chip good right">Added</span>'}</div>
    <div class="muted small" style="margin-top:6px">Spaghetti bolognese, nuggets, pizza, ice cream, fizzy drinks and more at children's prices. Children order from these dishes and grown-ups do not, so you can price them fairly for families. Mark any dish of your own as a children's dish when you add it.</div></div>`;
}
actions.addKidsMenu = () => {
  const n = addKidsMenu();
  toast(n ? `${n} children's dishes added to the menu.` : 'The menu has no room for more dishes.', n ? 'good' : 'bad');
  commit();
};

/* The menu builder without a page header of its own: it is a tab of Events and Food. */
function menuPanel() {
  const on = menuAvailable(), mains = adultMenu('Main');
  const avg = on.length ? on.reduce((a, d) => a + d.quality, 0) / on.length : 0;
  const f = FACILITIES.find(x => x.key === 'restaurant'), st = facilityStatus(f, dow());
  const last = S.diningLast;
  const tips = [];
  if (!mains.length) tips.push('You have no grown-up main courses on the menu, so the restaurant cannot serve anyone.');
  else if (on.length < 5) tips.push('A bigger menu brings more diners. Try for at least 5 to 8 dishes.');
  if (!st.open) tips.push(`The restaurant is closed today: ${st.why}.`);
  const sections = DISH_CATS.map(cat => {
    const list = S.menu.filter(d => d.cat === cat);
    return `<div class="section-title"><h3>${cat}s</h3><span class="chip">${list.length}</span></div>${list.length ? `<div class="grid g3">${list.map(dishCard).join('')}</div>` : '<div class="card empty">Nothing here yet.</div>'}`;
  }).join('');
  return `<div class="row" style="margin-bottom:16px"><div class="muted">${on.length} dish${on.length === 1 ? '' : 'es'} on the menu, average quality ${avg ? avg.toFixed(1) : '-'} stars.</div><button class="btn primary right" data-act="addDish">Add a dish</button></div>
    <div class="grid g4"><div class="card kpi"><div class="v">${last && last.open ? last.covers : '-'}</div><div class="l">Covers last night</div></div>
      <div class="card kpi"><div class="v pos">${last && last.open ? money(last.revenue) : '-'}</div><div class="l">Takings last night</div></div>
      <div class="card kpi"><div class="v">${last && last.open ? money(last.revenue - last.cost) : '-'}</div><div class="l">Profit last night</div></div>
      <div class="card kpi"><div class="v"><span class="chip ${st.open ? 'good' : 'bad'}">${st.open ? 'Open' : 'Closed'}</span></div><div class="l">Restaurant today</div></div></div>
    ${tips.map(t => `<div class="alert warn" style="margin-top:12px">${esc(t)}</div>`).join('')}
    ${kidsSetCard()}
    <div class="alert info" style="margin-top:12px">Guests choose from the dishes you have on the menu. Better food costs more to make but makes guests happier, and a fair price keeps them happy. Each chef on duty can serve 30 covers a night.</div>
    ${sections}`;
}

/* ---------- Dish form ---------- */
MODALS.dish = m => {
  const d = m.id ? S.menu.find(x => x.id === m.id) : { name: '', desc: '', cat: m.cat || 'Main', price: 12, quality: 3, veg: false, nuts: false, on: true, photo: null };
  if (!d) return null;
  return { inner: `<form data-form="dish" id="dishForm"><h2>${m.id ? 'Edit ' + esc(d.name) : 'Add a dish'}</h2>
    <label class="f" for="d-n">Name</label><input type="text" id="d-n" name="name" maxlength="40" value="${esc(d.name)}" required data-autofocus>
    <label class="f" for="d-d">Description</label><input type="text" id="d-d" name="desc" maxlength="100" value="${esc(d.desc)}" placeholder="What is it made with?">
    <div class="cols2"><div><label class="f" for="d-c">Category</label><select id="d-c" name="cat">${DISH_CATS.map(c => `<option ${c === d.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div><label class="f" for="d-p">Price (${CURRENCY}1 to ${CURRENCY}200)</label><input type="number" id="d-p" name="price" min="1" max="200" step="0.5" value="${d.price}"></div></div>
    <label class="f" for="d-q">Quality</label><select id="d-q" name="quality">${[1, 2, 3, 4, 5].map(q => `<option value="${q}" ${q === d.quality ? 'selected' : ''}>${q} star: ${QUALITY_WORDS[q]}</option>`).join('')}</select>
    <div class="row" style="margin-top:12px"><label class="row small" style="gap:6px"><input type="checkbox" name="veg" ${d.veg ? 'checked' : ''}> Vegetarian</label>
      <label class="row small" style="gap:6px"><input type="checkbox" name="nuts" ${d.nuts ? 'checked' : ''}> Contains nuts</label>
      <label class="row small" style="gap:6px"><input type="checkbox" name="kids" ${d.kids ? 'checked' : ''}> Children's dish</label>
      <label class="row small" style="gap:6px"><input type="checkbox" name="on" ${d.on ? 'checked' : ''}> On the menu</label></div>
    <div id="dishPreview" class="log" style="margin-top:14px"></div>
    ${photoField(safeImg(d.photo), 'dish')}
    <div class="actions"><button class="btn ghost" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">${m.id ? 'Save dish' : 'Add to menu'}</button></div></form>` };
};
function dishPreview() {
  const form = document.getElementById('dishForm');
  if (!form || !S) return;
  const f = new FormData(form);
  const d = { price: Number(f.get('price')) || 0, quality: Number(f.get('quality')) || 3, cat: f.get('cat'), kids: f.has('kids') };
  if (!DISH_BASE[d.cat]) return;
  const fair = fairDishPrice(d), feel = dishFeeling(d), cost = ingredientCost(d);
  document.getElementById('dishPreview').innerHTML = `Costs about <b>${money(cost)}</b> to make, so you earn <b>${money(d.price - cost)}</b> each. A fair price for this quality is about ${money(fair)}.
    <br>${feel > 0 ? `Guests will love it (+${feel} happiness).` : feel < 0 ? `Guests will feel ripped off (${feel} happiness).` : 'Guests will think it is fine.'}`;
}
AFTER_RENDER.push(dishPreview);
document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#dishForm')) dishPreview(); });
document.addEventListener('change', e => { if (e.target.closest && e.target.closest('#dishForm')) dishPreview(); });

forms.dish = f => {
  const d = { name: f.get('name'), desc: f.get('desc'), cat: f.get('cat'), price: f.get('price'), quality: f.get('quality'), veg: f.has('veg'), nuts: f.has('nuts'), kids: f.has('kids'), on: f.has('on') };
  const r = ui.modal.id ? updateDish(ui.modal.id, d, ui.photo) : addDish(d, ui.photo && ui.photo !== 'REMOVE' ? ui.photo : null);
  if (r.error) return toast(r.error, 'bad');
  toast(ui.modal.id ? `${r.dish.name} updated.` : `${r.dish.name} added to the menu.`, 'good');
  ui.modal = null; ui.photo = null; commit();
};
actions.addDish = () => { if (S.menu.length >= MAX_DISHES) toast(`A menu holds up to ${MAX_DISHES} dishes.`, 'bad'); else openModal({ type: 'dish', id: null }); };
actions.editDish = d => openModal({ type: 'dish', id: Number(d.id) });
actions.toggleDish = d => { const x = S.menu.find(y => y.id === Number(d.id)); if (x) { x.on = !x.on; commit(); } };
actions.deleteDishAsk = d => {
  const x = S.menu.find(y => y.id === Number(d.id));
  if (x) confirmModal(`Delete ${x.name}?`, 'It will be removed from the menu for good. You can also just take it off the menu for now.', 'deleteDishDo', 'Delete dish', { id: x.id }, true);
};
actions.deleteDishDo = d => { deleteDish(Number(d.id)); ui.modal = null; toast('Dish deleted.'); commit(); };
