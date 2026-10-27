'use strict';
/* Generates IMAGE-GUIDE.md: every image slot in the game with its filename and an AI-image prompt. Usage: node tools/make-image-guide.js */
const fs = require('fs'), path = require('path');
const { run, root } = require('./load-data')();
const J = c => JSON.parse(run(`JSON.stringify(${c})`));

const scenarios = J('SCENARIOS.map(s => ({ img: s.img, title: typeof s.title === "string" ? s.title : s.id, cat: s.cat, prompt: s.imgPrompt }))');
const roomTypes = J('ROOM_TYPES');
const portraits = J('PORTRAIT_COUNT');

const STYLE = 'Photorealistic, bright natural light, modern luxury beachfront resort in the same style as the hotel exterior (white architecture, palms, turquoise sea, soft pastel blue and cream tones), professional photography, no text or logos, no watermarks.';
const roomPrompts = {
  'standard-1': 'A tidy king room with a garden view and a king bed, white linen, neutral palette, bedside lamps, a small desk and a window with soft daylight.',
  'standard-2': 'A twin room with two single beds, grey headboards, a reading chair and a view of a quiet street.',
  'standard-3': 'A cosy double room with a navy accent wall, wooden floor, wall-mounted TV and a rug.',
  'standard-4': 'A bright double room with large window, pale oak furniture and a green plant on the sill.',
  'ocean-view-1': 'The standard king room with a sea view: oak bed, navy cushions, desk, sliding doors onto a balcony overlooking turquoise ocean.',
  'ocean-view-2': 'The standard king room with a sea view: sage cushions, tan throw, armchair, palm trees and ocean beyond the balcony.',
  'ocean-view-3': 'The standard king room with a sea view: grey headboard, teal cushions, rattan pendant lights, beach visible beyond the balcony.',
  'ocean-view-4': 'The standard king room with a sea view: dark wood bed, navy throw, window seat looking out to the ocean.',
  'family-1': 'A spacious family room with a double bed and a sofa bed, a play corner with toys, warm colours.',
  'family-2': 'A family room with bunk beds and a double bed, wooden furniture and a small round table.',
  'family-3': 'A spacious family suite with three single beds in a row, teal accents and rattan pendant lights, sliding doors open to a terrace with sun loungers and a dining table, ocean beyond.',
  'family-4': 'A family suite with a king bed and a separate lounge seating area, navy throw, a large terrace with a sofa and parasol, ocean view.',
  'luxury-suite-1': 'A luxury suite with a large cream sectional sofa and marble coffee table in the lounge, a king bed beyond, and a huge open terrace with sun loungers and ocean view.',
  'luxury-suite-2': 'A luxury suite with a dark wood king bed and bench, a long sofa and console, palm plants, sliding doors open to a terrace with loungers and the ocean beyond.',
  'luxury-suite-3': 'A luxury suite with a king bed in the foreground, a lounge area with rattan pendant lights and a round mirror, and a terrace with sun loungers and a dining table over the beach.',
  'luxury-suite-4': 'A luxury suite with a navy-accented king bed and bench, a window seat, a beige sofa and marble side table, and a terrace with parasol and ocean view.'
};
const starters = {
  f01: 'Priya Patel, receptionist: friendly South Asian woman, about 30, hotel front desk uniform, warm smile.',
  m01: 'Sam Taylor, receptionist: man in his late 20s, smart hotel uniform, relaxed confident expression.',
  f02: 'Maria Garcia, housekeeper: Latina woman about 45, tidy housekeeping uniform, kind expression.',
  m02: 'Ben Clark, housekeeper: man about 35, neat housekeeping tunic, easy smile.',
  m03: 'Luca Rossi, chef: Italian man about 42 in white chef jacket, short beard, proud expression.',
  f03: 'Aisha Khan, spa therapist: woman about 32, soft spa uniform, calm expression.',
  m04: 'Tom Baker, maintenance: man about 45 in a plain navy work shirt, friendly and capable.'
};
const generic = ['mixed ages 25 to 55, a range of ethnicities, smart hotel uniform or smart casual, friendly neutral expression'];

