'use strict';

/* ================= Picture effects =================
   Light touches drawn over the game pictures on a transparent canvas: drips from the leaking pipe, rain on the roof, candle and torch
   flicker with rising embers, cooking smoke, sparkles on the pool, and ripples or dust where a patch is tapped. The pictures are not
   changed; if a picture is missing there is nothing to draw on, so nothing happens.
   An element asks for effects with data-fx="<picture key>" (see FX below). One loop draws them all and stops by itself when none is on
   screen. Positions are fractions of the PICTURE (0 to 1 across, 0 to 1 down), mapped through the same "cover" crop the page uses, so a
   drip stays on its leak whether the picture is shown whole or as a strip.
   Safety and comfort: nothing flashes (candles change slowly and gently), effects are off when the device asks for reduced motion, and
   there is a switch in Settings (a setting for this device, like the sound). At most about 80 small shapes are on screen at once. */
const FX_KEY = 'hotelhq.fx';
const fx = { on: storage.get(FX_KEY) !== 'off', systems: {}, targets: new Map(), running: false, last: 0, frame: null };
const fxAllowed = () => fx.on && !reducedMotion();
function setFx(on) { fx.on = !!on; storage.set(FX_KEY, fx.on ? 'on' : 'off'); fxScan(); }
actions.toggleFx = () => { setFx(!fx.on); render(); };

/* What each picture gets. aspect: the shape of the picture (width / height). Parts: drip (falls from a leak), rain (whole picture),
   sparkle (twinkles on water), glow (a flickering light, with embers if `embers`), smoke (puffs rising). An empty list still lets
   taps make ripples or dust. All positions measured on the real pictures. */
const FX = {
  'pipe-valve': { aspect: 1.5, parts: [{ kind: 'drip', at: [[0.22, 0.62], [0.78, 0.62]], fall: 0.3 }] },
  'power-generator': { aspect: 1.5, parts: [{ kind: 'glow', at: [[0.05, 0.24], [0.985, 0.27]], r: 0.2, embers: true }] },
  'power-phone': { aspect: 1.5, parts: [{ kind: 'glow', at: [[0.1, 0.59], [0.11, 0.55], [0.07, 0.715], [0.14, 0.715], [0.175, 0.54], [0.51, 0.615], [0.61, 0.605], [0.635, 0.68], [0.887, 0.65]], r: 0.07 }] },
  'power-barbecue': { aspect: 1.5, parts: [{ kind: 'glow', at: [[0.35, 0.5], [0.46, 0.64], [0.285, 0.65], [0.44, 0.16], [0.83, 0.2], [0.885, 0.57]], r: 0.1, embers: true }, { kind: 'smoke', at: [[0.35, 0.55], [0.5, 0.6]] }] },
  'roof-tarp': { aspect: 1.5, parts: [{ kind: 'rain' }] },
  'roof-roofer': { aspect: 1.5, parts: [{ kind: 'rain' }] },
  'pool-skim': { aspect: 1.5, parts: [{ kind: 'sparkle' }] },
  'pipe-dry': { aspect: 1.5, parts: [] }, 'roof-dry': { aspect: 1.5, parts: [] }, 'mice-clean': { aspect: 1.5, parts: [] },
  // the wide crisis pictures (16:9, cropped from the scenes above)
  'crisis-pipe': { aspect: 16 / 9, parts: [{ kind: 'drip', at: [[0.22, 0.645], [0.78, 0.645]], fall: 0.33 }] },
  'crisis-power': { aspect: 16 / 9, parts: [{ kind: 'glow', at: [[0.1, 0.655], [0.11, 0.6], [0.07, 0.8], [0.14, 0.8], [0.175, 0.6], [0.51, 0.68], [0.61, 0.67], [0.635, 0.76], [0.887, 0.71]], r: 0.08 }] },
  'crisis-roof': { aspect: 16 / 9, parts: [{ kind: 'rain' }] }
};
const fxRnd = (a, b) => a + Math.random() * (b - a);

