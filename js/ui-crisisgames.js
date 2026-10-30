'use strict';

/* ================= The skill games for crisis actions =================
   Four short games replace the dice: stop the marker in the green (timing), tap every patch before time runs out (tap), pick the best of three
   replies (choice), and put the steps in order (order). Experience and the right trait make each one easier (see crisisGameSpec). Whatever she
   plays, or if she would rather not, she can leave it to chance from inside the pop-up. The rules and the judging are in engine-crises.js;
   this file only draws the games and passes what she did to crisisJudge. ui.game holds the game being played. */

const GAME_HELP = { timing: 'Press Stop when the moving marker is inside the green zone. The middle is a perfect hit.', tap: 'Tap each patch again and again. It fades a little with every tap and is gone after about ten. Clear them all before the time runs out.', choice: 'Read each answer, then pick the best one. A weaker answer only half works, and a wrong one makes things worse.', order: 'Tap the steps in the order they should happen.', maths: 'A quick sum comes up as you do this job. Work out the answer and pick it before the time runs out. An answer in the first half of the time is perfect.' };
/* Optional artwork, in assets/games (see GAME-ART.md). Each game may have a scene behind it (<crisis>-<action>-bg.jpg), the moving timing games
   a set of pictures that swap as the marker moves (-f1.webp, -f2.webp and so on, the middle one is the "just right" pose), and the tapping games
   a transparent picture for each patch (patch-wet.webp, patch-crumb.webp, patch-leaf.webp). Whatever is missing is simply not drawn, so every game works with no
   artwork at all. What exists is found out just before the game opens. */
const GAME_ART = { 'pipe-valve': { frames: 7 }, 'power-generator': { frames: 7 }, 'roof-tarp': { frames: 7 }, 'pipe-dry': { patch: 'wet' }, 'roof-dry': { patch: 'wet' }, 'mice-clean': { patch: 'crumb' },
  'lift-doors': { frames: 7 }, 'lock-pick': { frames: 7 }, 'pool-skim': { patch: 'leaf' } };
const PATCH_SLOTS = [[16, 30], [48, 22], [80, 34], [26, 66], [58, 72], [84, 64]];   // where the patches sit on a scene, as percentages
const artSrc = (key, file) => `assets/games/${key}-${file}`;
const loadsOk = src => new Promise(res => { const i = new Image(), t = setTimeout(() => res(false), 1500); i.onload = () => { clearTimeout(t); res(true); }; i.onerror = () => { clearTimeout(t); res(false); }; i.src = src; });
async function probeArt(key) {
  const meta = GAME_ART[key] || {}, files = Array.from({ length: meta.frames || 0 }, (_, i) => artSrc(key, `f${i + 1}.webp`)), patchSrc = meta.patch ? `assets/games/patch-${meta.patch}.webp` : null;
  const [bg, patch, ...found] = await Promise.all([loadsOk(artSrc(key, 'bg.jpg')), patchSrc ? loadsOk(patchSrc) : false, ...files.map(loadsOk)]);
  return { key, bg: bg ? artSrc(key, 'bg.jpg') : null, patch: patch ? patchSrc : null, frames: files.filter((_, i) => found[i]) };
}
/* A patch fades with every tap, from solid to almost clear on the last one. */
const patchFade = (g, i) => (1 - ((g.hits && g.hits[i]) || 0) / g.spec.taps * 0.9).toFixed(2);
const fxAttr = art => art && art.key ? ` data-fx="${esc(art.key)}"` : '';   // asks ui-fx.js for this picture's light effects
const artImg = (src, cls) => `<img class="${cls}" src="${esc(src)}" alt="" draggable="false">`;
const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

