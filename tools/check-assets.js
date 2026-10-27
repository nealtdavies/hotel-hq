'use strict';
/* Lists which expected images are present or missing. Usage: node tools/check-assets.js */
const fs = require('fs'), path = require('path');
const { run, root } = require('./load-data')();
const J = c => JSON.parse(run(`JSON.stringify(${c})`));
const want = [];
for (const t of J('TIERS.map(t => t.id)')) want.push(run(`tierImage(${t})`));
for (const [t, d] of Object.entries(J('ROOM_TYPES'))) for (let i = 1; i <= d.variants; i++) { const slug = t.toLowerCase().replace(/\s+/g, '-'); want.push(`assets/rooms/${slug}-${i}.jpg`); want.push(`assets/rooms/${slug}-${i}-trashed.jpg`); const animal = J('ROOM_ANIMALS')[t]; if (animal) want.push(`assets/rooms/${slug}-${i}-${animal}.jpg`); }
const n = run('PORTRAIT_COUNT');
for (const g of ['f', 'm']) for (let i = 1; i <= n; i++) want.push(`assets/staff/${g}${String(i).padStart(2, '0')}.jpg`);
for (const e of Object.values(J('ENTERTAINERS'))) want.push(`assets/staff/${e.portrait}.jpg`);
for (const g of ['f', 'm']) {
  for (let i = 1; i <= run('GUEST_FACE_COUNT'); i++) want.push(`assets/guests/${g}${String(i).padStart(2, '0')}.jpg`);
  for (let i = 1; i <= run('KID_FACE_COUNT'); i++) want.push(`assets/guests/k${g}${String(i).padStart(2, '0')}.jpg`);
}
for (const s of J('SCENARIOS.map(s => s.img)')) want.push(`assets/scenes/${s}.jpg`);
for (const d of J('DEFAULT_MENU.map(d => d.key)')) want.push(`assets/menu/${d}.jpg`);
const unique = [...new Set(want)];
const have = unique.filter(f => fs.existsSync(path.join(root, f)));
console.log(`${have.length} of ${unique.length} images present`);
const missing = unique.filter(f => !have.includes(f));
if (missing.length && missing.length <= 40) console.log('Missing:\n  ' + missing.join('\n  '));
else if (missing.length) console.log(`Missing ${missing.length} (run node tools/make-image-guide.js and see IMAGE-GUIDE.md)`);
