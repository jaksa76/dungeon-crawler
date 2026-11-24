// The rule book's items. `icon` is an id from the icon atlas (art/engine/icons/sheets.json lists all 144; see
// docs/engine/icons.md). `stack` is how many fit in one pack slot (default 1). `use` is { hp, mp } to restore. `slot`
// (weapon, shield, head, armour, ring, ...) makes it wearable. A weapon has `damage: [min, max]`, `speed` (ms between
// blows) and optionally a `damageType`; armour has `defence` and optionally `resist`; `bonus: { attack, defence }` is
// for anything else worn (rings, amulets). See engine/rules/equipment.js. The engine's own items have no damage type:
// the damage types are the campaign's (content/catalog.js).
// `value` is what an item is worth: the loot generator spends a creature's budget on items by value (rules/generate-loot.js).
// `drop` says whether and how often it is found that way: `false` never, a number its weight (default 1), or
// { weight?, minLevel?, maxLevel? } the hero's levels it turns up at. An item without a `value` is never generated.
export const items = {
  sword: { name: 'Sword', type: 'weapon', slot: 'weapon', damage: [6, 10], speed: 700, value: 40, icon: 'short-sword', description: 'A trusty steel blade, ready for the road.' },
  shield: { name: 'Shield', type: 'armour', slot: 'shield', defence: 2, value: 20, icon: 'round-shield', description: 'A round shield with a worn wooden face.' },
  'health-potion': { name: 'Health potion', type: 'potion', icon: 'health-potion', stack: 5, value: 10, drop: 4, use: { hp: 20 }, description: 'A small vial of red tonic that mends wounds.' },
  'mana-potion': { name: 'Mana potion', type: 'potion', icon: 'mana-potion', stack: 5, value: 12, drop: 3, use: { mp: 12 }, description: 'A small vial of blue tonic that restores magical energy.' },
  'leather-cap': { name: 'Leather cap', type: 'armour', slot: 'head', defence: 1, value: 8, icon: 'leather-cap', description: 'A snug cap of boiled leather.' },
  torch: { name: 'Torch', type: 'tool', icon: 'torch', stack: 3, description: 'A pitch-soaked torch.' },
  scroll: { name: 'Scroll', type: 'document', value: 15, drop: false, icon: 'scroll', description: 'A rolled parchment covered in faded, hurried script.' },
  crystal: { name: 'Violet crystal', type: 'treasure', value: 25, drop: 0.5, icon: 'violet-crystal', stack: 5, description: 'A crystal that hums faintly when held, and glows in the dark.' },
  key: { name: 'Iron key', type: 'key', icon: 'iron-key', description: 'A small iron key with a worn bow. It must open something.' },
};
