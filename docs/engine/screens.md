# Character, help, save and load screens

The menu screens that open over the scene (the same 320 x 180 panel as the satchel and the journal, drawn on the game's one canvas: see [ui.md](ui.md)). `engine/ui/menus.js` is the frame round them; the content of each screen is in its own module.

## Character screen

Press **P**, or tap the hero's head or the character button in the bar or the rail. It shows:

- the hero's figure and name, their level and a bar to the next level;
- the four attributes with `-` and `+`, and how many **skill points** there are to spend (earned by levelling,
  see [progression.md](progression.md));
- the stats those give (health, mana, damage, defence, accuracy, evasion, spell power, luck), and what the hero's gear
  makes them take less damage from ("Damage taken: fire ×0.7").

Points are chosen first and applied together: pressing `+` changes the numbers in the stats column to show what the
point would give (`+5` mana), nothing is spent until **Apply**, and **Reset** or closing the screen drops the choice.

It is its own module (`engine/ui/character-screen.js`, `createCharacterScreen({ kit, sprite, hero, damageTypes, onSpend })`), apart from
character creation (`engine/ui/title-screen.js`, drawn on the canvas like everything else): creation is the one-time choice of a name and a few starting points; this is
the hero as they are for the rest of the game. Each has its own list of attribute descriptions, so either can change
without the other. A future class or skill tree belongs here. The satchel shows the level and a *Character* button.

## Help

**H** (or F1), or Settings → Help. `engine/ui/help-screen.js` lists how to move, use, fight, cast, level up, save, and every
key. Magic is described only when the game has spells. A campaign adds or replaces sections with `help` in its campaign
(`help: [{ title: 'The raven', text: 'Caw.' }]`; a section with the engine's title replaces it).

## Save and Load

Settings has **Save**, **Load** and **Help** buttons. Save lists every slot (an empty one is "Empty"; saving over a used one takes
two presses, "Overwrite?"), and says "Game saved." or "Your progress could not be saved.". Load lists the saved games only and
returns to the one chosen. Both have *Back to settings*. They are hidden when the game is not saving (a page opened with
`?level=` plays without saving).

## Main menu

Settings → **Main menu** leaves the game for the main menu. The first press asks ("Save and leave?", or "Leave unsaved?" when the
game is not saving); a second press within three seconds saves and opens the page again without `?new`, `?slot` or `?level`, so
it starts at the main menu, where *Continue* resumes. If the save fails, the game stays open and says so.

## Story moments

`game.showStory(story, done)` (behaviour.md) covers the whole canvas, scene and HUD, with one page at a time: a picture,
cover-fitted, and its text over the lower part on a dark band, the first page's title above it, and "Continue" (with the
page number) or "Close". A tap anywhere, Enter, Space or the right arrow turns the page; Escape skips the rest. Text longer
than the lower half of the screen carries on, over the same picture, on the next press. The game waits underneath, and a
story asked for while another is showing waits its turn. Pictures load when the story opens: the text shows at once. Paint pictures at **400 × 240**: that covers the desktop (320 × 240) and phone (400 × 180)
canvases at scale 1, crisp, losing 40 pixels at each side on the desktop and 30 at the top and bottom on a phone; keep the
lower part calm for the text. `engine/ui/story-screen.js`; `tests/browser/story.browser.mjs`.

Ravensmoor's ending, "The Quiet Bell", is one (`games/ravensmoor/assets/story/quiet-bell.png`, painted by Codex and reduced
with `tools/pixelate.mjs`; the painting and the prompt are in `art/ravensmoor/painted/quiet-bell.*`).
