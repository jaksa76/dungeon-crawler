// Grid simulation independent of rendering and wall-clock time. The game calls
// step() at the level's chosen interval; the monster only walks onto floor cells and never onto the player's tile:
// it stops beside the player and fights (engage). Stats are on the definition: hp, damage, defence, accuracy,
// evasion, attackMs (time between blows) and speed (steps per tick, 1 by default).
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const HURT_MS = 260, DEATH_MS = 700;
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
      const stats = { name: 'creature', hp: 10, damage: 3, defence: 0, accuracy: 4, evasion: 3, attackMs: 1500, speed: 1 };
      const actor = { w: .4, h: .9, dir: 0, ...stats, ...def, id: def.id ?? `monster-${i}`, target: null, mode: 'roaming', energy: 0, readyAt: null, hurtUntil: 0, dyingUntil: 0 };
      return Object.assign(actor, { maxHp: actor.hp, attack: actor.damage });
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
  const alive = actor => !actor.dyingUntil;
  const apart = (actor, player) => Math.abs(actor.x - player.x) + Math.abs(actor.z - player.z);
  function step(player) {
    for (const actor of actors) {
      if (!alive(actor)) continue;
      actor.energy += actor.speed;
      if (actor.energy < 1) continue;
      actor.energy -= 1;
      if (sees(actor, player)) actor.target = { x: player.x, z: player.z };
      else if (actor.target?.x === actor.x && actor.target?.z === actor.z) actor.target = null;
      let direction = actor.target ? toward(actor, actor.target) : null;
      actor.mode = direction === null ? 'roaming' : 'hunting';
      const free = d => { const nx = actor.x + DIRS[d][0], nz = actor.z + DIRS[d][1]; return open(nx, nz) && !(nx === player.x && nz === player.z); };
      if (direction !== null && !free(direction)) continue; // beside the player: hold and fight
      if (direction === null) {
        const options = DIRS.map((_, d) => free(d) ? d : -1).filter(d => d >= 0);
        const forward = options.filter(d => d !== (actor.dir + 2) % 4);
        const choices = forward.length ? forward : options;
        if (!choices.length) continue;
        direction = choices.includes(actor.dir) && random() < .65 ? actor.dir : choices[Math.floor(random() * choices.length)];
      }
      const [dx, dz] = DIRS[direction];
      actor.x += dx; actor.z += dz; actor.dir = direction; version++;
    }
  }
  // Is a living creature on this tile? The player cannot walk into it.
  const occupied = (x, z) => actors.some(actor => alive(actor) && actor.x === x && actor.z === z);
  // The living creature beside the player (or, for the player's own swing, on the tile they face), if any.
  const adjacent = player => actors.filter(actor => alive(actor) && apart(actor, player) <= 1);
  // Who strikes now. A creature that has just come into reach winds up for 60% of its attack time first;
  // after each blow it waits attackMs. Out of reach, it forgets its wind-up. Returns the actors that strike.
  function engage(player, now) {
    const strikes = [];
    for (const actor of actors) {
      if (!alive(actor) || apart(actor, player) > 1) { actor.readyAt = null; continue; }
      if (actor.readyAt === null) actor.readyAt = now + Math.round(actor.attackMs * .6);
      else if (now >= actor.readyAt) { strikes.push(actor); actor.readyAt = now + actor.attackMs; }
    }
    return strikes;
  }
  // The fight is paused (a menu, loading): every wind-up starts over afterwards.
  const freeze = () => { for (const actor of actors) actor.readyAt = null; };
  // Hurt a creature. Returns true when it dies: it fades for DEATH_MS, then reap() removes it.
  function damage(actor, amount, now) {
    actor.hp = Math.max(0, actor.hp - amount); version++;
    if (actor.hp > 0) { actor.hurtUntil = now + HURT_MS; return false; }
    actor.dyingUntil = now + DEATH_MS; actor.hurtUntil = 0; actor.readyAt = null; return true;
  }
  function reap(now) {
    const gone = actors.filter(actor => actor.dyingUntil && now >= actor.dyingUntil);
    for (const actor of gone) actors.splice(actors.indexOf(actor), 1);
    if (gone.length) version++;
    return gone;
  }
  // Something is still flashing or fading: the scene must be redrawn every frame.
  const animating = now => actors.some(actor => actor.dyingUntil || actor.hurtUntil > now);
  reset();
  return { actors, step, occupied, adjacent, engage, freeze, damage, reap, animating, reset, get version() { return version; },
    at: (x, z) => actors.filter(actor => actor.x === x && actor.z === z),
    stepMs: level.monsterStepMs ?? 1100, graceMs: level.monsterGraceMs ?? 3500 };
}
