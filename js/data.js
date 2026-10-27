'use strict';

/* ================= Constants & reference data ================= */
const SAVE_KEY = 'hotelhq.save.v3';
const LEGACY_SAVE_KEY = 'hotelhq.save.v2';
const SAVE_VERSION = 3;
const CURRENCY = '£';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ROTA_DAYS = 14;           // the rota repeats every fortnight: a pattern for day number mod 14
const DAY_START = 360, DAY_END = 1380;   // the in-day clock runs 06:00 to 23:00, in minutes after midnight
const SHIFTS = { early: { name: 'Early', start: 420, end: 900 }, day: { name: 'Day', start: 540, end: 1020 }, late: { name: 'Late', start: 900, end: 1380 } };
const ROLE_SHIFT = { 'Manager': 'day', 'Receptionist': 'early', 'Housekeeper': 'day', 'Chef': 'late', 'Spa Therapist': 'day', 'Maintenance': 'day',
  'Kids Club Leader': 'day', 'Arcade Attendant': 'late', 'Shop Assistant': 'day', 'Excursions Guide': 'early' };
const JOB_MINUTES = { clean: 45, repair: 90, complaint: 30, request: 25, service: 60, incident: 60 };   // how long each kind of job keeps someone busy
const STAFF_CAP = 3;             // jobs one staff member can do per day
const START_MONEY = 15000;
const BANKRUPT_AT = -5000;
const LIFELINE_MAX = 2, LIFELINE_CASH = 4000;   // before game over the bank steps in this many times, leaving the balance at this much
const ADVERT_COST = 100;
const DISCOUNT_COST = 20;
const RUNNING_PER_ROOM = 16;     // per room per day: utilities, laundry contracts, insurance
const RUNNING_GUEST_SHARE = 0.25;  // share of each night's room income spent on food, laundry and supplies
const INCIDENT_COOLDOWN = 8;     // days before the same scenario can recur
const MAX_PENDING_INCIDENTS = 4;   // grows with hotel size

const ROLES = {
  'Manager':       { base: 90 },
  'Receptionist':  { base: 60 },
  'Housekeeper':   { base: 50 },
  'Chef':          { base: 70 },
  'Spa Therapist': { base: 65 },
  'Maintenance':   { base: 55 },
  'Kids Club Leader': { base: 58 },
  'Arcade Attendant': { base: 52 },
  'Shop Assistant':   { base: 50 },
  'Excursions Guide': { base: 62 }
};
/* The entertainment team. Each role opens with its extra (see FEATURES). The first person hired in each role has their own headshot
   (assets/staff/<portrait>.jpg); later ones use the ordinary headshot pool. `look` is used for the picture prompts in IMAGE-GUIDE.md. */
const ENTERTAINERS = {
  'Kids Club Leader': { feature: 'kidsclub', portrait: 'f13', look: 'A cheerful woman in her late twenties with a bright smile, wearing a colourful polo shirt and a lanyard, a few craft-paint smudges on her sleeve.' },
  'Arcade Attendant': { feature: 'arcade', portrait: 'm13', look: 'A friendly young man with a wide grin, wearing a bold retro-print shirt and a name badge, soft neon glow reflected in the background.' },
  'Shop Assistant': { feature: 'shop', portrait: 'f14', look: 'A warm woman in her thirties in a neat boutique apron over a smart blouse, welcoming expression.' },
  'Excursions Guide': { feature: 'excursions', portrait: 'm14', look: 'A sun-tanned man in his thirties in a light outdoor shirt and a cap, relaxed and adventurous, blurred coastline behind him.' }
};

const ROOM_TYPES = {
  'Standard':   { price: 90,  cap: 2, variants: 4, blurb: 'King room with garden view' },
  'Ocean View': { price: 125, cap: 2, variants: 4, blurb: 'King room with sea view' },
  'Family':     { price: 135, cap: 5, variants: 4, blurb: 'Spacious room with sofa bed' },
  'Luxury Suite': { price: 240, cap: 4, variants: 4, blurb: 'Luxury suite with lounge and terrace' }
};


