// Ravensmoor's weapons and armour: the damage types, what each material does, and the families of weapons and armour.
// A family becomes one item per material, `<material>-<family>` (rusty-sword, iron-mace, steel-mail): its damage range,
// speed and defence scaled by the material, its icon repainted in the material's colours. See docs/engine/equipment.md.

// What harms what. Creatures' resistances are in monsters.js.
export const damageTypes = {
  blade: { name: 'blade' },
  blunt: { name: 'blunt' },
  pierce: { name: 'pierce' },
};

// `damage` and `speed` multiply a weapon's, `defence` is added to armour's, `value` multiplies the family's value (what
// the loot generator spends). `drop` limits when it is found: steel only once the hero is level 3, mithril never (chests
// and shops only). The colours are the engine's.
export const materials = {
  rusty:   { damage: 0.7, defence: 0, value: 0.3 },
  bronze:  { damage: 0.85, defence: 1, value: 0.7 },
  iron:    { damage: 1, defence: 1, value: 1 },
  steel:   { damage: 1.25, defence: 2, value: 2.5, drop: { minLevel: 3 } },
  silver:  { damage: 1.1, defence: 1, value: 3, drop: { minLevel: 4, weight: 0.5 } },
  mithril: { damage: 1.5, speed: 0.85, defence: 3, value: 8, drop: false },
};

// Families, at iron: `damage` before the hero's strength is added, `speed` in ms between blows.
// `value` is the iron one's worth in the loot generator (rules/generate-loot.js).
const weapon = (name, icon, damageType, damage, speed, value, materials, description, more = {}) =>
  ({ name, type: 'weapon', slot: 'weapon', icon, damageType, damage, speed, value, materials, description, ...more });
const armour = (name, icon, slot, defence, value, materials, description, more = {}) =>
  ({ name, type: 'armour', slot, icon, defence, value, materials, description, ...more });

export const arms = {
  // The engine's sword and shield come in materials here; saves that hold the old ones get the iron ones.
  sword: weapon('Sword', 'short-sword', 'blade', [5, 9], 700, 40, {
    rusty: { description: 'A short sword gone brown with rust. It still has an edge, of sorts.' }, iron: {}, steel: {}, mithril: {} },
  'A {material} short sword, quick in the hand.', { aliases: { iron: ['sword'] } }),
  axe: weapon('Axe', 'hand-axe', 'blade', [6, 12], 900, 55, ['bronze', 'iron', 'steel'], 'A {material} hand axe: slow, and it bites deep.'),
  mace: weapon('Mace', 'mace', 'blunt', [6, 10], 850, 50, ['bronze', 'iron', 'steel'], 'A flanged {material} mace. Bones break under it.'),
  spear: weapon('Spear', 'spear', 'pierce', [5, 10], 800, 45, ['bronze', 'iron', 'steel'], 'A {material}-headed spear on an ash shaft.'),
  dagger: weapon('Dagger', 'dagger', 'pierce', [2, 4], 450, 20, ['rusty', 'iron', 'steel', 'silver'], 'A {material} dagger: little weight, many blows.'),

  helmet: armour('Helmet', 'iron-helmet', 'head', 1, 30, ['rusty', 'iron', 'steel'], 'A {material} helmet with a nose guard.'),
  mail: armour('Mail shirt', 'chainmail', 'armour', 2, 80, ['rusty', 'iron', 'steel', 'mithril'],
    'A shirt of {material} rings. Edges skid off it.', { resist: { blade: 0.8 } }),
  shield: armour('Shield', 'round-shield', 'shield', 1, 35, ['bronze', 'iron', 'steel'], 'A round wooden shield rimmed with {material}.',
    { aliases: { iron: ['shield'] } }),
};
