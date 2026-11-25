# Magic, status effects and enchanted items

M8.1. The engine gives the mechanism and a few standard pieces; a campaign declares its spells, enchantments and numbers.

## What the engine predefines

`engine/content/magic.js`, in every content book:

- **Kinds of magic**, as damage types with `magic: true` and a `colour`: fire, frost, shock, poison, holy. They use the same
  resistance mechanism as blade, blunt and pierce (`resist: { fire: 1.5 }` is weak to fire, `0.5` resists, `0` is immune).
- **Status effects**: burning, chilled, stunned, poisoned, regeneration, warded.
- **Resistances on the engine's creatures** (`engine/content/bestiary.js`), so every campaign's skeletons and zombies
  already behave: skeletons and zombies are immune to poison and weak to holy, zombies burn (x1.5) and shrug off frost
  (x0.5), spiders are venomous (their bites may poison) and weak to fire, ghouls may stun, trolls burn (x1.5), ogres
  resist shock. A campaign's own `resist` on the same creature adds to these rather than replacing them.

Spells, enchantments, and the books and scrolls that teach spells are the campaign's (`games/ravensmoor/content/magic.js`).

## Status effects

`engine/rules/effects.js`. An effect is data: a duration, an optional tick, and what it does. Numbers that depend on
strength are lists by tier (1 to 4).

```js
burning: { name: 'Burning', magicType: 'fire', duration: [3000, 4000, 5000, 6000], tickMs: 1000, damage: [2, 3, 5, 8] }
chilled: { name: 'Chilled', magicType: 'frost', duration: [...], slow: [0.25, 0.35, 0.5, 0.65] }
```

`damage` and `heal` happen at each tick (damage of the effect's `magicType`, so resistances apply); `slow` takes a share
off the speed of whoever has it (a creature steps and strikes slower, the hero swings slower); `stun` stops stepping,
striking, swinging and casting; `attack` and `defence` change the hero's stats. Applying an effect that is already on:
the stronger tier wins and the time starts over, the same or a weaker tier only renews the time. Time stands still while
a menu is open. Effects on the hero are saved (with the time left); effects on creatures last until the level resets.

Effects come from spells, from enchanted weapons (`onHit`), from creatures' blows (`onHit` on a stat block) and from
content (`game.applyEffect(target, id, tier)`; `game.removeEffect(id)` for an antidote). A creature is **immune** to
an effect if its `immune` lists the effect or the effect's kind of magic, or its `resist` for that kind is 0.

## Spells

`engine/rules/magic.js`, declared in the book's `spells`:

```js
firebolt: { name: 'Fire bolt', icon: 'spell', magicType: 'fire', cost: 5, cooldown: 1200,
            target: 'foe', range: 3, damage: [6, 10], effect: { id: 'burning', tier: 1, chance: 0.4 },
            requires: { level: 1 }, description: '...' }
```

`target` is `'foe'` (the nearest creature in the line ahead, up to `range` tiles, never through a wall), `'area'` (every
creature in that line) or `'self'` (with `heal: [min, max]` and/or an `effect`). Damage gains the hero's **spell power**
(intellect above 4); magic does not miss and ignores defence, so what stops it is a resistance. A cast costs mana and
starts the spell's cooldown; one that finds nothing to strike costs nothing.

**Learning.** An item with `teaches: 'firebolt'` is a book or scroll: using it learns the spell and uses it up, unless the
hero knows it already or does not meet `requires` (`level`, `intellect`). The known spells and the ready one are saved
with the game (`engine.magic`). Learning with skill points is not built: the attributes use them (see
[progression.md](progression.md)).

**Casting.** `session.cast(id?, targetId?)`; without an id the *ready* spell. On the desktop: the **C** key casts the ready
spell and **B** (or the star in the painted panel) opens the spell book, where each spell has *Cast* and *Make ready*. On a
phone there is a *Cast* button beside *Attack* and a *Spells* menu button. Floating numbers show the damage in the colour
of the magic; effects on the hero show top left of the view (and on the phone's rail) with their time left.

Events: `learn`, `cast { spell, targets, mana }`, `effect { target, effect, tier, result }`, `effect-end`.

## Enchanted items

An enchanted item is a plain item definition with an `enchant: { type, tier }`; inventory and saves stay `{ id, qty }`.
Hand-written ones (rings, in `magic.js`) set `enchant`, `resist`, `bonus` themselves. Weapons and armour are made from
families the way materials are (see [equipment.md](equipment.md)): a family that lists `enchants: ['flame', 'frost']`
also becomes `<material>-<family>-<enchantment>` for every material (`iron-sword-flame`, `steel-mail-frost`):

```js
flame: { name: 'Flame', type: 'fire', tier: 2, value: 3, drop: { minLevel: 3, weight: 0.5 },
         weapon: { elemental: [2, 4], onHit: { effect: 'burning', tier: 1, chance: 0.3 } },
         armour: { resist: 0.75 } }
```

A weapon with `elemental` adds that much damage of the type to every hit (scaled by the creature's resistance), and
`onHit` may put an effect on what it hits. Armour with the enchantment resists the type. The item's `value` is the plain
item's times the enchantment's, so the loot generator (progression.md) prices it, and `drop` says when it turns up.
When the material limits drops too, the stricter rule holds: a material that never drops (`drop: false`) never drops
enchanted either, and the higher `minLevel` wins.

**The outline.** The colour of the outline on an enchanted item's icon is the colour of its kind of magic; its strength
is the tier: 1 *faint* (a thin, half-solid line), 2 *clear* (a solid line and a little glow), 3 *strong* (a thick line and
more glow), 4 *blazing* (a thick line and a wide glow). Satchel, equipment slots and containers all draw it, for both icon
styles (`engine/ui/icons.js`, `draw(..., outline)`). The item text says what it is: "fire enchantment, clear (tier 2),
+2–4 fire damage, 30% burning on hit". The line that equipping logs includes it: "+2–4 fire damage, burning on hit".

## Bots

`sim.cast(spellId?, targetId?)`, `sim.learn(id)`, `sim.spells()` and `sim.spend()`. `sim.state()` has the hero's `effects`
and `spellPower`, each visible creature's `effects`, `spells` (with `castable`) and `readySpell`. A scenario may give
`spells: ['firebolt']`. The `caster` bot (tools/bots/caster.mjs) mends when hurt and bolts what stands in the line ahead.
Over 200 runs of the Undercrypt the caster kills 9.1 creatures a run to the fighter's 8.3: magic helps, and the deep
creatures still win.

## Not yet

Effects shown on the targeted creature, the spell list showing what a spell would do to the creature in front, spells
that creatures cast. (Spells on the quick bar: see [quickbar.md](quickbar.md).)