/* ================= Progression =================
   The hotel doubles in room count with every level (24, 48, 96, 192 rooms). Hitting a level's goals pays an investor grant and unlocks the next level's
   room types, facilities, and room / staff limits. All goals of a level must be met at the same time. */
const TIERS = [
  { id: 1, name: 'Boutique Hotel', stars: 3, rooms: 24, staff: 20, overhead: 150, types: ['Standard', 'Ocean View'] },
  { id: 2, name: 'Small Hotel', stars: 3.5, rooms: 48, staff: 40, overhead: 300, types: ['Standard', 'Ocean View', 'Family'], grant: 30000,
    goal: { day: 14, rating: 4.0, reviews: 10, profit: 120 } },
  { id: 3, name: 'Mid-Size Hotel', stars: 4, rooms: 96, staff: 80, overhead: 500, types: ['Standard', 'Ocean View', 'Family', 'Luxury Suite'], grant: 60000,
    goal: { rooms: 38, day: 40, rating: 4.2, reviews: 15, profit: 450 } },
  { id: 4, name: 'Grand Resort', stars: 5, rooms: 192, staff: 160, overhead: 900, types: ['Standard', 'Ocean View', 'Family', 'Luxury Suite'], grant: 120000,
    goal: { rooms: 77, day: 80, rating: 4.4, reviews: 15, profit: 1200 } }
];
const START_ASSETS = ['boiler', 'wifi', 'plumbing', 'electrics', 'laundry', 'roof'];
const ROOM_BUILD_COST = { 'Standard': 800, 'Ocean View': 1200, 'Family': 1500, 'Luxury Suite': 2500 };
/* Facilities bought with cash once their level is reached. */
const FACILITY_UPGRADES = {
  restaurant: { name: 'Restaurant', tier: 2, cost: 8000, assets: ['kitchen'], desc: 'Hire a Chef and take room-service orders (£25 each). Adds kitchen equipment to maintain.' },
  hvac:       { name: 'Heating and air-con', tier: 2, cost: 6000, assets: ['hvac'], desc: 'Guests check in 3 points happier. Adds climate equipment to maintain.' },
  pool:       { name: 'Swimming pool', tier: 3, cost: 15000, assets: ['pool'], desc: 'Guests check in 3 points happier. Adds a pool to maintain.' },
  spa:        { name: 'Spa', tier: 3, cost: 12000, assets: [], desc: 'Hire a Spa Therapist and take spa bookings (£45 each).' },
  lift:       { name: 'Lift', tier: 3, cost: 10000, assets: ['lift'], desc: 'Required before you can build Luxury Suites. Adds a lift to maintain.' }
};


/* ================= Reservations and restaurant ================= */
const MAX_ADVANCE_DAYS = 60;
const NO_SHOW_CHANCE = 0.04;
/* Meal plans: price per adult per night (children pay half). Needs the restaurant to be open. */
const MEAL_PLANS = {
  room:      { name: 'Room only', adult: 0 },
  breakfast: { name: 'Bed and breakfast', adult: 14 },
  half:      { name: 'Half board (breakfast and dinner)', adult: 32 },
  full:      { name: 'Full board (all meals)', adult: 46 }
};
/* One-off extras on a booking. The guest pays when staff complete the job (same as other requests). */
const EXTRAS = {
  transfer:  { name: 'Airport transfer', price: 45, role: 'Receptionist' },
  champagne: { name: 'Sparkling welcome drink', price: 40, cost: 15, role: 'Housekeeper' },
  flowers:   { name: 'Flowers in the room', price: 25, cost: 8, role: 'Housekeeper' },
  latecheck: { name: 'Late checkout', price: 30, role: 'Receptionist' },
  extrabed:  { name: 'Extra bed (sleeps one more)', price: 25, perNight: true, role: 'Housekeeper', beds: 1 },
  cot:       { name: 'Baby cot', price: 0, role: 'Housekeeper' },
  pet:       { name: 'Dog stays too', price: 35, role: 'Housekeeper' },
  spa:       { name: 'Spa package', price: 90, role: 'Spa Therapist', facility: 'spa' },
  dinner:    { name: 'Romantic dinner', price: 120, cost: 40, role: 'Chef', facility: 'restaurant', asset: 'kitchen' }
};
const DEPOSITS = [[0, 'No deposit'], [0.2, '20% deposit'], [0.5, '50% deposit'], [1, 'Pay in full now']];
/* Restaurant menu. quality 1-5: better food costs more to make and pleases guests more. */
const DISH_CATS = ['Starter', 'Main', 'Dessert', 'Drink'];
const DISH_BASE = { Starter: 8, Main: 17, Dessert: 8, Drink: 4 };   // a fair price for a dish of average quality
const MAX_DISHES = 40;

