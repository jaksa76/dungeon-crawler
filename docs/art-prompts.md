# Art prompts — town square experiment

Goal: recreate `docs/concept-toonish.png` with the hybrid renderer (3D tile geometry + painted panels + billboards + parallax backdrop).

## How to use

1. Start a fresh ChatGPT conversation, **attach `docs/concept-toonish.png`**, and paste the *Style preamble* first.
2. Then send each asset prompt one at a time (same conversation, so the style stays consistent).
3. Save each result under `game-1/assets/` using the exact path given. The demo picks files up automatically on reload and falls back to procedural placeholders for anything missing.
4. Sizes are what ChatGPT can produce (1024×1024, 1536×1024, 1024×1536). Don't worry about exact pixel sizes — the engine scales. Crop if it adds margins.

Important for the engine: **textures and sprites must be evenly lit**. The engine adds torchlight, moonlight and fog itself; baked-in dramatic lighting will fight it. Glowing windows/flames are the exception (they get auto-detected as self-illuminated).

---

## Style preamble (send first, with the concept image attached)

> I'm making game assets for a first-person, grid-based fantasy RPG. The attached image is the target look. All assets I'll ask for must match its style: detailed "hi-bit" pixel art with clearly visible chunky pixels (as if drawn at about one quarter of the output resolution and upscaled with nearest-neighbour), rich but limited palette, warm wood/plaster/stone tones with deep purple-blue night accents, mature heroic medieval fantasy, not cartoonish or chibi.
>
> Rules for every asset unless I say otherwise:
> - Flat, even, neutral lighting — no strong directional light, no cast shadows, no vignette, no dramatic night tint. The game engine adds lighting. Only light sources themselves (lit windows, flames, lanterns) may glow.
> - Straight-on orthographic view, no perspective, no tilt.
> - No text, no watermark, no border, no UI.
> - When I say "transparent background", output a PNG with a real alpha channel and nothing but the subject.
>
> Reply "ready" and wait for the first asset.

---

## 1. Environment textures (opaque)

**`textures/cobblestone.png`** — 1024×1024
> Seamless tileable texture, viewed straight from above: wet medieval cobblestone pavement, irregular rounded grey-purple stones with dark mortar gaps, a few subtle damp highlights, tiny moss in some cracks. Must tile perfectly on all four edges. Even lighting.

**`textures/roof-tiles.png`** — 1024×1024
> Seamless tileable texture, straight-on: old clay roof tiles in overlapping rows, muted red-brown with some darker weathered and mossy tiles. Must tile perfectly on all edges. Even lighting.

**`textures/house-timber-a.png`** — 1024×1536 (portrait)
> Straight-on orthographic facade section of a two-storey medieval half-timbered house, exactly one bay wide. Ground floor: stone plinth with a small window with warm yellow light inside. Upper floor: cream plaster between dark oak beams, one glowing leaded window. The section fills the whole image edge to edge (left and right edges are where it joins neighbouring sections, so beams run vertically along both edges). Top edge ends at the eaves. Even lighting except the glowing windows.

**`textures/house-timber-b.png`** — 1024×1536
> Same house style and scale as the previous facade, a variation: different beam pattern (diagonal braces), a flower box with pink flowers under the upper window, ivy creeping up one side. Fills image edge to edge, top edge ends at the eaves.

**`textures/house-door.png`** — 1024×1536
> Same house style and scale, a variation with a heavy arched wooden door with iron studs on the ground floor and a glowing window above it. Fills image edge to edge, top edge ends at the eaves.

**`textures/shop-alchemist.png`** — 1024×1536
> Same house style and scale: an alchemist's shop front. Ground floor: wide shop window with shelves of coloured potion bottles, warmly lit. Above the door hangs a small wooden sign painted with a red potion flask (no letters). Fills image edge to edge, top edge ends at the eaves.

**`textures/shop-smith.png`** — 1024×1536
> Same house style and scale: a blacksmith's front. Ground floor: open wide wooden doors showing a dim forge glow inside, an anvil silhouette. A hanging wooden sign with crossed hammers (no letters). Fills image edge to edge, top edge ends at the eaves.

**`textures/stone-wall.png`** — 1024×1536
> Straight-on orthographic section of a tall old town wall: large weathered grey-purple ashlar blocks, a few cracks, moss in joints. Must tile horizontally (left and right edges match). Even lighting.

