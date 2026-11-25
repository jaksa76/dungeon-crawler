# Items and UI icons

All 144 icons are **true 16 × 16 pixel art** (docs/engine/icons.md). Codex paints a **sheet**: 6 columns × 4 rows of 256 px
cells on a 1536 × 1024 flat-magenta canvas, each icon drawn as 16 × 16 art pixels enlarged to hard **12 × 12 blocks**.
`tools/icon-sheets.mjs` does the rest: `prompt <sheet> <refs>` prints the prompt, `slice <sheet> <painted.png>` keys the
magenta, finds each icon (even one that drifted out of its cell) and samples it back to 16 × 16, `pack` rebuilds the atlas.
A campaign's own icons use the same commands with `--campaign <name>` (docs/engine/content.md).

## Steps

1. Add the icons to `art/engine/icons/sheets.json` (or the campaign's): `"id|what to paint"`, 24 per sheet, ids unique.
   The engine's six sheets are full, so new icons need a new sheet, and **it must have `"native": 16`**: without it `prompt`
   asks for a high-resolution painting and `slice` shrinks it smoothly into 64 × 64, the mushy result this pipeline left.
2. `node tools/icon-sheets.mjs prompt <sheet> style-panel.png [weapons sheet]`: attach the weapons sheet (or the engine's
   `atlas.png` for a campaign) so the style matches.
3. Codex, one sheet per run, about two minutes; check the file exists before slicing.
4. `slice`, then `pack`. Read the warnings (a missing icon, an icon in many pieces).

## Pitfalls

- 16 px is small: a crossbow or a bundle of arrows hardly reads. Describe the silhouette, one or two colours, nothing more.
- Metal is repainted per material at runtime (`<icon>@<material>`, docs/engine/equipment.md): paint metal greyish so the
  recolour finds it; wood, leather and gems keep their colours.
- The key removes only colours very close to pure magenta, so violet crystals and elixirs survive.

## Lessons learned

- (from docs/engine/icons.md) The first item icons were painted at high resolution and shrunk: mushy next to the crisp UI
  icons. All were regenerated as native 16 × 16 blocks, which fixed it.
