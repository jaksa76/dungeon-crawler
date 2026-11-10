# The Undercrypt (game two)

The first dungeon is a 17×17 branching labyrinth beneath Ravensmoor, with
closed stone corridors, dead ends and a return door. There are no combat,
enemy, loot or quest systems added in this pass.

## Entering and leaving

From the village start, move forward once, step right once, turn right and
move forward into the eastern arched door beside the chest. The doorway loads
the dungeon without rebuilding the HUD or changing the controls.

Inside, turn right from your initial south-facing position to face the entrance
door. Later, return to (1,1), face west, then step forward through the ironbound
door. You arrive facing away from the village door, avoiding an immediate
return trip. Doors activate only on a forward step.

`/game-2/?level=dungeon` opens the dungeon directly. Reloading stays in the
selected level and starts at its entrance. Unrecognized level names fall back
to the village. Map discovery persists between trips during the current page
session, and resets on page reload.

## Level data

`game-2/levels.js` registers each level's map, tile definitions, props and asset
folder. `game-2/dungeon.js` holds the editable ASCII maze. `#` is dungeon stone,
`.` is walkable floor and `E` is the entrance door wall. All corridors are
reachable; the boundary is closed.

An exit belongs to a walkable tile and facing direction:

```js
{ x: 1, z: 1, dir: 3, to: 'village', spawn: { x: 3, z: 2, dir: 3 } }
```

Directions are north/east/south/west = 0/1/2/3. A missing `spawn` uses the
destination's `start`. Additional levels can reuse the registry and exits.
Connected levels must share viewport size and pixel display scale. Assets are
loaded on first entry and cached per level. A failed load leaves the player
in the current level and allows another attempt.

## Darkness and map discovery

The dungeon uses the existing depth-three wall geometry. A level's
`atmosphere` replaces the outdoor backdrop with darkness, darkens wall sprites
in discrete steps by distance, and fades the floor using the camera's ground
projection. Wall detail disappears about three tiles away. Floors and walls
use the same fog distances, and source alpha is retained when shading sprites.
No town sky or outdoor backdrop assets are requested in the dungeon.

`exploration.radius` limits map discovery. Rays stop at walls and closed
corners, so the minimap doesn't expose the whole maze or reveal adjacent
corridors through walls. Each level keeps its own discovered cells. The
location label, journal, map title, page title and URL follow the active level.

## Artwork

Generated with OpenAI image generation, using the committed village guides:

| New sheet in `game-2/art/painted/` | Geometry template |
| --- | --- |
| `walls-dungeon-stone.png` | `art/guides/walls-stone-wall.png` |
| `walls-dungeon-door.png` | `art/guides/walls-house-door.png` |
| `floor-dungeon.png` | `art/guides/floor.png` |

The slate stone and ironbound door sheets retain the template's four-panel
layout, perspective and magenta key. The floor replaces village cobbles with
worn flagstones. Keep this pixel-art style and the template geometry when
repainting. Runtime shading handles darkness rather than baking it into the
source art.

Run `node tools/dungeon-art.mjs` to reproduce the 32 wall sprites and floor
under `game-2/dungeon/assets/`. It uses the existing view and atlas plan,
clips to the original wall masks, and removes the magenta background. The
tool requires Playwright and Chromium (`CHROMIUM_PATH` overrides the executable).

## Checks

Run `node --test tools/tests/dungeon.test.mjs` for maze connectivity, exits,
map occlusion and required artwork. Serve the repository root and test both
doorways in mobile portrait, mobile landscape and desktop. Check re-entry
retains discovery, long corridors fade into darkness, blocked walls remain
solid, and a failed asset load can be retried without losing the village.
The independent pixel-slice page continues to show the village only.
