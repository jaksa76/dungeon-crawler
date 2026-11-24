# The engine and the campaign

The project works like a tabletop RPG. The **engine** (`engine/`) is the rule books and the creature book: game
mechanics, UI, the common items, NPCs, monsters, props, buildings and environments, with their art. A **campaign**
(`games/<name>/`) is the setting and the adventure: its maps, levels and story, and anything of its own that the books
do not have. Ravensmoor (`games/ravensmoor/`) is the first campaign.

## What goes where

| In the engine | In a campaign |
| --- | --- |
| Rules: combat, stats from D&D stat blocks, equipment, inventory, loot, behaviours, monster AI, persistence | The title, the save key, the start level, the starting kit, where death sends the hero |
| UI: the HUD, the painted panel, menus, character creation, the defeat screen, icons, font | Levels: maps, legends, placements, exits, journal text |
| Content books (`engine/content/`): items, bestiary, NPCs, props, buildings, environments | Its own creatures, NPCs, items or buildings, and changes to the engine's (`content/`) |
| Their art (`engine/assets/`) | Art for its own content only (`assets/`) |
| Source art for the engine's content (`art/engine/`) | Source art for its own content (`art/ravensmoor/`) |

The test: if a second campaign would want it unchanged, it belongs in the engine. A name, a map, a line of story
belongs in the campaign. The engine never names a campaign's level or place: the defeat screen says
"You will awaken in the village" because Ravensmoor's `respawn.place` is "the village".

Imports go one way: the engine never imports from `games/`, `experiments/` or `tools/`, and a campaign imports the
engine only through `engine/index.js`. `tests/engine/boundaries.test.mjs` checks both.

## A campaign

```js
// games/ravensmoor/campaign.js
export const campaign = {
  title: 'Ravensmoor', saveKey: 'ravensmoor',
  content,                                  // the campaign's content book (below)
  levels: { village, dungeon: undercrypt }, // level id -> level
  start: 'village',
  respawn: { level: 'village', place: 'the village', message: 'You awaken safely in the village.' },
  startingItems: [{ item: 'health-potion' }, { item: 'mana-potion' }],
  unarmed: { name: 'fists', damage: [1, 3], speed: 600, damageType: 'blunt' }, // bare hands (optional)
  progression: { pointsPerLevel: 2, maxLevel: 10 },  // levels and skill points (optional: progression.md)
  loot: { dropChance: 0.6 },                         // the loot budget rules (optional: progression.md)
};
```

The page passes it to the engine together with its canvases: `startGame({ ...campaign, viewCanvas, uiCanvas, frame,
status })`. The level format is described at the top of `engine/core/levels.js`: a level names its environment, maps
its map characters to buildings, and places props, NPCs and creatures by id.

Behaviour is code on the same objects: an item's `use`, an NPC's `interact`, a creature's `onDeath`, a level's
`onEnter`, with `this.state` for what must be saved. See [behaviour.md](behaviour.md).

## Content books

A book is made with `defineContent(baseUrl, { items, monsters, npcs, props, buildings, environments, icons, damageTypes, materials })`,
where `baseUrl` is the folder that holds its art (doors have none of their own: they show a building):

```
<baseUrl>/monsters/<id>/       front|back|left|right-d0..d3.png, animation-d0..d3.png
<baseUrl>/npcs/<id>/           one image per prop slot of the view
<baseUrl>/props/<id>/          one image per prop slot of the view
<baseUrl>/walls/<id>/          one image per wall slot (a building)
<baseUrl>/environments/<id>/   floor.png, and backdrop-<N|E|S|W>.png for an open sky
<baseUrl>/icons/<image>         icon spritesheets
```

The engine merges its own book with the campaign's (`mergeContent`). A new id adds something: Ravensmoor's snake
(`games/ravensmoor/content/monsters.js`) is a creature the engine does not have, with its art in
`games/ravensmoor/assets/monsters/snake/`. An id the engine already has changes it, field by field, as house rules:
Ravensmoor's torch gets a different description but keeps the engine's icon and stack size. An override keeps the
engine's art unless it names an `art` of its own; the pixel slice (`experiments/pixel-slice/`) uses this to swap in its
own low-resolution art for every building, prop and NPC of the Old Quarter.

### Custom items and their icons

A campaign's items use the same format as the engine's (`engine/content/items.js`). Their `icon` names a picture
from the engine's atlas of 144 icons or from one of the campaign's own icon spritesheets:

```js
// games/ravensmoor/content/icons.js
export const icons = {
  ravensmoor: { image: 'ravensmoor.png', tile: 16, icons: ['raven-amulet'] },
};
// games/ravensmoor/content/items.js
'raven-amulet': { name: 'Raven amulet', type: 'armour', slot: 'amulet', bonus: { defence: 1 }, icon: 'raven-amulet',
  description: '…' },
```

A sheet is a PNG in the book's `icons/` folder: a grid of square tiles `tile` pixels across, read left to right and
top to bottom in the order of `icons`, on a transparent background. Tiles of 32 pixels or less are pixel art and are
drawn crisp at whole multiples of their size, like the engine's 16-pixel icons. A sheet may add
`detailed: { image, tile }`, a painted version in the same order for the player's "detailed" icon style; without it
the pixel sheet is used in both styles. An icon with the same id as one in the engine's atlas replaces it.

The icons are painted by Codex the same way as the engine's (see [icons.md](icons.md#making-or-changing-icons)), with
`--campaign <name>` on every `tools/icon-sheets.mjs` command: the list is `art/<name>/icons/sheets.json`, the cut
icons go to `art/<name>/icons/png/`, and `pack` writes the campaign's sheet, `games/<name>/assets/icons/<name>.png`,
16-pixel tiles in the order of `sheets.json` (which the content book's `icons` list repeats). Attach the engine's
`engine/assets/icons/atlas.png` to the Codex run as the style reference, so the campaign's icons match the engine's.

Weapons and armour come in families made of materials (`iron-mace`, `steel-mail`), and damage types and resistances
are the campaign's: see [equipment.md](equipment.md).

Creatures are D&D 5e stat blocks (`cr`, `hp`, `ac`, `dmg`) from which `engine/rules/stats.js` derives the game
stats, so a campaign writes a new monster the way a dungeon master would.

## Art tools

The tools under `tools/` work on both books at once (`tools/content.mjs`): `monster-art.mjs`,
`monster-animation-art.mjs`, `dungeon-art.mjs` and `studio2d.mjs` write each piece of art to the folder of the book
that owns it. The studio paints what the Ravensmoor Old Quarter shows, into the engine's folders.

## Not yet

- The tools know one campaign, Ravensmoor.
