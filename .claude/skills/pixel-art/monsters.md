# Monsters

A monster is a **sprite sheet of four views** (front, back, left, right) at four distances, plus a **key-pose sheet** that
the **animation atlases** (idle, move, attack, hurt, dead) are baked from. Both are painted. Tools: `tools/monster-art.mjs`
(`list`, `prompt <id>`, `slice <id> <sheet.png> <heightTiles>`), then `tools/monster-animation-art.mjs` (Playwright, no
arguments) for the atlases of every creature;
`tools/snake-art.mjs` is the snake's own guide-and-slice. Art goes to `engine/assets/monsters/<id>/` (the engine's bestiary)
or `games/<campaign>/assets/monsters/<id>/` (tools/content.mjs decides).

## Sizes and layout

The sheet is 1536 × 1024 on flat magenta, **four equal columns of 384 px**, left to right: front, back, left (facing the left
of the image), right. The same single monster in all four, same size, same pose, feet on one invisible ground line, about 85%
of the column height, clear magenta margins. `slice` scales all four by one factor so the tallest fills the d0 card, stands
them on a common baseline and writes `<direction>-d0..d3.png` (farther cards are d0 shrunk; fog is applied at runtime). It
prints the world width `w` for the monster definition.

## Prompt shape

`node tools/monster-art.mjs prompt <id>` prints it, built from the creature's description: the `$imagegen` line, the
monster, the style ("match exactly the attached finished sheet of another monster: early-1990s CRPG pixel art ... Do NOT
copy its subject or its layout"), the magenta rules and the four-column layout. Attach
`art/ravensmoor/painted/monsters-snake.png` as the style reference.

## Key poses (the animation)

`art/<engine|campaign>/animations/<id>-keyposes.png` (with the creature's art folder, tools/content.mjs): a **portrait
1024 × 1536** RGBA sheet on a **transparent** background, **four columns** (front, back, left, right, as above) and
**six rows**, each pose clearly separated from the next: walking stride A, walking stride B, attack wind-up, attack impact,
hurt recoil, a fully collapsed corpse (the snake has four: rear-up, strike, hurt, corpse; `poseRows` in the tool). The same
creature as its sprite sheet, at the same size, feet on one line per row; the attack fits the creature (a rat pounces, an
ogre smashes its club). Attach the creature's sprite sheet and an existing key-pose sheet
(`art/engine/animations/rat-keyposes.png`) as references. **Every creature must have one, or the bake fails** before writing
anything; `art/engine/animations/keyposes.json` records hashes and crops, and the tests flag a changed source not rebaked.
Then run `node tools/monster-animation-art.mjs` and `tests/browser/monster-art.browser.mjs`. If Codex returns the sheet on
magenta instead of transparency, key it to alpha before baking (no tool does that yet: write one and record it here).

## Pitfalls

- Never magenta or hot pink inside the monster (it is keyed out).
- Left and right are the image's sides, not the monster's: say "facing the LEFT side of the image".
- The back view must show no face.
- The bake reads the rows by the gaps between them: a pose touching the next row fails with "expected N separated poses".
  See docs/engine/monster-animation.md.

## Lessons learned

- (none recorded with Codex yet: add the first session's here; the snake's history is in docs/ravensmoor/snake.md)