/* ---------- Events ---------- */
/* kind: 'public' events sell tickets to guests and locals; 'private' ones are contracts a client asks for (weddings, parties).
   ref: the fair ticket (or per-head) price. cost: what each attendee costs you. fixed: hire, staging and entertainment.
   extra: what each attendee spends on the night on top of the ticket. demand: tickets sold a day at the fair price with no advertising.
   needs: the facility and the role on the rota that day. venue: only one event can use a venue on a day. */
const EVENT_TYPES = {
  excursion: { name: 'Excursion', kind: 'public', venue: 'Off-site', tier: 1, needs: { role: 'Receptionist' }, cap: [8, 40, 20], ref: 45, min: 15, max: 150, cost: 26, fixed: 120, extra: 0, demand: 3, outdoor: true,
    blurb: 'A boat trip, coastal walk or town tour with a guide and a packed lunch.' },
  karaoke:   { name: 'Karaoke evening', kind: 'public', venue: 'Lounge', tier: 1, needs: { role: 'Receptionist' }, cap: [20, 80, 40], ref: 10, min: 0, max: 40, cost: 4, fixed: 180, extra: 10, demand: 4, outdoor: false,
    blurb: 'A host, a sound system and a bar. Cheap entry, and the drinks do the earning.' },
  buffet:    { name: 'Buffet evening', kind: 'public', venue: 'Restaurant', tier: 2, needs: { facility: 'restaurant', role: 'Chef' }, cap: [20, 80, 40], ref: 22, min: 8, max: 80, cost: 9, fixed: 150, extra: 5, demand: 5, outdoor: false,
    blurb: 'A generous spread in the restaurant. The restaurant is closed to normal diners that evening.' },
  theme:     { name: 'Theme night', kind: 'public', venue: 'Restaurant', tier: 2, needs: { facility: 'restaurant', role: 'Chef' }, cap: [20, 60, 36], ref: 32, min: 10, max: 120, cost: 13, fixed: 250, extra: 8, demand: 4, outdoor: false,
    blurb: 'A themed menu with decor and music. Pick a theme guests will love.' },
  bbq:       { name: 'Beach barbecue', kind: 'public', venue: 'Beach', tier: 2, needs: { facility: 'restaurant', role: 'Chef' }, cap: [20, 80, 40], ref: 28, min: 10, max: 100, cost: 11, fixed: 300, extra: 6, demand: 5, outdoor: true,
    blurb: 'Grills, fire pits and the sea at your feet. A rainy evening spoils it.' },
  party:     { name: 'Private party', kind: 'private', venue: 'Ballroom', tier: 2, needs: { facility: 'restaurant', role: 'Chef' }, cap: [15, 50, 30], ref: 42, min: 20, max: 90, cost: 17, fixed: 350, extra: 0, demand: 0, outdoor: false,
    blurb: 'A client books the function room for a birthday or anniversary and pays per head.' },
  wedding:   { name: 'Wedding', kind: 'private', venue: 'Grounds', tier: 3, needs: { facility: 'restaurant', role: 'Chef' }, cap: [40, 120, 80], ref: 90, min: 40, max: 200, cost: 38, fixed: 1500, extra: 0, demand: 0, outdoor: true,
    blurb: 'The big day. A client books your grounds and pays per guest, with a deposit up front.' }
};
const EVENT_THEMES = { italian: { name: 'Italian feast', pop: 1.1, cost: 0 }, caribbean: { name: 'Caribbean carnival', pop: 1.25, cost: 2 }, seafood: { name: 'Seafood night', pop: 1.0, cost: 1 },
  mystery: { name: 'Detective mystery dinner', pop: 1.3, cost: 3 }, games: { name: 'Games night', pop: 1.15, cost: 2 } };
