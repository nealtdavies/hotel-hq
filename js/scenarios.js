'use strict';

/* =====================================================================
   SCENARIO DEFINITIONS
   Each scenario is a plain object. Fields:
     id, cat, sev ('Minor' | 'Serious' | 'Urgent'), title, img, imgPrompt
     needs   : what it must bind to ('guest', 'emptyRoom', 'staff', 'role:Chef', 'asset:pool')
     min/when/minDay/w : eligibility, minimum day, weight
     wx      : only on days whose weather is one of these ('sunny', 'cloudy', 'rain', 'storm'); seasons: only in these seasons
     init    : (c) => data stored with the incident (amounts etc., read as c.d / {d.key})
     text    : string | string[] (variants) | (c) => string
     options : [{ label, hint, cost, staff, when, whenText, run(c, A, st, st2) }]
               or stages: [{ prompt, when, options }] for multi-step decisions
     ignore  : (c, A) => consequence if the manager does nothing
   Tokens usable in text: {guest} {first} {room} {staff} {sfirst} {asset} {s} {s2} {d.key}
   Rule: never use gendered pronouns in text (use names, "the guest", or "they").
   Every scenario must keep at least one option that needs no staff and no money.
   ===================================================================== */
const SCENARIOS = [];

/* One option per contractor firm, for the second step of an equipment breakdown. */
function firmOption(f) {
  const spec = c => ({ kind: 'repair', target: 'asset', key: c.asset.key });
  const quote = c => quoteFor(f.key, spec(c));
  return {
    label: c => { const q = quote(c); return q.can ? `${f.name}: ${money(q.price)}, ${q.days === 0 ? 'today' : `about ${q.days} day${q.days > 1 ? 's' : ''}`}` : f.name; },
    hint: c => { const q = quote(c); return q.can ? `${stars(q.advertised)} advertised. ${q.specialist ? 'Specialist in this work. ' : ''}${q.warranty ? q.warranty + ' day guarantee.' : 'No guarantee.'} Paid when the work is done.` : ''; },
    when: c => { const q = quote(c); return q.can && canAfford(q.price); }, whenText: 'Does not do this work, or you cannot afford the quote',
    run: (c, A) => {
      const r = orderWork(spec(c), f.key);
      if (!r.ok) return `${f.name} could not take the job: ${r.error}`;
      A.note(`${f.name} booked${r.work.price ? ` (${money(r.work.price)} when done)` : ''}`);
      return r.text;
    }
  };
}

/* Standard equipment-failure scenario: repair in-house, get contractor quotes (second step), or wait. */
function breakdown(o) {
  return {
    id: o.id, cat: 'Maintenance', sev: o.sev || 'Urgent', img: o.id, imgPrompt: o.imgPrompt,
    title: o.title, text: o.text,
    stages: [
      { options: [
        {
          label: 'Get {s} in to repair it', staff: 'Maintenance', cost: c => Math.round(c.def.repair * 0.6),
          hint: 'Parts only. A more skilled engineer is more likely to fix it first time.',
          run: (c, A, st) => {
            if (A.roll(0.55 + 0.1 * st.skill)) { A.fixAsset(c.asset.key); return o.fixed || '{s} fixed it and everything is working again.'; }
            A.wear(c.asset.key, -10);
            return '{s} did their best, but the repair did not hold. A contractor may be needed.';
          }
        },
        ...(o.extra || []),
        {
          label: 'Get quotes from contractors', hint: 'Compare firms on price, speed and track record. Cheap firms are slow and riskier.',
          run: (c) => { c.inc.wantsContractor = true; return 'You decide to call in a contractor.'; }
        },
        {
          label: 'Leave it for now', hint: 'Guests will be unhappy until it is fixed. A repair job stays in Tasks.',
          run: (c, A) => { A.moodAll(-4, 'while it is broken'); return o.left || 'You apologise to guests and plan to deal with it later.'; }
        }
      ] },
      { prompt: 'Choose a contractor. The work takes time, and until it is done the equipment stays out of action.', when: c => !!c.inc.wantsContractor,
        options: [...FIRMS.map(firmOption), { label: 'Do not hire anyone yet', hint: 'A repair job stays in Tasks.', run: (c, A) => { A.moodAll(-4, 'while it is broken'); return 'You decide to wait and compare firms from the Tasks page.'; } }] }
    ],
    ignore: (c, A) => { A.note('Still broken. Guests are growing impatient.', 'bad'); }
  };
}

