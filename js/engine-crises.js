'use strict';
/* ================= Crises: the big problems that last for days (no DOM access) =================
   An ordinary incident is settled in one choice. A crisis is not. It has two meters: Trouble, which grows every night and blows up the
   crisis at 100, and Progress, which the player builds up with actions until it reaches 100. Each action costs something real (cash, and
   jobs from the people on duty, which are also needed for the day's ordinary work). Most actions are a short skill game (stop the marker,
   tap the wet patches, pick the kindest reply, put the steps in order) that gets easier with an experienced person, or the player can
   leave them to chance, with the chance shown. While a crisis lasts it can put rooms out of service, close the restaurant, upset guests
   and hurt reviews. Handled well it pays a reward and the person who did most becomes a hero; left to blow up it costs a fine, goodwill
   and standards.
   Many crises give a warning first, with things to do to prepare: two preparations stop it, one makes it milder. Safeguards bought
   in advance make a crisis rarer and milder. Medals are earned for good play, and unlock perks.
   Nothing here injures anyone: these are mishaps with pipes, power, pests, weather, lifts, pools, locks and online gossip.
   S.crises is the list of live ones (at most CRISIS.maxActive). S.crisisLast is the day the last one began. */

const CRISIS = { minDay: 8, maxActive: 1, cooldown: 6, baseChance: 0.07, escalate: 0.25, startTrouble: 40, resolveBonus: 8, warnChance: 0.6, warnPoints: 2, medalBonus: 100, preventBonus: 60, perfectBoost: 1.25, tapHits: 10, tapSeconds: 13 };

const crisisById = id => S.crises.find(c => c.id === id) || null;
const crisisClosed = key => S.crises.some(c => (c.closes || []).includes(key));
const crisisReviewHit = () => S.crises.reduce((a, c) => a + (c.reviewHit || 0), 0);
const crisisScale = () => 0.6 + 0.4 * S.tier;   // rewards and fines grow with the size of the hotel
const roomNamesOf = c => c.roomIds.map(id => (roomById(id) || {}).name).filter(Boolean).join(', ');
const crisisSpareRooms = () => S.rooms.filter(r => !r.guestId && !r.damaged).length;
const crisisShuffle = list => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const crisisText = t => String(t).replace(/\{hotel\}/g, S.hotel);
function crisisMood(d) { for (const g of S.guests) g.happiness = clamp(g.happiness + d, 0, 100); }
/* Puts n of the crisis's damaged rooms back in service for free. */
function crisisRepair(c, n) { let k = 0; for (const id of c.roomIds) { const r = roomById(id); if (r && r.damaged && k < n) { fixRoom(r); k++; } } return k; }

/* ---------- Medals and the perks they unlock ---------- */
const MEDALS = [
  { key: 'coolhead', name: 'Cool head', desc: 'Solve your first crisis.' },
  { key: 'quickfix', name: 'Quick fix', desc: 'Solve a crisis in two days.' },
  { key: 'safehands', name: 'Safe hands', desc: 'Solve three crises without letting one blow up.' },
  { key: 'bullseye', name: 'Bullseye', desc: 'Play a crisis game perfectly.' },
  { key: 'sharpeyes', name: 'Sharp eyes', desc: 'Stop a crisis before it starts.' },
  { key: 'heromaker', name: 'Hero maker', desc: 'Make someone on your team a hero.' },
  { key: 'plumber', name: 'Plumber\'s friend', desc: 'Solve a burst pipe.' },
  { key: 'lights', name: 'Light keeper', desc: 'Solve a power cut.' },
  { key: 'pests', name: 'Pest patrol', desc: 'Solve a pest scare.' },
  { key: 'storm', name: 'Storm chaser', desc: 'Solve storm damage.' },
  { key: 'goodname', name: 'Good name', desc: 'Solve a bad reviews crisis.' },
  { key: 'liftrescue', name: 'Lift rescuer', desc: 'Solve a stuck lift.' },
  { key: 'poolpatrol', name: 'Pool patrol', desc: 'Solve a murky pool.' },
  { key: 'locksmith', name: 'Master locksmith', desc: 'Solve a stuck door.' },
  { key: 'prepared', name: 'Fully prepared', desc: 'Buy every safeguard.' },
  { key: 'wordsmith', name: 'Wordsmith', desc: 'Write five notices for your guests.' },
  { key: 'favourite', name: 'Inspector\'s favourite', desc: 'Get Excellent from the Star Inspector twice.' },
  { key: 'champion', name: 'Crisis champion', desc: 'Solve every kind of crisis.' }
];
const CRISIS_PERKS = [[3, 'Steady hands', 'The targets in your crisis games are a little bigger.'], [6, 'Good contacts', 'Everything you pay for in a crisis costs 10% less.'],
  [9, 'Hero\'s reputation', 'Thank-you bonuses are 20% bigger.'], [12, 'Calm leader', 'Trouble grows 2 less every night.']];
const medalCount = () => Object.keys(S.medals).length;
const crisisPerks = () => { const n = medalCount(); return { zone: n >= 3 ? 0.04 : 0, cost: n >= 6 ? 0.1 : 0, reward: n >= 9 ? 0.2 : 0, growth: n >= 12 ? 2 : 0 }; };
/* Gives a medal once, with a small bonus. Returns the medal, or null if it was already won. */
function awardMedal(key) {
  const m = MEDALS.find(x => x.key === key);
  if (!m || S.medals[key] !== undefined) return null;
  S.medals[key] = S.day;
  S.medalQueue.push(key);
  bonus(CRISIS.medalBonus, `Medal: ${m.name}`);
  postMail({ role: 'Manager', subject: `Medal won: ${m.name}`, body: `${m.desc} A bonus of £${CRISIS.medalBonus} has been paid.${CRISIS_PERKS.some(p => p[0] === medalCount()) ? ` You have also unlocked a perk: ${CRISIS_PERKS.find(p => p[0] === medalCount())[1]}.` : ''}`, kind: 'crisis' });
  return m;
}

/* ---------- What people are good at ---------- */
/* A trait that suits one of the games: Calm under pressure steadies the timing games, Meticulous the tapping games, and so on. */
const TRAIT_EDGE = { 'Calm under pressure': 'timing', 'Meticulous': 'tap', 'Great with guests': 'choice', 'Friendly and warm': 'choice', 'Very organised': 'order' };
const TRAIT_HELP = { timing: 'a bigger target', tap: 'more time', choice: 'a hint', order: 'a hint' };
const traitEdge = s => (s && TRAIT_EDGE[s.trait]) || null;

/* Every action: label and hint for the player, what it costs (cost in £, and `jobs` jobs from someone of `role`, a Manager can always stand in),
   its chance of working when left to chance (`odds`, null when it cannot fail, plus 8 points for each skill star above three), what a success
   does (`fix` progress, `relief` less Trouble) and what a failure does (`risk` more Trouble). `game` is the skill game that replaces the dice.
   `after(c)` is any extra effect of a success. */
