'use strict';

/* ================= What guests asked for: chips on guest cards and reservations ================= */

/* On a guest card: each thing they asked for, and whether they got it. */
function wishChips(g) {
  const list = (g.wishes || []).filter(w => WISHES[w.key] && w.met !== 'na');
  if (!list.length) return '';
  return `<div class="row" style="margin-top:6px">${list.map(w => {
    const label = WISHES[w.key].short;
    return w.met === true ? `<span class="chip good">Asked for: ${esc(label)}. Delivered</span>`
      : w.met === false ? `<span class="chip warn">Asked for: ${esc(label)}. Not delivered</span>`
      : `<span class="chip info">Asked for: ${esc(label)}</span>`;
  }).join('')}</div>`;
}

/* On a reservation: whether the room it is booked into gives what was asked for. */
function bookingWishChips(b) {
  const room = roomById(b.roomId), keys = wishKeysOf(b.requests);
  if (!keys.length) return '';
  return `<div class="row">${keys.map(k => {
    const def = WISHES[k];
    if (def.where === 'meal') return `<span class="chip info">${esc(def.short)}: needs ${esc(def.hint)}</span>`;
    return room && roomMeetsWish(k, room) ? `<span class="chip good">${esc(def.short)}: ${esc(room.name)} suits</span>` : `<span class="chip warn">${esc(def.short)}: needs ${esc(def.hint)}</span>`;
  }).join('')}</div>`;
}

/* The toast after a check-in, when the guest asked for something. */
function wishToast(r) {
  if (!r.wishes) return '';
  return r.wishes.missed.length ? ` They asked for ${r.wishes.missed.join(' and ')} and did not get it.` : '';
}
