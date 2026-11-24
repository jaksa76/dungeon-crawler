// The rule book's items. `icon` is an id from the icon atlas (art/engine/icons/sheets.json lists all 144; see
// docs/engine/icons.md). `stack` is how many fit in one pack slot (default 1). `use` is { hp, mp } to restore. `slot`
// (weapon, shield, head, armour, ring, ...) makes it wearable; `bonus` is { attack, defence } it adds.
export const items = {
  sword: { name: 'Sword', type: 'weapon', slot: 'weapon', bonus: { attack: 4 }, icon: 'short-sword', description: 'A trusty steel blade, ready for the road.' },
  shield: { name: 'Shield', type: 'armour', slot: 'shield', bonus: { defence: 2 }, icon: 'round-shield', description: 'A round shield with a worn wooden face.' },
  'health-potion': { name: 'Health potion', type: 'potion', icon: 'health-potion', stack: 5, use: { hp: 20 }, description: 'A small vial of red tonic that mends wounds.' },
  'mana-potion': { name: 'Mana potion', type: 'potion', icon: 'mana-potion', stack: 5, use: { mp: 12 }, description: 'A small vial of blue tonic that restores magical energy.' },
  'leather-cap': { name: 'Leather cap', type: 'armour', slot: 'head', bonus: { defence: 1 }, icon: 'leather-cap', description: 'A snug cap of boiled leather.' },
  torch: { name: 'Torch', type: 'tool', icon: 'torch', stack: 3, description: 'A pitch-soaked torch.' },
  scroll: { name: 'Scroll', type: 'document', icon: 'scroll', description: 'A rolled parchment covered in faded, hurried script.' },
  crystal: { name: 'Violet crystal', type: 'treasure', icon: 'violet-crystal', stack: 5, description: 'A crystal that hums faintly when held, and glows in the dark.' },
  key: { name: 'Iron key', type: 'key', icon: 'iron-key', description: 'A small iron key with a worn bow. It must open something.' },
};