const GAME_CHOICE = (variants) => ({ type: 'choice', variants });
const CRISES = {
  pipe: { name: 'Burst pipe', w: 3, rooms: 3, repairCost: 240, growth: 12, mood: 5, fine: 500, reward: 400, reviewText: 'Water through the ceiling and nobody seemed to know what to do.', staffVoice: 'Maintenance',
    can: () => crisisSpareRooms() >= 4,
    intro: c => `A pipe has burst and water is pouring through the ceiling. ${roomNamesOf(c)} ${c.roomIds.length === 1 ? 'is' : 'are'} out of service, guests are worried, and the water is still running.`,
    warn: { text: 'The pipes in the old part of the building are knocking and one is dripping. If nobody looks at them, they may burst.',
      prep: [{ key: 'check', label: 'Check the pipes', hint: 'A proper look at the old pipework.', cost: 50, role: 'Maintenance', jobs: 1 }, { key: 'standby', label: 'Put a plumber on standby', hint: 'They will come fast if it happens.', cost: 120 }] },
    voices: { guest: [['It is a little damp up there, but nothing to worry about.', 'There was a drip in the corridor. Is that normal?'], ['There is water running down the wall. Should we be worried?', 'My shoes are wet! What is going on?'], ['This is a disaster! Water everywhere and nobody is helping!', 'We cannot stay here like this!']],
      staff: [['I have found where it is coming from. We can sort this.', 'I have turned my torch on the pipes. It looks fixable.'], ['It is getting worse. We need to act today.', 'The valve is stiff and the water is spreading.'], ['It is out of control! We need everything we have!', 'We cannot hold this much longer!']] },
    actions: [
      { key: 'valve', label: 'Shut off the water', hint: 'Stops it getting worse. The valve is stiff, so stop the marker in the green.', role: 'Maintenance', jobs: 1, odds: 0.85, fix: 20, relief: 15, risk: 10, game: { type: 'timing', what: 'Turn the valve at just the right moment.' }, ok: 'The water is off and the flood has stopped.', bad: 'The valve was stuck fast and the water kept coming.' },
      { key: 'plumber', label: 'Call an emergency plumber', hint: 'Expensive, but they know what they are doing. What you say on the phone matters.', cost: 350, odds: 0.9, fix: 35, relief: 20, risk: 5,
        game: GAME_CHOICE([{ prompt: 'The plumber answers. What do you tell them?', options: [{ t: 'A pipe has burst and water is coming through the ceiling of the rooms below. We have turned the water off at the valve.', score: 2 }, { t: 'Please come quickly, there is water everywhere!', score: 1 }, { t: 'Something is a bit wet. Come when you can.', score: 0 }] },
          { prompt: 'The plumber asks you to describe the leak.', options: [{ t: 'It is coming from the pipe above the guest rooms, and the main valve is already shut.', score: 2 }, { t: 'It is a big leak, as far as I can tell.', score: 1 }, { t: 'It is just a few drips, I think.', score: 0 }] }]),
        ok: 'The plumber fixed the pipe properly.', bad: 'The plumber was stuck in traffic and arrived too late to help.' },
      { key: 'dry', label: 'Dry out the rooms', hint: 'Towels, fans and elbow grease. Two jobs for housekeeping. Every wet patch takes about ten taps and fades a little with each one, so be quick.', role: 'Housekeeper', jobs: 2, odds: 0.8, fix: 20, relief: 10, risk: 8, game: { type: 'tap', patches: 6, what: 'Tap each wet patch ten times to dry it.' }, ok: 'The rooms are drying out nicely.', bad: 'The carpets are still soaking.', after: c => crisisRepair(c, 1) },
      { key: 'treat', label: 'Give guests a free treat', hint: 'Hot drinks and cake in the lounge. Cheers everyone up.', cost: 80, odds: null, fix: 0, relief: 8, ok: 'The guests enjoyed the treat and calmed down.', after: () => crisisMood(6) }
    ] },
  power: { name: 'Power cut', w: 3, rooms: 0, closes: ['restaurant'], growth: 14, mood: 4, fine: 400, reward: 300, reviewText: 'The lights went out and the hotel had no plan.', staffVoice: 'Maintenance',
    can: () => true,
    intro: () => 'The whole hotel has gone dark. The lights, the lifts and the kitchen are off, and guests are feeling their way down the corridors.',
    warn: { text: 'The power company says there may be a power cut in the area soon, and the wind is getting up.',
      prep: [{ key: 'generator', label: 'Test the generator', hint: 'Make sure it starts when it is needed.', cost: 60, role: 'Maintenance', jobs: 1 }, { key: 'torches', label: 'Stock candles and torches', hint: 'Light for every floor.', cost: 40 }] },
    voices: { guest: [['The lights flickered. I hope that is all.', 'Was that the power? It came back quickly.'], ['It is very dark in here! Is there a torch?', 'The lift has stopped. We are using the stairs.'], ['We have been in the dark for ages! This is awful!', 'We cannot see a thing and nobody has told us anything!']],
      staff: [['I have the generator ready. It should not take long.', 'I am checking the fuse box now.'], ['The power is still off. I need a hand with the generator.', 'Guests are asking for candles. We must hurry.'], ['It is chaos! We need light and we need it now!', 'Everything is off and I cannot manage alone!']] },
    actions: [
      { key: 'generator', label: 'Start the generator', hint: 'Needs a steady hand. Stop the marker in the green to pull the cord at the right moment.', cost: 120, role: 'Maintenance', jobs: 1, odds: 0.7, fix: 35, relief: 20, risk: 10, game: { type: 'timing', what: 'Pull the cord at just the right moment.' }, ok: 'The generator roared into life.', bad: 'It spluttered and died. It needs another go.' },
      { key: 'phone', label: 'Ring the power company', hint: 'Free, but they are very busy. Be clear and polite.', odds: 0.6, fix: 20, relief: 10, risk: 5,
        game: GAME_CHOICE([{ prompt: 'The power company answers. What do you say?', options: [{ t: 'Hello, this is {hotel}. The whole hotel has lost power and we have guests here. Could you tell me when it will be back?', score: 2 }, { t: 'Hello? Our lights are out.', score: 1 }, { t: 'Fix our power right now!', score: 0 }] },
          { prompt: 'They ask whether you have checked your own fuse box.', options: [{ t: 'Yes, we have, and it is fine. The whole street seems to be dark. How long will it take?', score: 2 }, { t: 'I think so. Can you just send someone?', score: 1 }, { t: 'That is not our job, that is yours.', score: 0 }] }]),
        ok: 'They promise an engineer and the power starts to come back.', bad: 'You waited in a queue and got nowhere.' },
      { key: 'candles', label: 'Hand out candles and snacks', hint: 'Housekeeping brings light and biscuits to every floor.', cost: 60, role: 'Housekeeper', jobs: 1, odds: null, fix: 0, relief: 12, ok: 'Guests are cosy and a lot happier.', after: () => crisisMood(8) },
      { key: 'barbecue', label: 'Cook dinner on the barbecue', hint: 'If it works, the restaurant can open tonight. Put the steps in the right order.', cost: 150, role: 'Chef', jobs: 1, odds: 0.75, fix: 15, relief: 8, risk: 6,
        game: { type: 'order', variants: [{ prompt: 'Put the barbecue steps in the right order.', steps: ['Check the charcoal and light it', 'Wait until the coals glow', 'Cook the food on the grill', 'Serve it hot with a smile'] }, { prompt: 'Put the steps in the right order.', steps: ['Clean the grill', 'Light the coals', 'Cook the food until it is ready', 'Carry it safely to the tables'] }] },
        ok: 'Dinner is served by torchlight and everyone loves it.', bad: 'The barbecue would not light.', after: c => { c.closes = []; crisisMood(6); } }
    ] },
  mice: { name: 'Pest scare in the kitchen', w: 2, rooms: 0, closes: ['restaurant'], reviewHit: 1, growth: 11, mood: 3, fine: 450, reward: 350, reviewText: 'Heard there was a pest problem in the kitchen. Not good enough.', staffVoice: 'Chef',
    can: () => hasFacility('restaurant'),
    intro: () => 'A guest has spotted a mouse near the kitchen. The restaurant has to close until it is sorted, and word is getting round.',
    warn: { text: 'The chef has found some crumbs and a gnawed packet in the storeroom. Something has been getting in.',
      prep: [{ key: 'seal', label: 'Seal the gaps', hint: 'Block every little way in.', cost: 60, role: 'Maintenance', jobs: 1 }, { key: 'storeroom', label: 'Deep-clean the storeroom', hint: 'No crumbs, no visitors.', cost: 30, role: 'Housekeeper', jobs: 1 }] },
    voices: { guest: [['I heard a rumour about the kitchen. Is everything all right?', 'Someone said there was a mouse. Surely not?'], ['Is it true there is a mouse in the kitchen? I am not sure about dinner.', 'We are not eating here tonight. We heard about the kitchen.'], ['A mouse! In the kitchen! We are leaving a review about this!', 'This is disgusting! We want a refund!']],
      staff: [['I have shut the kitchen as a precaution. We will get it sorted.', 'It is only a small problem and we have caught it early.'], ['I have checked every cupboard. We need a proper clean and some help.', 'The kitchen is shut and I do not like it. We must act.'], ['It is getting out of hand! Nobody will eat here!', 'We cannot keep the kitchen closed forever!']] },
    actions: [
      { key: 'clean', label: 'Deep-clean the kitchen', hint: 'Every cupboard and corner. Two jobs for housekeeping. Every pile takes about ten taps and shrinks a little with each one, so be quick.', role: 'Housekeeper', jobs: 2, odds: 0.85, fix: 25, relief: 12, risk: 8, game: { type: 'tap', patches: 6, what: 'Tap each pile of crumbs ten times to sweep it up.' }, ok: 'The kitchen is spotless.', bad: 'Something was missed and there are signs of a mouse again.' },
      { key: 'pest', label: 'Call pest control', hint: 'The experts. What you tell them helps them find the way in.', cost: 300, odds: 0.9, fix: 40, relief: 20, risk: 5,
        game: GAME_CHOICE([{ prompt: 'Pest control asks what you have seen.', options: [{ t: 'A mouse near the kitchen door, and crumbs by the storeroom. We have closed the kitchen.', score: 2 }, { t: 'A mouse, I think.', score: 1 }, { t: 'Nothing really. Just have a look around.', score: 0 }] },
          { prompt: 'They ask where the food is kept.', options: [{ t: 'In the storeroom next to the kitchen. It is locked now and we have moved the open packets.', score: 2 }, { t: 'In the kitchen somewhere.', score: 1 }, { t: 'I do not know. Ask the chef.', score: 0 }] }]),
        ok: 'Pest control found the way in and blocked it up.', bad: 'They could not come until tomorrow.' },
      { key: 'restock', label: 'Throw out and restock the food', hint: 'Better safe than sorry.', cost: 200, odds: null, fix: 10, relief: 10, ok: 'Fresh food is in and the old stock is gone.' },
      { key: 'honest', label: 'Tell guests honestly', hint: 'An honest note on the desk. Stops the bad reviews, and guests respect it.', odds: null, fix: 5, relief: 10, ok: 'Guests appreciated being told the truth.', after: c => { c.reviewHit = 0; crisisMood(3); } }
    ] },
  roof: { name: 'Storm damage', w: 2, rooms: 2, roomType: 'Ocean View', repairCost: 300, growth: 10, mood: 3, fine: 450, reward: 350, reviewText: 'A leaking roof and no real help from the staff.', staffVoice: 'Maintenance',
    can: () => crisisSpareRooms() >= 4 && ['rain', 'storm'].includes(weatherOn(S.day).kind),
    intro: c => `The storm has lifted some tiles off the roof and rain is coming in. ${roomNamesOf(c)} ${c.roomIds.length === 1 ? 'is' : 'are'} out of service.`,
    warn: { text: 'A big storm is on its way, and some roof tiles were already loose last time. They may not last the night.',
      prep: [{ key: 'tiles', label: 'Check the roof tiles', hint: 'Fix anything that is loose.', cost: 50, role: 'Maintenance', jobs: 1 }, { key: 'tarpaulin', label: 'Get a tarpaulin ready', hint: 'Ready to throw over the roof.', cost: 40 }] },
    voices: { guest: [['I can hear the wind. It is a bit loud, but I am fine.', 'Is that a tile I heard fall? Probably nothing.'], ['There is a drip in our room, and the wind is howling.', 'The ceiling looks damp. Can someone check?'], ['Rain is coming through the ceiling! This is not acceptable!', 'We are soaked! Why has nobody fixed it?']],
      staff: [['I have checked the roof. It is only a few tiles, so it is fixable.', 'The wind is strong, but I think we can manage this.'], ['More tiles have gone. We need a cover on quickly.', 'The rain is getting in, and I cannot reach everything.'], ['The roof is coming apart! We must move everyone!', 'I cannot fix this without help!']] },
    actions: [
      { key: 'tarp', label: 'Cover the roof with a tarpaulin', hint: 'Quick and cheap, in the wind and rain. Stop the marker in the green to throw it just right.', cost: 90, role: 'Maintenance', jobs: 1, odds: 0.8, fix: 20, relief: 20, risk: 10, game: { type: 'timing', what: 'Throw the tarpaulin over at just the right moment.' }, ok: 'The tarpaulin is tied down and the rain is kept out.', bad: 'The wind whipped the tarpaulin away.' },
      { key: 'roofer', label: 'Book a roofer', hint: 'Costly, but it fixes the roof properly. Tell them what they need to know.', cost: 450, odds: 0.9, fix: 35, relief: 20, risk: 5,
        game: GAME_CHOICE([{ prompt: 'The roofer asks how bad the leak is.', options: [{ t: 'Tiles have blown off above two rooms and rain is coming in. We have covered it with a sheet for now.', score: 2 }, { t: 'The roof is leaking.', score: 1 }, { t: 'It is only a few drips, no rush.', score: 0 }] },
          { prompt: 'The roofer asks if anyone can get onto the roof safely.', options: [{ t: 'Yes, there is a hatch on the top floor. Please bring your own ladder and we will keep guests clear.', score: 2 }, { t: 'I think there is a way up.', score: 1 }, { t: 'Just climb up, you will find it.', score: 0 }] }]),
        ok: 'The roofer replaced the tiles.', bad: 'The roofer could not get up in the weather.' },
      { key: 'dry', label: 'Dry and re-make the rooms', hint: 'Two jobs for housekeeping. Every wet patch takes about ten taps and fades a little with each one, so be quick.', role: 'Housekeeper', jobs: 2, odds: 0.8, fix: 20, relief: 10, risk: 8, game: { type: 'tap', patches: 6, what: 'Tap each wet patch ten times to dry it.' }, ok: 'The rooms are dry and fresh again.', bad: 'It is still damp in there.', after: c => crisisRepair(c, 1) },
      { key: 'move', label: 'Move guests to dry rooms', hint: 'A bit of effort, and the guests are happy to move.', odds: null, fix: 0, relief: 8, ok: 'Everyone is settled in dry rooms.', after: () => crisisMood(4) }
    ] },
  gossip: { name: 'Bad reviews online', w: 2, rooms: 0, reviewHit: 1, growth: 9, mood: 2, fine: 350, reward: 300, reviewText: 'Not what the nasty posts said, but not great either.', staffVoice: 'Receptionist',
    can: () => S.reviews.length >= 3,
    intro: () => 'Someone has posted a very unfair review about the hotel and it is being shared. New guests are reading it, and reviews are coming in lower.',
    warn: { text: 'An unhappy guest left angry and is telling everyone they will write something nasty about the hotel online.',
      prep: [{ key: 'call', label: 'Call the unhappy guest', hint: 'Listen, say sorry, and try to put it right.', role: 'Receptionist', jobs: 1 }, { key: 'replies', label: 'Reply to your recent reviews', hint: 'Show everyone how well you listen.', role: 'Receptionist', jobs: 1 }] },
    voices: { guest: [['I read one odd review, but I am sure it is not true.', 'Someone wrote something about the hotel. I do not believe it.'], ['I read a nasty review. Is any of it true?', 'There is a lot of talk online. I am not so sure now.'], ['I will not stay at a hotel with reviews like that!', 'Everyone is saying this place is awful!']],
      staff: [['I have seen the review. We can answer it nicely.', 'I am ready to write some kind replies.'], ['More people are sharing it. We need to reply today.', 'It is spreading, and guests are asking about it.'], ['It is everywhere! We are losing guests!', 'We have to stop this before it gets worse!']] },
    actions: [
      { key: 'reply', label: 'Reply politely to your reviews', hint: 'Kind, careful replies. A skilled receptionist does this much better. Two jobs.', role: 'Receptionist', jobs: 2, odds: 0.75, fix: 25, relief: 15, risk: 8,
        game: GAME_CHOICE([{ prompt: 'A guest has written an unkind review. Which reply is best?', options: [{ t: 'Thank you for telling us, and we are sorry we let you down. We would love to put it right, so please get in touch.', score: 2 }, { t: 'Thank you for your review.', score: 1 }, { t: 'That is not true and you are wrong.', score: 0 }] },
          { prompt: 'Another guest says the room was noisy. How do you reply?', options: [{ t: 'We are sorry about the noise. We have spoken to the team and we would like you to come back for a quieter room.', score: 2 }, { t: 'Sorry about that.', score: 1 }, { t: 'Other guests did not complain.', score: 0 }] }]),
        ok: 'The replies were kind and people noticed.', bad: 'The replies came across badly.' },
      { key: 'tea', label: 'Invite unhappy guests to a free tea', hint: 'Turn grumbles into smiles.', cost: 120, odds: null, fix: 10, relief: 10, ok: 'The tea party went down a treat.', after: () => crisisMood(5) },
      { key: 'ask', label: 'Ask happy guests to write a review', hint: 'It may or may not work, but a glowing review helps a lot. Ask kindly.', role: 'Receptionist', jobs: 1, odds: 0.65, fix: 30, relief: 10, risk: 5,
        game: GAME_CHOICE([{ prompt: 'A guest is checking out smiling. How do you ask for a review?', options: [{ t: 'We are so glad you enjoyed your stay. If you have a moment, would you tell others about it?', score: 2 }, { t: 'Please write a review.', score: 1 }, { t: 'You must write a five-star review before you go.', score: 0 }] },
          { prompt: 'A family says they loved the pool. What do you say?', options: [{ t: 'That is lovely to hear! Would you mind sharing that in a review so other families can find us?', score: 2 }, { t: 'Great. Review us.', score: 1 }, { t: 'Then you owe us a review.', score: 0 }] }]),
        ok: 'A guest wrote a lovely review.', bad: 'Nobody got round to it.', after: () => addReview(drawPerson().name, 5, 'Staying here was wonderful, and the staff could not do enough for us.') },
      { key: 'apology', label: 'Post an honest message', hint: 'Explain what really happened. Free, and it takes the sting out.', odds: null, fix: 5, relief: 10, ok: 'People respected the honest message.', after: c => { c.reviewHit = 0; } }
    ] },
  lift: { name: 'Stuck lift', w: 2, rooms: 0, growth: 11, mood: 4, fine: 400, reward: 320, reviewText: 'The lift stopped with guests inside and it took far too long to get them out.', staffVoice: 'Maintenance',
    can: () => hasFacility('lift') && S.guests.length >= 2,
    intro: () => 'The lift has stopped between floors with guests inside. Everyone is safe, but they are stuck, the doors will not budge, and a crowd is gathering at the stairs.',
    warn: { text: 'The lift has been jerking and making odd noises all morning. It may stop completely.',
      prep: [{ key: 'inspect', label: 'Check the lift', hint: 'A proper look at the motor and the doors.', cost: 50, role: 'Maintenance', jobs: 1 }, { key: 'engineer', label: 'Put a lift engineer on standby', hint: 'They will come fast if it happens.', cost: 120 }] },
    voices: { guest: [['The lift gave a little jolt. I hope that is all.', 'The lift is slow today, is it not?'], ['We have stopped between floors! Is somebody coming?', 'The lift has stopped and the doors will not open.'], ['We have been in here for ages! Please get us out!', 'It is hot in here and we want to get out now!']],
      staff: [['I can hear them and they are fine. I am on my way with the tools.', 'I know what is wrong. The doors are just stuck.'], ['The doors are jammed and I need to open them carefully.', 'They are fine in there, but we must hurry.'], ['Everyone is waiting and the lift is still stuck! I need help!', 'It is taking too long. We have to get those doors open now!']] },
    actions: [
      { key: 'doors', label: 'Open the lift doors', hint: 'Slow and careful. Stop the marker in the green to open the doors just wide enough to help everyone out.', role: 'Maintenance', jobs: 1, odds: 0.8, fix: 30, relief: 18, risk: 10, game: { type: 'timing', what: 'Open the doors just wide enough to step out.' }, ok: 'The doors slid open and everyone stepped out safely.', bad: 'The doors jammed again. They need another go.' },
      { key: 'engineer', label: 'Call the lift engineer', hint: 'Costly, but they know every lift. Tell them what you know.', cost: 380, odds: 0.9, fix: 35, relief: 20, risk: 5,
        game: GAME_CHOICE([{ prompt: 'The lift engineer answers. What do you tell them?', options: [{ t: 'The lift has stopped between the first and second floors with guests inside. Everyone is safe and we are talking to them.', score: 2 }, { t: 'The lift is broken, please come quickly!', score: 1 }, { t: 'It is a bit stuck. Come if you are passing.', score: 0 }] },
          { prompt: 'The engineer asks if you have switched the lift off.', options: [{ t: 'Yes, it is switched off at the control panel and a member of staff is at the lift doors.', score: 2 }, { t: 'I think somebody did that.', score: 1 }, { t: 'No, we thought you would do that.', score: 0 }] }]),
        ok: 'The engineer reset the lift and made sure it was safe.', bad: 'The engineer could not get to you until later.' },
      { key: 'talk', label: 'Talk to the guests inside', hint: 'Keep them calm and chatting. What you say matters.', role: 'Receptionist', jobs: 1, odds: 0.75, fix: 20, relief: 14, risk: 6,
        game: GAME_CHOICE([{ prompt: 'The guests in the lift are worried. What do you say through the doors?', options: [{ t: 'Please do not worry. You are safe, help is on its way, and I will stay right here and talk to you until the doors are open.', score: 2 }, { t: 'Someone is coming soon.', score: 1 }, { t: 'There is nothing I can do. Just wait.', score: 0 }] },
          { prompt: 'A child in the lift asks how long it will take.', options: [{ t: 'Not long at all. Shall we play a guessing game while we wait for the doors to open?', score: 2 }, { t: 'I do not know.', score: 1 }, { t: 'Longer than you would like.', score: 0 }] }]),
        ok: 'The guests calmed down and even started to laugh.', bad: 'The guests were more worried than ever.' },
      { key: 'drinks', label: 'Send cold drinks and sweets to the stairs', hint: 'Cheer up everyone who is waiting.', cost: 60, odds: null, fix: 0, relief: 10, ok: 'Cold drinks and sweets helped everyone wait patiently.', after: () => crisisMood(6) }
    ] },
  pool: { name: 'Murky pool', w: 2, rooms: 0, closes: ['pool'], growth: 10, mood: 3, fine: 400, reward: 330, reviewText: 'The pool was green and closed. It looked nothing like the photos.', staffVoice: 'Maintenance',
    can: () => hasFacility('pool'),
    intro: () => 'The pool has turned cloudy and green, with leaves and bits floating everywhere. It has to close until it is clean, and guests are disappointed.',
    warn: { text: 'The pool water is going cloudy and the filter is making a grinding noise. If nobody looks, it could turn murky.',
      prep: [{ key: 'test', label: 'Test the water', hint: 'Check the chemicals and the filter.', cost: 30, role: 'Maintenance', jobs: 1 }, { key: 'cover', label: 'Order a pool cover', hint: 'Keeps the leaves and the dirt out.', cost: 70 }] },
    voices: { guest: [['The pool looks a little cloudy today.', 'Is the pool water meant to be that colour?'], ['The pool is green! Can we still swim?', 'There are leaves all over the pool.'], ['The pool is disgusting! We came here to swim!', 'We want the pool open again, or our money back!']],
      staff: [['It is just a bit of debris. We can skim it off.', 'I will test the water and sort it out.'], ['The water is murky and the filter is clogged. It needs a proper clean.', 'The pool is shut and there is a lot to clear.'], ['This will take forever if I do it alone!', 'The pool is a mess and everyone is asking when it will open!']] },
    actions: [
      { key: 'skim', label: 'Skim the pool clean', hint: 'Nets and brushes. Two jobs for maintenance. Every leaf takes about ten taps and fades a little with each one, so be quick.', role: 'Maintenance', jobs: 2, odds: 0.8, fix: 25, relief: 12, risk: 8, game: { type: 'tap', patches: 6, what: 'Tap each leaf ten times to scoop it out.' }, ok: 'The surface is clear and sparkling.', bad: 'Plenty of leaves are still floating about.' },
      { key: 'chemicals', label: 'Rebalance the water', hint: 'Test, treat, run the filter, then test again. Put the steps in the right order.', cost: 60, role: 'Maintenance', jobs: 1, odds: 0.75, fix: 25, relief: 14, risk: 8,
        game: { type: 'order', variants: [{ prompt: 'Put the pool-cleaning steps in the right order.', steps: ['Test the water', 'Add the right chemicals', 'Run the filter for a few hours', 'Test the water again'] }, { prompt: 'Put the steps in the right order.', steps: ['Skim off the leaves', 'Test the water', 'Treat the water', 'Check it is safe to swim'] }] },
        ok: 'The water is clear, balanced and safe to swim in.', bad: 'The water is still cloudy. Something was missed.' },
      { key: 'specialist', label: 'Call the pool specialist', hint: 'Costly, but they know pools. Tell them what you see.', cost: 300, odds: 0.9, fix: 35, relief: 20, risk: 5,
        game: GAME_CHOICE([{ prompt: 'The pool specialist asks what is wrong with the pool.', options: [{ t: 'The water has gone green and cloudy, there are leaves on the surface, and the filter is making a grinding noise. We have closed the pool.', score: 2 }, { t: 'The pool looks dirty.', score: 1 }, { t: 'It is fine really. Just a quick look.', score: 0 }] },
          { prompt: 'They ask when the chemicals were last checked.', options: [{ t: 'Two days ago. The readings were normal then, so something has changed quickly.', score: 2 }, { t: 'Quite recently, I think.', score: 1 }, { t: 'I have no idea. We never write it down.', score: 0 }] }]),
        ok: 'The specialist cleaned the filter and put the water right.', bad: 'The specialist could only come tomorrow.' },
      { key: 'lollies', label: 'Hand out ice lollies on the terrace', hint: 'Sunshine, ice lollies and a smile. Cheers everyone up.', cost: 70, odds: null, fix: 0, relief: 10, ok: 'The terrace was full of happy guests with ice lollies.', after: () => crisisMood(6) }
    ] },
  lock: { name: 'Stuck room door', w: 2, rooms: 1, repairCost: 120, growth: 9, mood: 3, fine: 350, reward: 280, reviewText: 'The door to our room jammed and it took ages for anyone to help.', staffVoice: 'Maintenance',
    can: () => crisisSpareRooms() >= 4,
    intro: c => `The lock on ${roomNamesOf(c)} has jammed and the door will not open. The room is out of service, and a guest is waiting in the lobby for their key.`,
    warn: { text: 'Several room keys have been sticking in their locks all week. One door may jam completely.',
      prep: [{ key: 'oil', label: 'Oil the locks', hint: 'A drop of oil in every keyhole.', cost: 30, role: 'Maintenance', jobs: 1 }, { key: 'spares', label: 'Check the spare keys', hint: 'Make sure every master key works.', cost: 20, role: 'Receptionist', jobs: 1 }] },
    voices: { guest: [['My key was a bit stiff, but it worked in the end.', 'The key is hard to turn today.'], ['Our door will not open! Can somebody come?', 'We are locked out and our things are inside.'], ['We have been waiting in the lobby for ages!', 'This is ridiculous. We just want to get into our room!']],
      staff: [['I have my toolkit. It is only a stiff lock.', 'I have seen worse. I will have it open in a minute.'], ['The lock is properly jammed. I need to be careful not to break it.', 'It is taking longer than I thought.'], ['The guest is getting cross and the door will not budge!', 'I need help with this lock, and quickly!']] },
    actions: [
      { key: 'pick', label: 'Pick the lock', hint: 'Gentle and precise. Stop the marker in the green to lift the last pin and turn the lock.', role: 'Maintenance', jobs: 1, odds: 0.8, fix: 30, relief: 18, risk: 10, game: { type: 'timing', what: 'Lift the last pin at just the right moment.' }, ok: 'Click! The lock turned and the door swung open.', bad: 'The pick slipped and the pin dropped back.', after: c => crisisRepair(c, 1) },
      { key: 'locksmith', label: 'Call a locksmith', hint: 'Costly, but they open anything. Say what they need to know.', cost: 220, odds: 0.9, fix: 35, relief: 20, risk: 5,
        game: GAME_CHOICE([{ prompt: 'The locksmith asks about the door.', options: [{ t: 'It is a guest room door on the first floor. The key goes in but will not turn, and nobody is inside.', score: 2 }, { t: 'A door is stuck.', score: 1 }, { t: 'I do not know which door. Come and find it.', score: 0 }] },
          { prompt: 'The locksmith asks if you have tried the master key.', options: [{ t: 'Yes, and it will not turn either, so I think the lock itself has jammed. Please bring a new one.', score: 2 }, { t: 'I think so.', score: 1 }, { t: 'No, we do not have one.', score: 0 }] }]),
        ok: 'The locksmith opened the door and fitted a new lock.', bad: 'The locksmith could not come until later.' },
      { key: 'keys', label: 'Find the right key', hint: 'The master key lives in the key cabinet. Put the steps in the right order.', role: 'Receptionist', jobs: 1, odds: 0.75, fix: 20, relief: 10, risk: 6,
        game: { type: 'order', variants: [{ prompt: 'Put the steps in the right order.', steps: ['Check the room number on the door', 'Find the right tag in the key cabinet', 'Try the master key gently', 'Open the door and check the room'] }, { prompt: 'Put the steps in the right order.', steps: ['Ask the guest which room it is', 'Open the key cabinet', 'Take out the master key', 'Try it in the lock'] }] },
        ok: 'The master key turned and the door opened.', bad: 'It was the wrong key, and now the lock is stiffer.' },
      { key: 'lobby', label: 'Look after the waiting guest', hint: 'A comfy chair and a hot drink while they wait.', cost: 40, odds: null, fix: 0, relief: 10, ok: 'The guest enjoyed a hot drink and a comfy chair in the lobby.', after: () => crisisMood(6) }
    ] }
};
/* A notice for the guests, in the player's own words, is offered in every crisis. Nothing written is marked. */
const CRISIS_NOTICE = { key: 'notice', label: 'Write a notice for the guests', hint: 'A kind, clear note on the desk, in your own words. Nothing you write is marked. A longer note helps a little more.', odds: null, fix: 5, relief: 12, write: true, ok: 'Guests read your notice and felt looked after.', after: () => crisisMood(4) };
const crisisActionsOf = def => def.actions.concat([CRISIS_NOTICE]);
const crisisGrowth = def => Math.max(4, def.growth - crisisPerks().growth);

