'use strict';

/* ================= Offline play and installing =================
   Registers the service worker (sw.js) when the game is served over http(s), which is what lets it open with no connection, and saves
   pictures for offline play. It does nothing when the game is opened from a file, and nothing inside the phone apps: there the game files
   are already inside the app (and WKWebView, the iPhone web view, does not run service workers under Capacitor's own scheme). */

const offline = { state: 'unsupported', saved: 0, total: 0, bytes: 0, busy: false, updated: false };
const PICTURE_CACHE = 'hotelhq-pictures';
const inNativeApp = () => !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
const offlinePossible = () => 'serviceWorker' in navigator && 'caches' in window && /^https?:$/.test(location.protocol) && !inNativeApp();

async function offlineRefresh() {
  if (!offlinePossible()) return;
  try {
    const list = await (await fetch('pictures.json')).json();
    const cache = await caches.open(PICTURE_CACHE), have = new Set((await cache.keys()).map(r => new URL(r.url).pathname));
    offline.total = list.count; offline.bytes = list.bytes;
    offline.saved = list.files.filter(f => have.has(new URL(f, location.href).pathname)).length;
  } catch (e) { /* offline or no list: leave the numbers as they were */ }
}
async function registerOffline() {
  if (!offlinePossible()) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    offline.state = reg.active ? 'ready' : 'installing';
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (worker) worker.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) { offline.updated = true; if (typeof toast === 'function') toast('A new version of the game is ready. It will be used next time you open it.', 'good'); } });
    });
    await navigator.serviceWorker.ready;
    offline.state = 'ready';
    await offlineRefresh();
    if (typeof render === 'function' && S) render();
  } catch (e) { offline.state = 'failed'; }
}
/* Fetches every picture not already stored. onProgress(done, total) is called as it goes. Returns how many are stored afterwards. */
async function savePictures(onProgress) {
  if (!offlinePossible() || offline.busy) return offline.saved;
  offline.busy = true;
  try {
    const list = await (await fetch('pictures.json')).json();
    const cache = await caches.open(PICTURE_CACHE), have = new Set((await cache.keys()).map(r => new URL(r.url).pathname));
    const todo = list.files.filter(f => !have.has(new URL(f, location.href).pathname));
    let done = list.files.length - todo.length;
    offline.total = list.count;
    for (let i = 0; i < todo.length; i += 6) {   // a few at a time, so the game stays responsive
      await Promise.all(todo.slice(i, i + 6).map(async f => { try { const res = await fetch(f); if (res.ok) await cache.put(f, res); } catch (e) { /* skip this one */ } done++; }));
      offline.saved = done; if (onProgress) onProgress(done, list.count);
    }
  } finally { offline.busy = false; }
  await offlineRefresh();
  return offline.saved;
}
