# Monster animation and pointing (M5)

Click a visible creature to swing, or hold to repeat at the weapon cooldown.
On touch screens, a tap swings once and a stationary hold starts repeating
after 180 ms. A drag beyond eight CSS pixels remains a movement gesture.
Holding locks the creature ID: it stops when that creature dies, leaves view,
or leaves melee range. A distant click asks the player to step closer without
spending a cooldown. Attack/X/Enter still attack the creature directly ahead.

Click an object to use that particular entity's behaviour. The same reach
rules as Use apply. `scene-targets.js` maintains an opaque ID buffer in scene
draw order, using each sprite's alpha mask. Walls overwrite IDs; transparent
sprite pixels pass through. Highlighting uses only final visible pixels.
Menus, level transitions, save loading, defeat and hidden tabs stop held attacks.

`actor-layout.js` gives creatures sharing a tile a stable ID ordering, two
columns and additional depth ranks. Their physical display widths shrink to
fit the corridor. Both scene rendering and picking use those same positions.

## Playback and assets

Each creature's frame counts and timing follow its `tempo` (`animationTimings` in `engine/rules/stats.js`); a stat block may give its own `animations` instead.
`engine/render/monster-animation.js` owns the transient animation state machine:
idle loops; movement, attack and hurt return to idle; death is terminal.
Hurt interrupts ordinary actions. Movement cannot interrupt attack or hurt.
Attack wind-up is scheduled so the impact frame coincides with combat damage.
Death plays all frames, holds the corpse for `holdMs`, then fades during the
last 200 ms before removal. Pausing freezes playback and corpse deadlines.

Each of the twelve creatures has four transparent runtime atlases:
`engine/assets/monsters/<kind>/animation-d0.png` through `d3`.
Rows: front, back, left, right (relative to the viewer).
Columns: idle 0–1, move 2–5, attack 6–9, hurt 10–11, dead 12–15.
Each cell reserves twice the idle body width for weapon swings, plus four
pixels of padding on every edge. The renderer compensates for this canvas
space so idle bodies keep their physical size and attacks can extend sideways.
Use at most the allocated frame count when customizing a state's data.
Legacy direction/depth PNGs remain available as a fallback.

Every creature has authored extra poses in
`art/engine/animations/<kind>-keyposes.png`, matching its existing idle art.
Columns are front/back/left/right. For rat, kobold, goblin, skeleton, zombie,
orc, spider, ghoul, ogre, owlbear and troll, the six rows are walking stride A,
walking stride B, attack wind-up, attack impact, hurt recoil and a fully
collapsed corpse. Snake keeps its four rows: rear-up, strike, hurt and corpse,
and its travelling body wave for movement. Idle frames retain the base art.

Attacks reflect the creature: rats pounce and bite; kobolds thrust spears;
goblins and skeletons slash swords; orcs swing axes; zombies grab; spiders
lunge with fangs; ghouls and trolls swipe claws; ogres smash clubs; owlbears
rake with their paws. These change limb, weapon and body silhouettes rather
than just scaling or rotating the idle art. Recovery frames return to idle,
and the first death frames bridge recoil to the authored corpse pose.

Regenerate all 48 runtime atlases with `node tools/monster-animation-art.mjs`
(Playwright and Chromium required; `CHROMIUM_PATH` overrides the executable).
Every species must have a source sheet; missing poses fail the build before
any output is written. The exporter quantizes generated alpha mattes to crisp
pixel coverage, detects separated rows, keeps foot baselines aligned and
reduces detail with distance. Snake darkness is baked once; the other
creatures receive the existing runtime dungeon fog.

`art/engine/animations/keyposes.json` records the source hashes, directional
crop rectangles, pose names, alpha cutoffs and runtime cell dimensions. Tests
verify coverage for the entire bestiary and flag source art changed without
rebaking. Original idle art and all generated source sheets are retained.

## M4 integration

Playback is held in a WeakMap keyed by the live actor. It introduces no fields
that must be saved. `relCell` supplies animation samples and formation offsets
only on render snapshots; these are not actor simulation state. M4 recreates
monsters from level definitions when loading a save, so playback restarts idle
and corpses do not carry across saves. Loading cancels held scene attacks,
even if a recreated creature has the same ID. `freeze(now)`/`resume(now)` handle
menus; `updateAnimations(now)` updates the scene version only at frame changes.

## Verification

Run `node --test tests/*.test.mjs` for simulation and animation tests.
Start `python3 -m http.server 8000` at the repository root, then run
`node tests/m5.browser.mjs` for desktop and mobile targeting, held
attacks, corpses, alpha holes, wall occlusion, exact-object behaviours and
gesture regression checks. `TEST_URL` overrides the server URL.
Run `node tests/monster-art.browser.mjs` (no server needed) to check
every runtime pose for empty frames, distinct strides/attacks and collapsed
corpse silhouettes at all four directions and distances.