/* ---------- Safeguards: bought in advance ---------- */
const SAFEGUARDS = {
  pipe: { name: 'Plumbing check-up', cost: 500, text: 'The old pipes are replaced. Burst pipes become much rarer and do less damage.' },
  power: { name: 'Backup generator', cost: 900, text: 'A proper generator keeps the lights and the kitchen on in a power cut.' },
  mice: { name: 'Pest-proofing', cost: 600, text: 'Every gap is sealed. Pest scares are rarer and never close the kitchen.' },
  roof: { name: 'New roof tiles', cost: 700, text: 'A sound roof. Storm damage is rarer and hurts fewer rooms.' },
  gossip: { name: 'Guest care programme', cost: 400, text: 'Happy guests tell their friends. Bad reviews online are rarer and never drag your reviews down.' },
  lift: { name: 'Lift servicing plan', cost: 600, text: 'The lift is serviced every month. Stuck lifts become much rarer and are less serious.' },
  pool: { name: 'Pool care contract', cost: 500, text: 'An expert looks after the water every week. A murky pool becomes much rarer and is less serious.' },
  lock: { name: 'New door locks', cost: 450, text: 'Every room has a new smooth lock. Stuck doors become much rarer and are less serious.' }
};
const hasGuard = key => !!(S.safeguards && S.safeguards[key] !== undefined);
function buySafeguard(key) {
  const g = SAFEGUARDS[key];
  if (!g) return { ok: false, error: 'There is no such safeguard.' };
  if (hasGuard(key)) return { ok: false, error: 'You already have that.' };
  if (!canAfford(g.cost)) return { ok: false, error: 'Not enough cash for that.' };
  spend(g.cost, `Safeguard: ${g.name}`);
  S.safeguards[key] = S.day;
  postMail({ role: 'Manager', subject: `New safeguard: ${g.name}`, body: g.text, kind: 'crisis' });
  if (Object.keys(SAFEGUARDS).every(hasGuard)) awardMedal('prepared');
  return { ok: true, name: g.name };
}

