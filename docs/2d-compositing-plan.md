# 2D compositing — experiment 2 (`game-2/`)

The 3D renderer (experiment 1, `game-1/`) is paused. Its problems were structural:
the floor reads as mediocre 3D, per-surface shading makes it look less painted,
distant objects lose detail, and the open square puts everything far away.
Facades and characters looked good up close.

Experiment 2 draws every view by **compositing pre-painted images**, like Eye of
the Beholder, on a **small map where you never see far**.

## How a view is drawn

The player stands in a cell facing N, E, S or W, so every possible view is a
one-point perspective of the same grid. Each thing that can appear on screen
(a wall face or an object in a cell) can only appear in a fixed set of screen
positions, called **slots**. Each slot has its own painted image:

- `front-d<d>-l<l>`: the face of a wall `d` cells ahead and `l` cells to the side,
  facing the player.
- `side-d<d>-l<l>`: the face of that wall turned towards the centre line, seen at
  an angle.
- `prop-d<d>-l<l>`: an object or NPC standing in that cell.

Left-side slots are the right-side images mirrored, so only `l >= 0` is stored.

The compositor (`engine2d/`) draws the following, far to near:

1. the backdrop for the facing direction
2. the floor, mirrored on alternate steps so walking reads as movement
3. side faces, then props, then fronts, for each row from depth 3 down to 0

Movement is instant with a short crossfade.

```
 depth 3   F F F F F       S = side faces, seen at an angle
 depth 2    S F F F S      F = front faces, seen straight on
 depth 1     S F F S       @ = player (camera 0.4 tiles behind the cell centre)
 depth 0       S@S
```

Geometry lives in `engine2d/view.js` (`DEFAULT_VIEW`): 640×360 view, 50° vertical
field of view, eye at 0.55 tiles, drawn depth 3. With these settings each wall type
needs **16 images** and each prop **7–9**. A prop slot that is partly off screen
reuses the image of the nearest slot in the same row, because props at the same
depth are the same size.

### Map rules

- Lines of sight stay short: no straight open run is longer than four cells, so
  walls close nearly every view within the drawn depth. Anything beyond depth 3
  shows the backdrop.
- Wall types are cheap to add (16 images each), so variety comes from many
  types, not from rules.
- `game-2/quarter.js` is a 9×9 quarter: a 3×3 square with four lanes leaving it
  in a pinwheel, cul-de-sacs with shops, and 31 walkable cells.

## Making the art

Painting about 100 wall images and 75 prop images one by one would be slow and
inconsistent. Instead, slots are painted **together**: one image generation paints
a sheet of four panels, and the panels are cut back into slots.

```
node tools/studio2d.mjs bake       placeholder slots from experiment 1's art (what you see now)
node tools/studio2d.mjs guides     game-2/art/guides/<sheet>.png + <sheet>.key.png + plan.json
   ... paint each guide with the image model (docs/art-prompts-2d.md) ...
node tools/studio2d.mjs slice <sheet> <painted.png>   cut into game-2/assets/
```

- **Guide sheets** (`game-2/art/guides/`) are 1536×1024 with four 16:9 panels. Each
  panel is a real view of a few cells, rendered with the placeholders on a flat
  magenta background. Paint over the guide (image-to-image), keeping every
  outline in place, then slice it.
- **Keys** (`*.key.png`) show each slot's outline and label: `F21` is front, depth 2,
  lateral 1; `S11<` is side, depth 1, lateral 1, on the left.
- **One wall type per sheet.** All 16 views of a house are painted together,
  so the house stays consistent across distances and angles.
- **Prop sheets** hold scenes for several props in order (`props-1` … `props-6`).
- **Packing is automatic** (`tools/studio2d/plan.js`). A slot can be cut from a
  panel only if its card overlaps nothing else in that panel, so cut-outs are
  complete and clean. Scenes are packed greedily until every slot is covered.
- **The floor and backdrop are painted whole**: `floor.png` (one panel) and
  `backdrop.png` (N, E, S and W panels that should join into a panorama).
- **Slicing** keys out the magenta background, masks each slot to its card,
  flips left-side slots, and resizes to the slot's exact size. It accepts the
  painting at any resolution and assumes the sheet layout is kept.

**Total: 14 generations.** That is 6 wall sheets, 6 prop sheets, the floor and
the backdrop.

## Expected issues

- **Precision.** The model may move or resize things. Slicing tolerates small
  drift, but large moves will cut through the art. If this happens often, use a
  model with real conditioning (depth or edges) or inpainting, which
  `docs/visual-direction-plan.md` already discusses.
- **Magenta spill.** The keyer removes background within a tolerance and
  despills the fringe (`slice(..., { tolerance })`).
- **Consistency across sheets.** Within a sheet, a house stays consistent.
  Between sheets, consistency relies on the shared style preamble and on
  attaching the concept art.
- **Lighting is painted in.** This is the point: it looks painted, with no engine
  shading. A day/night change, or a torch lighting a wall, would need repainted
  variants or overlays.

## Not done yet

- Animated elements (flames, NPC idles) as small overlays on slots.
- Doors, signs and other wall decorations as separate overlay slots, so one house
  type can vary without new sheets.
- Interiors and dungeons. They use the same compositor with different wall types,
  where a ceiling replaces the backdrop.
