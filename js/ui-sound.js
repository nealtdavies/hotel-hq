'use strict';

/* ================= Sound effects =================
   Short tones made with the Web Audio API, so there are no audio files to ship. Browsers keep an AudioContext silent until the person has
   touched the page, so the context is created and resumed from a user gesture (and again before each sound if the browser suspended it).
   The on/off choice belongs to the device, not the saved hotel, so it lives in localStorage on its own. */

const SOUND_KEY = 'hotelhq.sound';
const TONES = {                       // [frequency in Hz, seconds] played one after another
  tick: [[880, 0.06]], good: [[660, 0.07], [990, 0.11]], bad: [[247, 0.16], [196, 0.2]], mail: [[784, 0.08], [1047, 0.13]],
  ring: [[1046, 0.1], [1318, 0.1], [1046, 0.1], [1318, 0.1], [1046, 0.1], [1318, 0.1]], bell: [[2093, 0.05], [2637, 0.32]],
  ding: [[523, 0.45]],   // a single low, soft note for a voicemail, an email or a message: it never interrupts
  cash: [[1319, 0.06], [1760, 0.16]], award: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.26]], levelup: [[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.12], [1319, 0.36]]
};
const GAIN = { ding: 0.07 };   // how loud each sound is; anything not listed uses the usual 0.16
const sound = { on: true, ctx: null, last: 0 };
sound.on = storage.get(SOUND_KEY) !== 'off';   // if storage is blocked the sound stays on

function soundContext() {
  if (!sound.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; sound.ctx = new C(); }
  if (sound.ctx.state === 'suspended') sound.ctx.resume();
  return sound.ctx;
}
function sfx(name) {
  if (!sound.on || !TONES[name]) return false;
  const now = Date.now();
  if (now - sound.last < 90) return false;   // many things can happen at once; one sound is enough
  sound.last = now;
  const ctx = soundContext();
  if (!ctx) return false;
  let t = ctx.currentTime + 0.01;
  for (const [freq, dur] of TONES[name]) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(GAIN[name] || 0.16, t + (name === 'ding' ? 0.03 : 0.012));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
    t += dur * 0.85;
  }
  return true;
}
function setSound(on) {
  sound.on = !!on;
  storage.set(SOUND_KEY, sound.on ? 'on' : 'off');
  if (sound.on) sfx('good');
}
/* The first touch unlocks audio. */
document.addEventListener('pointerdown', () => { if (sound.on) soundContext(); }, { once: true, capture: true });
