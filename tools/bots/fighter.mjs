// Hunts: attacks what is beside it, chases what it sees, and otherwise explores to find more. Loots containers on the
// way and drinks a potion when health runs low (memory.options.healBelow, default 0.4). The run is won when no living
// creature is left on the level.
import { heal, fight, hunt, loot, explore } from './tactics.mjs';

export default {
  name: 'fighter',
  description: 'Clears the level: hunts every creature it sees, explores to find the rest.',
  act(sim, memory) {
    if (heal(sim, memory.options.healBelow ?? 0.4) || fight(sim) || hunt(sim) || loot(sim, memory)) return;
    if (!explore(sim)) memory.explored = true;
  },
  // Done when the level is clear (the designer's view, not the bot's: the bot keeps looking until then), or when
  // everything reachable is explored and no creature is in sight.
  done: (sim, memory) => sim.state({ omniscient: true }).monsters.length === 0 || (!!memory.explored && sim.monsters().length === 0),
};
