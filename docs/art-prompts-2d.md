# Art prompts — 2D compositing demo (`game-2/`)

See `docs/2d-compositing-plan.md` for how the sheets work. You need an image model
that can **edit or repaint an input image** while keeping its layout, such as
ChatGPT image generation with the guide attached.

## Workflow

1. Run `node tools/studio2d.mjs guides`, or use the committed
   `game-2/art/guides/*.png`. The `*.key.png` files show what each outline is.
2. Start a fresh conversation, attach `docs/concept-toonish.png`, and send the
   **style preamble**.
3. For each sheet, attach its guide (`<sheet>.png`, not the key) and send the
   sheet's prompt. Ask for **1536×1024**.
4. Save the result anywhere and cut it into slot images:
   `node tools/studio2d.mjs slice <sheet> <file.png>`. Reload `game-2/` to see it.
5. If a panel drifted, regenerate that sheet. Slicing overwrites only that
   sheet's slots.

Paint the walls first (`walls-house-a` is a good test of the whole process), then
the floor and backdrop, then props.

---

## Painting locally with ComfyUI

Instead of ChatGPT, a guide can be repainted by a local ComfyUI (image-to-image; setup in
`docs/local-image-generation.md`). With ComfyUI running on 127.0.0.1:8188:

```
node tools/studio2d.mjs paint walls-house-a --slice                  Flux (see below for the setup)
node tools/studio2d.mjs paint walls-house-a --model sdxl --slice     SDXL, 5x faster, blurrier
```

This uploads `game-2/art/guides/<sheet>.png`, repaints it, and writes
`game-2/art/painted/<sheet>.png`; `--slice` also cuts it into `game-2/assets/`. The prompt
is a style line (`FLUX_STYLE` in sentences, or the keyword line `STYLE` for SDXL, in
`tools/comfy/paint.mjs`) plus the sheet's text from this file. The guide's flat magenta and
dark bars are stamped back over the result, so keying stays exact whatever the model did.
Other options: `--denoise`, `--seed`, `--steps`, `--out file`, and `--guidance` (Flux) or
`--cfg` and `--lora N|off` (SDXL).

**Flux setup.** `--model flux` is FLUX.1-dev, 4-bit GGUF. It needs the ComfyUI-GGUF custom
node (and the `gguf` package in ComfyUI's Python), `models/unet/flux1-dev-Q4_K_S.gguf`
(6.8 GB), `models/clip/clip_l.safetensors`, `models/clip/t5xxl_fp8_e4m3fn.safetensors` and
`models/vae/ae.safetensors`. SDXL needs only the SDXL base checkpoint. Send one job at a
time: ComfyUI crashed once (an access violation inside ComfyUI-GGUF while it swapped
models between queued jobs) and had to be started again. Starting it with
`--disable-dynamic-vram` is the untested way to avoid that.

What was found on `walls-house-a`, on an RTX 4060 with 8 GB:

- **Time.** SDXL takes about 30 s per sheet. Flux takes about 110 s at 20 steps (the
  default) and 150 s at 28 steps, which looked no better. The model sits partly on the GPU
  and there was no out-of-memory error.
- **Flux depends on the seed.** At 0.62, seeds 2 and 3 gave a clean house with red roofs.
  Seed 3 had dark blue lines along the seams. Seed 1 had a brown roof, blotchy windows and
  small faces in the ivy. Plan on trying two or three seeds per sheet.
- **Denoise is the only control over layout.** SDXL: up to about 0.55 every outline stays in
  its card, at 0.62 the building drifts, below 0.45 nothing changes. Flux: 0.55 to 0.62
  keeps every outline and repaints the surfaces; at 0.70 the outlines hold but plaster
  and windows get orange smears; at 0.80 the layout is lost (new gables and roofs).
- **Flux paints cleaner than SDXL.** The pixel edges stay crisp, a house stays consistent
  across its panels, and the roof stays red (on a good seed). SDXL comes out softer and
  drifts in colour. Either way the result is a restyle of the placeholder, not clearly
  better than it. The Flux floor (0.55) kept the cobble scale but added a manhole-like cap
  that would repeat under every view.
- **Leave the SDXL pixel-art LoRA off.** At 0.9 the structure breaks (doors and chimneys
  appear); at 0.35 it adds random objects.
- **Don't mention magenta in the prompt.** With SDXL the roofs turned magenta-pink. The
  stamping already protects the background.
- Each panel is painted independently, so a design stays consistent across panels only
  as far as the guide already is. Prop sheets that mix two props need a prompt per
  panel, which `paint` does not do yet.

### SDXL with ControlNet and IP-Adapter

Plain image-to-image can only protect the layout by staying close to the guide, which is why
it only restyles it. Two add-ons let SDXL repaint at a much higher denoise and still keep the
layout and the look. `--controlnet STRENGTH` traces the guide's edges (canny, after a
blur) and makes the sampler follow them, and `--ipadapter WEIGHT` takes the style from a
reference picture (`--ref`, default `game-2/art/ref/concept-houses.png`, a crop of the concept
art without its UI bar). Either flag selects SDXL.

