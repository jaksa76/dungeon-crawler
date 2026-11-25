# The screen: one canvas, one pixel grid

Everything the player sees is drawn on **one canvas**, on **one pixel grid**: the main menu, the saves list, character creation, the
scene, the HUD, every menu, the message log. The only DOM left is the rotate overlay and a hidden text input for typing the hero's
name (it brings up a phone's keyboard; the canvas draws what it holds).

```
desktop 320 x 240                      phone, held sideways 400 x 180

+--------------------------+           +----+--------------------------+----+
|                          |           |head|                          |mini|
|    the scene 320 x 180   |           |bars|    the scene 320 x 180   |map |
|                          |           |btns|                          |slot|
+--------------------------+           |    |                          |slot|
|  the bar        320 x 60 |           |stck|                          |pill|
+--------------------------+           +----+--------------------------+----+
```

A phone held upright shows a **Rotate your device** overlay instead (`ui/screen.js`).

## Sizes and scaling

| Layout | Canvas | Scene at | HUD |
|---|---|---|---|
| `desktop` | 320 × 240 | (0, 0) | the bar, y 180–240 |
| `mobile` | 400 × 180 | (40, 0) | two rails, x 0–40 and x 360–400 |

The scene is always 320 × 180. It is composed in the level's own view coordinates (`view.js`, 640 × 360 by default) into an
offscreen surface half that size and copied onto the canvas; a pixel view (`view.pixel`) is drawn at its own size and
enlarged without smoothing. The menus are drawn in the same 320 × 180 area, over the scene, so a menu looks the same on
every device and the HUD stays visible beside it.

The canvas is shown at a **whole number of device pixels per canvas pixel** (`fitScale`): the largest `k` that fits the
window, counting device pixels (`devicePixelRatio`), not CSS pixels, with `image-rendering: pixelated`. A Pixel 7a
held sideways is 2400 × 1080 device pixels, exactly 6 × 400 × 180. A window too small for 1× shrinks the canvas smoothly
instead. The desktop layout leaves 70 CSS pixels for the help line unless the page is in full screen.

Which layout: a touch device (`pointer: coarse`) gets `mobile` held sideways and the rotate overlay held upright;
everything else gets `desktop`, whatever the size of its window. `?layout=mobile` or `?layout=desktop` forces one, to try
a layout on the other kind of device. A phone in full screen is locked to landscape where the browser allows
(`screen.orientation.lock`, Android Chrome); elsewhere the overlay does the job.

## The pieces

| File | What it is |
|---|---|
| `ui/screen.js` | the layouts, which one to use, the scale, the rotate overlay, pointer → canvas pixels |
| `ui/canvas.js` | the drawing kit: pixel text, frames, buttons, bars, icons, scroll areas, and the hit regions they register |
| `ui/input.js` | one pointer controller: taps, holds, drag and drop, scrolling, widgets that take a finger over |
| `ui/swipe.js` | a finger dragged across the scene moves the hero (phone only), with the first part of the move shown while the finger is down |
| `ui/hud.js` | the bar and the rails: head, bars, six menu buttons, the quick bar, the minimap, the two drag widgets |
| `ui/menus.js` | the frame round every menu (window, title bar, Close, news line), the small screens, the defeat screen |
| `ui/satchel.js`, `character-screen.js`, `spell-screen.js`, `settings-screen.js`, `help-screen.js`, `shop-screen.js`, `world-map.js` | the screens |
| `ui/stage.js` | made first by `startGame`: the canvas with its screen, kit and input, a frame loop for the screens before the game, and the name field |
| `ui/title-screen.js` | the main menu, the saves list, character creation, loading and error screens |
| `core/game.js` | builds the game on the stage, owns the scene, runs the loop |

### The canvas kit

Immediate mode: every frame each screen draws itself, and everything it draws that can be pressed also registers a
**region**. Regions are rebuilt every frame, so there is no widget state to keep in step, and the input controller asks
`kit.at(x, y)` for the topmost region under a point. All coordinates are whole canvas pixels, relative to an origin the
screen can move (`kit.origin`, `kit.withOrigin`). Text uses the 5 × 8 bitmap font (`ui/font-5x8.js`) one pixel at a time;
a character the font lacks is replaced (`plain()`: accents dropped, typographic dashes and quotes made plain, anything else `?`).

```js
kit.fill(x, y, w, h, colour)            kit.outline / frame / window            kit.disc / ring / capsule
kit.text(str, x, y, colour, { align, shadow })      kit.paragraph(str, x, y, w, colour, { max })      kit.wrapText / fitText
kit.icon(icons, id, x, y, 16, { outline, alpha })   kit.bar(x, y, w, h, value, max, { fill, hi, label })   kit.image(img, x, y)
kit.button(x, y, w, h, label, { tap, disabled, selected, primary, icon, title })     // draws, and registers a region
kit.hit(x, y, w, h, handlers)           kit.clip(x, y, w, h, fn)           kit.scroll(key, x, y, w, h, drawFn)
```

A region's handlers: `tap`, `hold` (500 ms), `press(pt, ev)` (takes the pointer over: returns `{ move, up }`; the sticks),
`drag(pt)` (returns a payload to carry), `accepts(payload)` and `drop(payload)`, plus `title` (the hover text) and `key`.
A payload is `{ ref, name, draw(kit, x, y), dropAway() }`; the quick bar takes anything with a `ref` (`{ kind: 'item' | 'spell', id }`).
A scroll area scrolls by wheel and by dragging, and clips both its drawing and its regions.

### Adding a screen

A screen is `{ kind, title, draw(), opened?(), closed?() }`; `draw` runs every frame with the origin at the panel's top-left
(0, 0 to 320, 180, inside a 5-pixel window rim; the title bar is y 5–18, so the content is x 5–315, y 20–175).
`menus.js` shows it with `open(screen, closing?)`; the HUD highlights the button whose `kind` matches. Look at
`spell-screen.js` for a small one.

## The HUD

**Desktop bar** (y 180–240): the hero's head (tap: character screen), health, mana and experience bars with numbers,
`LV n` under the head, gold, six menu buttons (character, spells or help, journal, satchel, full screen, settings), the eight
quick slots with their key numbers under them, the minimap.

**Phone rails**: the left rail has the head, the bars (a number, a thin experience bar, `Ln` on the head), the six menu
buttons in 2 × 3, and the **move stick**; the right rail has the minimap, the eight quick slots in 2 × 4, and the **turn pill**.
The stick and the pill are widgets you drag, like a joystick: the direction is where the finger is from the widget's centre
(up forward, down back, left and right strafe; the pill turns), a change of direction acts at once, and holding repeats like
a held key (after 350 ms, then every 220 ms). The game steps one tile at a time, so a widget picks a direction; it has no speed.

Taps in the scene attack a creature or use an object (`rules/interaction.js`), as with the mouse. **There are no
Attack, Cast or Use buttons**: attacking and using are taps in the scene, and a spell is cast from a
quick slot (the first spell learned lands in the first free slot) or with **C**.

## Before the game

The screens before the game are drawn in a 320 × 180 area in the middle of the canvas (so the same ones fit the 320 × 240 and the
400 × 180 layouts) on a dark background, or the campaign's `menu.background` picture if it gave one. The main menu is three
buttons and the title (the campaign's `menu.logo`, or the name in letters three times the font). Up and down choose, Enter
presses, Escape goes back, and everything can be tapped. The saves list has a Delete button on every row, and Delete and Replace
ask twice. Character creation has a name field (tap it, or just type: the name starts selected, so the first key replaces it;
a phone's keyboard comes up on a tap, and the canvas keeps its size while it is open), the attribute points and the stats they give.
A phone held upright gets the rotate overlay here too.

## Menus

Opened by the HUD buttons, the keys (**I** satchel, **P** character, **B** spells, **J** journal, **L** message log, **H** help,
**F** full screen, **Esc** closes) or the game (a chest, a shop, a person, the world map, the ending). One is open at a time;
the game pauses while it is. The panel's title bar has a line of news (what was just said, for four seconds) and **Close**.

| Screen | Notes |
|---|---|
| Satchel | the figure with nine slots, an 8 × 6 pack, a two-line description that scrolls, Use / Equip / Take off / Drop / Quick bar buttons. Drag a stack to move it, onto the figure to wear it, onto a quick slot to put it on the bar |
| Character | the figure, level and experience, the attribute points (Apply and Reset), stats with the change a point would make, resistances |
| Spells | a list and the chosen spell: Cast, Make ready, Quick bar; drag the icon to a quick slot |
| Journal, message log, help | scrolling text |
| Settings, saves | save, load (two presses to overwrite), help, sound, full screen, reload, slot outlines, main menu (two presses; saves first) |
| Shop, container | a scrolling list of rows with Buy / Sell / Take, and Take all |
| Dialogue | the text, then one button per choice |
| World map | the campaign's map across the whole panel, under the title bar, with a marker per known place; tap one to travel |
| Defeat | covers the scene until the way back has opened; only its button (or three seconds) continues |

The detailed icon style (`?icons=hd`) still loads, but there is no longer a setting for it: at 16 pixels a painted icon is
only a blur.

## Tests

`window.__stage` (from the start: `kit.regions()`, `screen`, `canvas`) and `window.__game2d.ui` (once the game has started) has `layout`, `scale`, `spec`, `rects()` (the HUD's rectangles), `regions()` (every region of the last
frame, with its `title`), `client(x, y)` (a canvas pixel as a page point) and `menus` (`kind`, `isOpen()`). The browser tests
in `tests/browser/` use them to click and drag on the canvas; `tests/engine/ui.test.mjs` covers the layout choice, the scale,
the HUD rectangles, text wrapping and the regions without a browser.