/* ---------- Saves ---------- */
function ensureCrises(d) {
  d = d || S;
  if (!Array.isArray(d.crises)) d.crises = [];
  if (!Number.isInteger(d.crisisLast)) d.crisisLast = -99;
  if (!Array.isArray(d.crisisLog)) d.crisisLog = [];
  if (!d.safeguards || typeof d.safeguards !== 'object') d.safeguards = {};
  if (!d.medals || typeof d.medals !== 'object') d.medals = {};
  if (!Array.isArray(d.medalQueue)) d.medalQueue = [];
  if (!Array.isArray(d.heroLog)) d.heroLog = [];
  if (!d.crisisKinds || typeof d.crisisKinds !== 'object') d.crisisKinds = {};
  if (d.warning && !(d.warning.key && CRISES[d.warning.key] && Number.isInteger(d.warning.due) && d.warning.done && typeof d.warning.done === 'object')) d.warning = null;
  if (d.warning === undefined) d.warning = null;
  d.crises = d.crises.filter(c => c && CRISES[c.key] && Number.isFinite(c.trouble) && Number.isFinite(c.fix) && Array.isArray(c.roomIds));
  d.crises.forEach(c => { if (!c.credit || typeof c.credit !== 'object') c.credit = {}; });
}
const crisisEligible = () => Object.keys(CRISES).filter(k => CRISES[k].can());

