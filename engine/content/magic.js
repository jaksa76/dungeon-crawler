// The engine's magic: the kinds of magic and the common status effects. The predefined creatures (bestiary.js) already
// carry resistances and immunities to these kinds, so every campaign's skeletons shrug off poison and its zombies burn.
// A campaign adds its own kinds, effects, spells and enchantments, or changes these (content/catalog.js).
//
// A kind of magic is a damage type with `magic: true`; its `colour` outlines enchanted items of that type (ui/icons.js).
// Spells and enchantments are the campaign's: the engine gives the mechanism (rules/magic.js, rules/effects.js).
export const magicTypes = {
  fire: { name: 'fire', magic: true, colour: '#ff6a2a' },
  frost: { name: 'frost', magic: true, colour: '#58c8ff' },
  shock: { name: 'shock', magic: true, colour: '#ffe14a' },
  poison: { name: 'poison', magic: true, colour: '#7bd143' },
  holy: { name: 'holy', magic: true, colour: '#fff1b8' },
};

// Numbers that differ by strength tier (1 to 4) are lists; see rules/effects.js.
export const effects = {
  burning: { name: 'Burning', magicType: 'fire', duration: [3000, 4000, 5000, 6000], tickMs: 1000, damage: [2, 3, 5, 8] },
  chilled: { name: 'Chilled', magicType: 'frost', duration: [4000, 5000, 6000, 7000], slow: [0.25, 0.35, 0.5, 0.65] },
  stunned: { name: 'Stunned', magicType: 'shock', duration: [1000, 1500, 2000, 2500], stun: true },
  poisoned: { name: 'Poisoned', magicType: 'poison', duration: [5000, 7000, 9000, 11000], tickMs: 1000, damage: [1, 2, 3, 4] },
  regeneration: { name: 'Regeneration', magicType: 'holy', duration: [8000, 10000, 12000, 14000], tickMs: 1000, heal: [1, 2, 3, 5] },
  warded: { name: 'Warded', magicType: 'holy', duration: [20000, 25000, 30000, 40000], defence: [2, 3, 5, 7] },
};