actions.crisisPlay = async d => {
  const c = crisisById(Number(d.id)), def = c && CRISES[c.key], a = def && crisisActionsOf(def).find(x => x.key === d.key);
  if (!a || !a.game) return toast('That crisis has ended.', 'bad');
  const st = crisisActionState(c, a);
  if (!st.ok) return toast(st.reason, 'bad');
  const staff = a.role ? st.staff.map(x => x.s).find(s => s.id === Number(d.staff)) : null;
  if (a.role && !staff) return toast('Choose who will do it.', 'bad');
  if (ui.probing) return;
  ui.probing = true;
  const art = await probeArt(`${c.key}-${a.key}`);   // which pictures exist for this game
  ui.probing = false;
  if (!crisisById(c.id)) return;
  const memoKey = `${c.id}:${a.key}:${S.day}:${staff ? staff.id : ''}`, memo = ui.askedToday || (ui.askedToday = {});   // closing and reopening gives the same question, so it cannot be re-rolled for an easier one
  const spec = memo[memoKey] || crisisGameSpec(a, staff);
  if (['choice', 'maths', 'order'].includes(spec.type)) memo[memoKey] = spec;
  if (spec.type === 'timing' && art.frames.length >= 2) spec.center = 0.5;   // the middle picture is the "just right" pose
  ui.game = { id: c.id, key: a.key, staffId: staff ? staff.id : undefined, label: a.label, spec, odds: crisisOdds(a, staff), who: staff ? staff.id : null, art, pos: 0, frozen: false, tapped: [], hits: {}, taps: 0, left: spec.seconds || 0, picked: null, next: 0, mistakes: 0, done: [] };
  openModal({ type: 'crisisGame' });
};
/* The game is over: hand the result to the engine. */
function finishCrisisGame(result, extra) {
  const g = ui.game;
  if (!g) return;
  noteGame(g.spec, result, extra);
  ui.game = null; ui.modal = null;
  crisisOutcome(doCrisisAction(g.id, g.key, g.staffId, result));
}
actions.crisisSkip = () => {   // leave it to chance
  const g = ui.game;
  if (!g) return;
  ui.game = null; ui.modal = null;
  crisisOutcome(doCrisisAction(g.id, g.key, g.staffId));
};
actions.crisisCancel = () => { ui.game = null; closeModal(); };

