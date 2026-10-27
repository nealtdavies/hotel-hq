'use strict';

/* ---------- Situations from the extras: arcade, Kids Club, shop and excursions (see scenarios.js for the format) ----------
   They only come up once the matching extra has been opened. The arcade breakdowns are equipment failures like the rest. */

SCENARIOS.push(
  /* ----- Arcade ----- */
  breakdown({
    id: 'claw-stuck', title: 'The claw machine is stuck', imgPrompt: 'Photorealistic hotel arcade, a claw machine with its claw jammed halfway holding a soft toy, two disappointed children pressed against the glass',
    text: ['The claw has jammed in mid-air with a soft toy dangling from it. A small crowd of disappointed children is waiting.',
      'A toy has wedged itself in the chute of the claw machine and the claw will not move. Nobody can play.'],
    fixed: '{s} freed the toy, oiled the claw and the children cheer.',
    left: 'The children wander off. The claw machine stays out of order.',
    extra: [{ label: 'Hand out prizes from the shop box to the waiting children (£5)', cost: 5, run: (c, A) => { A.moodAll(2, 'free prizes'); return 'The children each pick a small prize. The machine is still broken, but nobody minds.'; } }]
  }),
  breakdown({
    id: 'racing-screen', title: 'The racing game screen has gone dark', sev: 'Minor', imgPrompt: 'Photorealistic hotel arcade, a sit-down racing game with a black flickering screen and a child holding the steering wheel looking puzzled',
    text: ['The screen on the racing game keeps flickering and has now gone black. The steering wheel still turns, but nothing happens.',
      'The racing game has frozen on its start screen and will not respond to the pedals.']
  }),
  breakdown({
    id: 'pinball-flipper', title: 'A flipper has snapped off the pinball table', sev: 'Minor', imgPrompt: 'Photorealistic retro pinball table in a hotel arcade with one broken flipper and a ball stuck at the bottom, bright lights',
    text: ['One of the pinball flippers has snapped, so the ball drops straight down every time.',
      'The pinball table makes a grinding noise and the right flipper hangs loose.']
  }),
  breakdown({
    id: 'dance-pad', title: 'The dance pad has stopped sensing steps', sev: 'Minor', imgPrompt: 'Photorealistic hotel arcade with a dance pad game, glowing arrows on the floor panels, children standing confused as the screen shows error',
    text: ['The dance pad game no longer notices anyone stepping on it. The arrows flash but the score stays at zero.',
      'Two of the pad panels have stopped working and players keep missing every beat.']
  }),
  {
    id: 'arcade-queue', cat: 'Arcade', sev: 'Minor', img: 'arcade-queue', title: 'A queue for the racing game', needs: ['guest:children'], when: () => arcadeRunning() && !!assetByKey('arcade-racing'),
    imgPrompt: 'Photorealistic hotel arcade, a line of children waiting impatiently behind a racing game while two kids argue over the seat',
    text: ['Two children are arguing over whose turn it is on the racing game, and a long queue has built up. {guest} asks if someone can sort it out.',
      'The racing game is the most popular machine in the arcade. The queue is getting long and cross, and {guest}\'s child is near the back.'],
    options: [
      { label: 'Ask {s} to run a fair turn system', staff: 'Arcade Attendant', run: (c, A, st) => { if (A.roll(0.6 + 0.08 * st.skill)) { A.mood(c.guest, 10); return '{s} sets up a turn list with a stopwatch. Everyone gets a go, and the queue moves.'; } A.mood(c.guest, 2); return '{s} tries a turn list, but the arguing carries on a little.'; } },
      { label: 'Put up a sign: three minutes each', run: (c, A) => { A.mood(c.guest, 3); return 'The sign helps a bit. A few children still sulk.'; } },
      { label: 'Let them work it out', run: (c, A) => { A.mood(c.guest, -4); return 'The queue breaks up and a few families go away disappointed.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -6); }
  },

  /* ----- Kids Club ----- */
  {
    id: 'club-tearful', cat: 'Kids Club', sev: 'Minor', img: 'club-tearful', title: 'A tearful drop-off', needs: ['guest:children'], when: () => featureOn('kidsclub') && kidsLeaders() > 0,
    imgPrompt: 'Photorealistic hotel kids club room with bright cushions and toys, a young child holding a parent\'s leg and sniffling, a friendly leader crouching to say hello',
    text: ['At the Kids Club door, {guest}\'s youngest child is crying and will not let go. They do not want to join in.',
      '{guest}\'s child refuses to go into the Kids Club and has started to cry. The parent is worried about leaving them.'],
    options: [
      { label: 'Ask {s} to bring out a puppet and make friends first', staff: 'Kids Club Leader', run: (c, A, st) => { if (A.roll(0.6 + 0.08 * st.skill)) { A.mood(c.guest, 14); A.review(5, 'The club leader was wonderful with my nervous child.', c.guest.name); return '{s} brings Mr Wiggles the puppet. Within minutes the child is giggling and painting.'; } A.mood(c.guest, 3); return '{s} tries the puppet, and the child stays near the door for the morning.'; } },
      { label: 'Let the parent stay for the first half hour', run: (c, A) => { A.mood(c.guest, 5); return 'The parent stays for a while, then slips out when the child is busy.'; } },
      { label: 'Suggest trying again tomorrow', run: (c, A) => { A.mood(c.guest, -3); return 'The family decide to spend the day together instead.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -8); }
  },
  {
    id: 'club-paint', cat: 'Kids Club', sev: 'Minor', img: 'club-paint', title: 'Paint everywhere', needs: ['guest:children'], when: () => featureOn('kidsclub') && kidsLeaders() > 0,
    imgPrompt: 'Photorealistic kids club craft table, a pot of bright blue paint tipped over onto the carpet, children laughing with painted hands, leader with a cloth',
    text: ['A pot of blue paint has gone over at the craft table and handprints are heading for the lobby. {guest}\'s child is the proud owner of a very blue sleeve.',
      'The craft session got a bit lively. There is paint on the carpet, the chairs and {guest}\'s child.'],
    options: [
      { label: 'Ask {s} to clean it up before it dries', staff: 'Housekeeper', run: (c, A, st) => { if (A.roll(0.65 + 0.07 * st.skill)) { A.mood(c.guest, 6); return '{s} gets the carpet clean and the children get wipes. All smiles.'; } A.pay(40, 'Carpet cleaning after paint spill'); return 'A blue patch stays on the carpet. A specialist cleaner is called in.'; } },
      { label: 'Let the children help wipe it up with cloths', run: (c, A) => { A.mood(c.guest, 4); A.pay(10, 'Cleaning supplies'); return 'Everyone grabs a cloth. It is not perfect, but the children love being useful.'; } },
      { label: 'Close the craft table for the day', run: (c, A) => { A.mood(c.guest, -5); return 'The craft table is shut and the children are sent to play outside.'; } }
    ],
    ignore: (c, A) => { A.pay(60, 'Carpet replacement'); A.mood(c.guest, -4); }
  },
  {
    id: 'club-talent', cat: 'Kids Club', sev: 'Minor', img: 'club-talent', title: 'A talent show idea', needs: ['guest:children'], when: () => featureOn('kidsclub') && kidsLeaders() > 0,
    imgPrompt: 'Photorealistic hotel kids club stage made from cushions, children in homemade costumes performing, proud parents clapping',
    text: ['The children want to put on a talent show for their parents on the last afternoon. {guest} thinks it is a lovely idea.',
      'A group of children at the Kids Club have been practising a song. {guest} asks if they can perform it in the lobby.'],
    options: [
      { label: 'Ask {s} to run the show with props and a stage (£30)', staff: 'Kids Club Leader', cost: 30, run: (c, A, st) => { A.mood(c.guest, 14); A.moodAll(2, 'the talent show'); if (A.roll(0.4 + 0.1 * st.skill)) A.review(5, 'A talent show at the hotel! Our kids loved it.', c.guest.name); return 'The lobby fills with parents holding phones. The show ends with enormous cheers.'; } },
      { label: 'Let them sing at breakfast with no fuss', run: (c, A) => { A.mood(c.guest, 6); return 'A few brave children sing. People clap politely.'; } },
      { label: 'Say not this time', run: (c, A) => { A.mood(c.guest, -3); return 'The children are disappointed, but they understand.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -2); }
  },

  /* ----- Souvenir shop ----- */
  {
    id: 'shoplifter', cat: 'Shop', sev: 'Serious', img: 'shoplifter', title: 'Someone is taking things from the shop', when: () => featureOn('shop') && !!S.shop && shopPlan().open && shopStockValue() > 30,
    imgPrompt: 'Photorealistic hotel souvenir shop, a security mirror showing a person slipping a keyring into a pocket while the assistant is busy with a customer',
    text: ['The shop mirror shows someone slipping souvenirs into a bag and heading for the door without paying.',
      'Items keep disappearing from the shelves. A visitor with a large bag has just left the shop in a hurry.'],
    options: [
      { label: 'Ask {s} to politely stop them and ask to see the bag', staff: 'Shop Assistant', run: (c, A, st) => { if (A.roll(0.5 + 0.08 * st.skill)) { A.moodAll(1, 'the shop is looked after'); return '{s} calmly asks to see the bag. The items come back and the visitor leaves quickly.'; } A.loseStock(0.1); return 'The visitor makes an excuse and slips away with some of the stock.'; } },
      { label: 'Call the police', hint: 'They need a little time, but they will take care of it.', run: (c, A) => { if (A.roll(0.7)) { A.moodAll(1, 'the police were quick'); return 'The police arrive within minutes. They speak to the visitor and everything is returned.'; } A.loseStock(0.1); return 'The police take a report, but the visitor is long gone. Some stock is lost.'; } },
      { label: 'Do nothing', run: (c, A) => { A.loseStock(0.2); return 'The visitor takes the bag away. A fifth of the stock has gone.'; } }
    ],
    ignore: (c, A) => { A.loseStock(0.2); }
  },
  {
    id: 'shop-break-in', cat: 'Shop', sev: 'Urgent', img: 'shop-break-in', title: 'The shop has been broken into overnight', minDay: 8, when: () => featureOn('shop') && !!S.shop && shopStockValue() > 60,
    imgPrompt: 'Photorealistic hotel souvenir shop in the early morning, the shutter bent up, shelves emptied, a night porter looking shocked next to the door',
    text: ['The shutter on the shop has been forced and shelves are half empty. Nobody was hurt, but the thieves took a lot.',
      'The night porter finds the shop door open and stock missing. The alarm did not go off.'],
    options: [
      { label: 'Call the police', hint: 'They will write a report and look at the cameras.', run: (c, A) => { const v = A.loseStock(0.3); A.moodAll(-1, 'police at the hotel'); return `The police take a report and promise to look at the cameras. Stock worth ${money(v)} is gone.`; } },
      { label: 'Have {s} fit a new lock and check the other doors (£40)', staff: 'Maintenance', cost: 40, run: (c, A) => { const v = A.loseStock(0.3); A.wear('electrics', -4); return `{s} fits a stronger lock and checks every door. Stock worth ${money(v)} is gone, but it should not happen again.`; } },
      { label: 'Tidy up and carry on', run: (c, A) => { const v = A.loseStock(0.4); return `You restock what you can. In total stock worth ${money(v)} has been lost.`; } }
    ],
    ignore: (c, A) => { A.loseStock(0.4); }
  },
  {
    id: 'shop-price-label', cat: 'Shop', sev: 'Minor', img: 'shop-price-label', title: 'A wrong price label', needs: ['guest'], min: { guests: 3 }, when: () => featureOn('shop') && !!S.shop && shopPlan().open,
    imgPrompt: 'Photorealistic hotel souvenir shop counter, a guest holding up a sun hat with a price label that does not match the till display, the assistant checking',
    text: ['{guest} points out that the sun hat on the shelf is labelled much cheaper than the till price.',
      '{guest} found a label on a souvenir that does not match the price on the till and politely asks which is right.'],
    options: [
      { label: 'Honour the label price (£4)', cost: 4, run: (c, A) => { A.mood(c.guest, 8); return 'The guest is delighted that you kept your word. You fix the label.'; } },
      { label: 'Ask {s} to explain the mistake and offer a small discount', staff: 'Shop Assistant', run: (c, A, st) => { A.mood(c.guest, 5 + st.skill); return '{s} apologises and offers a small discount. The guest is satisfied.'; } },
      { label: 'Charge the till price', run: (c, A) => { A.mood(c.guest, -6); return 'The guest pays, but is grumpy about it.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -4); }
  },

  /* ----- Excursions ----- */
  {
    id: 'trip-late-minibus', cat: 'Excursions', sev: 'Minor', img: 'trip-late-minibus', title: 'The excursion minibus is late', needs: ['guest'], min: { guests: 4 }, when: () => featureOn('excursions') && !!S.trips && S.trips.list.length > 0 && crewOnDuty('Excursions Guide').length > 0,
    imgPrompt: 'Photorealistic hotel forecourt, a group of guests with backpacks and sun hats checking their watches beside an empty bay, a coastal road beyond',
    text: ['The minibus for today\'s excursion has not turned up. {guest} and the rest of the group are waiting with their bags.',
      'There is a traffic jam on the coast road and the excursion bus is late. {guest} asks how long it will be.'],
    options: [
      { label: 'Ask {s} to serve drinks while they wait and call the driver', staff: 'Receptionist', run: (c, A, st) => { if (A.roll(0.55 + 0.08 * st.skill)) { A.mood(c.guest, 8); return '{s} brings out cold drinks and keeps everyone updated. The bus arrives and the group cheer.'; } A.mood(c.guest, 2); return 'The bus arrives late, but the drinks keep the group sweet.'; } },
      { label: 'Give each guest a free drink voucher (£15)', cost: 15, run: (c, A) => { A.mood(c.guest, 5); return 'Vouchers keep the mood good until the bus finally turns up.'; } },
      { label: 'Tell them it is on its way', run: (c, A) => { A.mood(c.guest, -4); return 'The wait feels long without any news.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -7); }
  },
  {
    id: 'trip-wet-day', cat: 'Excursions', sev: 'Minor', img: 'trip-wet-day', title: 'Rain on excursion day', wx: ['rain', 'storm'], needs: ['guest'], min: { guests: 4 }, when: () => featureOn('excursions') && !!S.trips && S.trips.list.length > 0 && crewOnDuty('Excursions Guide').length > 0,
    imgPrompt: 'Photorealistic hotel lobby with guests in raincoats holding umbrellas, a chalkboard showing the day\'s excursions, rain on the windows',
    text: ['Rain is lashing the coast and {guest} wants to know if the outdoor excursions are still going ahead.',
      'The weather has turned grey and wet. {guest} asks if there is anything to do besides the beach walks.'],
    options: [
      { label: 'Ask {s} to swap the trips for an indoor museum visit', staff: 'Excursions Guide', run: (c, A, st) => { A.mood(c.guest, 10 + st.skill); return '{s} rearranges the day around the town museum and a hot chocolate stop. Everyone is cheerful.'; } },
      { label: 'Offer a refund on outdoor trips (£20)', cost: 20, run: (c, A) => { A.mood(c.guest, 6); return 'The guest is happy with the refund, and spends the afternoon in the lounge.'; } },
      { label: 'Say the trips may run if the rain eases', run: (c, A) => { A.mood(c.guest, -3); return 'Everyone waits and hopes for a break in the clouds.'; } }
    ],
    ignore: (c, A) => { A.mood(c.guest, -5); }
  },
  {
    id: 'trip-dolphins', cat: 'Excursions', sev: 'Minor', img: 'trip-dolphins', title: 'Dolphins on the boat trip', wx: ['sunny'], needs: ['guest'], min: { guests: 4 }, when: () => featureOn('excursions') && !!S.trips && S.trips.list.some(t => t.cat === 'Boat trip') && crewOnDuty('Excursions Guide').length > 0,
    imgPrompt: 'Photorealistic small tourist boat on a bright turquoise sea, delighted passengers pointing at dolphins leaping beside the boat',
    text: ['{guest} comes back from the boat trip glowing: a pod of dolphins swam beside the boat for ten minutes.',
      'The guests on the boat trip saw dolphins today. {guest} is showing everyone their photos.'],
    options: [
      { label: 'Ask {s} to share the photos on the hotel board', staff: 'Excursions Guide', run: (c, A, st) => { A.mood(c.guest, 10); A.moodAll(2, 'the dolphin photos'); if (A.roll(0.4 + 0.1 * st.skill)) A.review(5, 'We saw dolphins on the hotel boat trip! Unforgettable.', c.guest.name); return '{s} pins the photos in the lobby. Everyone wants to book the boat trip.'; } },
      { label: 'Congratulate them at reception', run: (c, A) => { A.mood(c.guest, 5); return 'The guest beams, and tells the story to the next person in the queue.'; } }
    ],
    ignore: (c, A) => {}
  }
);
