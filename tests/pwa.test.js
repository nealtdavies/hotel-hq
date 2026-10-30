'use strict';
/* Installing and offline play, checked in a real browser (Playwright) against a small local web server.
   Usage: node tests/pwa.test.js
   Covers: the manifest and icons, the page's install tags, the service worker storing the game, opening the game with the network
   cut, saving pictures for offline play, no service worker inside a phone app, the storage mirror, and the build scripts. */
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
let failed = 0;
/* Walks through the setup steps of a new hotel. */
async function runSetup(page, o) {
  const next = () => page.click('.setup-step button.primary');
  await page.click("text=Let's start");
  await page.fill('#i-o', o.owner); await next();
  await next();
  await page.fill('#i-h', o.hotel); await next();
  await next(); await next();
  await page.click('text=Open my hotel');
}
const assert = (c, m) => { if (c) console.log('ok  :', m); else { failed++; console.error('FAIL:', m); } };

function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const file = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve(server));
  });
}
const pngSize = f => { const b = fs.readFileSync(path.join(root, f)); return b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };

(async () => {
  // ---- files and tools (no browser needed) ----
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert(manifest.name === 'Hotel HQ' && manifest.short_name && manifest.start_url && manifest.scope && manifest.display === 'standalone' && /^#[0-9a-f]{6}$/i.test(manifest.theme_color) && /^#[0-9a-f]{6}$/i.test(manifest.background_color), 'the manifest has a name, start page, standalone display and colours');
  const sizes = manifest.icons.map(i => `${i.sizes}:${i.purpose}`);
  assert(sizes.includes('192x192:any') && sizes.includes('512x512:any') && sizes.includes('512x512:maskable'), 'the manifest lists 192 and 512 icons and a maskable one');
  assert(manifest.icons.every(i => { const s = pngSize(i.src); return s && `${s[0]}x${s[1]}` === i.sizes && i.type === 'image/png'; }), 'every manifest icon exists and is really the size it claims');
  assert(JSON.stringify(pngSize('icons/apple-touch-icon.png')) === '[180,180]' && JSON.stringify(pngSize('icons/favicon-32.png')) === '[32,32]', 'the Apple touch icon is 180 by 180 and the favicon 32 by 32');
  let swOk = true; try { execFileSync('node', [path.join(root, 'tools', 'make-sw.js'), '--check'], { stdio: 'pipe' }); } catch (e) { swOk = false; }
  assert(swOk, 'sw.js and pictures.json are up to date with the game files (run node tools/make-sw.js if not)');
  const swSource = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert(/new Request\(url, \{ cache: 'reload' \}\)/.test(swSource) && /fetch\(req, \{ cache: 'no-cache' \}\)/.test(swSource), 'an update is built from new files and the opening page is checked against the server, never answered from the browser\'s ten-minute copy');
  const v1 = execFileSync('node', [path.join(root, 'tools', 'make-sw.js'), '--check'], { stdio: 'pipe' }).toString().match(/version (\w+)/)[1];
  fs.writeFileSync(path.join(root, 'sw.js'), swSource.replace("self.addEventListener('install'", "/* test */ self.addEventListener('install'"));
  let v2 = ''; try { execFileSync('node', [path.join(root, 'tools', 'make-sw.js'), '--check'], { stdio: 'pipe' }); } catch (e) { v2 = 'stale'; }
  fs.writeFileSync(path.join(root, 'sw.js'), swSource);
  assert(v1 && v2 === 'stale' && execFileSync('node', [path.join(root, 'tools', 'make-sw.js'), '--check'], { stdio: 'pipe' }).toString().includes(v1), 'changing the offline worker\'s own rules counts as a new version');
  const swText = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const precache = JSON.parse(swText.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
  assert(precache.every(f => f === './' || fs.existsSync(path.join(root, f))) && precache.includes('index.html') && precache.includes('css/style.css') && precache.includes('js/main.js') && fs.readdirSync(path.join(root, 'js')).every(f => precache.includes('js/' + f)), 'the service worker stores every script, the page, the styles and every file it lists exists');
  const pictures = JSON.parse(fs.readFileSync(path.join(root, 'pictures.json'), 'utf8'));
  assert(pictures.count === pictures.files.length && pictures.files.every(f => fs.existsSync(path.join(root, f)) && !f.includes('/unused/')) && pictures.bytes > 1e6, 'pictures.json lists real pictures and leaves out the unused folder');
  const www = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hotelhq-www-'));
  execFileSync('node', [path.join(root, 'tools', 'build-www.js'), www], { stdio: 'pipe' });
  const wwwHtml = fs.readFileSync(path.join(www, 'index.html'), 'utf8');
  assert(fs.existsSync(path.join(www, 'js/storage-native.js')) && wwwHtml.indexOf('js/storage.js') < wwwHtml.indexOf('js/storage-native.js') && wwwHtml.indexOf('js/storage-native.js') < wwwHtml.indexOf('js/data.js'), 'the app build loads the native storage mirror right after the storage layer');
  assert(!fs.existsSync(path.join(www, 'sw.js')) && !fs.existsSync(path.join(www, 'assets/unused')) && !fs.existsSync(path.join(www, 'tests')) && !fs.existsSync(path.join(www, 'tools')) && fs.existsSync(path.join(www, 'assets/hotel')) && fs.existsSync(path.join(www, 'manifest.webmanifest')), 'the app build leaves out the service worker, tests, tools and unused pictures but keeps the pictures');
  const cap = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8')), pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert(cap.appId === 'com.hotelhq.game' && cap.appName === 'Hotel HQ' && cap.webDir === 'www' && pkg.dependencies['@capacitor/core'] && pkg.devDependencies['@capacitor/cli'] && pkg.devDependencies['@capacitor/ios'] && pkg.devDependencies['@capacitor/android'], 'the Capacitor config and package list are complete');
  // ---- in the browser: the game served from its folder ----
  const server = await serve(root), base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(base);
  const head = await page.evaluate(() => ({ manifest: document.querySelector('link[rel=manifest]').getAttribute('href'), touch: document.querySelector('link[rel=apple-touch-icon]').getAttribute('href'), cap: document.querySelector('meta[name=apple-mobile-web-app-capable]').content, title: document.querySelector('meta[name=apple-mobile-web-app-title]').content, icon: document.querySelector('link[rel=icon]').getAttribute('href') }));
  assert(head.manifest === 'manifest.webmanifest' && head.touch === 'icons/apple-touch-icon.png' && head.cap === 'yes' && head.title === 'Hotel HQ' && head.icon === 'icons/favicon-32.png', 'the page links the manifest and the home-screen icon and title');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => offline.state === 'ready');
  const version = swText.match(/const VERSION = '([0-9a-f]+)'/)[1];
  assert((await page.evaluate(async () => (await caches.keys()))).includes('hotelhq-shell-' + version), 'the service worker stored the game files under this version');
  const stored = await page.evaluate(async v => { const c = await caches.open('hotelhq-shell-' + v); return (await c.keys()).map(r => new URL(r.url).pathname); }, version);
  assert(precache.filter(f => f !== './').every(f => stored.includes('/' + f)), 'every listed game file is stored');
  assert(await page.evaluate(() => offline.total) === pictures.count, 'the game knows how many pictures there are to store');

  // start a game, then open it with no connection
  await page.reload(); await page.evaluate(() => navigator.serviceWorker.ready);
  await runSetup(page, { hotel: 'Offline Inn', owner: 'Ella' });
  await page.evaluate(() => { ui.modal = null; S.tour.done = true; S.incidents = []; commit(); });
  await page.reload();
  assert(await page.evaluate(() => !!navigator.serviceWorker.controller), 'after a reload the page is controlled by the service worker');
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.hname');
  assert(await page.locator('.hname').innerText() === 'Offline Inn', 'with no connection the game opens and the saved hotel is there');
  await page.evaluate(() => { actions.nav({ view: 'rooms' }); });
  assert(await page.locator('.pagehead h2:has-text("Rooms")').count() === 1, 'with no connection the screens still work');
  const dayBefore = await page.evaluate(() => S.day);
  await page.evaluate(() => { actions.endDay(); });
  assert(await page.evaluate(d => S.day === d + 1, dayBefore), 'with no connection a day can be played');
  await ctx.setOffline(false);

  // saving every picture
  await page.evaluate(() => { ui.modal = null; actions.nav({ view: 'settings' }); });
  assert(await page.locator('text=Ready for offline play').count() === 1 && await page.locator('[data-act="savePictures"]:not([disabled])').count() === 1, 'Settings offers to save pictures for offline play');
  await page.click('[data-act="savePictures"]');
  await page.waitForFunction(() => !offline.busy && offline.saved === offline.total && offline.total > 0, null, { timeout: 60000 });
  await page.waitForSelector('text=All pictures stored', { timeout: 5000 }).catch(() => {});
  assert(await page.locator('text=All pictures stored').count() === 1 && await page.locator('[data-act="savePictures"][disabled]').count() === 1, 'all pictures can be stored, and Settings says so');
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector('.hname');
  await page.evaluate(() => { ui.modal = null; actions.nav({ view: 'dashboard' }); });
  const heroOk = await page.evaluate(async () => { const r = await fetch(tierImage(S.tier)); return r.ok && (await r.blob()).size > 10000; });
  assert(heroOk, 'with no connection the hotel picture still comes from storage');
  await page.evaluate(() => { actions.nav({ view: 'rooms' }); });
  await page.waitForFunction(() => { const imgs = [...document.images].filter(i => i.src.includes('/assets/rooms/')); return imgs.length > 0 && imgs.every(i => i.complete); });
  assert(await page.evaluate(() => [...document.images].filter(i => i.src.includes('/assets/rooms/')).every(i => i.naturalWidth > 0)), 'with no connection the room pictures still show');
  await ctx.setOffline(false);
  await ctx.close();

  // ---- updating: a copy of the game in a temporary folder, so the real files are never touched ----
  const copyDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hotelhq-copy-'));
  for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'pictures.json']) fs.copyFileSync(path.join(root, f), path.join(copyDir, f));
  for (const d of ['css', 'js', 'icons']) { fs.mkdirSync(path.join(copyDir, d)); for (const f of fs.readdirSync(path.join(root, d)).filter(n => fs.statSync(path.join(root, d, n)).isFile())) fs.copyFileSync(path.join(root, d, f), path.join(copyDir, d, f)); }
  const copyServer = await serve(copyDir), copyBase = `http://127.0.0.1:${copyServer.address().port}/`;
  const uctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const up = await uctx.newPage();
  up.on('pageerror', e => errors.push('update pageerror: ' + e.message));
  await up.goto(copyBase); await up.evaluate(() => navigator.serviceWorker.ready); await up.waitForFunction(() => offline.state === 'ready');
  await up.evaluate(async () => { await caches.open('hotelhq-shell-oldversion'); const c = await caches.open('hotelhq-pictures'); await c.put('/assets/test.jpg', new Response('x')); });
  const oldKeys = await up.evaluate(async () => (await caches.keys()).filter(k => k.startsWith('hotelhq-shell-')).sort());
  assert(oldKeys.length === 2 && oldKeys.includes('hotelhq-shell-oldversion'), 'before the update there is the current version and a stray old one');
  fs.writeFileSync(path.join(copyDir, 'sw.js'), fs.readFileSync(path.join(copyDir, 'sw.js'), 'utf8').replace(`VERSION = '${version}'`, "VERSION = 'newer1'"));
  await up.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
  const settle = async () => { for (let n = 0; n < 60; n++) { const st = await up.evaluate(async () => { const k = (await caches.keys()).filter(x => x.startsWith('hotelhq-shell-')); return k.length === 1 && k[0] === 'hotelhq-shell-newer1' && (await (await caches.open(k[0])).keys()).length; }); if (st) return st; await new Promise(r => setTimeout(r, 250)); } return 0; };
  const swapped = await settle();
  assert(swapped > 0, 'a new worker version stores the new game files and removes every older copy');
  assert(await up.evaluate(async () => { const c = await caches.open('hotelhq-pictures'); return !!(await c.match('/assets/test.jpg')); }), 'stored pictures survive an update');
  await up.reload();
  assert(await up.evaluate(async () => { const c = await caches.open('hotelhq-shell-newer1'); return (await c.keys()).length; }) === precache.length, 'the new version has stored the whole game');
  await uctx.close(); copyServer.close(); fs.rmSync(copyDir, { recursive: true, force: true });

  // ---- the phone app: the real app build, with a stand-in for Capacitor's Preferences ----
  const prefs = new Map(); let prefCalls = 0;
  const appServer = await serve(www), appBase = `http://127.0.0.1:${appServer.address().port}/`;
  const appCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await appCtx.exposeFunction('__prefGet', k => { prefCalls++; return prefs.has(k) ? prefs.get(k) : null; });
  await appCtx.exposeFunction('__prefSet', (k, v) => { prefCalls++; prefs.set(k, v); });
  await appCtx.exposeFunction('__prefRemove', k => { prefs.delete(k); });
  await appCtx.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true, Plugins: { Preferences: { get: async ({ key }) => ({ value: await window.__prefGet(key) }), set: ({ key, value }) => window.__prefSet(key, value), remove: ({ key }) => window.__prefRemove(key) } } };
  });
  const app = await appCtx.newPage();
  app.on('pageerror', e => errors.push('app pageerror: ' + e.message));
  await app.goto(appBase);
  assert(await app.evaluate(() => !!storage.mirror && typeof storage.mirror.get === 'function'), 'inside the app the native storage mirror is installed');
  assert(await app.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length === 0 && offline.state === 'unsupported' && !offlinePossible()), 'inside the app no service worker is registered');
  await runSetup(app, { hotel: 'Native Hotel', owner: 'Ella' });
  await app.evaluate(() => { ui.modal = null; S.tour.done = true; S.incidents = []; commit(); });
  await app.waitForFunction(() => true);
  await app.waitForTimeout(300);
  const mirroredSave = prefs.get('hotelhq.save.v3');
  assert(!!mirroredSave && JSON.parse(mirroredSave).hotel === 'Native Hotel', 'inside the app every save is copied to the phone\'s own storage');
  await app.evaluate(() => { actions.nav({ view: 'settings' }); });
  assert(await app.locator('text=not used when the game is opened from a file or inside a phone app').count() === 1, 'inside the app the offline setting explains why it is not needed');
  await app.evaluate(() => localStorage.clear());   // the web view loses its data
  await app.reload();
  await app.waitForSelector('.hname', { timeout: 10000 });
  assert(await app.locator('.hname').innerText() === 'Native Hotel' && await app.locator('text=Welcome to Hotel HQ').count() === 0, 'when the web view loses its data the game is restored from the phone\'s storage at start-up');
  await app.evaluate(() => { actions.reset(); });
  assert(!prefs.has('hotelhq.save.v3'), 'starting a new game clears the phone-storage copy too');
  await appCtx.close(); appServer.close();

  // ---- a browser that has lost the save and has no mirror simply starts fresh ----
  const plainCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const plain = await plainCtx.newPage();
  await plain.goto(base);
  assert(await plain.locator('text=Welcome to Hotel HQ').count() === 1, 'with no save and no mirror the game starts at the welcome screen');
  await plainCtx.close();

  fs.rmSync(www, { recursive: true, force: true });
  assert(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  await browser.close(); server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : '\nALL PWA CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