/* ---------- Drawing ---------- */
const frameIndex = (g, n) => Math.round(g.pos * (n - 1));
function gameBody(g) {
  const sp = g.spec, art = g.art || { bg: null, patch: null, frames: [] };
  const banner = art.bg ? `<div class="gstage banner"${fxAttr(art)}>${artImg(art.bg, 'gbg')}</div>` : '';
  if (sp.type === 'timing') return `${art.frames.length ? `<div class="gstage"${fxAttr(art)}>${art.bg ? artImg(art.bg, 'gbg') : ''}${art.frames.map((src, i) => artImg(src, `gframe${i === frameIndex(g, art.frames.length) ? ' on' : ''}`)).join('')}</div>` : banner}<div class="tg-bar" aria-hidden="true"><div class="tg-zone" style="left:${((sp.center - sp.zone / 2) * 100).toFixed(2)}%;width:${(sp.zone * 100).toFixed(2)}%"></div><div class="tg-mark" id="tgMark" style="left:${(g.pos * 100).toFixed(2)}%"></div></div>
    <div class="actions" style="justify-content:center"><button class="btn primary big" data-act="tgStop" data-autofocus>Stop!</button></div>`;
  if (sp.type === 'tap') {
    const slots = Array.from({ length: sp.patches }, (_, i) => i), inner = i => art.patch ? artImg(art.patch, 'patchimg') : '';
    const head = `<div class="row small"><span id="tapTime"><b>${g.left.toFixed(1)}</b> seconds left</span><span class="muted right">${g.tapped.length} of ${sp.patches} cleared</span></div><div class="bar" style="margin:6px 0"><i id="tapBar" style="width:${Math.max(0, g.left / sp.seconds * 100)}%"></i></div>`;
    if (art.bg) return `${head}<div class="gstage tapstage"${fxAttr(art)}>${artImg(art.bg, 'gbg')}${slots.map(i => g.tapped.includes(i) ? '' : `<button class="patch ${art.patch ? 'art' : ''}" data-act="tapPatch" data-i="${i}" aria-label="Patch ${i + 1}" style="opacity:${patchFade(g, i)};left:${PATCH_SLOTS[i % PATCH_SLOTS.length][0]}%;top:${PATCH_SLOTS[i % PATCH_SLOTS.length][1]}%">${inner(i)}</button>`).join('')}</div>`;
    return `${head}<div class="patches">${slots.map(i => g.tapped.includes(i) ? '<span class="patch gone"></span>' : `<button class="patch ${art.patch ? 'art' : ''}" data-act="tapPatch" data-i="${i}" aria-label="Patch ${i + 1}" style="opacity:${patchFade(g, i)};--j:${(i * 37) % 13}">${inner(i)}</button>`).join('')}</div>`;
  }
  if (sp.type === 'choice') {
    if (g.picked !== null) {
      const o = sp.options[g.picked], msg = o.score === 2 ? 'The best answer!' : o.score === 1 ? 'That works, but only half as well as the best answer.' : 'That did not help, and it upset the guests.';
      return `${banner}<div class="stack">${sp.options.map((x, i) => `<div class="opt ${i === g.picked ? 'picked' : ''}" style="cursor:default"><span class="t">${esc(x.t)}${i === g.picked ? `<span class="why ${o.score === 2 ? 'good' : o.score === 1 ? 'warn' : ''}">${msg}</span>` : ''}</span></div>`).join('')}</div>
        <div class="actions"><button class="btn primary big" data-act="gameDone" data-autofocus>Continue</button></div>`;
    }
    return `${banner}${sp.hint ? `<div class="small muted" style="margin-bottom:6px">Your experience rules out the worst answer.</div>` : ''}<div class="stack">${sp.options.map((x, i) => `<button class="opt" data-act="gameChoice" data-i="${i}"><span class="t">${esc(x.t)}</span></button>`).join('')}</div>`;
  }
  if (sp.type === 'maths') {
    if (g.picked !== null) {
      const right = sp.options.findIndex(o => o.correct);
      return `${banner}<div class="stack">${sp.options.map((x, i) => `<div class="opt ${i === g.picked ? 'picked' : ''}" style="cursor:default"><span class="t">${esc(x.t)}${i === right ? '<span class="why good">The right answer</span>' : i === g.picked ? '<span class="why">Not quite</span>' : ''}</span></div>`).join('')}</div>
        <div class="small" style="margin:10px 0 0"><b>The working:</b> ${esc(sp.explain)}</div>
        <div class="actions"><button class="btn primary big" data-act="gameDone" data-autofocus>Continue</button></div>`;
    }
    const head = `<div class="row small"><span id="tapTime"><b>${g.left.toFixed(1)}</b> seconds left</span></div><div class="bar" style="margin:6px 0"><i id="tapBar" style="width:${Math.max(0, g.left / sp.seconds * 100)}%"></i></div>`;
    return `${banner}${head}${sp.hint ? '<div class="small muted" style="margin-bottom:6px">Your experience rules out one wrong answer.</div>' : ''}<div class="stack">${sp.options.map((x, i) => `<button class="opt" data-act="gameChoice" data-i="${i}"><span class="t">${esc(x.t)}</span></button>`).join('')}</div>`;
  }
  if (sp.type === 'order') {
    return `${banner}${sp.hint ? `<div class="small muted" style="margin-bottom:6px">Your experience shows you the first step: <b>${esc(sp.steps.find(s => s.i === 0).t)}</b></div>` : ''}<div class="stack">${sp.steps.map(s => g.done.includes(s.i) ? `<div class="opt picked" style="cursor:default"><span class="t">${g.done.indexOf(s.i) + 1}. ${esc(s.t)}</span></div>` : `<button class="opt" data-act="gameStep" data-i="${s.i}"><span class="t">${esc(s.t)}</span></button>`).join('')}</div>
      <div class="small muted" style="margin-top:6px">Wrong taps so far: <b>${g.mistakes}</b></div>`;
  }
  return '';
}
MODALS.crisisGame = () => {
  const g = ui.game;
  if (!g) return null;
  const sp = g.spec, who = g.who ? staffById(g.who) : null;
  const prompt = sp.type === 'choice' || sp.type === 'order' || sp.type === 'maths' ? sp.prompt : sp.what;
  return { inner: `<div class="chip good">${GAME_NAMES[sp.type]}</div><h2 style="margin:6px 0">${esc(g.label)}</h2>
    ${who ? `<div class="row small" style="margin-bottom:6px">${avatar(who, 'sm')}<b>${esc(who.name)}</b><span class="stars">${stars(who.skill)}</span>${sp.helped ? `<span class="chip good">${esc(who.trait)}: ${TRAIT_HELP[sp.type]}</span>` : ''}</div>` : ''}
    <p style="margin:0 0 4px"><b>${esc(prompt)}</b></p><p class="muted small" style="margin:0 0 10px">${GAME_HELP[sp.type]}</p>
    ${gameBody(g)}
    ${g.picked !== null ? '' : `<div class="actions" style="margin-top:14px"><button class="btn ghost" data-act="crisisCancel">Not now</button><button class="btn ghost" data-act="crisisSkip">Leave it to chance (${pct(g.odds)})</button></div>`}` };   // once an answer is picked there is only Continue, so a bad result cannot be swapped for the dice
};

