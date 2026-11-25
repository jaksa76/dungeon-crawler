# NPCs and props

People and objects are **billboards**: always facing the viewer, standing against one side of a cell, one image per prop slot
of the view (`prop-<side>-d<depth>-l<lane>.png` in `engine/assets/npcs/<id>/` or `props/<id>/`; a campaign's own under its
`assets/`). Like facades they are painted as **sheets** from `tools/studio2d.mjs` guides: one sheet shows one NPC or prop at
several distances and positions, and `slice` cuts it.

## Sizes

Today's NPC slots run from 27 × 69 to 206 × 435 (640 × 360 view); at the native 320 × 180 they halve (docs/art/rebake.md).
Faces and hands are the first things lost at ~90 px tall: design NPCs to read by silhouette and colour (a red plume, a white
bonnet, a green hood), not by face.

## Prompt shape

The props-N prompts in docs/art/art-prompts-2d.md ("Panels 1-4: a town guard facing the viewer, standing at attention: steel
helmet with a red plume, ...", then "the same town guard" on the next sheets). Keep the NPC identical at every size; a prop
on the player's own tile is cut off by the panel's bottom edge, keep it cut off exactly as the guide shows.

## Pitfalls

- Front-only billboards look wrong from the side (a stall too wide against a side wall, a well seen from the wrong height):
  docs/art/prop-views-test.md paints front, three-quarter and side views from a crude 3D layout instead.
- A box drawn round an NPC in a guide must be a near-magenta that is not the key colour (keyed by hue), or it is keyed out.

## Lessons learned

- (none recorded with Codex yet: add the first session's here)
