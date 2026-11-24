// Fights with spells as well as steel: mends itself when hurt, casts a damaging spell at whatever is in the line ahead
// (within three tiles), and otherwise plays like the fighter: hunts, fights, loots, explores, drinks potions, spends
// skill points (strength; --option grow=intellect for more mana and stronger spells).
import { heal, grow, fight, hunt, loot, scavenge, explore, mend, castAtFoe } from './tactics.mjs';

export default {
  name: 'caster',
  description: 'The fighter with spells: bolts at range, mending when hurt.',
  act(sim, memory) {
    if (heal(sim, memory.options.healBelow ?? 0.4) || mend(sim, memory.options.mendBelow ?? 0.5) || grow(sim, memory)) return;
    if (castAtFoe(sim) || fight(sim) || hunt(sim) || scavenge(sim, memory) || loot(sim, memory)) return;
    if (!explore(sim)) memory.explored = true;
  },
  done: (sim, memory) => sim.state({ omniscient: true }).monsters.length === 0 || (!!memory.explored && sim.monsters().length === 0),
};
