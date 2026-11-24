// Where bots start when Ravensmoor is balanced (node tools/play.mjs --scenario <name>; see docs/engine/bots.md). Each is
// a scenario for the engine's simulation: plain data, plus code only where it must be.
export const scenarios = {
  // The whole game from the first step, as a new player starts it.
  start: {},
  // The Undercrypt as a player first enters it: the starting kit plus the village chest (the rusty sword worn, three health
  // potions, two mana potions, a torch), at the crypt's entrance.
  undercrypt: {
    level: 'dungeon',
    items: [{ item: 'health-potion', qty: 2 }, { item: 'mana-potion' }, { item: 'torch' }],
    equip: ['rusty-sword'],
  },
  // The same with the gear Ravensmoor hides: the village crate's mail, the Undercrypt hoard's mace and shield, a helmet.
  'undercrypt-geared': {
    level: 'dungeon',
    items: [{ item: 'health-potion', qty: 2 }, { item: 'mana-potion' }, { item: 'torch' }],
    equip: ['iron-mace', 'iron-shield', 'rusty-mail', 'iron-helmet'],
  },
  // The same, bare-handed: what happens to a player who skipped the chest.
  'undercrypt-unarmed': { level: 'dungeon' },
  // One snake, one armed hero, nothing else: a duel to measure the snake alone.
  'snake-duel': {
    level: 'dungeon', at: { x: 1, z: 1, dir: 2 }, clear: true, grace: 0, equip: ['rusty-sword'], items: [{ item: 'health-potion', qty: 2 }],
    spawn: [{ kind: 'snake', id: 'duel-snake', x: 1, z: 3, dir: 0 }],
  },
};
