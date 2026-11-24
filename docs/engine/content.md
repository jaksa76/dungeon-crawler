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
};
```

The page passes it to the engine together with its canvases: `startGame({ ...campaign, viewCanvas, uiCanvas, frame,
status })`. The level format is described at the top of `engine/core/levels.js`: a level names its environment, maps
its map characters to buildings, and places props, NPCs and creatures by id.

## Content books

A book is made with `defineContent(baseUrl, { items, monsters, npcs, props, buildings, environments })`, where
`baseUrl` is the folder that holds its art:

```
<baseUrl>/monsters/<id>/       front|back|left|right-d0..d3.png, animation-d0..d3.png
<baseUrl>/npcs/<id>/           one image per prop slot of the view
<baseUrl>/props/<id>/          one image per prop slot of the view
<baseUrl>/walls/<id>/          one image per wall slot (a building)
<baseUrl>/environments/<id>/   floor.png, and backdrop-<N|E|S|W>.png for an open sky
```

The engine merges its own book with the campaign's (`mergeContent`). A new id adds something: Ravensmoor's snake
(`games/ravensmoor/content/monsters.js`) is a creature the engine does not have, with its art in
`games/ravensmoor/assets/monsters/snake/`. An id the engine already has changes it, field by field, as house rules:
Ravensmoor's torch gets a different description but keeps the engine's icon and stack size. An override keeps the
engine's art unless it names an `art` of its own; the pixel slice (`experiments/pixel-slice/`) uses this to swap in its
own low-resolution art for every building, prop and NPC of the Old Quarter.

Creatures are D&D 5e stat blocks (`cr`, `hp`, `ac`, `dmg`) from which `engine/rules/stats.js` derives the game
stats, so a campaign writes a new monster the way a dungeon master would.

## Art tools

The tools under `tools/` work on both books at once (`tools/content.mjs`): `monster-art.mjs`,
`monster-animation-art.mjs`, `dungeon-art.mjs` and `studio2d.mjs` write each piece of art to the folder of the book
that owns it. The studio paints what the Ravensmoor Old Quarter shows, into the engine's folders.

## Not yet

- The icon atlas is the engine's only: a campaign item must use one of its 144 icons.
- The tools know one campaign, Ravensmoor.