SCENARIOS.push(
  breakdown({
    id: 'boiler-breakdown', title: 'Boiler breakdown', imgPrompt: 'Photorealistic hotel basement plant room, large commercial boiler with a red warning light and steam, dim industrial lighting',
    text: ['The boiler has stopped working and there is no hot water anywhere in the hotel. Guests are already phoning reception.',
      'A cold shower has led to a flood of complaints. The boiler in the plant room has failed and the pressure gauge reads zero.']
  }),
  breakdown({
    id: 'aircon-failure', title: 'Heating and air-con failure', imgPrompt: 'Photorealistic hotel corridor with an open ceiling panel showing a faulty air-conditioning unit, maintenance ladder below',
    text: ['The heating and air-conditioning have failed. Rooms are stuffy and guests are asking for fans.',
      'The climate control system has tripped out. Some rooms are freezing while others are far too warm.']
  }),
  breakdown({
    id: 'pool-green', title: 'The pool has turned green', sev: 'Serious', imgPrompt: 'Photorealistic hotel outdoor swimming pool with cloudy green water, sun loungers, a closed sign on the gate',
    text: ['The pool water has turned an unpleasant green. The pool must close until it is treated.',
      'A guest has photographed the pool: the water is murky and green. Pool chemicals have not been keeping up.'],
    fixed: '{s} treated and cleared the water. The pool will reopen today.',
    extra: [{
      label: 'Use emergency chemical shock treatment', cost: 50, hint: 'Cheap and quick, but it does not always work.',
      run: (c, A) => { if (A.roll(0.6)) { A.fixAsset(c.asset.key); return 'The shock treatment worked and the water is clearing.'; } return 'The treatment barely made a difference. The pool is still green.'; }
    }]
  }),
  breakdown({
    id: 'pool-pump', title: 'Pool pump failure', sev: 'Serious', imgPrompt: 'Photorealistic hotel pool pump room, a stopped pump with a leaking pipe and a puddle on the floor',
    text: ['The pool pump has failed and the water is no longer circulating. The pool is closed for safety.']
  }),
  breakdown({
    id: 'lift-stuck', title: 'Lift out of order', imgPrompt: 'Photorealistic hotel lift with an out of order sign and open doors between floors, marble lobby',
    text: ['The lift has stopped between floors. The doors have been opened safely, but it cannot be used.',
      'The only lift is out of order. Guests with heavy suitcases are being sent up the stairs.']
  }),
  breakdown({
    id: 'fridge-failure', title: 'Kitchen fridge failure', imgPrompt: 'Photorealistic commercial hotel kitchen, walk-in fridge door open, chef looking at a warm temperature display',
    text: ['The kitchen fridge has failed overnight. Your Chef is worried about the food and the restaurant cannot serve guests.',
      'The walk-in fridge has stopped cooling. Meat and dairy are at risk of spoiling.'],
    left: 'The restaurant stays closed and some food has to be thrown away.'
  }),
  breakdown({
    id: 'wifi-outage', title: 'Wi-Fi outage', sev: 'Minor', imgPrompt: 'Photorealistic hotel lobby, guests frowning at phones and laptops, router with red light behind reception desk',
    text: ['The hotel Wi-Fi has gone down. Guests cannot stream, work or check in online.',
      'The router has crashed and no one can get online. Guests are queueing at reception to complain.']
  }),
  breakdown({
    id: 'burst-pipe', title: 'Burst pipe', imgPrompt: 'Photorealistic hotel corridor with water pouring from a burst ceiling pipe, wet carpet, yellow wet-floor sign',
    text: ['A pipe has burst above the second floor corridor. Water is running down the walls and the carpet is soaked.',
      'Reception reports water dripping through the lobby ceiling. A pipe has failed.']
  }),
  breakdown({
    id: 'blocked-drain', title: 'Blocked drains', sev: 'Minor', imgPrompt: 'Photorealistic hotel bathroom with a gurgling blocked drain and standing water in the shower tray',
    text: ['Several bathrooms are smelling badly. The main drain is blocked and water is draining very slowly.']
  }),
  breakdown({
    id: 'power-cut', title: 'Power cut', imgPrompt: 'Photorealistic dark hotel lobby lit by emergency lights and candles, guests with phone torches',
    text: ['A fault has tripped the electrics and half of the hotel is in darkness. Emergency lights are on.',
      'The fuse board has failed. Lifts, lights and the kettle in every room are dead.']
  }),
  breakdown({
    id: 'fire-alarm-fault', title: 'Fire alarm fault', imgPrompt: 'Photorealistic hotel corridor, fire alarm panel showing a fault light, ceiling smoke detector, calm guests watching',
    text: ['The fire alarm panel is showing a fault and has gone off twice for no reason. Guests are annoyed and the alarm cannot be trusted.']
  }),
  breakdown({
    id: 'laundry-broken', title: 'Laundry machines broken', sev: 'Minor', imgPrompt: 'Photorealistic hotel laundry room with a broken industrial washing machine and piles of dirty towels',
    text: ['The big washing machine has died. Towels and sheets are piling up and the housekeepers cannot keep up.']
  }),
  breakdown({
    id: 'roof-leak', title: 'Roof leak', sev: 'Serious', imgPrompt: 'Photorealistic hotel top floor room with water dripping from the ceiling into a bucket, stained plaster, rainy window',
    text: ['Heavy rain has found a hole in the roof. Water is dripping into a top-floor room and the ceiling is stained.',
      'A section of roof tiles has slipped in the wind. Rain is coming through the ceiling.']
  })
);

