# Demo two mobile interface

The 2D demo keeps its original canvas HUD on desktop. On phones it uses a
separate DOM dashboard: character and quick items on the left, map and menus
on the right, with movement and turning controls within thumb reach. Portrait
stacks these panels below the scene. The scene retains its original aspect ratio.

The stone-and-bronze skin is in `engine2d/mobile-hud.css`; reusable generated
frame art is in `engine2d/assets`. Existing portrait and item art is reused.
A shared 5×8 bitmap font, 24×24 item icons, a 40×40 portrait, 12×12 control
icons, and a 64×64 panel texture keep the chrome close to the scene’s pixel
scale. Native buttons, labelled meters, keyboard focus indicators, and a modal dialog
keep controls accessible independently of the painted art.

## Controls and scope

- Step/strafe with the movement pad; turn with the curved arrows. Hold a
  movement button to repeat, or drag the scene: down moves forward, up moves
  backward, left turns right, and right turns left.
- Quick items and Inventory show the demo equipment descriptions. They do not
  introduce combat, potion consumption, or an inventory persistence system.
- Journal describes the current exploration demo; Map expands the live minimap.
- Settings contains control help, fullscreen where supported, and slot outlines.
- `?debug` reveals the development status and touch shortcut. **O** still toggles
  slot outlines. Normal play hides coordinates and asset counts.

## Verification

Serve the repository root (`python3 -m http.server 8000`) and open `/game-2/`.
Check portrait at 320×568 and 390×844; landscape at 568×320, 667×375, 844×390,
and 1024×768. Movement targets should be at least 44 CSS pixels in each
dimension, all controls should stay onscreen, and there should be no horizontal
overflow. Rotate in both directions and verify the same six controls move
between the dashboard and rails without duplication.

Open Inventory from the starting position. Confirm the dialog opens, blocks
movement, closes with Escape or Return, and restores keyboard movement. Check
all four quick items and the Inventory, Journal, Map, and Settings buttons.
Toggle slot outlines, move, and confirm the minimap follows the player. Check
desktop `/game-2/` and the pixel slice `/game-2/px.html`, and smoke-check demos
one and three since they share touch control code.

Browser emulation covers layout and interactions; device-specific safe areas
and fullscreen behavior should also be checked on an actual phone.