/* ---------- Playing ---------- */
const tapRate = g => g.taps / Math.max(0.5, g.spec.seconds - g.left);   // taps a second over the time the player actually took
actions.tgStop = () => { const g = ui.game; if (g && g.spec.type === 'timing') finishCrisisGame(crisisJudge(g.spec, g.pos), { value: Math.abs(g.pos - g.spec.center) * g.spec.sweepMs }); };
actions.tapPatch = d => {
  const g = ui.game, i = Number(d.i);
  if (!g || g.spec.type !== 'tap' || g.tapped.includes(i)) return;
  g.hits[i] = (g.hits[i] || 0) + 1; g.taps++;
  if (g.art && g.art.bg) { const slot = PATCH_SLOTS[i % PATCH_SLOTS.length]; fxBurst(g.art.key, (GAME_ART[g.art.key] || {}).patch === 'crumb' ? 'dust' : 'ripple', slot[0] / 100, slot[1] / 100, g.hits[i] >= g.spec.taps); }   // water ripples, or dust for crumbs
  const el = document.querySelector(`.modal .patch[data-i="${i}"]`);   // only this patch is redrawn, so rapid tapping stays smooth
  if (g.hits[i] < g.spec.taps) { if (el) el.style.opacity = patchFade(g, i); return; }
  g.tapped.push(i);
  if (g.tapped.length >= g.spec.patches) return finishCrisisGame(crisisJudge(g.spec, { tapped: g.tapped.length, left: g.left }), { value: tapRate(g) });
  render();
};
actions.gameChoice = d => { const g = ui.game; if (g && (g.spec.type === 'choice' || g.spec.type === 'maths') && g.picked === null) { g.picked = Number(d.i); if (g.spec.type === 'maths') g.frozen = true; render(); } };
actions.gameDone = () => { const g = ui.game; if (g && g.picked !== null) finishCrisisGame(crisisJudge(g.spec, g.spec.type === 'maths' ? { index: g.picked, left: g.left } : g.picked), g.spec.type === 'maths' ? { value: g.spec.seconds - g.left } : undefined); };
actions.gameStep = d => {
  const g = ui.game;
  if (!g || g.spec.type !== 'order') return;
  if (Number(d.i) === g.next) { g.done.push(Number(d.i)); g.next++; } else { g.mistakes++; toast('Not that one yet.', 'bad'); }
  if (g.next >= g.spec.count) return finishCrisisGame(crisisJudge(g.spec, g.mistakes));
  render();
};

/* The marker sweeps back and forth, and the tapping game counts down. They redraw only their own bits, never the whole screen. */
let gameFrame = null, gameClock = null;
function gameLoops() {
  const g = ui.game, live = g && ui.modal && ui.modal.type === 'crisisGame';
  if (!live) { if (gameFrame) cancelAnimationFrame(gameFrame); if (gameClock) clearInterval(gameClock); gameFrame = gameClock = null; return; }
  if (g.spec.type === 'timing' && !gameFrame) {
    const t0 = performance.now(), slow = reducedMotion() ? 2 : 1;
    const step = now => {
      const cur = ui.game;
      if (!cur || cur !== g || !ui.modal || ui.modal.type !== 'crisisGame') { gameFrame = null; return; }
      if (!cur.frozen) { const x = ((now - t0) / (cur.spec.sweepMs * slow)) % 2; cur.pos = x <= 1 ? x : 2 - x; }
      const el = document.getElementById('tgMark');
      if (el) el.style.left = (cur.pos * 100).toFixed(2) + '%';
      const fr = document.querySelectorAll('.gframe');   // the picture follows the marker
      if (fr.length) { const idx = frameIndex(cur, fr.length); fr.forEach((f, i) => f.classList.toggle('on', i === idx)); }
      gameFrame = requestAnimationFrame(step);
    };
    gameFrame = requestAnimationFrame(step);
  }
  if ((g.spec.type === 'tap' || g.spec.type === 'maths') && !gameClock) {
    let last = performance.now();
    gameClock = setInterval(() => {
      const cur = ui.game;
      if (!cur || cur !== g || !ui.modal || ui.modal.type !== 'crisisGame') { clearInterval(gameClock); gameClock = null; return; }
      const now = performance.now(); if (!cur.frozen) cur.left = Math.max(0, cur.left - (now - last) / 1000); last = now;
      const t = document.getElementById('tapTime'), b = document.getElementById('tapBar');
      if (t) t.innerHTML = `<b>${cur.left.toFixed(1)}</b> seconds left`;
      if (b) b.style.width = Math.max(0, cur.left / cur.spec.seconds * 100) + '%';
      if (cur.left <= 0) { clearInterval(gameClock); gameClock = null; if (cur.spec.type === 'maths') finishCrisisGame(crisisJudge(cur.spec, { index: null, left: 0 }), { value: cur.spec.seconds }); else finishCrisisGame(crisisJudge(cur.spec, { tapped: cur.tapped.length, left: 0 }), { value: tapRate(cur) }); }
    }, 100);
  }
}
AFTER_RENDER.push(gameLoops);