/* ---------- Other maintenance and facility situations ---------- */
SCENARIOS.push(
  {
    id: 'pest-sighting', cat: 'Facilities', sev: 'Serious', img: 'pest-sighting', title: 'Pests in the kitchen', needs: ['asset:kitchen'], minDay: 3,
    imgPrompt: 'Photorealistic commercial hotel kitchen at night, a small mouse near a stainless steel counter, chef pointing, cinematic lighting',
    text: ['Your Chef has spotted droppings behind the storeroom shelving. There is a pest problem in the kitchen.',
      'A mouse ran across the kitchen floor during lunch service. A kitchen assistant has been shaken up.'],
    init: () => ({ pest: rndRange(140, 260) }),
    options: [
      { label: c => `Call pest control (${money(c.d.pest)})`, cost: c => c.d.pest, hint: 'Professional treatment and a certificate.',
        run: (c, A) => { A.wear('kitchen', 10); return 'Pest control treated the kitchen and sealed the gaps. You get a certificate to show inspectors.'; } },
      { label: 'Deep clean with {s} and {s2}', staff: ['Housekeeper', 'Chef'], cost: 30, hint: 'Cheaper, but it may not fix everything.',
        run: (c, A) => { if (A.roll(0.6)) { A.wear('kitchen', 8); return 'A deep clean and new traps seem to have solved it.'; } A.wear('kitchen', -12); return 'The deep clean helped, but there are still signs of mice.'; } },
      { label: 'Keep quiet and carry on', hint: 'Risky if an inspector or guest finds out.',
        run: (c, A) => { A.wear('kitchen', -15); if (A.roll(0.35)) { A.review(1, 'We saw a mouse near the dining room.'); } return 'You hope nobody notices. The problem gets worse.'; } }
    ],
    ignore: (c, A) => { A.wear('kitchen', -15); A.review(2, 'Hygiene concerns in the restaurant.'); }
  },
  {
    id: 'broken-window', cat: 'Facilities', sev: 'Serious', img: 'broken-window', title: 'Smashed window', needs: ['emptyRoom'],
    imgPrompt: 'Photorealistic hotel room with a smashed window, glass on the carpet and net curtain blowing in the wind',
    text: ['A window in {room} has been smashed overnight. Glass is all over the carpet and the room is cold.',
      'A stray football has gone through the window of {room}. Nobody was hurt but the room cannot be used.'],
    init: () => ({ cost: rndRange(120, 260) }),
    options: [
      { label: 'Get {s} to board it up and repair it', staff: 'Maintenance', cost: c => Math.round(c.d.cost * 0.6), hint: 'Parts only.', run: (c, A) => 'The window is fixed and the room is ready again.' },
      { label: c => `Hire a glazier (${money(Math.round(c.d.cost * 1.4))})`, cost: c => Math.round(c.d.cost * 1.4), run: () => 'The glazier replaced the window the same day.' },
      { label: 'Close the room until it is repaired', hint: 'A repair job is added to Tasks.', run: (c, A) => { A.damageRoom(c.room, c.d.cost); return 'You close the room and tape up the frame.'; } }
    ],
    ignore: (c, A) => { A.damageRoom(c.room, c.d.cost); }
  },
  {
    id: 'lights-out', cat: 'Facilities', sev: 'Minor', img: 'lights-out', title: 'Corridor lights failing', needs: [],
    imgPrompt: 'Photorealistic hotel corridor with several flickering and dead ceiling lights, long carpeted hallway',
    text: ['Several corridor lights have blown and guests are complaining that the hallway feels unsafe.'],
    options: [
      { label: 'Get {s} to replace the bulbs', staff: 'Maintenance', cost: 15, run: (c, A) => { A.wear('electrics', 10); return 'Fresh bulbs and a quick check of the wiring. The corridors are bright again.'; } },
      { label: 'Do it later', hint: 'Slightly unhappy guests.', run: (c, A) => { A.moodAll(-2); return 'You make a note to sort it out soon.'; } }
    ],
    ignore: (c, A) => { A.moodAll(-3); }
  },
  {
    id: 'gas-smell', cat: 'Safety', sev: 'Urgent', img: 'gas-smell', title: 'Smell of gas', needs: [], minDay: 4, w: 0.7,
    imgPrompt: 'Photorealistic hotel kitchen corridor, a worried chef sniffing near a gas pipe, a gas valve with a yellow warning sign',
    text: ['A member of staff reports a smell of gas near the kitchen. This is a safety emergency.'],
    options: [
      { label: 'Evacuate the area and call the gas emergency line', hint: 'Always the safest choice. Free, but guests will be inconvenienced.',
        run: (c, A) => { A.moodAll(-5, 'evacuation'); A.wear('kitchen', 5); return 'Everyone was moved outside, the gas supplier found a loose fitting and made it safe. Good call.'; } },
      { label: 'Get {s} to check it quickly', staff: 'Maintenance', hint: 'Fast, but is it safe to guess?',
        run: (c, A, st) => { if (A.roll(0.5 + 0.08 * st.skill)) { return '{s} found a loose connector and tightened it. The smell has gone, but you were lucky.'; } A.pay(250, 'Emergency call-out and safety fine'); A.review(2, 'Management did not take a gas smell seriously.'); return '{s} could not find the leak and the gas company had to be called anyway. You are fined for not evacuating.'; } },
      { label: 'Ignore it', hint: 'Never ignore the smell of gas.',
        run: (c, A) => { A.pay(500, 'Safety fine'); A.review(1, 'Dangerous. Staff ignored a gas leak.'); A.moodAll(-15); return 'An inspector heard about it and fined the hotel heavily. Safety must always come first.'; } }
    ],
    ignore: (c, A) => { A.pay(500, 'Safety fine'); A.review(1, 'Dangerous. Staff ignored a gas leak.'); }
  },
  {
    id: 'graffiti', cat: 'Facilities', sev: 'Minor', img: 'graffiti', title: 'Graffiti on the front wall', needs: [],
    imgPrompt: 'Photorealistic elegant hotel front facade with spray-painted graffiti on a stone wall near the entrance, morning light',
    text: ['Someone has sprayed graffiti on the front wall of the hotel. It does not look good for arriving guests.'],
    options: [
      { label: 'Get {s} to paint over it', staff: 'Maintenance', cost: 40, run: () => 'The wall looks as good as new.' },
      { label: 'Hire a cleaning company (£120)', cost: 120, run: () => 'A specialist company removed it completely.' },
      { label: 'Leave it', hint: 'Fewer bookings for a few days.', run: (c, A) => { A.demand(-1, 3); return 'The wall stays as it is. You notice fewer enquiries.'; } }
    ],
    ignore: (c, A) => { A.demand(-1, 3); }
  },
  {
    id: 'swan-in-pool', cat: 'Facilities', sev: 'Minor', img: 'swan-in-pool', title: 'A swan has landed in the pool', needs: ['asset:pool'],
    imgPrompt: 'Photorealistic hotel outdoor pool with a white swan floating in the water, amused guests with phones on sun loungers',
    text: ['A large swan has decided to take a dip in the hotel pool. Guests are delighted, though the swan is not leaving.'],
    options: [
      { label: 'Call the wildlife rescue', run: () => 'The rescue team arrived and gently moved the swan to the nearby river.' },
      { label: 'Let {s} shoo it away', staff: 'Maintenance', run: (c, A, st) => { if (A.roll(0.5)) return 'The swan flapped away after a stand-off with {s}.'; A.wear('pool', -10); return 'The swan hissed at {s} and left feathers all over the pool. It needs a clean.'; } },
      { label: 'Let guests enjoy the moment', hint: 'Guests love it, but the pool gets messy.', run: (c, A) => { A.moodAll(8, 'unexpected wildlife'); A.wear('pool', -8); A.review(5, 'A swan joined us in the pool. Brilliant!'); return 'Photos of the swan go round social media. The pool needs cleaning afterwards.'; } }
    ],
    ignore: (c, A) => { A.wear('pool', -8); }
  },
  {
    id: 'laundry-shortage', cat: 'Facilities', sev: 'Minor', img: 'laundry-shortage', title: 'Running short of towels', needs: ['asset:laundry'],
    imgPrompt: 'Photorealistic hotel linen cupboard with half-empty shelves, a housekeeper holding the last folded towel',
    text: ['The linen cupboard is nearly empty. There are not enough clean towels for tomorrow.'],
    options: [
      { label: 'Use a laundry service for a day (£90)', cost: 90, run: (c, A) => 'A commercial laundry collected the dirty linen and delivered it back by evening.' },
      { label: 'Get {s} to do extra washing', staff: 'Housekeeper', run: (c, A) => { A.wear('laundry', -8); return '{s} ran the machines all day. It worked, but the machines are wearing out.'; } },
      { label: 'Carry on and hope', run: (c, A) => { A.moodAll(-4, 'towel shortage'); return 'Some rooms go without extra towels.'; } }
    ],
    ignore: (c, A) => { A.moodAll(-4); }
  },
  {
    id: 'storm-warning', cat: 'Facilities', sev: 'Serious', img: 'storm-warning', title: 'Storm warning', needs: ['asset:roof'], minDay: 3,
    imgPrompt: 'Photorealistic hotel exterior under dark storm clouds with trees bending in strong wind, warm lit windows',
    text: ['The weather service has issued a storm warning for tonight. Loose tiles and windows could be at risk.'],
    options: [
      { label: 'Get {s} to secure the roof and windows', staff: 'Maintenance', cost: 40, run: (c, A) => { A.wear('roof', 10); return '{s} checked every tile and shutter. The hotel rides out the storm without a problem.'; } },
      { label: 'Hire roofers for a full check (£140)', cost: 140, run: (c, A) => { A.wear('roof', 35); return 'The roofers re-fixed loose tiles and sealed the flashing.'; } },
      { label: 'Hope for the best', run: (c, A) => { if (A.roll(0.4)) { A.breakAsset('roof'); return 'The storm lifted tiles and rain is coming through. The roof is now broken.'; } return 'You get away with it this time.'; } }
    ],
    ignore: (c, A) => { A.wear('roof', -15); }
  }
);
