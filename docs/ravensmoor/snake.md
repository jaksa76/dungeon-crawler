# Roaming dungeon creature

The Undercrypt includes a green snake with lime markings, red eyes and large
ivory teeth, based on the supplied concept drawing. It has a transparent
spritesheet with front, back, left and right views at four distances.
It moves in real time independently of the player's steps and fights: it stops beside the player
and bites, and the player swings back (see Combat below).

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
- Running out of health opens **GAME OVER** and blocks movement and gestures. After three
  seconds, or when **Return to village** is pressed, the player respawns at
  the original village starting position with full health and mana. The
  defeat screen stays up until the village has loaded.
- Held movement buttons and keyboard repeats are cancelled on defeat, so an
  old input does not move the newly respawned player. Release a held key to
  start using it again.
- Monsters reset (full health, back at their start) on re-entry and after defeat. Map discoveries remain for
  the current page session, as before.

## Combat

Rules are in `engine/rules/combat.js` (pure numbers), wiring in `engine/core/game.js`.

- **Hero.** Attributes (`heroAttributes`: strength, vitality, intellect, agility; default 6/6/4/5) give
  HP `28 + 5 x vitality`, MP `4 + 5 x intellect`, defence `agility / 2` and accuracy and evasion `agility`. Damage is
  the weapon's range plus `strength − 2`: fists 1–3, so 5–7; the rusty sword 4–6, so 8–10. Armour adds defence and
  resistances. See [equipment.md](../engine/equipment.md). The satchel shows damage and defence when nothing is selected.
- **Hitting.** A blow lands with 75% chance, plus or minus 4 points per point of accuracy over the
  other side's evasion (20% to 95%). The hero's hit rolls in its damage range, a creature's does attack +-20%; the
  defender's resistance to the damage type multiplies it, then defence comes off, at least 1.
- **Player attack.** Click/tap a visible creature; hold to repeat at the weapon cooldown. **Attack**, **X** or **Enter** target the creature ahead. It hits the creature on the tile the player faces
  (or shares), then waits the weapon's `speed` (the rusty sword 700 ms, fists 600 ms). A miss or a swing at nothing costs the same wait. The result
  floats over the scene and goes in the message log.
- **Creature attack.** A creature stops on the tile next to the player and does not enter their tile; the player
  cannot walk into a living creature either. On coming into reach it winds up for 60% of `attackMs`, then strikes
  every `attackMs`. Out of reach it starts over. It can attack from behind: turn to face it.
- **Feedback.** Each creature plays idle, move, attack, hurt and dead clips. Corpses remain briefly after collapsing. Hovering or tapping outlines a target and shows its health; the screen flashes red when the hero is hit. See [animation and targeting](../engine/monster-animation.md).
- **Pausing.** A menu, loading or a hidden tab pause the fight and restart every wind-up. Press **1** or **2**
  (or tap a potion on the quick bar) to drink a health or mana potion without opening the satchel.
- A fight with the snake: unarmed it takes about six hits (its coils soften blunt blows), with the rusty sword four,
  with an iron one three; its bite does about 10, so a
  hero who never heals is beaten in about six bites and a potion is worth drinking.

The snake is Ravensmoor's own creature, not one of the engine's: its stat block is in
`games/ravensmoor/content/monsters.js` and its art in `games/ravensmoor/assets/monsters/snake/`.

```js
snake: { name: 'snake', verb: 'bites', cr: 1 / 4, hp: 11, ac: 14, dmg: 7.5, h: .9, w: .4, distanceShaded: true },
```

The Undercrypt (`games/ravensmoor/levels/undercrypt.js`) places it like any other creature, with its spawn and,
optionally, its own perception:

```js
monsterStepMs: 1100,
monsterGraceMs: 3500,
monsters: [{ monster: 'snake', id: 'prowler', x: 7, z: 3, dir: 3 }, ...],
```

The game stats come from the stat block (see below). A stat block may also set `sight` (default 4), `attackMs`
(1500), `speed` (steps per tick, 1; below 1 is slower) and `tempo` ('quick' or 'heavy' animation).

`x`/`z` are grid coordinates, and `dir` is north/east/south/west = 0/1/2/3.
`w` and `h` are world sizes in tiles. The creature starts at the cell centre,
unlike the village's static props, which stand against tile edges. Wall and
player-entrance spawns are rejected. `engine/rules/monsters.js` owns simulation;
the compositor owns how creatures look.

## Replacing the rectangle with concept-art sprites

The snake's source drawing is `art/ravensmoor/ref/snake-concept.jpg`, and the
generated atlas is `art/ravensmoor/painted/monsters-snake.png`. Columns are front,
back, left and right; rows run from contact (d0) to darkness (d3). The export
manifest is `art/ravensmoor/snake-atlas.json`. Regenerate the layout guide with
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
games/ravensmoor/assets/monsters/snake/front-d0.png
games/ravensmoor/assets/monsters/snake/front-d1.png
games/ravensmoor/assets/monsters/snake/front-d2.png
games/ravensmoor/assets/monsters/snake/front-d3.png
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

Run `node tests/monsters.test.mjs` and
`node tests/dungeon.test.mjs`. Browser checks should cover idle roaming,
wall occlusion, distance darkness, stepping into a monster, the monster
reaching a stationary player, cancelled versus committed swipes, both village
respawn routes, and pausing in menus. Repeat at mobile portrait, mobile
landscape and desktop sizes.

## The bestiary

The engine's creature book, `engine/content/bestiary.js`, holds eleven creatures, each a D&D 5e stat block (CR, hit
points, AC, damage per round), like the snake's; `engine/rules/stats.js` derives the game stats: hp = D&D hp x 2.7, damage = D&D
damage x 1.6, evasion = AC - 9, accuracy = 3 + 2 x sqrt(CR). So danger follows the tabletop: giant rat and kobold
(CR 1/8), goblin, skeleton, zombie (slow) and snake (1/4), orc (1/2), giant spider and ghoul (1), ogre (2),
owlbear (3), troll (5). The Undercrypt places 17, the weak ones near the door and the ogre, owlbear and troll
in the far dead ends. The hero has no levelling yet, so the owlbear and troll are out of reach for now.

Sprites are painted by Codex, one sheet per creature (four views on magenta, in the style of the snake sheet):
`node tools/monster-art.mjs prompt <id> > prompt.txt`, then
`codex exec -C <work dir> -s workspace-write --skip-git-repo-check -i <style.png> - < prompt.txt` with
`art/ravensmoor/painted/monsters-snake.png` as style.png, then
`node tools/monster-art.mjs slice <id> <work dir>/sheet-<id>.png <height in tiles>`, which writes the sixteen PNGs
(far frames are the near one shrunk; runtime fog darkens them) and prints the `w` to use. Roster and looks:
`art/engine/monsters/roster.json`. `node --test tests/bestiary.test.mjs` checks the CR ordering and the frames.

All twelve species now also have authored combat key poses and four runtime
animation atlases each, covering walking, attack, hurt and death in every
direction. See [animation and targeting](../engine/monster-animation.md) for the source
layouts, export command and validation checks.
