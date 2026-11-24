// Ravensmoor's weapons and armour: the damage types, what each material does, and the families of weapons and armour.
// A family becomes one item per material, `<material>-<family>` (rusty-sword, iron-mace, steel-mail): its damage range,
// speed and defence scaled by the material, its icon repainted in the material's colours. See docs/engine/equipment.md.

// What harms what. Creatures' resistances are in monsters.js.
export const damageTypes = {
  blade: { name: 'blade' },
  blunt: { name: 'blunt' },
  pierce: { name: 'pierce' },
};

// `damage` and `speed` multiply a weapon's, `defence` is added to armour's. The colours are the engine's.
export const materials = {
  rusty:   { damage: 0.7, defence: 0 },
  bronze:  { damage: 0.85, defence: 1 },
  iron:    { damage: 1, defence: 1 },
  steel:   { damage: 1.25, defence: 2 },
  silver:  { damage: 1.1, defence: 1 },
  mithril: { damage: 1.5, speed: 0.85, defence: 3 },
};

// Families, at iron: `damage` before the hero's strength is added, `speed` in ms between blows.
const weapon = (name, icon, damageType, damage, speed, materials, description, more = {}) =>
  ({ name, type: 'weapon', slot: 'weapon', icon, damageType, damage, speed, materials, description, ...more });
const armour = (name, icon, slot, defence, materials, description, more = {}) =>
  ({ name, type: 'armour', slot, icon, defence, materials, description, ...more });

export const arms = {
  // The engine's sword and shield come in materials here; saves that hold the old ones get the iron ones.
  sword: weapon('Sword', 'short-sword', 'blade', [5, 9], 700, {
    rusty: { description: 'A short sword gone brown with rust. It still has an edge, of sorts.' }, iron: {}, steel: {}, mithril: {} },
  'A {material} short sword, quick in the hand.', { aliases: { iron: ['sword'] } }),
  axe: weapon('Axe', 'hand-axe', 'blade', [6, 12], 900, ['bronze', 'iron', 'steel'], 'A {material} hand axe: slow, and it bites deep.'),
  mace: weapon('Mace', 'mace', 'blunt', [6, 10], 850, ['bronze', 'iron', 'steel'], 'A flanged {material} mace. Bones break under it.'),
  spear: weapon('Spear', 'spear', 'pierce', [5, 10], 800, ['bronze', 'iron', 'steel'], 'A {material}-headed spear on an ash shaft.'),
  dagger: weapon('Dagger', 'dagger', 'pierce', [2, 4], 450, ['rusty', 'iron', 'steel', 'silver'], 'A {material} dagger: little weight, many blows.'),

  helmet: armour('Helmet', 'iron-helmet', 'head', 1, ['rusty', 'iron', 'steel'], 'A {material} helmet with a nose guard.'),
  mail: armour('Mail shirt', 'chainmail', 'armour', 2, ['rusty', 'iron', 'steel', 'mithril'],
    'A shirt of {material} rings. Edges skid off it.', { resist: { blade: 0.8 } }),
  shield: armour('Shield', 'round-shield', 'shield', 1, ['bronze', 'iron', 'steel'], 'A round wooden shield rimmed with {material}.',
    { aliases: { iron: ['shield'] } }),
};