/* Where a picture of this shape sits inside its box when it is scaled to cover it (as object-fit: cover does, centred). */
function fxMap(W, H, aspect) {
  const s = Math.max(W / aspect, H), ox = (W - aspect * s) / 2, oy = (H - s) / 2;
  return { s, at: (nx, ny) => [ox + nx * aspect * s, oy + ny * s] };
}

/* ---------- Each picture's moving things ---------- */
function fxSystem(def) {
  return { def, t: 0, drops: [], dropTimers: [], rain: [], rainN: 0, sparks: [], sparkTimer: 0, glows: [], embers: [], emberTimer: 0, puffs: [], puffTimer: 0, rings: [], bits: [] };
}
function fxStep(sys, dt) {
  sys.t += dt;
  for (const part of sys.def.parts) {
    if (part.kind === 'drip') {
      part.at.forEach((p, i) => {
        sys.dropTimers[i] = (sys.dropTimers[i] === undefined ? fxRnd(0, 0.5) : sys.dropTimers[i]) - dt;
        if (sys.dropTimers[i] <= 0 && sys.drops.length < 14) { sys.dropTimers[i] = fxRnd(0.35, 0.8); sys.drops.push({ x: p[0] + fxRnd(-0.004, 0.004), y: p[1], y0: p[1], fall: part.fall, vy: 0.04 }); }
      });
    } else if (part.kind === 'glow' && !sys.glows.length) {
      sys.glows = part.at.map(p => ({ x: p[0], y: p[1], r: part.r, ph: fxRnd(0, 6.28), f1: fxRnd(5, 8), f2: fxRnd(9, 14), embers: !!part.embers }));
    } else if (part.kind === 'sparkle') {
      sys.sparkTimer -= dt;
      if (sys.sparkTimer <= 0 && sys.sparks.length < 14) { sys.sparkTimer = fxRnd(0.12, 0.3); sys.sparks.push({ x: fxRnd(0.04, 0.96), y: fxRnd(0.06, 0.94), age: 0, life: fxRnd(0.7, 1.2), size: fxRnd(0.012, 0.026) }); }
    } else if (part.kind === 'smoke') {
      sys.puffTimer -= dt;
      if (sys.puffTimer <= 0 && sys.puffs.length < 10) { sys.puffTimer = fxRnd(0.5, 0.9); const p = part.at[Math.floor(Math.random() * part.at.length)]; sys.puffs.push({ x: p[0] + fxRnd(-0.03, 0.03), y: p[1], age: 0, life: fxRnd(2.4, 3.4), vx: fxRnd(-0.015, 0.03), r0: 0.015, r1: fxRnd(0.05, 0.08) }); }
    }
  }
  // embers rise from the lights that have them
  sys.emberTimer -= dt;
  if (sys.emberTimer <= 0 && sys.embers.length < 18) {
    const lit = sys.glows.filter(g => g.embers);
    if (lit.length) { sys.emberTimer = fxRnd(0.12, 0.3); const g = lit[Math.floor(Math.random() * lit.length)]; sys.embers.push({ x: g.x + fxRnd(-0.01, 0.01), y: g.y, vx: fxRnd(-0.01, 0.015), vy: -fxRnd(0.05, 0.11), age: 0, life: fxRnd(1.2, 2.2), ph: fxRnd(0, 6.28) }); }
  }
  for (const d of sys.drops) { d.vy += 0.9 * dt; d.y += d.vy * dt; if (d.y > d.y0 + d.fall) { d.dead = true; sys.rings.push({ x: d.x, y: d.y0 + d.fall, age: 0, life: 0.35, max: 0.012, kind: 'plink' }); } }
  sys.drops = sys.drops.filter(d => !d.dead);
  for (const s of sys.sparks) s.age += dt; sys.sparks = sys.sparks.filter(s => s.age < s.life);
  for (const e of sys.embers) { e.age += dt; e.x += (e.vx + Math.sin(sys.t * 3 + e.ph) * 0.01) * dt; e.y += e.vy * dt; } sys.embers = sys.embers.filter(e => e.age < e.life);
  for (const p of sys.puffs) { p.age += dt; p.x += p.vx * dt; p.y -= 0.045 * dt; } sys.puffs = sys.puffs.filter(p => p.age < p.life);
  for (const r of sys.rings) r.age += dt; sys.rings = sys.rings.filter(r => r.age < r.life);
  for (const b of sys.bits) { b.age += dt; b.vy += b.g * dt; b.x += b.vx * dt; b.y += b.vy * dt; } sys.bits = sys.bits.filter(b => b.age < b.life);
}
/* Rain is drawn in the box's own terms (it falls on whatever is shown), so it is kept as fractions of the box. */
function fxRain(sys, dt, W, H) {
  const want = Math.max(30, Math.min(80, Math.round(W * H / 6000)));
  while (sys.rain.length < want) sys.rain.push({ x: Math.random() * 1.2 - 0.1, y: Math.random(), len: fxRnd(12, 22), v: fxRnd(650, 900) });
  sys.rain.length = want;
  for (const d of sys.rain) { d.y += d.v / H * dt; d.x -= d.v * 0.22 / W * dt; if (d.y > 1.05) { d.y = -0.05; d.x = Math.random() * 1.2 - 0.1; } }
}

