'use strict';

/* ================= Seasons, festivals, weather and pricing (no DOM access) =================
   A year is 112 days: four seasons of 28 days, starting in spring. Seasons and festivals change how many people want to stay, weather
   decides how outdoor events go, and the price you charge changes how many people ask. Weather comes from a seed saved with the game, so it
   is the same every time it is looked at, and the forecast is a stable (and sometimes wrong) view of it. */

const SEASON_DAYS = 28, YEAR_DAYS = SEASON_DAYS * 4;
/* demand: how many people ask to stay, against a normal day. sun, rain, storm: chances for a day; the rest is cloudy.
   outdoor and indoor: how well outdoor and indoor events sell. temp: a typical temperature in degrees Celsius. */
const SEASONS = [
  { key: 'spring', name: 'Spring', demand: 1.0, sun: 0.35, rain: 0.25, storm: 0.02, outdoor: 1.0, indoor: 1.0, temp: 14 },
  { key: 'summer', name: 'Summer', demand: 1.25, sun: 0.6, rain: 0.12, storm: 0.03, outdoor: 1.2, indoor: 0.95, temp: 24 },
  { key: 'autumn', name: 'Autumn', demand: 0.95, sun: 0.2, rain: 0.35, storm: 0.06, outdoor: 0.9, indoor: 1.05, temp: 12 },
  { key: 'winter', name: 'Winter', demand: 0.75, sun: 0.15, rain: 0.3, storm: 0.07, outdoor: 0.6, indoor: 1.1, temp: 4 }
];
const FESTIVALS = [   // start: day of the year (0 to 111)
  { key: 'flowers', name: 'Spring Flower Festival', start: 10, days: 3, demand: 1.4 },
  { key: 'carnival', name: 'Summer Carnival', start: 38, days: 4, demand: 1.6 },
  { key: 'harvest', name: 'Harvest Fair', start: 66, days: 3, demand: 1.3 },
  { key: 'lights', name: 'Winter Lights', start: 96, days: 5, demand: 1.5 }
];
const WEATHER_KINDS = ['sunny', 'cloudy', 'rain', 'storm'];
const WEATHER_WORD = { sunny: 'Sunny', cloudy: 'Cloudy', rain: 'Rain', storm: 'Storm' };
const OUTDOOR_WEATHER = { sunny: 1.15, cloudy: 1, rain: 0.75, storm: 0.5 };   // how outdoor events sell on a day with that forecast

