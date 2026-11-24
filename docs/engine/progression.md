# Experience, levels and loot

M8. The engine gives the mechanism and sensible defaults; a campaign retunes every number.

## Experience and levels

`engine/rules/progression.js`. A creature is worth its `xp` if its stat block says so, else a tenth of the tabletop
experience for its challenge rating (a giant rat 3, goblin 5, orc 10, ghoul 20, ogre 45, owlbear 70, troll 180).
A kill adds that to the hero's experience, and the level is **always worked out from the experience** on a curve:

```js
progression: { xpToLevel: n => 10 * n * (n - 1), pointsPerLevel: 2, maxLevel: 20 }   // the defaults
```

`xpToLevel(n)` is the total experience for level n (20, 60, 120, 200, 300, ...); it must rise with n. A campaign
passes `progression` beside `unarmed`; the engine merges it over the defaults.

A new level restores the hero's health and mana and earns `pointsPerLevel` **skill points**. A point goes into an
attribute (`session.spend('strength')`, the plus buttons in the satchel, `sim.spend()` for bots), which is what raises
the derived stats: strength the damage, vitality the health, intellect the mana, agility defence, accuracy and evasion.

The hero saves `xp` and `grown` (the points put into attributes while levelling, apart from `spent` at character
creation), never the level or the attributes (see [persistence.md](persistence.md)). Retune the curve and old heroes
follow it; a save that holds more points than the new curve allows is trimmed rather than left over-powered.

Events: `kill` (with `xp`), `xp { amount, xp, level }`, `level-up { level, points }`, `spend { attribute, value, unspent }`.

The HUD shows the level and an experience bar (the painted panel under the mana bar, the rail on a phone); with points
to spend the bar says so. Open the satchel (I) with nothing selected to see the character sheet and spend them.

## Loot

Loot is **generated** from a value budget (`engine/rules/generate-loot.js`) unless the game says otherwise.

- Every item has a `value` (what it is worth) and optionally a `drop`: `false` never, a number its weight, or
  `{ weight?, minLevel?, maxLevel? }` the hero levels it turns up at. An item without a `value` is never generated.
  Materials may carry `value` (a multiplier on the family's) and `drop`, so steel can wait for level 3 and mithril never
  drops (`games/ravensmoor/content/arms.js`).
- A dying creature has a **budget**: `base + perCr x cr`, times the level's `lootScale` (a level's own field: deeper
  levels pay more), times `1 + perHeroLevel x (hero level - 1)`, times `1 + perLuck x luck` (items give luck with
  `bonus: { luck }`), times a roll between `1 - spread` and `1 + spread`. A creature's `loot: { budget }` replaces the
  formula. The generator buys items from the pool until nothing affordable is left, at most `maxItems`, and only with
  chance `dropChance`; of what fits, an item's chance is its weight times its value.
- The numbers are the campaign's `loot` option (defaults in `engine/rules/loot-defaults.js`).
- What drops lands on the floor of the tile where the creature fell (a pile, saved with the game); step there and use it.
  Event: `loot { source, items, value, budget, at }`.

**Specific loot.** A creature's stat block may say what it leaves: `loot: false` nothing (Ravensmoor's beasts), or
`loot: { contents: [...], loot: <table>, generate: { budget } }`, the same fields a container has, mixed freely. A
container's behaviour takes `generate: { budget, types?, chance? }` the same way (`{ type: 'open', generate: { budget: 80 } }`).
The ogre in the Undercrypt carries a health potion for certain and up to 40 more in value.

## Tuning from the bots

The bot reports measure all of it (see [bots.md](bots.md)): `xp`, `heroLevel`, `xpByKind`, `dropValue`, and
`dropValueByKind` against `dropBudgetByKind` (what each creature left against what it could have). Retune a budget, a
value or the curve, run the same seeds again and `compare` the two reports. `tests/ravensmoor/balance.test.mjs` runs a
fighter through the Undercrypt on every test run and fails if clearing the crypt no longer reaches the middle of the
curve, if experience stops matching the book, or if a creature leaves more than its budget.
