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
{ npc: 'hooded', name: 'a hooded stranger', x: 3, z: 2, side: 'S', state: { gaveHorn: false }, interact: talkToStranger },
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
| prop, NPC | `interact(game)` | the player uses the thing they face | `behavior: { type: 'examine' \| 'open' \| 'talk' \| 'shop', … }` |
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
- `door({ key, hidden, opens, closes, locked })`: the door methods and saved open and lock state. A locked door opens
  for its `key` item, or for anything that calls `open(game, { force: true })`. A hidden door is treated as a wall
  until opened. Use it with a matching masonry building for a secret passage.

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
| `openShop(instanceOrId)` | open trade with a merchant on the current level |
| `gainGold(amount)` | add gold to the saved purse and return the amount added |
| `talk(instance, dialogue)` | open a conversation with a placed entity |
| `quests` | read or advance the campaign's saved quest stages |
| `detectTrap(x, z)`, `disarmTrap(x, z)` | reveal a trap or disarm a revealed trap on the current level |
| `changed()` | call after changing something the player can see, so the view is drawn again |
| `isHere(instance)`, `blocked(instance)` | is it on the level being played; is the player or a living creature on its tile |
| `travel(level, spawn?)` | send the player to a level |

Spawned things are saved with their kind, placement and state. Methods given to `spawn()` are not saved: put
behaviour on the definition. A spawned creature that dies is gone for good (it is removed, not remembered as dead).

## Merchants

Give a prop or NPC a `merchant` definition with a `title`, optional `text`, and `stock` mapping item IDs to
`{ qty, price }`. Set `behavior: { type: 'shop' }` to open the shop on interaction. To open it from a dialogue
choice, call `game.openShop(merchantId)` in the choice's effect. Stock and the purse are saved.

The merchant pays half the listed price for an item it stocks, or half the item's `value` otherwise, rounded
down with a minimum of one gold. Set `sell: false` on an item that must stay out of trade. Loot stacks whose item
definition has `currency: true` go into the purse when taken, even if the pack is full.

## Dialogue and quests

Use `behavior: { type: 'talk', dialogue }` on a prop or NPC. A dialogue has a `title`, a `start` line ID or
function that returns one, and a `nodes` object. Each node has `text` and optional `choices`. A choice has a
`label` and can include `when(game)`, `effect(game)` and a destination `to`. Choosing a line with no destination
closes the conversation before its effect runs. A line with no choices has only the Close button.

Campaign `quests` are keyed by ID. Each definition has `title`, a `start` stage ID, `stages` mapping stage IDs to
objective text or functions of `game`, `completed` text and an optional `reward(game)` callback. Use
`game.quests.start(id)` to accept the quest, `advance(id, stage)` to change its active objective, and
`complete(id)` to mark it complete and award its reward once. The field journal shows active and completed
quests. Use `game.showEnding({ title, text, image? })` to display a chapter ending and signal completion to bots; with an
`image` it is shown as a story page.

A **story moment** is `game.showStory({ title?, pages: [{ image?, title?, text }] }, done?)`: full-screen pictures with text
the player reads and advances (screens.md). Call it from anything that has the game: a trigger's `effect`, a dialogue
choice's `effect`, a quest advancing, an `interact`. `done(game)` runs when the player closes it, for what follows; in a
simulation there is no screen, so it runs at once and the `story` event is all bots see.

A level can define `triggers` with an `on` event and an `effect(game, event)` callback. `enterTile` fires for a
step or arrival and can match `x` and `z`. `faceSide` also runs after a turn and can match `side` (`N`, `E`, `S`
or `W`). `flagSet` runs for changed flags and can match the `flag` name. Set `when(game, event)` to gate a trigger
on current game state. Restoring a save does not replay tile, facing or flag triggers.

Traps are floor placements in `level.traps` with coordinates, a `name`, and positive integer `damage`. Stepping
on one reveals it and hurts the hero. Using the tile reveals a concealed trap and disarms a revealed trap. The
optional `type`, `hint` and `message` label the damage event and customize the feedback. Detection and disarming
are saved per level.

Creatures may have `tactics` on their definition or placement. A patrol follows `route` waypoints between fights,
a guard stays within its `radius` (two tiles by default), and a fleeing creature backs away when its health falls
to a fraction `at` of its maximum (30 percent by default).

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
