// Item definitions for game two. `icon` is an id from the icon atlas (game-2/art/icons/sheets.json lists all 144;
// see docs/icons.md). `stack` is how many fit in one pack slot (default 1). `use` is { hp, mp } to restore.
export const itemDefs = {
  sword: { name: 'Sword', type: 'weapon', icon: 'short-sword', description: 'A trusty steel blade, ready for the road.' },
  shield: { name: 'Shield', type: 'armour', icon: 'round-shield', description: 'A round shield with a worn wooden face.' },
  'health-potion': { name: 'Health potion', type: 'potion', icon: 'health-potion', stack: 5, use: { hp: 20 }, description: 'A small vial of red tonic that mends wounds.' },
  'mana-potion': { name: 'Mana potion', type: 'potion', icon: 'mana-potion', stack: 5, use: { mp: 12 }, description: 'A small vial of blue tonic that restores magical energy.' },
  torch: { name: 'Torch', type: 'tool', icon: 'torch', stack: 3, description: 'A pitch-soaked torch. The Undercrypt is very dark.' },
  scroll: { name: 'Scroll', type: 'document', icon: 'scroll', description: 'A rolled parchment covered in faded, hurried script.' },
  crystal: { name: 'Violet crystal', type: 'treasure', icon: 'violet-crystal', stack: 5, description: 'A crystal that hums faintly when held, and glows in the dark.' },
  key: { name: 'Iron key', type: 'key', icon: 'iron-key', description: 'A small iron key with a worn bow. It must open something.' },
};

// The satchel is a grid: 8 columns of 4 rows is what fits a phone held sideways. A taller grid scrolls on a small screen.
export const inventoryColumns = 8;
export const inventorySize = 32;

// What the player carries at the start.
export const startingItems = [
  { item: 'sword' }, { item: 'shield' }, { item: 'health-potion' }, { item: 'mana-potion' },
];