/* ---------- Starting one ---------- */
/* Begins a crisis. `night` is true when it begins in the evening (from an ignored incident), so tonight's effects are skipped.
   opts.mild: a crisis that was half prepared for. A safeguard makes it milder as well. */
function startCrisis(key, night, opts) {
  const def = CRISES[key];
  if (!def) return null;
  opts = opts || {};
  const guard = hasGuard(key), mild = !!opts.mild;
  const c = { id: nid(), key, day: S.day, trouble: mild ? 15 : guard ? 20 : CRISIS.startTrouble, fix: 0, roomIds: [], closes: (guard && (key === 'power' || key === 'mice') ? [] : (def.closes || [])).slice(), reviewHit: guard && key === 'gossip' ? 0 : (def.reviewHit || 0),
    acted: {}, daysOpen: 0, log: [], skipNight: !!night, credit: {}, mild, guarded: guard };
  const rooms = Math.max(0, (def.rooms || 0) - (guard ? 1 : 0) - (mild ? 1 : 0));
  if (rooms) {
    const spare = S.rooms.filter(r => !r.guestId && !r.damaged).sort((a, b) => (b.type === def.roomType) - (a.type === def.roomType) || Math.random() - 0.5);
    for (const r of spare.slice(0, rooms)) { r.damaged = true; r.repairCost = def.repairCost; r.damageKind = 'crisis'; c.roomIds.push(r.id); }
  }
  S.crises.push(c);
  S.crisisLast = S.day;
  ensureJobs();
  const text = def.intro(c);
  c.log.push({ day: S.day, text });
  S.news.push(`Crisis: ${def.name}. ${text}`);
  postMail({ role: 'Manager', subject: `Crisis: ${def.name}`, body: `${text}${mild ? ' Your preparations helped, so it is milder than it might have been.' : guard ? ' Your safeguard has made it milder.' : ''} This will get worse every night until it is dealt with. Open Crisis to see what you can do.`, kind: 'crisis', urgent: true });
  S.stats.crises = (S.stats.crises || 0) + 1;
  return c;
}

