'use strict';

/* ================= UI state & helpers ================= */
const ui = { roomFilter: 'all', view: 'dashboard', staffTab: 'shift', bookingTab: 'rooms', eventTab: 'plan', mailTab: 'inbox', mailSel: null, mailDiscount: false, lastUnreadKeys: null, bkFilter: 'all', calType: null, modal: null, photo: null, autoInc: false, pendingImport: null };
const missingImgs = new Set();   // image files that failed to load (so we show the placeholder straight away)

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 9.5 4 4 0 0 1 17 18z"/>',
  rain: '<path d="M7 14a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 5.5 4 4 0 0 1 17 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
  storm: '<path d="M7 13a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 4.5 4 4 0 0 1 17 13z"/><path d="M12.5 13l-2.5 4h3l-2 4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  bed: '<path d="M3 19V6"/><path d="M3 14h18v5"/><path d="M21 14v-2a3 3 0 0 0-3-3h-8v5"/><circle cx="7" cy="11" r="1.6"/>',
  guests: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.4c2.2.7 3.5 2.6 3.5 5.6"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  tasks: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM8.5 12h7M8.5 16h5"/>',
  staff: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 16c.5-1.7 1.9-2.5 3.5-2.5s3 .8 3.5 2.5M14.5 10h4M14.5 14h3"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>',
  gear: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8 14h2M14 14h2M8 17h2"/>',
  utensils: '<path d="M6 3v7a2 2 0 0 0 2 2v9"/><path d="M10 3v7a2 2 0 0 1-2 2"/><path d="M18 21V3c-2 1-3.5 4-3.5 8h3.5"/>',
  up: '<path d="M12 20V5"/><path d="M5 12l7-7 7 7"/><path d="M5 20h14"/>'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = msg;
  const box = document.getElementById('toasts');
  while (box.children.length >= 3) box.firstChild.remove();
  box.appendChild(el);
  setTimeout(() => el.remove(), 3400);
  if (typeof sfx === 'function') sfx(kind === 'bad' ? 'bad' : kind === 'good' ? 'good' : 'tick');
}
function commit() { writeSave(); render(); }

/* ---------- Images with graceful fallbacks ---------- */
function fallbackHtml(d) {
  if (d.fb === 'avatar') return `<div class="av-fb ${esc(d.size || '')}">${esc(d.ini || '')}</div>`;
  if (d.fb === 'scene') return `<div class="scene-fb">${esc(d.label || '')}<small>${esc(d.sub || '')}</small></div>`;
  return `<div class="photo ph-fb"><span>${esc(d.label || '')}</span></div>`;
}
function imgHtml(src, d) {
  if (src && d.alt2 && missingImgs.has(src)) { src = d.alt2; d = Object.assign({}, d, { alt2: null }); }   // preferred picture missing: try the next one
  if (!src || missingImgs.has(src)) return fallbackHtml(d);
  const cls = d.fb === 'avatar' ? `av ${d.size || ''}` : d.fb === 'scene' ? '' : 'photo';
  return `<img class="${cls}" src="${esc(src)}" alt="${esc(d.alt || '')}" data-fb="${esc(d.fb)}" data-size="${esc(d.size || '')}" data-ini="${esc(d.ini || '')}" data-label="${esc(d.label || '')}" data-sub="${esc(d.sub || '')}" data-alt2="${esc(d.alt2 || '')}">`;
}
function avatar(p, size) {
  const up = safeImg(p.photo);
  return imgHtml(up || (p.portrait ? portraitPath(p.portrait) : null), { fb: 'avatar', size: size || '', ini: initials(p.name), alt: p.name });
}
/* "Family: with Tom, Ella (child)" under a name; nothing for someone travelling alone. */
const partyNote = p => p && p.members.length > 1 ? `<div class="muted small">${esc(REL_LABELS[p.rel] || 'Party')}: ${esc(partyLine(p))}</div>` : '';
/* A small face for everyone in a party, the lead guest first, children after the grown-ups. */
const partyFaces = p => p && p.members.length > 1 ? `<div class="row" style="gap:4px;margin-top:6px">${p.members.slice(0, 7).map(m => imgHtml(personFacePath(m), { fb: 'avatar', size: 'sm', ini: initials(m.n), alt: m.n })).join('')}</div>` : '';
const guestAvatar = (g, size) => imgHtml(guestFacePath(g.name, (g.party && g.party.members[0] && g.party.members[0].gender) || 'f'), { fb: 'avatar', size: size || '', ini: initials(g.name), alt: g.name });
function roomPhoto(r) {
  const up = safeImg(r.photo);
  const d = { fb: 'photo', label: `${r.type} room`, alt: r.name };
  if (up) return imgHtml(up, d);
  // a damaged room shows its trashed photo when one exists
  return r.damaged ? imgHtml(roomDamagePath(r), Object.assign(d, { alt2: roomImagePath(r) })) : imgHtml(roomImagePath(r), d);
}
/* Scenario picture: a scenario can supply a more specific picture (primary), falling back to its own file. */
const sceneHtml = (key, title, primary) => imgHtml(primary || scenePath(key), { fb: 'scene', label: title, sub: `Add image: assets/scenes/${key}.jpg`, alt: title, alt2: primary ? scenePath(key) : null });
const incScene = inc => { const c = ctxOf(inc); return sceneHtml(c.s.img, scenarioTitle(inc), c.s.imgFor ? c.s.imgFor(c) : null); };

/* ================= Views ================= */
const onDutyNow = () => S.staff.filter(s => worksOn(s, S.day) && s.sickDays === 0);
const condClass = c => c >= 70 ? 'good' : c >= 40 ? 'warn' : 'bad';
const condWord = c => c >= 70 ? 'Good' : c >= 40 ? 'Fair' : 'Poor';
const sevChip = s => `<span class="chip ${s === 'Urgent' ? 'bad' : s === 'Serious' ? 'warn' : ''}">${esc(s)}</span>`;

function attentionItems() {
  const a = [];
  const jobs = t => S.jobs.filter(j => j.type === t).length;
  if (S.works.length) a.push({ kind: 'info', text: `${S.works.length} contractor job${S.works.length > 1 ? 's' : ''} in progress`, act: 'tasks' });
  const due = arrivalsDue().length;
  if (due) a.push({ kind: 'warn', text: `${due} reservation${due > 1 ? 's' : ''} arriving today`, act: 'bookings' });
  if (S.incidents.length) a.push({ kind: 'bad', text: `${S.incidents.length} incident${S.incidents.length > 1 ? 's' : ''} waiting for your decision`, act: 'incidents' });
  if (jobs('complaint')) a.push({ kind: 'warn', text: `${jobs('complaint')} guest complaint${jobs('complaint') > 1 ? 's' : ''}`, act: 'tasks' });
  if (jobs('request')) a.push({ kind: 'info', text: `${jobs('request')} guest request${jobs('request') > 1 ? 's' : ''}`, act: 'tasks' });
  const dirty = S.rooms.filter(r => r.dirty).length, dmg = S.rooms.filter(r => r.damaged).length;
  if (dirty) a.push({ kind: 'warn', text: `${dirty} room${dirty > 1 ? 's' : ''} need${dirty > 1 ? '' : 's'} cleaning`, act: 'tasks' });
  if (dmg) a.push({ kind: 'bad', text: `${dmg} room${dmg > 1 ? 's' : ''} out of service (damaged)`, act: 'tasks' });
  S.assets.filter(x => x.broken).forEach(x => a.push({ kind: 'bad', text: `${ASSET_DEFS[x.key].name} is broken`, act: 'maintenance' }));
  S.assets.filter(x => !x.broken && x.cond < 40).forEach(x => a.push({ kind: 'warn', text: `${ASSET_DEFS[x.key].name} needs servicing (${x.cond}%)`, act: 'maintenance' }));
  const urgentMail = unreadMail().filter(m => m.urgent).length;
  if (urgentMail) a.push({ kind: 'bad', text: `${urgentMail} urgent message${urgentMail > 1 ? 's' : ''} in your inbox`, act: 'inbox' });
  const evToday = S.events.filter(e => e.day === S.day), evSoon = S.events.filter(e => e.day === S.day + 1);
  if (evToday.length) a.push({ kind: 'warn', text: `${evToday.map(e => e.name).join(', ')} tonight`, act: 'events' });
  if (evSoon.length) a.push({ kind: 'info', text: `${evSoon.map(e => e.name).join(', ')} tomorrow`, act: 'events' });
  if (S.eventRequests.length) a.push({ kind: 'info', text: `${S.eventRequests.length} event request${S.eventRequests.length > 1 ? 's' : ''} from clients`, act: 'events' });
  if (S.enquiries.length) a.push({ kind: 'info', text: `${S.enquiries.length} booking enquir${S.enquiries.length > 1 ? 'ies' : 'y'}`, act: 'guests' });
  S.staff.filter(s => s.sickDays > 0).forEach(s => a.push({ kind: 'warn', text: `${s.name} is off sick`, act: 'staff' }));
  if (S.money < 0) a.push({ kind: 'bad', text: 'You are overdrawn. Earn more or cut costs.', act: 'finance' });
  return a;
}

