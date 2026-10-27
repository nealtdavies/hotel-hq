'use strict';

/* ================= Hotel dashboard figures (no DOM access) =================
   Read-only summaries of the hotel's state: where every room stands, and what cash the confirmed stays and fixed costs will
   produce over the coming days. Nothing here changes the game. */

/* Every room falls in exactly one group, in this order of priority, so the groups always add up to the room count. */
function roomStatus() {
  const s = { total: S.rooms.length, damaged: 0, underWork: 0, occupied: 0, dirty: 0, ready: 0, arrivingToday: 0, upcoming: 0 };
  for (const r of S.rooms) {
    if (r.damaged) { s.damaged++; if (roomUnderWork(r)) s.underWork++; }
    else if (r.guestId) s.occupied++;
    else if (r.dirty) s.dirty++;
    else s.ready++;
  }
  for (const b of S.bookings) { if (b.arriveDay === S.day) s.arrivingToday++; else if (b.arriveDay > S.day) s.upcoming++; }
  return s;
}

/* Equipment that is broken or worn, worst first. */
function equipmentWatch() {
  return S.assets.filter(a => a.broken || a.cond < 60).sort((a, b) => (b.broken - a.broken) || (a.cond - b.cond));
}

/* What the next `days` days will bring from stays already confirmed (guests in the house and reservations), and from fixed costs.
   It leaves out what cannot be known: restaurant takings, extras, walk-in enquiries, no-shows and random events.
   Each day: { day, income, wages, running, costs, net }. The first day is today, as it will close tonight. */
function forecastCash(days) {
  const stays = [
    ...S.guests.map(g => ({ price: g.price, deposit: g.deposit || 0, start: 0, nights: g.left, plan: g.mealPlan || 'room', adults: g.adults || 1, children: g.children || 0 })),
    ...S.bookings.filter(b => b.arriveDay >= S.day).map(b => ({ price: b.price, deposit: b.deposit || 0, start: b.arriveDay - S.day, nights: b.nights, plan: b.mealPlan || 'room', adults: b.adults || 1, children: b.children || 0 }))
  ];
  const out = [];
  for (let k = 0; k < days; k++) {
    const day = S.day + k;
    let income = 0, stillHere = 0;
    for (const st of stays) {
      if (k < st.start || k >= st.start + st.nights) continue;
      const fromDeposit = Math.min(st.deposit, st.price);
      st.deposit -= fromDeposit;
      income += st.price - fromDeposit;
      if (st.plan !== 'room' && hasFacility('restaurant') && restaurantOpen(day)) income += mealPerNight(st.plan, st.adults, st.children);
      if (k < st.start + st.nights - 1) stillHere += st.price;   // running costs are charged after guests who check out tonight have gone
    }
    let wages = 0;
    for (const s of S.staff) { if (!worksOn(s, day)) continue; wages += k < s.sickDays ? Math.round(s.wage / 2) : s.wage; }
    const running = Math.round(tierInfo().overhead + RUNNING_PER_ROOM * S.rooms.length + RUNNING_GUEST_SHARE * stillHere);
    out.push({ day: S.day + k, income, wages, running, costs: wages + running, net: income - wages - running });
  }
  return out;
}
