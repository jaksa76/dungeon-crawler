// Item definitions for game two. `icon` is the position of the picture in the row of eight item icons on
// the bottom panel (game-1/assets/ui/panel.png): sword, shield, red potion, blue potion, torch, scroll,
// crystal, key. `stack` is how many fit in one pack slot (default 1). `use` is { hp, mp } to restore.
export const itemDefs = {
  sword: { name: 'Sword', type: 'weapon', icon: 0, description: 'A trusty steel blade, ready for the road.' },
  shield: { name: 'Shield', type: 'armour', icon: 1, description: 'A round shield with a worn wooden face.' },
  'health-potion': { name: 'Health potion', type: 'potion', icon: 2, stack: 5, use: { hp: 20 }, description: 'A small vial of red tonic that mends wounds.' },
  'mana-potion': { name: 'Mana potion', type: 'potion', icon: 3, stack: 5, use: { mp: 12 }, description: 'A small vial of blue tonic that restores magical energy.' },
  torch: { name: 'Torch', type: 'tool', icon: 4, stack: 3, description: 'A pitch-soaked torch. The Undercrypt is very dark.' },
  scroll: { name: 'Scroll', type: 'document', icon: 5, description: 'A rolled parchment covered in faded, hurried script.' },
  crystal: { name: 'Violet crystal', type: 'treasure', icon: 6, stack: 5, description: 'A crystal that hums faintly when held, and glows in the dark.' },
  key: { name: 'Iron key', type: 'key', icon: 7, description: 'A small iron key with a worn bow. It must open something.' },
};

// The satchel is a grid: 8 columns of 4 rows is what fits a phone held sideways. A taller grid scrolls on a small screen.
export const inventoryColumns = 8;
export const inventorySize = 32;

// What the player carries at the start.
export const startingItems = [
  { item: 'sword' }, { item: 'shield' }, { item: 'health-potion' }, { item: 'mana-potion' },
];
