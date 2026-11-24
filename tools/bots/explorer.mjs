// Explores the whole level: walks to the nearest unexplored passage, opens every container it passes, wears what it
// finds, fights what attacks it and drinks a potion when hurt. It does not go looking for fights. The run is won when
// there is nothing left to explore that it can reach.
import { heal, fight, loot, explore } from './tactics.mjs';

export default {
  name: 'explorer',
  description: 'Maps the level, loots containers, fights only when cornered.',
  act(sim, memory) {
    if (heal(sim) || fight(sim) || loot(sim, memory)) return;
    if (!explore(sim)) memory.done = true;
  },
  done: (sim, memory) => !!memory.done,
};