/* ---------- Warnings and preparing ---------- */
function startWarning(key) {
  const def = CRISES[key];
  S.warning = { key, due: S.day + rndRange(1, 2), points: 0, done: {}, said: S.day };
  S.news.push(`Warning: ${def.warn.text}`);
  postMail({ role: 'Manager', subject: `Warning: ${def.name} may be coming`, body: `${def.warn.text} You have until ${S.warning.due === S.day + 1 ? 'tomorrow' : 'the day after tomorrow'}. Two preparations stop it completely, and one makes it milder. Open Crisis to prepare.`, kind: 'crisis' });
  return S.warning;
}
/* What the screen needs to know about one preparation: { ok, reason, cost, role, jobs, staff }. */
function prepState(p) {
  const w = S.warning;
  let reason = null;
  if (!w) reason = 'There is no warning right now.';
  else if (w.done[p.key]) reason = 'Done';
  else if (p.cost && !canAfford(p.cost)) reason = 'Cannot afford this';
  const staff = p.role ? eligibleForRole(p.role).filter(s => s.used + p.jobs <= STAFF_CAP).sort((x, y) => (y.role === p.role) - (x.role === p.role) || y.skill - x.skill) : [];
  if (!reason && p.role && !staff.length) reason = `No ${p.role.toLowerCase()} free today`;
  return { ok: !reason, reason, cost: p.cost || 0, role: p.role || null, jobs: p.jobs || 0, staff };
}
function doPrep(key, staffId) {
  const w = S.warning, def = w && CRISES[w.key], p = def && def.warn.prep.find(x => x.key === key);
  if (!p) return { ok: false, error: 'That warning has passed.' };
  const st = prepState(p);
  if (!st.ok) return { ok: false, error: st.reason };
  if (p.role) {
    const who = st.staff.find(s => s.id === Number(staffId));
    if (!who) return { ok: false, error: 'Choose who will do it.' };
    who.used += p.jobs;
    scheduleWork(who, `${def.name}: ${p.label}`, 'incident');
    S.stats.jobs++; tally('jobs');
  }
  if (p.cost) spend(p.cost, `Preparing: ${p.label}`);
  w.done[p.key] = S.day; w.points++;
  return { ok: true, points: w.points, needed: CRISIS.warnPoints, text: w.points >= CRISIS.warnPoints ? 'That should be enough. With luck, nothing will happen.' : 'That helps. One more preparation would stop it completely.' };
}
/* The morning the warning runs out: prepared well enough and it never happens, half prepared and it is mild, otherwise it hits in full. */
function settleWarning() {
  const w = S.warning, def = CRISES[w.key];
  S.warning = null;
  if (w.points >= CRISIS.warnPoints) {
    const reward = Math.round(CRISIS.preventBonus * crisisScale());
    S.crisisLast = S.day;
    bonus(reward, `Crisis stopped: ${def.name}`);
    S.stats.prevented = (S.stats.prevented || 0) + 1;
    S.news.push(`Phew! Your preparations worked, and the ${def.name.toLowerCase()} never happened. Thank-you bonus £${reward}.`);
    postMail({ role: 'Manager', subject: `Stopped before it started: ${def.name}`, body: `Your preparations worked. Nothing happened, and a thank-you bonus of £${reward} has been paid.`, kind: 'crisis' });
    awardMedal('sharpeyes');
    return { prevented: true, reward };
  }
  return startCrisis(w.key, false, { mild: w.points === 1 });
}

