'use strict';

/* ================= Contractors: quotes screen, work in progress, directory =================
   Registers itself into the shared MODALS and actions of ui.js. */

const etaText = days => days === 0 ? 'today' : days === 1 ? 'about 1 day' : `about ${days} days`;

function specFrom(d) {
  return { kind: d.kind, target: d.target, key: d.target === 'room' ? Number(d.key) : d.key };
}
function firmExperience(key) {
  const r = firmRecord(key);
  if (!r || !r.jobs) return '<span class="muted">No history with you yet</span>';
  return `<span>Your experience: ${r.jobs} job${r.jobs > 1 ? 's' : ''}, ${r.problems ? `<b class="neg">${r.problems} problem${r.problems > 1 ? 's' : ''}</b>` : '<b class="pos">no problems</b>'}</span>`;
}

/* ---------- Quotes screen ---------- */
MODALS.contractors = m => {
  const spec = { kind: m.kind, target: m.target, key: m.target === 'room' ? Number(m.key) : m.key };
  if (validateSpec(spec)) return null;
  const quotes = allQuotes(spec);
  const can = quotes.filter(q => q.can);
  const cheapest = Math.min(...can.map(q => q.price)), fastest = Math.min(...can.map(q => q.days)), best = Math.max(...can.map(q => q.advertised));
  const why = spec.kind === 'service' ? 'The equipment keeps working while the firm is booked. A better firm restores more of its condition.'
    : spec.target === 'room' ? 'The room cannot be rented until the work is finished, and you cannot take bookings for those nights.'
    : `${ASSET_DEFS[spec.key].effect}. It stays out of action until the work is finished.`;
  const row = q => {
    const f = q.firm;
    if (!q.can) return `<div class="firm off"><div><b>${esc(FIRMS.find(x => x.key === q.key).name)}</b><div class="muted small">Does not do this kind of work.</div></div></div>`;
    const afford = canAfford(q.price);
    const tags = [q.specialist ? '<span class="chip info">Specialist</span>' : '<span class="chip">General</span>',
      q.price === cheapest ? '<span class="chip good">Cheapest</span>' : '', q.days === fastest ? '<span class="chip good">Fastest</span>' : '', q.advertised === best ? '<span class="chip good">Top advertised</span>' : ''].join('');
    return `<div class="firm"><div class="firm-main"><div class="row"><b>${esc(f.name)}</b>${tags}</div>
        <div class="muted small">${esc(f.blurb)}</div>
        <div class="row small" style="margin-top:4px"><span class="stars" title="What they advertise">${stars(q.advertised)}</span><span class="muted">advertised</span><span>${q.warranty ? q.warranty + ' day guarantee' : '<b class="neg">No guarantee</b>'}</span></div>
        <div class="small" style="margin-top:2px">${firmExperience(f.key)}</div></div>
      <div class="firm-buy"><div class="firm-price">${money(q.price)}</div><div class="small muted">${spec.kind === 'service' && q.days === 0 ? 'today' : etaText(q.days)}</div>
        <button class="btn sm primary" data-act="hireFirm" data-firm="${f.key}" data-kind="${m.kind}" data-target="${m.target}" data-key="${esc(m.key)}" ${afford ? '' : 'disabled'}>${afford ? 'Hire' : 'Cannot afford'}</button></div></div>`;
  };
  const order = [...quotes.filter(q => q.can).sort((a, b) => a.price - b.price), ...quotes.filter(q => !q.can)];
  return { wide: true, inner: `<div class="inc-body"><h2>${esc(specLabel(spec))}</h2><p class="lead">${esc(why)}</p>
    <div class="alert info" style="margin-bottom:12px">You pay when the work is done. Prices and times are quotes: firms can run late, and the quality of the work is not guaranteed. Advertised ratings can be misleading, so watch how each firm treats you.</div>
    <div class="firms">${order.map(row).join('')}</div>
    <div class="actions"><button class="btn ghost" data-act="closeModal">Not now</button></div></div>` };
};

actions.getQuotes = d => {
  const err = validateSpec(specFrom(d));
  if (err) return toast(err, 'bad');
  openModal({ type: 'contractors', kind: d.kind, target: d.target, key: d.key });
};
actions.hireFirm = d => {
  const r = orderWork(specFrom(d), d.firm);
  if (!r.ok) return toast(r.error, 'bad');
  ui.modal = null;
  toast(r.done ? r.text : `${firmDef(d.firm).name} booked. ${r.text}`, r.done && r.outcome === 'bad' ? 'bad' : 'good');
  commit();
};

/* ---------- Work in progress ---------- */
function worksPanel() {
  if (!S.works.length) return '';
  const rows = S.works.slice().sort((a, b) => a.doneDay - b.doneDay).map(w => {
    const f = firmDef(w.firm), left = w.eta - S.day, late = S.day > w.eta;
    return `<div class="row" style="padding:10px 0"><div><b>${esc(w.label)}</b><div class="muted small">${esc(w.engineer)} from ${esc(f.name)}${w.free ? ', warranty visit' : `, ${money(w.price)} when done`}</div></div>
      <span class="chip right ${late ? 'warn' : ''}">${late ? 'Running late' : left <= 0 ? 'Finishing today' : `Back in ${left} day${left > 1 ? 's' : ''}`}</span></div>`;
  }).join('');
  return `<div class="section-title"><h3>Contractors on site</h3><span class="chip">${S.works.length}</span></div><div class="card list">${rows}</div>`;
}
function workChip(target, key) {
  const w = workFor(target, key);
  if (!w) return '';
  const left = w.eta - S.day;
  return `<span class="chip ${S.day > w.eta ? 'warn' : 'info'}">${esc(firmDef(w.firm).name)} ${w.kind === 'service' ? 'servicing' : 'repairing'}, ${S.day > w.eta ? 'running late' : left <= 0 ? 'finishing today' : `back in ${left} day${left > 1 ? 's' : ''}`}</span>`;
}
function guaranteeChip(t) {
  if (!t.warranty || t.warranty.until < S.day) return '';
  return `<span class="chip good" title="If the same fault returns, they come back free">Guaranteed by ${esc(firmDef(t.warranty.firm).name)} until day ${t.warranty.until + 1}</span>`;
}

/* ---------- Directory ---------- */
function contractorDirectory() {
  const cards = FIRMS.map(f => {
    const r = firmRecord(f.key);
    return `<div class="card stack"><div class="row"><h3>${esc(f.name)}</h3></div><div class="muted small">${esc(f.blurb)}</div>
      <div class="row small"><span class="stars">${stars(f.advertised)}</span><span class="muted">advertised</span></div>
      <div class="small">${f.allSpecialist ? 'Specialist in everything' : f.trades.length ? 'Does: ' + esc(f.trades.map(t => TRADE_NAMES[t]).join(', ')) : 'General work'}</div>
      <div class="small">${f.warranty ? f.warranty + ' day guarantee' : 'No guarantee'} · ${f.speed === 0 ? 'same-day call-outs' : f.speed < 1 ? 'quick' : f.speed <= 1.2 ? 'average speed' : 'slow'}</div>
      <div class="small">${firmExperience(f.key)}${r.jobs ? ` · ${r.ok} went well` : ''}</div></div>`;
  }).join('');
  return `<div class="section-title"><h3>Contractor directory</h3><span class="muted small">What they advertise and how they have treated you.</span></div><div class="grid g3">${cards}</div>`;
}
