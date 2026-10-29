'use strict';

/* ================= Service worker: lets the game open and play with no connection =================
   The game itself (pages, styles, scripts, icons) is stored when the worker installs. Pictures are stored as they are seen, and all of
   them at once if the player chooses "Save pictures for offline play" in Settings.
   The block between the BUILD markers is written by `node tools/make-sw.js`. Run it after changing any game file, so the version changes
   and old copies are replaced. `node tools/make-sw.js --check` says whether it is up to date. */
/* BUILD:START */
const VERSION = '5d07fe744499';
const PRECACHE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "pictures.json",
  "css/style.css",
  "js/data.js",
  "js/engine-bank.js",
  "js/engine-bookings.js",
  "js/engine-career.js",
  "js/engine-challenges.js",
  "js/engine-coach.js",
  "js/engine-contractors.js",
  "js/engine-crises.js",
  "js/engine-dashboard.js",
  "js/engine-events.js",
  "js/engine-extra.js",
  "js/engine-fun.js",
  "js/engine-guestbook.js",
  "js/engine-mail.js",
  "js/engine-mgmt.js",
  "js/engine-milestones.js",
  "js/engine-phone.js",
  "js/engine-season.js",
  "js/engine-staffing.js",
  "js/engine-standards.js",
  "js/engine-team.js",
  "js/engine-wishes.js",
  "js/engine.js",
  "js/main.js",
  "js/names-data.js",
  "js/names.js",
  "js/offline.js",
  "js/scenarios-business.js",
  "js/scenarios-extra.js",
  "js/scenarios-fun.js",
  "js/scenarios-guests.js",
  "js/scenarios.js",
  "js/storage.js",
  "js/ui-bookings.js",
  "js/ui-career.js",
  "js/ui-contractors.js",
  "js/ui-crisis.js",
  "js/ui-crisisgames.js",
  "js/ui-dashboard.js",
  "js/ui-events.js",
  "js/ui-fun.js",
  "js/ui-guestbook.js",
  "js/ui-inbox.js",
  "js/ui-menu.js",
  "js/ui-mgmt.js",
  "js/ui-milestones.js",
  "js/ui-phone.js",
  "js/ui-setup.js",
  "js/ui-sound.js",
  "js/ui-staffing.js",
  "js/ui-team.js",
  "js/ui-tour.js",
  "js/ui-wishes.js",
  "js/ui.js",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/logo-small.png",
  "icons/logo.png",
  "icons/trip-scorer.png"
];
/* BUILD:END */

const SHELL = `hotelhq-shell-${VERSION}`, PICTURES = 'hotelhq-pictures';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

/* Remove the game files of older versions, keep the pictures (they do not change with the code). */
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('hotelhq-shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Opening the game: use the network when there is one (so updates arrive), the stored page when there is not.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('index.html', { cacheName: SHELL })));
    return;
  }
  // Pictures: use a stored copy, otherwise fetch and keep one.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(caches.open(PICTURES).then(cache => cache.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }))));
    return;
  }
  // Game files: the stored copy of this version, otherwise the network.
  event.respondWith(caches.match(req, { cacheName: SHELL }).then(hit => hit || fetch(req)));
});
