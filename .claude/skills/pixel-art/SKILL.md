---
name: pixel-art
description: Make pixel art for this dungeon-crawler engine with Codex's image tool, so new art matches the game's style and fits its canvas first time. Use whenever an agent paints or repaints art for the engine or a campaign - building facades and walls, NPCs and props, monsters and their animation key poses, item and UI icons, the hero sprite and UI panels, or full-screen pictures (world map, title background, story images). It holds the shared workflow and sends you to a sub-skill per asset type. It improves itself - every art session ends by recording what it learned here.
---

# Pixel art with Codex

The game is drawn on **one canvas, one pixel grid** (docs/engine/ui.md): **320 × 240** on a desktop and **400 × 180** on a phone
held sideways, with the scene always **320 × 180** and every canvas pixel shown at a whole number of screen pixels. Art looks
right when it is real low-resolution pixel art drawn 1:1 (or enlarged by a whole number), not a big painting shrunk with
smoothing.

## 1. Pick the sub-skill

Read the one for your asset type before you write a prompt; it has the sizes, the layout Codex must paint, the prompt
shape, the tool that cuts the result, and its own lessons.

| Asset | Sub-skill | Runtime art |
|---|---|---|
| Building facades, walls, doors, floor, sky | [facades.md](facades.md) | `engine/assets/walls/`, `environments/` |
| NPCs and props (people, stalls, barrels) | [npcs.md](npcs.md) | `engine/assets/npcs/`, `props/` |
| Monsters (four directions, distances, animation key poses) | [monsters.md](monsters.md) | `<assets>/monsters/<id>/` |
| Items and UI icons | [icons.md](icons.md) | the icon atlas |
| Hero sprite and painted UI panels | [ui.md](ui.md) | `engine/assets/ui/` |
| Full-screen pictures: world map, title background, story images, portraits | [pictures.md](pictures.md) | `games/<campaign>/assets/` |

A new kind of asset gets a new sub-skill file here (copy the shape of an existing one) and a row in this table.

## 2. The shared workflow

1. **Work in a scratch directory**, not in the repo (Codex writes there): `W=<scratchpad>/<name>`. Copy the references
   into it. Only the results (step 8) and this skill's lessons (step 9) go into the repo.
2. **Attach a style reference**, always: the closest existing art (the sub-skill names it). Without one Codex drifts to its
   own style. Say "match its pixel-art look exactly; do NOT copy its subject or layout". There is no palette file: **the
   reference is the palette**, plus the colour limit in the prompt.
3. **Write the prompt to a file** (`$W/prompt.txt`) and start it with `$imagegen` so Codex uses its image tool. Ask it to save
   the image under an exact file name in the current directory.
4. **Run Codex** (one image per run; runs can go in parallel):
   ```
   cd $W && timeout 600 codex exec -C $W -s workspace-write --skip-git-repo-check -i ref.png [-i ref2.png] - < prompt.txt > codex.log 2>&1
   ```
   It takes one to three minutes. Its reply (end of `codex.log`) says what it changed; read it. The command can return
   before the file is written: check the file exists, wait if not.
5. **Look at the result** (Read the PNG). Check the layout, the magenta, the subject, the edges. Regenerate rather than fix
   by hand; change the prompt, not the tool, when something is systematically wrong.
6. **Cut it with the tool** the sub-skill names. They key out magenta and sample blocks back to the real pixel grid.
7. **Check it.** In the files: the tool's warnings (icon-sheets prints missing or broken icons), no magenta fringe left
   after keying, the size and colour count you asked for. Then **in the game**, on both layouts: a Playwright screenshot of
   the canvas (desktop 1100×800 as the browser tests use, phone 844×390 with `isMobile: true, hasTouch: true`), driven the
   way `tests/browser/*.browser.mjs` do (`__game2d` exposes the state; `?level=<id>` opens a level). Those tests need the
   repo served: a static server and `TEST_URL`, or `page.route` answering from the files. Playwright is not a repo
   dependency: install it in a scratch directory and point `NODE_PATH` at it. Run the browser test that covers the art
   (`monster-art.browser.mjs` for creatures). `tools/check-pixels.mjs` checks the canvas is shown at whole-pixel scales on
   many screens; it says nothing about the art itself. Fix what you see.
8. **Keep the sources** (from 2026-11-25 on; older icon and monster sheets were not kept): the painting and the prompt go
   to `art/<engine|campaign>/painted/<name>.png` and `<name>.prompt.txt`; the runtime art goes under `engine/assets/` or `games/<campaign>/assets/` (docs/engine/content.md:
   the engine's art for the engine's content, a campaign's for its own). Note how it was made in the doc that describes it.
9. **Record the lessons** (section 4). Not optional.

## 3. What every prompt says

- **Canvas 1536 × 1024** (Codex's landscape size), unless the sub-skill says otherwise. Say exactly which part holds the art, and paint everything else **flat
  solid magenta (#FF00FF)**: "no gradient, no texture, no vignette, no ground shadow, no glow, because it will be removed
  with a colour key. Never use magenta or hot pink inside the subject."
- **True pixel art at a stated resolution**: "N × M art pixels, each enlarged to a hard square block about K screen pixels wide.
  No smooth gradients, no anti-aliasing, no blur, no painterly texture, flat colour per block, at most 32-40 colours."
  The sub-skill gives K (1536 / N for a full-width picture, 12 for icons and the hero sprite): Codex follows it closely
  and the tools sample the blocks back.
- **The look**: early-1990s CRPG / "hi-bit" pixel art, chunky visible pixels, crisp dark outlines, rich but limited palette,
  soft light from the top left; the world is mature heroic medieval fantasy, warm wood, plaster and stone with deep
  purple-blue night accents (see docs/art/art-prompts-2d.md, the style preamble).
- **No text, letters, numbers, logos, labels, borders, frames or UI**, ever.
- **What the game covers**: name the parts that are cropped or covered (a title bar, a text band, the sides cut on one
  layout) and ask for nothing important there.

## 4. Lessons learned (all asset types)

Each sub-skill has its own section; a lesson that holds for every asset type is promoted here. **At the end of every art
session**, append to the sub-skill you used: what you asked, what came back, what you changed, and what you would do first
next time. Dated, one bullet each, specific (the prompt line that fixed it, the tool flag, the size). Then, if it is true
of every kind of asset, add it here too and shorten the sub-skill's copy to a pointer. Remove a lesson when it stops being
true. This file is meant to get better every time it is used.

- 2026-11-25 · Codex follows an exact pixel grid well when the prompt gives the art resolution *and* the block size, and
  frames the art with flat magenta: the world map (320 × 180), the title background and a story image (400 × 240) each came
  right first time, and `tools/pixelate.mjs` sampled them back to the exact grid.
- 2026-11-25 · Attach a finished in-game asset of the same kind as the style reference (a screenshot of the game, the
  previous picture). A concept painting as the only reference gives softer, more painterly results.
- 2026-11-25 · Describe the composition around what the game covers ("the bottom 30% will be covered by text: keep it dark
  and calm"): Codex reports how it honoured it, and it did.
- Older (from docs/art and docs/engine/icons.md): painted art shrunk smoothly to a few pixels looks mushy next to crisp
  pixel art; paint at the native size as enlarged blocks instead. Purple subjects need a key that only removes colours very
  close to pure magenta.