const ROOM_FILTERS = [['all', 'All', () => true], ['ready', 'Ready', r => isReady(r)], ['occupied', 'Occupied', r => !!r.guestId],
  ['cleaning', 'Needs cleaning', r => r.dirty], ['damaged', 'Damaged', r => r.damaged]];
function roomChips(r) {
  const g = r.guestId ? guestById(r.guestId) : null, chips = [];
  if (g) chips.push(`<span class="chip info">Occupied by ${esc(g.name)}, ${g.left} night${g.left > 1 ? 's' : ''} left</span>`);
  if (r.dirty) chips.push('<span class="chip warn">Needs cleaning</span>');
  if (r.damaged) chips.push('<span class="chip bad">Damaged, out of service</span>');
  if (r.damaged && roomUnderWork(r)) chips.push(workChip('room', r.id));
  if (isReady(r)) chips.push('<span class="chip good">Ready for guests</span>');
  return chips.join('');
}
function roomActions(r) {
  return `<button class="btn sm ghost" data-act="editRoom" data-id="${r.id}">Edit room</button>
    ${isReady(r) ? `<button class="btn sm good" data-act="checkInRoom" data-id="${r.id}">Check in guest</button>` : ''}
    ${r.dirty || r.damaged ? '<button class="btn sm" data-act="nav" data-view="tasks">Open tasks</button>' : ''}`;
}
function viewRooms() {
  const flt = ROOM_FILTERS.find(f => f[0] === ui.roomFilter) || ROOM_FILTERS[0];
  const list = S.rooms.filter(flt[2]);
  const compact = list.length > 30;
  const body = compact
    ? `<div class="card" style="padding:4px 16px"><div class="list">${list.map(r => `<div class="row" style="gap:14px">
        <div style="width:84px;flex:none">${roomPhoto(r)}</div><div style="min-width:130px"><b>${esc(r.name)}</b><div class="muted small">${esc(r.type)}, ${money(r.price)} a night</div></div>
        <div class="row" style="flex:1">${roomChips(r)}</div><div class="row">${roomActions(r)}</div></div>`).join('')}</div></div>`
    : list.length ? `<div class="grid g3">${list.map(r => `<div class="card flush">${roomPhoto(r)}
      <div style="padding:16px" class="stack">
        <div class="row"><h3>${esc(r.name)}</h3><span class="chip right">${esc(r.type)}</span></div>
        <div class="row"><b>${money(r.price)}</b><span class="muted small">per night</span></div>
        <div class="row">${roomChips(r)}</div><div class="row">${roomActions(r)}</div></div></div>`).join('')}</div>`
    : '<div class="card empty">No rooms match this filter.</div>';
  const types = Object.keys(ROOM_TYPES).map(t => [t, S.rooms.filter(r => r.type === t).length]).filter(x => x[1]).map(x => `${x[1]} ${x[0]}`).join(', ');
  return `<div class="pagehead"><div><h2>Rooms</h2><p>${S.rooms.filter(isReady).length} of ${S.rooms.length} ready for guests (${esc(types)}). Limit for a ${esc(tierInfo().name)}: ${roomLimit()} rooms.</p></div><span class="spacer"></span>
    <button class="btn primary" data-act="newRoom">Build a room</button></div>
    <div class="tabs">${ROOM_FILTERS.map(f => `<button class="tab ${ui.roomFilter === f[0] ? 'active' : ''}" data-act="roomFilter" data-f="${f[0]}">${f[1]} (${S.rooms.filter(f[2]).length})</button>`).join('')}</div>
    ${body}`;
}

function viewGuests() {
  const SHOW = 24;
  const enq = S.enquiries.slice(0, SHOW).map(e => {
    const from = e.arriveDay ?? S.day, later = from > S.day;
    const room = freeRoomsFor(e.type, from, e.nights)[0];
    return `<div class="card flush"><div style="display:flex">
      <div style="width:130px;flex:none">${room ? roomPhoto(room) : imgHtml(null, { fb: 'photo', label: e.type })}</div>
      <div style="padding:14px;flex:1" class="stack">
        <div><b>${esc(e.name)}</b><div class="muted small">${e.nights} night${e.nights > 1 ? 's' : ''}, wants a ${esc(e.type)} room</div>${partyNote(e.party)}
          <div class="small ${later ? '' : 'muted'}">${later ? `Arrives ${esc(dayLabel(from))}` : 'Arriving today'}</div></div>
        <div class="row">
          <button class="btn sm good" data-act="acceptEnquiry" data-id="${e.id}" ${room ? '' : 'disabled'}>${room ? `${later ? 'Reserve' : 'Accept'}: ${esc(room.name)}, ${money(room.price * e.nights)}` : `No ${esc(e.type)} room free`}</button>
          <button class="btn sm ghost" data-act="customiseEnquiry" data-id="${e.id}">Customise</button>
          <button class="btn sm ghost" data-act="declineEnquiry" data-id="${e.id}">Decline</button></div></div></div></div>`;
  }).join('');
  const inhouse = S.guests.slice(0, 36).map(g => {
    const room = roomById(g.roomId);
    const pct = Math.round((1 - g.left / g.nights) * 100);
    return `<div class="card"><div class="row">${guestAvatar(g, 'md')}<div><b>${esc(g.name)}</b><div class="muted small">${esc(room.name)}, ${money(g.price)} a night</div><div class="muted small">${g.adults || 2} adult${(g.adults || 2) > 1 ? 's' : ''}${g.children ? `, ${g.children} child${g.children > 1 ? 'ren' : ''}` : ''}${g.mealPlan && g.mealPlan !== 'room' ? ', ' + esc(MEAL_PLANS[g.mealPlan].name.split(' (')[0].toLowerCase()) : ''}</div>${partyNote(g.party)}${partyFaces(g.party)}</div></div>
      <div class="row small" style="margin-top:12px"><span>${g.left} of ${g.nights} night${g.nights > 1 ? 's' : ''} remaining</span></div>
      <div class="bar" style="margin-top:4px"><i style="width:${pct}%"></i></div>
      <div class="row small" style="margin-top:10px"><span class="muted">Satisfaction</span><span class="chip ${moodClass(g.happiness)} right">${moodWord(g.happiness)}</span></div>
      <div class="bar ${moodClass(g.happiness)}" style="margin-top:4px"><i style="width:${g.happiness}%"></i></div>${wishChips(g)}${guestMemo(g)}</div>`;
  }).join('');
  const reviews = S.reviews.slice(-6).reverse().map(reviewRow).join('');
  return `<div class="pagehead"><div><h2>Guests and bookings</h2></div><span class="spacer"></span><button class="btn primary" data-act="addGuest">New booking</button></div>
    <div class="section-title"><h3>Booking enquiries</h3><span class="chip">${S.enquiries.length}</span>${S.enquiries.length > 1 ? `<button class="btn sm good right" data-act="acceptAll">Accept all that fit</button>` : ''}</div>
    ${S.enquiries.length ? `<div class="grid g2">${enq}</div>${S.enquiries.length > SHOW ? `<p class="muted small">${S.enquiries.length - SHOW} more enquiries. Use Accept all that fit.</p>` : ''}` : '<div class="card empty">No enquiries left today.</div>'}
    <div class="section-title"><h3>Guests staying</h3><span class="chip">${S.guests.length}</span></div>
    ${S.guests.length ? `<div class="grid g3">${inhouse}</div>${S.guests.length > 36 ? `<p class="muted small">Showing 36 of ${S.guests.length} guests.</p>` : ''}` : '<div class="card empty">No guests staying. Accept some enquiries.</div>'}
    <div class="section-title"><h3>Latest reviews</h3><span class="chip scorer"><img src="icons/trip-scorer.png" alt="Trip Scorer" width="39" height="30">${rating().toFixed(1)} average</span></div>
    <div class="card list">${reviews || '<span class="muted">No reviews yet.</span>'}</div>
    ${guestBookSection()}`;
}