const EVENT_ADVERTS = [{ name: 'No advertising', cost: 0, boost: 1 }, { name: 'Posters and flyers', cost: 60, boost: 1.2 }, { name: 'Social media campaign', cost: 180, boost: 1.5 }, { name: 'Local radio and press', cost: 450, boost: 2 }];
const EVENT_ADVANCE_DAYS = 45, EVENT_NO_SHOW = 0.07, PRIVATE_DEPOSIT = 0.3, MAX_EVENTS = 20;
const EVENT_REVIEW = { 1: ['The event was a disaster.', 'Badly run and not worth the money.'], 2: ['Disappointing for the price.', 'Not what we were promised.'], 3: ['A decent evening, nothing special.', 'Fine, but it could have been better.'],
  4: ['A really enjoyable event.', 'Great atmosphere and friendly staff.'], 5: ['Unforgettable. Worth every penny.', 'The best event we have ever been to.'] };
const DEFAULT_MENU = [
  { key: 'tomato-soup',  name: 'Roast tomato soup', desc: 'With basil oil and warm bread.', cat: 'Starter', price: 7, quality: 3, veg: true, nuts: false },
  { key: 'prawn-cocktail', name: 'Prawn cocktail', desc: 'Tiger prawns, avocado and marie rose.', cat: 'Starter', price: 10, quality: 3, veg: false, nuts: false },
  { key: 'club-sandwich', name: 'Club sandwich', desc: 'Chicken, bacon, egg and fries.', cat: 'Main', price: 14, quality: 3, veg: false, nuts: false },
  { key: 'sea-bass', name: 'Grilled sea bass', desc: 'Lemon butter, samphire and new potatoes.', cat: 'Main', price: 24, quality: 4, veg: false, nuts: false },
  { key: 'burger', name: 'Beef burger', desc: 'Brioche bun, cheddar and house sauce.', cat: 'Main', price: 16, quality: 3, veg: false, nuts: false },
  { key: 'risotto', name: 'Wild mushroom risotto', desc: 'Parmesan and truffle oil.', cat: 'Main', price: 17, quality: 4, veg: true, nuts: false },
  { key: 'brownie', name: 'Chocolate brownie', desc: 'Warm, with vanilla ice cream and pecans.', cat: 'Dessert', price: 8, quality: 3, veg: true, nuts: true },
  { key: 'fruit-salad', name: 'Tropical fruit salad', desc: 'Mango, pineapple and passion fruit.', cat: 'Dessert', price: 7, quality: 3, veg: true, nuts: false },
  { key: 'lemonade', name: 'Fresh lemonade', desc: 'Squeezed to order.', cat: 'Drink', price: 4, quality: 3, veg: true, nuts: false },
  { key: 'coffee', name: 'Coffee', desc: 'Espresso, latte or cappuccino.', cat: 'Drink', price: 3, quality: 3, veg: true, nuts: false }
];
/* The children's set. Players add it from the menu screen. Children order from these dishes (and adults do not), and a child's fair price is lower. */
const KIDS_MENU = [
  { key: 'spag-bol', name: 'Spaghetti bolognese', desc: 'A child-sized bowl with a little cheese on top.', cat: 'Main', price: 8, quality: 3, veg: false, nuts: false },
  { key: 'chicken-nuggets', name: 'Chicken nuggets and fries', desc: 'Golden nuggets, crinkle-cut fries and ketchup.', cat: 'Main', price: 8, quality: 3, veg: false, nuts: false },
  { key: 'pizza', name: 'Mini margherita pizza', desc: 'Tomato, melted cheese and basil.', cat: 'Main', price: 9, quality: 3, veg: true, nuts: false },
  { key: 'mac-cheese', name: 'Macaroni cheese', desc: 'Creamy, with a golden baked top.', cat: 'Main', price: 7, quality: 3, veg: true, nuts: false },
  { key: 'ice-cream', name: 'Ice cream selection', desc: 'Strawberry, vanilla and chocolate with sprinkles.', cat: 'Dessert', price: 4, quality: 3, veg: true, nuts: false },
  { key: 'doughnuts', name: 'Doughnuts', desc: 'Pink iced, chocolate and sugar-dusted.', cat: 'Dessert', price: 4, quality: 3, veg: true, nuts: false },
  { key: 'cola', name: 'Cola', desc: 'Cold and fizzy, with ice and a slice of lemon.', cat: 'Drink', price: 3, quality: 3, veg: true, nuts: false },
  { key: 'orange-fizz', name: 'Orange fizz', desc: 'Bright, bubbly and orange.', cat: 'Drink', price: 3, quality: 3, veg: true, nuts: false },
  { key: 'milkshake', name: 'Strawberry milkshake', desc: 'With whipped cream and a cherry.', cat: 'Drink', price: 4, quality: 3, veg: true, nuts: false },
  { key: 'apple-juice', name: 'Apple juice', desc: 'Cloudy and cold.', cat: 'Drink', price: 2, quality: 3, veg: true, nuts: false }
];
const KIDS_FAIR = 0.55;   // a children's dish is fairly priced at this share of the grown-up price for its course
const menuImagePath = d => d.img || null;