**`textures/parapet.png`** — 1536×1024 (we'll use the bottom half)
> Straight-on orthographic view of a low stone parapet wall about waist high, with a flat capstone on top, occupying the bottom half of the image; the top half is fully transparent. Must tile horizontally. Transparent background above the wall.

## 2. Backdrop (parallax layers, all must tile horizontally)

**`backdrop/sky.png`** — 1536×1024
> Seamless horizontally tileable night sky: deep purple-blue gradient, darker at top, scattered pixel stars, a few soft violet clouds near the middle. No moon, no landscape. Left and right edges must match.

**`backdrop/hills.png`** — 1536×1024
> Seamless horizontally tileable distant landscape band in the bottom 40% of the image: dark forested hills and a few pine silhouettes in muted purple-blue, slightly hazy (atmospheric perspective). Everything above is transparent. Left and right edges must match.

**`backdrop/treeline.png`** — 1536×1024
> Seamless horizontally tileable nearer treeline in the bottom 35% of the image: dark pine and oak tree silhouettes with a few rooftops and a chimney, deep blue-purple with slight moonlit edges. Everything above is transparent. Left and right edges must match.

**`backdrop/moon.png`** — 1024×1024, transparent background
> A large full moon in pixel art, pale lavender with craters, with a soft glow halo. Transparent background.

**`backdrop/castle.png`** — 1536×1024, transparent background
> A sinister dark castle with tall spires on top of a rocky hill, seen from a distance, silhouetted in deep purple with a few glowing violet windows. Include the hill down to the bottom edge of the image. Transparent background.

**`backdrop/waterfall.png`** — 1536×1024, transparent background
> Distant landmark: a stone aqueduct with arches beside a cascading waterfall and a wooden water wheel, at the base of a cliff, night palette (blue-purple, white water). Bottom edge flat. Transparent background.

## 3. Sprites (billboards; transparent background, feet/base touching the bottom edge, centred horizontally)

**`sprites/npc-guard.png`** — 1024×1536
> Full-body town guard facing the viewer, standing at attention: steel helmet with red plume, chainmail and breastplate, red heater shield with a gold cross, spear held upright. Feet at bottom edge. Transparent background.

**`sprites/npc-guard-far.png`** — 1024×1536
> The same guard, but repainted to be seen from far away: much simpler shapes, stronger silhouette, only the key colours (steel, red plume, red shield), very chunky pixels (about half the detail of the previous one). Same pose and proportions. Transparent background.

**`sprites/npc-villager.png`** — 1024×1536
> Full-body village woman facing the viewer: white bonnet, brown dress, cream apron, hands clasped. Feet at bottom edge. Transparent background.

**`sprites/npc-villager-far.png`** — 1024×1536
> The same village woman repainted for viewing from far away: simplified shapes, strong silhouette, key colours only, very chunky pixels. Same pose. Transparent background.

**`sprites/npc-hooded.png`** — 1024×1536
> Full-body mysterious traveller seen from behind, walking away: long green hooded cloak, boots. Feet at bottom edge. Transparent background.

**`sprites/prop-stall.png`** — 1536×1024
> A market stall seen straight from the front: wooden frame with a red-and-white striped awning, a hanging lantern, a counter draped with a red cloth with a gold cross, a few potion bottles on the counter, and an old bearded merchant in a red cap standing behind it. A small treasure chest beside it. Base at bottom edge. Transparent background.

**`sprites/prop-well.png`** — 1024×1024
> A round stone village well with a small wooden roof, a rope and bucket, front view slightly from above. Base at bottom edge. Transparent background.

**`sprites/prop-barrel.png`** — 1024×1024
> A single wooden barrel with iron hoops, front view. Base at bottom edge. Transparent background.

**`sprites/prop-crate.png`** — 1024×1024
> A single wooden crate, front view. Base at bottom edge. Transparent background.

**`sprites/prop-chest.png`** — 1024×1024
> A closed wooden treasure chest with iron bands and a lock, front view. Base at bottom edge. Transparent background.

**`sprites/prop-lamppost.png`** — 1024×1536
> A medieval wooden lamp post with an iron bracket and a hanging lantern glowing warm yellow. Base at bottom edge. Transparent background.

**`sprites/prop-banner.png`** — 1024×1536
> A tall wooden pole with a hanging purple-red banner with a gold cross and swallowtail bottom. Base at bottom edge. Transparent background.

**`sprites/decal-torch.png`** — 1024×1024
> A wall-mounted iron torch sconce with a burning flame, front view, as if attached to a wall. Transparent background.

## 4. UI

**`ui/portrait-hero.png`** — 1024×1024
> Character portrait, head and shoulders, of a young determined hero with messy brown hair, blue eyes and a red hooded cloak, facing the viewer. Pixel art, square, plain dark background.

**`ui/panel-stone.png`** — 1024×1024
> Seamless tileable dark carved stone texture for a game's interface panel, subtle bevelled blocks, grey-purple. Must tile on all edges.

**`ui/icons-actions.png`** — 1536×1024
> A sprite sheet of 8 game interface icons arranged in a precise 4 columns × 2 rows grid with equal spacing, each icon centred in its cell, transparent background: crossed swords (attack), purple magic sparkle (spells), open book (journal), leather backpack (inventory), rolled parchment map, gear (settings), speech bubble (talk), open hand (use).

**`ui/icons-items.png`** — 1536×1024
> A sprite sheet of 8 item icons in a precise 4 columns × 2 rows grid with equal spacing, each centred in its cell, transparent background: short sword, round wooden shield, red potion, blue potion, burning torch, scroll, purple crystal, golden key.
