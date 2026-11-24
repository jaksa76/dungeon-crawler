// Small pieces of play the example bots share. Each takes one decision and acts on it, and returns whether it did
// anything, so a bot is a list of these tried in order: `heal(sim) || fight(sim) || loot(sim, memory) || explore(sim)`.
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const dirTo = (from, to) => DIRS.findIndex(([dx, dz]) => from.x + dx === to.x && from.z + dz === to.z);

// Drink a health potion when health falls below `below` (a share of the maximum).
export function heal(sim, below = 0.4) {
  const { hero, inventory } = sim.state();
  if (hero.hp >= hero.maxHp * below || !inventory.some(s => s.restores?.hp)) return false;
  return sim.quaff('hp').ok;
}

// Fight a creature beside the hero: face it and swing.
export function fight(sim) {
  const here = sim.position, foe = sim.monsters().find(m => m.adjacent);
  if (!foe) return false;
  const dir = dirTo(here, foe);
  if (dir >= 0 && dir !== here.dir) { sim.face(dir); return true; }
  sim.attack(foe.id);
  return true;
}

// Walk toward the nearest creature in sight (one step).
export function hunt(sim) {
  const foe = sim.monsters().find(m => !m.adjacent);
  if (!foe) return false;
  const route = sim.path(foe, { known: false });
  if (!route?.length) return false;
  sim.face(route[0]);
  return sim.forward().ok;
}

// Open every container on the hero's own tile once, take what is inside and wear anything that fills an empty slot.
export function loot(sim, memory) {
  const tried = (memory.tried ??= new Set());
  const thing = sim.state().here.find(t => !tried.has(`${sim.level}:${t.id}`));
  if (!thing) return false;
  tried.add(`${sim.level}:${thing.id}`);
  sim.face(thing.dir);
  if (sim.interact().container) sim.takeAll();
  wearBetter(sim);
  return true;
}

// Put on whatever in the pack fits a slot that is empty.
export function wearBetter(sim) {
  const { inventory, equipment } = sim.state();
  for (const stack of inventory) {
    if (!stack.wear) continue;
    const slot = sim.equipment.targetFor(stack.id);
    if (slot && !equipment[slot]) sim.equip(stack.slot, slot);
  }
}

// The nearest explored floor tile next to one not explored yet, or null when the level is all known.
export function frontier(sim) {
  const map = sim.map(), seen = new Set(), queue = [sim.position];
  for (let i = 0; i < queue.length; i++) {
    const { x, z } = queue[i], key = `${x},${z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (DIRS.some(([dx, dz]) => !map.known(x + dx, z + dz) && map.open(x + dx, z + dz))) return { x, z };
    for (const [dx, dz] of DIRS) if (map.known(x + dx, z + dz) && map.open(x + dx, z + dz)) queue.push({ x: x + dx, z: z + dz });
  }
  return null;
}

// One step toward the nearest unexplored part of the level. False when there is nowhere left to go.
export function explore(sim) {
  const goal = frontier(sim);
  if (!goal) return false;
  if (goal.x === sim.position.x && goal.z === sim.position.z) {
    // At the edge: step into the unknown.
    const map = sim.map(), dir = DIRS.findIndex(([dx, dz]) => !map.known(goal.x + dx, goal.z + dz) && map.open(goal.x + dx, goal.z + dz));
    sim.face(dir);
    return sim.forward().ok || sim.wait(200).ok;
  }
  const route = sim.path(goal);
  if (!route?.length) return sim.wait(300).ok; // a creature is in the way: let it come
  sim.face(route[0]);
  return sim.forward().ok || sim.wait(200).ok;
}