/* ================= Contractors =================
   Firms differ in price, speed, track record and guarantee. `rating` is how good they really are; `advertised` is what
   their brochure claims (it can be a lie). Each job rolls an outcome from OUTCOME_ODDS using the real rating. */
const FIRMS = [
  { key: 'rapid',    name: 'Rapid Response 24/7',     blurb: 'Emergency call-outs at any hour. Fast and pricey.',  price: 1.9,  callout: 120, speed: 0,   late: 0.05, rating: 4, advertised: 4, warranty: 14, trades: [], lift: true },
  { key: 'coastal',  name: 'Coastal Building and Maintenance', blurb: 'Reliable local builders and plumbers.',      price: 1.35, callout: 60,  speed: 0.9, late: 0.15, rating: 4, advertised: 4, warranty: 30, trades: ['building', 'plumbing'] },
  { key: 'sparks',   name: 'Sparks and Spanners',     blurb: 'Electricians and general repairs. Good value.',      price: 1.1,  callout: 40,  speed: 1.2, late: 0.25, rating: 3, advertised: 4, warranty: 7,  trades: ['electrical', 'appliance'] },
  { key: 'aqua',     name: 'AquaPro Pools and Plumbing', blurb: 'Water specialists.',                              price: 1.3,  callout: 50,  speed: 1.0, late: 0.15, rating: 4, advertised: 4, warranty: 21, trades: ['pool', 'plumbing'] },
  { key: 'heat',     name: 'Heat and Air Engineers',  blurb: 'Boilers, heating, air-con and commercial kitchens.', price: 1.45, callout: 70,  speed: 1.0, late: 0.15, rating: 4, advertised: 4, warranty: 30, trades: ['heating', 'kitchen'] },
  { key: 'lifts',    name: 'Skyline Lift Services',   blurb: 'Lifts and nothing else.',                            price: 1.5,  callout: 90,  speed: 1.0, late: 0.1,  rating: 4, advertised: 4, warranty: 30, trades: ['lift'] },
  { key: 'cutprice', name: 'Cut-Price Fixers',        blurb: 'The cheapest in town. No guarantees.',               price: 0.65, callout: 0,   speed: 2.2, late: 0.45, rating: 2, advertised: 4, warranty: 0,  trades: [] },
  { key: 'elite',    name: 'Elite Hotel Services',    blurb: 'Premium engineers who only work on hotels.',         price: 2.4,  callout: 150, speed: 0.7, late: 0.05, rating: 5, advertised: 5, warranty: 60, trades: [], lift: true, allSpecialist: true }
];
const ASSET_TRADE = { boiler: 'heating', hvac: 'heating', kitchen: 'kitchen', pool: 'pool', lift: 'lift', wifi: 'appliance', plumbing: 'plumbing', electrics: 'electrical', laundry: 'appliance', roof: 'building', 'arcade-claw': 'appliance', 'arcade-racing': 'appliance', 'arcade-pinball': 'appliance', 'arcade-dance': 'appliance' };
const TRADE_NAMES = { heating: 'heating', kitchen: 'kitchen equipment', pool: 'pool', lift: 'lift', appliance: 'appliance and IT', plumbing: 'plumbing', electrical: 'electrical', building: 'building' };
const ASSET_REPAIR_DAYS = { boiler: 2, hvac: 2, pool: 3, lift: 4, kitchen: 2, wifi: 1, plumbing: 2, electrics: 2, laundry: 2, roof: 5, 'arcade-claw': 1, 'arcade-racing': 1, 'arcade-pinball': 1, 'arcade-dance': 1 };
/* Chance of [excellent, good, poor, failed] for a real rating of 1 to 5 (blended between whole ratings).
   Excellent: fully fixed. Good: fixed. Poor: looks fixed but breaks again within a week. Failed: not fixed, call-out fee only. */
