# Items, the pack and containers

## Items

`engine/content/items.js` is the rule book's item list; a campaign can add items or change one in its own
content book (Ravensmoor gives the torch a hint about the Undercrypt). Every item is data:

```js
'health-potion': { name: 'Health potion', type: 'potion', icon: 2, stack: 5, use: { hp: 20 },
  description: 'A small vial of red tonic that mends wounds.' },
```

`icon` is an id from the icon atlas: 120 item icons and 24 interface icons, listed in
`art/engine/icons/sheets.json` and described in [icons.md](icons.md). Only eight items are
defined so far, but an icon exists for every common item below them.
`stack` is how many fit in one slot (default 1). `use` is `{ hp, mp }` to restore; items
without it cannot be used yet. The campaign's `startingItems` is what the player carries at the start.

## The pack

`engine/rules/inventory.js` holds the logic, with no DOM. `add` fills existing stacks first,
then empty slots, and returns how many did not fit. `remove` takes part or all of a slot.
`move(from, to)` is what a drag does: into an empty slot, merged into the same item while
the target has room, otherwise swapped.

The pack has `inventorySize` slots (48) in `inventoryColumns` columns (8), engine defaults that a campaign
may override in `startGame`. **12 columns by 10 rows (120 slots) is too much**: the satchel sits on a
16:9 scene that is only 299 pixels tall on a phone held sideways, so cells would be
about 20px, too small to see an icon or to drag. Rows are what is scarce. 8 by 4 gives
roughly 35px cells on a phone and 62px on desktop. A taller grid is possible if the
satchel is allowed to scroll, which it already does in portrait.

## The satchel screen

Press **I** (or tap the bag icon) to open it; press **I** again, or **Escape**, to close.

- **Left:** a tall niche for the hero. It currently shows the portrait as a placeholder.
  It is a full-height alcove so that a full-body picture can go here later, with
  equipment slots placed on the figure.
- **Right:** the pack as a grid. Tap a stack to select it. Drag a stack onto another slot
  to move, merge or swap; the icon follows the pointer and the slot it would land on lights
  up. Works with a mouse and with touch.
- **Description bar:** the selected item's name, quantity and description, with **Use**
  (greyed out when the item has no `use`), **Drop one** and **Drop all**. With nothing
  selected it shows a hint. **Close** is in the bar underneath.