const dayOfYear = day => ((day % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
const seasonOf = day => SEASONS[Math.floor(dayOfYear(day) / SEASON_DAYS)];
const dayInSeason = day => dayOfYear(day) % SEASON_DAYS;
const festivalOn = day => FESTIVALS.find(f => dayOfYear(day) >= f.start && dayOfYear(day) < f.start + f.days) || null;
/* The next festival that starts after today, with how many days away it is. */
function nextFestival(from) {
  const d = dayOfYear(from);
  const list = FESTIVALS.map(f => ({ f, in: ((f.start - d) + YEAR_DAYS) % YEAR_DAYS })).filter(x => x.in > 0).sort((a, b) => a.in - b.in);
  return list[0] ? { festival: list[0].f, in: list[0].in, day: from + list[0].in } : null;
}
const demandFactor = day => seasonOf(day).demand * (festivalOn(day) ? festivalOn(day).demand : 1);

/* ---------- Weather ---------- */
/* A repeatable number from 0 up to (not including) 1 for a seed, a day and a purpose. */
function rand01(seed, day, salt) {
  let h = (seed ^ Math.imul(day + 1, 0x9E3779B1) ^ Math.imul(salt + 7, 0x85EBCA6B)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function weatherOn(day) {
  const set = S.weatherSet && S.weatherSet[day];
  const s = seasonOf(day), r = rand01(S.seed, day, 1);
  const kind = set || (r < s.storm ? 'storm' : r < s.storm + s.rain ? 'rain' : r < s.storm + s.rain + s.sun ? 'sunny' : 'cloudy');
  const temp = Math.round(s.temp + (rand01(S.seed, day, 2) - 0.5) * 8 + ({ sunny: 2, cloudy: 0, rain: -1, storm: -2 })[kind]);
  return { kind, temp };
}
/* What the forecast says. Today and past days are known. The further ahead, the more often it is wrong (and it can change as the day nears). */
function forecastOn(day) {
  const actual = weatherOn(day);
  if (day <= S.day || (S.weatherSet && S.weatherSet[day])) return actual;
  const h = day - S.day, accuracy = h <= 1 ? 0.95 : h <= 3 ? 0.85 : 0.7;
  if (rand01(S.seed, day, 3) <= accuracy) return actual;
  const others = WEATHER_KINDS.filter(k => k !== actual.kind);
  return { kind: others[Math.floor(rand01(S.seed, day, 4) * others.length)], temp: actual.temp };
}

/* ---------- Price and demand ---------- */
const averagePrice = type => { const rooms = S.rooms.filter(r => r.type === type); return rooms.length ? rooms.reduce((a, r) => a + r.price, 0) / rooms.length : ROOM_TYPES[type].price; };
/* How many people ask for a room type at its current price, against its usual price: 1 at the usual price, more when cheaper, fewer when dearer. */
const priceDemandFor = type => clamp(Math.pow(ROOM_TYPES[type].price / averagePrice(type), 1.5), 0.5, 1.5);
/* Overall, weighting each type by how many rooms of it there are. */
function priceDemand() {
  if (!S.rooms.length) return 1;
  return S.rooms.reduce((a, r) => a + priceDemandFor(r.type), 0) / S.rooms.length;
}

/* ---------- Pricing advice ---------- */
/* Share of a room type that is taken (guests staying or booked) on each of the next three days. */
function occupancyAhead(type, days) {
  const rooms = S.rooms.filter(r => r.type === type);
  if (!rooms.length) return 0;
  let taken = 0;
  for (let k = 0; k < days; k++) taken += rooms.filter(r => roomDayState(r, S.day + k).state === 'guest' || roomDayState(r, S.day + k).state === 'booked').length;
  return taken / (rooms.length * days);
}
const clampRoomPrice = (type, p) => clamp(Math.round(p), Math.ceil(ROOM_TYPES[type].price * 0.8), Math.floor(ROOM_TYPES[type].price * 1.25));
/* Suggestions per room type: raise when nearly full or a festival is near, cut when quiet. Prices stay within what guests think is fair
   (80% to 125% of the usual rate), so a suggestion never makes guests unhappy. */
function priceAdvice() {
  const out = [], next = nextFestival(S.day);
  for (const type of [...new Set(S.rooms.map(r => r.type))]) {
    const cur = Math.round(averagePrice(type)), occ = occupancyAhead(type, 3);
    const festivalSoon = (festivalOn(S.day) || (next && next.in <= 4)) ? (festivalOn(S.day) || next.festival) : null;
    let target = null, kind = null, reason = '';
    if (festivalSoon && cur < ROOM_TYPES[type].price * 1.15) { target = clampRoomPrice(type, ROOM_TYPES[type].price * 1.2); kind = 'festival'; reason = `${festivalSoon.name} brings extra visitors.`; }
    else if (occ >= 0.85) { target = clampRoomPrice(type, cur * 1.12); kind = 'raise'; reason = 'Nearly full for the next three days.'; }
    else if (occ <= 0.3 && demandFactor(S.day + 2) < 1.1) { target = clampRoomPrice(type, cur * 0.9); kind = 'cut'; reason = 'Quiet for the next three days.'; }
    if (target !== null && Math.abs(target - cur) >= 3) out.push({ type, kind, current: cur, target, reason, occupancy: occ });
  }
  return out;
}
function applyPrice(type, price) {
  if (!ROOM_TYPES[type] || !S.rooms.some(r => r.type === type)) return { ok: false, error: 'You have no rooms of that type.' };
  price = Math.round(Number(price));
  if (!(price >= 30 && price <= 500)) return { ok: false, error: 'A room price is between £30 and £500.' };
  const rooms = S.rooms.filter(r => r.type === type);
  rooms.forEach(r => { r.price = price; });
  return { ok: true, count: rooms.length };
}
