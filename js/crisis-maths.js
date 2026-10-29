'use strict';
/* ================= The maths questions for the crisis maths game (no DOM access) =================
   Twenty hotel questions on money, percentages, ratios, fractions, time and sums. Each one is a template: every time it is asked the numbers
   are drawn at random, so the answer cannot be learned by heart and is worked out by the game, not typed in. Each question has one right
   answer and three wrong ones that are the mistakes people really make (a decimal slip, forgetting a step, adding instead of taking away),
   so a guess does not work and a slip is easy to understand from the working that is shown afterwards.
   The wording is plain and British ("lift", pounds). Nothing here is about anyone being hurt.
   mathsQuestion(tags) returns { prompt, options: [{ t, correct }] (four, shuffled), explain, tags } for a template that matches one of the tags,
   never the one asked last time. No loops that depend on Math.random, so the tests can fix the random numbers. */
const MATHS_TAGS = ['money', 'food', 'rooms', 'time', 'concierge', 'pool'];

const mDraw = list => list[Math.floor(Math.random() * list.length)];
const mShuffle = list => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const mThousands = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const mGbp = n => '£' + mThousands(n);
const mClock = min => { const t = ((min % 1440) + 1440) % 1440, h = Math.floor(t / 60), m = t % 60; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const mDuration = min => { const h = Math.floor(min / 60), m = min % 60; return [h ? `${h} hour${h > 1 ? 's' : ''}` : '', m ? `${m} minutes` : ''].filter(Boolean).join(' '); };

/* Three wrong answers (as text) from the mistakes people make, never the right one, never repeated, whole and above zero; topped up
   with near misses if some of the mistakes turn out to be the same number. */
function mWrong(correct, mistakes, fmt) {
  const out = [], seen = new Set([fmt(correct)]);
  for (const w of mistakes.concat([correct + 10, correct - 10, correct + 5, correct - 5, correct + 2, correct - 2, correct + 1, correct - 1, correct * 2, correct + 20])) {
    const t = Number.isInteger(w) && w > 0 ? fmt(w) : null;
    if (t && !seen.has(t)) { seen.add(t); out.push(t); }
    if (out.length === 3) break;
  }
  return out;
}
/* Three wrong answers that are sentences: the mistakes in order, never the right one, never repeated. */
const mTexts = (correct, candidates) => candidates.filter((t, i, all) => t !== correct && all.indexOf(t) === i).slice(0, 3);
const mAsk = (tags, prompt, correct, wrong, explain) => ({ tags, prompt, explain, options: mShuffle([{ t: correct, correct: true }].concat(wrong.map(t => ({ t, correct: false })))) });
const mNum = (tags, prompt, answer, mistakes, fmt, explain) => mAsk(tags, prompt, fmt(answer), mWrong(answer, mistakes, fmt), explain);

const MATHS = [
  // ----- money -----
  () => { const bill = mDraw([200, 300, 400, 500, 600]), pc = mDraw([10, 20, 25]), tip = bill * pc / 100, by = pc === 10 ? 10 : pc === 20 ? 5 : 4;
    return mNum(['money'], `The VIP guest in the Penthouse paid their ${mGbp(bill)} room service bill and left a ${pc}% tip. How much is the tip?`, tip, [tip * 10, tip * 2, tip / 2], mGbp,
      `${pc}% of ${mGbp(bill)}: ${pc}% is one ${by === 10 ? 'tenth' : by === 5 ? 'fifth' : 'quarter'}, so divide by ${by}. ${mGbp(bill)} ÷ ${by} = ${mGbp(tip)}.`); },
  () => { const note = mDraw([50, 100, 200]), price = mDraw([35, 55, 65, 85, 95, 115, 135, 145, 165, 185].filter(p => p < note)), change = note - price;
    return mNum(['money'], `A guest pays for a ${mGbp(price)} luxury massage with a ${mGbp(note)} note. How much change do you give back?`, change, [change + 10, change - 10, change + 5], mGbp,
      `${mGbp(note)} − ${mGbp(price)} = ${mGbp(change)}. To check, count up from ${mGbp(price)} to ${mGbp(note)}.`); },
  () => { const pc = mDraw([10, 20, 50]), cost = mDraw([40, 60, 80, 100, 120]), save = cost * pc / 100;
    return mNum(['money', 'food'], `A loyal guest has a gold card for ${pc}% off. Their dinner costs ${mGbp(cost)}. How much do they save?`, save, [cost - save, save * 10, save * 2], mGbp,
      `${pc}% of ${mGbp(cost)} = ${mGbp(save)}. That is the saving. What they pay is ${mGbp(cost)} − ${mGbp(save)} = ${mGbp(cost - save)}.`); },
  () => { const n = mDraw([3, 4, 5, 6, 7]), rate = mDraw([120, 150, 180, 200, 250, 350, 400]), total = n * rate;
    return mNum(['money', 'concierge'], `A pop star books the Royal Suite for ${n} nights at ${mGbp(rate)} a night. What is the total cost?`, total, [n + rate, (n - 1) * rate, (n + 1) * rate], mGbp,
      `${n} nights × ${mGbp(rate)} = ${mGbp(total)}.`); },
  () => { const k = mDraw([3, 4, 5, 6]), each = mDraw([12, 15, 18, 20]), extra = mDraw([8, 10, 12, 15]), total = k * each + extra;
    return mNum(['money', 'food'], `A family of ${k} has the breakfast buffet at ${mGbp(each)} each, plus a fruit platter for ${mGbp(extra)}. What is the total bill?`, total, [k * (each + extra), each + extra, k * each], mGbp,
      `${k} × ${mGbp(each)} = ${mGbp(k * each)}, then add the platter: ${mGbp(k * each)} + ${mGbp(extra)} = ${mGbp(total)}.`); },
  // ----- food and drink -----
  () => { const parts = mDraw([2, 3, 4, 5]), unit = mDraw([50, 100, 150]), mango = parts * unit;
    return mNum(['food'], `The Sunset Mocktail is ${parts} parts mango juice to 1 part sparkling water. You use ${mango}ml of mango juice. How much sparkling water do you add?`, unit, [mango / (parts + 1), mango, unit * 2], n => `${n}ml`,
      `${mango}ml of mango is ${parts} parts, so 1 part is ${mango}ml ÷ ${parts} = ${unit}ml.`); },
  () => { const box = mDraw([12, 18, 24]), left = box / 6, eaten = box / 2 + box / 3;
    return mNum(['food'], `A box has ${box} chocolates. A couple eat half of the box on Friday and a third of the box on Saturday. How many are left on Sunday?`, left, [eaten, box / 3, box / 2], n => `${n} chocolates`,
      `Half of ${box} is ${box / 2} and a third is ${box / 3}, so ${eaten} are eaten. ${box} − ${eaten} = ${left} left.`); },
  () => { const [slices, kids] = mDraw([[12, 3], [12, 4], [12, 6], [16, 4], [20, 4], [20, 5], [24, 3], [24, 4], [24, 6]]), each = slices / kids;
    return mNum(['food'], `A pizza has ${slices} slices and is shared equally between ${kids} children. How many slices does each child get?`, each, [slices - kids, kids, slices / 2], n => `${n} slices`,
      `${slices} ÷ ${kids} = ${each} slices each.`); },
  () => { const rooms = mDraw([6, 8, 9, 10, 12]), water = mDraw([2, 3, 4]), bars = mDraw([1, 2, 3]), total = rooms * (water + bars);
    return mNum(['food', 'rooms'], `You restock ${rooms} mini-fridges. Each gets ${water} bottles of water and ${bars} chocolate bar${bars > 1 ? 's' : ''}. How many items do you load onto the trolley?`, total, [rooms * water, rooms * bars, rooms + water + bars], n => `${n} items`,
      `${water} + ${bars} = ${water + bars} items for each fridge, and ${rooms} × ${water + bars} = ${total} items.`); },
  // ----- pool -----
  () => { const [litres, per] = mDraw([[2000, 100], [3000, 100], [4000, 200], [5000, 100], [5000, 250], [8000, 200], [8000, 250]]), need = litres / per;
    return mNum(['pool'], `The pool needs 1 litre of chlorine for every ${per} litres of water. It holds ${mThousands(litres)} litres. How many litres of chlorine do you add?`, need, [need * 10, need * 2, litres / (per * 10)], n => `${n} litres`,
      `${mThousands(litres)} ÷ ${per} = ${need} litres.`); },
  // ----- housekeeping and rooms -----
  () => { const each = mDraw([12, 15, 20, 25]), rooms = mDraw([3, 4, 5, 6]), total = each * rooms;
    return mNum(['rooms', 'time'], `A housekeeper takes ${each} minutes to clean one room. How many minutes will ${rooms} rooms take?`, total, [each + rooms, each * (rooms - 1), each * (rooms + 1)], n => `${n} minutes`,
      `${rooms} × ${each} = ${total} minutes${total >= 60 ? `, which is ${mDuration(total)}` : ''}.`); },
  () => { const start = mDraw([120, 150, 200, 250]), lost = mDraw([8, 12, 15, 20]), used = mDraw([30, 45, 60]), left = start - lost - used;
    return mNum(['rooms'], `You start the week with ${start} blank room keys. Guests lose ${lost} and you use ${used} for new check-ins. How many blank keys are left?`, left, [start - lost, start - used, start - lost + used], n => `${n} keys`,
      `${lost} + ${used} = ${lost + used} keys gone, so ${start} − ${lost + used} = ${left}.`); },
  () => { const suites = mDraw([8, 10, 12, 15]), bath = mDraw([2, 3, 4]), total = suites * bath;
    return mNum(['rooms'], `Each of the hotel's ${suites} luxury suites gets ${bath} bath towels and 2 hand towels. How many bath towels does the laundry need to wash for all the suites?`, total, [suites * (bath + 2), suites + bath, total * 2], n => `${n} bath towels`,
      `${suites} × ${bath} = ${total} bath towels. The hand towels are not counted.`); },
  () => { const [roses, per] = mDraw([[40, 6], [50, 8], [50, 6], [60, 8], [70, 8], [70, 9], [75, 8], [45, 6]]), full = Math.floor(roses / per), rest = roses % per;
    const text = (a, b) => `${a} full vase${a === 1 ? '' : 's'}, ${b} left over`;
    return mAsk(['rooms'], `The event planner has ${roses} white roses. Each vase holds exactly ${per}. How many full vases can be filled, and how many roses are left over?`, text(full, rest),
      mTexts(text(full, rest), [text(full + 1, 0), text(full, per - rest), text(rest, full), text(full - 1, rest + per), text(full + 1, rest)]),
      `${per} × ${full} = ${per * full}, and ${roses} − ${per * full} = ${rest} left over.`); },
  // ----- concierge, time and logic -----
  () => { const start = mDraw([9, 10, 11, 13, 14, 15, 16]) * 60 + mDraw([0, 15, 30, 45]), drive = mDraw([35, 40, 45, 50, 55]), arrive = start + drive;
    return mAsk(['time', 'concierge'], `It is ${mClock(start)}. The taxi to the airport takes ${drive} minutes. What time does the guest arrive?`, mClock(arrive), [mClock(arrive + 10), mClock(arrive - 10), mClock(arrive + 60)],
      `${mClock(start)} + ${drive} minutes = ${mClock(arrive)}. Add the minutes up to the next hour first, then the rest.`); },
  () => { const meet = mDraw([7, 8, 9, 10]) * 60 + mDraw([0, 30]), before = mDraw([45, 60, 75, 90, 120]), call = meet - before;
    return mAsk(['time', 'concierge'], `A guest has a meeting at ${mClock(meet)}. They want a wake-up call ${mDuration(before)} before. What time do you set the call?`, mClock(call), [mClock(meet + before), mClock(call + 30), mClock(call - 60)],
      `${mClock(meet)} − ${mDuration(before)} = ${mClock(call)}. Count back the hours first, then the minutes.`); },
  () => { const [cases, cart] = mDraw([[24, 6], [24, 8], [20, 4], [30, 6], [26, 6], [34, 8], [38, 8], [40, 6], [22, 5]]), trips = Math.ceil(cases / cart), exact = cases % cart === 0;
    return mNum(['concierge', 'time'], `The bellhop has ${cases} suitcases to take up, and the golden luggage cart holds ${cart} at a time. How many trips does the bellhop make?`, trips, [Math.floor(cases / cart), trips + 1, cases - cart], n => `${n} trips`,
      exact ? `${cases} ÷ ${cart} = ${trips} trips.` : `${cases} ÷ ${cart} = ${Math.floor(cases / cart)} full trips with ${cases % cart} suitcases left over, and those still need a trip: ${trips} trips.`); },
  () => { const cars = mDraw([20, 25, 30, 35, 40, 45]), wheels = cars * 4;
    return mNum(['concierge'], `The valet garage is full. The camera shows ${wheels} wheels, and every car has 4 wheels. How many cars are parked?`, cars, [wheels / 2, cars + 5, cars - 5], n => `${n} cars`, `${wheels} ÷ 4 = ${cars} cars.`); },
  () => { const cap = mDraw([350, 400, 450, 500]), w = [mDraw([60, 70, 80]), mDraw([65, 75, 85]), mDraw([55, 75, 90]), mDraw([60, 80, 95])], trolley = mDraw([40, 50, 60]), people = w.reduce((a, b) => a + b, 0);
    const total = people + trolley === cap ? people + trolley + 5 : people + trolley, diff = Math.abs(cap - total), over = total > cap;
    const say = (isOver, d) => `${isOver ? 'Yes' : 'No'}, ${d} kg ${isOver ? 'over' : 'under'} the limit`, rightText = say(over, diff);
    return mAsk(['concierge', 'rooms'], `The glass lift can carry ${cap} kg. Four guests weighing ${w[0]} kg, ${w[1]} kg, ${w[2]} kg and ${w[3]} kg get in, and a bellhop adds a luggage trolley of ${total - people} kg. Are they over the limit?`, rightText,
      mTexts(rightText, [say(!over, diff), say(over, diff + 10), say(people > cap, Math.abs(cap - people)), say(!over, diff + 5), say(over, diff + 5)]),
      `${w.join(' + ')} = ${people}, plus the trolley ${total - people} = ${total} kg. The limit is ${cap} kg, so they are ${diff} kg ${over ? 'over' : 'under'}.`); },
  () => { const per = mDraw([10, 15, 20, 25]), people = mDraw([30, 45, 50, 60, 65, 75, 80, 90]), guards = Math.ceil(people / per), exact = people % per === 0;
    return mNum(['pool', 'concierge'], `Safety rules say 1 lifeguard for every ${per} people in the pool area. There are ${people} guests at the pool party. How many lifeguards must be on duty?`, guards, [Math.floor(people / per), guards + 1, guards - 1], n => `${n} lifeguards`,
      exact ? `${people} ÷ ${per} = ${guards} lifeguards.` : `${people} ÷ ${per} = ${Math.floor(people / per)} with ${people % per} people left over, and they need a lifeguard too: ${guards} lifeguards.`); }
];

const mathsAsked = new WeakMap();
/* A question for an action whose themes are `tags`: never the template asked last time for those themes. */
function mathsQuestion(tags) {
  const last = mathsAsked.get(tags), order = mShuffle(MATHS.map((make, i) => i).filter(i => i !== last));
  for (const i of order) { const q = MATHS[i](); if (q.tags.some(t => tags.includes(t))) { mathsAsked.set(tags, i); return q; } }
  mathsAsked.set(tags, order[0]);
  return MATHS[order[0]]();
}