- Using a potion restores health or mana and uses one up. If it would be wasted ("Your
  health is already full.") it is kept.
- Portrait phones are too short for this layout: there the painting is dropped, the hero is
  hidden, and the satchel scrolls with the description above the grid.

## Equipment

`engine/rules/equipment.js` (no DOM). The hero has nine slots: head, amulet, weapon, shield, armour,
gloves, two rings and boots. An item is wearable when its definition has `slot` (`'ring'` fits
either ring slot); `bonus: { attack, defence }` is summed by `equipment.bonuses()` for the combat
rules. Worn items are not in the pack. `equip(inventory, index, slot?)` wears one item and
returns what was there to the pack (refused if the pack has no room); `unequip(inventory, slot, toIndex?)`
takes it off. In the satchel the slots sit under the figure: select a pack item and press **Equip**,
or drag it onto a slot; select a worn item and press **Take off**, or drag it onto a pack slot.
The figure itself never changes. It is true 48x96 pixel art, `engine/assets/ui/hero-sprite.png`, shown at the
same pixel size as the portrait and every other UI picture (one art pixel is one UI pixel, so it does not fill the panel height), with the slots lying over it in two even columns
along its sides (head, amulet, weapon, ring left; armour, gloves, shield, ring right) and the boots between at the feet (`SLOT_SPOTS` in `mobile-hud.js`). It was painted by Codex from the portrait
(`experiments/game-1/assets/ui/portrait-hero.png`, attached with `-i`) with a prompt asking for the same adventurer,
full-length, front-facing, unarmed, plain clothes, as 48x96 pixel art enlarged to hard 12x12 blocks on flat
magenta. `node tools/hero-sprite.mjs painted.png` then samples the blocks back to a real 48x96 PNG with transparency.
On portrait phones the figure is hidden but the slots remain, in a row.

The hero starts with no equipment; the village chest holds a sword and the crate can hold a leather cap.
`node --test tests/equipment.test.mjs` covers it.

## Containers and loot

An entity opens as a container with an `open` behaviour (see
[interaction.md](interaction.md)); a prop can carry one as a default, as the barrel does:

```js
{ type: 'open', title: 'Chest', text: 'Packed in oilcloth are supplies for a descent.',
  contents: [{ item: 'health-potion', qty: 2 }, { item: 'torch' }],      // always there
  loot: { rolls: 1, none: 0, entries: [{ item: 'scroll', weight: 1 }] } } // rolled once
```

`qty` is a number or a `[min, max]` range. Each of `rolls` picks one entry by `weight`;
`none` is the weight of finding nothing. What is inside is decided the first time the
container is opened (`engine/rules/loot.js`) and then kept, so it does not change if you
close it and come back. Two barrels from the same prop roll separately.

The panel lists each stack with a **Take** row, plus **Take all**. If the pack is full,
whatever does not fit stays in the container.

In the village: the chest holds the sword and starting supplies; the well hides a crystal; one barrel
and the crate roll a potion, torch or scroll; the second barrel is empty.

## Dropping and the floor

Dropping puts items in a pile on the tile you stand on, remembered per level. Standing on
a pile, **Use** opens it like any container, unless a container is in reach. A person with
nothing to do does not block it. Entering a tile with a pile says "Something lies on the
floor here." Piles are not drawn in the scene yet.

State (opened containers, piles, the pack) lasts for the page session; saving comes in a
later milestone.

## The background painting

`engine/assets/ui/inventory-bg.png` (1280×720, 16:9) is the satchel's background. It was
painted by Codex from the prompt below, with `experiments/game-1/assets/ui/panel.png` as the style
reference, and it contains only frames: no slots, text or figure. The software draws the
slots, text and buttons on top, and the layout in `engine/ui/mobile-hud.css` (`.rpg-bag-panel`)
follows the painting's frames as percentages. If you repaint it, measure where the new frames
are and update those column and row percentages.

```
codex exec -C <work dir> -s workspace-write --skip-git-repo-check -i style-panel.png - < prompt.txt
```

(`style-panel.png` is `experiments/game-1/assets/ui/panel.png`; the prompt starts with `$imagegen` to
make Codex use its image tool, and the result lands in the work dir.) The prompt, in short:

> Inventory-screen background, same style as the attached UI panel: dark purple-brown
> stone, studded stone outer frame, thin bronze rims, flat and front-on, crisp pixel edges.
> Canvas 1536×1024, all of the interface in the 16:9 band y 80 to 944. A slim title bar
> across the top; a TALL NARROW recessed alcove at the left (x 3–24%, y 14–97%) for a full-length
> figure; on the right a large empty slab (x 26–97%, y 14–62%), a description bar (y 65–86%)
> and a slim bar along the bottom (y 89–97%). Empty everywhere: no grid, slots, text,
> icons, figures or numbers.

Then `node tools/crop-bag-bg.mjs painted.png` crops the band, scales it to 1280×720 and writes
the asset. The grid frame and the description frame on its right were then made by recomposing the painting
(the original two frames, grid and description, merged and split side by side). The measured frames of the current painting (percent of the panel):

| | x | y |
|---|---|---|
| title bar | 2.8–97.2 | 3.2–11.2 |
| hero niche | 2.8–24.6 | 14.1–95.5 |
| slab (grid, 8 x 6) | 26.4–71.2 | 14.1–84.0 |
| description + actions | 74.1–97.2 | 14.1–84.0 |
| bottom bar (Close) | 26.4–97.2 | 87.0–95.5 |

Codex may need a minute or two; its command exits before the image is saved, so wait for the
file to appear. Nothing but the image is kept from the run.

## Checks

`node --test tests/inventory.test.mjs` covers stacking, overflow, drag moves, take
and take all, loot rolls, behaviour wiring, and that every village container names real
items. `node tools/check-pixels.mjs` includes the satchel's icons and hero. In a browser:
open the chest and take everything, press I, drag a stack, select a potion and use it
(set `__game2d.hero.hp` lower first to see it heal), drop one, use on the floor to pick it
up, and check the chest now reads "Nothing left."

## The portrait

The portrait in the HUD is the head of the full-body sprite, so the two always show the same character. It is only
cropped, never scaled: the frame shows the top of `hero-sprite.png` around column 23 (`engine/ui/head.js`), one art
pixel per UI pixel, so a bigger frame shows more of the shoulders. The painted desktop panel cover-fits its
portrait, so `game.js` gives it a picture exactly the window's size. (`experiments/game-1/assets/ui/portrait-hero.png`, the
original high-resolution portrait, is still used by games one and three.)
