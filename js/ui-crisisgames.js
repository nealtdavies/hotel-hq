'use strict';

/* ================= The skill games for crisis actions =================
   Four short games replace the dice: stop the marker in the green (timing), tap every patch before time runs out (tap), pick the best of three
   replies (choice), and put the steps in order (order). Experience and the right trait make each one easier (see crisisGameSpec). Whatever she
   plays, or if she would rather not, she can leave it to chance from inside the pop-up. The rules and the judging are in engine-crises.js;
   this file only draws the games and passes what she did to crisisJudge. ui.game holds the game being played. */

const GAME_HELP = { timing: 'Press Stop when the moving marker is inside the green zone. The middle is a perfect hit.', tap: 'Tap every patch before the time runs out.', choice: 'Read each answer, then pick the best one.', order: 'Tap the steps in the order they should happen.' };
const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

actions.crisisPlay = d => {
  const c = crisisById(Number(d.id)), def = c && CRISES[c.key], a = def && crisisActionsOf(def).find(x => x.key === d.key);
  if (!a || !a.game) return toast('That crisis has ended.', 'bad');
  const st = crisisActionState(c, a);
  if (!st.ok) return toast(st.reason, 'bad');
  const staff = a.role ? st.staff.map(x => x.s).find(s => s.id === Number(d.staff)) : null;
  if (a.role && !staff) return toast('Choose who will do it.', 'bad');
  ui.game = { id: c.id, key: a.key, staffId: staff ? staff.id : undefined, label: a.label, spec: crisisGameSpec(a, staff), odds: crisisOdds(a, staff), who: staff ? staff.id : null, pos: 0, frozen: false, tapped: [], left: 0, picked: null, next: 0, mistakes: 0, done: [] };
  ui.game.left = ui.game.spec.seconds || 0;
  openModal({ type: 'crisisGame' });
};
/* The game is over: hand the result to the engine. */
function finishCrisisGame(result) {
  const g = ui.game;
  if (!g) return;
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
function gameBody(g) {
  const sp = g.spec;
  if (sp.type === 'timing') return `<div class="tg-bar" aria-hidden="true"><div class="tg-zone" style="left:${((sp.center - sp.zone / 2) * 100).toFixed(2)}%;width:${(sp.zone * 100).toFixed(2)}%"></div><div class="tg-mark" id="tgMark" style="left:${(g.pos * 100).toFixed(2)}%"></div></div>
    <div class="actions" style="justify-content:center"><button class="btn primary big" data-act="tgStop" data-autofocus>Stop!</button></div>`;
  if (sp.type === 'tap') {
    const slots = Array.from({ length: sp.patches }, (_, i) => i);
    return `<div class="row small"><span id="tapTime"><b>${g.left.toFixed(1)}</b> seconds left</span><span class="muted right">${g.tapped.length} of ${sp.patches}</span></div><div class="bar" style="margin:6px 0"><i id="tapBar" style="width:${Math.max(0, g.left / sp.seconds * 100)}%"></i></div>
      <div class="patches">${slots.map(i => g.tapped.includes(i) ? '<span class="patch gone"></span>' : `<button class="patch" data-act="tapPatch" data-i="${i}" aria-label="Patch ${i + 1}" style="--j:${(i * 37) % 13}"></button>`).join('')}</div>`;
  }
  if (sp.type === 'choice') {
    if (g.picked !== null) {
      const o = sp.options[g.picked], msg = o.score === 2 ? 'The best answer!' : o.score === 1 ? 'That works, but it could have been better.' : 'That did not help.';
      return `<div class="stack">${sp.options.map((x, i) => `<div class="opt ${i === g.picked ? 'picked' : ''}" style="cursor:default"><span class="t">${esc(x.t)}${i === g.picked ? `<span class="why">${msg}</span>` : ''}</span></div>`).join('')}</div>
        <div class="actions"><button class="btn primary big" data-act="gameDone" data-autofocus>Continue</button></div>`;
    }
    return `${sp.hint ? `<div class="small muted" style="margin-bottom:6px">Your experience rules out the worst answer.</div>` : ''}<div class="stack">${sp.options.map((x, i) => `<button class="opt" data-act="gameChoice" data-i="${i}"><span class="t">${esc(x.t)}</span></button>`).join('')}</div>`;
  }
  if (sp.type === 'order') {
    return `${sp.hint ? `<div class="small muted" style="margin-bottom:6px">Your experience shows you the first step: <b>${esc(sp.steps.find(s => s.i === 0).t)}</b></div>` : ''}<div class="stack">${sp.steps.map(s => g.done.includes(s.i) ? `<div class="opt picked" style="cursor:default"><span class="t">${g.done.indexOf(s.i) + 1}. ${esc(s.t)}</span></div>` : `<button class="opt" data-act="gameStep" data-i="${s.i}"><span class="t">${esc(s.t)}</span></button>`).join('')}</div>
      <div class="small muted" style="margin-top:6px">Wrong taps so far: <b>${g.mistakes}</b></div>`;
  }
  return '';
}
MODALS.crisisGame = () => {
  const g = ui.game;
  if (!g) return null;
  const sp = g.spec, who = g.who ? staffById(g.who) : null;
  const prompt = sp.type === 'choice' || sp.type === 'order' ? sp.prompt : sp.what;
  return { inner: `<div class="chip good">${GAME_NAMES[sp.type]}</div><h2 style="margin:6px 0">${esc(g.label)}</h2>
    ${who ? `<div class="row small" style="margin-bottom:6px">${avatar(who, 'sm')}<b>${esc(who.name)}</b><span class="stars">${stars(who.skill)}</span>${sp.helped ? `<span class="chip good">${esc(who.trait)}: ${TRAIT_HELP[sp.type]}</span>` : ''}</div>` : ''}
    <p style="margin:0 0 4px"><b>${esc(prompt)}</b></p><p class="muted small" style="margin:0 0 10px">${GAME_HELP[sp.type]}</p>
    ${gameBody(g)}
    <div class="actions" style="margin-top:14px"><button class="btn ghost" data-act="crisisCancel">Not now</button><button class="btn ghost" data-act="crisisSkip">Leave it to chance (${pct(g.odds)})</button></div>` };
};

/* ---------- Playing ---------- */
actions.tgStop = () => { const g = ui.game; if (g && g.spec.type === 'timing') finishCrisisGame(crisisJudge(g.spec, g.pos)); };
actions.tapPatch = d => {
  const g = ui.game;
  if (!g || g.spec.type !== 'tap' || g.tapped.includes(Number(d.i))) return;
  g.tapped.push(Number(d.i));
  if (g.tapped.length >= g.spec.patches) return finishCrisisGame(crisisJudge(g.spec, { tapped: g.tapped.length, left: g.left }));
  render();
};
actions.gameChoice = d => { const g = ui.game; if (g && g.spec.type === 'choice' && g.picked === null) { g.picked = Number(d.i); render(); } };
actions.gameDone = () => { const g = ui.game; if (g && g.picked !== null) finishCrisisGame(crisisJudge(g.spec, g.picked)); };
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
      gameFrame = requestAnimationFrame(step);
    };
    gameFrame = requestAnimationFrame(step);
  }
  if (g.spec.type === 'tap' && !gameClock) {
    let last = performance.now();
    gameClock = setInterval(() => {
      const cur = ui.game;
      if (!cur || cur !== g || !ui.modal || ui.modal.type !== 'crisisGame') { clearInterval(gameClock); gameClock = null; return; }
      const now = performance.now(); if (!cur.frozen) cur.left = Math.max(0, cur.left - (now - last) / 1000); last = now;
      const t = document.getElementById('tapTime'), b = document.getElementById('tapBar');
      if (t) t.innerHTML = `<b>${cur.left.toFixed(1)}</b> seconds left`;
      if (b) b.style.width = Math.max(0, cur.left / cur.spec.seconds * 100) + '%';
      if (cur.left <= 0) { clearInterval(gameClock); gameClock = null; finishCrisisGame(crisisJudge(cur.spec, { tapped: cur.tapped.length, left: 0 })); }
    }, 100);
  }
}
AFTER_RENDER.push(gameLoops);
