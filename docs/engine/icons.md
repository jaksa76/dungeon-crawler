# Icons

The engine has 144 icons: 120 common items and 24 interface icons, in one atlas
(`engine/assets/icons/atlas.png`, 12 × 12 tiles of 64 × 64 pixels, transparent background, with
`atlas.json` mapping each id to its tile). `engine/ui/icons.js` loads it. Items refer to an icon
by id (`icon: 'short-sword'` in `engine/content/items.js`); the HUD, the painted desktop panel and the
satchel all draw from it. A campaign can add icon spritesheets of its own for its items; see
[content.md](content.md#custom-items-and-their-icons).

## What is in it

Listed with a short description of each in `art/engine/icons/sheets.json`, six sheets of 24:

| Sheet | Icons |
|---|---|
| weapons | short-sword, long-sword, greatsword, dagger, rapier, scimitar, hand-axe, battle-axe, mace, morning-star, war-hammer, flail, club, spear, halberd, quarterstaff, magic-wand, short-bow, longbow, crossbow, arrows, crossbow-bolts, throwing-knives, sling |
| armour | leather-cap, iron-helmet, great-helm, hood, leather-armour, chainmail, plate-armour, robe, tunic, cloak, leather-boots, iron-boots, leather-gloves, gauntlets, bracers, belt, round-shield, kite-shield, buckler, tower-shield, gold-ring, ruby-ring, silver-ring, amulet |
| potions-food | health-potion, mana-potion, stamina-potion, antidote, greater-health-potion, greater-mana-potion, poison-vial, elixir, water-flask, wine-bottle, ale-mug, milk-jug, bread, apple, cheese, roast-meat, fish, mushroom, honey-jar, pie, carrot, egg, dried-meat, grapes |
| tools-documents | torch, lantern, candle, tinderbox, rope, lockpicks, pickaxe, shovel, hammer, bucket, backpack, compass, spyglass, bedroll, fishing-rod, iron-key, golden-key, silver-key, scroll, spell-scroll, treasure-map, tome, letter, old-journal |
| treasure-magic | gold-coin, coin-pouch, gold-bar, ruby, sapphire, emerald, violet-crystal, pearl, goblet, crown, idol, jewelry-box, rune-stone, crystal-orb, herb, red-flower, bone, skull, feather, spider-silk, snake-fang, monster-hide, dragon-scale, iron-ore |
| ui | bag, journal, map, settings, fullscreen, close, attack, spell, shield, heart, mana-drop, xp-star, gold, talk, use-hand, look-eye, search, drop, lock, unlock, sound-on, sound-off, quest, character |

Where the HUD uses them: the menu buttons (bag, journal, fullscreen, settings), the quick slots, the
satchel grid and container lists. The painted desktop panel in `experiments/game-1/assets/ui/panel.png` has its
pictures baked in; `engine/ui/panel-icons.js` paints the atlas icons over them at startup on a copy,
so games one and three are unaffected. The six menu icons have no cell frames any more: their painted
frames are covered with matching stone, and the icons are drawn crisply, centred where the cells were.
(The cells' positions in the painting are measured and listed in that file, `MENU_CELLS`.) `attack`, `spell`, `heart`, `lock` and the rest are ready for
the features that will use them.

## How big are they?

**All 144 icons (items and interface) are true 16 × 16 pixel art.** Smoothly shrinking painted art to a few pixels made simple
shapes mushy, so every sheet is painted differently (`"native": 16` in `sheets.json`): Codex draws each
icon as 16 × 16 pixel art, enlarged so every art pixel is a hard 12 × 12 block. `slice` finds the block size
and samples one colour per block, giving a real 16 × 16 image with no smoothing (`png/` holds those 16 × 16
files). The atlas stores them enlarged 4× with nearest neighbour, so its tiles stay 64 × 64, and lists them
under `"native"` in `atlas.json`. The HUD draws a native icon at 16 icon pixels (32 px on phones, 48 on the
desktop panel), with smoothing off, so it is always crisp.

The first version of the item icons was painted at higher resolution and smoothly shrunk. Next to the
crisp interface icons it looked mushy, so all of them were regenerated as 16 × 16. 16 is small for 120
different items (a crossbow or a bundle of arrows is hard to draw in it); 24 × 24 would give more detail,
but every icon in the HUD would then need to be 24 × 24 so the pixels stay the same size.

## Two styles, and a switch

The game has two icon sets and can show either:

- **pixel**: the 16 × 16 pixel art described above (`atlas.png`). This is the default.
- **detailed**: the first, painted version of the same 144 icons, shrunk smoothly into 64 × 64 tiles (`atlas-hd.png`, sliced
  into `png-hd/`). More detail, softer edges.

Switch in **Settings → Icons** (the choice is saved in the browser, and the page reloads because the panel and icons are drawn once
at startup), or open the game with `?icons=hd` or `?icons=pixel` to override the saved choice. The detailed set is slower to
produce: `node tools/icon-sheets.mjs slice <sheet> <painted.png> --hd` for each sheet (the sheets are the 1536 × 1024 painted ones,
*not* the 16 × 16 ones) and then `node tools/icon-sheets.mjs pack --hd`. Either set can be regenerated without touching the other.

## Making or changing icons

Everything goes through `tools/icon-sheets.mjs` (it needs only pngjs):

1. Edit `art/engine/icons/sheets.json`. Each sheet is 6 columns × 4 rows, read left to right, top to bottom,
   as `"id|what to paint"`. Ids must be unique.
2. `node tools/icon-sheets.mjs prompt <sheet> style-panel.png [other-sheet.png]` prints the prompt. It asks
   for a flat magenta background, one icon centred in each 256-pixel cell, no text, and the style of the
   attached images (for a native sheet, 16 × 16 pixel art enlarged to 12-pixel blocks instead). The first sheet (weapons) was painted from `experiments/game-1/assets/ui/panel.png` alone; the
   other five also had the weapons sheet attached so the style stays the same.
3. Run it through Codex, one sheet per run (about two minutes each, and the runs can go in parallel):
   `codex exec -C <work dir> -s workspace-write --skip-git-repo-check -i style-panel.png - < prompt.txt`.
   The command can return before the image is saved, so wait for `sheet-<name>.png` to appear.
4. `node tools/icon-sheets.mjs slice <sheet> <work dir>/sheet-<name>.png` turns the magenta into real
   transparency, finds each icon (even one that drifted out of its cell), trims it, and writes
   `art/engine/icons/png/<id>.png` (64 × 64, or 16 × 16 for a native sheet). It prints a warning for a missing icon, or an icon made of many pieces.
5. `node tools/icon-sheets.mjs pack` rebuilds `atlas.png` and `atlas.json`. Commit the PNGs and the atlas.

A campaign's own icons use the same steps with `--campaign <name>` added to each command; see
[content.md](content.md#custom-items-and-their-icons).

The keying removes pixels very close to pure magenta everywhere and softens the edge a few pixels in, so
purple things (the violet crystal, the elixir) keep their colour. The painted sheets themselves are not kept
in the repository; regenerate one if you want a different take.

## Using an icon

An item: set `icon: '<id>'` in its definition. Anywhere else: `icons.draw(g, id, x, y, w, h)` from
`engine/ui/icons.js`. If it appears in the HUD, go through `addArt` in `engine/ui/mobile-hud.js` so its pixels
stay the same size as the UI's.

## Checks

`node --test tests/inventory.test.mjs` checks that the ids are unique, that there are between 100 and
200, that every one is in the atlas, that the 24 interface icons are native 16 × 16, and that every item and
the panel use ids that exist.
`node tools/check-pixels.mjs` checks that every icon is shown at the UI pixel size.
