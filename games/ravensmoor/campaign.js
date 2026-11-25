// Ravensmoor: the campaign. The engine (engine/) is the rule book and the creature book; this is the setting, the
// maps and the story.
import { content } from './content/index.js';
import { quests } from './content/quests.js';
import { worldMap } from './content/world-map.js';
import { village } from './levels/village.js';
import { undercrypt } from './levels/undercrypt.js';
import { market } from './levels/market.js';

export const campaign = {
  title: 'Ravensmoor',
  saveKey: 'ravensmoor',
  content, quests, worldMap,
  // The main menu's background: 400 x 240 pixel art, so it covers the desktop (320 x 240) and phone (400 x 180) canvases crisp.
  menu: { background: new URL('./assets/title-background.png', import.meta.url).href },
  levels: { village, dungeon: undercrypt, market },
  start: 'village',
  respawn: { level: 'village', place: 'the village', message: 'You awaken safely in the village.' },
  // What the player carries at the start: no equipment, only a few potions.
  startingItems: [{ item: 'health-potion' }, { item: 'mana-potion' }],
  // Bare hands: weak, quick, and they bruise (the damage types are in content/arms.js).
  unarmed: { name: 'fists', damage: [1, 3], speed: 600, damageType: 'blunt' },
  // Levels: the engine's curve (20, 60, 120, 200 ... experience), two skill points a level, ten levels in all.
  progression: { pointsPerLevel: 2, maxLevel: 10 },
  // Loot: the engine's budgets (docs/engine/progression.md); the Undercrypt pays what the engine says.
  loot: {},
};
