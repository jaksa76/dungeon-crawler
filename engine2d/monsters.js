// Grid simulation independent of rendering and wall-clock time. The game calls
// step() at the level's chosen interval; the monster only walks onto floor cells.
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const actorDirection = (facing, viewer) => ['back', 'right', 'front', 'left'][(facing - viewer + 4) % 4];

export function createMonsters(level, cell, random = Math.random) {
  const definitions = level.monsters ?? [];
  const actors = [];
  let version = 0;
  const open = (x, z) => { const c = cell(x, z); return !!c && !c.wall; };
  function reset() {
    actors.splice(0, actors.length, ...definitions.map((def, i) => {
      if (!open(def.x, def.z)) throw new Error(`Monster ${def.id ?? i} must start on a floor tile.`);
      if (def.x === level.start.x && def.z === level.start.z) throw new Error('A monster cannot start on the player entrance.');
      return { w: .4, h: .9, dir: 0, ...def, id: def.id ?? `monster-${i}`, target: null, mode: 'roaming' };
    }));
    version++;
  }
  function sees(actor, player) {
    const dx = player.x - actor.x, dz = player.z - actor.z;
    if ((dx !== 0 && dz !== 0) || Math.abs(dx) + Math.abs(dz) > (actor.sight ?? 4)) return false;
    const sx = Math.sign(dx), sz = Math.sign(dz);
    for (let x = actor.x + sx, z = actor.z + sz; x !== player.x || z !== player.z; x += sx, z += sz) {
      if (!open(x, z)) return false;
    }
    return true;
  }
  function toward(actor, target) {
    const queue = [{ x: actor.x, z: actor.z, first: null }], seen = new Set();
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i], key = `${node.x},${node.z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (node.x === target.x && node.z === target.z) return node.first;
      for (let d = 0; d < 4; d++) {
        const [dx, dz] = DIRS[d], x = node.x + dx, z = node.z + dz;
        if (open(x, z)) queue.push({ x, z, first: node.first ?? d });
      }
    }
    return null;
  }
  const caught = player => actors.find(actor => actor.x === player.x && actor.z === player.z) ?? null;
  function step(player) {
    if (caught(player)) return caught(player);
    for (const actor of actors) {
      if (sees(actor, player)) actor.target = { x: player.x, z: player.z };
      else if (actor.target?.x === actor.x && actor.target?.z === actor.z) actor.target = null;
      let direction = actor.target ? toward(actor, actor.target) : null;
      actor.mode = direction === null ? 'roaming' : 'hunting';
      if (direction === null) {
        const options = DIRS.map(([dx, dz], d) => open(actor.x + dx, actor.z + dz) ? d : -1).filter(d => d >= 0);
        const forward = options.filter(d => d !== (actor.dir + 2) % 4);
        const choices = forward.length ? forward : options;
        if (!choices.length) continue;
        direction = choices.includes(actor.dir) && random() < .65 ? actor.dir : choices[Math.floor(random() * choices.length)];
      }
      const [dx, dz] = DIRS[direction];
      actor.x += dx; actor.z += dz; actor.dir = direction; version++;
      if (caught(player)) return caught(player);
    }
    return null;
  }
  reset();
  return { actors, step, caught, reset, get version() { return version; },
    at: (x, z) => actors.filter(actor => actor.x === x && actor.z === z),
    stepMs: level.monsterStepMs ?? 1100, graceMs: level.monsterGraceMs ?? 3500 };
}
