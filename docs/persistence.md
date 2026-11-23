# Persistence

The engine owns the **mechanics** (`engine2d/persistence.js`): a registry of sections, the save envelope, save slots,
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
| `engine.player` | game.js | level, tile, facing |
| `engine.inventory` | `createInventory` | the pack (reset: the starting items) |
| `engine.equipment` | `createEquipment` | what is worn |
| `engine.hero` | `createCharacter` | current hp and mp only, never attributes or derived stats |
| `engine.exploration` | `createExplorationStore` | discovered cells per level |
| `engine.containers`, `engine.piles` | `stacksPersistence` | opened containers, things dropped on the floor |
| `game.flags` | `createFlags` | the game's own facts: `flags.get('quests.rat')` / `flags.set(...)` |

Save identity (item ids, level ids, progression), not computed values, so retuning the game also reaches old saves.

## What a game does

```js
startGame2d({
  title: 'Ravensmoor', saveKey: 'ravensmoor',        // window title, start screen, and a key of its own in localStorage
  maxSlots: 3,
  autosave: { intervalMs: 5000, onHidden: true, onLevelChange: true },
  persist: ({ flags, hero, inventory }) => [          // or a plain array
    { id: 'reputation', save: () => rep, load: d => { rep = d; }, reset: () => { rep = {}; } },
  ],
});
```

For small things skip the section and use `flags`. The call returns `{ persistence, flags, save, getState }`;
`getState()` is the snapshot (for the test player in M6). `?new` starts afresh in `?slot=` (default `slot-1`);
`?level=x` plays without saving.

## Slots and the player

Saves live in slots (`slot-1`, ...). With saves present the start screen lists them: continue, delete (two presses),
or start a new game in a free slot. A failed write says "Your progress could not be saved." in the message log, once.

## Not yet

Loading a save while playing (needed for "death returns to the last save" and for test scenarios), per-level scope
with stable entity ids, progression instead of fixed attributes, item aliases for renames.
