# Artwork for the crisis games

Every picture here is **optional**. The games work with none of them. Each picture you add is used automatically the next time the game is played. Put all of them in **`assets/games/`** with the exact filenames below.

Three kinds of picture, and what each one does:

1. **Scene (`<crisis>-<action>-bg.jpg`)**: the picture behind a game. A normal JPG.
2. **Moving set (`<crisis>-<action>-f1.png` to `-f7.png`)**: a row of transparent PNGs laid over the scene. As the marker slides across, the game swaps from picture 1 to picture 7, so the valve wheel turns, the cord pulls, the tarpaulin spreads. **The middle picture (number 4) is the "just right" pose**, and the green zone on the slider is centred on it.
3. **Patch (`patch-wet.png`, `patch-crumb.png`)**: a small transparent PNG, drawn on top of the scene wherever the player has to tap.

## Sizes

| Kind | Size | Format | Notes |
|---|---|---|---|
| Scene | 1200 x 800 (3:2) | JPG, quality about 80 | Shown whole in the tapping games and the timing games with a moving set. In the word games and the timing games with no moving set it is shown as a **wide strip**, so keep the important part in the **middle third** from top to bottom. |
| Moving set | 1200 x 800, **exactly the same size as its scene** | PNG with transparency | Fully transparent except the moving thing, drawn in the right place on the scene. Optimise each file (TinyPNG or similar) to under about 200 KB. |
| Patch | 256 x 256 | PNG with transparency | Drawn at about a fifth of the scene's width. Centre the patch in the square. Top-down or slightly angled so it sits flat on a floor. |

Seven pictures in a moving set is the plan. If you make fewer (5 is fine) the game uses what is there and still puts the middle one in the middle, so use an **odd number**.

Total size for everything below: about 36 files, roughly 4 to 5 MB. They are all added to the offline pictures automatically.

## The three moving sets

The easy way to make one: draw the scene **with** the moving part, copy it seven times, and in each copy erase everything except the moving part, moved a step further each time. Then make the scene itself from the same picture with the moving part erased. That keeps everything lined up.

| Files | Game | What the seven pictures show |
|---|---|---|
| `assets/games/pipe-valve-f1.png` to `-f7.png` | Shut off the water (burst pipe) | A big red valve wheel on a water pipe, turned a little further each time. **1** = wide open, **4** = turned just right and snug shut, **7** = turned too far and straining. The scene (`pipe-valve-bg.jpg`) shows the pipe and the valve's hub with **no wheel**. |
| `assets/games/power-generator-f1.png` to `-f7.png` | Start the generator (power cut) | A pull cord on a small generator. **1** = cord at rest, **2 and 3** = being pulled out, **4** = pulled fully and the engine catches (a little spark and glow), **5 to 7** = cord snapping back and a puff of smoke from pulling too late. The scene shows the generator with the handle and cord removed. |
| `assets/games/roof-tarp-f1.png` to `-f7.png` | Cover the roof (storm damage) | A blue tarpaulin thrown across a hole in the roof. **1** = folded at the edge, **2 and 3** = unfolding across, **4** = spread exactly over the hole and held down, **5 to 7** = blown past and flapping away in the wind. The scene shows the roof with the hole and **no tarpaulin**. |

## The scenes (13)

Style for all of them: the same bright, natural-light, photorealistic look as the other pictures in the game. No text anywhere. Nobody hurt or frightened.

| File | Game | Prompt |
|---|---|---|
| `assets/games/pipe-valve-bg.jpg` | Shut off the water | A hotel plant room wall with a large water pipe, a valve body and a bare round hub where a red valve wheel would be mounted, a little water dripping, bright light |
| `assets/games/pipe-plumber-bg.jpg` | Call the plumber | A hotel reception desk, a calm receptionist on the telephone with a notepad, a plumber's van parked outside the window |
| `assets/games/pipe-dry-bg.jpg` | Dry out the rooms | A hotel corridor floor with plain light carpet and a clear empty area in the middle, a fan, a stack of towels and a mop bucket at the edges. Leave the carpet bare so patches can go on top |
| `assets/games/power-generator-bg.jpg` | Start the generator | A small portable generator outside a hotel back door at dusk, with no handle or cord on it, torches glowing nearby |
| `assets/games/power-phone-bg.jpg` | Ring the power company | A hotel back office desk at dusk lit by a torch, a desk telephone and a notepad, a window showing a dark street |
| `assets/games/power-barbecue-bg.jpg` | Cook on the barbecue | A hotel terrace barbecue grill with charcoal, a chef's hands holding tongs, torch-lit evening, tables set in the background |
| `assets/games/mice-clean-bg.jpg` | Deep-clean the kitchen | A spotless commercial hotel kitchen worktop and floor with plain clean surfaces and a brush and mop at the edge. Leave the surfaces bare so crumbs can go on top |
| `assets/games/mice-pest-bg.jpg` | Call pest control | A hotel kitchen storeroom with tidy shelves, a friendly pest-control expert in a white suit holding a clipboard, a chef explaining |
| `assets/games/roof-tarp-bg.jpg` | Cover the roof | A hotel roof in a storm at dusk with a gap where tiles have blown off, a ladder, a maintenance worker safely clipped on in a helmet at the edge, dark clouds. No tarpaulin |
| `assets/games/roof-roofer-bg.jpg` | Book a roofer | A roofer's van with a ladder on top parked outside a hotel in the rain, a roofer in a hi-vis jacket and hard hat |
| `assets/games/roof-dry-bg.jpg` | Dry and re-make the rooms | A top-floor hotel room with a plain carpet area and a dehumidifier, rain on the window, bed stripped back. Leave the carpet bare so patches can go on top |
| `assets/games/gossip-reply-bg.jpg` | Reply to your reviews | A hotel reception desk with a laptop showing a page of star ratings (no readable text) and a receptionist typing thoughtfully |
| `assets/games/gossip-ask-bg.jpg` | Ask for a review | A smiling family with suitcases at a hotel reception desk checking out, a friendly receptionist smiling back |

## The patches (2)

| File | Used in | Prompt |
|---|---|---|
| `assets/games/patch-wet.png` | Drying the rooms (the burst pipe and storm damage) | A glossy dark wet patch on carpet, slightly irregular, with a small shine highlight, top-down view, transparent background |
| `assets/games/patch-crumb.png` | Cleaning the kitchen (the pest scare) | A little pile of crumbs and a few specks on a clean floor, top-down view, transparent background |

## Where the patches go

On a scene, patches appear at six fixed spots (as a percentage across and down): 16/30, 48/22, 80/34, 26/66, 58/72 and 84/64. Keep the scene's floor or worktop clear around those spots.

## If you would like different things

- Another game wants a scene or a moving set? Tell me which one, and what the moving part is, and I will add it. The word games and the order game can have a scene already. A moving set can be added to any timing game.
- Want fewer or more than seven moving pictures? Any odd number works.
- Want each patch to look different (three different puddles)? Send them as `patch-wet-1.png` to `-3.png` and I will use them in turn.

## Adding them

Put the files in `assets/games/` and tell me. I will rebuild the offline list (`node tools/make-sw.js`), check them and put them online. The code looks for each file when a game opens, and ignores any that are missing.
