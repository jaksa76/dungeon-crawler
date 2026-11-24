// Ravensmoor: the campaign. The engine (engine/) is the rule book and the creature book; this is the setting, the
// maps and the story.
import { content } from './content/index.js';
import { village } from './levels/village.js';
import { undercrypt } from './levels/undercrypt.js';

export const campaign = {
  title: 'Ravensmoor',
  saveKey: 'ravensmoor',
  content,
  levels: { village, dungeon: undercrypt },
  start: 'village',
  respawn: { level: 'village', place: 'the village', message: 'You awaken safely in the village.' },
  // What the player carries at the start: no equipment, only a few potions.
  startingItems: [{ item: 'health-potion' }, { item: 'mana-potion' }],
  // Bare hands: weak, quick, and they bruise (the damage types are in content/arms.js).
  unarmed: { name: 'fists', damage: [1, 3], speed: 600, damageType: 'blunt' },
};