/* ---------- Growth: goals and expansion ---------- */
function goalCard(gp, compact) {
  const t = gp.next;
  const rows = gp.items.map(i => `<div style="margin-top:10px"><div class="row small"><span>${esc(i.label)}</span><span class="chip ${i.done ? 'good' : ''} right">${i.done ? 'Done' : esc(i.have)}</span></div>
    <div class="bar ${i.done ? 'good' : ''}" style="margin-top:4px"><i style="width:${Math.round(i.pct * 100)}%"></i></div></div>`).join('');
  return `<div class="card"><div class="row"><h3>Next level: ${esc(t.name)}</h3><span class="chip warn right">Reward ${money(t.grant)}</span></div>
    <div class="muted small" style="margin-top:2px">Meet every goal at the same time and investors fund your growth. Unlocks: ${esc(unlocksOf(t).join(', '))}.</div>${rows}
    ${compact ? `<div class="row" style="margin-top:14px"><button class="btn sm ghost" data-act="nav" data-view="expansion">Open expansion</button></div>` : ''}</div>`;
}

function viewExpansion() {
  const gp = goalProgress(), t = tierInfo();
  const typeCards = Object.keys(ROOM_TYPES).map(type => {
    const d = ROOM_TYPES[type], owned = S.rooms.filter(r => r.type === type).length;
    const inTier = t.types.includes(type), needsLift = type === 'Luxury Suite' && inTier && !hasFacility('lift');
    const firstTier = TIERS.find(x => x.types.includes(type));
    let note, can = false;
    if (!inTier) note = `Unlocks at ${firstTier.name}`;
    else if (needsLift) note = 'Build a lift first';
    else if (S.rooms.length >= roomLimit()) note = TIERS[S.tier] ? 'Hotel full. Level up for more rooms' : 'Hotel full';
    else if (!canAfford(ROOM_BUILD_COST[type])) note = 'Not enough cash';
    else { note = ''; can = true; }
    return `<div class="card flush"><div style="${inTier && !needsLift ? '' : 'opacity:.55'}">${imgHtml(roomImagePath({ type, variant: 1 }), { fb: 'photo', label: `${type} room`, alt: type })}</div>
      <div style="padding:14px" class="stack"><div class="row"><h3>${esc(type)}</h3><span class="chip right">${owned} built</span></div>
        <div class="muted small">${esc(d.blurb)}</div>
        <div class="row"><b>${money(ROOM_BUILD_COST[type])}</b><span class="muted small">to build, earns ${money(d.price)} a night</span></div>
        <div class="row"><button class="btn sm primary" data-act="newRoom" data-type="${esc(type)}" ${can ? '' : 'disabled'}>Build one</button><button class="btn sm ghost" data-act="buildMany" data-type="${esc(type)}" data-n="5" ${can ? '' : 'disabled'}>Build 5 (${money(5 * ROOM_BUILD_COST[type])})</button>${note ? `<span class="chip ${inTier ? 'warn' : ''}">${esc(note)}</span>` : ''}</div></div></div>`;
  }).join('');
  const facCards = Object.entries(FACILITY_UPGRADES).map(([key, f]) => {
    const built = hasFacility(key), locked = S.tier < f.tier;
    return `<div class="card stack"><div class="row"><h3>${esc(f.name)}</h3>${built ? '<span class="chip good right">Built</span>' : locked ? `<span class="chip right">Unlocks at ${esc(TIERS[f.tier - 1].name)}</span>` : `<span class="chip warn right">${money(f.cost)}</span>`}</div>
      <div class="muted small">${esc(f.desc)}</div>
      ${built ? '' : `<div><button class="btn sm primary" data-act="buyFacility" data-key="${key}" ${locked || !canAfford(f.cost) ? 'disabled' : ''}>${locked ? 'Locked' : canAfford(f.cost) ? `Build for ${money(f.cost)}` : 'Not enough cash'}</button></div>`}</div>`;
  }).join('');
  return `<div class="pagehead"><div><h2>Expansion</h2><p>Your ${esc(t.name)} (${t.stars}-star) has ${S.rooms.length} of ${roomLimit()} rooms and ${S.staff.length} of ${staffLimit()} staff.</p></div></div>
    ${gp ? goalCard(gp, false) : '<div class="alert good" style="margin-top:6px">You have reached the top: a Grand Resort. Keep your guests happy and the hotel thriving.</div>'}
    <div class="section-title"><h3>Build rooms</h3></div><div class="grid g4">${typeCards}</div>
    <div class="section-title"><h3>Awards</h3><span class="chip">${Object.keys(S.awards).length} of ${AWARDS.length}</span></div><div class="grid g3">${AWARDS.map(a => { const got = S.awards[a.key] !== undefined; return `<div class="card award ${got ? '' : 'locked'}"><div class="medal">${got ? '&#9733;' : '&#9734;'}</div><div><b>${esc(a.name)}</b><div class="muted small">${esc(a.desc)}</div>${got ? `<div class="small pos">Earned on day ${S.awards[a.key] + 1}</div>` : ''}</div></div>`; }).join('')}</div>
    <div class="section-title"><h3>Facilities</h3></div><div class="grid g3">${facCards}</div>`;
}

function viewIncidents() {
  const pending = S.incidents.map(inc => {
    const s = SCEN[inc.sid];
    return `<div class="card flush"><div style="display:flex;flex-wrap:wrap">
      <div style="width:220px;flex:none;min-height:120px" class="scene">${incScene(inc)}</div>
      <div style="padding:16px;flex:1;min-width:240px" class="stack">
        <div class="row">${sevChip(s.sev)}<span class="chip">${esc(s.cat)}</span></div>
        <h3>${esc(scenarioTitle(inc))}</h3><div class="small">${esc(scenarioText(inc))}</div>
        <div><button class="btn primary" data-act="resolve" data-id="${inc.id}">Decide what to do</button></div></div></div></div>`;
  }).join('');
  const log = S.incidentLog.slice(-12).reverse().map(l => `<div class="stack" style="gap:2px"><div class="row"><b>${esc(l.title)}</b><span class="muted small">Day ${l.day + 1}</span></div><div class="small muted">${esc(l.choice)}</div>${l.result ? `<div class="small">${esc(l.result)}</div>` : ''}</div>`).join('');
  return `<div class="pagehead"><div><h2>Incidents</h2><p>Unexpected situations that need a decision. Anything left unresolved at the end of the day makes things worse.</p></div></div>
    ${pending ? `<div class="stack" style="gap:16px">${pending}</div>` : '<div class="card empty">No incidents waiting. Enjoy the calm.</div>'}
    <div class="section-title"><h3>Recent decisions</h3></div>
    <div class="card list">${log || '<span class="muted">Nothing yet.</span>'}</div>`;
}

function jobCard(j) {
  const g = j.guestId ? guestById(j.guestId) : null;
  const staff = eligible(j);
  let title, sub = '', tag;
  if (j.type === 'clean') { title = `Clean ${roomById(j.roomId).name}`; tag = 'Housekeeper'; }
  else if (j.type === 'repair') { title = j.target === 'room' ? `Repair ${roomById(j.roomId).name}` : `Repair: ${ASSET_DEFS[j.assetKey].name}`; sub = j.text; tag = 'Maintenance'; }
  else if (j.type === 'complaint') { title = `Complaint: ${g.name} (${roomById(g.roomId).name})`; sub = `"${j.text}"`; tag = 'Receptionist'; }
  else { title = `${j.label}: ${g.name} (${roomById(g.roomId).name})`; sub = `"${j.text}"`; tag = j.role; if (j.dishId && !dishServable(j.dishId)) sub += ' This dish is not on the menu now, so the guest will be upset.'; }
  const q = j.type === 'repair' ? repairQuote(j) : null;
  const free = staff.filter(s => s.used < STAFF_CAP).sort((a, b) => (b.role === j.role) - (a.role === j.role) || b.skill - a.skill).slice(0, 6);
  const picks = free.map(s => `<button class="pick" data-act="assign" data-job="${j.id}" data-staff="${s.id}" ${''}>${avatar(s, 'sm')}<span>${esc(s.name.split(' ')[0])} <small>${STAFF_CAP - s.used} left${q ? ', parts ' + money(q.house) : ''}</small></span></button>`).join('');
  return `<div class="card stack">
    <div class="row"><div><b>${esc(title)}</b>${sub ? `<div class="small muted">${esc(sub)}</div>` : ''}</div>
      <span class="chip right">${esc(tag)}${j.pay ? `, +${money(j.pay)}` : ''}</span></div>
    ${j.type === 'complaint' ? `<label class="row small"><input type="checkbox" data-act="toggleDiscount" data-job="${j.id}" ${j.discount ? 'checked' : ''}> Offer a ${money(DISCOUNT_COST)} discount (guest becomes much happier)</label>` : ''}
    <div class="small muted">Send someone:</div>
    ${free.length ? `<div class="staffchips">${picks}</div>` : staff.length ? `<div class="alert warn">Everyone who can do this has already done ${STAFF_CAP} jobs today.</div>` : `<div class="alert">${j.needsAsset && (assetByKey(j.needsAsset) || {}).broken ? 'The equipment needed is broken.' : 'Nobody who can do this is working today. Change the rota or hire someone.'}</div>`}
    ${q ? `<div class="row"><button class="btn sm ghost" data-act="getQuotes" data-kind="repair" data-target="${j.target}" data-key="${j.target === 'room' ? j.roomId : j.assetKey}">Get contractor quotes</button><span class="muted small">Compare price, speed and track record.</span></div>` : ''}
    ${j.type === 'request' ? `<div><button class="btn sm ghost" data-act="declineRequest" data-job="${j.id}">Decline request</button></div>` : ''}
  </div>`;
}
function viewTasks() {
  const groups = [['Complaints', 'complaint'], ['Repairs', 'repair'], ['Guest requests', 'request'], ['Rooms to clean', 'clean']];
  const body = groups.map(([title, type]) => {
    const list = S.jobs.filter(j => j.type === type);
    return `<div class="section-title"><h3>${title}</h3><span class="chip">${list.length}</span></div>
      ${list.length ? `<div class="grid g2">${list.slice(0, 30).map(jobCard).join('')}</div>${list.length > 30 ? `<p class="muted small">${list.length - 30} more not shown. Use Assign everything.</p>` : ''}` : '<div class="card empty">Nothing here.</div>'}`;
  }).join('');
  return `<div class="pagehead"><div><h2>Tasks</h2><p>${S.jobs.length} open.</p></div><span class="spacer"></span>${S.jobs.length ? `<button class="btn primary" data-act="assignAll">Assign everything</button>` : ''}</div>
    ${capacityCard()}<div class="alert info">Each team member can do ${STAFF_CAP} jobs a day. Unresolved complaints make guests angrier every night. Requests not handled by the end of the day are lost. Managers can do any job. Assign everything gives each job to the best person available, with no discounts on complaints.</div>${worksPanel()}${body}`;
}

