// Wanders at random and hits whatever stands in front of it. A baseline: any bot worth keeping should beat it.
import { fight } from './tactics.mjs';

const MOVES = ['forward', 'forward', 'forward', 'left', 'right', 'back'];

export default {
  name: 'random-walker',
  description: 'Wanders at random, fights what blocks its way. A baseline.',
  act(sim, memory) {
    if (fight(sim)) return;
    sim.move(MOVES[Math.floor(memory.random() * MOVES.length)]);
  },
};