```
node tools/studio2d.mjs paint walls-house-a --controlnet 0.9 --ipadapter 0.5 --denoise 0.7 \
     --canny-low 0.1 --canny-high 0.3 --blur 2 --seed 2 --slice
```

Setup, all in ComfyUI: the `ComfyUI_IPAdapter_plus` custom node (no extra Python packages),
`models/controlnet/controlnet-union-sdxl-1.0-promax.safetensors` (2.5 GB, xinsir, used through
the core ControlNet nodes), `models/ipadapter/ip-adapter-plus_sdxl_vit-h.safetensors` (0.85 GB)
and `models/clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors` (2.5 GB). All are
ungated downloads. With them on, a sheet takes 45 to 57 s and SDXL stays within the 8 GB card,
with the VAE run tiled.

What was found on `walls-house-a`:

- **The layout holds at high denoise.** Outlines stayed in their cards from 0.70 to 0.90, where
  plain SDXL drifts at 0.62. The magenta key stays exact.
- **Canny needs the right thresholds.** With a blur of 2, thresholds of 0.10 and 0.30 trace
  the timber, windows, stone courses and roof edges; at 0.4 and 0.8 only a few window frames
  survive. The silhouette against the key colour needs no edges, because stamping restores it.
- **Denoise 0.70, ControlNet 0.9, IP-Adapter 0.5 gave the best house.** It is crisp, with
  readable windows and purple-grey stone close to the concept art. At 0.80 with IP-Adapter 0.6
  the windows turned into flames, and at 0.90 with 0.8 the plaster lost its warmth. Seeds
  differ: seed 2 had warmer stone and a roof closer to the placeholder's than seed 1.
- **It is still a restyle, not a clear upgrade.** The painted house is cooler and darker than
  the placeholders around it, its roof is a dark red block, and next to unpainted houses it
  looks like a patch. A consistent look needs all six wall sheets painted with the same
  settings and a seed picked for each.

### The floor is a picture, not a texture

The placeholder `floor.png` is a cobblestone texture put into perspective, so repainting it at a
low denoise keeps its mechanical look: even stones, ruler-straight lines. The real floor is
painted as a whole 2D picture instead (the same goes for the backdrop). `paint floor` takes
the placeholder only for where the horizon is: the guide is blurred (`--init-blur`, 31) so none
of its stones survive, and the denoise is 0.95. The result is sliced into `game-2/assets/floor.png`
as usual: everything above the horizon becomes transparent and the backdrop shows through.

```
node tools/studio2d.mjs paint floor --seed 1 --slice                  Flux, about 120 s
node tools/studio2d.mjs paint floor --controlnet 0.6 --ipadapter 0.5 --lora 0.8 --seed 2 --slice
                                                                      SDXL, about 50 s
```

The current floor uses small cobbles (see "Smaller cobbles" below) and takes three steps:

