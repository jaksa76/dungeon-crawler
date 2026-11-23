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
Menus, level transitions, defeat and hidden tabs stop held attacks.

`actor-layout.js` gives creatures sharing a tile a stable ID ordering, two
columns and additional depth ranks. Their physical display widths shrink to
fit the corridor. Both scene rendering and picking use those same positions.

## Playback and assets

`game-2/monster-animation-data.js` supplies per-kind frame counts and timing.
`engine2d/monster-animation.js` owns the transient animation state machine:
idle loops; movement, attack and hurt return to idle; death is terminal.
Hurt interrupts ordinary actions. Movement cannot interrupt attack or hurt.
Attack wind-up is scheduled so the impact frame coincides with combat damage.
Death plays all frames, holds the corpse for `holdMs`, then fades during the
last 200 ms before removal. Pausing freezes playback and corpse deadlines.

Each of the twelve creatures has four transparent runtime atlases:
`game-2/dungeon/assets/monsters/<kind>/animation-d0.png` through `d3`.
Rows: front, back, left, right (relative to the viewer).
Columns: idle 0–1, move 2–5, attack 6–9, hurt 10–11, dead 12–15.
Each cell includes four pixels of padding on every edge, compensated by the
renderer so the base creature's physical proportions remain consistent.
Use at most the allocated frame count when customizing a state's data.
Legacy direction/depth PNGs remain available as a fallback.

The snake has generated combat key poses in
`game-2/art/animations/snake-keyposes.png`: columns are front/back/left/right;
rows are rear-up, strike, hurt and corpse. Its source is the supplied snake
concept and the existing snake art. Other creatures use pixel transforms of
their original sprites for breathing, steps, lunges, hurt and collapse.
Distance frames lose detail and darken, preserving the snake's eyes and fangs.

Regenerate the 48 atlases with `node tools/monster-animation-art.mjs`
(Playwright and Chromium required; `CHROMIUM_PATH` overrides the executable).
The original sprites and generated key-pose source are retained.

## M4 integration

Playback is held in a WeakMap keyed by the live actor. It introduces no fields
that must be saved. `relCell` supplies animation samples and formation offsets
only on render snapshots; these are not actor simulation state. A restored
living actor starts idle. Dead actors should normally be omitted from saves;
if restoring a corpse, initialize a new death clip/deadline rather than saving
an absolute `performance.now()` timestamp. `freeze(now)`/`resume(now)` handle
menus; `updateAnimations(now)` updates the scene version only at frame changes.

## Verification

Run `node --test tools/tests/*.test.mjs` for simulation and animation tests.
Start `python3 -m http.server 8000` at the repository root, then run
`node tools/tests/m5.browser.mjs` for desktop and mobile targeting, held
attacks, corpses, alpha holes, wall occlusion, exact-object behaviours and
gesture regression checks. `TEST_URL` overrides the server URL.
