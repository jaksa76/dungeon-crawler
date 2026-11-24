# Persistence

The engine owns the **mechanics** (`engine/core/persistence.js`): a registry of sections, the save envelope, save slots,
ordered restore, migrations. A **game** decides what is saved by what it registers and how it is tuned. The engine
never looks inside a section.

## Sections

A section is state somebody owns: `{ id, version?, save(), load(data, ctx), reset?(), migrate?, after? }`.

- `save()` returns plain JSON-able data. It is copied, so later changes never leak into a snapshot.
- `load(data, ctx)` puts it back (it may be async). `ctx.issue(text)` reports data that had to be dropped.
- `reset()` returns to the starting state. It runs when a save has no data for the section, or the data is unusable.
- `version` + `migrate: { 1: data => data' }` upgrade old data one version at a time. Sections version independently.
- `after: ['hero']` or `['engine.hero']` orders loading. Engine sections load before game sections.

Two namespaces keep ids apart, automatically: `engine` (components of the framework) and `game` (everything a game
adds). Sections found in a save but not registered, or too new to read, are kept and written back untouched.

## What the engine registers

| section | owner | holds |
|---|---|---|
| `engine.player` | session.js | level, tile, facing |
| `engine.inventory` | `createInventory` | the pack (reset: the starting items) |
| `engine.equipment` | `createEquipment` | what is worn |
| `engine.hero` | `createCharacter` | the name, the points spent at creation, experience, the points put in while levelling (`grown`), current hp and mp; never the level, attributes or derived stats |
| `engine.exploration` | `createExplorationStore` | discovered cells per level |
| `engine.containers`, `engine.piles` | `stacksPersistence` | opened containers, things dropped on the floor |
| `game.flags` | `createFlags` | the game's own facts: `flags.get('quests.rat')` / `flags.set(...)` |

Save identity (item ids, level ids, progression), not computed values, so retuning the game also reaches old saves.

## What a game does

```js
startGame2d({
  title: 'Ravensmoor', saveKey: 'ravensmoor',        // window title, start screen, and a key of its own in localStorage
  maxSlots: 3,
  autosave: { intervalMs: 0, onHidden: false, onLevelChange: false }, // the default: off, the player saves by hand
  persist: ({ flags, hero, inventory }) => [          // or a plain array
    { id: 'reputation', save: () => rep, load: d => { rep = d; }, reset: () => { rep = {}; } },
  ],
});
```

For small things skip the section and use `flags`. The call returns `{ persistence, flags, save, getState }`;
`getState()` is the snapshot (for the test player in M6). `?new` starts afresh in `?slot=` (default `slot-1`);
`?level=x` plays without saving.

## Slots and the player

Saves live in slots (`slot-1`, ...). The page opens on the main menu (engine/ui/title-screen.js): Continue loads the
newest save, Load game lists every save (load it, or delete it with two presses; Back or Escape returns), and New game
goes to character creation and then starts in a free slot. When every slot is in use, New game first asks which save to
replace (two presses). A campaign can dress the menu with `menu: { logo, background }`. Autosave is off by default (it made death cost nothing): the player saves and loads
from the settings panel, one row per slot (`maxSlots`); overwriting a save takes two presses. A new game is not written
until the player saves it. A failed write says "Your progress could not be saved." in the message log, once.

## Loading while playing

`loadState(snapshot)` (returned by `startGame2d`, also `window.__game2d.loadState`) opens the saved level, restores every
section and starts the creatures over. Autosave is off while it runs, so half-loaded state is never written. The
settings panel's Load uses it. Dying does not: the hero returns to the village's starting point with full health,
keeping what they carry, the creatures start over, and nothing is saved.

## Renames and edits

- Entities may carry an `id` (unique in a level). A container is saved under it, so moving the chest in the level
  does not lose its contents; without an id it is saved by its position.
- An item that is renamed keeps its old ids in `aliases: ['old-id']`; saves that name them still load.
- Items and slots that no longer exist are dropped and reported as issues in the console.

## Character creation

A new game starts with a screen for the hero's name and `characterCreation.points` (default 4) to add to the base
attributes (`false` turns it off). Only the points spent are saved, so changing the game's base attributes also reaches
heroes that already exist.

## Not yet

A per-level state scope (monster respawn in M8, doors in M13), and levels and XP as saved progression (M8).

## The world

Placed and spawned things (props, NPCs, doors, creatures) save through one engine section, `world`
(`engine/core/world.js`): per level, each placed instance's `state` (or that it was removed), and every spawned
instance with its kind, placement and state. It loads before `player`, so the level the player is on opens with its
things already restored. See [behaviour.md](behaviour.md).
