// Ravensmoor's magic: the kinds of magic, the status effects, the spells and the enchantments that make magic weapons
// and armour out of the families in arms.js. See docs/engine/magic.md.
//
// The numbers that matter: a hero has 24 mana at the start and a mana potion gives 12, so a fire bolt (5) is four
// casts. Spell damage gains one point per point of intellect above 4.

// The kinds of magic (fire, frost, shock, poison, holy) and the common effects (burning, chilled, stunned, poisoned,
// regeneration, warded) come with the engine (engine/content/magic.js), and so do its creatures' resistances to them.

export const spells = {
  firebolt: { name: 'Fire bolt', icon: 'spell', magicType: 'fire', cost: 5, cooldown: 1200, target: 'foe', range: 3, damage: [6, 10],
    effect: { id: 'burning', tier: 1, chance: 0.4 }, requires: { level: 1 },
    description: 'A dart of flame that flies down the passage. What it strikes may catch fire.' },
  frostbolt: { name: 'Frost bolt', icon: 'spell', magicType: 'frost', cost: 5, cooldown: 1200, target: 'foe', range: 3, damage: [4, 7],
    effect: { id: 'chilled', tier: 1 }, requires: { level: 2 },
    description: 'A shard of ice. It hurts less than fire, but whatever it hits slows to a crawl.' },
  thunderclap: { name: 'Thunderclap', icon: 'spell', magicType: 'shock', cost: 9, cooldown: 3000, target: 'area', range: 2, damage: [3, 5],
    effect: { id: 'stunned', tier: 1, chance: 0.5 }, requires: { level: 3 },
    description: 'A crack of lightning along the passage: everything within two paces is struck, and may be stunned.' },
  mending: { name: 'Mending', icon: 'heart', magicType: 'holy', cost: 6, cooldown: 3000, target: 'self', heal: [10, 14],
    effect: { id: 'regeneration', tier: 1 }, requires: { level: 1 },
    description: 'Closes wounds at once and keeps closing them for a while.' },
  ward: { name: 'Ward', icon: 'shield', magicType: 'holy', cost: 6, cooldown: 10000, target: 'self',
    effect: { id: 'warded', tier: 1 }, requires: { level: 2 },
    description: 'A shimmer of light that turns aside blows for half a minute.' },
};

// What a family's `enchants` make: `<material>-<family>-<enchantment>` (iron-sword-flame). The outline of the icon is the
// type's colour at the tier's strength.
export const enchantments = {
  flame: { name: 'Flame', type: 'fire', tier: 2, value: 3, drop: { minLevel: 3, weight: 0.5 },
    weapon: { elemental: [2, 4], onHit: { effect: 'burning', tier: 1, chance: 0.3 } }, armour: { resist: 0.75 } },
  frost: { name: 'Frost', type: 'frost', tier: 2, value: 3, drop: { minLevel: 3, weight: 0.5 },
    weapon: { elemental: [2, 4], onHit: { effect: 'chilled', tier: 1, chance: 0.4 } }, armour: { resist: 0.75 } },
  venom: { name: 'Venom', type: 'poison', tier: 1, value: 2, drop: { minLevel: 2, weight: 0.5 },
    weapon: { elemental: [1, 2], onHit: { effect: 'poisoned', tier: 1, chance: 0.4 } }, armour: { resist: 0.8 } },
  storm: { name: 'Storm', type: 'shock', tier: 3, value: 4, drop: { minLevel: 5, weight: 0.3 },
    weapon: { elemental: [3, 6], onHit: { effect: 'stunned', tier: 1, chance: 0.15 } }, armour: { resist: 0.7 } },
  dawn: { name: 'Dawn', type: 'holy', tier: 4, value: 10, drop: false,
    weapon: { elemental: [5, 9], onHit: { effect: 'regeneration', tier: 2, chance: 1 } }, armour: { resist: 0.6 },
    description: 'Warm to the touch, and bright enough to read by.' },
};

// Items that belong to magic: books and scrolls that teach spells, an antidote, rings of warding.
export const magicItems = {
  'scroll-firebolt': { name: 'Scroll of fire bolt', type: 'document', icon: 'spell-scroll', teaches: 'firebolt', value: 40, drop: { weight: 0.5, minLevel: 1 },
    description: 'Hurried, careful script, scorched at the edges. Reading it teaches the fire bolt, and uses it up.' },
  'scroll-mending': { name: 'Scroll of mending', type: 'document', icon: 'spell-scroll', teaches: 'mending', value: 35, drop: { weight: 0.5, minLevel: 1 },
    description: 'A healer’s rhyme, written out for learning. Reading it teaches mending, and uses it up.' },
  'tome-frostbolt': { name: 'Tome of frost', type: 'document', icon: 'tome', teaches: 'frostbolt', value: 60, drop: { weight: 0.4, minLevel: 2 },
    description: 'A cold, damp book. Its pages stick together. It teaches the frost bolt.' },
  'scroll-ward': { name: 'Scroll of warding', type: 'document', icon: 'spell-scroll', teaches: 'ward', value: 50, drop: { weight: 0.4, minLevel: 2 },
    description: 'Circles within circles. It teaches the ward.' },
  'tome-thunder': { name: 'Tome of thunder', type: 'document', icon: 'tome', teaches: 'thunderclap', value: 90, drop: { weight: 0.3, minLevel: 3 },
    description: 'The binding crackles when it is opened. It teaches the thunderclap.' },
  antidote: { name: 'Antidote', type: 'potion', icon: 'antidote', stack: 5, value: 12, drop: 2,
    description: 'A bitter green draught that drives poison out of the blood.',
    use(game) {
      if (!game.removeEffect('poisoned')) return { message: 'You are not poisoned.' };
      const message = 'You drink the antidote, and the poison leaves you.';
      game.say(message);
      return { consumed: true, message };
    } },
  'ember-ring': { name: 'Ember ring', type: 'armour', slot: 'ring', icon: 'ruby-ring', resist: { fire: 0.7 }, enchant: { type: 'fire', tier: 2 }, value: 70, drop: { minLevel: 3, weight: 0.4 },
    description: 'A ruby ring that is always a little too warm. Fire hurts the wearer less.' },
  'rime-ring': { name: 'Rime ring', type: 'armour', slot: 'ring', icon: 'silver-ring', resist: { frost: 0.7 }, enchant: { type: 'frost', tier: 1 }, value: 45, drop: { minLevel: 2, weight: 0.4 },
    description: 'A silver ring with frost on the inside of the band. Cold hurts the wearer less.' },
  'sparking-ring': { name: 'Sparking ring', type: 'armour', slot: 'ring', icon: 'gold-ring', resist: { shock: 0.7 }, bonus: { luck: 1 }, enchant: { type: 'shock', tier: 3 }, value: 120, drop: { minLevel: 5, weight: 0.3 },
    description: 'A gold ring that bites your finger when the air is dry. It shrugs off lightning and brings a little luck.' },
};