/* ---------- Each morning: a warning, or a crisis by itself ---------- */
function rollCrises() {
  if (S.warning) return S.day >= S.warning.due ? settleWarning() : null;
  if (S.day < CRISIS.minDay || S.crises.length >= CRISIS.maxActive || S.day - S.crisisLast < CRISIS.cooldown) return null;
  if (!chance(CRISIS.baseChance * crisisChanceFactor())) return null;
  const keys = crisisEligible();
  if (!keys.length) return null;
  const weight = k => CRISES[k].w * (hasGuard(k) ? 0.35 : 1);
  const total = keys.reduce((a, k) => a + weight(k), 0);
  let x = Math.random() * total, key = keys[0];
  for (const k of keys) { x -= weight(k); if (x <= 0) { key = k; break; } }
  return chance(CRISIS.warnChance) ? startWarning(key) : startCrisis(key, false);
}
/* An urgent incident that was ignored may grow into a crisis. Returns the line to show, or null. */
function escalateIncident(inc) {
  const sc = SCEN[inc.sid];
  if (!sc || sc.sev !== 'Urgent' || S.warning || S.day < CRISIS.minDay - 3 || S.crises.length >= CRISIS.maxActive || S.day - S.crisisLast < CRISIS.cooldown || !chance(CRISIS.escalate)) return null;
  const keys = crisisEligible();
  if (!keys.length) return null;
  const c = startCrisis(pick(keys), true);
  return c ? { t: `It has grown into a crisis: ${CRISES[c.key].name}`, kind: 'bad', amt: null } : null;
}

/* ---------- The games ---------- */
/* How a skill game is set up for this person: bigger target, more time or a hint with experience, and a trait that suits the game helps further.
   Returns null for an action with no game. */
function crisisGameSpec(a, staff) {
  if (!a.game) return null;
  const skill = staff ? staff.skill : 3, edge = traitEdge(staff), type = a.game.type, perks = crisisPerks(), helped = edge === type;
  const base = { type, skill, edge, helped, what: a.game.what || '' };
  if (type === 'timing') return Object.assign(base, { zone: clamp(0.16 + 0.05 * (skill - 3) + (helped ? 0.06 : 0) + perks.zone, 0.08, 0.45), sweepMs: 1200, center: 0.25 + Math.random() * 0.5 });
  if (type === 'tap') return Object.assign(base, { patches: a.game.patches || 6, taps: a.game.taps || CRISIS.tapHits, seconds: Math.round((CRISIS.tapSeconds + 1.2 * (skill - 3) + (helped ? 3 : 0)) * 10) / 10 });
  if (type === 'choice') {
    const v = pick(a.game.variants), hint = skill >= 4 || helped;
    let options = crisisShuffle(v.options.map(o => ({ t: crisisText(o.t), score: o.score })));
    if (hint) options = options.filter(o => o.score !== 0);   // experience rules out the worst answer
    return Object.assign(base, { prompt: crisisText(v.prompt), options, hint });
  }
  if (type === 'order') {
    const v = pick(a.game.variants), hint = skill >= 4 || helped;
    return Object.assign(base, { prompt: v.prompt, steps: crisisShuffle(v.steps.map((t, i) => ({ t, i }))), count: v.steps.length, hint });   // with experience the first step is shown
  }
  return null;
}
/* Turns what the player did into a result. answer: timing = where the marker was (0 to 1); tap = { tapped, left } seconds left; choice = the
   index picked in spec.options; order = how many wrong taps. Returns { success, perfect }. */
function crisisJudge(spec, answer) {
  if (spec.type === 'timing') { const d = Math.abs(Number(answer) - spec.center); return { success: d <= spec.zone / 2, perfect: d <= spec.zone * 0.15 }; }
  if (spec.type === 'tap') { const ok = answer.tapped >= spec.patches; return { success: ok, perfect: ok && answer.left >= spec.seconds * 0.25 }; }
  if (spec.type === 'choice') { const o = spec.options[Number(answer)]; return { success: !!o && o.score >= 1, perfect: !!o && o.score === 2 }; }
  if (spec.type === 'order') { const m = Number(answer); return { success: m <= 1, perfect: m === 0 }; }
  return { success: false, perfect: false };
}

/* ---------- Taking an action ---------- */
const crisisOdds = (a, staff) => a.odds === null || a.odds === undefined ? 1 : clamp(a.odds + (staff ? (staff.skill - 3) * 0.08 : 0), 0.05, 0.97);
const crisisCost = a => Math.round((a.cost || 0) * (1 - crisisPerks().cost));
/* Everyone who could do the job today: on duty and with enough jobs left. */
const crisisStaffFor = a => a.role ? eligibleForRole(a.role).filter(s => s.used + a.jobs <= STAFF_CAP).sort((x, y) => (y.role === a.role) - (x.role === a.role) || y.skill - x.skill) : [];
/* What the screen needs to know about one action: { ok, reason, cost, staff: [{ s, odds }], odds, game }. */
function crisisActionState(c, a) {
  let reason = null;
  if (c.acted[a.key] === S.day) reason = 'Done today';
  else if (crisisCost(a) && !canAfford(crisisCost(a))) reason = 'Cannot afford this';
  const staff = crisisStaffFor(a);
  if (!reason && a.role && !staff.length) reason = `No ${a.role.toLowerCase()} free today`;
  return { ok: !reason, reason, cost: crisisCost(a), role: a.role || null, jobs: a.jobs || 0, staff: staff.map(s => ({ s, odds: crisisOdds(a, s), edge: traitEdge(s) === (a.game && a.game.type) })), odds: a.role ? null : crisisOdds(a, null), game: !!a.game, write: !!a.write };
}
/* Returns { ok, error } or { ok, success, perfect, text, resolved, name, reward, hero, medals }.
   `result` is { success, perfect } from a skill game; leave it out to leave the action to chance. `text` is a written notice. */
