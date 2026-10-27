'use strict';
/* Keeps sw.js and pictures.json in step with the game files.
   Usage: node tools/make-sw.js            writes them
          node tools/make-sw.js --check    exits 1 if either is out of date (used by tests/pwa.test.js)
   VERSION is a hash of every file the worker stores, so it changes whenever any of them does. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p));
const list = dir => fs.readdirSync(path.join(root, dir)).filter(f => fs.statSync(path.join(root, dir, f)).isFile()).sort().map(f => `${dir}/${f}`);

/* Every picture the game can show (the unused folder is left out). */
function walk(dir) { return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(d => d.isDirectory() ? (d.name === 'unused' ? [] : walk(`${dir}/${d.name}`)) : [`${dir}/${d.name}`]); }
const pictures = walk('assets').filter(f => /\.(jpe?g|png|webp|gif|svg)$/i.test(f)).sort();
const bytes = pictures.reduce((a, f) => a + fs.statSync(path.join(root, f)).size, 0);
const picturesJson = JSON.stringify({ count: pictures.length, bytes, files: pictures }, null, 1) + '\n';

const shell = ['index.html', 'manifest.webmanifest', 'pictures.json', 'css/style.css', ...list('js'), ...list('icons')];
const hash = crypto.createHash('sha256');
shell.forEach(f => { hash.update(f); hash.update(f === 'pictures.json' ? picturesJson : read(f)); });
const version = hash.digest('hex').slice(0, 12);

const block = `/* BUILD:START */\nconst VERSION = '${version}';\nconst PRECACHE = ${JSON.stringify(['./', ...shell], null, 2)};\n/* BUILD:END */`;
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const next = sw.replace(/\/\* BUILD:START \*\/[\s\S]*?\/\* BUILD:END \*\//, block);
const current = fs.existsSync(path.join(root, 'pictures.json')) ? fs.readFileSync(path.join(root, 'pictures.json'), 'utf8') : '';

if (process.argv.includes('--check')) {
  const stale = [next !== sw && 'sw.js', current !== picturesJson && 'pictures.json'].filter(Boolean);
  if (stale.length) { console.error(`Out of date: ${stale.join(', ')}. Run: node tools/make-sw.js`); process.exit(1); }
  console.log(`sw.js and pictures.json are up to date (version ${version}, ${pictures.length} pictures)`);
} else {
  fs.writeFileSync(path.join(root, 'sw.js'), next);
  fs.writeFileSync(path.join(root, 'pictures.json'), picturesJson);
  console.log(`Wrote sw.js (version ${version}, ${shell.length + 1} files stored) and pictures.json (${pictures.length} pictures, ${(bytes / 1048576).toFixed(1)} MB)`);
}
