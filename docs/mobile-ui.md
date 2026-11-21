# Demo two mobile interface

The 2D demo keeps its original canvas HUD on desktop. On phones it uses a
separate DOM dashboard: character and quick items on the left, map and menus
on the right, with movement and turning controls within thumb reach. Portrait
stacks these panels below the scene. The scene retains its original aspect ratio.

The stone-and-bronze skin is in `engine2d/mobile-hud.css`; reusable generated
frame art is in `engine2d/assets`. Existing portrait and item art is reused.
A shared 5×8 bitmap font, 24×24 item icons, a 40×40 portrait, 12×12 control
icons, and a 64×64 panel texture keep the chrome close to the scene’s pixel
scale. Native buttons, labelled meters, keyboard focus indicators, and one panel over the scene
(for every menu, the message log and the game-over screen) keep controls accessible independently of the painted art.

## One pixel size

`--rpg-px` on `<html>` is the number of screen pixels per UI pixel: 3 for the desktop panel at
960px wide, 2 on phones. `engine2d/game.js` sets it on every resize, and everything reads that one
value: the 8-pixel font is `8px × --rpg-px`, borders are `--rpg-px` wide, and every art canvas is
drawn at `size / --rpg-px` logical pixels and shown at exactly that many times `--rpg-px`.

Art canvases (quick items, menu icons, portrait, minimap, inventory icons) go through `addArt` in
`engine2d/mobile-hud.js`. Ask it for an on-screen size in CSS pixels; it chooses the resolution, so
the same icon can be 48px or 72px without ever being scaled by a fraction. Do not size an art canvas
in CSS. `node tools/check-pixels.mjs` measures every art canvas in five layouts and fails on a
fractional scale (needs Playwright and Chromium).

## Controls and scope

- Step/strafe with the movement pad; turn with the curved arrows. Hold a
  movement button to repeat, or drag the scene: down moves forward, up moves
  backward, left turns right, and right turns left.
- The four quick items show descriptions only. The Bag opens the real pack (a grid of stacks you can
  drop); see [inventory.md](inventory.md).
- Journal describes the current exploration demo and has a Message log button. The minimap is always on screen.
- **Use** (above the turn buttons; **F** or **Space** on a keyboard) acts on what you face. See [interaction.md](interaction.md).
- On desktop the painted panel's Journal, Bag, Full screen and Settings icons and the first four quick items are clickable. The icon next to Settings toggles full screen (its glyph replaces the painted scroll, drawn by `engine2d/panel-icons.js`).
- On desktop, full screen (Settings, or the browser's F11) hides the shortcut line and the frame shadow, and scales the game to the largest size that fits, so it touches the top and bottom edges.
- Settings contains control help, a cache-free reload, and slot outlines. Full screen has its own button.
- Game two's eastern village door connects to the Undercrypt; see
  [dungeon-level.md](dungeon-level.md) for travel, visibility and art authoring.
- **Reload without cache** in Settings clears this project's Cache Storage and
  service worker registrations, refreshes loaded game assets from the network,
  and reloads the page at a unique URL. Browsers do not expose a page API for
  clearing their entire HTTP cache. Saved data is retained.
- `?debug` reveals the development status and touch shortcut. **O** still toggles
  slot outlines. Normal play hides coordinates and asset counts.

## Verification

Serve the repository root (`python3 -m http.server 8000`) and open `/game-2/`.
Check portrait at 320×568 and 390×844; landscape at 568×320, 667×375, 844×390,
and 1024×768. Movement targets should be at least 44 CSS pixels in each
dimension, all controls should stay onscreen, and there should be no horizontal
overflow. Rotate in both directions and verify the same six controls move
between the dashboard and rails without duplication.

Open Inventory from the starting position. Confirm the panel covers only the scene (rails and
controls stay visible), blocks movement, closes with Escape or Close, and restores
keyboard movement. Its text should have the same pixel size as the UI around it. Check
all four quick items and the Inventory, Journal, Full screen, and Settings buttons.
Toggle slot outlines, move, and confirm the minimap follows the player. Check
desktop `/game-2/` and the pixel slice `/game-2/px.html`, and smoke-check demos
one and three since they share touch control code.

Browser emulation covers layout and interactions; device-specific safe areas
and fullscreen behavior should also be checked on an actual phone.