```
node tools/studio2d.mjs paint floor --cobbles 3 --seed 2 --out <raw.png>     Flux, about 120 s
python tools/comfy/grade-floor.py <raw.png> game-2/art/painted/floor.png game-2/art/ref/floor-colour.png
node tools/studio2d.mjs slice floor game-2/art/painted/floor.png
```

The prompt is `FLOOR` in `tools/comfy/paint.mjs` (the `floor` entry below is the ChatGPT
version of it). `--prompt text|@file` replaces it for a try, and `--guide file` replaces the
guide (it must keep the exact magenta above the horizon and the #202020 bars). For SDXL,
`--controlnet` on the floor uses a depth ramp of a flat ground plane (`--control ramp`, made on
the fly by `tools/comfy/ramp.mjs`) to fix the horizon and the way the stones shrink with
distance, and `--ipadapter` uses `game-2/art/ref/concept-ground.png`, a crop of the concept
art's cobbles.

What was found over the first rounds (ten floors):

- **Flux makes the best floor, and the prompt sets the stone size.** The first version asked for
  "large" flagstones: about 4-5 across the foreground, and cold blue-grey, too big and too
  cold next to the buildings. Asking for small, lumpy fieldstone cobbles "about the size of a
  loaf of bread, eight or nine across the bottom edge", in "dusty warm plum-mauve and rose-grey
  with peach highlights", gave about 7-8 across and nine rows of stones in the buildings'
  palette. That is `FLOOR.flux` and the floor of that round (seed 2); it was still too big
  next to the concept art, hence the next section.
- **Some wording brings the grid back.** "A perfectly straight horizon", "lit evenly and flatly,
  the same brightness near and far" and "about ten stones across" made Flux paint neat
  rectangular slabs with straight converging joints, the projected-texture look again. Stay with
  "lumpy, rounded polygons ... never laid in neat rows" and describe the light softly.
- **Flux paints a tree line along the horizon** (it reads "horizon" as a landscape), however the
  prompt or the guide is worded; a guide without the dark horizon band did not stop it. The game
  never shows that strip, because walls close every view within three cells and their bases are
  below it. So the painted sheet has the strip above row 618 set to the key colour, and the
  floor starts at row 224 of the 640x360 view. Re-cut a new sheet the same way before slicing it.
- **SDXL needs the pixel-art LoRA for a floor.** Without it the stones come out as gritty noise
  (the IP-Adapter's composition mode made it worse), or as arcs and a central path, which would
  repeat under every view. With the LoRA at 0.8 it gives flat slabs in perspective, but bluer,
  softer and busier than the Flux floor, and some seeds add a landmark (a rubble patch, a figure).
- **Native pixel-art floors work only with real structure.** SDXL, the pixel-art LoRA at 1.0, on
  a 1280x720 canvas (160x90 at x8) keeps its 8 px grid, but with only the depth ramp as control it
  painted a flat tan ground and a stone bowl, with no cobbles. With the Flux floor's edges as the
  canny ControlNet (strength 0.9, blur 2, thresholds 0.1/0.3, denoise 0.85, IP-Adapter 0.4 with
  a crop of the Flux stones as the reference) it redraws the same stones on the grid, with
  one-art-pixel outlines, in about 32 s. It is murkier and lower in contrast than the Flux floor,
  a contrast-boosted start (denoise 0.88) added pink blotches, and at 4 screen pixels per art
  pixel it clashes with the smooth walls. It only pays off once the engine renders at the low
  internal resolution.
- **Check each floor for landmarks.** The same floor is shown under every view, so a drain, a
  patch or a figure would repeat everywhere. Flux still brightens the middle a little, which is
  harmless because it is symmetric.

#### Smaller cobbles: a generated guide

The concept art's paving has about ten stones across the bottom and twelve to fourteen rows to
the horizon; `FLOOR.flux` gave 5-6 across the bottom of the sheet. Wording alone cannot fix
that: Flux paints the foreground stones large whatever the prompt says ("about twelve across"
came back as five). So `paint floor --cobbles SEED` paints over a **generated guide**
(`tools/comfy/cobbles.mjs`): irregular cobbles, the cells of a jittered lattice on a ground
plane in perspective, with dark aubergine grout and one warm-mauve palette, saved as
`game-2/art/guides/floor-cobbles.png`. The prompt is `FLOOR.fluxCobbles`.

- **The denoise decides everything.** At 0.88 Flux ignored the guide and painted huge stones;
  at 0.76 it merged the near cells into 300 px slabs and invented a central lane; at 0.66 it kept
  the cells but flat and polygonal; **0.70 with no blur** gave rounded, hand-painted cobbles
  (the default). The guide must not be blurred.
- **A guide made of straight courses comes back as flat bricks** (denoise 0.80), and the word
  "glints" produced orange streaks. Cells without rows, and soft highlight wording, avoid both.
- **Flux splits the stones into two tones** (terracotta and lavender) whatever the guide's
  colours, and some seeds go back to flat bricks (seed 4). So the colour is fixed after the
  painting: `tools/comfy/grade-floor.py` pulls the hue of the ground (Lab a/b) toward the
  previous floor (`game-2/art/ref/floor-colour.png`) and halves its spread, leaves lightness
  alone, and sets the rows above 618 to the key colour. It changes colour only; nothing is
  resampled. The painted sheet in `game-2/art/painted/floor.png` is the graded and cut one, so
  slicing it gives `floor.png` exactly.
- **Result:** about 8 stones across the bottom row and 20 rows (it was 5-6 and 9), in the
  buildings' warm rose and grey. The foreground stones are still a little larger than the
  concept's. `--cobble-size 0.78` did not change them (Flux repaints the near field at its own
  size and only the far rows got denser), so a further step needs something else, for example
  a lower denoise with the smaller cells, or painting the foreground in a second pass.

#### A supplied floor: `cobblestones-chatgpt.png`

The user painted a floor outside ComfyUI (`game-1/assets/textures/cobblestones-chatgpt.png`, copied to
`game-2/art/ref/`): 1448x1086, pixel-art cobbles in one-point perspective, vanishing point at the top
centre (about column 724, row 0), purple stones with orange lantern glints, like the concept's ground.
It is a whole picture of the ground, so it only has to be fitted to the view:
`python tools/comfy/fit-floor.py <picture> game-2/assets/floor.png --horizon 70 [--sheet <sheet>]`
scales it by 640/1448 with Lanczos (no pixelization; recolouring only with `--grade`), puts the vanishing point at the given
view row, and makes the rows above 224 transparent, as for the painted floors.

- **Stone size is set by the horizon row, not the zoom.** In a perspective picture the stones at the bottom
  of the view have the size `c * (360 - horizon)`, whatever the uniform scale, so zooming does nothing.
  Horizon 180 (the engine's) gives about 16 stones across the bottom, 110 about 14, **70 about 11 (the
  concept's is about 10)**. The cost of a raised horizon is that the floor's own perspective suggests a
  higher camera than the walls' base lines; it is not visible in the demo because the walls hide that strip.
- Squashing the picture to use all of it (`--sy 0.166`) makes flat, stretched stones: do not.
- The mirrored alternate step flips the glints with no visible artefact.
- `fit-floor.py ... --sheet game-2/art/painted/floor.png` writes the 1536x1024 sheet so that
  `node tools/studio2d.mjs slice floor <sheet>` gives the floor back (to within resampling: a mean colour
  difference of about 3.6-4.4/255, the transparency identical).
- **The demo uses fit A (horizon 180) with the `warm` grade**: `python tools/comfy/fit-floor.py --fit A --grade warm --apply`
  (`--fit` A = 180, B = 110, B2 = 70; `--apply` reads the supplied picture and writes `game-2/assets/floor.png` and the sheet).
  The raw picture is a saturated blue-violet (OKLab hue 329 deg, chroma 0.072, L 0.40) beside warm buildings
  (hue 20 deg, chroma 0.037), so it needs grading. Grades live in `tools/comfy/floorgrade.py` (OKLab, the orange
  glints keep their hue and chroma; the reference statistics are in `game-2/art/ref/floor-grade-stats.json`):
  `warm` rotates the stones' hue by +22.7 deg (329 -> 352, the midpoint of the old placeholder floor and the A5 rose
  floor) and scales chroma by 0.65 (0.072 -> 0.047), lightness unchanged; `dusk` scales stone chroma by 0.85, lifts
  shadows by 0.045 and makes glints 0.03 lighter and 12% more saturated (barely visible against the raw picture);
  `match` transfers mean/std to the wall pixels next to the floor (floor turns bronze-brown, a little muddy, shadows
  slightly crushed); `concept` transfers to the concept art's floor, which the picture already matches (a near no-op).

### Props are painted per view

The prop sheets below paint one front picture per slot. A prop also looks different from its sides, and
the placeholder sprites are drawn from the wrong height (the well) or are too wide to stand against a side wall
(the stall). `docs/prop-views-test.md` tests painting a prop as separate front, three-quarter and
side views instead, from a crude 3D layout with Flux image-to-image, and has it working for the stall and the well.

---

## Style preamble (send first, with the concept image attached)

> I'm painting art for a first-person, grid-based fantasy RPG. Every view in the
> game is assembled from pre-painted pieces, so I'll send you guide images that
> show exactly where each piece goes. The attached image is the target look:
> detailed "hi-bit" pixel art with clearly visible chunky pixels, rich but limited
> palette, warm wood/plaster/stone with deep purple-blue night accents, mature
> heroic medieval fantasy.
>
> Each guide is a 1536×1024 sheet with up to four panels separated by dark grey
> bars. Each panel is a view from a person's eye height in a small medieval town at
> night. Repaint the guide as finished pixel art in the target style, following
> these rules exactly:
>
> - **Keep the layout.** Every building and object stays exactly where it is,
>   at the same size, with the same outline and the same perspective. Don't add,
>   remove, move or merge things. Repaint the details (beams, windows, stones,
>   faces) in the target style.
> - **Keep the magenta.** Every pixel that is flat magenta (#FF00FF) in the guide
>   stays exactly that flat magenta: no sky, no ground, no shadows, no glow, no
>   gradient on it. Keep the dark grey bars too.
> - **Lighting is part of the painting.** Moonlit night with cool purple-blue
>   ambient light; warm golden light from windows, lanterns and forges spills onto
>   nearby surfaces. Things further away are a little darker, bluer and simpler,
>   with chunkier detail, but are still painted, not blurred.
> - Same pixel size and palette in every panel. No text, borders or UI.
>
> Reply "ready" and wait for the first guide.

---

## Wall sheets (one house design per sheet)

All four panels of a sheet show **the same building design** from different
distances and angles: straight on, and turned along the street on either side.
Every face must show the same design.

**`walls-house-a`**
> This sheet is one design of a two-storey half-timbered house: ground floor of
> purple-grey stone with one small glowing leaded window; upper floor of cream
> plaster between dark oak beams with one glowing window; a red clay tile roof.
> Keep it identical on every face in all four panels.

**`walls-house-b`**
> Same style, a different house: diagonal oak braces on the upper floor, a flower
> box with pink flowers under the upper window, ivy climbing one corner, stone
> ground floor with a small window, red tile roof. Identical on every face.

**`walls-house-door`**
> Same style: a house with a heavy arched wooden door with iron studs in a stone
> ground floor, a glowing window above it, half-timbered upper floor, red tile
> roof. Identical on every face.

**`walls-shop-alchemist`**
> Same style: an alchemist's shop. Ground floor: a wide warmly lit shop window full
> of coloured potion bottles and a small wooden door; a hanging sign with a red
> potion flask (no letters) over the door; half-timbered upper floor; red tile roof.
> Identical on every face.

**`walls-shop-smith`**
> Same style: a blacksmith's. Ground floor: wide open wooden doors showing a glowing
> forge and an anvil inside; a hanging sign with crossed hammers (no letters);
> half-timbered upper floor; red tile roof. Identical on every face.

**`walls-stone-wall`**
> A tall old town wall of large weathered grey-purple stone blocks with moss in the
> joints and a few cracks, a little higher than a house's eaves, no roof. Same wall
> on every face.

## Floor and backdrop

**`floor`**
> Paint the ground of an old town square as one hand-painted picture, seen from
> standing eye height in one-point perspective, with the horizon across the middle of
> the panel. Use the guide only to see where the horizon is and how much of the panel
> the ground fills: its cobbles are a projected texture, so do not copy them. Paint
> many small, densely packed, lumpy rounded fieldstone cobbles, each about the size of
> a loaf of bread (eight or nine across the bottom of the panel), shrinking steadily
> towards the horizon, varied in size, shape and tone, never rectangular bricks and
> never a grid. The stones are dusty warm plum-mauve and rose-grey with peach
> highlights and aubergine-brown gaps, matching the warm buildings (no blue or cold
> grey), lit evenly by soft warm lamplight, with a few tufts of olive moss. Keep the
> magenta area above the horizon flat magenta. The same floor is shown under every view
> and is mirrored on alternate steps, so no distinctive features (no drains, puddles,
> objects or people) and roughly symmetric left to right.

**`backdrop`**
> These four panels are the sky and far scenery seen looking north, east, south and
> west (left to right, top to bottom). They must join into one continuous
> panorama: the right edge of each panel continues into the left edge of the next,
> and west wraps round to north. Night sky with stars and violet clouds. North: a
> large full moon and a dark castle with violet windows on a distant hill. East: a
> waterfall and a stone aqueduct among hills. South and west: forested hills and
> distant rooftops. Paint down to the horizon; the town covers everything below
> it.

## Prop sheets

Props are billboards: always facing the viewer. Each stands against one side of its
cell (the side towards the player, away from the player, or beside the path), so a
sheet shows one prop at several distances and positions: the outlined positions
on the panel. `plan.json` and the keys list which panel holds which prop. Keep each
prop identical at every size.

Some positions are bigger than the frame: a prop on the player's own tile, or on the
near side of the next one, is cut off by the bottom edge of the panel. Keep it cut
off exactly as in the guide; only the visible part is used.

**`props-1`**
> Panels 1–4: a town guard facing the viewer, standing at attention: steel helmet with a red plume, chainmail and breastplate, red heater shield with a gold cross, spear upright.

**`props-2`**
> Panels 1–4: the same town guard.

**`props-3`**
> Panels 1–2: the same town guard. Panels 3–4: a village woman facing the viewer: white bonnet, brown dress, cream apron, hands clasped.

**`props-4`**
> Panels 1–4: the same village woman.

**`props-5`**
> Panels 1–2: the same village woman. Panels 3–4: a mysterious traveller seen from behind, walking away, in a long green hooded cloak.

**`props-6`**
> Panels 1–4: the same hooded traveller.

**`props-7`**
> Panels 1–4: the same hooded traveller.

**`props-8`**
> Panels 1–4: a market stall seen from the front: red-and-white striped awning, hanging lantern, counter with a red cloth with a gold cross, potion bottles, and an old bearded merchant in a red cap behind it.

**`props-9`**
> Panels 1–4: the same stall.

**`props-10`**
> Panel 1: the same stall. Panels 2–4: a round stone well with a small wooden roof, rope and bucket.

**`props-11`**
> Panels 1–4: the same well.

**`props-12`**
> Panels 1–3: the same well. Panel 4: a wooden barrel with iron hoops.

**`props-13`**
> Panels 1–4: the same barrel.

**`props-14`**
> Panels 1–4: a wooden crate.

**`props-15`**
> Panel 1: the same crate. Panels 2–4: a closed wooden treasure chest with iron bands.

**`props-16`**
> Panels 1–3: the same chest. Panel 4: a wooden lamp post with an iron bracket and a hanging lantern glowing warm yellow.

**`props-17`**
> Panels 1–4: the same lamp post.

**`props-18`**
> Panels 1–4: the same lamp post.

**`props-19`**
> Panel 1: the same lamp post.
