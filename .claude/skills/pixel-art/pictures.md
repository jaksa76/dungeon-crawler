# Full-screen pictures: world map, title background, story images, portraits

One picture, drawn crisp at a whole-number scale. Reduce it with **`tools/pixelate.mjs <painting> <out.png> <w> <h>`**: it
finds the non-magenta band, then gives each output pixel the most common colour of the middle of its block (no smoothing,
the painting's own palette).

## Sizes

| Picture | Art size | Band on the 1536 × 1024 canvas | Drawn | Notes |
|---|---|---|---|---|
| World map (`worldMap.image`) | 320 × 180 | full width, y 80-944 (16:9) | 1:1 over the whole map panel | the title bar (y 5-18) covers the top 20 rows and the panel rim the outer 5 px: keep them calm; markers are percentages of the picture |
| Title background (`menu.background`) | 400 × 240 | full width, y 51-972 (5:3) | scale 1, cover-fitted, lightly darkened | desktop crops 40 px each side, phone 30 px top and bottom; the title and three buttons sit in the middle |
| Story image (`game.showStory`, an ending's `image`) | 400 × 240 | as above | scale 1, cover-fitted | text on a dark band over the lower ~45% on a phone, ~35% on a desktop |
| Shop interior (a merchant's `image`) | 120 × 150 | portrait 1024 × 1536 canvas, x 32-992, y 168-1368 (8 px blocks) | 1:1 on the left of the shop screen | the keeper's head and shoulders in the upper half, the counter across the lower quarter |
| Portrait (an NPC's `portrait`, dialogue) | 64 × 64 | four per sheet: columns of 384, each 320 × 320 (5 px blocks) at y 352-672 | 1:1, top left of the dialogue | head and shoulders on a dark plain background; crop each column (`tools/crop.mjs`), then `pixelate.mjs ... 64 64` |

## Prompt shape

```
$imagegen Paint <what> for a dark-fantasy dungeon crawler called <campaign>, as true PIXEL ART, and save it as <file>.png in this directory.

Attached: <ref>.png (<what it is>). Match its pixel-art look and palette exactly: crisp chunky pixels, limited palette, dark outlines.

Requirements:
- Canvas 1536x1024. The picture fills ONLY the <ratio> band from y=<a> to y=<b> (full width); paint the strips above and below flat solid magenta (#ff00ff).
- Low-resolution pixel art: <w>x<h> art pixels, each enlarged to a hard square block about <1536/w> screen pixels wide. No smooth gradients, no anti-aliasing, no blur, flat colour per block, at most 40 colours.
- Scene: <the subject, the light, the mood>.
- <What the game covers and must stay calm>. <What is cropped on some screens: nothing important there>.
- NO text, letters, logo, UI, borders or frames.
```

References that worked: the world map was painted from the old painted map (geography) plus a game screenshot (style); the
title background from the game screenshot and the pixel world map; the story image from the title background.

## Pitfalls

- The world map's places must sit where the campaign's markers are: give their positions as percentages of the band and
  move the markers to the painted places afterwards (check in a screenshot).
- On a phone the story text band is tall: keep the subject in the upper half, not just the upper 70%.

## Lessons learned

- 2026-11-25 · World map (TODO-21), title background (TODO-22), "The Quiet Bell" story image (TODO-28): all first-time
  successes with the prompt shape above (the general lessons are in SKILL.md).
- 2026-11-25 · Shop interiors (TODO-32), smithy and alchemist, painted in parallel (two `codex exec` at once): both right
  first time on a portrait canvas with the picture rectangle given in screen pixels (x 32-992, y 168-1368).
- 2026-11-25 · Portraits (TODO-33): four on one sheet, with each NPC's in-game sprite attached as a reference for its
  clothes (the hooded stranger's is seen from behind: describing the face under the hood was enough). Right first time.
- 2026-11-25 · `pixelate.mjs` reproduces the committed image exactly from the kept painting, so keep the painting
  (`art/<campaign>/painted/`) rather than the reduced image's history.
