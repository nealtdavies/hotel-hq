'use strict';
/* Assembles the web files the phone apps are built from, in www/ (or the folder given).
   Usage: node tools/build-www.js [outDir]
   It copies the game, leaves out what an app does not need (the service worker, the unused pictures folder, tests, tools) and adds the
   native storage mirror to index.html. Then `npx cap sync` copies www/ into the iOS and Android projects. */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'www'));

function copy(from, to, skip) {
  const src = path.join(root, from);
  if (fs.statSync(src).isDirectory()) {
    for (const name of fs.readdirSync(src)) { if (skip && skip(path.join(from, name))) continue; copy(path.join(from, name), path.join(to, name), skip); }
  } else { fs.mkdirSync(path.dirname(path.join(out, to)), { recursive: true }); fs.copyFileSync(src, path.join(out, to)); }
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const dir of ['css', 'js']) copy(dir, dir);
copy('icons', 'icons', p => ['source', 'native'].includes(path.basename(p)));   // the master artwork and native-project icons stay out of the app's web files
copy('assets', 'assets', p => p.split(path.sep).includes('unused'));
copy('manifest.webmanifest', 'manifest.webmanifest');
copy('native/storage-native.js', 'js/storage-native.js');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!html.includes('<script src="js/storage.js"></script>')) throw new Error('index.html does not load js/storage.js');
html = html.replace('<script src="js/storage.js"></script>', '<script src="js/storage.js"></script>\n<script src="js/storage-native.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);
const count = d => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
console.log(`Built ${out} (${count(out)} files)`);