function doCrisisAction(id, key, staffId, result, text) {
  const c = crisisById(id), def = c && CRISES[c.key], a = def && crisisActionsOf(def).find(x => x.key === key);
  if (!a) return { ok: false, error: 'That crisis has ended.' };
  const st = crisisActionState(c, a);
  if (!st.ok) return { ok: false, error: st.reason };
  let note = '';
  if (a.write) { note = cleanText(text, 160); if (note.length < 10) return { ok: false, error: 'Write a few words for your guests first.' }; }
  let who = null;
  if (a.role) {
    who = st.staff.map(x => x.s).find(s => s.id === Number(staffId));
    if (!who) return { ok: false, error: 'Choose who will do it.' };
    who.used += a.jobs;
    for (let i = 0; i < a.jobs; i++) scheduleWork(who, `${def.name}: ${a.label}`, 'incident');
    S.stats.jobs++; tally('jobs');
  }
  if (crisisCost(a)) spend(crisisCost(a), `Crisis: ${a.label}`);
  c.acted[a.key] = S.day;
  const played = !!result && typeof result === 'object';
  const success = played ? !!result.success : Math.random() < crisisOdds(a, who);
  const perfect = played && success && !!result.perfect;
  const boost = perfect ? CRISIS.perfectBoost : 1;
  let text2;
  if (success) {
    let fix = Math.round((a.fix || 0) * boost) + (a.write && note.length >= 40 ? 3 : 0) + (who && who.trait === 'Hard-working' && a.fix ? 5 : 0);
    c.fix = clamp(c.fix + fix, 0, 100); c.trouble = clamp(c.trouble - Math.round((a.relief || 0) * boost), 0, 100);
    if (a.after) a.after(c);
    text2 = a.ok;
  } else {
    c.trouble = clamp(c.trouble + (a.risk || 0), 0, 100);
    text2 = a.bad;
  }
  if (a.write) { c.notice = note; S.stats.notices = (S.stats.notices || 0) + 1; if (S.stats.notices >= 5) awardMedal('wordsmith'); }
  if (who) { const pts = (success ? (perfect ? 3 : 2) : 1) * (who.trait === 'Quick learner' ? 2 : 1); c.credit[who.id] = (c.credit[who.id] || 0) + pts; }
  if (perfect) { S.stats.perfect = (S.stats.perfect || 0) + 1; awardMedal('bullseye'); }
  c.log.push({ day: S.day, text: `${a.label}: ${text2}`, perfect });
  c.log = c.log.slice(-12);
  const out = { ok: true, success, perfect, text: text2, name: def.name, resolved: false, played };
  if (c.fix >= 100) Object.assign(out, resolveCrisis(c));
  return out;
}

/* ---------- The end of a crisis ---------- */
function endCrisis(c, outcome) {
  S.crises = S.crises.filter(x => x !== c);
  S.crisisLast = S.day;
  S.crisisLog.unshift({ key: c.key, name: CRISES[c.key].name, day: c.day, ended: S.day, outcome });
  S.crisisLog = S.crisisLog.slice(0, 12);
}
/* The person who did the most becomes a hero: an experience boost, which means a rise in skill and so in wage. */
function awardHero(c) {
  const ranked = Object.entries(c.credit || {}).map(([id, pts]) => ({ s: staffById(Number(id)), pts })).filter(x => x.s).sort((x, y) => y.pts - x.pts);
  if (!ranked.length) return null;
  const s = ranked[0].s, promoted = s.skill < 5;
  s.heroes = (s.heroes || 0) + 1;
  if (promoted) { s.skill++; s.wage += WAGE_PER_STAR; }
  s.mood = clamp(s.mood + 25, 0, 100);
  const hero = { id: nid(), staffId: s.id, name: s.name, role: s.role, day: S.day, crisis: CRISES[c.key].name, promoted };
  S.heroLog.unshift(hero); S.heroLog = S.heroLog.slice(0, 20);
  S.stats.heroes = (S.stats.heroes || 0) + 1;
  postMail({ role: 'Manager', subject: `${s.name} is a hero`, body: `${s.name} did more than anyone to get the hotel through the ${CRISES[c.key].name.toLowerCase()}.${promoted ? ` They have been promoted to ${s.skill} stars and their wage is now £${s.wage} a day.` : ' They are already as experienced as it gets, but everyone knows who saved the day.'}`, kind: 'crisis' });
  awardMedal('heromaker');
  return hero;
}
/* Progress reached 100: the problem is solved, remaining damage is put right, and there is a reward. */
function resolveCrisis(c) {
  const def = CRISES[c.key], reward = Math.round(def.reward * crisisScale() * (1 + crisisPerks().reward));
  crisisRepair(c, c.roomIds.length);
  bonus(reward, `Crisis handled: ${def.name}`);
  crisisMood(CRISIS.resolveBonus);
  nudgeStandards(5);
  const days = c.daysOpen;
  endCrisis(c, 'resolved');
  S.stats.crisesSolved = (S.stats.crisesSolved || 0) + 1;
  S.crisisKinds[c.key] = S.day;
  postMail({ role: 'Manager', subject: `Well handled: ${def.name}`, body: `The crisis is over. Guests noticed how calmly it was dealt with. A thank-you bonus of £${reward} has been paid, and the damage is put right.`, kind: 'crisis' });
  const hero = awardHero(c);
  const won = [];
  const give = k => { const m = awardMedal(k); if (m) won.push(m); };
  if (S.stats.crisesSolved === 1) give('coolhead');
  if (days <= 1) give('quickfix');
  if (S.stats.crisesSolved >= 3 && !(S.stats.crisesBlown > 0)) give('safehands');
  give({ pipe: 'plumber', power: 'lights', mice: 'pests', roof: 'storm', gossip: 'goodname', lift: 'liftrescue', pool: 'poolpatrol', lock: 'locksmith' }[c.key]);
  if (Object.keys(CRISES).every(k => S.crisisKinds[k] !== undefined)) give('champion');
  return { resolved: true, reward, hero, medals: won };
}
/* Trouble reached 100: it blows up. */
function blowUpCrisis(c, events) {
  const def = CRISES[c.key], fine = Math.round(def.fine * crisisScale());
  spend(fine, `Crisis got out of hand: ${def.name}`);
  crisisMood(-15);
  nudgeStandards(-8);
  addReview(drawPerson().name, 2, def.reviewText);
  endCrisis(c, 'blown');
  S.stats.crisesBlown = (S.stats.crisesBlown || 0) + 1;
  events.push({ text: `The ${def.name.toLowerCase()} got out of hand. Costs £${fine}, guests are upset and standards fell.` });
  postMail({ role: 'Manager', subject: `Crisis out of hand: ${def.name}`, body: `Nobody got on top of it in time. It cost £${fine}, and word got round. Any damaged rooms still need repairing.`, kind: 'crisis', urgent: true });
}

/* ---------- Every evening ---------- */
/* Guests suffer, Trouble grows, and a crisis that has run away blows up. Adds lines for the day report. */
function runCrises(events) {
  for (const c of [...S.crises]) {
    const def = CRISES[c.key];
    if (c.skipNight) { c.skipNight = false; continue; }
    c.daysOpen++;
    const hit = Math.round(def.mood * (0.5 + c.trouble / 100));
    if (hit && S.guests.length) crisisMood(-hit);
    c.trouble = clamp(c.trouble + crisisGrowth(def), 0, 100);
    if (c.trouble >= 100) { blowUpCrisis(c, events); continue; }
    events.push({ text: `Crisis, ${def.name}: still going. Trouble ${c.trouble}, progress ${c.fix}.` });
  }
}

/* ---------- What people say ---------- */
/* Up to three voices for the Crisis page: a guest or two and the person from the team who knows most about it. What they say follows how bad it is. */
function crisisVoices(c) {
  const def = CRISES[c.key], level = c.trouble < 35 ? 0 : c.trouble < 70 ? 1 : 2, out = [];
  if (!c.cast) {
    const guests = crisisShuffle(S.guests).slice(0, 2).map(g => ({ name: g.name, gender: (g.party && g.party.members[0] && g.party.members[0].gender) || 'f' }));
    while (guests.length < 2) { const p = drawPerson(); guests.push({ name: p.name, gender: p.gender }); }
    c.cast = guests;
  }
  c.cast.forEach((g, i) => out.push({ kind: 'guest', name: g.name, gender: g.gender, text: def.voices.guest[level][i % 2] }));
  const pool = S.staff.filter(s => s.role === def.staffVoice && s.sickDays === 0), s = pool.sort((a, b) => b.skill - a.skill)[0] || S.staff.filter(x => x.sickDays === 0)[0];
  if (s) out.push({ kind: 'staff', name: s.name, staffId: s.id, gender: s.gender, text: def.voices.staff[level][(c.id + c.day) % 2], trait: s.trait });
  return out;
}
