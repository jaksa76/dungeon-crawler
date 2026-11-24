# Weapons, armour and materials

The engine provides the mechanism and the campaign decides every number: which damage types exist, which weapons and
armour there are, what each material does, and what each creature resists. Ravensmoor's choices are in
`games/ravensmoor/content/arms.js` and `content/monsters.js`.

## Damage types

A content book declares them (`damageTypes`); the engine has none of its own. Ravensmoor has `blade`, `blunt` and
`pierce`; magic ones can be added the same way.

```js
damageTypes: { blade: { name: 'blade' }, blunt: { name: 'blunt' }, pierce: { name: 'pierce' } }
```

Every `damageType` and every `resist` key on an item or creature must name a declared type, or `mergeContent` throws.

## Weapons and armour

Items, with fields that the combat rules read (`engine/rules/equipment.js` adds up what is worn, `gear()`):

| Field | On | Meaning |
| --- | --- | --- |
| `damage: [min, max]` | weapon | the roll before strength is added |
| `speed` | weapon | ms between blows (the attack cooldown) |
| `damageType` | weapon, creature | the kind of harm its blows do |
| `defence` | armour | taken off every blow received |
| `resist: { <type>: x }` | armour, creature | multiplies the damage taken of that type: 0.5 halves it, 1.5 is a weakness. Several pieces multiply |
| `bonus: { attack, defence }` | anything worn | added to the hero's damage and defence (rings, amulets) |

Without a weapon the hero fights bare-handed: `FISTS` in `engine/rules/combat.js` (1–3, a blow every 0.6 s, no
damage type), or the campaign's own `unarmed` (Ravensmoor's fists do blunt damage).

## A blow

`strike()` in `engine/rules/combat.js`:

1. It lands with 75% chance, plus or minus 4 points per point of accuracy over the defender's evasion (20% to 95%).
2. The hero rolls a whole number in the weapon's range plus `strength − 2` (plus any `bonus.attack`). A creature does
   its attack ±20%.
3. The defender's `resist[damageType]` multiplies it.
4. Defence comes off. A hit does at least 1.

The hero then waits the weapon's `speed` before the next blow. When a creature resists or is weak to the blow, the
message says so ("You hit the skeleton for 4. It resists blade.").

## Materials and families

`materials` is a content kind too. The engine's book (`engine/content/materials.js`) gives each material its
**colours** only: rusty, bronze, iron, steel, silver, gold, mithril, obsidian. A campaign adds what a material does:

```js
materials: { rusty: { damage: 0.7, defence: 0 }, steel: { damage: 1.25, defence: 2 }, mithril: { damage: 1.5, speed: 0.85, defence: 3 } }
```

An item with `materials` is a **family**. It is not an item itself; `mergeContent` turns it into one item per material
(`forgeFamilies` in `engine/content/catalog.js`):

```js
mace: { name: 'Mace', type: 'weapon', slot: 'weapon', icon: 'mace', damageType: 'blunt', damage: [6, 10], speed: 850,
  materials: ['bronze', 'iron', 'steel'], description: 'A flanged {material} mace.' }
// -> bronze-mace, iron-mace, steel-mace: "Iron mace", damage × the material's `damage`, speed × its `speed`,
//    defence + its `defence`, icon 'mace@iron', description 'A flanged iron mace.'
```

- `materials` may also be `{ <material>: { ...overrides } }`, for a tier that differs (its own description, say).
- `aliases: { iron: ['sword'] }` gives the iron one the old id, so saves that hold the old item keep it.
- The results are plain item definitions, so the pack and saves still hold `{ id, qty }`.

## One icon per family

An icon id `<icon>@<material>` is that icon with its metal repainted in the material's colours (`recolour()` in
`engine/ui/icons.js`, done once per icon when it is first drawn). Metal is any pixel that is greyish (or the lavender
grey the painted icons use) and not a dark outline; its brightness picks the place along the material's colours, so
the shading stays. Wood, leather, gems and outlines keep their colours. It works for both icon styles.

## What changed

Equipping or taking something off goes through the session (`session.equip`, `session.unequip`); the message says
what changes in a fight: *You equip the iron mace: damage 8–10 blade → 10–14 blunt, slower.* The `equip` and
`unequip` events carry the same words as `changes` (`compareStats()` in `engine/rules/combat.js`). The satchel's item
text has little room, so it puts the numbers before the description and keeps them short: the damage the hero would
deal with it, strength included ("Blunt 10–14, a blow every 0.85 s."), and for a pack item what wearing it would change
("If worn: +3 damage, slower.", `statDelta()`).

## Not yet

Rarity, magic outlines, on-hit effects (with status effects, M8), ranged weapons and ammunition, attribute or level
requirements, and worn equipment drawn on the hero figure.