const OUTCOME_ODDS = { 1: [0, 0.25, 0.40, 0.35], 2: [0.05, 0.45, 0.35, 0.15], 3: [0.15, 0.60, 0.20, 0.05], 4: [0.40, 0.50, 0.09, 0.01], 5: [0.70, 0.28, 0.02, 0] };
const SPECIALIST_BONUS = 0.7;      // a firm that specialises in the trade does better work
const FAILED_PAY_SHARE = 0.4;      // share of the price still charged when a firm fails to fix anything

/* Equipment that wears down and must be serviced.
   decay: condition points lost per day [min,max]; service/repair: base costs; hit: guest satisfaction lost per day while broken.
   fail: scenario ids that can fire when the equipment fails. */
const ASSET_DEFS = {
  boiler:    { name: 'Boiler & hot water',   decay: [1, 3], service: 120, repair: 320, hit: 10, effect: 'No hot water for guests', fail: ['boiler-breakdown'] },
  hvac:      { name: 'Heating & air-con',    decay: [1, 3], service: 150, repair: 360, hit: 6,  effect: 'Rooms too hot or too cold', fail: ['aircon-failure'] },
  pool:      { name: 'Swimming pool',        decay: [2, 4], service: 90,  repair: 260, hit: 3,  effect: 'Pool closed', fail: ['pool-green', 'pool-pump'] },
  lift:      { name: 'Lift',                 decay: [0, 2], service: 100, repair: 420, hit: 4,  effect: 'Guests climbing the stairs', fail: ['lift-stuck'] },
  kitchen:   { name: 'Kitchen equipment',    decay: [1, 3], service: 80,  repair: 240, hit: 4,  effect: 'Restaurant closed', fail: ['fridge-failure'] },
  wifi:      { name: 'Wi-Fi network',        decay: [0, 2], service: 60,  repair: 120, hit: 5,  effect: 'No internet', fail: ['wifi-outage'] },
  plumbing:  { name: 'Plumbing & drains',    decay: [1, 3], service: 100, repair: 280, hit: 5,  effect: 'Leaks and smells', fail: ['burst-pipe', 'blocked-drain'] },
  electrics: { name: 'Electrics & alarms',   decay: [0, 2], service: 110, repair: 300, hit: 6,  effect: 'Power and alarm faults', fail: ['power-cut', 'fire-alarm-fault'] },
  laundry:   { name: 'Laundry machines',     decay: [1, 3], service: 70,  repair: 200, hit: 3,  effect: 'Towels and sheets running short', fail: ['laundry-broken'] },
  roof:      { name: 'Roof & windows',       decay: [0, 2], service: 130, repair: 380, hit: 4,  effect: 'Leaks when it rains', fail: ['roof-leak'] },
  'arcade-claw':    { name: 'Claw machine',   decay: [2, 4], service: 40, repair: 110, hit: 1, effect: 'Claw machine out of order', fail: ['claw-stuck'] },
  'arcade-racing':  { name: 'Racing game',    decay: [2, 4], service: 50, repair: 140, hit: 1, effect: 'Racing game out of order', fail: ['racing-screen'] },
  'arcade-pinball': { name: 'Pinball table',  decay: [2, 4], service: 50, repair: 130, hit: 1, effect: 'Pinball table out of order', fail: ['pinball-flipper'] },
  'arcade-dance':   { name: 'Dance pad game', decay: [2, 4], service: 60, repair: 150, hit: 1, effect: 'Dance pad game out of order', fail: ['dance-pad'] }
};