/* A tap: ripples (water) or a puff of dust, with a few droplets or specks. `big` is the tap that finishes the patch. */
function fxBurst(key, kind, nx, ny, big) {
  const sys = fx.systems[key];
  if (!sys || !fxAllowed()) return;
  const n = big ? 11 : 6;
  sys.rings.push({ x: nx, y: ny, age: 0, life: big ? 0.8 : 0.6, max: big ? 0.07 : 0.045, kind });
  if (big) sys.rings.push({ x: nx, y: ny, age: -0.12, life: 0.8, max: 0.05, kind });
  for (let i = 0; i < n && sys.bits.length < 40; i++) {
    const a = fxRnd(0, 6.28), v = fxRnd(0.05, big ? 0.2 : 0.14);
    sys.bits.push(kind === 'dust' ? { x: nx, y: ny, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7, g: 0, age: 0, life: fxRnd(0.45, 0.75), size: fxRnd(0.004, 0.009), kind }
      : { x: nx, y: ny, vx: Math.cos(a) * v * 0.7, vy: -fxRnd(0.1, 0.26), g: 1.1, age: 0, life: fxRnd(0.45, 0.7), size: fxRnd(0.003, 0.007), kind });
  }
}

/* ---------- Drawing ---------- */
const fxGlowGradient = (c, x, y, r, rgb, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); };
function fxDraw(c, sys, W, H, m) {
  const { s, at } = m;
  for (const d of sys.drops) { const [x, y] = at(d.x, d.y); c.strokeStyle = 'rgba(205,230,250,0.85)'; c.lineWidth = Math.max(1.5, s / 230); c.beginPath(); c.moveTo(x, y - s * 0.018); c.lineTo(x, y); c.stroke(); }
  if (sys.def.parts.some(p => p.kind === 'rain')) {
    c.strokeStyle = 'rgba(210,225,245,0.4)'; c.lineWidth = 1.2; c.beginPath();
    for (const d of sys.rain) { const x = d.x * W, y = d.y * H; c.moveTo(x, y); c.lineTo(x - d.len * 0.22, y + d.len); }
    c.stroke();
  }
  c.globalCompositeOperation = 'lighter';
  for (const g of sys.glows) {   // a warm light that flickers gently: two slow wobbles, never a flash
    const k = 0.78 + 0.14 * Math.sin(sys.t * g.f1 + g.ph) + 0.08 * Math.sin(sys.t * g.f2 + g.ph * 2), [x, y] = at(g.x, g.y);
    fxGlowGradient(c, x, y, g.r * s * (0.92 + 0.12 * k), '255,176,80', 0.38 * k);
  }
  for (const e of sys.embers) { const [x, y] = at(e.x, e.y), a = Math.sin(Math.PI * e.age / e.life); fxGlowGradient(c, x, y, Math.max(2, s * 0.008), '255,170,70', 0.9 * a); }
  for (const sp of sys.sparks) {
    const [x, y] = at(sp.x, sp.y), a = Math.sin(Math.PI * sp.age / sp.life), r = sp.size * s * (0.6 + 0.6 * a);
    c.strokeStyle = `rgba(235,250,255,${0.9 * a})`; c.lineWidth = Math.max(1, s / 300); c.beginPath(); c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); c.stroke();
    fxGlowGradient(c, x, y, r * 0.7, '240,252,255', 0.6 * a);
  }
  c.globalCompositeOperation = 'source-over';
  for (const p of sys.puffs) { const k = p.age / p.life, [x, y] = at(p.x, p.y); fxGlowGradient(c, x, y, (p.r0 + (p.r1 - p.r0) * k) * s, '200,196,190', 0.2 * (1 - k)); }
  for (const r of sys.rings) {
    if (r.age < 0) continue;
    const k = r.age / r.life, [x, y] = at(r.x, r.y), rx = r.max * s * Math.sqrt(k);
    if (r.kind === 'dust') { fxGlowGradient(c, x, y, rx * 1.2, '200,170,120', 0.28 * (1 - k)); continue; }
    c.strokeStyle = `rgba(225,242,255,${0.7 * (1 - k)})`; c.lineWidth = Math.max(1.2, s / 260); c.beginPath(); c.ellipse(x, y, rx, rx * 0.42, 0, 0, 6.2832); c.stroke();
  }
  for (const b of sys.bits) {
    const k = b.age / b.life, [x, y] = at(b.x, b.y);
    c.fillStyle = b.kind === 'dust' ? `rgba(205,170,115,${0.8 * (1 - k)})` : `rgba(225,242,255,${0.85 * (1 - k)})`;
    c.beginPath(); c.arc(x, y, Math.max(1.2, b.size * s), 0, 6.2832); c.fill();
  }
}

