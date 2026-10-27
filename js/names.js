'use strict';

/* ================= People and parties (no DOM access) =================
   Every generated person comes from FIRST_NAMES (gender-labelled) and SURNAMES in names-data.js.
   A full name is never used twice in one save (S.namesUsed remembers them all), and never matches anyone typed in by hand who is
   present right now. Parties follow real surname logic: families, married couples and siblings share a surname, while unmarried
   couples, friends and colleagues do not. */

const UNISEX_SHARE = 0.06;          // how often a unisex first name is chosen for a man or a woman
const SAME_GENDER_COUPLE = 0.12;    // share of couples made of two men or two women
const NAME_POOLS = (() => { const p = { m: [], f: [], u: [] }; FIRST_NAMES.forEach((n, i) => p[n[1]].push(i)); return p; })();
const SURNAME_INDEX = new Map(SURNAMES.map((s, i) => [s.toLowerCase(), i]));
const FIRST_INDEX = new Map(FIRST_NAMES.map((n, i) => [n[0].toLowerCase(), i]));
const REL_LABELS = { solo: 'Travelling alone', 'single parent': 'Single parent with children', family: 'Family', married: 'Married couple',
  unmarried: 'Couple (not married)', friends: 'Friends', colleagues: 'Colleagues', siblings: 'Siblings' };

/* ---------- Names already used ---------- */
let _usedArr = null, _usedSet = null;
function usedKeys() {
  if (_usedArr !== S.namesUsed || _usedSet.size !== S.namesUsed.length) { _usedArr = S.namesUsed; _usedSet = new Set(S.namesUsed); }
  return _usedSet;
}
const nameKey = (fi, si) => fi * SURNAMES.length + si;
function claimKey(key) { const set = usedKeys(); if (!set.has(key)) { set.add(key); S.namesUsed.push(key); } }
/* A name typed by hand is not drawn from the lists, but if it happens to be a list name, keep random draws from repeating it. */
function claimTyped(first, last) {
  const fi = FIRST_INDEX.get(String(first).toLowerCase()), si = SURNAME_INDEX.get(String(last).toLowerCase());
  if (fi !== undefined && si !== undefined) claimKey(nameKey(fi, si));
}
function presentNames() {
  const s = new Set(), add = n => { if (n) s.add(String(n).toLowerCase()); };
  const party = p => { if (p) p.members.forEach(m => add(m.n)); };
  S.guests.forEach(g => { add(g.name); party(g.party); });
  S.bookings.forEach(b => { add(b.name); party(b.party); });
  S.enquiries.forEach(e => { add(e.name); party(e.party); });
  S.staff.forEach(x => add(x.name));
  S.candidates.forEach(x => add(x.name));
  S.works.forEach(w => add(w.engineer));
  return s;
}
function surnamesInUse() {
  const s = new Set(), add = n => { const t = String(n || '').trim().split(/\s+/); if (t.length > 1) s.add(t[t.length - 1].toLowerCase()); };
  S.guests.forEach(g => add(g.name)); S.bookings.forEach(b => add(b.name)); S.enquiries.forEach(e => add(e.name)); S.staff.forEach(x => add(x.name));
  return s;
}

/* ---------- Drawing people ---------- */
const randomGender = () => (chance(0.5) ? 'f' : 'm');
function drawFirstIndex(gender) { return pick(chance(UNISEX_SHARE) ? NAME_POOLS.u : NAME_POOLS[gender === 'f' ? 'f' : 'm']); }
/* A new unique person. gender: 'm' or 'f' (random if omitted). last: a fixed surname (for family members), otherwise one is drawn
   that nobody present is already using where possible; avoid: surnames (lower case) this person must not get, such as the rest of
   their party when they are not related. */
