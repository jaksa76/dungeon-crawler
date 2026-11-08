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
> This single panel is the ground seen from eye height: a wet cobblestone street in
> perspective, with irregular rounded grey-purple stones and dark gaps. Warm
> lantern light pools near the viewer, and the stones reflect a little moonlight
> further away, fading to dark blue at the horizon. Keep the magenta area above the
> horizon flat magenta. The same floor is shown under every view, so no
> distinctive features (no drains, puddle shapes or objects) and roughly symmetric
> left to right.

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

Props are billboards: always facing the viewer, painted at several distances
in one sheet. Each panel shows one prop, at each of the outlined positions;
`plan.json` and the keys list which panel holds which prop. Keep each prop
identical at every size.

**`props-1`**
> Panels 1–3: a town guard facing the viewer, standing at attention: steel helmet
> with a red plume, chainmail and breastplate, red heater shield with a gold cross,
> spear upright. Panel 4: a village woman facing the viewer: white bonnet, brown
> dress, cream apron, hands clasped.

**`props-2`**
> Panels 1–2: the same village woman. Panels 3–4: a mysterious traveller seen from
> behind, walking away, in a long green hooded cloak.

**`props-3`**
> Panel 1: the hooded traveller. Panels 2–4: a market stall seen from the front:
> red-and-white striped awning, hanging lantern, counter with a red cloth with a
> gold cross, potion bottles, and an old bearded merchant in a red cap behind it.

**`props-4`**
> Panel 1: the market stall. Panels 2–4: a round stone well with a small wooden
> roof, rope and bucket.

**`props-5`**
> Panels 1–2: a wooden barrel with iron hoops. Panels 3–4: a wooden crate.

**`props-6`**
> Panels 1–2: a closed wooden treasure chest with iron bands. Panels 3–4: a wooden
> lamp post with an iron bracket and a hanging lantern glowing warm yellow.
