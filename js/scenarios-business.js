'use strict';

/* ---------- Staff and business situations (see scenarios.js for the format) ---------- */
SCENARIOS.push(
  {
    id: 'pay-rise', cat: 'Staff', sev: 'Minor', img: 'pay-rise', title: 'Pay rise request', needs: ['staff'], minDay: 3,
    imgPrompt: 'Photorealistic hotel back office, a uniformed staff member speaking politely to a manager across a desk with paperwork',
    init: () => ({ ask: pick([5, 8, 10]) }),
    text: ['{staff} asks for a pay rise of £{d.ask} a day. They say they have worked hard and want to stay.'],
    options: [
      { label: c => `Agree to £${c.d.ask} more a day`, run: (c, A) => { A.raise(c.staff, c.d.ask); A.reliab(c.staff, 1); return '{sfirst} is delighted and thanks you.'; } },
      { label: 'Offer a one-off £50 bonus instead', cost: 50, run: (c, A) => { if (A.roll(0.7)) return '{sfirst} accepts the bonus for now.'; A.quit(c.staff); return '{sfirst} was not happy and handed in notice.'; } },
      { label: 'Refuse politely', run: (c, A) => { if (A.roll(0.3)) { A.quit(c.staff); return '{sfirst} was unhappy and left for another job.'; } A.reliab(c.staff, -1); return '{sfirst} accepts the decision, but is a bit down.'; } }
    ],
    ignore: (c, A) => { if (A.roll(0.2)) A.quit(c.staff); }
  },
  {
    id: 'staff-training', cat: 'Staff', sev: 'Minor', img: 'staff-training', title: 'Training opportunity', needs: ['staff'],
    imgPrompt: 'Photorealistic hotel staff training room, a small group attending a presentation with a hotel trainer at a flipchart',
    text: ['{staff} asks to go on a one-day training course that would improve their skills. It costs £120.'],
    options: [
      { label: 'Pay for the course (£120)', cost: 120, run: (c, A) => { if (A.roll(0.8)) { A.skill(c.staff, 1); return '{sfirst} came back brimming with new skills.'; } return '{sfirst} enjoyed the day but did not learn much.'; } },
      { label: 'Say not right now', run: (c, A) => { A.reliab(c.staff, -1); return '{sfirst} is a little disappointed.'; } }
    ],
    ignore: () => {}
  },
  {
    id: 'staff-argument', cat: 'Staff', sev: 'Serious', img: 'staff-argument', title: 'Staff argument', needs: ['staff'], min: { staff: 3 },
    imgPrompt: 'Photorealistic hotel staff corridor, two staff in uniform with folded arms facing away from each other, tense atmosphere',
    text: ['{staff} is arguing loudly with a colleague in the staff room. Guests might hear.'],
    options: [
      { label: 'Speak to both privately', run: (c, A) => { if (A.roll(0.7)) { A.reliab(c.staff, 1); return 'You listened to both sides and calmed things down.'; } return 'They stopped arguing but the tension remains.'; } },
      { label: 'Separate their shifts for a week', run: (c, A) => { A.reliab(c.staff, -1); return 'The argument ends, but the team is a bit disrupted.'; } },
      { label: 'Ignore it', run: (c, A) => { if (A.roll(0.4)) { A.quit(c.staff); return 'It got worse and {sfirst} stormed out.'; } return 'Things quietened down by themselves.'; } }
    ],
    ignore: (c, A) => { if (A.roll(0.3)) A.quit(c.staff); }
  },
  {
    id: 'staff-late', cat: 'Staff', sev: 'Minor', img: 'staff-late', title: 'Repeated lateness', needs: ['staff'], minDay: 3,
    imgPrompt: 'Photorealistic hotel staff entrance with a clock showing 9:20 and a hurried staff member in uniform arriving',
    text: ['{staff} has been late three times this week.'],
    options: [
      { label: 'Give a formal warning', run: (c, A) => { A.reliab(c.staff, 1); return '{sfirst} apologises and promises to be on time.'; } },
      { label: 'Deduct a day\'s pay', run: (c, A) => { A.earn(c.staff.wage, 'Wage deduction'); A.reliab(c.staff, 0); if (A.roll(0.25)) { A.quit(c.staff); return '{sfirst} quit in protest.'; } return '{sfirst} is cross, but accepts it.'; } },
      { label: 'Let it go', run: (c, A) => { A.reliab(c.staff, -1); return 'It happens again.'; } },
      { label: 'Fire {staff}', hint: 'Severance of one day\'s wage.', run: (c, A) => { A.pay(c.staff.wage, 'Severance'); A.quit(c.staff); return '{sfirst} left the hotel.'; } }
    ],
    ignore: (c, A) => { A.reliab(c.staff, -1); }
  },
  {
    id: 'star-performer', cat: 'Staff', sev: 'Minor', img: 'star-performer', title: 'Guest praises a team member', needs: ['staff'],
    imgPrompt: 'Photorealistic hotel reception, a guest handing a card to a smiling staff member in smart uniform, bright lobby',
    text: ['A guest has written a glowing note about {staff}, praising their kindness.'],
    options: [
      { label: 'Give a £50 bonus', cost: 50, run: (c, A) => { A.reliab(c.staff, 1); return '{sfirst} is thrilled and works even harder.'; } },
      { label: 'Promote with a pay rise of £10 a day', run: (c, A) => { A.raise(c.staff, 10); A.skill(c.staff, 1); return '{sfirst} grows into the role.'; } },
      { label: 'Just say thank you', run: () => '{sfirst} smiles and goes back to work.' }
    ],
    ignore: () => {}
  },
  {
    id: 'staff-birthday', cat: 'Staff', sev: 'Minor', img: 'staff-birthday', title: 'Team birthday', needs: ['staff'],
    imgPrompt: 'Photorealistic hotel staff room with a small group of uniformed staff gathered around a cake with a candle',
    text: ['It is {staff}\'s birthday. The team would like to mark it.'],
    options: [
      { label: 'Buy a cake for the team (£20)', cost: 20, run: (c, A) => { if (A.roll(0.5)) A.reliab(c.staff, 1); return 'A lovely moment for the whole team.'; } },
      { label: 'Sing happy birthday', run: () => 'A cheerful moment, and it costs nothing.' }
    ],
    ignore: () => {}
  },
  {
    id: 'staff-injury', cat: 'Staff', sev: 'Serious', img: 'staff-injury', title: 'Staff member hurts their hand', needs: ['staff'],
    imgPrompt: 'Photorealistic hotel kitchen, a staff member holding a bandaged hand with a first-aid kit open on the counter',
    text: ['{staff} has cut their hand and is bleeding a bit.'],
    options: [
      { label: 'Give first aid and send them home to rest', run: (c, A) => { A.sick(c.staff, 1); return '{sfirst} is patched up and sent home with sick pay.'; } },
      { label: 'Call a doctor (£60)', cost: 60, run: (c, A) => { A.sick(c.staff, 1); A.reliab(c.staff, 1); return 'The doctor treated the cut. {sfirst} appreciates the care.'; } },
      { label: 'Tell them to carry on', hint: 'Not kind or safe.', run: (c, A) => { A.reliab(c.staff, -1); if (A.roll(0.4)) A.sick(c.staff, 3); return 'The cut got worse.'; } }
    ],
    ignore: (c, A) => { A.sick(c.staff, 2); }
  },
  {
    id: 'poaching', cat: 'Staff', sev: 'Serious', img: 'poaching', title: 'Rival hotel makes an offer', needs: ['staff'], minDay: 5,
    imgPrompt: 'Photorealistic smart hotel lobby, a person in a suit handing a business card to a hotel staff member discreetly',
    text: ['{staff} tells you a rival hotel has offered them a job on higher pay.'],
    options: [
      { label: 'Counter-offer with £10 a day more', run: (c, A) => { A.raise(c.staff, 10); return '{sfirst} decides to stay.'; } },
      { label: 'Offer a £150 loyalty bonus', cost: 150, run: (c, A) => { if (A.roll(0.6)) return '{sfirst} accepts and stays.'; A.quit(c.staff); return '{sfirst} took the bonus but still left.'; } },
      { label: 'Wish them well', run: (c, A) => { A.quit(c.staff); return '{sfirst} leaves on good terms.'; } }
    ],
    ignore: (c, A) => { A.quit(c.staff); }
  },
  {
    id: 'flu-outbreak', cat: 'Staff', sev: 'Serious', img: 'flu-outbreak', title: 'Flu going round the staff', needs: [], min: { staff: 3 }, minDay: 3,
    imgPrompt: 'Photorealistic hotel staff room with tissues on the table and a couple of staff members looking unwell in uniform',
    text: ['Several team members are sniffing and sneezing. A flu outbreak could knock out your rota.'],
    init: () => ({ cost: 12 }),
    options: [
      { label: c => `Pay for flu jabs for the team (${money(S.staff.length * 12)})`, cost: () => S.staff.length * 12, run: (c, A) => { if (A.roll(0.7)) return 'The jabs worked and nobody caught flu.'; const s = pick(S.staff); A.sick(s, 1); return 'The jabs were not enough to stop everyone.'; } },
      { label: 'Send anyone who feels ill home', run: (c, A) => { const s = pick(S.staff); A.sick(s, 1); return '{x} was sent home to rest.'.replace('{x}', s.name); } },
      { label: 'Carry on regardless', run: (c, A) => { const picks = S.staff.slice().sort(() => Math.random() - 0.5).slice(0, 2); picks.forEach(s => A.sick(s, rndRange(2, 3))); return 'Flu spread through the team.'; } }
    ],
    ignore: (c, A) => { S.staff.slice().sort(() => Math.random() - 0.5).slice(0, 2).forEach(s => A.sick(s, 2)); }
  },
  {
    id: 'health-inspection', cat: 'Business', sev: 'Serious', img: 'health-inspection', title: 'Food hygiene inspection', needs: ['asset:kitchen'], minDay: 5,
    imgPrompt: 'Photorealistic hotel kitchen, an inspector in a white coat with a clipboard checking a stainless steel counter while a chef watches',
    text: ['An environmental health officer has arrived unannounced to inspect your kitchen.'],
    options: [
      { label: 'Welcome them and open every cupboard', run: (c, A) => {
        const cond = c.asset.cond;
        if (cond >= 70) { A.review(5, 'Spotless kitchen. Five-star hygiene.', 'Food inspector'); return 'The inspector awarded top marks.'; }
        if (cond >= 40) { A.pay(60, 'Improvement notice costs'); return 'The inspector gave you a list of small things to fix.'; }
        A.pay(400, 'Hygiene fine'); A.review(2, 'Kitchen not up to standard.', 'Food inspector'); return 'The kitchen was in poor condition. You were fined.'; } },
      { label: 'Ask them to wait while you tidy up', run: (c, A) => { A.wear('kitchen', 5); if (A.roll(0.5)) { A.pay(150, 'Hygiene fine'); return 'The inspector was unimpressed by the delay.'; } return 'The inspector waited patiently. It went smoothly.'; } }
    ],
    ignore: (c, A) => { A.pay(150, 'Hygiene fine'); }
  },
  {
    id: 'fire-inspection', cat: 'Business', sev: 'Serious', img: 'fire-inspection', title: 'Fire safety check', needs: ['asset:electrics'], minDay: 5,
    imgPrompt: 'Photorealistic fire officer in uniform checking a hotel fire extinguisher and an emergency exit sign, tidy corridor',
    text: ['The fire service is carrying out a surprise safety inspection of the hotel.'],
    options: [
      { label: 'Show them around with {s}', staff: 'Maintenance', run: (c, A) => {
        const cond = c.asset.cond;
        if (cond >= 65) { A.review(5, 'Excellent fire safety.', 'Fire service'); return 'Everything was in order. Well done.'; }
        if (cond >= 35) { A.pay(120, 'Fire safety improvements'); return 'A few items needed improving.'; }
        A.pay(500, 'Fire safety fine'); return 'The electrics and alarms were in poor shape. You were fined heavily.'; } },
      { label: 'Let them look alone', run: (c, A) => { if (A.roll(0.4)) { A.pay(300, 'Fire safety fine'); return 'Things were missed and you were fined.'; } return 'They found only minor points.'; } }
    ],
    ignore: (c, A) => { A.pay(200, 'Fire safety fine'); }
  },
  {
    id: 'travel-blogger', cat: 'Business', sev: 'Minor', img: 'travel-blogger', title: 'Travel blogger visits', needs: [], minDay: 3,
    imgPrompt: 'Photorealistic travel blogger with a camera and small notebook photographing the hotel lobby decor',
    text: ['A popular travel blogger is staying and says they will write about the hotel.'],
    options: [
      { label: 'Offer a free breakfast and spa visit (£60)', cost: 60, run: (c, A) => { if (rating() >= 3.8) { A.review(5, 'A hidden gem. Highly recommended!', 'Travel blogger'); A.demand(2, 4); return 'The blog post sent more bookings your way.'; } A.review(3, 'Nice touches, but let down by a few things.', 'Travel blogger'); return 'The blogger enjoyed the extras but noticed problems elsewhere.'; } },
      { label: 'Do nothing special', run: (c, A) => { if (rating() >= 4.2) { A.review(4, 'A solid, well-run hotel.', 'Travel blogger'); return 'A good, honest review.'; } A.review(3, 'Fine, but nothing special.', 'Travel blogger'); return 'A modest write-up.'; } }
    ],
    ignore: () => {}
  },
  {
    id: 'local-festival', cat: 'Business', sev: 'Minor', img: 'local-festival', title: 'Festival in town', needs: [], minDay: 2,
    imgPrompt: 'Photorealistic town high street at dusk with festival lights, bunting, crowds and a hotel entrance glowing in the background',
    text: ['A big music festival is coming to town this week. More travellers will be looking for rooms.'],
    options: [
      { label: 'Advertise a festival package (£100)', cost: 100, run: (c, A) => { A.demand(4, 4); return 'Your adverts bring extra enquiries every morning for the next few days.'; } },
      { label: 'Do nothing, see what happens', run: (c, A) => { A.demand(2, 3); return 'A few extra enquiries trickle in anyway.'; } }
    ],
    ignore: (c, A) => { A.demand(1, 2); }
  },
  {
    id: 'snow-day', cat: 'Business', sev: 'Serious', img: 'snow-day', title: 'Heavy snowfall', needs: [], min: { staff: 4 }, minDay: 3, w: 0.6,
    imgPrompt: 'Photorealistic hotel exterior covered in thick snow at dawn, snowploughs on the road and a lone person shovelling the path',
    text: ['Heavy snow has blocked the roads. Some staff may not be able to reach the hotel.'],
    options: [
      { label: 'Pay for taxis for key staff (£80)', cost: 80, run: () => 'Your taxis got everyone in safely.' },
      { label: 'Run a skeleton crew', run: (c, A) => { S.staff.slice().sort(() => Math.random() - 0.5).slice(0, 2).forEach(s => A.sick(s, 1)); return 'Two staff could not make it in.'; } },
      { label: 'Offer snowed-in guests a free hot chocolate', run: (c, A) => { A.moodAll(4, 'cosy touch'); return 'Guests love the cosy atmosphere.'; } }
    ],
    ignore: (c, A) => { S.staff.slice().sort(() => Math.random() - 0.5).slice(0, 2).forEach(s => A.sick(s, 1)); }
  },
  {
    id: 'supplier-price-hike', cat: 'Business', sev: 'Minor', img: 'supplier-price-hike', title: 'Supplier raises prices', needs: [], minDay: 3,
    imgPrompt: 'Photorealistic delivery person handing a clipboard to a hotel kitchen porter beside crates of vegetables and boxes',
    text: ['Your food supplier tells you prices are going up. It will cost about £60 more per week.'],
    options: [
      { label: 'Accept the new prices', cost: 60, run: () => 'You keep the supplier you know and trust.' },
      { label: 'Switch to a cheaper supplier', run: (c, A) => { if (A.roll(0.5)) { A.earn(40, 'Supplier savings'); return 'The new supplier is cheaper and reliable.'; } A.wear('kitchen', -5); A.moodAll(-2, 'quality drop'); return 'The cheaper food is lower quality and guests notice.'; } },
      { label: 'Negotiate with {s}', staff: 'Chef', run: (c, A) => { if (A.roll(0.6)) { return '{s} negotiated well. The price stays the same.'; } A.pay(30, 'Smaller price rise'); return 'You got a smaller rise.'; } }
    ],
    ignore: (c, A) => { A.pay(60, 'Higher supplier costs'); }
  },
  {
    id: 'council-letter', cat: 'Business', sev: 'Minor', img: 'council-letter', title: 'Letter from the council', needs: [], minDay: 4,
    imgPrompt: 'Photorealistic hotel manager at a wooden desk opening an official envelope, serious expression, tidy office',
    text: ['A letter from the council says the hotel owes £250 in unpaid business rates.'],
    options: [
      { label: 'Pay it now (£250)', cost: 250, run: () => 'Paid in full. No further action.' },
      { label: 'Appeal against it', run: (c, A) => { if (A.roll(0.4)) return 'Your appeal succeeded. You owe nothing.'; A.pay(300, 'Rates plus late fee'); return 'The appeal failed and a late fee was added.'; } },
      { label: 'Ignore the letter', hint: 'Never a good idea.', run: (c, A) => { A.pay(450, 'Penalty and rates'); return 'A penalty notice arrived. Ignoring official letters is expensive.'; } }
    ],
    ignore: (c, A) => { A.pay(450, 'Penalty and rates'); }
  },
  {
    id: 'competitor-opens', cat: 'Business', sev: 'Serious', img: 'competitor-opens', title: 'New hotel opens nearby', needs: [], minDay: 6,
    imgPrompt: 'Photorealistic brand new modern hotel building across the street with a banner reading Grand Opening, evening',
    text: ['A shiny new hotel has opened across the road with big opening discounts.'],
    options: [
      { label: 'Run a promotion (£120)', cost: 120, run: (c, A) => { A.demand(3, 4); return 'Your promotion helps hold on to bookings.'; } },
      { label: 'Focus on service quality', run: (c, A) => { A.moodAll(4, 'extra attention'); return 'The team goes the extra mile. Regular guests notice.'; } },
      { label: 'Ignore them', run: (c, A) => { A.demand(-2, 4); return 'Fewer enquiries come in for a few days.'; } }
    ],
    ignore: (c, A) => { A.demand(-2, 4); }
  },
  {
    id: 'corporate-booking', cat: 'Business', sev: 'Minor', img: 'corporate-booking', title: 'Corporate group booking', needs: [], minDay: 2,
    when: () => S.rooms.filter(isReady).length >= 3,
    imgPrompt: 'Photorealistic business people in suits with luggage checking in at a hotel reception desk, bright lobby',
    text: ['A company wants to book three rooms for three nights for a team away day, if you offer a discount.'],
    options: [
      { label: 'Accept with 15% discount', when: () => S.rooms.filter(isReady).length >= 3, whenText: 'Not enough clean rooms', run: (c, A) => { const n = A.groupBook(3, 3, 0.15, 'Corporate'); return n ? 'The group arrives straight away.' : 'Not enough rooms were ready.'; } },
      { label: 'Accept at full price', when: () => S.rooms.filter(isReady).length >= 3, whenText: 'Not enough clean rooms', run: (c, A) => { if (A.roll(0.5)) { const n = A.groupBook(3, 3, 0, 'Corporate'); return n ? 'They agreed and arrive immediately.' : 'Not enough rooms were ready.'; } return 'The company went elsewhere.'; } },
      { label: 'Decline', run: () => 'You turn them down.' }
    ],
    ignore: () => {}
  },
  {
    id: 'wedding-party', cat: 'Business', sev: 'Minor', img: 'wedding-party', title: 'Wedding party booking', needs: [], minDay: 3,
    when: () => S.rooms.filter(isReady).length >= 3,
    imgPrompt: 'Photorealistic bride and groom with guests outside a hotel entrance throwing confetti, sunny day',
    text: ['A wedding party wants three rooms for two nights and a celebration meal.'],
    options: [
      { label: 'Accept and host a meal with {s} (£120)', staff: 'Chef', cost: 120, when: () => S.rooms.filter(isReady).length >= 3, whenText: 'Not enough clean rooms', run: (c, A) => { A.groupBook(3, 2, 0, 'Wedding'); A.earn(380, 'Wedding meal and drinks'); A.review(5, 'Our wedding weekend was perfect.', 'Newlyweds'); return 'The wedding went wonderfully.'; } },
      { label: 'Accept rooms only', when: () => S.rooms.filter(isReady).length >= 3, whenText: 'Not enough clean rooms', run: (c, A) => { const n = A.groupBook(3, 2, 0, 'Wedding'); return n ? 'The rooms are booked.' : 'Not enough rooms were ready.'; } },
      { label: 'Decline', run: () => 'You turn them down.' }
    ],
    ignore: () => {}
  },
  {
    id: 'coach-tour', cat: 'Business', sev: 'Minor', img: 'coach-tour', title: 'Coach tour arrives', needs: [], minDay: 3,
    when: () => S.rooms.filter(isReady).length >= 4,
    imgPrompt: 'Photorealistic tour coach outside a hotel with tourists getting off holding cameras and luggage',
    text: ['A coach tour group has arrived hoping for four rooms for one night.'],
    options: [
      { label: 'Accept with a group dinner prepared by {s} (£150)', staff: 'Chef', cost: 150, when: () => S.rooms.filter(isReady).length >= 4, whenText: 'Not enough clean rooms', run: (c, A) => { A.groupBook(4, 1, 0.05, 'Tour'); A.earn(320, 'Group dinner'); return 'The tourists loved their meal.'; } },
      { label: 'Accept rooms only', when: () => S.rooms.filter(isReady).length >= 4, whenText: 'Not enough clean rooms', run: (c, A) => { const n = A.groupBook(4, 1, 0.05, 'Tour'); return n ? 'The group checks in.' : 'Not enough rooms were ready.'; } },
      { label: 'Decline', run: () => 'You turn them down.' }
    ],
    ignore: () => {}
  },
  {
    id: 'tv-crew', cat: 'Business', sev: 'Minor', img: 'tv-crew', title: 'TV crew wants to film', needs: [], minDay: 4,
    imgPrompt: 'Photorealistic small TV crew with a camera and microphone filming in a hotel lobby, guests looking on curiously',
    text: ['A TV production company wants to film in the hotel lobby for a day.'],
    options: [
      { label: 'Agree for £500', run: (c, A) => { A.earn(500, 'Filming fee'); A.moodAll(-5, 'filming disruption'); A.demand(1, 3); return 'Filming goes well but guests find it disruptive.'; } },
      { label: 'Agree for free publicity', run: (c, A) => { A.moodAll(-4, 'filming disruption'); A.demand(3, 4); return 'The programme brings more bookings.'; } },
      { label: 'Decline', run: () => 'You decline politely.' }
    ],
    ignore: () => {}
  },
  {
    id: 'charity-event', cat: 'Business', sev: 'Minor', img: 'charity-event', title: 'Charity coffee morning', needs: [], minDay: 2,
    imgPrompt: 'Photorealistic hotel lounge with a charity coffee morning, tables of cakes and smiling local people with teacups',
    text: ['A local charity asks if they can hold a coffee morning in the hotel lounge.'],
    options: [
      { label: 'Host it with cakes from {s} (£60)', staff: 'Chef', cost: 60, run: (c, A) => { A.review(5, 'The hotel hosted a lovely charity morning.', 'Local resident'); A.demand(1, 3); return 'A warm and well-attended morning. Good for your reputation.'; } },
      { label: 'Host it, with the charity bringing the cakes', run: (c, A) => { A.review(4, 'Kind of the hotel to host us.', 'Local resident'); return 'A pleasant event at no cost.'; } },
      { label: 'Decline', run: () => 'You decline politely.' }
    ],
    ignore: () => {}
  },
  {
    id: 'energy-bill', cat: 'Business', sev: 'Minor', img: 'energy-bill', title: 'Energy bill spike', needs: [], minDay: 4,
    imgPrompt: 'Photorealistic hotel manager looking at a huge energy bill with a calculator on a desk, concerned',
    text: ['The latest energy bill is much higher than expected: an extra £300.'],
    options: [
      { label: 'Pay it', cost: 300, run: () => 'It hurts, but it is paid.' },
      { label: 'Invest £200 in energy saving lights', cost: 200, run: (c, A) => { A.wear('electrics', 10); A.earn(150, 'Energy savings'); return 'The new LEDs are already making a difference.'; } },
      { label: 'Dispute the bill', run: (c, A) => { if (A.roll(0.5)) return 'The supplier found an error and corrected it.'; A.pay(330, 'Energy bill with late fee'); return 'The dispute failed and a late fee was added.'; } }
    ],
    ignore: (c, A) => { A.pay(330, 'Energy bill with late fee'); }
  },
  {
    id: 'delivery-delay', cat: 'Business', sev: 'Minor', img: 'delivery-delay', title: 'Food delivery delayed', needs: ['asset:kitchen'], minDay: 3,
    imgPrompt: 'Photorealistic empty hotel kitchen delivery bay with a chef checking a watch and an empty crate',
    text: ['The weekly food delivery has not arrived and the kitchen is running low.'],
    options: [
      { label: 'Ask {s} to buy from the supermarket (£90)', staff: 'Chef', cost: 90, run: () => '{s} filled the trolley and saved the day.' },
      { label: 'Serve a simpler menu', run: (c, A) => { A.moodAll(-3, 'limited menu'); return 'Guests are fine with it, mostly.'; } },
      { label: 'Close the restaurant for the day', run: (c, A) => { A.moodAll(-6, 'restaurant closed'); return 'Guests are annoyed.'; } }
    ],
    ignore: (c, A) => { A.moodAll(-6); }
  },
  {
    id: 'master-key-lost', cat: 'Safety', sev: 'Serious', img: 'master-key-lost', title: 'Master key missing', needs: [], minDay: 3,
    imgPrompt: 'Photorealistic hotel reception, a worried receptionist searching drawers and a key rack with one empty hook',
    text: ['The master key has gone missing. Anyone who finds it could get into any room.'],
    options: [
      { label: 'Re-key every lock (£400)', cost: 400, run: () => 'Safe and secure again.' },
      { label: 'Re-key only the guest floors (£150)', cost: 150, run: (c, A) => { if (A.roll(0.8)) return 'That should be enough.'; A.pay(250, 'Theft loss'); A.review(1, 'My belongings were stolen from my room.'); return 'A guest later reported a theft.'; } },
      { label: 'Do nothing and hope it turns up', run: (c, A) => { if (A.roll(0.4)) { A.pay(300, 'Theft loss'); A.review(1, 'A theft in my room. Not safe.'); return 'The key was misused. Security matters.'; } return 'It turned up in a coat pocket. You were lucky.'; } }
    ],
    ignore: (c, A) => { if (A.roll(0.4)) { A.pay(300, 'Theft loss'); A.review(1, 'A theft in my room. Not safe.'); } }
  },
  {
    id: 'scam-email', cat: 'Business', sev: 'Serious', img: 'scam-email', title: 'Urgent payment email', needs: [], minDay: 3,
    imgPrompt: 'Photorealistic laptop screen on a hotel office desk showing a suspicious urgent invoice email with red warning highlights',
    text: ['An email, seemingly from your supplier, demands an urgent £400 payment to a new bank account.'],
    options: [
      { label: 'Phone the supplier to check', run: (c, A) => { A.note('Scam avoided', 'good'); return 'The supplier confirmed they sent nothing. It was a scam. You saved £400.'; } },
      { label: 'Ask {s} to check with the bank', staff: 'Receptionist', run: () => '{s} spotted the warning signs and reported it. Well done.' },
      { label: 'Pay straight away (£400)', hint: 'Always check urgent payment requests.', cost: 400, run: (c, A) => 'It was a scam. The money has gone for good.' },
      { label: 'Delete it', run: () => 'You deleted the email and moved on.' }
    ],
    ignore: () => {}
  },
  {
    id: 'hotel-awards', cat: 'Business', sev: 'Minor', img: 'hotel-awards', title: 'Hospitality awards nomination', needs: [], minDay: 6,
    imgPrompt: 'Photorealistic hotel awards ceremony with a smiling manager holding a golden trophy on stage, applause',
    text: ['You are invited to enter the regional hospitality awards. The entry fee is £100.'],
    options: [
      { label: 'Enter (£100)', cost: 100, run: (c, A) => { if (rating() >= 4.2 && A.roll(0.6)) { A.review(5, 'Award-winning hotel and it shows.', 'Awards judge'); A.demand(3, 5); return 'You won! Bookings are up.'; } return 'You did not win this year, but it was a great evening.'; } },
      { label: 'Skip it', run: () => 'You decide to save the money.' }
    ],
    ignore: () => {}
  },
  {
    id: 'construction-noise', cat: 'Business', sev: 'Minor', img: 'construction-noise', title: 'Building works next door', needs: [], minDay: 3,
    imgPrompt: 'Photorealistic construction site next to a hotel with a crane and workers, a guest looking out of a window and frowning',
    text: ['Building works have started next door. Drilling starts at 8am and guests are complaining.'],
    options: [
      { label: 'Offer breakfast vouchers (£60)', cost: 60, run: (c, A) => { A.moodAll(6, 'goodwill gesture'); return 'Guests appreciate the gesture.'; } },
      { label: 'Contact the builders', run: (c, A) => { if (A.roll(0.5)) { return 'The builders agreed to start at 9am.'; } A.moodAll(-4, 'drilling'); return 'The builders refused to change anything.'; } },
      { label: 'Ignore it', run: (c, A) => { A.moodAll(-6, 'drilling'); return 'Guests are annoyed.'; } }
    ],
    ignore: (c, A) => { A.moodAll(-6); }
  },
  {
    id: 'viral-video', cat: 'Business', sev: 'Minor', img: 'viral-video', title: 'Video of the hotel goes viral', needs: ['staff'], minDay: 3,
    imgPrompt: 'Photorealistic guest filming a hotel staff member helping an elderly guest with luggage, warm lobby lighting, phone in hand',
    text: ['A guest filmed {staff} helping an elderly guest and the video is spreading online.'],
    options: [
      { label: 'Share the video on the hotel page', run: (c, A) => { A.demand(3, 4); A.review(5, 'Saw the video and booked straight away. Lovely staff.', 'Guest'); return 'Hundreds of people shared it. Bookings are up.'; } },
      { label: 'Thank {staff} with a small bonus (£30)', cost: 30, run: (c, A) => { A.reliab(c.staff, 1); return '{sfirst} is touched.'; } },
      { label: 'Do nothing', run: () => 'The video fades away.' }
    ],
    ignore: () => {}
  }
);
