# Roaming dungeon creature

The Undercrypt has one green snake with lime markings, red eyes and large
ivory teeth, based on the supplied concept drawing. It has a transparent
spritesheet with front, back, left and right views at four distances.
It moves in real time independently of the player's steps. Sharing a floor
tile with it is fatal, whether the player steps into it or it reaches the
player. There is no combat or attack button in this pass.

## Behaviour and defeat

- The creature wanders through walkable cells, preferring to keep moving and
  reversing at dead ends. It cannot cross walls or the village doorway.
- It notices a player up to four tiles away along an unobstructed straight
  corridor and pursues them. After losing sight, it follows the last sighting;
  it does not track an unseen player through walls.
- The default interval is 1.1 seconds per monster step. A 3.5-second grace
  period on dungeon entry gives the player time to orient themselves.
- The creature pauses while a menu is open, during level loading, and while
  the tab is hidden. Resuming does not advance a backlog of missed steps.
- Contact opens **GAME OVER** and blocks movement and gestures. After three
  seconds, or when **Return to village** is pressed, the player respawns at
  the original village starting position with full health and mana. The
  defeat screen stays up until the village has loaded.
- Held movement buttons and keyboard repeats are cancelled on defeat, so an
  old input does not move the newly respawned player. Release a held key to
  start using it again.
- Monsters reset on re-entry and after defeat. Map discoveries remain for
  the current page session, as before.

Configure spawn, dimensions and perception in `game-2/dungeon.js`:

```js
monsterStepMs: 1100,
monsterGraceMs: 3500,
monsters: [{ id: 'prowler', x: 7, z: 3, dir: 3,
  w: .4, h: .9, sight: 4, art: 'snake', distanceShaded: true }],
```

`x`/`z` are grid coordinates, and `dir` is north/east/south/west = 0/1/2/3.
`w` and `h` are world sizes in tiles. The creature starts at the cell centre,
unlike the village's static props, which stand against tile edges. Wall and
player-entrance spawns are rejected. `engine2d/monsters.js` owns simulation;
the compositor owns how creatures look.

## Replacing the rectangle with concept-art sprites

The snake's source drawing is `game-2/art/ref/snake-concept.jpg`, and the
generated atlas is `game-2/art/painted/monsters-snake.png`. Columns are front,
back, left and right; rows run from contact (d0) to darkness (d3). The export
manifest is `game-2/art/snake-atlas.json`. Regenerate the layout guide with
`node tools/snake-art.mjs guide` and export the sixteen runtime PNGs with
`node tools/snake-art.mjs slice` (Playwright and Chromium required).

The export finds the complete silhouettes, preserving heads and tails even
if generation shifts rows. It scales each onto a transparent card with a
consistent baseline and aspect ratio. Distant cards have fewer pixels and
less detail, with mostly the eyes and teeth emerging from a dark silhouette.

The rendering contract supports four directions at four distances. Set
`art` to an asset-folder name,
for example `'prowler'`, and supply:

```text
game-2/dungeon/assets/monsters/prowler/front-d0.png
game-2/dungeon/assets/monsters/prowler/front-d1.png
game-2/dungeon/assets/monsters/prowler/front-d2.png
game-2/dungeon/assets/monsters/prowler/front-d3.png
```

Repeat for `back`, `left` and `right`: sixteen images in total. Directions
are relative to the viewer; `front` faces the player, `back` faces away,
and left/right face the corresponding side of the screen. Depth 0 is the
player's cell, and depths 1–3 are cells ahead. Depth 0 is very close and
usually appears only as contact triggers defeat.

`view.actorSlot(l, d, w, h)` supplies the perspective and framing for future
sprite guides. Keep the same feet baseline, physical proportions and pixel
scale across frames; use transparency around the creature. Lateral positions
reuse the relevant direction/depth frame. Missing frames fall back to the
rectangle, so artwork can be added incrementally.

The renderer handles wall occlusion and distance scaling. `distanceShaded`
means darkness is already painted into the direction/depth frames: it avoids
applying wall fog a second time and preserves distant eye and tooth pixels.
Other creatures can omit the flag to use runtime fog. Missing frames still
use the fogged rectangle. Swipe previews render the creature without moving simulation or
causing defeat; only a committed step changes the player's position.

## Checks

Run `node tools/tests/monsters.test.mjs` and
`node tools/tests/dungeon.test.mjs`. Browser checks should cover idle roaming,
wall occlusion, distance darkness, stepping into a monster, the monster
reaching a stationary player, cancelled versus committed swipes, both village
respawn routes, and pausing in menus. Repeat at mobile portrait, mobile
landscape and desktop sizes.
