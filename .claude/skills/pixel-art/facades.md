# Building facades, walls, doors, floor and sky

The scene is assembled from pre-painted **slot images** (docs/engine/2d-compositing.md): every wall face, door, floor and
backdrop piece is a slot of the view, and one generation paints a whole **sheet** of slots so they match. The pipeline is
`tools/studio2d.mjs`: `guides` draws a guide per sheet (`art/engine/guides/<sheet>.png`, and `.key.png` saying what each
outline is), the guide is repainted, and `slice <sheet> <painted.png>` cuts it into `engine/assets/walls/` and
`environments/`. Dungeon sheets go through `tools/dungeon-art.mjs`.

## Sizes

The view is `DEFAULT_VIEW` in `engine/render/view.js`: still **640 × 360**, shrunk by half when drawn. Rebaking at the native
**320 × 180** is planned (docs/art/rebake.md lists every slot and its size at both); until then paint for the current view,
and when the rebake happens, regenerate the plan and guides first (`studio2d plan`, `guides`).

## Prompt shape

docs/art/art-prompts-2d.md was written for a ChatGPT conversation (the style preamble once, then a sheet per message).
`codex exec` has no conversation, so **put the style preamble at the top of every sheet's prompt**, then the sheet's own
prompt from that file (one house design per sheet, "identical on every face in all four panels"). Attach the concept image
`docs/concept-toonish.png` and the sheet's guide (`art/engine/guides/<sheet>.png`, not the `.key.png`). Ask for 1536 × 1024.
Dungeon walls and floor are painted the same way to `art/engine/painted/walls-dungeon-*.png` and `floor-dungeon.png`;
`node tools/dungeon-art.mjs` (no arguments) slices them.

## Pitfalls

- Codex must keep every outline where the guide has it; a panel that drifted is regenerated, not fixed (slicing overwrites
  only that sheet's slots).
- The floor is a picture, not a tiled texture: it is mirrored on alternate steps, so no distinctive features (drains,
  puddles, people) and roughly symmetric (art-prompts-2d.md, "The floor is a picture").
- The backdrop's four panels must join into one panorama, west wrapping to north.
- The local ComfyUI route (SDXL/Flux with ControlNet) exists for guided repaints: docs/art/local-image-generation.md and
  art-prompts-2d.md "Painting locally".

## Lessons learned

- (none recorded with Codex yet: add the first session's here)
