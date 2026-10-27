'use strict';

/* ================= The setup walkthrough =================
   A new player is taken through opening a hotel one question at a time: who they are, a photo, the hotel's name, a bank, and then how the game
   works. ui.setup holds the answers between steps, so Back never loses anything. The hotel opens with Management offline: nothing happens
   until the player presses Management Online, so they can look around first. */

const SETUP_STEPS = ['welcome', 'name', 'photo', 'hotel', 'bank', 'how', 'ready'];

function setupState() {
  if (!ui.setup) ui.setup = { step: 0, owner: '', hotel: 'The Grand Plaza', bankName: BANK_DEFAULT_NAME, bankColour: BANK_COLOURS[0].key };
  return ui.setup;
}
/* Keeps whatever the current step's fields hold. */
function setupSave(f) {
  const t = setupState();
  if (f.has('owner')) t.owner = String(f.get('owner')).trim().slice(0, 20);
  if (f.has('hotel')) t.hotel = String(f.get('hotel')).trim().slice(0, 30);
  if (f.has('bankName')) t.bankName = String(f.get('bankName'));
  if (f.has('bankColour')) t.bankColour = String(f.get('bankColour'));
}
const setupPhoto = () => (ui.photo && ui.photo !== 'REMOVE' ? ui.photo : null);

const HOW_IT_WORKS = [
  ['Management Online and Offline', 'The button at the top opens and closes the hotel. Offline, the hotel is paused: nothing happens, so you can change menus, prices and the team in peace. Press Management Online to open the day. Press Management Offline to end it and see how you did.'],
  ['Guests and bookings', 'People ask to stay. Accept them, get their rooms cleaned, and read what they want. If a guest asks for something, like a sea view, try to give it to them.'],
  ['The phone desk', 'When the phone rings, answer it and write down the booking. Spelling does not matter, but getting the details right does.'],
  ['Your team', 'Your staff work shifts. Send the right person to each job, keep them happy, and hire more as you grow.'],
  ['Goals', 'Earn money to reach goals. Goals unlock new things for your hotel, like an arcade, a kids club and a shop, and they earn you promotions.']
];

function setupHtml() {
  const t = setupState(), step = SETUP_STEPS[t.step] || SETUP_STEPS[0], last = t.step === SETUP_STEPS.length - 1;
  const dots = `<div class="setup-dots" aria-hidden="true">${SETUP_STEPS.map((s, i) => `<i class="${i === t.step ? 'on' : i < t.step ? 'done' : ''}"></i>`).join('')}</div>`;
  const nav = (next, opts) => `<div class="actions">${t.step > 0 ? '<button class="btn ghost" type="button" data-act="setupBack">Back</button>' : ''}${opts && opts.skip ? '<button class="btn ghost" type="button" data-act="setupSkip">Skip for now</button>' : ''}<button class="btn primary big" type="submit">${next}</button></div>`;
  let body;
  if (step === 'welcome') {
    body = `<img class="logo-hero" src="icons/logo.png" alt="Hotel HQ" width="900" height="597"><h2 class="sr-only">Welcome to Hotel HQ</h2>
      <p>You are about to become the manager of a hotel. You will take bookings, answer the phone, look after your guests and run a team, and your hotel will grow from a small boutique hotel into a grand resort.</p>
      <p>First, a few quick questions to set everything up. Then I will show you how it all works.</p>${nav("Let's start")}`;
  } else if (step === 'name') {
    body = `<h2>What is your name?</h2><p class="muted">This is the name your guests and your team will know you by.</p>
      <label class="f" for="i-o">Your name</label><input type="text" id="i-o" name="owner" maxlength="20" placeholder="Type your name" value="${esc(t.owner)}" required data-autofocus>${nav('Next')}`;
  } else if (step === 'photo') {
    body = `<h2>Add your photo</h2><p class="muted">Your picture will show at the top of the screen and on your certificates. It stays on this device. You can skip this and add one later.</p>
      ${photoField(setupPhoto(), 'manager')}${nav('Next', { skip: true })}`;
  } else if (step === 'hotel') {
    body = `<h2>Name your hotel</h2><p class="muted">Make one up, or press the dice for ideas.</p>
      <label class="f" for="i-h">Hotel name</label><div class="row" style="flex-wrap:nowrap"><input type="text" id="i-h" name="hotel" maxlength="30" value="${esc(t.hotel)}" required data-autofocus style="flex:1;min-width:0"><button type="button" class="btn sm ghost" data-act="diceHotel" data-target="i-h" title="Suggest a name" aria-label="Suggest a hotel name">&#127922; Suggest</button></div>${nav('Next')}`;
  } else if (step === 'bank') {
    body = `<h2>Choose your bank</h2><p class="muted">Every hotel needs a bank. Pick a name and a colour for yours.</p>${bankFields({ name: t.bankName, colour: t.bankColour })}${nav('Next')}`;
  } else if (step === 'how') {
    body = `<h2>How it works</h2><div class="stack">${HOW_IT_WORKS.map(([h, p]) => `<div class="card" style="box-shadow:none;background:var(--surface2)"><b>${esc(h)}</b><div class="small muted">${esc(p)}</div></div>`).join('')}</div>${nav('Next')}`;
  } else {
    body = `<h2>Ready to open</h2>
      <div class="card" style="box-shadow:none;background:var(--surface2)"><div class="row">${imgHtml(safeImg(setupPhoto()), { fb: 'avatar', size: 'md', ini: initials(t.owner || '?'), alt: t.owner })}<div><b>${esc(t.owner)}</b><div class="muted small">Manager of ${esc(t.hotel)}</div><div class="muted small">Banking with ${esc(cleanBankName(t.bankName))}</div></div></div></div>
      <p>Your hotel opens with <b>Management Offline</b>, so nothing happens yet and you can look around. When you are ready, press <b>Management Online</b> at the top of the screen and I will walk you through your first day.</p>${nav('Open my hotel')}`;
  }
  return `<form data-form="${last ? 'intro' : 'setup'}">${dots}<div class="setup-step" data-step="${step}">${body}</div></form>`;
}

actions.setupBack = () => {
  const form = document.querySelector('.modal form');
  if (form) setupSave(new FormData(form));
  const t = setupState(); t.step = Math.max(0, t.step - 1);
  render();
};

/* Each step's form: keep the answers, check the required ones, move on. */
forms.setup = f => {
  const t = setupState(), step = SETUP_STEPS[t.step];
  setupSave(f);
  if (step === 'name' && !t.owner) return toast('Please type your name.', 'bad');
  if (step === 'hotel' && !t.hotel) return toast('Please give your hotel a name.', 'bad');
  t.step = Math.min(SETUP_STEPS.length - 1, t.step + 1);
  render();
};

actions.setupSkip = () => { ui.photo = null; setupState().step++; render(); };