const animals = J('ROOM_ANIMALS');
const animalPrompt = { baboon: 'with a large wild baboon sitting on the bed eating snacks, muddy paw prints on the bedding and floor, two frightened guests by the wall', lion: 'with a large wild lion standing between the beds, muddy paw prints on the bedding and floor, torn blankets, belongings scattered', cats: 'trashed by a large group of feral street cats climbing over the beds, knocking things over, paw prints on the bedding, spilled food and scattered belongings', frenchies: 'overrun by about eight escaped French bulldogs getting into silly trouble: one stuck behind the sofa, one with its head in a bin, others on the beds, scattered cushions and paper' };
const animalLine = k => { const type = Object.keys(roomTypes).find(t => k.startsWith(t.toLowerCase().replace(/\s+/g, '-') + '-')); const a = animals[type]; return a ? `\n| assets/rooms/${k}-${a}.jpg | The identical room, same angle and lighting, ${animalPrompt[a] || a}. |` : ''; };

let md = `# Hotel HQ image guide

Every picture is optional. If a file is missing the game shows a neutral placeholder, so you can add images gradually.
Put files in the folders below with the **exact filenames**. JPG only, any size (the game scales them).

**Style prefix for every prompt:** ${STYLE}

| Type | Folder | Suggested shape |
|---|---|---|
| Hotel exterior | assets/hotel | wide, 16:9 |
| Rooms | assets/rooms | landscape, 16:10 |
| Staff headshots | assets/staff | square, face centred, head and shoulders |
| Scenarios | assets/scenes | wide, 16:9 (the middle strip is shown; keep the subject centred) |

You can also upload photos inside the game for any room or team member. Those override these files on that device.

## Hotel exteriors (4 images, one per level)

The building grows with the hotel. Keep the same coastal style, and show the same site getting bigger.

| File | Level | Prompt |
|---|---|---|
| assets/hotel/exterior-1.jpg | Boutique Hotel (3-star) | A small four-storey white boutique hotel with planted terraces, a porte-cochere entrance and a few cars, palms, beach and turquoise sea behind. |
| assets/hotel/exterior-2.jpg | Small Hotel (3.5-star) | The same site grown wider: a longer curved white building with terraces, a larger car park, palms and the sea. |
| assets/hotel/exterior-3.jpg | Mid-Size Hotel (4-star) | A larger six-storey white curved building with terraced gardens, a pool with sun loungers and cabanas, palms and the sea. |
| assets/hotel/exterior-4.jpg | Grand Resort (5-star) | A huge ten-storey white curved mega-resort with flowering terraces, a rooftop helipad with a helicopter, a large pool with cabanas, palms and the sea. |

## Rooms (${Object.keys(roomPrompts).length} images)

Each room also has optional twins: **-trashed.jpg** (the identical room after a wild party) and an animal twin (**-baboon.jpg** for Standard rooms, **-lion.jpg** for Ocean View rooms, **-cats.jpg** for Family rooms, **-frenchies.jpg** for Luxury Suites: wild animals have broken in). They appear in the matching incident and on the Rooms page while the room is damaged. Generate it as an edit of the matching room photo so the room is exactly the same.

| File | Prompt |
|---|---|
${Object.entries(roomPrompts).map(([k, p]) => `| assets/rooms/${k}.jpg | ${p} |\n| assets/rooms/${k}-trashed.jpg | The identical room, same angle and lighting, trashed by a party: bedding on the floor, pizza boxes, cans and bottles, clothes strewn about. |\n${animalLine(k)}`).join('\n')}

## Staff headshots (${portraits * 2} images)

The first seven are the starting team. The rest are assigned to job applicants, so keep them varied. Use \`f\` for female-presenting and \`m\` for male-presenting so the pictures match the names the game picks.

| File | Prompt |
|---|---|
`;
for (const g of ['f', 'm']) for (let i = 1; i <= portraits; i++) {
  const id = g + String(i).padStart(2, '0');
  md += `| assets/staff/${id}.jpg | Headshot portrait, head and shoulders, plain soft background. ${starters[id] || `A ${g === 'f' ? 'woman' : 'man'}; ${generic[0]}.`} |\n`;
}
const entertainers = J('ENTERTAINERS');
md += `\n## Entertainment team headshots (${Object.keys(entertainers).length} images)\n\nThe first person hired in each entertainment role gets their own headshot, so these four are shown instead of the ordinary pool. Same style as the other headshots.\n\n| File | Role | Prompt |\n|---|---|---|\n`;
for (const [role, e] of Object.entries(entertainers)) md += `| assets/staff/${e.portrait}.jpg | ${role} | Headshot portrait, head and shoulders, plain soft background. ${e.look} |\n`;
const faceCount = J('GUEST_FACE_COUNT'), kidFaceCount = J('KID_FACE_COUNT');
md += `\n## Guest faces (${faceCount * 2 + kidFaceCount * 2} images)\n\nShown when a guest phones, in the guest list and on bookings. Each person always gets the same face, chosen from their name. Square, face centred, head and shoulders, a friendly look, relaxed holiday clothes, a hotel lobby or garden softly blurred behind. Generate them as grids of 6 across by 4 down with a thin plain white line between faces, and cut them with \`python3 tools/split-quad.py <grid> guests <names> --grid 6x4\`.\n\n- Grown-ups: \`assets/guests/f01.jpg\` to \`f${String(faceCount).padStart(2, '0')}.jpg\` (women) and \`m01.jpg\` to \`m${String(faceCount).padStart(2, '0')}.jpg\` (men). A grid holds 12 women (the top two rows) then 12 men (the bottom two rows), of different ages, hair, skin tones and clothes. ${faceCount / 12} grids.\n- Children: \`assets/guests/kf01.jpg\` to \`kf${String(kidFaceCount).padStart(2, '0')}.jpg\` (girls) and \`km01.jpg\` to \`km${String(kidFaceCount).padStart(2, '0')}.jpg\` (boys), aged about 6 to 12. One grid: 12 girls (the top two rows) then 12 boys (the bottom two rows).\n`;
const menu = J('DEFAULT_MENU');
const cats = [...new Set(scenarios.map(s => s.cat))];
md += `\n## Scenario pictures (${scenarios.length} images)\n\nShown at the top of each situation. Group by type below.\n`;
for (const c of cats) {
  md += `\n### ${c}\n\n| File | Scenario | Prompt |\n|---|---|---|\n`;
  scenarios.filter(s => s.cat === c).forEach(s => { md += `| assets/scenes/${s.img}.jpg | ${s.title} | ${s.prompt} |\n`; });
}
md += `\n## Menu pictures (${menu.length} images)\n\nThe starting restaurant menu. Players can also add their own dishes with their own photos inside the game.\nSquare or landscape plated-food photos work best, shot from above or at 45 degrees on a plain table.\n\n| File | Dish | Prompt |\n|---|---|---|\n`;
menu.forEach(d => { md += `| assets/menu/${d.key}.jpg | ${d.name} | Photorealistic plated ${d.name.toLowerCase()} (${d.desc.replace(/\.$/, '').toLowerCase()}), restaurant presentation, natural light, shallow depth of field, no text. |\n`; });
fs.writeFileSync(path.join(root, 'IMAGE-GUIDE.md'), md);
console.log(`Wrote IMAGE-GUIDE.md: ${menu.length + 4 + (Object.keys(roomPrompts).length * 2 + Object.keys(roomPrompts).filter(k => Object.keys(roomTypes).some(t => animals[t] && k.startsWith(t.toLowerCase().replace(/\s+/g, '-') + '-'))).length) + portraits * 2 + scenarios.length} image slots`);
