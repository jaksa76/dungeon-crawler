# Roaming dungeon creature

The Undercrypt has one creature, currently drawn as an outlined red rectangle.
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
  w: .4, h: .9, sight: 4, art: null }],
```

`x`/`z` are grid coordinates, and `dir` is north/east/south/west = 0/1/2/3.
`w` and `h` are world sizes in tiles. The creature starts at the cell centre,
unlike the village's static props, which stand against tile edges. Wall and
player-entrance spawns are rejected. `engine2d/monsters.js` owns simulation;
the compositor owns how creatures look.

## Replacing the rectangle with concept-art sprites

No monster artwork has been generated yet. The rendering contract is ready
for four directions at four distances. Set `art` to an asset-folder name,
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

The renderer handles wall occlusion, distance scaling and the dungeon's
darkness. Swipe previews render the creature without moving simulation or
causing defeat; only a committed step changes the player's position.

## Checks

Run `node tools/tests/monsters.test.mjs` and
`node tools/tests/dungeon.test.mjs`. Browser checks should cover idle roaming,
wall occlusion, distance darkness, stepping into a monster, the monster
reaching a stationary player, cancelled versus committed swipes, both village
respawn routes, and pausing in menus. Repeat at mobile portrait, mobile
landscape and desktop sizes.