/* Each room type has its own wild-animal break-in scenario (and matching photos). */
const ROOM_ANIMALS = { 'Standard': 'baboon', 'Ocean View': 'lion', 'Family': 'cats', 'Luxury Suite': 'frenchies' };

const FACILITIES = [
  { key: 'reception',    name: 'Reception',    role: 'Receptionist' },
  { key: 'housekeeping', name: 'Housekeeping', role: 'Housekeeper' },
  { key: 'restaurant',   name: 'Restaurant',   role: 'Chef',          asset: 'kitchen', unlock: 'restaurant' },
  { key: 'spa',          name: 'Spa',          role: 'Spa Therapist', unlock: 'spa' },
  { key: 'pool',         name: 'Pool',         role: null,            asset: 'pool', unlock: 'pool' },
  { key: 'arcade',       name: 'Arcade',       role: 'Arcade Attendant', feature: 'arcade' },
  { key: 'kidsclub',     name: 'Kids Club',    role: 'Kids Club Leader', feature: 'kidsclub' },
  { key: 'shop',         name: 'Souvenir shop', role: 'Shop Assistant', feature: 'shop' },
  { key: 'excursions',   name: 'Excursions',   role: 'Excursions Guide', feature: 'excursions' },
  { key: 'repairs',      name: 'Repairs',      role: 'Maintenance' }
];

const REQUESTS = [
  { kind: 'towels', label: 'Extra towels',  text: 'Could we have some extra towels, please?',    role: 'Housekeeper',   pay: 0 },
  { kind: 'food',   label: 'Room service',  text: 'Could I order a club sandwich to the room?',  role: 'Chef',          pay: 25, asset: 'kitchen', facility: 'restaurant' },
  { kind: 'spa',    label: 'Spa treatment', text: 'I would like to book a spa treatment.',       role: 'Spa Therapist', pay: 45, facility: 'spa' },
  { kind: 'tap',    label: 'Repair',        text: 'The bathroom tap is dripping.',               role: 'Maintenance',   pay: 0 },
  { kind: 'taxi',   label: 'Taxi',          text: 'Could you arrange a taxi to the station?',    role: 'Receptionist',  pay: 0 },
  { kind: 'wake',   label: 'Wake-up call',  text: 'Could I have a wake-up call at 6:30?',        role: 'Receptionist',  pay: 0 },
  { kind: 'pillow', label: 'Extra pillows', text: 'Could we have two extra pillows?',            role: 'Housekeeper',   pay: 0 }
];
const COMPLAINTS = [
  'The room next door is far too noisy.', 'The bed is not comfortable.', 'There is a spider in the bathroom.',
  'The Wi-Fi keeps dropping out.', 'Breakfast was cold.', 'The room is too hot.', 'There is rubbish left in the corridor.',
  'The shower pressure is very weak.', 'The curtains do not close properly.'
];
const REVIEW_TEXT = {
  1: ['Terrible stay. I would not recommend this hotel.', 'Awful experience from start to finish.'],
  2: ['Disappointing. Too many things went wrong.', 'Could do much better.'],
  3: ['An average stay. Nothing special.', 'Fine for one night.'],
  4: ['Lovely stay and friendly staff.', 'Very good. We would come back.'],
  5: ['Outstanding service and a spotless room.', 'Perfect. Easily the best hotel we have stayed in.']
};

