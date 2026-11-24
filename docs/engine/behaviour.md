# Behaviour: methods, state and the world

Content is declarative where it can be and code where it must be. Every definition in a content book (an item,
a prop, an NPC, a door, a creature) is a plain JS object: its data says what it is, and its methods say what it
does. The engine reads the data and calls the methods. A campaign writes its own methods, or uses the engine's
factories, which supply the same methods (`engine/rules/behaviours.js`).

```js
// games/ravensmoor/content/items.js: an item that opens a door on another level
'raven-horn': { name: 'Raven horn', type: 'tool', icon: 'raven-horn', description: '…',
  use(game) {
    const gate = game.find('dungeon', 'crypt-gate');
    if (gate.isOpen()) { game.say('The crypt gate already stands open.'); return; }
    gate.open(game, { force: true });
    game.say('You sound the horn. Far below, iron grinds on stone.');
  } },

// games/ravensmoor/levels/village.js: a placement with its own method and saved state
{ npc: 'hooded', name: 'a hooded stranger', x: 3, z: 2, side: 'S', state: { gaveHorn: false },
  interact(game) {
    if (this.state.gaveHorn) { game.say('“Sound the horn in the dark…”'); return; }
    if (game.inventory.add('raven-horn', 1) > 0) { game.say('“Your pack is full.”'); return; }
    this.state.gaveHorn = true;
    game.say('The stranger presses a black horn into your hands.');
  } },
```

## Instances

Placed things are **instances**: `Object.create(definition)`, made by the world (`engine/core/world.js`). Methods
and data come from the definition, so overriding a method in a content book changes every instance. A placement
in a level can add its own fields and methods, which win over the definition's. `this` in a method is the instance.

An instance has `category` (`prop`, `npc`, `door` or `monster`), `kind` (its book id), `level` (its level's id),
`ref` (what it is known by on its level: its `id`, or where it stands, or `spawn-<n>`), its placement (`x`, `z`, and
`side` or `dir`), and `state`.

Items are the exception: a stack of five potions is not five objects, so an item's methods get the definition as
`this` and the stack as an argument. An item with state of its own would have to be an instance; there are none yet.

## State

`this.state` is the only part of an instance that is saved. It must be plain JSON. Declare it with its defaults on
the definition (`state: { open: false, locked: false }`); a placement may override some (`state: { locked: true }`).
When a campaign update adds a field to `state`, old saves get the default.

Everything else on an instance is rebuilt from the definitions and the level when a game loads: methods, art, the
creature's current HP and position. Living creatures go back to their home tile, whole, when the player loads or
comes back to their level. **Dead stays dead**: a killed creature's `state.dead` is saved, and it does not come
back unless the campaign brings it back (`game.respawn`).

## Interfaces

All methods are optional. Where one is missing, the engine does what the data says.

| Category | Method | Called when | Data form |
| --- | --- | --- | --- |
| item | `use(game, stack)` → `{ consumed?, message? }` | the player uses it from the pack. `consumed` uses one up; `message` shows in the satchel | `use: { hp, mp }` = `restore({ hp, mp })` |
| prop, NPC | `interact(game)` | the player uses the thing they face | `behavior: { type: 'examine' \| 'open', … }` |
| door | `interact(game)`, `open(game, { force })`, `close(game)`, `isOpen()` | Use on the door ahead; code that opens it | `door({ key })` |
| creature | `onDeath(game)` | it has just been killed | |
| any instance | `onCreate(game)` | once per playthrough, when it first comes into being | |
| level | `onEnter(game)`, `onExit(game)` | the player arrives on the level (also when a game starts or loads there) or leaves it | |

## Factories

`engine/rules/behaviours.js` holds the engine's defaults, as functions that return methods:

- `examine(text)`: an `interact` that says something.
- `container({ title, text, contents, loot })`: an `interact` that opens a container. What is in it is rolled
  the first time and saved (see [inventory.md](inventory.md)).
- `restore({ hp, mp })`: an item `use` that heals. The quick slots find potions by its `restores`.
- `door({ key, opens, closes, locked })`: the door methods and `state: { open, locked }`. A locked door opens for
  its `key` item, or for anything that calls `open(game, { force: true })`.

A campaign uses them as they are (`interact: examine('…')`), wraps them (call the factory's method from its own),
or replaces them.

## The game API

The `game` argument is the contract between engine and campaign:

| | |
| --- | --- |
| `say(text)` | a line in the message log |
| `hero`, `inventory`, `equipment`, `items`, `flags` | the hero and their things, the item definitions, the campaign's saved facts |
| `level`, `player` | the id of the level being played; `{ x, z, dir }` of the player |
| `find(level, ref)` | an instance anywhere, even on a level the player has not visited |
| `all(level?, category?)`, `at(level, x, z)` | instances on a level, or on one tile |
| `spawn(kind, { level?, x, z, dir? \| side?, id?, state? })` | a new instance (a creature, a prop, an NPC or a door). Resolves once its art is loaded, if its level is being played |
| `remove(instance)` | take it out of the world; a placed one stays removed |
| `respawn(instance)` or `respawn(level, ref)` | back to its starting state and home tile; brings back a removed placed one |
| `openContainer(instance, { title, text, contents, loot })` | open a container's panel |
| `changed()` | call after changing something the player can see, so the view is drawn again |
| `isHere(instance)`, `blocked(instance)` | is it on the level being played; is the player or a living creature on its tile |
| `travel(level, spawn?)` | send the player to a level |

Spawned things are saved with their kind, placement and state. Methods given to `spawn()` are not saved: put
behaviour on the definition. A spawned creature that dies is gone for good (it is removed, not remembered as dead).

## Lifecycle and performance

A level's instances are made the first time something needs the level: the player enters it, or code reaches
into it with `find`, `all` or `spawn`. That is cheap (small objects, no art), so a horn can open a gate on a level
the player has never seen. Saved state of levels not made yet waits as plain data and is passed through on save.
Leaving a level does not unload it; only the level being played is drawn and simulated, and creatures elsewhere
stand still.

Each level keeps two indexes, by tile and by `ref`; moves, spawns and removals keep them current. All lookups go
through the world's `at`, `find`, `all` and `move`, so smarter indexing, unloading distant levels or simulating
"active bubbles" around the player can be changed inside `world.js` without touching campaigns or the rest of the
engine.