function viewMaintenance() {
  const rows = S.assets.map(a => {
    const d = ASSET_DEFS[a.key], q = serviceQuote(a.key);
    const worker = bestStaff('Maintenance'), w = workFor('asset', a.key);
    return `<div class="equip">
      <div><b>${esc(d.name)}</b><div class="muted small">${a.broken ? esc(d.effect) : 'Wears down a little every day'}</div><div style="margin-top:4px">${w ? workChip('asset', a.key) : guaranteeChip(a)}</div></div>
      <div>${a.broken ? '<span class="chip bad">Broken</span>' : `<div class="row small"><span class="chip ${condClass(a.cond)}">${condWord(a.cond)}</span><span class="muted">${a.cond}%</span></div><div class="bar ${condClass(a.cond)}" style="margin-top:5px"><i style="width:${a.cond}%"></i></div>`}</div>
      <div class="small muted">${a.broken ? '' : (a.cond < 50 ? 'High risk of breakdown' : 'Low risk')}</div>
      <div class="row">${a.broken
        ? (w ? '' : '<button class="btn sm" data-act="nav" data-view="tasks">Go to repairs</button>')
        : w ? '' : `<button class="btn sm" data-act="service" data-key="${a.key}" ${worker ? '' : 'disabled'} title="${worker ? '' : 'No maintenance staff available today'}">Service in-house (${money(q.house)})</button>
           <button class="btn sm ghost" data-act="getQuotes" data-kind="service" data-target="asset" data-key="${a.key}">Contractor quotes</button>`}</div></div>`;
  }).join('');
  return `<div class="pagehead"><div><h2>Maintenance</h2><p>Equipment wears down every day. Service it before it breaks. Below 50% the risk of a breakdown rises quickly.</p></div></div>
    <div class="alert info">In-house servicing uses one job slot from a Maintenance team member and costs parts only (+45%). Contractors cost more, and the better ones restore equipment further. Compare their quotes.</div>
    <div class="card" style="margin-top:16px;padding-top:6px;padding-bottom:6px">${rows}</div>
    ${worksPanel()}${contractorDirectory()}`;
}

function viewFinance() {
  const today = ledgerDay(S.day);
  const inc = today.filter(e => e.amount > 0).reduce((a, e) => a + e.amount, 0);
  const due = runningCost() + S.staff.reduce((a, s) => a + (worksOn(s, S.day) ? (s.sickDays > 0 ? Math.round(s.wage / 2) : s.wage) : 0), 0);
  const hist = S.history.slice(-7);
  const max = Math.max(1, ...hist.map(h => Math.max(h.income, h.expenses)));
  const bars = hist.length ? hist.map(h => `<div class="col"><div class="pair"><div class="b inc" style="height:${Math.round(h.income / max * 100)}%" title="Income ${money(h.income)}"></div><div class="b exp" style="height:${Math.round(h.expenses / max * 100)}%" title="Costs ${money(h.expenses)}"></div></div><small class="muted">Day ${h.day + 1}</small><small class="${h.income - h.expenses >= 0 ? 'pos' : 'neg'}"><b>${money(h.income - h.expenses)}</b></small></div>`).join('') : '<div class="empty" style="width:100%">Finish your first day to see the chart.</div>';
  const led = S.ledger.slice(-25).reverse().map(e => `<tr><td class="muted">Day ${e.day + 1}</td><td>${esc(e.label)}</td><td class="amt ${e.amount >= 0 ? 'pos' : 'neg'}">${signed(e.amount)}</td></tr>`).join('');
  return `<div class="pagehead"><div><h2>Finance</h2></div></div>
    ${bankCard()}
    <div class="grid g4"><div class="card kpi"><div class="v">${money(S.money)}</div><div class="l">Cash in bank</div></div>
    <div class="card kpi"><div class="v pos">${money(inc)}</div><div class="l">Income today</div></div>
    <div class="card kpi"><div class="v">${money(due)}</div><div class="l">Costs due tonight</div></div></div>
    <div class="section-title"><h3>Last 7 days</h3><span class="chip good">Income</span><span class="chip bad">Costs</span></div>
    <div class="card"><div class="bars tight">${bars}</div></div>
    <div class="section-title"><h3>Latest transactions</h3></div>
    <div class="card"><table class="ledger"><tbody>${led || '<tr><td class="muted">Nothing yet.</td></tr>'}</tbody></table></div>`;
}

function offlineCard() {
  if (!offlinePossible()) return '<p class="muted small">Offline play is switched on when the game is opened from a web address (for example when it is installed from a website). It is not used when the game is opened from a file or inside a phone app, where the game is already stored on the device.</p>';
  const mb = n => (n / 1048576).toFixed(0);
  return `<p class="muted small">Once the game has loaded, it can open and play without a connection. Pictures are stored as you see them, or you can store them all now (about ${offline.bytes ? mb(offline.bytes) : '25'} MB).</p>
    <div class="row"><span class="chip ${offline.state === 'ready' ? 'good' : offline.state === 'failed' ? 'bad' : ''}">${offline.state === 'ready' ? 'Ready for offline play' : offline.state === 'failed' ? 'Offline play could not start' : 'Getting ready'}</span>
      <span class="chip">${offline.saved} of ${offline.total || '...'} pictures stored</span>
      <button class="btn sm primary right" data-act="savePictures" ${offline.busy || offline.state !== 'ready' || (offline.total && offline.saved >= offline.total) ? 'disabled' : ''}>${offline.busy ? 'Saving...' : offline.total && offline.saved >= offline.total ? 'All pictures stored' : 'Save pictures for offline play'}</button></div>`;
}
function viewSettings() {
  return `<div class="pagehead"><div><h2>Settings</h2></div></div>
    <div class="card"><form data-form="rename"><h3>Your hotel</h3>
      <label class="f" for="s-h">Hotel name</label><div class="row" style="flex-wrap:nowrap"><input type="text" id="s-h" name="hotel" maxlength="30" value="${esc(S.hotel)}" style="flex:1;min-width:0"><button type="button" class="btn sm ghost" data-act="diceHotel" data-target="s-h">Suggest a name</button></div>
      <label class="f" for="s-o">Your name</label><input type="text" id="s-o" name="owner" maxlength="20" value="${esc(S.owner)}">
      ${photoField(safeImg(S.ownerPhoto), 'manager')}
      ${bankFields(S.bank)}
      <div class="actions"><button class="btn primary" type="submit">Save</button></div></form></div>
    <div class="card" style="margin-top:18px"><h3>Reception</h3>
      <p class="muted small">With this on, if you have not got round to the people waiting to book, Reception books them in during the evening (a receptionist or manager must be on the rota). Turn it off to choose every booking yourself.</p>
      <label class="row" style="gap:10px"><input type="checkbox" data-act="toggleAutoBook" ${S.autoBook ? 'checked' : ''}> <b>Reception books guests for me</b></label></div>
    <div class="card" style="margin-top:18px"><h3>Sound</h3>
      <p class="muted small">Short sound effects for money, messages, awards and level-ups. This is a setting for this device.</p>
      <label class="row" style="gap:10px"><input type="checkbox" data-act="toggleSound" ${sound.on ? 'checked' : ''}> <b>Sound effects</b></label></div>
    <div class="card" style="margin-top:18px"><h3>Play offline</h3>${offlineCard()}</div>
    <div class="card" style="margin-top:18px"><h3>Save and backup</h3>
      <p class="muted small">Your hotel saves automatically in this browser on this device. Export a file to back it up or move it to another device.</p>
      <div class="row"><button class="btn" data-act="exportSave">Export save</button>
      <label class="btn ghost" for="importFile">Import save</label><input type="file" id="importFile" accept="application/json,.json" data-change="import" hidden>
      <button class="btn danger right" data-act="resetAsk">Start a new game</button></div></div>
    <div class="card" style="margin-top:18px"><h3>Photographs</h3>
      <p class="muted small">Rooms and staff photos can be added in the game (Rooms: Edit room, Staff: Edit and photo). Scenario pictures, room photos and the staff headshots are loaded from the <b>assets</b> folder. See IMAGE-GUIDE.md for exact filenames and ready-made prompts.</p></div>
    <div class="about"><img class="logo-mid" src="icons/logo-small.png" alt="Hotel HQ" width="420" height="279"><div class="muted small">A hotel-management game. Saves stay on this device.</div></div>`;
}