/* ---------- The loop ---------- */
function fxLoop(now) {
  fx.frame = null;
  if (!fxAllowed()) { fxStop(); return; }
  const dt = Math.min(0.05, (now - fx.last) / 1000 || 0.016); fx.last = now;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), stepped = new Set();
  for (const [el, t] of fx.targets) {
    if (!el.isConnected) { fx.targets.delete(el); continue; }
    const sys = fx.systems[t.key], W = el.clientWidth, H = el.clientHeight;
    if (!sys || !W || !H) continue;
    if (!stepped.has(t.key)) { stepped.add(t.key); fxStep(sys, dt); if (sys.def.parts.some(p => p.kind === 'rain')) fxRain(sys, dt, W, H); }
    const cv = t.canvas;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    fxDraw(c, sys, W, H, fxMap(W, H, sys.def.aspect));
  }
  if (!fx.targets.size) { fxStop(); return; }
  fx.frame = requestAnimationFrame(fxLoop);
}
function fxStop() { if (fx.frame) cancelAnimationFrame(fx.frame); fx.frame = null; fx.running = false; fx.systems = {}; }
/* After every render: give each picture that wants effects a canvas, and start the loop if it is not already going. */
function fxScan() {
  const els = document.querySelectorAll('[data-fx]');
  if (!fxAllowed()) { els.forEach(el => { const cv = el.querySelector(':scope > canvas.fx'); if (cv) cv.remove(); }); fx.targets.clear(); fxStop(); return; }
  let any = false;
  els.forEach(el => {
    const key = el.dataset.fx, def = FX[key];
    if (!def) return;
    let cv = el.querySelector(':scope > canvas.fx');
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'fx'; cv.setAttribute('aria-hidden', 'true'); el.appendChild(cv); }
    fx.targets.set(el, { canvas: cv, key });
    if (!fx.systems[key]) fx.systems[key] = fxSystem(def);
    any = true;
  });
  if (any && !fx.running) { fx.running = true; fx.last = performance.now(); fx.frame = requestAnimationFrame(fxLoop); }
}
AFTER_RENDER.push(fxScan);
