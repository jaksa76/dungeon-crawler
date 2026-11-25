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
character creation (`engine/ui/title-screen.js`): creation is the one-time choice of a name and a few starting points; this is
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
