'use strict';
/* ================= Wishes: what a guest asked for, and whether the hotel delivered it (no DOM access) =================
   A guest can ask for something specific when they book: a sea view, a ground floor room, vegetarian food (chosen on the phone or typed in
   the booking's requests), or a particular dish sent to the room. A wish that is met pleases the guest. A wish that is not met upsets them
   and raises a complaint for the Receptionist to put right. Room wishes are judged when the guest checks in; vegetarian food is judged in the
   evening, when the restaurant has served; a dish is judged when the order is dealt with, or at the end of the day if nobody did. */

const WISHES = {
  view:   { label: 'a sea view', short: 'Sea view', where: 'room', words: /\b(sea|ocean|view)\b/i, hint: 'an Ocean View room', ok: room => room.type === 'Ocean View',
    upset: 'I asked for a sea view, and my window looks onto the garden.' },
  ground: { label: 'a ground floor room', short: 'Ground floor', where: 'room', words: /\bground\b/i, hint: 'a room on the ground floor (1xx)', ok: room => { const f = floorOf(room); return f === null || f <= 1; },
    upset: 'I asked for the ground floor, and I have been given a room up the stairs.' },
  veg:    { label: 'vegetarian meals', short: 'Vegetarian meals', where: 'meal', words: /\b(vegetarian|veggie|vegan)\b/i, hint: 'a vegetarian main course on the restaurant menu',
    upset: 'I asked for vegetarian food, and there was nothing on the menu I could eat.' }
};
const WISH_HAPPY = 5, WISH_UPSET = 10, WISH_MEAL_UPSET = 8;

/* The storey of a room from its number: Room 101 is on floor 1, which is the ground floor. Null when the name has no number. */
function floorOf(room) {
  const n = parseInt(String(room.name).replace(/\D/g, ''), 10);
  return n >= 100 ? Math.floor(n / 100) : null;
}
/* The wish a piece of request text is about, or null. */
function wishFromText(text) { return Object.keys(WISHES).find(k => WISHES[k].words.test(String(text || ''))) || null; }
/* The distinct wishes held in a booking's requests. */
const wishKeysOf = requests => [...new Set((requests || []).map(q => q.wish).filter(k => WISHES[k]))];
/* Whether a room would meet a room wish. */
const roomMeetsWish = (key, room) => !!room && !!WISHES[key] && WISHES[key].where === 'room' && WISHES[key].ok(room);

/* Room wishes on a reservation that the room it is booked into would not meet: [{ key, label, hint }]. */
function bookingWishGaps(b) {
  const room = roomById(b.roomId);
  return wishKeysOf(b.requests).filter(k => WISHES[k].where === 'room' && room && !roomMeetsWish(k, room)).map(k => ({ key: k, label: WISHES[k].label, hint: WISHES[k].hint }));
}

function giveWishes(g, keys) { g.wishes = (keys || []).filter(k => WISHES[k]).map(key => ({ key, met: null })); }

/* A complaint about something the guest asked for. One at a time for each wish. Returns true when a new one was raised. */
function raiseComplaint(g, text, wish) {
  if (S.jobs.some(j => j.type === 'complaint' && j.guestId === g.id && j.wish === (wish || null))) return false;
  S.jobs.push({ id: nid(), type: 'complaint', guestId: g.id, role: 'Receptionist', text, discount: false, wish: wish || null });
  const room = roomById(g.roomId);
  S.news.push(`${g.name}${room ? ` in ${room.name}` : ''} has a complaint.`);
  return true;
}

/* Judges the room wishes of a guest who has just been given a room. Returns { met: [labels], missed: [labels] }. */
function judgeRoomWishes(g, room) {
  const out = { met: [], missed: [] };
  for (const w of g.wishes || []) {
    const def = WISHES[w.key];
    if (w.met !== null || !def || def.where !== 'room') continue;
    w.met = def.ok(room);
    if (w.met) { g.happiness = clamp(g.happiness + WISH_HAPPY, 0, 100); out.met.push(def.label); }
    else { g.happiness = clamp(g.happiness - WISH_UPSET, 0, 100); raiseComplaint(g, def.upset, w.key); out.missed.push(def.label); }
  }
  return out;
}

/* Evening, after the restaurant has served: guests who asked for vegetarian food are pleased or upset. Nothing is judged while the restaurant
   is closed, and a hotel with no restaurant cannot be asked to feed anyone, so those wishes are set aside. */
function judgeMealWishes(events) {
  const veg = adultMenu('Main').some(d => d.veg);
  for (const g of S.guests) {
    for (const w of g.wishes || []) {
      if (w.met !== null || w.key !== 'veg') continue;
      if (!hasFacility('restaurant')) { w.met = 'na'; continue; }
      if (!restaurantOpen()) continue;
      w.met = veg;
      if (veg) { g.happiness = clamp(g.happiness + WISH_HAPPY, 0, 100); events.push({ text: `${g.name} asked for vegetarian food and was well looked after.` }); }
      else { g.happiness = clamp(g.happiness - WISH_MEAL_UPSET, 0, 100); raiseComplaint(g, WISHES.veg.upset, 'veg'); events.push({ text: `${g.name} asked for vegetarian food but there was no vegetarian main course. They have complained.` }); }
    }
  }
}

/* Room service: can the dish still be made? It must be on the menu and switched on. */
const dishServable = id => S.menu.some(d => d.id === id && d.on);
