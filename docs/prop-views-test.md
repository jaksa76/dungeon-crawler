# Props from every side: a test with the stall and the well

A prop used to be one front-facing picture (experiment 1's billboard sprite), scaled to
every distance and side. That is wrong in two ways, and the two props below show them:

- **The camera.** The well was drawn from high above, so you look into the basin and see the
  water, while the demo's camera is at eye height (0.55 tiles).
- **The side.** The stall is 1.3 tiles wide, too wide to stand against a side wall, so
  it was not drawn at all when you looked at it from the next tile along. Its side view is
  narrow (about 0.5 tiles) and fits.

So a prop needs a picture for each way it is seen. This page records a test of making those
pictures with the local ComfyUI (see `docs/art-prompts-2d.md` for the setup).

## Which views a prop needs

The engine turns the tile side a prop stands against (N/E/S/W) into an anchor from the way
the player faces (`ANCHOR_BY_TURN` in `engine2d/game.js`). A prop faces the middle of its
tile, so:

| Anchor | The player sees | View |
|---|---|---|
| far, near the centre line | its front | `front` |
| far, off to one side | its front, turned a little | `q` (turned 45 degrees) |
| left / right | its side, front facing the centre line | `side` (mirrored on the right) |
| near | its back | none yet, `front` stands in |

In `game-2/quarter.js` the near anchor never shows the stall or the well (the player would
have to stand in the wall behind them), so `front`, `q` and `side` are enough for now.

## How the views were made

Three methods, on the RTX 4060: Flux takes 80–117 s an image, SDXL about 50 s. The test used 18 generations (17 Flux, 1 SDXL).

| | Method | Result |
|---|---|---|
| a | One Flux text-to-image **turnaround sheet** (front, three-quarter, side side by side), 117 s | Crisp pixel art, but the views are not the same object (the well's roof is missing in two of three) and the angles are not the ones asked for (the stall's "front" was a three-quarter view and no panel was a true side view). Not usable. |
| b1 | **SDXL + ControlNet + IP-Adapter**: line art of a crude 3D layout at the wanted angle, the Flux front view as the style reference, 51 s | Right silhouette and eye-level camera, same palette. Softer than Flux, details of the reference leak in (a lantern, a second bucket) and parts float. |
| b2 | **Flux image-to-image over flat-colour "clay" renders** of the same crude layout (boxes and cylinders in the prop's colours, at eye height and the wanted yaw), keeping the silhouette in the key colour, 80–95 s | **Best.** Exact silhouette and camera, crisp pixel art, one prop reads as one object. |

For b2 the layout is a few boxes and cylinders per prop, rendered at yaw 0, 45 and 90 degrees
with a 7 degree downward tilt. The denoise sets how much the model invents:

- **0.78**: rich, but views drift apart (the well's front gets water and a slab roof; the
  stall's front turned into a flat cartoon).
- **0.66**: very consistent but flat, the layout shows through.
- **0.72** (the well, with joints and roof courses drawn on the layout) and **0.78** (the stall's
  three-quarter and side views) were the good ones.

Cut-outs: the silhouette outside the layout is stamped back as exact magenta, so it keys
cleanly. Two things need cleaning, both done when the sprites are made: the VAE tints the
outer one or two pixels pink (removed and despilled), and the model paints the unused parts of
the layout (the box around an NPC) in a near-magenta that is not the key colour (keyed by hue).

## What the demo does now

- `view.propSlots(w, h, sideW)`: an optional `sideW` is the prop's width seen from the side.
  Left and right slots use it, and a prop only stands against a side wall if `sideW` fits
  (`w` still sizes far and near). `quarter.js`: stall `w 1.295, h 1.05, sideW 0.475`; well
  `w 0.89, h 0.86, sideW 0.6`.
- `SOURCE.props.<art>` in `tools/studio2d/studio.js` is either one billboard sprite or
  `{ front, q, side }`, paths relative to `game-2/`. Each slot shows the view that fits its
  place (`viewFor`), scaled to the slot and standing on its bottom edge, with the right side
  mirrored. The sprites are trimmed to the object and all drawn at one scale.
- `node tools/studio2d.mjs bake props:well props:stall` bakes just those props.
- `game-2/art/sprites/well/` has all three AI views. `game-2/art/sprites/stall/` has the AI
  `q` and `side`, plus the placeholder sprite as `front` (the AI front was weaker and is kept
  as `front-ai.png`).

The stall now shows from both sides, a narrow counter with the awning end and the alchemist in
profile, where it used to vanish. The well has the right eye-level camera and a real side view.

## Not good enough yet

- The well's front roof is a flat tiled slab. That is what a gable roof looks like straight on
  at eye height, but it reads plain. The inside of the well is dark navy, not black.
- The stall's front is the placeholder, which has a lantern, a feathered hat, a barrel and a
  chest; the AI views do not, so the views are the same family but not the same stall.
- `game-2/art/plan.json` and the guides were not regenerated. The stall gained 10 slots and the
  well 1, so run `node tools/studio2d.mjs guides` if the prop sheets are painted later.

## What a full pipeline needs

A crude layout per prop (a few boxes and cylinders, an hour at most for furniture), then 3
generations for the views and a few more to pick seeds: roughly 6–10 generations (10–15 min) per
prop. People (the guard, the villager, the hooded stranger) need a figure layout and are harder.
The layout and clean-up scripts used for this test are in the scratchpad, not in the repo yet.

## Update: the stall from hand-made art

The stall's `q` and `side` views are now the turned views drawn by hand, not the clay test: `art/sprites/stall/q.png`
(front faces right, its left side shows), `side.png` (faces right) and `side-flip.png` (faces left, used for the
right wall instead of a mirror image, since the barrel and the chest swap sides). The sprites are trimmed to the
object with clean alpha, and `front.png` is still the placeholder. `quarter.js`: stall `sideW 0.49`, so the stall
is drawn against the left and right walls (`bake props:stall` after changing the art). A prop at the left of the
centre line shows the mirror image of the right-hand slot (see `canonicalProp`), so the left-of-centre three-quarter
view and a left-wall prop standing straight ahead are mirrors; the hand-made `front-right` picture is not used.
The pixel slice (`px.html`) was not rebaked and shows plain boxes for the stall's side slots.