/* ---------- Modals ---------- */
/* Bank name and colour fields, used when starting a game and in Settings. */
function bankFields(bank) {
  const b = bank || { name: BANK_DEFAULT_NAME, colour: BANK_COLOURS[0].key };
  return `<label class="f" for="b-n">Name your bank</label><input type="text" id="b-n" name="bankName" maxlength="${BANK_NAME_MAX}" value="${esc(b.name)}">
    <label class="f">Bank colour</label><div class="swatches" role="radiogroup" aria-label="Bank colour">${BANK_COLOURS.map(c => `<label class="swatch" title="${esc(c.name)}"><input type="radio" name="bankColour" value="${esc(c.key)}" ${c.key === b.colour ? 'checked' : ''}><span style="background:${c.hex}"></span></label>`).join('')}</div>
    <div class="muted small">This is a made-up bank for the game. The game invents the account number, so never type real bank details anywhere in it.</div>`;
}
function bankCard() {
  return `<div class="bankcard" style="background:${bankColour()}"><div class="row"><b>${esc(bankName())}</b><span class="right small">Business account</span></div>
    <div class="acct">${esc(S.bank.account)}</div><div class="row"><span class="small">${esc(S.owner)}</span><b class="right">${money(S.money)}</b></div></div>`;
}
const ownerAvatar = size => imgHtml(safeImg(S.ownerPhoto), { fb: 'avatar', size: size || '', ini: initials(S.owner), alt: S.owner });
function photoField(current, kind) {
  const prev = current ? `<img class="av lg" src="${esc(current)}" alt="">` : `<div class="av-fb lg">+</div>`;
  return `<label class="f">Photo</label><div class="row"><div id="photoPrev">${prev}</div>
    <div class="stack"><input type="file" accept="image/*" data-change="photo"><button type="button" class="btn sm ghost" data-act="removePhoto">Use the default picture</button></div></div>
    <div class="muted small">${kind === 'room' ? 'Choose a picture of the room.' : kind === 'dish' ? 'Choose a picture of the dish.' : kind === 'manager' ? 'Optional: add a headshot of yourself.' : kind === 'trip' ? 'Choose a picture of the excursion.' : 'Choose a headshot of the team member.'} It is resized and stored on this device only.</div>`;
}

function incidentModal(m) {
  const inc = S.incidents.find(i => i.id === m.id);
  if (!inc) return null;
  const s = SCEN[inc.sid], stage = currentStage(inc);
  const others = S.incidents.length - 1;
  const parts = (inc.parts || []).map(p => `<p><b>${esc(p.choice)}.</b> ${esc(p.text)}</p>`).join('');
  const sp = stage.prompt ? fill(stage.prompt, ctxOf(inc)) : '';
  const opts = stage.options.map((o, i) => {
    const os = optionState(inc, i);
    return `<button class="opt" data-act="chooseOption" data-inc="${inc.id}" data-idx="${i}" ${os.reason ? 'disabled' : ''}>
      <span class="t"><b>${esc(os.label)}</b>${os.hint ? `<small>${esc(os.hint)}</small>` : ''}${os.reason ? `<span class="why">${esc(os.reason)}</span>` : ''}</span>
      ${os.sts.map(st => `<span title="${esc(st.name)}">${avatar(st, 'sm')}</span>`).join('')}
      ${os.odds !== null && os.odds !== undefined ? `<span class="chip">${Math.round(os.odds * 100)}% chance</span>` : ''}${os.cost ? `<span class="chip warn">${money(os.cost)}</span>` : ''}</button>`;
  }).join('');
  return `<div class="scene">${incScene(inc)}<div class="tags"><span class="tag">${esc(s.cat)}</span><span class="tag ${esc(s.sev)}">${esc(s.sev)}</span></div></div>
    <div class="inc-body"><h2>${esc(scenarioTitle(inc))}</h2>
    <p class="lead">${esc(scenarioText(inc))}</p>
    ${parts ? `<div class="log">${parts}</div>` : ''}
    ${sp ? `<p class="prompt">${esc(sp)}</p>` : ''}
    <div class="opts">${opts}</div>
    <div class="row" style="margin-top:16px"><button class="btn ghost sm" data-act="decideLater">Decide later</button>${others > 0 ? `<span class="muted small">${others} more situation${others > 1 ? 's' : ''} waiting</span>` : ''}</div></div>`;
}