function drawPerson(gender, last, avoid) {
  const g = gender === 'm' || gender === 'f' ? gender : randomGender();
  const used = usedKeys(), present = presentNames(), busy = last ? null : surnamesInUse();
  const fixedSi = last ? SURNAME_INDEX.get(String(last).toLowerCase()) : undefined;
  for (let tries = 0; tries < 600; tries++) {
    const fi = drawFirstIndex(g);
    const si = last ? fixedSi : rnd(SURNAMES.length);
    const surname = last ? last : SURNAMES[si];
    if (avoid && !last && avoid.has(surname.toLowerCase())) continue;
    if (busy && tries < 120 && busy.has(surname.toLowerCase())) continue;
    const full = `${FIRST_NAMES[fi][0]} ${surname}`;
    if (present.has(full.toLowerCase())) continue;
    if (si !== undefined && used.has(nameKey(fi, si))) continue;
    if (si !== undefined) claimKey(nameKey(fi, si));
    return { first: FIRST_NAMES[fi][0], last: surname, name: full, gender: g };
  }
  // Practically unreachable: walk the whole list for any unused combination.
  for (let fi = 0; fi < FIRST_NAMES.length; fi++) for (let si = 0; si < SURNAMES.length; si++) {
    if (!used.has(nameKey(fi, si))) { claimKey(nameKey(fi, si)); return { first: FIRST_NAMES[fi][0], last: SURNAMES[si], name: `${FIRST_NAMES[fi][0]} ${SURNAMES[si]}`, gender: g }; }
  }
  return { first: 'Guest', last: String(S.nextId++), name: `Guest ${S.nextId}`, gender: g };
}
const newPerson = gender => { const p = drawPerson(gender); return { gender: p.gender, name: p.name }; };

/* ---------- Typed names ---------- */
function parseTypedName(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (!t.length) return { first: '', last: '', name: '' };
  const last = t.length > 1 ? t[t.length - 1] : '';
  const first = t.length > 1 ? t.slice(0, -1).join(' ') : t[0];
  return { first, last, name: t.join(' ') };
}
function genderOfFirst(first) {
  const i = FIRST_INDEX.get(String(first).split(' ')[0].toLowerCase());
  const g = i === undefined ? 'u' : FIRST_NAMES[i][1];
  return g === 'u' ? randomGender() : g;
}

/* ---------- Parties ---------- */
function pickRelation(adults, children) {
  const x = Math.random();
  if (adults <= 1) return children ? 'single parent' : 'solo';
  if (children) return 'family';
  if (adults === 2) return x < 0.55 ? 'married' : x < 0.9 ? 'unmarried' : 'friends';
  return x < 0.7 ? 'friends' : 'colleagues';
}
/* How many adults and children a booking for this room type sensibly has. */
function enquiryComposition(type) {
  const cap = ROOM_TYPES[type].cap, x = Math.random();
  if (cap >= 5) return x < 0.7 ? { adults: 2, children: rndRange(1, 3) } : x < 0.85 ? { adults: 1, children: rndRange(1, 3) } : x < 0.95 ? { adults: rndRange(3, 4), children: 0 } : { adults: 2, children: 0 };
  if (cap >= 4) return x < 0.6 ? { adults: 2, children: 0 } : x < 0.8 ? { adults: 2, children: rndRange(1, 2) } : x < 0.9 ? { adults: rndRange(3, 4), children: 0 } : { adults: 1, children: 0 };
  return x < 0.2 ? { adults: 1, children: 0 } : x < 0.9 ? { adults: 2, children: 0 } : { adults: 1, children: 1 };
}
/* spec: { adults, children, rel ('auto' picks one), lead ({first,last} typed by hand, or none to draw), others (typed full names, optional) }.
   Returns { rel, members: [{ n, first, last, kid }], adults, children } with the lead booker first. */