const TRAITS = ['Always on time', 'Great with guests', 'Quick learner', 'Meticulous', 'Calm under pressure', 'Friendly and warm', 'Hard-working', 'Very organised'];

/* Headshot pool: drop f01..f12.jpg and m01..m12.jpg into assets/staff/ */
const PORTRAIT_COUNT = 12;
const portraitPath = p => `assets/staff/${p}.jpg`;
/* Ideas for the "Suggest a name" button on a hotel's name. */
const HOTEL_NAME_IDEAS = ['The Seaside Palms', 'Harbour View Hotel', 'The Golden Pelican', 'Sunrise Bay Resort', 'The Coral House', 'Lighthouse Lodge', 'The Blue Lagoon Inn', 'Starfish Hotel', 'The Grand Marina', 'Pebble Beach Hotel', 'The Silver Sands', 'Seagull Point Hotel'];
/* Guest faces: 36 women and 36 men (assets/guests/f01..f36.jpg and m01..m36.jpg) and 12 girls and 12 boys (kf01..kf12.jpg and km01..km12.jpg).
   A person always gets the same face, chosen from their name. */
const GUEST_FACE_COUNT = 36, KID_FACE_COUNT = 12;
function faceNumber(name, count) {
  let h = 7;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return String(h % count + 1).padStart(2, '0');
}
/* Grown-ups: f or m. Children: kf or km. */
function guestFacePath(name, gender, kid) {
  const g = gender === 'm' ? 'm' : 'f';
  return kid ? `assets/guests/k${g}${faceNumber(name, KID_FACE_COUNT)}.jpg` : `assets/guests/${g}${faceNumber(name, GUEST_FACE_COUNT)}.jpg`;
}
/* The face of a member of a party ({ n, gender, kid }). */
const personFacePath = m => guestFacePath(m.n, m.gender, m.kid);
const typeSlug = t => t.toLowerCase().replace(/\s+/g, '-');
const roomImagePath = r => `assets/rooms/${typeSlug(r.type)}-${r.variant}.jpg`;
const roomDamagePath = (r, kind) => `assets/rooms/${typeSlug(r.type)}-${r.variant}-${kind || r.damageKind || 'trashed'}.jpg`;
const roomTrashedPath = r => roomDamagePath(r, 'trashed');
const scenePath = key => `assets/scenes/${key}.jpg`;
const tierImage = t => `assets/hotel/exterior-${t}.jpg`;   // the hotel building for each level

/* ================= Small helpers ================= */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const rnd = n => Math.floor(Math.random() * n);
const rndRange = (a, b) => a + rnd(b - a + 1);
const pick = a => a[rnd(a.length)];
const chance = p => Math.random() < p;
const clockText = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const money = n => (n < 0 ? '-' : '') + CURRENCY + Math.abs(Math.round(n)).toLocaleString('en-GB');
const signed = n => (n >= 0 ? '+' : '-') + CURRENCY + Math.abs(Math.round(n)).toLocaleString('en-GB');
const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
const safeImg = u => (typeof u === 'string' && u.startsWith('data:image/')) ? u : null;
const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
const moodWord = h => h >= 80 ? 'Delighted' : h >= 60 ? 'Happy' : h >= 40 ? 'Okay' : h >= 20 ? 'Unhappy' : 'Furious';
const moodClass = h => h >= 60 ? 'good' : h >= 40 ? 'warn' : 'bad';
