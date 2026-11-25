# The hero sprite and painted UI panels

The UI is mostly drawn by the canvas kit (frames, buttons, bars: no art needed). Two kinds of picture remain.

## The hero sprite

`engine/assets/ui/hero-sprite.png`: **true 48 × 96 pixel art**, drawn 1:1 in the satchel and the character screen; the HUD
portrait is a crop of its head (`HEAD_X` in `engine/ui/head.js`). Painted by Codex as 48 × 96 art pixels enlarged to hard
**12 × 12 blocks** on flat magenta, on a **portrait 1024 × 1536** canvas (the figure is 1152 px tall, so it does not fit
the landscape one). `hero-sprite.mjs` measures the block from the figure's height, so the figure must run exactly from the
top of the head to the soles: nothing else on the canvas, no shadow. Paint it from the portrait as reference (`experiments/game-1/assets/ui/portrait-hero.png`, attached with `-i`): the same adventurer,
full-length, front-facing, unarmed, plain clothes. Then `node tools/hero-sprite.mjs painted.png [out.png]` samples the
blocks back to a real 48 × 96 PNG with transparency. A taller sprite changes the HUD crop: check the portrait in a
screenshot. See docs/engine/inventory.md.

## Painted panels

Panels behind a screen, painted at 16:9 inside the 1536 × 1024 canvas (the band y 80-944), cut with `tools/crop-bag-bg.mjs`
(the satchel's old background) or `tools/crop.mjs <in> <out> x y w h`. The satchel no longer uses one; the prompt that made
it is in docs/engine/inventory.md. A new painted panel should be native pixel art at the canvas size (320 × 180 for a menu
panel) reduced with `tools/pixelate.mjs`, like the pictures in [pictures.md](pictures.md), not a large painting scaled down.

## Lessons learned

- (none recorded with Codex in this skill yet: the hero sprite's 12-pixel blocks are the same approach that fixed the icons)