function newParty(spec) {
  const adults = Math.max(1, Math.round(spec.adults) || 1), children = Math.max(0, Math.round(spec.children) || 0);
  let rel = spec.rel && spec.rel !== 'auto' ? spec.rel : pickRelation(adults, children);
  if (rel === 'solo' && adults + children > 1) rel = pickRelation(adults, children);
  const sharesSurname = i => rel === 'family' || rel === 'single parent' || rel === 'siblings' || (rel === 'married' && i < 2);
  const others = (spec.others || []).slice();
  const members = [];
  let lead;
  const taken = new Set();       // surnames in the party, so people who are not related never share one
  if (spec.lead && spec.lead.first) {
    lead = { first: spec.lead.first, last: spec.lead.last || '', gender: spec.lead.gender || genderOfFirst(spec.lead.first) };
    if (!lead.last) lead.last = drawPerson(lead.gender).last;
    else claimTyped(lead.first, lead.last);
    lead.name = `${lead.first} ${lead.last}`.trim();
  } else lead = drawPerson(randomGender());
  members.push({ n: lead.name, first: lead.first, last: lead.last, kid: false, gender: lead.gender });
  taken.add(lead.last.toLowerCase());
  const coupleLike = rel === 'married' || rel === 'unmarried' || rel === 'family';
  for (let i = 1; i < adults + children; i++) {
    const kid = i >= adults, typed = others.shift();
    let m;
    const shared = kid || sharesSurname(i);
    if (typed) {
      const t = parseTypedName(typed);
      const last = t.last || (shared ? lead.last : drawPerson(randomGender(), undefined, taken).last);
      claimTyped(t.first, last);
      m = { n: `${t.first} ${last}`.trim(), first: t.first, last, kid, gender: genderOfFirst(t.first) };
    } else {
      let g = randomGender();
      if (i === 1 && !kid && coupleLike && adults >= 2) g = chance(SAME_GENDER_COUPLE) ? lead.gender : (lead.gender === 'f' ? 'm' : 'f');
      const p = drawPerson(g, shared ? lead.last : undefined, taken);
      m = { n: p.name, first: p.first, last: p.last, kid, gender: g };
    }
    taken.add(m.last.toLowerCase());
    members.push(m);
  }
  return { rel, members, adults, children };
}
/* Everyone except the lead, written the way a receptionist would: first names for family, full names otherwise. */
function partyLine(party) {
  if (!party || party.members.length < 2) return '';
  const lead = party.members[0];
  return 'with ' + party.members.slice(1).map(m => `${m.last === lead.last ? m.first : m.n}${m.kid ? ' (child)' : ''}`).join(', ');
}
const soloParty = name => { const t = parseTypedName(name); return { rel: 'solo', members: [{ n: t.name, first: t.first, last: t.last, kid: false, gender: genderOfFirst(t.first) }], adults: 1, children: 0 }; };

/* Changes the size of an existing party, keeping the people already in it. Adults come first, then children. People who are added follow
   the same surname rules as newParty. If the relationship no longer fits the numbers (a "couple" of one), a new one is chosen. */
function resizeParty(party, adults, children) {
  const lead = party.members[0];
  const keepAdults = party.members.filter(m => !m.kid).slice(0, adults), keepKids = party.members.filter(m => m.kid).slice(0, children);
  const fits = party.rel === 'solo' ? adults === 1 && !children : party.rel === 'single parent' ? adults === 1 && children > 0
    : ['married', 'unmarried'].includes(party.rel) ? adults === 2 && !children : party.rel === 'family' ? adults >= 2 && children > 0
    : adults >= 2 && !children;
  const rel = fits ? party.rel : pickRelation(adults, children);
  const shares = i => rel === 'family' || rel === 'single parent' || rel === 'siblings' || (rel === 'married' && i < 2);
  const taken = new Set(party.members.map(m => m.last.toLowerCase()));
  const members = keepAdults.slice();
  for (let i = members.length; i < adults; i++) {
    const g = randomGender(), p = drawPerson(g, shares(i) ? lead.last : undefined, taken);
    members.push({ n: p.name, first: p.first, last: p.last, kid: false, gender: g }); taken.add(p.last.toLowerCase());
  }
  members.push(...keepKids);
  for (let i = keepKids.length; i < children; i++) { const g = randomGender(), p = drawPerson(g, lead.last); members.push({ n: p.name, first: p.first, last: p.last, kid: true, gender: g }); }
  return { rel, members, adults, children };
}