function modalHtml() {
  const m = ui.modal;
  if (!m) return '';
  if (MODALS[m.type]) { const r = MODALS[m.type](m); return r ? `<div class="overlay" data-act="closeModal" data-backdrop="1"><div class="modal ${r.wide ? 'wide' : ''}" role="dialog" aria-modal="true">${r.inner}</div></div>` : ''; }
  let inner = '', closable = true, wide = false;
  if (m.type === 'intro') {
    closable = false;
    inner = setupHtml();
  } else if (m.type === 'confirm') {
    inner = `<h2>${esc(m.title)}</h2><p>${esc(m.body)}</p><div class="actions"><button class="btn ghost" data-act="closeModal">Cancel</button>
      <button class="btn ${m.danger ? 'danger' : 'primary'}" data-act="${esc(m.act)}" ${Object.entries(m.data).map(([k, v]) => `data-${esc(k)}="${esc(v)}"`).join(' ')}>${esc(m.label)}</button></div>`;
  } else if (m.type === 'report') {
    const r = m.report;
    inner = `<h2>${esc(r.dayLabel)}</h2><div class="headline">${esc(r.headline || 'End of day')}</div>
      ${r.lifeline ? `<div class="alert warn" style="margin-bottom:12px"><b>${esc(bankName())} stepped in.</b> You had run out of money, so the bank paid ${money(r.lifeline.amount)} to cover your bills. ${r.lifeline.left ? `It can only do this ${r.lifeline.left === 1 ? 'one more time' : r.lifeline.left + ' more times'}, so check your costs.` : 'It will not do this again.'}</div>` : ''}
      ${(r.challenges || []).map(ch => `<div class="alert good" style="margin-bottom:12px"><b>${ch.streak ? 'Streak bonus' : ch.weekly ? 'Weekly challenge done' : 'Challenge done'}:</b> ${esc(ch.name)}, +${money(ch.reward)}</div>`).join('')}
      ${(r.awards || []).map(n => `<div class="alert good" style="margin-bottom:12px"><b>Award unlocked:</b> ${esc(n)}</div>`).join('')}
      ${(r.milestones || []).map(g => `<div class="alert good" style="margin-bottom:12px"><b>Goal reached: ${esc(g.name)}.</b>${g.unlock ? ` You have unlocked the ${esc(FEATURES[g.unlock].name)}, free.` : ''}</div>`).join('')}
      ${r.inspection ? inspectionBlock(r.inspection) : ''}
      ${(r.promotions || []).map(p => `<div class="alert good" style="margin-bottom:12px"><b>Promoted to ${esc(p.rank)}!</b> Your certificate is in the Goals list on the Dashboard.</div>`).join('')}
      ${r.levelUp ? `<div class="alert good" style="margin-bottom:12px"><b>Level up!</b> You are about to become a ${esc(r.levelUp)}.</div>` : ''}
      <div class="row"><span class="chip good">Income ${money(r.income)}</span><span class="chip bad">Costs ${money(r.expenses)}</span><span class="chip ${r.income - r.expenses >= 0 ? 'good' : 'bad'}">Profit ${money(r.income - r.expenses)}</span></div>
      ${r.events.length ? `<h3 style="margin-top:16px">What happened</h3><ul>${r.events.map(e => `<li>${esc(e.text)}</li>`).join('')}</ul>` : ''}
      <h3 style="margin-top:16px;margin-bottom:8px">Money</h3><div class="report-lines"><table class="ledger"><tbody>${r.lines.map(l => `<tr><td>${esc(l.label)}</td><td class="amt ${l.amount >= 0 ? 'pos' : 'neg'}">${signed(l.amount)}</td></tr>`).join('')}</tbody></table></div>
      ${tomorrowBlock()}
      ${r.tip ? `<div class="alert info" style="margin-top:14px"><b>Tip:</b> ${esc(r.tip.text)}</div>` : ''}
      ${diaryForm(r.day)}
      <div class="alert info" style="margin-top:14px"><b>Management is now offline.</b> The hotel is paused, so you can change menus, prices and the rota before ${DAYS_LONG[dow()]} begins.</div>
      <div class="actions"><button class="btn ghost" data-act="closeModal">Stay offline</button><button class="btn primary big" data-act="goOnline">Management Online</button></div>`;
  } else if (m.type === 'gameover') {
    closable = false;
    inner = `<h2>The hotel has gone bankrupt</h2><p>You ran out of money (${money(S.money)}), even after ${esc(bankName())} stepped in ${S.lifelines} time${S.lifelines === 1 ? '' : 's'}. Every great hotelier has a bad stretch. Try again with what you have learned: fill your rooms, keep them clean, and watch your costs.</p>
      <div class="actions"><button class="btn primary big" data-act="reset">Start again</button></div>`;
  } else if (m.type === 'incident') {
    const h = incidentModal(m);
    if (!h) return '';
    wide = true; inner = h;
  } else if (m.type === 'outcome') {
    const r = m.res;
    wide = true;
    inner = `<div class="scene">${sceneHtml(r.img, r.title, r.imgPrimary)}<div class="tags"><span class="tag">Outcome</span></div></div>
      <div class="inc-body"><h2>${esc(r.title)}</h2>
      ${r.parts.map(p => `<p><b>${esc(p.choice)}.</b> ${esc(p.text)}</p>`).join('')}
      ${r.lines.length ? `<ul class="effects">${r.lines.map(l => `<li class="${l.kind || ''}"><span>${esc(l.t)}</span>${l.amt != null ? `<span class="amt ${l.amt >= 0 ? 'pos' : 'neg'}">${signed(l.amt)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      <div class="actions"><button class="btn primary" data-act="continueIncident">${ui.autoInc && S.incidents.length ? 'Next situation' : 'Continue'}</button></div></div>`;
  } else if (m.type === 'levelup') {
    const t = tierInfo();
    wide = true;
    inner = `<div class="scene">${sceneHtml('exterior', t.name, tierImage(S.tier))}<div class="tags"><span class="tag">Level up</span></div></div>
      <div class="inc-body"><h2>You are now a ${esc(t.name)}</h2>
      <p class="lead">Your hard work has paid off. Investors have paid <b>${money(t.grant)}</b> into your account so you can grow.</p>
      <ul class="effects">${unlocksOf(t).map(x => `<li class="good"><span>Unlocked: ${esc(x)}</span></li>`).join('')}</ul>
      ${TIERS[S.tier] ? `<p class="muted small" style="margin-top:12px">Next goal: ${esc(TIERS[S.tier].name)}. Check the Expansion page for the targets.</p>` : '<p class="muted small" style="margin-top:12px">This is the top level. Keep your guests happy and your hotel thriving.</p>'}
      <div class="actions"><button class="btn ghost" data-act="closeModal">Later</button><button class="btn primary" data-act="levelUpGo">Start expanding</button></div></div>`;
  } else if (m.type === 'staff') {
    const s = staffById(m.id);
    if (!s) return '';
    inner = `<form data-form="staff"><h2>Edit ${esc(s.name)}</h2>
      <label class="f" for="e-n">Name</label><div class="row" style="flex-wrap:nowrap"><input type="text" id="e-n" name="name" maxlength="30" value="${esc(s.name)}" required data-autofocus style="flex:1;min-width:0"><button type="button" class="btn sm ghost" data-act="diceName" data-target="e-n" data-gender="${esc(s.gender || '')}">Suggest a name</button></div>
      ${photoField(safeImg(s.photo), 'staff')}
      ${S.ownerPhoto ? '<div style="margin-top:8px"><button type="button" class="btn sm ghost" data-act="useMyPhoto">Use my own photo for this person</button></div>' : ''}
      <div class="actions"><button class="btn ghost" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`;
  } else if (m.type === 'room' || m.type === 'newRoom') {
    const isNew = m.type === 'newRoom';
    const types = isNew ? availableRoomTypes() : Object.keys(ROOM_TYPES);
    const r = isNew ? { name: nextRoomName(), type: types.includes(m.roomType) ? m.roomType : types[0], price: 0, photo: null } : roomById(m.id);
    if (!r) return;
    inner = `<form data-form="${m.type}"><h2>${isNew ? 'Build a new room' : 'Edit ' + esc(r.name)}</h2>
      ${isNew ? `<div class="muted small">${S.rooms.length} of ${roomLimit()} rooms for a ${esc(tierInfo().name)}.</div>` : ''}
      <label class="f" for="r-n">Room name</label><input type="text" id="r-n" name="name" maxlength="30" value="${esc(r.name)}" required data-autofocus>
      <label class="f" for="r-t">Type</label><select id="r-t" name="type">${types.map(t => `<option value="${esc(t)}" ${t === r.type ? 'selected' : ''}>${esc(t)}${isNew ? ` (${money(ROOM_BUILD_COST[t])} to build, ${money(ROOM_TYPES[t].price)} a night)` : ''}</option>`).join('')}</select>
      ${isNew ? '' : `<label class="f" for="r-p">Price per night (${CURRENCY}30 to ${CURRENCY}500)</label><input type="number" id="r-p" name="price" min="30" max="500" step="5" value="${r.price}"><div class="muted small">Guests start less satisfied if the price is above the usual rate for that room type.</div>`}
      ${photoField(safeImg(r.photo), 'room')}
      <div class="actions"><button class="btn ghost" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">${isNew ? 'Build it' : 'Save'}</button></div></form>`;
  }
  return `<div class="overlay" ${closable ? 'data-act="closeModal" data-backdrop="1"' : ''}><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${inner}</div></div>`;
}

/* ---------- Shell ---------- */
const MODALS = {};   // extra modals registered by ui-bookings.js and ui-menu.js
/* Navigation entries: [view, icon, label, visible?, group]. The phone tab bar shows PHONE_TABS and puts the rest under "More". */
const NAV = [['dashboard', 'home', 'Dashboard', null, 'Hotel'], ['staff', 'staff', 'Team', null, 'Hotel'], ['bookings', 'calendar', 'Bookings', null, 'Hotel'], ['events', 'utensils', 'Events', null, 'Hotel'], ['inbox', 'mail', 'Inbox', null, 'Hotel'],
  ['tasks', 'tasks', 'Tasks', null, 'Hotel'], ['incidents', 'alert', 'Incidents', null, 'Hotel'],
  ['rooms', 'bed', 'Rooms', null, 'Property'], ['guests', 'guests', 'Guests', null, 'Property'], ['maintenance', 'wrench', 'Maintenance', null, 'Property'],
  ['expansion', 'up', 'Expansion', null, 'Business'], ['finance', 'cash', 'Finance', null, 'Business'], ['settings', 'gear', 'Settings', null, 'Business']];
const PHONE_TABS = ['dashboard', 'staff', 'bookings', 'events', 'inbox'];
const navShown = () => NAV.filter(n => !n[3] || n[3]());
const VIEWS = { rooms: viewRooms, guests: viewGuests, incidents: viewIncidents, tasks: viewTasks, maintenance: viewMaintenance, expansion: viewExpansion, finance: viewFinance, settings: viewSettings };

function navBadges() {
  return { crisis: [S.crises.length, 'red'], tasks: [S.jobs.length, ''], inbox: [unreadMail().length, unreadMail().some(m => m.urgent) ? 'red' : ''], events: [S.eventRequests.length, ''], guests: [S.enquiries.length, ''], bookings: [arrivalsDue().length, ''], incidents: [S.incidents.length, 'red'],
    maintenance: [S.assets.filter(a => a.broken || a.cond < 40).length, S.assets.some(a => a.broken) ? 'red' : ''],
    phone: [phoneOpen().length, phoneRinging() ? 'red' : ''] };
}
const navButton = (n, badge) => { const [k, icon, l] = n, b = badge[k]; return `<button class="nav ${ui.view === k ? 'active' : ''}" data-act="nav" data-view="${k}" title="${l}" aria-label="${l}">${ic(icon)}<span class="lbl">${l}</span>${b && b[0] ? `<span class="badge ${b[1]}">${b[0]}</span>` : ''}</button>`; };
/* Phones show four tabs and a More button. Wider screens show every entry, grouped. */
function navHtml() {
  const badge = navBadges(), shown = navShown();
  const more = shown.filter(n => !PHONE_TABS.includes(n[0])), moreCount = more.reduce((a, n) => a + ((badge[n[0]] || [0])[0] ? 1 : 0), 0), moreActive = more.some(n => n[0] === ui.view);
  let html = '<div class="brand"><img class="logo-side" src="icons/logo-small.png" alt="Hotel HQ" width="420" height="279"><small>Management</small></div>', group = null;
  for (const n of shown) {
    const isTab = PHONE_TABS.includes(n[0]);
    if (n[4] !== group) { group = n[4]; html += `<div class="navgroup">${group}</div>`; }
    html += isTab ? navButton(n, badge) : `<span class="more-hidden">${navButton(n, badge)}</span>`;
    if (n[0] === PHONE_TABS[PHONE_TABS.length - 1]) html += `<button class="nav more-btn ${moreActive ? 'active' : ''}" data-act="openMore" aria-label="More">${ic('more')}<span class="lbl">More</span>${moreCount ? `<span class="badge">${moreCount}</span>` : ''}</button>`;
  }
  return html;
}
MODALS.more = () => {
  const badge = navBadges();
  return { inner: `<h2>More</h2><div class="sheet-grid">${navShown().filter(n => !PHONE_TABS.includes(n[0])).map(n => navButton(n, badge)).join('')}</div>` };
};

function render() {
  const app = document.getElementById('app');
  if (S && ui.modal && ui.modal.type === 'incident' && !S.incidents.some(i => i.id === ui.modal.id)) ui.modal = null;
  if (S && !ui.modal && S.tierSeen < S.tier) ui.modal = { type: 'levelup' };
  if (!S) { app.innerHTML = modalHtml(); focusFirst(); return; }
  const unreadKeys = new Set(unreadMail().map(m => m.key));
  if (ui.lastUnreadKeys && [...unreadKeys].some(k => !ui.lastUnreadKeys.has(k) && !k.startsWith('call:'))) sfx('mail');   // voicemails and emails have their own soft ding
  ui.lastUnreadKeys = unreadKeys;
  app.innerHTML = `<div class="app">
    <nav class="side" aria-label="Main">${navHtml()}</nav>
    <div class="main">
      <header class="top"><span class="me">${ownerAvatar('md')}</span><div><div class="hname">${esc(S.hotel)}</div><div class="sub">${esc(tierInfo().name)} &middot; ${DAYS_LONG[dow()]}, day ${S.day + 1}</div></div>
        <span class="spacer"></span>
        <div class="stat"><b class="${S.money < 0 ? 'neg' : ''}">${money(S.money)}</b><small>Cash</small></div>
        <div class="stat hide-sm"><b>${rating().toFixed(1)} <span class="stars">${stars(Math.round(rating()))}</span></b><small>Rating</small></div>
        ${S.crises.length && isOnline() ? `<button class="btn ghost hide-sm crisis-btn" data-act="nav" data-view="crisis">Crisis</button>` : ''}${S.incidents.length && isOnline() ? `<button class="btn ghost hide-sm" data-act="nav" data-view="incidents">${S.incidents.length} incident${S.incidents.length > 1 ? 's' : ''}</button>` : ''}
        ${mgmtButton()}</header>
      <main class="content">${mgmtBanner()}${VIEWS[ui.view]()}</main>
    </div></div>${modalHtml()}`;
  focusFirst();
}
const AFTER_RENDER = [];   // functions run after every render (the booking and dish forms use this to fill in their live summaries)
function focusFirst() { AFTER_RENDER.forEach(fn => fn()); const el = document.querySelector('[data-autofocus]'); if (el) el.focus(); }

/* ================= Actions ================= */
function openModal(m) { ui.modal = m; ui.photo = null; render(); }
function closeModal() {
  const was = ui.modal && ui.modal.type;
  if (was === 'incident') ui.autoInc = false;
  ui.modal = null; ui.photo = null;
  if (was === 'levelup') { S.tierSeen = S.tier; writeSave(); }
  if (was === 'welcome' && ui.pendingAway) return showAway(ui.pendingAway);
  if (was === 'away' && announceCrisis()) return;
  if ((was === 'report' || was === 'levelup') && ui.autoInc && !(S.tierSeen < S.tier)) return openNextIncident();
  render();
}
function openNextIncident() {
  if (S && !isOnline()) { ui.modal = null; render(); return; }   // nothing happens while Management is offline
  if (announceCrisis()) return;   // a crisis that began overnight comes first
  pruneIncidents();
  const inc = S.incidents[0];
  ui.modal = inc ? { type: 'incident', id: inc.id } : null;
  render();
}
function confirmModal(title, body, act, label, data, danger) {
  openModal({ type: 'confirm', title, body, act, label, data: data || {}, danger: !!danger });
}

const actions = {
  nav(d) { if (d.view === 'staff') noteFirst('team'); ui.view = d.view; if (ui.modal && ui.modal.type === 'more') ui.modal = null; render(); window.scrollTo(0, 0); },
  savePictures() { savePictures(() => render()).then(n => { toast(`${n} pictures are stored for offline play.`, 'good'); render(); }); render(); },
  toggleSound() { setSound(!sound.on); render(); },
  toggleAutoBook() { S.autoBook = !S.autoBook; toast(S.autoBook ? 'Reception will book guests in for you.' : 'You will choose every booking yourself.'); commit(); },
  hideFirsts() { S.firsts.hidden = true; commit(); },
  openMore() { openModal({ type: 'more' }); },
  closeModal,
  decideLater() { ui.autoInc = false; closeModal(); },
  resolve(d) { ui.autoInc = false; openModal({ type: 'incident', id: Number(d.id) }); },
  chooseOption(d) {
    const res = resolveIncident(Number(d.inc), Number(d.idx));
    if (!res) return;
    if (!res.done) { commit(); return; }
    ui.modal = { type: 'outcome', res };
    commit();
  },
  continueIncident() { writeSave(); if (ui.autoInc) openNextIncident(); else { ui.modal = null; render(); } },
  endDayAsk() {
    const open = S.jobs.filter(j => j.type === 'complaint' || j.type === 'request').length + S.incidents.length;
    if (open > 0) confirmModal('Go offline and end the day?', `You still have ${open} unresolved matter${open > 1 ? 's' : ''} (complaints, requests or incidents). Guests may become unhappy and leave bad reviews.`, 'endDay', 'Go offline anyway');
    else actions.endDay();
  },
  endDay() {
    const report = runEndDay({ defer: true });   // the day ends now; the next morning comes when Management goes online
    goOffline(localDate(0));
    ui.autoInc = true;
    ui.modal = S.money <= BANKRUPT_AT ? { type: 'gameover' } : { type: 'report', report };
    sfx(report.levelUp ? 'levelup' : (report.awards || []).length || (report.milestones || []).length ? 'award' : report.lifeline ? 'bad' : report.income - report.expenses > 0 ? 'cash' : 'tick');
    commit();
  },
  assign(d) { doAssign(Number(d.job), Number(d.staff)); commit(); },
  service(d) { serviceAsset(d.key); commit(); },
  toggleDiscount(d) { const j = S.jobs.find(x => x.id === Number(d.job)); if (j) { j.discount = !j.discount; commit(); } },
  declineRequest(d) {
    const j = S.jobs.find(x => x.id === Number(d.job));
    if (!j) return;
    const g = guestById(j.guestId);
    if (g) g.happiness = clamp(g.happiness - 8, 0, 100);
    S.jobs = S.jobs.filter(x => x !== j);
    toast('Request declined. The guest is a little upset.', 'bad');
    commit();
  },
  acceptEnquiry(d) {
    const r = acceptEnquiryNow(Number(d.id));
    if (!r.ok) return toast(r.error, 'bad');
    toast(r.guest ? `${r.guest.name} checked in to ${r.room.name}.` : `${r.booking.name} reserved ${r.room.name} for ${dayLabel(r.booking.arriveDay)}.`, 'good');
    commit();
  },
  declineEnquiry(d) { S.enquiries = S.enquiries.filter(x => x.id !== Number(d.id)); commit(); },
  hire(d) {
    const r = hireCandidate(Number(d.id));
    if (!r.ok) return toast(r.error, 'bad');
    toast(`${r.staff.name} has joined as ${r.staff.role}. Check the rota.`, 'good');
    commit();
  },
  advert(d) {
    if (!ROLES[d.role] || !roleAvailable(d.role)) return;
    if (!canAfford(ADVERT_COST)) return toast('Not enough cash for an advert.', 'bad');
    spend(ADVERT_COST, `Job advert (${d.role})`);
    S.candidates = [];
    for (let i = 0; i < 3; i++) S.candidates.push(makeCandidate(d.role, S.candidates.map(c => c.portrait)));
    toast(`Advert posted for a ${d.role}.`, 'good');
    commit();
  },
  fireAsk(d) {
    const s = staffById(Number(d.id));
    if (s) confirmModal(`Fire ${s.name}?`, `${s.name} will leave straight away. You pay one day of wages (${money(s.wage)}) as severance.`, 'fire', 'Yes, fire them', { id: s.id }, true);
  },
  fire(d) {
    const s = staffById(Number(d.id));
    if (!s) return closeModal();
    spend(s.wage, `Severance: ${s.name}`);
    S.staff = S.staff.filter(x => x !== s);
    pruneIncidents();
    ui.modal = null;
    toast(`${s.name} has left the hotel.`);
    commit();
  },
  editStaff(d) { openModal({ type: 'staff', id: Number(d.id) }); },
  editRoom(d) { openModal({ type: 'room', id: Number(d.id) }); },
  newRoom(d) { if (S.rooms.length >= roomLimit()) toast(`A ${tierInfo().name} is limited to ${roomLimit()} rooms. Level up to build more.`, 'bad'); else openModal({ type: 'newRoom', roomType: d.type || null }); },
  buyFacility(d) { if (buyFacility(d.key)) commit(); },
  roomFilter(d) { ui.roomFilter = d.f; render(); },
  assignAll() { const n = autoAssignAll(); toast(n ? `${n} job${n > 1 ? 's' : ''} assigned.` : 'Nothing could be assigned. Check the rota and cash.', n ? 'good' : 'bad'); commit(); },
  acceptAll() { const n = acceptAllEnquiries(); toast(n ? `${n} guest${n > 1 ? 's' : ''} checked in.` : 'No room is ready for any of these guests.', n ? 'good' : 'bad'); commit(); },
  buildMany(d) {
    let n = 0;
    for (let i = 0; i < Number(d.n) && buildRoom(d.type, '', null, true); i++) n++;
    if (n) { toast(`${n} ${d.type} room${n > 1 ? 's' : ''} built.`, 'good'); commit(); }
  },
  levelUpGo() { ui.autoInc = false; closeModal(); ui.view = 'expansion'; render(); window.scrollTo(0, 0); },
  checkInRoom(d) { const r = roomById(Number(d.id)); openModal({ type: 'booking', prefill: { type: r.type, roomId: r.id, arriveDay: S.day } }); },
  addGuest() { openModal({ type: 'booking', prefill: {} }); },
  useMyPhoto() {
    ui.photo = S.ownerPhoto;
    const prev = document.getElementById('photoPrev');
    if (prev) prev.innerHTML = `<img class="av lg" src="${esc(S.ownerPhoto)}" alt="">`;
  },
  removePhoto() {
    ui.photo = 'REMOVE';
    const prev = document.getElementById('photoPrev');
    if (prev) prev.innerHTML = '<div class="av-fb lg">+</div>';
  },
  exportSave() {
    const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hotel-save-day${S.day + 1}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  resetAsk() { confirmModal('Start a new game?', 'This deletes your current hotel. Export a save first if you want to keep it.', 'reset', 'Delete and start again', {}, true); },
  reset() { storage.remove(SAVE_KEY); S = null; ui.view = 'dashboard'; ui.setup = null; openModal({ type: 'intro' }); },
  importApply() {
    if (ui.pendingImport && validState(ui.pendingImport)) {
      S = ui.pendingImport; ui.pendingImport = null; ui.modal = null; ui.view = 'dashboard'; ui.autoInc = false;
      toast('Save loaded.', 'good'); commit();
    } else closeModal();
  }
};

const forms = {
  intro() {
    const t = setupState();
    newGame(t.hotel, t.owner, { photo: setupPhoto(), bankName: t.bankName, bankColour: t.bankColour });
    S.mgmt = { online: false, since: localDate(0) };   // the new hotel is paused: nothing happens until Management Online is pressed
    S.tour = { step: 0, done: false };
    S.visit = { date: localDate(0), streak: 1, best: 1 };   // today counts as the first visit, with no bonus yet
    S.autoBook = true;   // new players: Reception books in anyone they have not got round to
    ui.autoInc = true;
    ui.setup = null; ui.photo = null;
    writeSave();
    ui.modal = null;
    render();
  },
  rename(f) {
    S.hotel = f.get('hotel').trim().slice(0, 30) || S.hotel;
    S.owner = f.get('owner').trim().slice(0, 20) || S.owner;
    if (ui.photo === 'REMOVE') S.ownerPhoto = null; else if (ui.photo) S.ownerPhoto = ui.photo;
    S.bank.name = cleanBankName(f.get('bankName')); if (BANK_COLOURS.some(c => c.key === f.get('bankColour'))) S.bank.colour = f.get('bankColour');
    ui.photo = null;
    toast('Saved.', 'good');
    commit();
  },
  staff(f) {
    const s = staffById(ui.modal.id);
    if (s) {
      s.name = f.get('name').trim().slice(0, 30) || s.name;
      if (ui.photo === 'REMOVE') s.photo = null; else if (ui.photo) s.photo = ui.photo;
    }
    ui.modal = null; ui.photo = null; commit();
  },
  room(f) {
    const r = roomById(ui.modal.id);
    if (r) {
      r.name = f.get('name').trim().slice(0, 30) || r.name;
      const type = f.get('type');
      if (ROOM_TYPES[type] && type !== r.type) { r.type = type; r.variant = 1; }
      r.price = clamp(Math.round(Number(f.get('price')) || r.price), 30, 500);
      if (ui.photo === 'REMOVE') r.photo = null; else if (ui.photo) r.photo = ui.photo;
    }
    ui.modal = null; ui.photo = null; commit();
  },
  newRoom(f) {
    const room = buildRoom(f.get('type'), f.get('name'), ui.photo && ui.photo !== 'REMOVE' ? ui.photo : null);
    if (!room) return;
    ui.modal = null; ui.photo = null; commit();
  }
};

/* ---------- Photo upload (resized, stored as a data URL) ---------- */
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Not an image'));
      img.onload = () => {
        const sc = Math.min(1, 480 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * sc));
        c.height = Math.max(1, Math.round(img.height * sc));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ================= Events ================= */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  if (t.dataset.backdrop && e.target !== t) return;   // only the dark backdrop itself closes a modal
  const fn = actions[t.dataset.act];
  if (fn && LIVE_ACTIONS.has(t.dataset.act) && offlineBlocked()) return;
  if (fn) fn(t.dataset);
});
document.addEventListener('submit', e => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = forms[form.dataset.form];
  if (fn && LIVE_FORMS.has(form.dataset.form) && offlineBlocked()) return;
  if (fn) fn(new FormData(form));
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.change === 'photo' && t.files && t.files[0]) {
    try {
      ui.photo = await readPhoto(t.files[0]);
      const prev = document.getElementById('photoPrev');
      if (prev) prev.innerHTML = `<img class="av lg" src="${esc(ui.photo)}" alt="">`;
    } catch (err) { toast('That file could not be used as a picture.', 'bad'); }
  } else if (t.dataset.change === 'import' && t.files && t.files[0]) {
    try {
      const data = migrate(JSON.parse(await t.files[0].text()));
      if (!validState(data)) throw new Error('bad save');
      ui.pendingImport = data;
      confirmModal('Load this save?', `This replaces your current hotel with "${data.hotel}" (day ${data.day + 1}).`, 'importApply', 'Load it');
    } catch (err) { toast('That is not a valid Hotel HQ save file.', 'bad'); }
    t.value = '';
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ui.modal && !['intro', 'gameover'].includes(ui.modal.type)) closeModal();
});
/* Missing image files: remember them and swap in the placeholder */
document.addEventListener('error', e => {
  const t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.dataset.fb) return;
  missingImgs.add(t.getAttribute('src'));
  if (t.dataset.alt2) { const next = t.dataset.alt2; t.dataset.alt2 = ''; t.src = next; return; }
  t.insertAdjacentHTML('afterend', fallbackHtml(t.dataset));
  t.remove();
}, true);
