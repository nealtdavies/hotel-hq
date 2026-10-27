'use strict';

/* ---------- More situations: families, weather, seasons, the team and the town (see scenarios.js for the format) ----------
   Two extra fields here: wx (the scenario only happens when the day's weather is one of these) and seasons (only in these seasons). */
const readyRooms = n => S.rooms.filter(isReady).length >= n;

SCENARIOS.push(
  /* ----- Guests: welfare and requests ----- */
  {
    id: 'lost-teddy', cat: 'Guest welfare', sev: 'Minor', img: 'lost-teddy', title: 'A missing teddy bear', needs: ['guest'], min: { guests: 2 },
    imgPrompt: 'Photorealistic hotel corridor with a worried child holding a parent\'s hand, an empty pillow on a bed visible through an open door behind them',
    text: ['{guest}\'s youngest child cannot find their teddy bear and is very upset. It was last seen in {room}.'],
    options: [
      { label: 'Ask {s} to search the room and laundry', staff: 'Housekeeper', run: (c, A, st) => { if (A.roll(0.6 + 0.08 * st.skill)) { A.mood(c.guest, 14); A.review(5, 'Staff found my child\'s teddy. Lovely people.', c.guest.name); return '{s} found the teddy bear in the laundry bag. Huge smiles all round.'; } A.mood(c.guest, -2); return '{s} searched everywhere but could not find it.'; } },
      { label: 'Give the child a hotel teddy from the shop (£15)', cost: 15, run: (c, A) => { A.mood(c.guest, 6); return 'A new teddy cheers the child up. The old one may still turn up.'; } },
      { label: 'Promise to keep looking', run: (c, A) => { A.mood(c.guest, -3); return 'The family hope the bear will turn up.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -10); }
  },
  {
    id: 'birthday-cake', cat: 'Guest requests', sev: 'Minor', img: 'birthday-cake', title: 'A birthday surprise', needs: ['guest'], min: { guests: 2 },
    imgPrompt: 'Photorealistic hotel room table with a small birthday cake, candles and balloons, a family smiling in the background',
    text: ['{guest} tells reception it is their child\'s birthday tomorrow and asks if the hotel can make it a bit special.'],
    options: [
      { label: 'Ask {s} to bake a cake with candles (£25)', staff: 'Chef', cost: 25, when: () => hasFacility('restaurant'), whenText: 'You need a restaurant kitchen', run: (c, A, st) => { A.mood(c.guest, 18); if (A.roll(0.5 + 0.08 * st.skill)) A.review(5, 'The staff made my child\'s birthday magical.', c.guest.name); return '{s} made a brilliant cake and the whole dining room sang.'; } },
      { label: 'Buy a cake from the village bakery (£15)', cost: 15, run: (c, A) => { A.mood(c.guest, 9); return 'A lovely cake arrives, with a card signed by the team.'; } },
      { label: 'Sing happy birthday at reception', run: (c, A) => { A.mood(c.guest, 4); return 'The team sing in the lobby. It is a bit wobbly but very sweet.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -6); }
  },
  {
    id: 'rainy-day-kids', cat: 'Guest welfare', sev: 'Minor', img: 'rainy-day-kids', title: 'A rainy day with bored children', needs: ['guest'], min: { guests: 3 }, wx: ['rain', 'storm'],
    imgPrompt: 'Photorealistic hotel lounge on a rainy day, children playing board games on a rug while rain streaks the large windows',
    text: ['It has rained all day and the children staying with {guest} are climbing the walls. Other guests are starting to notice the noise.'],
    options: [
      { label: 'Ask {s} to run a treasure hunt in the hotel', staff: 'Receptionist', run: (c, A) => { A.moodAll(4, 'treasure hunt'); A.mood(c.guest, 10); return '{s} hid clues all over the hotel. The children had a wonderful afternoon.'; } },
      { label: 'Set out board games in the lounge (£10)', cost: 10, run: (c, A) => { A.mood(c.guest, 7); return 'The lounge becomes a games room. Even a few grown-ups join in.'; } },
      { label: 'Suggest quiet time in the room', run: (c, A) => { A.mood(c.guest, -3); return 'The children grumble but settle down eventually.'; } }
    ],
    ignore: (c, A) => { A.moodAll(-3); A.mood(c.guest, -4); }
  },
  {
    id: 'sunburn', cat: 'Guest welfare', sev: 'Minor', img: 'sunburn', title: 'Too much sun', needs: ['guest'], wx: ['sunny'],
    imgPrompt: 'Photorealistic hotel poolside on a hot day, a guest with a sore red shoulder sitting under a parasol holding a cold drink',
    text: ['{guest} spent the whole day in the sun without sun cream and is now very red and sore.'],
    options: [
      { label: 'Ask {s} for a cooling treatment', staff: 'Spa Therapist', when: () => hasFacility('spa'), whenText: 'You need the spa', run: (c, A) => { A.mood(c.guest, 14); return '{s} soothed the sunburn with aloe and cool towels. {guest} is delighted.'; } },
      { label: 'Fetch aloe gel from the pharmacy (£12)', cost: 12, run: (c, A) => { A.mood(c.guest, 8); return 'The aloe gel helps a lot.'; } },
      { label: 'Suggest shade, water and a cool shower', run: (c, A) => { A.mood(c.guest, 1); return '{guest} thanks you for the advice and stays out of the sun.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -6); }
  },
  {
    id: 'nut-allergy', cat: 'Guest welfare', sev: 'Serious', img: 'nut-allergy', title: 'A guest with a nut allergy', needs: ['guest'], when: () => hasFacility('restaurant') && menuAvailable('Main').length > 0,
    imgPrompt: 'Photorealistic hotel restaurant kitchen, a chef carefully reading an ingredient label while a waiter holds a menu with an allergy note',
    text: ['{guest} has a serious nut allergy and wants to eat in the restaurant tonight. They are worried about what is in the food.'],
    options: [
      { label: 'Ask {s} to prepare a safe meal and check every label', staff: 'Chef', run: (c, A) => { A.mood(c.guest, 14); A.review(5, 'They took my allergy seriously. I felt safe.', c.guest.name); return '{s} cooked a delicious nut-free meal and cleaned the area first.'; } },
      { label: 'Go through the menu with {guest} yourself', run: (c, A) => { if (A.roll(0.75)) { A.mood(c.guest, 6); return 'Together you find a dish that is safe. {guest} is reassured.'; } A.mood(c.guest, -10); A.review(2, 'The hotel was not sure what was in its own food.', c.guest.name); return 'You could not be certain what was in the food, so {guest} eats elsewhere.'; } },
      { label: 'Say it should be fine', hint: 'Allergies are serious. This is a poor idea.', run: (c, A) => { A.mood(c.guest, -20); A.review(1, 'The hotel brushed off my allergy. Dangerous.', c.guest.name); A.evict(c.guest); return '{guest} leaves the hotel, upset and angry.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -12); }
  },
  {
    id: 'delayed-arrival', cat: 'Guest welfare', sev: 'Minor', img: 'delayed-arrival', title: 'A very late arrival', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel reception late at night, a tired family with suitcases at the desk and a night receptionist smiling',
    text: ['{guest}\'s flight was delayed by hours and they have finally arrived, tired and hungry.'],
    options: [
      { label: 'Ask {s} to check them in quickly and take their bags', staff: 'Receptionist', run: (c, A) => { A.mood(c.guest, 9); return '{s} had them in their room in five minutes.'; } },
      { label: 'Send up a supper tray (£18)', cost: 18, when: () => hasFacility('restaurant'), whenText: 'You need a restaurant kitchen', run: (c, A) => { A.mood(c.guest, 12); return 'A hot supper arrives. {guest} could hardly be happier.'; } },
      { label: 'Check them in as normal', run: (c, A) => { A.mood(c.guest, 1); return 'Everything is done properly, if slowly.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -6); }
  },
  {
    id: 'photo-request', cat: 'Guest requests', sev: 'Minor', img: 'photo-request', title: 'Could someone take our photo?', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel garden terrace with a smiling family posing while a staff member holds up their phone to take the picture',
    text: ['{guest} and family would love a photo together in front of the hotel to remember their holiday.'],
    options: [
      { label: 'Ask {s} to take a few photos', staff: 'Receptionist', run: (c, A) => { A.mood(c.guest, 7); return '{s} took some lovely pictures. The family cannot stop smiling.'; } },
      { label: 'Book a photographer for the morning (£40)', cost: 40, run: (c, A) => { A.mood(c.guest, 14); A.review(5, 'Professional family photos at the hotel. What a treat.', c.guest.name); return 'The photographer captures a perfect family portrait.'; } },
      { label: 'Say sorry, you are busy', run: (c, A) => { A.mood(c.guest, -3); return 'The family take a selfie instead.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -2); }
  },
  {
    id: 'barking-dog', cat: 'Guest behaviour', sev: 'Minor', img: 'barking-dog', title: 'A dog barking in the night', needs: ['guest'], min: { guests: 3 },
    imgPrompt: 'Photorealistic hotel corridor at night, a small dog peering from a door while a neighbouring guest in a dressing gown looks tired',
    text: ['{guest} brought a small dog that has been barking since the owner went to dinner. Neighbouring guests are complaining.'],
    options: [
      { label: 'Ask {s} to take the dog for a walk', staff: 'Housekeeper', run: (c, A) => { A.mood(c.guest, 6); A.moodAll(1, 'peace restored'); return '{s} walked the dog around the garden until it was calm and sleepy.'; } },
      { label: 'Call {guest} back from dinner', run: (c, A) => { A.mood(c.guest, -3); A.moodAll(1); return '{guest} returned and settled the dog, a little embarrassed.'; } },
      { label: 'Leave the dog to settle', run: (c, A) => { A.moodAll(-4, 'barking'); return 'The barking carried on for an hour.'; } }
    ],
    ignore: (c, A) => { A.moodAll(-5); }
  },
  {
    id: 'strange-noises', cat: 'Guest welfare', sev: 'Minor', img: 'strange-noises', title: 'Strange noises at night', needs: ['guest'],
    imgPrompt: 'Photorealistic old hotel corridor at night with dim lamps, a guest in pyjamas peeking out of a door looking puzzled, slightly spooky but friendly',
    text: ['{guest} says there were thumping noises in the walls of {room} all night and wonders if the hotel is haunted.'],
    options: [
      { label: 'Ask {s} to check the pipes', staff: 'Maintenance', run: (c, A) => { A.mood(c.guest, 8); A.wear('plumbing', 6); return '{s} found a loose pipe bracket and fixed it. The ghost has gone quiet.'; } },
      { label: 'Offer a different room', when: c => hasReadyRoom(c), whenText: 'No other room is ready', run: (c, A) => { const r = firstReady(c); if (r && A.moveGuest(c.guest, r)) { A.mood(c.guest, 5); return '{guest} moves to {room} and sleeps soundly.'; } return 'No other room could be used just now.'; } },
      { label: 'Tell a friendly ghost story', run: (c, A) => { if (A.roll(0.6)) { A.mood(c.guest, 6); return '{guest} loves the story and decides the hotel has character.'; } A.mood(c.guest, -4); return '{guest} is not amused and still hears the thumping.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -5); }
  },
  {
    id: 'noisy-neighbours', cat: 'Guest behaviour', sev: 'Minor', img: 'noisy-neighbours', title: 'Music through the wall', needs: ['guest'], min: { guests: 3 },
    imgPrompt: 'Photorealistic hotel corridor in the evening, a guest in casual clothes knocking politely on a neighbouring room door, a clock on the wall showing late evening',
    text: ['{guest} says music from the next room is far too loud and they cannot relax.'],
    options: [
      { label: 'Ask {s} to speak politely to the neighbours', staff: 'Receptionist', run: (c, A) => { A.mood(c.guest, 6); return '{s} had a friendly word and the music went down at once.'; } },
      { label: 'Offer ear plugs and a free breakfast (£10)', cost: 10, run: (c, A) => { A.mood(c.guest, 5); return 'The ear plugs help, and the breakfast cheers {guest} up.'; } },
      { label: 'Suggest they ignore it', run: (c, A) => { A.mood(c.guest, -8); return '{guest} lies awake, annoyed.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -9); }
  },
  {
    id: 'leaky-tap', cat: 'Facilities', sev: 'Minor', img: 'leaky-tap', title: 'A dripping tap', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel bathroom close-up of a dripping chrome tap into a basin, soft morning light',
    text: ['The tap in {room} will not stop dripping. {guest} says it kept them awake.'],
    options: [
      { label: 'Ask {s} to fit a new washer', staff: 'Maintenance', run: (c, A) => { A.mood(c.guest, 6); A.wear('plumbing', 4); return '{s} fixed the tap in ten minutes.'; } },
      { label: 'Have a go yourself with a spanner', run: (c, A) => { if (A.roll(0.4)) { A.mood(c.guest, 3); return 'Amazingly it works. The drip stops.'; } A.mood(c.guest, -3); A.wear('plumbing', -4); return 'It is now dripping faster than before.'; } },
      { label: 'Apologise and offer a discount of £15', run: (c, A) => { A.pay(15, 'Goodwill discount'); A.mood(c.guest, 3); return '{guest} accepts the apology.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -5); A.wear('plumbing', -4); }
  },
  {
    id: 'difficult-guest', cat: 'Guest behaviour', sev: 'Minor', img: 'difficult-guest', title: 'A guest who is never happy', needs: ['guest'], min: { guests: 2 },
    imgPrompt: 'Photorealistic hotel reception, a guest with folded arms and a frown talking to a calm receptionist who is listening carefully',
    text: ['{guest} has found something wrong with the room, the breakfast and the weather. Everything, in fact.'],
    options: [
      { label: 'Ask {s} to listen and offer a free dessert', staff: 'Chef', cost: 10, when: () => hasFacility('restaurant'), whenText: 'You need a restaurant kitchen', run: (c, A) => { A.mood(c.guest, 10); return '{s} sent up a gorgeous dessert. {guest} finally smiles.'; } },
      { label: 'Listen carefully and stay calm', run: (c, A) => { if (A.roll(0.6)) { A.mood(c.guest, 7); return '{guest} feels heard and settles down.'; } A.mood(c.guest, -2); return 'Nothing you say seems to please {guest}, but you stay polite.'; } },
      { label: 'Offer 10% off the stay', run: (c, A) => { const amt = Math.round(c.guest.price * c.guest.left * 0.1); A.pay(amt, 'Discount'); A.mood(c.guest, 8); return 'The discount does the trick.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -7); }
  },

  /* ----- Facilities and safety ----- */
  {
    id: 'ducks-in-pool', cat: 'Facilities', sev: 'Minor', img: 'ducks-in-pool', title: 'Ducks in the pool', needs: ['asset:pool'],
    imgPrompt: 'Photorealistic hotel swimming pool with three ducks floating on the water and guests laughing nearby at sun loungers',
    text: ['A family of ducks has landed in the pool and is refusing to leave. Guests are taking photos.'],
    options: [
      { label: 'Ask {s} to guide them out gently', staff: 'Maintenance', run: (c, A) => { A.wear('pool', -3); A.moodAll(2, 'duck rescue'); return '{s} shooed the ducks to the pond with a trail of crumbs. Guests clap.'; } },
      { label: 'Let the guests enjoy the ducks', run: (c, A) => { A.moodAll(3, 'free entertainment'); A.wear('pool', -8); if (A.roll(0.5)) A.review(5, 'Ducks in the pool! Best holiday story ever.'); return 'The ducks are the stars of the afternoon, though the pool will need a clean.'; } },
      { label: 'Close the pool for an hour', run: (c, A) => { A.moodAll(-2, 'pool closed'); return 'The ducks leave when it gets quiet.'; } }
    ],
    ignore: (c, A) => { A.wear('pool', -8); }
  },
  {
    id: 'crab-in-lobby', cat: 'Guest welfare', sev: 'Minor', img: 'crab-in-lobby', title: 'A crab in the lobby', needs: [],
    imgPrompt: 'Photorealistic hotel lobby with a small crab walking across the polished floor, guests peering and smiling',
    text: ['A small crab has wandered in from the beach and is scuttling across the lobby floor.'],
    options: [
      { label: 'Ask {s} to carry it back to the beach', staff: 'Maintenance', run: (c, A) => { A.moodAll(3, 'crab rescue'); if (A.roll(0.5)) A.review(5, 'They rescued a crab in the lobby. Brilliant staff.'); return '{s} carried the crab back to the sea in a bucket. Guests cheer.'; } },
      { label: 'Let guests take photos first', run: (c, A) => { A.moodAll(2, 'a surprise visitor'); return 'The crab poses in the middle of the floor, then scuttles off on its own.'; } },
      { label: 'Shoo it out with a broom', run: (c, A) => { A.moodAll(-2); return 'The crab is not impressed, and neither are the guests.'; } }
    ],
    ignore: (c, A) => { A.moodAll(-2); }
  },
  {
    id: 'wasp-nest', cat: 'Safety', sev: 'Serious', img: 'wasp-nest', title: 'A wasp nest by the terrace', needs: [],
    imgPrompt: 'Photorealistic hotel terrace with a cordon of red tape around a tree where a wasp nest hangs, guests watching from a distance',
    text: ['Staff have spotted a wasp nest in the tree beside the terrace. Guests are being buzzed at breakfast.'],
    options: [
      { label: 'Call a pest controller (£120)', cost: 120, run: (c, A) => { A.moodAll(4, 'wasps gone'); return 'The expert removed the nest safely in half an hour.'; } },
      { label: 'Ask {s} to deal with it carefully', staff: 'Maintenance', run: (c, A, st) => { if (A.roll(0.45 + 0.1 * st.skill)) { A.moodAll(3); return '{s} removed the nest in protective gear.'; } A.sick(st, 1); return '{s} was stung a few times and needs a day off.'; } },
      { label: 'Cordon the area off and use the other terrace', run: (c, A) => { A.moodAll(-2, 'terrace closed'); return 'Guests keep clear, though the nest is still there.'; } }
    ],
    ignore: (c, A) => { A.moodAll(-5, 'wasps'); }
  },
  {
    id: 'fire-drill', cat: 'Safety', sev: 'Minor', img: 'fire-drill', title: 'Time for a fire drill', needs: [], min: { staff: 3 },
    imgPrompt: 'Photorealistic hotel car park with staff in hi-vis jackets holding clipboards while guests gather calmly at an assembly point sign',
    text: ['The yearly fire drill is due. Doing it properly keeps everyone safe, but it will interrupt the day.'],
    options: [
      { label: 'Run a full drill led by {s}', staff: 'Receptionist', run: (c, A) => { A.moodAll(-2, 'drill'); S.staff.forEach(x => { if (A.roll(0.3)) A.reliab(x, 1); }); return 'Everyone knew exactly where to go. The team are better prepared.'; } },
      { label: 'Walk through the exits with the team', run: (c, A) => { return 'A quick walk through the exits and assembly points. Not a full drill, but better than nothing.'; } },
      { label: 'Put it off for another month', hint: 'Not the safest idea.', run: (c, A) => { A.note('The drill is postponed.', 'bad'); return 'You postpone the drill. Hopefully nothing happens.'; } }
    ],
    ignore: (c, A) => { A.note('The drill was missed.', 'bad'); }
  },
  {
    id: 'burnt-toast', cat: 'Safety', sev: 'Minor', img: 'burnt-toast', title: 'Smoke from the toaster', needs: ['asset:kitchen'],
    imgPrompt: 'Photorealistic hotel breakfast kitchen with a wisp of smoke from a toaster, a chef waving a tea towel and a smoke alarm on the ceiling',
    text: ['A row of burnt toast set off the smoke alarm in the kitchen. Guests at breakfast are looking up.'],
    options: [
      { label: 'Ask {s} to open the windows and reset the alarm', staff: 'Maintenance', run: (c, A) => { A.moodAll(1); return '{s} cleared the air and reset the alarm in minutes.'; } },
      { label: 'Apologise to the dining room and offer fresh toast', run: (c, A) => { A.moodAll(2, 'good humour'); return 'Everyone laughs, and the fresh toast is perfect.'; } },
      { label: 'Wave it away and carry on', run: (c, A) => { A.moodAll(-2, 'smell of smoke'); return 'The smoke smell lingers all morning.'; } }
    ],
    ignore: (c, A) => { A.moodAll(-3); }
  },
  {
    id: 'pool-towels', cat: 'Facilities', sev: 'Minor', img: 'pool-towels', title: 'No pool towels left', needs: ['asset:pool'],
    imgPrompt: 'Photorealistic empty towel rack by a hotel pool, guests looking around wet and holding nothing, a staff member rushing in with a stack of towels',
    text: ['The pool towels have run out on a busy afternoon and dripping guests are asking for more.'],
    options: [
      { label: 'Ask {s} to bring a fresh stack', staff: 'Housekeeper', run: (c, A) => { A.moodAll(3, 'fresh towels'); return '{s} was back in minutes with warm, fluffy towels.'; } },
      { label: 'Buy beach towels from the shop (£40)', cost: 40, run: (c, A) => { A.moodAll(2); return 'The new towels arrive in bright stripes.'; } },
      { label: 'Ask guests to use their room towels', run: (c, A) => { A.moodAll(-2, 'towel shortage'); return 'Guests grumble, then fetch their own.'; } }
    ],
    ignore: (c, A) => { A.moodAll(-4); }
  },
  {
    id: 'storm-roof', cat: 'Facilities', sev: 'Serious', img: 'storm-roof', title: 'Loose tiles in the storm', needs: ['asset:roof'], wx: ['storm'],
    imgPrompt: 'Photorealistic hotel at dusk in a heavy storm, a maintenance worker on a ladder securing a loose roof tile with rain streaming down',
    text: ['The storm is rattling the roof and a few loose tiles are banging in the wind. Water could come in if they go.'],
    options: [
      { label: 'Ask {s} to secure the tiles', staff: 'Maintenance', run: (c, A, st) => { if (A.roll(0.55 + 0.08 * st.skill)) { A.wear('roof', 5); return '{s} secured the tiles just in time.'; } A.wear('roof', -20); return '{s} could not reach all the tiles and some water leaks in.'; } },
      { label: 'Call a roofer (£200)', cost: 200, run: (c, A) => { A.wear('roof', 8); return 'The roofer arrives in the rain and makes everything safe.'; } },
      { label: 'Put buckets under the leaks and wait', run: (c, A) => { A.moodAll(-3, 'dripping'); A.wear('roof', -12); return 'The buckets fill up all night.'; } }
    ],
    ignore: (c, A) => { A.wear('roof', -20); A.moodAll(-4); }
  },

  /* ----- Business and the town ----- */
  {
    id: 'sandcastle-contest', cat: 'Business', sev: 'Minor', img: 'sandcastle-contest', title: 'A sandcastle contest', needs: [], wx: ['sunny', 'cloudy'], seasons: ['spring', 'summer'],
    imgPrompt: 'Photorealistic hotel beach with children building elaborate sandcastles, a judge with a clipboard and a small trophy, sunshine',
    text: ['The children staying at the hotel want a sandcastle contest on the beach.'],
    options: [
      { label: 'Ask {s} to judge, with prizes (£30)', staff: 'Receptionist', cost: 30, run: (c, A) => { A.moodAll(5, 'sandcastle fun'); if (A.roll(0.6)) A.review(5, 'The sandcastle contest was the highlight of our week.'); return '{s} judged the castles with great seriousness. Everyone got a medal.'; } },
      { label: 'Let the children run it themselves', run: (c, A) => { A.moodAll(2); return 'Plenty of building and not much agreement about who won.'; } },
      { label: 'Say it is too busy today', run: (c, A) => { A.moodAll(-2); return 'The children trudge back with buckets and spades.'; } }
    ],
    ignore: (c, A) => { A.moodAll(-1); }
  },
  {
    id: 'school-trip', cat: 'Business', sev: 'Minor', img: 'school-trip', title: 'A school trip wants rooms', needs: [], when: () => readyRooms(4),
    imgPrompt: 'Photorealistic hotel reception with a teacher holding a clipboard and a group of cheerful school children with backpacks queueing behind',
    text: ['A teacher calls to book four rooms for two nights for a school trip, and asks for a discount.'],
    options: [
      { label: 'Accept with 20% off', when: () => readyRooms(4), whenText: 'Not enough clean rooms', run: (c, A) => { const n = A.groupBook(4, 2, 0.2, 'Tour'); return n ? `${n} rooms filled with happy, noisy children.` : 'No rooms were free.'; } },
      { label: 'Offer 10% off', when: () => readyRooms(4), whenText: 'Not enough clean rooms', run: (c, A) => { if (A.roll(0.6)) { const n = A.groupBook(4, 2, 0.1, 'Tour'); return n ? `The school agrees. ${n} rooms booked.` : 'No rooms were free.'; } return 'The school books somewhere cheaper.'; } },
      { label: 'Politely decline', run: () => 'You wish them a lovely trip.' }
    ],
    ignore: () => {}
  },
  {
    id: 'local-news', cat: 'Business', sev: 'Minor', img: 'local-news', title: 'The local paper calls', needs: [],
    imgPrompt: 'Photorealistic hotel lobby, a friendly reporter with a notebook and camera talking to a smiling hotel manager by the front desk',
    text: ['A reporter from the local paper wants to write a story about the hotel and asks for an interview.'],
    options: [
      { label: 'Give the interview yourself', run: (c, A) => { if (A.roll(0.6)) { A.demand(2, 4); A.review(5, 'Read about this hotel in the paper and it is as good as they said.'); return 'The article is glowing. The phone rings all week.'; } return 'The story is short and says little, but does no harm.'; } },
      { label: 'Ask {s} to give a tour', staff: 'Receptionist', run: (c, A) => { A.demand(2, 3); return '{s} charmed the reporter with a tour. A nice piece appears the next day.'; } },
      { label: 'Say no thanks', run: () => 'The reporter thanks you and moves on to the next hotel.' }
    ],
    ignore: () => {}
  },
  {
    id: 'local-produce', cat: 'Business', sev: 'Minor', img: 'local-produce', title: 'A farmer offers fresh produce', needs: [], when: () => hasFacility('restaurant'),
    imgPrompt: 'Photorealistic hotel kitchen back door, a farmer handing over crates of fresh vegetables and fruit to a smiling chef',
    text: ['A local farmer offers a week of fresh fruit and vegetables for the kitchen at a fair price.'],
    options: [
      { label: 'Taste the produce with {s} and agree (£80)', staff: 'Chef', cost: 80, run: (c, A) => { A.moodAll(3, 'fresh local food'); return 'The salads are brilliant. Guests notice the difference.'; } },
      { label: 'Agree to a smaller order (£40)', cost: 40, run: (c, A) => { A.moodAll(2, 'fresh local food'); return 'A small crate arrives each morning, full of flavour.'; } },
      { label: 'Say not this time', run: () => 'The farmer waves and drives away.' }
    ],
    ignore: () => {}
  },
  {
    id: 'cake-sale', cat: 'Business', sev: 'Minor', img: 'cake-sale', title: 'A cake sale in the lobby', needs: [],
    imgPrompt: 'Photorealistic hotel lobby with a table of home-made cakes and a charity sign, school children selling to smiling guests',
    text: ['A local school asks to hold a charity cake sale in the lobby on Saturday.'],
    options: [
      { label: 'Say yes and put out a table', run: (c, A) => { A.moodAll(3, 'home-made cakes'); if (A.roll(0.5)) A.review(5, 'Charity cake sale in the lobby. Such a friendly hotel.'); return 'Guests buy cake after cake. The school raises a lot of money.'; } },
      { label: 'Donate a prize hamper (£50)', cost: 50, run: (c, A) => { A.moodAll(2); A.review(5, 'The hotel supports the local school. Lovely.'); return 'Your hamper is the star of the raffle.'; } },
      { label: 'Say sorry, the lobby is too busy', run: () => 'The school will try another day.' }
    ],
    ignore: () => {}
  },
  {
    id: 'photo-shoot', cat: 'Business', sev: 'Minor', img: 'photo-shoot', title: 'A photographer wants the garden', needs: [],
    imgPrompt: 'Photorealistic hotel garden with a photographer and assistants setting up lights and a reflector around a model in a summer dress',
    text: ['A photographer asks to use the hotel garden for a magazine shoot.'],
    options: [
      { label: 'Charge a £150 location fee', run: (c, A) => { A.earn(150, 'Location fee'); return 'The shoot goes smoothly and the fee covers a fresh coat of paint.'; } },
      { label: 'Allow it free for a credit in the magazine', run: (c, A) => { A.demand(2, 5); return 'The hotel appears in the magazine. Bookings pick up.'; } },
      { label: 'Say no, guests come first', run: (c, A) => { A.moodAll(1); return 'The guests enjoy their quiet garden.'; } }
    ],
    ignore: () => {}
  },
  {
    id: 'winter-decorations', cat: 'Business', sev: 'Minor', img: 'winter-decorations', title: 'Decorating for the winter lights', needs: [], seasons: ['winter'],
    imgPrompt: 'Photorealistic hotel lobby decorated with warm fairy lights, a tall tree and garlands, guests sipping hot chocolate by the fire',
    text: ['The town\'s winter lights are coming and guests love a festive lobby. Time to decorate.'],
    options: [
      { label: 'Ask {s} to decorate the lobby (£40)', staff: 'Housekeeper', cost: 40, run: (c, A) => { A.moodAll(4, 'festive lobby'); A.demand(2, 4); return '{s} turned the lobby into a winter wonderland.'; } },
      { label: 'Put up a few lights yourself', run: (c, A) => { A.moodAll(2); return 'Not very tidy, but cheerful.'; } },
      { label: 'Skip the decorations', run: (c, A) => { A.moodAll(-1); return 'The lobby stays plain.'; } }
    ],
    ignore: (c, A) => { A.moodAll(-1); }
  },
  {
    id: 'beach-clean', cat: 'Business', sev: 'Minor', img: 'beach-clean', title: 'A beach clean-up day', needs: [], seasons: ['spring', 'summer', 'autumn'],
    imgPrompt: 'Photorealistic hotel beach with staff and guests in gloves picking up litter into bags on a bright morning',
    text: ['The village is holding a beach clean-up day and asks the hotel to join in.'],
    options: [
      { label: 'Send {s} and a few guests to help', staff: 'Receptionist', run: (c, A) => { A.moodAll(2, 'community spirit'); A.review(5, 'The hotel helped clean our beach. Proud to stay here.'); return '{s} led a cheerful team of staff and guests. The beach sparkles.'; } },
      { label: 'Donate bin bags and gloves (£30)', cost: 30, run: (c, A) => { A.moodAll(1); return 'The organisers thank you for the supplies.'; } },
      { label: 'Say sorry, you are too busy', run: () => 'The village understands.' }
    ],
    ignore: () => {}
  },
  {
    id: 'inspection-day', cat: 'Business', sev: 'Serious', img: 'inspection-day', title: 'A food hygiene inspection', needs: [], when: () => hasFacility('restaurant'), minDay: 6,
    imgPrompt: 'Photorealistic hotel kitchen, an inspector with a clipboard and a white coat looking at stainless steel counters while a chef stands proudly by',
    text: ['An inspector arrives to check the kitchen for food hygiene. Everyone is a little nervous.'],
    options: [
      { label: 'Ask {s} to lead the inspection', staff: 'Chef', run: (c, A, st) => { if (A.roll(0.55 + 0.09 * st.skill)) { A.review(5, 'Spotless kitchen with top hygiene marks.'); A.demand(1, 4); return '{s} showed the inspector round and the kitchen passed with top marks.'; } A.pay(100, 'Hygiene re-check fee'); return 'A few things need tidying up and there is a small fee for a re-check.'; } },
      { label: 'Show the inspector round yourself', run: (c, A) => { if (A.roll(0.5)) return 'You answer every question and the kitchen passes.'; A.pay(100, 'Hygiene re-check fee'); return 'There are a few things you did not know. A re-check fee is due.'; } },
      { label: 'Ask the inspector to come back tomorrow', run: (c, A) => { A.note('The inspector is not impressed.', 'bad'); A.moodAll(-1); return 'The inspector agrees to return, but makes a note.'; } }
    ],
    ignore: (c, A) => { A.pay(100, 'Hygiene re-check fee'); }
  },

  /* ----- The team ----- */
  {
    id: 'language-course', cat: 'Staff', sev: 'Minor', img: 'language-course', title: 'A team member wants to learn a language', needs: ['staff'],
    imgPrompt: 'Photorealistic hotel reception, a receptionist studying a language book between tasks with a headset and a notebook on the desk',
    text: ['{staff} asks if the hotel could help pay for a language course so they can talk to more guests.'],
    options: [
      { label: 'Pay for the course (£80)', cost: 80, run: (c, A) => { A.skill(c.staff, 1); A.reliab(c.staff, 1); return '{sfirst} is thrilled and starts lessons next week. Guests will notice.'; } },
      { label: 'Let them practise on the guests', run: (c, A) => { if (A.roll(0.5)) A.skill(c.staff, 1); return '{sfirst} practises at the desk. Some guests are charmed.'; } },
      { label: 'Say not now', run: (c, A) => { A.reliab(c.staff, -1); return '{sfirst} nods, but looks a bit let down.'; } }
    ],
    ignore: (c, A) => { A.reliab(c.staff, -1); }
  }
);
