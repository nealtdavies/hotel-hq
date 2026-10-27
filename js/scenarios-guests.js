'use strict';

/* ---------- Guest behaviour, welfare and requests (see scenarios.js for the format) ---------- */
const hasReadyRoom = c => S.rooms.some(r => isReady(r) && (!c.room || r.id !== c.room.id));
const firstReady = c => S.rooms.find(r => isReady(r) && (!c.room || r.id !== c.room.id));

SCENARIOS.push(
  {
    id: 'trashed-room', cat: 'Guest behaviour', sev: 'Serious', img: 'trashed-room', title: 'Room trashed', needs: ['guest'], minDay: 2, w: 2,
    imgFor: c => (c.room ? roomTrashedPath(c.room) : null),   // shows the actual room, trashed
    imgPrompt: 'Photorealistic hotel room completely trashed: bedding on the floor, smashed lamp, overturned chair, spilled drinks on the carpet, daylight from the window',
    text: ['Housekeeping have found {room} in a terrible state. {guest} has thrown bedding on the floor, smashed a lamp and spilled drinks across the carpet.',
      'A cleaner reports that {room} has been wrecked. Furniture is overturned, the mirror is cracked and there are stains on the walls.',
      'Noise complaints led staff to {room}. {guest} has left it with broken furniture and food ground into the carpet.'],
    init: () => ({ repair: rndRange(160, 420), fine: rndRange(100, 250) }),
    stages: [
      {
        prompt: 'Step 1 of 2: the room. The damage will cost about £{d.repair} to put right.',
        options: [
          { label: 'Get {s} to clean and {s2} to repair', staff: ['Housekeeper', 'Maintenance'], cost: c => Math.round(c.d.repair * 0.6),
            hint: c => `Parts ${money(Math.round(c.d.repair * 0.6))}. The room stays in service.`,
            run: () => '{s} cleared the mess and {s2} repaired the damage. The room is back in order.' },
          { label: c => `Hire a contractor to clean and repair (${money(Math.round(c.d.repair * 1.5))})`, cost: c => Math.round(c.d.repair * 1.5),
            hint: 'Costs more but needs no staff.', run: () => 'A contractor restored the room the same day.' },
          { label: 'Leave it for now', hint: 'The room will be out of service after the guest leaves, until repaired.',
            run: (c, A) => { A.damageRoom(c.room, c.d.repair); return 'You close the room off once the guest has gone. A repair job has been added to Tasks.'; } }
        ]
      },
      {
        prompt: 'Step 2 of 2: {guest}. What do you do?', when: c => !!c.guest,
        options: [
          { label: 'a) Evict {guest}', hint: 'No refund. They may leave a bad review.',
            run: (c, A) => { const g = c.guest; A.evict(g); if (A.roll(0.5)) A.review(2, 'Thrown out of the hotel without a proper discussion.', g.name); return `${g.name} was escorted out of the hotel.`; } },
          { label: c => `b) Fine {guest} ${money(c.d.fine)}`, hint: 'They might refuse to pay.',
            run: (c, A) => { if (A.roll(0.7)) { A.earn(c.d.fine, 'Fine paid by guest'); A.mood(c.guest, -10); return '{guest} grumbled but paid the fine.'; } A.mood(c.guest, -30); A.review(2, 'Unfair fine, terrible service.', c.guest.name); return '{guest} refused to pay and left an angry review.'; } },
          { label: 'c) Give {guest} a formal warning', hint: 'Free, but the damage is not recovered.',
            run: (c, A) => { A.mood(c.guest, -8); return '{guest} was given a written warning and apologised.'; } },
          { label: 'd) Call the police', hint: 'The outcome is uncertain.',
            run: (c, A) => {
              const g = c.guest;
              if (A.roll(0.6)) { A.earn(c.d.repair, 'Damages recovered'); A.evict(g); return 'The police attended. They made sure the damage was paid for and the guest left.'; }
              A.evict(g); A.review(2, 'Police called to the hotel. Not a nice atmosphere.');
              return 'The police attended but nothing could be recovered. Other guests saw the commotion.';
            } }
        ]
      }
    ],
    ignore: (c, A) => { if (c.room && !c.room.damaged) A.damageRoom(c.room, c.d.repair); if (c.guest) A.mood(c.guest, 5); }
  },
  {
    id: 'baboon-break-in', cat: 'Guest welfare', sev: 'Urgent', img: 'baboon-break-in', title: 'Wild baboon in the room', needs: ['guest:Standard'], minDay: 3, w: 0.8,
    imgFor: c => (c.room ? roomDamagePath(c.room, 'baboon') : null),   // shows the actual room with the baboon in it
    imgPrompt: 'Photorealistic hotel room where a large wild baboon sits on the bed eating a bag of crisps, muddy paw prints across white bedding and the floor, scattered fruit and a spilled bag, two frightened guests standing near the wall, sliding balcony door open, bright daylight',
    init: () => ({ repair: rndRange(120, 300) }),
    text: ['Screams from {room}: a wild baboon has wandered in through the open balcony door, ripped open a bag of food and left muddy paw prints across the bed. {guest} is frightened.',
      'A baboon from the gardens has climbed onto the balcony of {room} and is now sitting on the bed raiding {guest}\'s snacks. It is not leaving.'],
    stages: [
      {
        prompt: 'Step 1 of 2: the animal. {guest} is standing by the wall, keeping very still.',
        options: [
          { label: 'Call the wildlife rescue team', hint: 'Free. Professionals, but they may take a while.',
            run: (c, A) => { if (A.roll(0.85)) { A.mood(c.guest, 6); return 'The rescue team arrived quickly and led the baboon out calmly. Nobody was hurt.'; } A.mood(c.guest, -8); c.d.repair += 60; return 'The team took an hour to arrive and the baboon made even more mess in the meantime.'; } },
          { label: 'Send {s} to scare it away with a loud noise', staff: 'Maintenance', hint: 'A more experienced person is more likely to succeed. Risk of a scratch.',
            run: (c, A, st) => { if (A.roll(0.5 + 0.1 * st.skill)) { A.mood(c.guest, 8); return '{s} banged a pan and the baboon bolted over the balcony.'; } A.sick(st, 1); A.mood(c.guest, -12); c.d.repair += 80; return 'The baboon grabbed a cushion and lashed out. {s} was scratched and had to go home to recover.'; } },
          { label: 'Move {guest} to another room at once', when: hasReadyRoom, whenText: 'No other room is ready', hint: 'Safe for the guest. The animal stays for now.',
            run: (c, A) => { const nr = firstReady(c); if (nr && A.moveGuest(c.guest, nr)) { A.mood(c.guest, 4); return '{first} was moved safely to another room while the wildlife team was called.'; } return 'No other room was available after all.'; } },
          { label: 'Tell {guest} to wait quietly until it leaves', hint: 'Free, but risky and stressful.',
            run: (c, A) => { A.mood(c.guest, -15); c.d.repair += 100; return 'The baboon ate everything it could find, tore a pillow open and finally left an hour later.'; } }
        ]
      },
      {
        prompt: 'Step 2 of 2: the aftermath. The room needs about £{d.repair} of cleaning and repair, and {guest} is shaken.', when: c => !!c.room,
        options: [
          { label: 'Get {s} to clean and {s2} to repair, plus a free dinner for {guest}', staff: ['Housekeeper', 'Maintenance'], cost: c => Math.round(c.d.repair * 0.6) + 40,
            hint: c => `Parts and dinner ${money(Math.round(c.d.repair * 0.6) + 40)}. Room back in service.`,
            run: (c, A) => { A.mood(c.guest, 20); return '{s} and {s2} had the room spotless again, and {first} enjoyed a quiet dinner on the house.'; } },
          { label: c => `Hire a contractor and refund tonight's stay (${money(Math.round(c.d.repair * 1.5))} plus refund)`, cost: c => Math.round(c.d.repair * 1.5),
            hint: 'The most generous option. No staff needed.',
            run: (c, A) => { A.refund(c.guest, 1); A.mood(c.guest, 25); A.review(5, 'A baboon in our room, but the hotel handled it brilliantly.', c.guest.name); return 'A contractor restored the room and {first} was delighted with the refund.'; } },
          { label: 'Apologise and close the room until it is repaired', hint: 'A repair job is added to Tasks. The guest is not impressed.',
            run: (c, A) => { A.damageRoom(c.room, c.d.repair, 'baboon'); A.mood(c.guest, -5); return 'You apologise sincerely and close the room off. A repair job has been added to Tasks.'; } }
        ]
      }
    ],
    ignore: (c, A) => { if (c.room && !c.room.damaged) A.damageRoom(c.room, c.d.repair, 'baboon'); if (c.guest) { A.mood(c.guest, -25); A.review(1, 'A baboon wrecked our room and no one helped.', c.guest.name); } }
  },
  {
    id: 'lion-break-in', cat: 'Guest welfare', sev: 'Urgent', img: 'lion-break-in', title: 'Lion in the room', needs: ['guest:Ocean View'], minDay: 5, w: 0.5,
    imgFor: c => (c.room ? roomDamagePath(c.room, 'lion') : null),   // shows the actual room with the lion in it
    imgPrompt: 'Photorealistic hotel room with a large adult male lion standing between the beds, muddy paw prints across white bedding and the floor, torn throw blanket, scattered belongings, balcony doors open onto the ocean, bright daylight',
    init: () => ({ repair: rndRange(250, 550) }),
    text: ['A wild lion has padded in through the open balcony door of {room} and is prowling between the beds. {guest} has locked themselves in the bathroom.',
      'Panic on the ocean-view floor: a lion has wandered into {room} and is lying on the bed. {guest} is hiding behind the door and has phoned reception.'],
    stages: [
      {
        prompt: 'Step 1 of 2: the lion. Everyone\'s safety comes first.',
        options: [
          { label: 'Evacuate the floor and call the emergency wildlife team', hint: 'The safest choice. Free, but guests are inconvenienced.',
            run: (c, A) => { A.moodAll(-3, 'evacuation'); if (A.roll(0.95)) { A.mood(c.guest, 6); return 'The wildlife team arrived fast, calmed the lion and led it safely away. Nobody was hurt.'; } c.d.repair += 100; return 'The team took hours to arrive and the lion wrecked even more of the room in the meantime.'; } },
          { label: 'Tell {guest} to stay locked in the bathroom while the zoo team is called', hint: 'Free. Reasonably safe, but frightening for the guest.',
            run: (c, A) => { if (A.roll(0.8)) { A.mood(c.guest, -8); return 'The zoo team collected the lion about an hour later. {first} was very shaken but safe.'; } A.mood(c.guest, -20); c.d.repair += 120; return 'The lion stayed for hours and shredded half the room before the zoo team arrived.'; } },
          { label: 'Send {s} to shoo it away', staff: 'Maintenance', hint: 'Extremely dangerous. Nobody should ever approach a lion.',
            run: (c, A, st) => { A.sick(st, 3); A.mood(c.guest, -25); c.d.repair += 150; return '{s} backed away much faster than they went in, and needs a few days to recover from the shock. The wildlife team had to be called anyway.'; } },
          { label: 'Ignore it and hope it leaves', hint: 'Free, and a terrible idea.',
            run: (c, A) => { A.mood(c.guest, -40); c.d.repair += 150; A.review(1, 'A lion in our room and the hotel did nothing.', c.guest.name); return 'The lion eventually wandered off, leaving a wrecked room and a furious guest.'; } }
        ]
      },
      {
        prompt: 'Step 2 of 2: the aftermath. The room needs about £{d.repair} of cleaning and repair, and {guest} is badly shaken.', when: c => !!c.room,
        options: [
          { label: 'Get {s} to clean and {s2} to repair, plus a free dinner for {guest}', staff: ['Housekeeper', 'Maintenance'], cost: c => Math.round(c.d.repair * 0.6) + 40,
            hint: c => `Parts and dinner ${money(Math.round(c.d.repair * 0.6) + 40)}. Room back in service.`,
            run: (c, A) => { A.mood(c.guest, 18); return '{s} and {s2} restored the room and {first} was treated to a quiet dinner on the house.'; } },
          { label: c => `Hire a contractor and refund the whole stay (${money(Math.round(c.d.repair * 1.5))} plus refund)`, cost: c => Math.round(c.d.repair * 1.5),
            hint: 'The most generous option. No staff needed.',
            run: (c, A) => { A.refund(c.guest, c.guest.left); A.mood(c.guest, 30); A.review(5, 'A lion in our room, but the hotel looked after us wonderfully.', c.guest.name); return 'A contractor restored the room. {first} accepted the full refund with a shaky smile.'; } },
          { label: 'Apologise and close the room until it is repaired', hint: 'A repair job is added to Tasks. The guest is not impressed.',
            run: (c, A) => { A.damageRoom(c.room, c.d.repair, 'lion'); A.mood(c.guest, -5); return 'You apologise sincerely and close the room off. A repair job has been added to Tasks.'; } }
        ]
      }
    ],
    ignore: (c, A) => { if (c.room && !c.room.damaged) A.damageRoom(c.room, c.d.repair, 'lion'); if (c.guest) { A.mood(c.guest, -40); A.review(1, 'A lion wrecked our room and no one helped.', c.guest.name); } }
  },
  {
    id: 'feral-cats', cat: 'Guest welfare', sev: 'Serious', img: 'feral-cats', title: 'Feral cats in the family suite', needs: ['guest:Family'], minDay: 4, w: 0.7,
    imgFor: c => (c.room ? roomDamagePath(c.room, 'cats') : null),   // shows the actual suite with the cats in it
    imgPrompt: 'Photorealistic family hotel suite overrun by about ten feral street cats climbing over the beds and furniture, paw prints on white bedding, spilled food and toys scattered, terrace doors open to the ocean, bright daylight',
    init: () => ({ repair: rndRange(100, 260) }),
    text: ['A gang of feral street cats has slipped in through the open terrace doors of {room} and is swarming over the beds. {guest} is trying to protect the luggage and the children\'s toys.',
      'Guests on the terrace floor report a stream of stray cats heading into {room}. Inside, they are on the beds, in the cot and knocking everything off the tables.'],
    stages: [
      {
        prompt: 'Step 1 of 2: the cats. There are a lot of them, and they are very quick.',
        options: [
          { label: 'Call the animal rescue charity', hint: 'Free. Kind and professional, but they may take a while.',
            run: (c, A) => { if (A.roll(0.85)) { A.mood(c.guest, 5); return 'The rescuers gathered the cats gently with treats and took them to a shelter. Not a single scratch.'; } A.mood(c.guest, -8); c.d.repair += 60; return 'It took the rescuers hours to arrive, and the cats made even more mess in the meantime.'; } },
          { label: 'Ask {s} to coax them out with a trail of food', staff: 'Housekeeper', hint: 'Cheap and gentle. A more skilled member of staff is more likely to succeed.',
            run: (c, A, st) => { if (A.roll(0.55 + 0.1 * st.skill)) { A.mood(c.guest, 8); return '{s} laid a trail of tuna along the terrace and the whole gang followed it out.'; } A.mood(c.guest, -10); c.d.repair += 70; return 'The cats ignored the trail, stole the food and scattered into every corner of the suite.'; } },
          { label: 'Open every door and let them leave on their own', hint: 'Free. They might not all go.',
            run: (c, A) => { if (A.roll(0.6)) { A.mood(c.guest, -3); return 'After a lot of yowling, the cats trickled out of the terrace and over the wall.'; } A.mood(c.guest, -12); c.d.repair += 80; return 'Half the cats stayed on the beds and one hid under the sofa until the evening.'; } },
          { label: 'Keep the friendliest cat as the hotel cat and shoo the rest', hint: 'Free. Adorable, but there will be a mess.',
            run: (c, A) => { A.mood(c.guest, 10); c.d.repair += 80; A.review(5, 'The children loved meeting the hotel cat.', c.guest.name); return 'The children adored the ginger cat, who has now taken up residence behind reception. The rest were shooed out.'; } },
          { label: 'Ignore it and hope they leave', hint: 'Free, but the mess and the fleas will be bad.',
            run: (c, A) => { A.mood(c.guest, -25); c.d.repair += 120; A.review(1, 'Our room was overrun by stray cats and the hotel did nothing.', c.guest.name); return 'The cats left when the food ran out, and left fleas and a wrecked room behind.'; } }
        ]
      },
      {
        prompt: 'Step 2 of 2: the aftermath. The suite needs about £{d.repair} of cleaning and repair, plus a flea treatment.', when: c => !!c.room,
        options: [
          { label: 'Get {s} to clean and {s2} to repair, plus a flea treatment', staff: ['Housekeeper', 'Maintenance'], cost: c => Math.round(c.d.repair * 0.6) + 60,
            hint: c => `Parts and flea treatment ${money(Math.round(c.d.repair * 0.6) + 60)}. Suite back in service.`,
            run: (c, A) => { A.mood(c.guest, 14); return '{s} and {s2} deep-cleaned the suite and treated it for fleas. {first} is relieved.'; } },
          { label: c => `Hire a pest and cleaning contractor and refund a night (${money(Math.round(c.d.repair * 1.5))} plus refund)`, cost: c => Math.round(c.d.repair * 1.5),
            hint: 'The most generous option. No staff needed.',
            run: (c, A) => { A.refund(c.guest, 1); A.mood(c.guest, 22); A.review(5, 'A very unusual stay, but the hotel looked after us brilliantly.', c.guest.name); return 'A specialist team restored the suite and {first} accepted the refund with a laugh.'; } },
          { label: 'Apologise and close the suite until it is repaired', hint: 'A repair job is added to Tasks. The guest is not impressed.',
            run: (c, A) => { A.damageRoom(c.room, c.d.repair, 'cats'); A.mood(c.guest, -5); return 'You apologise sincerely and close the suite off. A repair job has been added to Tasks.'; } }
        ]
      }
    ],
    ignore: (c, A) => { if (c.room && !c.room.damaged) A.damageRoom(c.room, c.d.repair, 'cats'); if (c.guest) { A.mood(c.guest, -25); A.review(1, 'Stray cats wrecked our room and no one helped.', c.guest.name); } }
  },
  {
    id: 'frenchie-break-in', cat: 'Guest welfare', sev: 'Serious', img: 'frenchie-break-in', title: 'Escaped French bulldogs in the suite', needs: ['guest:Luxury Suite'], minDay: 4, w: 0.7,
    imgFor: c => (c.room ? roomDamagePath(c.room, 'frenchies') : null),   // shows the actual suite full of bulldogs
    imgPrompt: 'Photorealistic luxury hotel suite overrun by about eight escaped French bulldogs getting into silly trouble: one stuck behind the sofa, one with its head in a waste bin, others bouncing on the bed, cushions and papers everywhere, terrace doors open to the ocean, bright daylight',
    init: () => ({ repair: rndRange(100, 300) }),
    text: ['A gang of French bulldogs has escaped from a local breeder and trotted straight into {room}. Some are on the bed, one is stuck behind the sofa and another has its head in the waste bin. {guest} cannot stop laughing.',
      'Snuffling and snorting at the door of {room}: about eight French bulldogs have burst in from the beach path. One is wedged under the sofa, one is lying on the minibar and one is stuck in a cushion. {guest} has phoned reception, half in panic and half in giggles.'],
    stages: [
      {
        prompt: 'Step 1 of 2: the dogs. French bulldogs are very sweet and very, very silly.',
        options: [
          { label: 'Phone the breeder and ask them to collect the dogs', hint: 'Free. The breeder knows how to handle them.',
            run: (c, A) => { if (A.roll(0.85)) { A.mood(c.guest, 8); return 'The breeder rushed over with a bag of treats and the whole snorting gang trotted out behind them in a line.'; } A.mood(c.guest, -3); c.d.repair += 60; return 'The breeder was away on a dog show and the dogs had hours more fun in the meantime.'; } },
          { label: 'Ask {s} to round them up gently with treats and towels', staff: 'Housekeeper', hint: 'A more skilled member of staff is more likely to catch them all.',
            run: (c, A, st) => { if (A.roll(0.55 + 0.1 * st.skill)) { A.mood(c.guest, 10); return '{s} rattled a treat bag and the bulldogs queued up to be carried out one by one.'; } A.mood(c.guest, 2); c.d.repair += 70; return 'Every time {s} caught one, another ran off with a cushion. It was very funny and very messy.'; } },
          { label: 'Send {s} to free the stuck ones', staff: 'Maintenance', hint: 'One dog is wedged behind the sofa and another has its head in the bin.',
            run: (c, A, st) => { if (A.roll(0.6 + 0.08 * st.skill)) { A.mood(c.guest, 12); return '{s} gently slid the sofa out, popped the bin off a very snuffly head and had every dog freed within minutes.'; } c.d.repair += 100; A.mood(c.guest, 0); return 'The sofa moved, the bin rolled away, and a dog bolted into the wardrobe. {s} spent an hour coaxing it out.'; } },
          { label: 'Let {guest} enjoy a puppy party', hint: 'Free. Wonderful for the guest, but it will cost you a clean-up.',
            run: (c, A) => { A.mood(c.guest, 22); c.d.repair += 140; A.review(5, 'We were visited by eight French bulldogs. Best hotel stay ever!', c.guest.name); return '{first} spent the afternoon cuddling bulldogs and posting photos. The suite is a disaster, but the review is glowing.'; } },
          { label: 'Ignore it and hope they leave', hint: 'Free, but the dogs are not going anywhere on their own.',
            run: (c, A) => { A.mood(c.guest, -12); c.d.repair += 120; A.review(2, 'Dogs everywhere and nobody came to help.', c.guest.name); return 'The dogs wandered about for hours, chewing cushions and leaving a very big mess.'; } }
        ]
      },
      {
        prompt: 'Step 2 of 2: the aftermath. The suite needs about £{d.repair} of cleaning and repair.', when: c => !!c.room,
        options: [
          { label: 'Get {s} to clean and {s2} to repair, plus a treat basket for {guest}', staff: ['Housekeeper', 'Maintenance'], cost: c => Math.round(c.d.repair * 0.6) + 40,
            hint: c => `Parts and treats ${money(Math.round(c.d.repair * 0.6) + 40)}. Suite back in service.`,
            run: (c, A) => { A.mood(c.guest, 14); return '{s} and {s2} had the suite sparkling again, and {first} was delighted with the hotel\'s basket of chocolates.'; } },
          { label: c => `Hire a contractor and bill the breeder (${money(Math.round(c.d.repair * 1.5))} upfront)`, cost: c => Math.round(c.d.repair * 1.5),
            hint: 'The breeder may or may not reimburse you.',
            run: (c, A) => { if (A.roll(0.65)) { A.earn(Math.round(c.d.repair * 1.35), 'Breeder reimburses repairs'); return 'A contractor restored the suite, and the breeder paid the bill with a very apologetic basket of dog biscuits.'; } return 'A contractor restored the suite, but the breeder claimed the dogs were "just visiting" and refused to pay.'; } },
          { label: 'Apologise and close the suite until it is repaired', hint: 'A repair job is added to Tasks.',
            run: (c, A) => { A.damageRoom(c.room, c.d.repair, 'frenchies'); A.mood(c.guest, -3); return 'You close the suite off. A repair job has been added to Tasks.'; } }
        ]
      }
    ],
    ignore: (c, A) => { if (c.room && !c.room.damaged) A.damageRoom(c.room, c.d.repair, 'frenchies'); if (c.guest) { A.mood(c.guest, -12); A.review(2, 'Bulldogs wrecked the suite and no one came to help.', c.guest.name); } }
  },
  {
    id: 'noisy-party', cat: 'Guest behaviour', sev: 'Serious', img: 'noisy-party', title: 'Late-night party', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel corridor at night, light spilling from an open door, shoes and plastic cups on the carpet, a tired guest in pyjamas looking out',
    text: ['{guest} in {room} has friends over and the music is very loud. Neighbours are phoning reception.',
      'It is past midnight and a party is going on in {room}. Several guests have complained.'],
    options: [
      { label: 'Send {s} to ask them to keep it down', staff: 'Receptionist', run: (c, A) => { if (A.roll(0.7)) { A.mood(c.guest, -5); return '{guest} apologised and turned the music off.'; } A.moodAll(-6, 'noise'); return 'The party carried on. Neighbouring guests are furious.'; } },
      { label: 'Call the police', hint: 'Serious. Likely to end the party.', run: (c, A) => { A.mood(c.guest, -30); A.moodAll(2, 'quiet restored'); return 'The police quietened things down quickly. {guest} was not pleased.'; } },
      { label: 'Give neighbours a £40 voucher', cost: 40, hint: 'Keeps neighbours calm but does not stop the noise.', run: (c, A) => { A.moodAll(5, 'goodwill'); return 'Neighbouring guests appreciated the gesture.'; } },
      { label: 'Ignore it', run: (c, A) => { A.moodAll(-8, 'noise'); return 'It goes on until the early hours.'; } }
    ],
    ignore: (c, A) => { A.moodAll(-8, 'noise'); }
  },
  {
    id: 'smoking-room', cat: 'Guest behaviour', sev: 'Minor', img: 'smoking-room', title: 'Smoking in a non-smoking room', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel room with smoke haze, an ashtray on the windowsill and a smoke detector on the ceiling',
    text: ['The smoke alarm in {room} was triggered. Staff found {guest} smoking by the window. The whole room smells of smoke.'],
    init: () => ({ fine: rndRange(80, 150), clean: rndRange(40, 90) }),
    options: [
      { label: c => `Charge {guest} a ${money(c.d.fine)} cleaning fee`, hint: 'Guest may be annoyed.', run: (c, A) => { A.earn(c.d.fine, 'Smoking fee'); A.mood(c.guest, -12); return '{guest} paid the fee and promised not to smoke indoors again.'; } },
      { label: 'Get {s} to air and deodorise the room', staff: 'Housekeeper', cost: 15, run: (c, A) => { A.mood(c.guest, -3); return '{s} opened the windows and treated the curtains and carpet.'; } },
      { label: 'Give a verbal warning', run: (c, A) => { A.mood(c.guest, -5); return 'You remind {guest} of the rules politely.'; } },
      { label: 'Say nothing', run: (c, A) => { A.moodAll(-3, 'smoke smell'); return 'The smell drifts along the corridor.'; } }
    ],
    ignore: (c, A) => { A.moodAll(-3); }
  },
  {
    id: 'locked-out', cat: 'Guest requests', sev: 'Minor', img: 'locked-out', title: 'Locked out of the room', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel corridor late evening, a guest in dressing gown standing outside a closed door holding a key card',
    text: ['{guest} has locked themselves out of {room} wearing only a dressing gown.', '{guest} has lost their key card and cannot get into {room}.'],
    options: [
      { label: 'Send {s} with the master key', staff: 'Receptionist', run: (c, A) => { A.mood(c.guest, 8); return '{s} let {first} back in with a smile.'; } },
      { label: 'Call a locksmith (£80)', cost: 80, run: (c, A) => { A.mood(c.guest, 2); return 'The locksmith took a while but opened the door.'; } },
      { label: 'Ask them to wait until morning', run: (c, A) => { A.mood(c.guest, -25); return '{first} spent an uncomfortable night in the lounge.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -25); }
  },
  {
    id: 'lost-wallet', cat: 'Guest welfare', sev: 'Minor', img: 'lost-wallet', title: 'Lost wallet', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel room, guest anxiously searching through bedding and bags, a brown leather wallet partly visible under the bed',
    text: ['{guest} cannot find their wallet and is sure they had it in {room}.'],
    options: [
      { label: 'Get {s} to search the room', staff: 'Housekeeper', run: (c, A) => { if (A.roll(0.7)) { A.mood(c.guest, 18); A.review(5, 'The staff found my wallet. Wonderful.', c.guest.name); return '{s} found the wallet under the bed. {first} is delighted.'; } A.mood(c.guest, -4); return 'The wallet was not in the room.'; } },
      { label: 'Check the lobby cameras with {s}', staff: 'Receptionist', run: (c, A) => { if (A.roll(0.5)) { A.mood(c.guest, 15); return 'The cameras show {first} left it on a chair in the lounge. Wallet returned.'; } A.mood(c.guest, -5); return 'Nothing useful on the footage.'; } },
      { label: 'Say you are sorry but cannot help', run: (c, A) => { A.mood(c.guest, -15); return '{first} is unimpressed.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -15); }
  },
  {
    id: 'theft-claim', cat: 'Guest behaviour', sev: 'Serious', img: 'theft-claim', title: 'Theft allegation', needs: ['guest'], minDay: 3,
    imgPrompt: 'Photorealistic hotel room with an open empty laptop bag on the bed and an upset guest talking to a receptionist at the door',
    text: ['{guest} says a laptop has been stolen from {room} and is blaming the hotel.'],
    init: () => ({ comp: rndRange(150, 320) }),
    options: [
      { label: 'Investigate with {s}', staff: 'Receptionist', run: (c, A) => { if (A.roll(0.5)) { A.mood(c.guest, 10); return '{s} found the laptop in {first}\'s own luggage. No harm done, just a red face.'; } A.mood(c.guest, -10); return 'Nothing turned up. {first} is still upset.'; } },
      { label: 'Call the police', run: (c, A) => { if (A.roll(0.55)) { A.mood(c.guest, 5); return 'The police checked and the laptop turned up in the boot of a car. Mystery solved.'; } A.mood(c.guest, -10); A.review(2, 'Police at the hotel. Awkward.', c.guest.name); return 'The police could not find anything. The atmosphere is tense.'; } },
      { label: c => `Offer compensation (${money(c.d.comp)})`, cost: c => c.d.comp, hint: 'Keeps the guest happy but is expensive.', run: (c, A) => { A.mood(c.guest, 25); return '{first} accepted the offer gratefully.'; } },
      { label: 'Deny responsibility', run: (c, A) => { A.mood(c.guest, -30); if (A.roll(0.5)) A.review(1, 'The hotel refused to help with a theft.', c.guest.name); return '{first} storms off to write a review.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -30); A.review(1, 'Ignored my complaint completely.', c.guest ? c.guest.name : undefined); }
  },
  {
    id: 'card-declined', cat: 'Guest behaviour', sev: 'Minor', img: 'card-declined', title: 'Payment problem', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel reception desk, a card payment terminal showing declined, a guest looking embarrassed, receptionist calm',
    text: ['{guest} is trying to settle their bill but the card has been declined.'],
    init: g => ({ bill: rndRange(90, 220) }),
    options: [
      { label: 'Ask {s} to politely request another payment method', staff: 'Receptionist', run: (c, A) => { if (A.roll(0.7)) { A.earn(c.d.bill, 'Bill paid'); return '{first} found another card and paid in full.'; } A.mood(c.guest, -10); return '{first} promised to pay later. Nothing was collected.'; } },
      { label: 'Let them pay tomorrow', run: (c, A) => { if (A.roll(0.6)) { A.earn(c.d.bill, 'Late payment received'); return '{first} paid the next morning.'; } A.evict(c.guest); return '{first} left in the night without paying.'; } },
      { label: 'Evict {guest}', run: (c, A) => { A.evict(c.guest); return '{first} was asked to leave.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -5); }
  },
  {
    id: 'late-checkout', cat: 'Guest requests', sev: 'Minor', img: 'late-checkout', title: 'Late checkout request', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel reception, guest with suitcase asking the receptionist a question, clock showing near midday',
    text: ['{guest} asks if they can have a late checkout at 3pm.'],
    options: [
      { label: 'Allow it free of charge', run: (c, A) => { A.mood(c.guest, 12); return '{first} thanks you warmly.'; } },
      { label: 'Charge £30', run: (c, A) => { A.earn(30, 'Late checkout fee'); A.mood(c.guest, 2); return '{first} pays without complaint.'; } },
      { label: 'Politely refuse', run: (c, A) => { A.mood(c.guest, -8); return '{first} is a little disappointed.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -6); }
  },
  {
    id: 'upgrade-request', cat: 'Guest requests', sev: 'Minor', img: 'upgrade-request', title: 'Room upgrade request', needs: ['guest'],
    when: () => S.rooms.some(r => r.type === 'Luxury Suite' && isReady(r)),
    imgPrompt: 'Photorealistic luxurious hotel suite with a lounge area, large bed and city view at golden hour',
    text: ['{guest} asks whether they could be upgraded to a luxury suite for the rest of the stay.'],
    options: [
      { label: 'Upgrade to a luxury suite free of charge', hint: 'The guest will love it.', when: () => S.rooms.some(r => r.type === 'Luxury Suite' && isReady(r)), whenText: 'No luxury suite free',
        run: (c, A) => { const suite = S.rooms.find(r => r.type === 'Luxury Suite' && isReady(r)); if (suite && A.moveGuest(c.guest, suite)) { A.mood(c.guest, 25); if (A.roll(0.5)) A.review(5, 'A free upgrade. Wonderful hotel.', c.guest.name); return '{first} is thrilled with the suite.'; } return 'The suite was no longer available.'; } },
      { label: 'Upgrade to a luxury suite for £50 extra', when: () => S.rooms.some(r => r.type === 'Luxury Suite' && isReady(r)), whenText: 'No luxury suite free',
        run: (c, A) => { const suite = S.rooms.find(r => r.type === 'Luxury Suite' && isReady(r)); if (suite && A.moveGuest(c.guest, suite)) { A.earn(50, 'Upgrade fee'); A.mood(c.guest, 10); return '{first} happily pays the supplement.'; } return 'The suite was no longer available.'; } },
      { label: 'Politely refuse', run: (c, A) => { A.mood(c.guest, -5); return '{first} understands.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -5); }
  },
  {
    id: 'pet-smuggled', cat: 'Guest behaviour', sev: 'Minor', img: 'pet-smuggled', title: 'Unexpected pet', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel room with a small dog sitting on the bed, a no-pets sign visible on the door, guest looking caught out',
    text: ['Housekeeping heard barking from {room}. {guest} has smuggled in a dog, which is against the rules.'],
    init: () => ({ fee: rndRange(30, 60) }),
    options: [
      { label: c => `Charge a ${money(c.d.fee)} pet fee`, run: (c, A) => { A.earn(c.d.fee, 'Pet fee'); A.mood(c.guest, 3); if (A.roll(0.25)) A.damageRoom(c.room, 90); return '{first} pays the fee. The dog is allowed to stay.'; } },
      { label: 'Arrange a kennel for the dog (£30)', cost: 30, run: (c, A) => { A.mood(c.guest, -8); return 'The dog goes to a local kennel and {first} is not delighted.'; } },
      { label: 'Evict {guest}', run: (c, A) => { A.evict(c.guest); if (A.roll(0.4)) A.review(2, 'Thrown out because of a tiny dog.'); return '{first} leaves with the dog.'; } },
      { label: 'Look the other way', run: (c, A) => { if (A.roll(0.4)) { A.damageRoom(c.room, 120); return 'The dog chewed the furniture. The room is damaged.'; } return 'Nothing happens, this time.'; } }
    ],
    ignore: (c, A) => { if (A.roll(0.4)) A.damageRoom(c.room, 120); }
  },
  {
    id: 'lost-pet', cat: 'Guest welfare', sev: 'Serious', img: 'lost-pet', title: 'Lost pet', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel garden at dusk, a worried guest calling for a pet near hedges, a hotel staff member with a torch searching',
    init: () => ({ pet: pick(['dog', 'cat', 'rabbit', 'parrot']) }),
    text: ['{guest} is in tears: their {d.pet} has gone missing from {room} and may have slipped out of the hotel.',
      'The door to {room} was left open and {guest}\'s {d.pet} has escaped. It could be anywhere.'],
    options: [
      { label: 'Send {s} to search the grounds', staff: 'Receptionist', run: (c, A) => { if (A.roll(0.7)) { A.mood(c.guest, 30); A.review(5, 'They found my {d.pet}! The staff were wonderful.'.replace('{d.pet}', c.d.pet), c.guest.name); return '{s} found the {d.pet} hiding behind a bin. {first} is overjoyed.'; } A.mood(c.guest, -5); return 'The search found nothing so far.'; } },
      { label: 'Make an announcement and ask all guests to help', run: (c, A) => { if (A.roll(0.55)) { A.mood(c.guest, 22); A.moodAll(3, 'community spirit'); return 'A group of guests found the {d.pet} in the car park. A cheer went up in the lobby.'; } A.moodAll(-2, 'disturbance'); A.mood(c.guest, -3); return 'Guests helped but the {d.pet} is still missing.'; } },
      { label: 'Call the local animal warden', run: (c, A) => { if (A.roll(0.5)) { A.mood(c.guest, 18); return 'The warden located the {d.pet} two streets away and brought it back.'; } A.mood(c.guest, -3); return 'The warden promised to call back.'; } },
      { label: 'Tell them to search themselves', run: (c, A) => { A.mood(c.guest, -25); A.review(2, 'The hotel would not help me find my pet.', c.guest.name); return '{first} is upset and thinks the hotel does not care.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -30); A.review(1, 'No help at all when my pet went missing.', c.guest.name); }
  },
  {
    id: 'guest-unwell', cat: 'Guest welfare', sev: 'Serious', img: 'guest-unwell', title: 'Guest feels unwell', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel room, guest sitting on the bed looking pale holding a glass of water, a concerned receptionist at the door',
    text: ['{guest} calls reception feeling dizzy and unwell.'],
    options: [
      { label: 'Send {s} with water, tea and to check on them', staff: 'Receptionist', run: (c, A) => { A.mood(c.guest, 8); return '{s} sat with {first} until they felt better.'; } },
      { label: 'Call a doctor (£60)', cost: 60, run: (c, A) => { A.mood(c.guest, 18); A.review(5, 'Excellent care when I was ill.', c.guest.name); return 'The doctor reassured everyone and {first} felt much better.'; } },
      { label: 'Call an ambulance', hint: 'Always right if serious. Free, but some disruption.', run: (c, A) => { A.mood(c.guest, 12); return 'The paramedics checked {first} and took them for a precautionary check-up.'; } },
      { label: 'Let them rest alone', run: (c, A) => { A.mood(c.guest, -15); if (A.roll(0.25)) A.review(1, 'No one checked on me when I was ill.', c.guest.name); return 'Nobody checked on {first} and the night was a long one.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -20); }
  },
  {
    id: 'bedbug-claim', cat: 'Guest welfare', sev: 'Serious', img: 'bedbug-claim', title: 'Bed bug allegation', needs: ['guest'], minDay: 3,
    imgPrompt: 'Photorealistic hotel bed with the mattress pulled back as a housekeeper inspects the seams with a torch',
    text: ['{guest} says they were bitten overnight and suspects bed bugs in {room}.'],
    options: [
      { label: 'Get {s} to inspect the room', staff: 'Housekeeper', run: (c, A, st) => { if (A.roll(0.75)) { A.mood(c.guest, 5); return '{s} checked thoroughly and found nothing. {first} calms down.'; } A.pay(150, 'Pest treatment'); A.mood(c.guest, 5); return '{s} found evidence of bed bugs. The room is treated at once.'; } },
      { label: 'Move {guest} to another room', when: hasReadyRoom, whenText: 'No free room', run: (c, A) => { const nr = firstReady(c); if (nr && A.moveGuest(c.guest, nr)) { A.mood(c.guest, 12); return '{first} was moved at once and is relieved.'; } return 'No room was free after all.'; } },
      { label: 'Call pest control (£150)', cost: 150, run: (c, A) => { A.mood(c.guest, 15); return 'The specialists found nothing alarming but inspected everywhere.'; } },
      { label: 'Dismiss it', run: (c, A) => { A.mood(c.guest, -25); A.review(1, 'The hotel dismissed my bed bug complaint.', c.guest.name); return '{first} is furious.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -25); A.review(1, 'Possible bed bugs and no reply.', c.guest ? c.guest.name : undefined); }
  },
  {
    id: 'extend-stay', cat: 'Guest requests', sev: 'Minor', img: 'extend-stay', title: 'Guest wants to stay longer', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel reception, happy guest in smart casual clothes speaking with the receptionist, bright lobby',
    text: ['{guest} is enjoying the hotel and asks to extend their stay by two nights.'],
    options: [
      { label: 'Extend at the normal rate', run: (c, A) => { c.guest.left += 2; c.guest.nights += 2; A.mood(c.guest, 8); A.note('Stay extended by 2 nights', 'good'); return 'Two more nights. {first} is happy.'; } },
      { label: 'Extend with 10% discount', run: (c, A) => { c.guest.left += 2; c.guest.nights += 2; c.guest.price = Math.round(c.guest.price * 0.9); A.mood(c.guest, 15); A.note('Stay extended by 2 nights', 'good'); return 'A discount makes {first} even happier.'; } },
      { label: 'Say the room is booked', run: (c, A) => { A.mood(c.guest, -4); return '{first} accepts it.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -4); }
  },
  {
    id: 'neighbour-dispute', cat: 'Guest behaviour', sev: 'Minor', img: 'neighbour-dispute', title: 'Neighbour dispute', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel corridor, two guests in dressing gowns talking in raised voices near adjoining doors',
    text: ['{guest} complains that the guests next door are talking loudly in the corridor.'],
    options: [
      { label: 'Move {guest} to a quieter room', when: hasReadyRoom, whenText: 'No free room', run: (c, A) => { const nr = firstReady(c); if (nr && A.moveGuest(c.guest, nr)) { A.mood(c.guest, 10); return '{first} is moved to a quiet room.'; } return 'No room was free after all.'; } },
      { label: 'Ask {s} to speak with the neighbours', staff: 'Receptionist', run: (c, A) => { A.mood(c.guest, 6); return '{s} had a polite word. The corridor is quiet.'; } },
      { label: 'Offer a £30 discount', cost: 30, run: (c, A) => { A.mood(c.guest, 10); return '{first} appreciates the gesture.'; } },
      { label: 'Do nothing', run: (c, A) => { A.mood(c.guest, -10); return '{first} grumbles.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -10); }
  },
  {
    id: 'proposal', cat: 'Guest requests', sev: 'Minor', img: 'proposal', title: 'A surprise proposal', needs: ['guest'],
    imgPrompt: 'Photorealistic romantic hotel restaurant table with candles, rose petals and sparkling juice on a white tablecloth',
    text: ['{guest} confides that they plan to propose to their partner this evening and asks for help making it special.'],
    options: [
      { label: 'Arrange a candlelit dinner with {s} (£80)', staff: 'Chef', cost: 80, run: (c, A) => { A.mood(c.guest, 30); A.review(5, 'The proposal was perfect. They said yes!', c.guest.name); return 'It was magical. Everyone clapped when the answer was yes.'; } },
      { label: 'Sparkling juice and flowers to the room (£50)', cost: 50, run: (c, A) => { A.mood(c.guest, 18); return 'A lovely touch. {first} is grateful.'; } },
      { label: 'Wish them luck', run: (c, A) => { A.mood(c.guest, 5); return 'You wish {first} the best of luck.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -5); }
  },
  {
    id: 'birthday', cat: 'Guest requests', sev: 'Minor', img: 'birthday', title: 'It is a guest\'s birthday', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel room with a small birthday cake with a candle on a tray and a handwritten card, soft evening light',
    text: ['It is {guest}\'s birthday today. They have mentioned it at reception.'],
    options: [
      { label: 'Ask {s} to bake a cake (£25)', staff: 'Chef', cost: 25, run: (c, A) => { A.mood(c.guest, 22); return '{first} was delighted with the surprise.'; } },
      { label: 'Send a card signed by the team', run: (c, A) => { A.mood(c.guest, 10); return 'A simple, thoughtful touch.'; } },
      { label: 'Do nothing', run: (c, A) => { A.mood(c.guest, -3); return 'The day passes without a mention.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -3); }
  },
  {
    id: 'towel-theft', cat: 'Guest behaviour', sev: 'Minor', img: 'towel-theft', title: 'Missing robes and towels', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel suitcase half open with a white hotel bathrobe and towels visible, a receptionist noticing',
    text: ['Housekeeping noticed that {guest}\'s suitcase contains two of the hotel\'s bathrobes and some towels.'],
    options: [
      { label: 'Add £60 to the bill', run: (c, A) => { if (A.roll(0.75)) { A.earn(60, 'Missing items charge'); A.mood(c.guest, -10); return '{first} was embarrassed and paid.'; } A.mood(c.guest, -25); return '{first} denied everything and left upset.'; } },
      { label: 'Ask {s} to politely remind them', staff: 'Receptionist', run: (c, A) => { if (A.roll(0.8)) { A.mood(c.guest, -3); return '{first} apologised and put the robes back.'; } A.mood(c.guest, -12); return '{first} claimed it was a mistake and kept everything.'; } },
      { label: 'Let it go', run: (c, A) => { return 'You decide the items are not worth the argument.'; } }
    ],
    ignore: () => {}
  },
  {
    id: 'bathroom-flood', cat: 'Guest behaviour', sev: 'Urgent', img: 'bathroom-flood', title: 'Flooded bathroom', needs: ['guest'], minDay: 2,
    imgPrompt: 'Photorealistic hotel bathroom with water overflowing from the bath onto the tiled floor and into the bedroom carpet',
    text: ['{guest} left the bath running. {room} has flooded and water is coming through into the corridor.'],
    init: () => ({ repair: rndRange(140, 330) }),
    options: [
      { label: 'Get {s} to fix it and {s2} to clean up', staff: ['Maintenance', 'Housekeeper'], cost: c => Math.round(c.d.repair * 0.5), run: (c, A) => { A.mood(c.guest, -3); return '{s} stopped the leak and {s2} dried the carpets. The room is fine.'; } },
      { label: c => `Call an emergency water-damage company (${money(Math.round(c.d.repair * 1.4))})`, cost: c => Math.round(c.d.repair * 1.4), run: () => 'The company dried everything with industrial fans.' },
      { label: 'Mop up and hope', run: (c, A) => { A.damageRoom(c.room, c.d.repair); A.mood(c.guest, -10); return 'Damp patches appear on the ceiling below. The room has to be closed after check-out.'; } }
    ],
    ignore: (c, A) => { if (c.room && !c.room.damaged) A.damageRoom(c.room, c.d.repair); A.mood(c.guest, -15); }
  },
  {
    id: 'sleepwalker', cat: 'Guest welfare', sev: 'Minor', img: 'sleepwalker', title: 'Guest found in the lobby at 3am', needs: ['guest'],
    imgPrompt: 'Photorealistic dim hotel lobby at night, a guest in pyjamas standing near the front desk looking confused',
    text: ['The night porter found {guest} wandering around the lobby in pyjamas. They seem to have been sleepwalking.'],
    options: [
      { label: 'Ask {s} to escort them gently back to the room', staff: 'Receptionist', run: (c, A) => { A.mood(c.guest, 8); return '{s} helped {first} back to bed. They remembered nothing in the morning.'; } },
      { label: 'Call a doctor (£60)', cost: 60, run: (c, A) => { A.mood(c.guest, 10); return 'The doctor said it is nothing to worry about.'; } },
      { label: 'Leave them be', run: (c, A) => { A.mood(c.guest, -10); return '{first} woke up on the lobby sofa feeling embarrassed.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -10); }
  },
  {
    id: 'review-threat', cat: 'Guest behaviour', sev: 'Serious', img: 'review-threat', title: 'Threat of a bad review', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel lobby, an irate guest holding up a phone showing a review page, receptionist remaining calm',
    text: ['{guest} says they will post a one-star review unless they get a big discount.'],
    options: [
      { label: 'Offer a £20 voucher', cost: 20, run: (c, A) => { if (A.roll(0.6)) { A.mood(c.guest, 15); return '{first} accepts the voucher.'; } A.mood(c.guest, 0); A.review(2, 'The voucher was an insult.', c.guest.name); return '{first} was not satisfied and still wrote a poor review.'; } },
      { label: 'Refund a night', run: (c, A) => { A.refund(c.guest, 1); A.mood(c.guest, 25); return '{first} calms down at once.'; } },
      { label: 'Ask {s} to listen and apologise', staff: 'Receptionist', run: (c, A) => { if (A.roll(0.65)) { A.mood(c.guest, 18); return '{first} just wanted to be heard.'; } A.mood(c.guest, -5); A.review(2, 'Staff were polite but did nothing.', c.guest.name); return 'The apology was not enough.'; } },
      { label: 'Stand your ground', run: (c, A) => { if (A.roll(0.5)) { A.review(1, 'Rude manager. Avoid this hotel.', c.guest.name); } A.mood(c.guest, -20); return 'You calmly refused to be pressured.'; } }
    ],
    ignore: (c, A) => { A.review(1, 'Terrible management.', c.guest ? c.guest.name : undefined); }
  },
  {
    id: 'bill-dispute', cat: 'Guest behaviour', sev: 'Minor', img: 'bill-dispute', title: 'Disputed bill', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel reception desk with a printed bill, a guest pointing at an item and the receptionist explaining politely',
    text: ['{guest} says they never used the minibar and refuses to pay £45 for it.'],
    options: [
      { label: 'Waive the charge', run: (c, A) => { A.mood(c.guest, 10); return 'You remove the charge.'; } },
      { label: 'Split it in half', run: (c, A) => { A.earn(22, 'Minibar (half)'); A.mood(c.guest, 3); return 'A fair compromise.'; } },
      { label: 'Stand firm', run: (c, A) => { if (A.roll(0.6)) { A.earn(45, 'Minibar charge'); A.mood(c.guest, -10); return '{first} grudgingly pays.'; } A.mood(c.guest, -25); A.review(2, 'Fought me over a minibar charge.', c.guest.name); return '{first} refuses and leaves a bad review.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -10); }
  },
  {
    id: 'food-allergy', cat: 'Guest welfare', sev: 'Serious', img: 'food-allergy', title: 'Allergy scare at dinner', needs: ['guest'], minDay: 3, when: () => S.staff.some(s => s.role === 'Chef') && !(assetByKey('kitchen') || {}).broken,
    imgPrompt: 'Photorealistic hotel restaurant, concerned waiter and a guest holding their throat, a plate of food on the table, warm lighting',
    text: ['{guest} has a nut allergy and says the dinner may have contained nuts. They feel unwell.'],
    options: [
      { label: 'Ask {s} to check ingredients and remake the meal', staff: 'Chef', run: (c, A) => { A.mood(c.guest, 6); return '{s} checked and found a cross-contamination risk. A fresh safe meal was cooked.'; } },
      { label: 'Call an ambulance', hint: 'Safest if the guest feels unwell.', run: (c, A) => { A.mood(c.guest, 12); return 'The paramedics checked {first}. All is well. Good decision.'; } },
      { label: 'Offer a free dessert', run: (c, A) => { A.mood(c.guest, -10); A.review(2, 'They did not take my allergy seriously.', c.guest.name); return '{first} was not impressed. Allergies are serious.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -25); A.review(1, 'Allergy ignored. Dangerous.', c.guest ? c.guest.name : undefined); }
  },
  {
    id: 'drunk-guest', cat: 'Guest behaviour', sev: 'Serious', img: 'drunk-guest', title: 'Disruptive guest in the lobby', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel lobby late at night, a loud guest leaning on the reception desk, other guests looking uncomfortable',
    text: ['{guest} has returned late and is being loud and rude in the lobby. Other guests are uncomfortable.'],
    options: [
      { label: 'Ask {s} to escort them calmly to the room', staff: 'Receptionist', run: (c, A) => { A.mood(c.guest, -3); return '{s} managed to calm things down and got {first} to bed.'; } },
      { label: 'Call a taxi and ask them to leave (£25)', cost: 25, run: (c, A) => { A.evict(c.guest); return '{first} went off in the taxi.'; } },
      { label: 'Call the police', run: (c, A) => { A.evict(c.guest); A.moodAll(-2, 'commotion'); return 'The police escorted {first} off the premises.'; } },
      { label: 'Ignore it', run: (c, A) => { A.moodAll(-8, 'disturbance'); return 'The disturbance carried on for an hour.'; } }
    ],
    ignore: (c, A) => { A.moodAll(-8); }
  },
  {
    id: 'lost-luggage', cat: 'Guest welfare', sev: 'Minor', img: 'lost-luggage', title: 'Lost luggage', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel reception with a guest holding only a small bag and a receptionist making a phone call, empty luggage cart',
    text: ['{guest}\'s luggage never arrived with their transport and they have nothing to wear.'],
    options: [
      { label: 'Ask {s} to track the luggage down', staff: 'Receptionist', run: (c, A) => { if (A.roll(0.65)) { A.mood(c.guest, 22); return '{s} found the bag at a depot and had it delivered.'; } A.mood(c.guest, -2); return 'No luck yet.'; } },
      { label: 'Buy emergency toiletries (£40)', cost: 40, run: (c, A) => { A.mood(c.guest, 12); return '{first} appreciates the thoughtful gesture.'; } },
      { label: 'Say it is not your problem', run: (c, A) => { A.mood(c.guest, -20); return '{first} is angry.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -15); }
  },
  {
    id: 'found-property', cat: 'Guest behaviour', sev: 'Minor', img: 'found-property', title: 'Valuable ring found', needs: ['guest'],
    imgPrompt: 'Photorealistic hotel housekeeping trolley with a gold ring on a folded towel, a cleaner looking at it carefully',
    text: ['While tidying {room}, a cleaner found a gold ring on the bathroom floor. It looks valuable and probably belongs to {guest}.'],
    options: [
      { label: 'Return it to {guest}', run: (c, A) => { A.mood(c.guest, 30); A.review(5, 'Honest staff returned my ring. Thank you!', c.guest.name); return '{first} was moved to tears and thanked the team.'; } },
      { label: 'Hand it to the police', run: (c, A) => { A.mood(c.guest, 10); return 'The police will make sure it reaches its owner.'; } },
      { label: 'Keep it for the hotel', hint: 'Is that right?', run: (c, A) => { A.review(1, 'The hotel kept my ring. Disgraceful.', c.guest.name); A.mood(c.guest, -30); return 'The guest found out. Stealing is never acceptable.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -10); }
  },
  {
    id: 'guest-slip', cat: 'Safety', sev: 'Serious', img: 'guest-slip', title: 'Guest slips on a wet floor', needs: ['guest'], minDay: 3,
    imgPrompt: 'Photorealistic hotel lobby marble floor with a wet-floor sign knocked over and a guest sitting on the floor with a receptionist helping',
    text: ['{guest} has slipped on a wet floor near the lobby. They seem shaken but conscious.'],
    options: [
      { label: 'Send {s} to give first aid', staff: 'Receptionist', run: (c, A) => { A.mood(c.guest, 8); return '{s} checked {first} over. Just bruised.'; } },
      { label: 'Call an ambulance', run: (c, A) => { A.mood(c.guest, 12); return 'Paramedics checked {first} and gave the all clear.'; } },
      { label: 'Offer £100 in compensation', cost: 100, run: (c, A) => { A.mood(c.guest, 20); return '{first} accepts and says there is no hard feeling.'; } },
      { label: 'Tell them to be more careful', run: (c, A) => { A.mood(c.guest, -30); A.review(1, 'Slipped in the lobby and the hotel blamed me.', c.guest.name); return '{first} is angry.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -30); A.review(1, 'Unsafe floors and no help.', c.guest ? c.guest.name : undefined); }
  },
  {
    id: 'lost-child', cat: 'Guest welfare', sev: 'Serious', img: 'lost-child', title: 'Child separated from parents', needs: ['guest'],
    imgPrompt: 'Photorealistic bright hotel lobby with a small child holding a teddy bear, a receptionist kneeling to talk gently, worried parents hurrying in the background',
    text: ['{guest}\'s young child has wandered off in the hotel and is missing for a few minutes. The parents are worried.'],
    options: [
      { label: 'Ask {s} to check every floor and make an announcement', staff: 'Receptionist', run: (c, A) => { A.mood(c.guest, 22); A.review(5, 'They found our little one in minutes. Brilliant staff.', c.guest.name); return 'The child was found in the games room, safe. The parents hugged {s}.'; } },
      { label: 'Call the police', run: (c, A) => { A.mood(c.guest, 5); return 'The child was found quickly, but the parents were frightened.'; } },
      { label: 'Wait a few minutes and see', hint: 'Not a good idea.', run: (c, A) => { A.mood(c.guest, -30); A.review(1, 'Staff did not help when our child went missing.', c.guest.name); return 'The delay frightened the parents terribly. The child was safe, but the damage to trust was done.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -40); A.review(1, 'Appalling response when our child went missing.', c.guest ? c.guest.name : undefined); }
  },
  {
    id: 'influencer', cat: 'Business', sev: 'Minor', img: 'influencer', title: 'Influencer wants a free stay', needs: [],
    imgPrompt: 'Photorealistic stylish young person taking a selfie in a bright hotel suite, ring light and phone tripod visible',
    text: ['A social media personality with 200,000 followers offers to post about the hotel in return for a free stay.'],
    options: [
      { label: 'Give a free stay', when: () => S.rooms.some(isReady), whenText: 'No room free', run: (c, A) => { if (A.roll(0.7)) { A.review(5, 'Amazing weekend. Watch my video!', 'Social media star'); A.demand(2, 4); return 'The video went viral. Enquiries are up.'; } A.review(3, 'It was fine. Nothing to write about.', 'Social media star'); return 'The post barely got any attention.'; } },
      { label: 'Offer a 50% discount', run: (c, A) => { if (A.roll(0.5)) { A.demand(1, 3); return 'A small mention in a post brought a few extra enquiries.'; } return 'No post appeared.'; } },
      { label: 'Politely decline', run: () => 'You decline politely.' }
    ],
    ignore: () => {}
  },
  {
    id: 'mystery-inspector', cat: 'Business', sev: 'Serious', img: 'mystery-inspector', title: 'A mystery guest is in the hotel', needs: [], minDay: 4,
    imgPrompt: 'Photorealistic discreet guest in a plain coat with a small notebook in a hotel lobby, looking around and making notes',
    text: ['A senior hotel inspector is secretly staying the night, scoring service and cleanliness. You have been tipped off.'],
    options: [
      { label: 'Roll out the red carpet', cost: 100, hint: 'Extra staff effort and amenities.', run: (c, A) => { A.review(5, 'Outstanding hotel. Top marks for service.', 'Hotel inspector'); A.demand(2, 4); return 'The inspector was impressed and gave you a glowing report.'; } },
      { label: 'Treat them like any other guest', run: (c, A) => {
        const issues = S.jobs.filter(j => j.type === 'complaint').length + S.assets.filter(a => a.broken).length + S.rooms.filter(r => r.dirty || r.damaged).length;
        if (issues === 0) { A.review(5, 'Everything was spotless and efficient.', 'Hotel inspector'); return 'There was nothing to criticise. Excellent.'; }
        if (issues <= 2) { A.review(4, 'Good hotel. A few small things to improve.', 'Hotel inspector'); return 'A few issues were noticed but overall a good report.'; }
        A.review(2, 'Too many problems. Not up to standard.', 'Hotel inspector'); return 'The inspector noted multiple problems around the hotel.'; } }
    ],
    ignore: (c, A) => { A.review(3, 'Average experience.', 'Hotel inspector'); }
  },
  {
    id: 'vip-arrival', cat: 'Business', sev: 'Minor', img: 'vip-arrival', title: 'A famous guest arrives', needs: [], minDay: 3,
    imgPrompt: 'Photorealistic black car outside an elegant hotel entrance, a doorman holding the door for a well-dressed person in sunglasses',
    text: ['A well-known film actor and entourage arrive without a booking and ask for your best rooms, discreetly.'],
    options: [
      { label: 'Offer a sparkling welcome and a private entrance (£150)', cost: 150, when: () => S.rooms.some(r => r.type === 'Luxury Suite' && isReady(r)), whenText: 'No luxury suite free', run: (c, A) => { A.earn(450, 'Celebrity stay'); A.review(5, 'Perfectly discreet and luxurious.', 'Film actor'); return 'The stay went perfectly. The actor tipped well and posted a kind review.'; } },
      { label: 'Treat them like any guest', run: (c, A) => { A.earn(180, 'Celebrity stay'); return 'They paid and left quietly.'; } },
      { label: 'Say you are full', run: () => 'You miss the chance. They find a hotel down the road.' }
    ],
    ignore: () => {}
  }
);
