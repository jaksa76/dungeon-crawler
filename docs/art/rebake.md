# Art to rebake for the 320 × 180 scene

The game now draws the scene at **320 × 180 canvas pixels** and shows every canvas pixel at a whole number of screen pixels
(see [ui.md](../engine/ui.md)). The slot art, though, is still baked for a **640 × 360** view: the compositor shrinks it by half
with smoothing as it draws. So the picture is soft where the HUD is sharp, and a painted detail finer than two canvas pixels is
lost. Rebaking the art at the native size fixes that. **Nothing here is needed for the game to run**: it all still works at
640 × 360 and is shrunk. This list is what a rebake touches, found by looking at the files, not by rebaking any of them.

## What changes in the engine first

The view geometry is `DEFAULT_VIEW` in `engine/render/view.js` (or a level's own `view`). Every slot is a rectangle projected
from it, so **halving the view halves every slot image**, and the images cannot be reused: a 432 × 360 wall front becomes 216 × 180.

1. Set `W: 320, H: 180` (the engine already draws such a view 1:1: `INTERNAL` in `core/game.js` follows the view width).
2. Regenerate the plan and the guides: `node tools/studio2d.mjs plan` and `node tools/studio2d.mjs guides`
   (`art/engine/guides/`, `art/engine/plan.json`).
3. Rebake or repaint each kind below, then check the level loads with `?debug` (the status line lists any slot image still missing).

The 50° field of view and the draw depth stay as they are. `minArea` (30 px²) is measured in view pixels, so at half size it may skip
more of the distant slots; the backdrop shows where one is skipped. Check it by eye and lower `minArea` if a far slot goes missing.

Two other routes exist and are worth knowing: the existing **pixel slice** (`experiments/pixel-slice/`, `--px`) bakes a 160 × 90
view shown at 2×, which gives chunkier pixels (each art pixel is two canvas pixels); and keeping 640 × 360 and accepting the
smoothing. This document assumes the first, the native 320 × 180.

## The list

Today's sizes are the smallest and largest file in the folder.

| Art | Where | Files | Today (px) | At 320 × 180 | Notes |
|---|---|---|---|---|---|
| Wall types (8): `dungeon-door`, `dungeon-stone`, `house-a`, `house-b`, `house-door`, `shop-alchemist`, `shop-smith`, `stone-wall` | `engine/assets/walls/<type>/` | 128 (16 per type: `front-d1..3-l0..2`, `side-d0..3-l1..3`) | 17 × 252 to 432 × 360 | half: 9 × 126 to 216 × 180 | the largest, `front-d1-l0`, is 432 × 360 today and 216 × 180 after |
| Props (6): `barrel`, `chest`, `crate`, `lamppost`, `stall`, `well` | `engine/assets/props/<prop>/` | 154 (24–27 per prop: `prop-<far\|near\|left\|right>-d<n>-l<n>`) | 24 × 27 to 641 × 668 | half | the `stall` has separate side art (`sideW`); see [prop-views-test.md](prop-views-test.md) |
| NPCs (3): `guard`, `hooded`, `villager` | `engine/assets/npcs/<npc>/` | 80 | 27 × 69 to 206 × 435 | half | the faces and hands are the first things to go at 90 px tall |
| Monsters (11 + the campaign's `snake`) | `engine/assets/monsters/<name>/`, `games/ravensmoor/assets/monsters/snake/` | 220 + 20 (per monster: `front`, `back`, `left`, `right` and the `animation` atlas at distances `d0..d3`) | 20 × 24 to 3200 × 416 | half | the animation atlases hold every frame of the clip set; `tests/browser/monster-art.browser.mjs` checks that all 12 monsters have every frame at every distance and direction, and must still pass; see [monster-animation.md](../engine/monster-animation.md) |
| Town ground and sky | `engine/assets/environments/town/` (`floor.png`, `backdrop-N/E/S/W.png`) | 5 | 640 × 360 | 320 × 180 | the floor is mirrored on alternate steps; keep the horizon row (it is at row 224 of 360 today, 112 of 180) |
| Dungeon ground | `engine/assets/environments/dungeon/floor.png` | 1 | 640 × 360 | 320 × 180 | |
| Greybridge backdrop | `games/ravensmoor/assets/greybridge-backdrop.png` | 1 | 1672 × 941 | 320 × 180 | one picture for all directions |

That is **609 files**. One level loads a subset: the Undercrypt loads 299.

### Already native, leave alone

| Art | Where | Notes |
|---|---|---|
| Hero sprite | `engine/assets/ui/hero-sprite.png`, 48 × 96 | drawn 1:1 in the satchel and the character screen; the HUD head is a crop of its top |
| Icons | `engine/assets/icons/atlas.png` (768 × 768, 12 columns) | 16 × 16 pixel art, enlarged 4× inside 64 × 64 tiles and drawn back at 16 × 16 (`"native"` in `atlas.json`). Repacking at 16 × 16 tiles would shrink the file to 192 × 192; optional, and `icons.js` would need the tile size changed |
| Font | `engine/ui/font-5x8.js` | 5 × 8 bitmap |
| World map | `games/ravensmoor/assets/world-map.png`, 320 × 180 | pixel art, drawn 1:1 across the map screen (`ui/world-map.js`) |

### No longer used by the game

These were the old DOM and painted-panel UI. Nothing loads them any more; delete them when you are sure.

| Art | Size | Was |
|---|---|---|
| `engine/assets/ui/panel.png` | 1448 × 241 | the painted desktop panel |
| `engine/assets/ui/inventory-bg.png` | 1280 × 720 | the satchel's painted background |
| `engine/assets/icons/atlas-hd.png` and `atlas-hd.json` | 768 × 768 | the "detailed" icon set (still loaded by `?icons=hd`, but it has no setting now) |
| `art/engine/icons/png-hd/` and the `-hd` sheets | | sources of the above |
| `engine/assets/ui/panel-stone.png` | 1254 × 1254 | the frame of the old HTML menus |
| `engine/assets/ui/rpg-pixel.woff` | | the old HTML menus' font |

### The screens before the game

The main menu, saves list and character creation are drawn on the canvas now, in a 320 × 180 area. What art they use: the hero sprite
(native), and the campaign's optional `menu.logo` and `menu.background`. Ravensmoor gives a background
(`games/ravensmoor/assets/title-background.png`, 400 × 240 pixel art, painted by Codex and reduced with `tools/pixelate.mjs`; the
painting and prompt are in `art/ravensmoor/painted/title-background.*`) and no logo, so its title is set in the pixel font. A logo is
drawn at most 240 × 56 (enlarged only by a whole number, smoothed otherwise); a background is cover-fitted to the canvas (320 × 240 or
400 × 180) and lightly darkened, so paint it at 400 × 240 to cover both: it is then drawn at scale 1, crisp. Keep the middle of a
background (the title and the three buttons, about the centre 60% across and 25–85% down) calm and dark; the darkening alone does not
make text readable over a bright or busy picture.

## Optional: the HUD as art

The HUD is drawn from rectangles in the game's colours (`THEME` in `ui/canvas.js`), not from pictures, so it needs no art. If it should look
painted, these are the pieces, all at native size and with the hit regions of `ui/hud.js` unchanged:

| Piece | Size |
|---|---|
| Desktop bar | 320 × 60 |
| Left and right rail | 40 × 180 each |
| Menu window (the frame round every menu) | 320 × 180, with a rim of at most 5 px and the title bar at y 5–18 |
| Quick slot, menu button, bar frames | 18 × 18, 24 × 18, 70 × 11 (desktop) / 34 × 9 (phone) |
| Move stick and turn pill | 36 × 36 and 36 × 24 |
