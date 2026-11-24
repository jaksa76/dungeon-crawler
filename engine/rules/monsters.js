// Grid simulation independent of rendering and wall-clock time. The game calls
// step() at the level's chosen interval; the monster only walks onto floor cells and never onto the player's tile:
// it stops beside the player and fights (engage). Stats are on the definition: hp, damage, defence, accuracy,
// evasion, attackMs (time between blows) and speed (steps per tick, 1 by default).
//
// The creatures are the level's monster instances (engine/core/world.js), worked on in place: `options.list()` gives
// them (default: level.monsters) and `options.move(actor, x, z)` moves one (default: just sets x and z), so the world
// keeps its tile index. A dead creature stays dead: its `state.dead` is set, which is saved, and reset() leaves it out.
// reset() brings the living ones back to their home tile at full health.
import { createMonsterAnimator, clipFor, durationOf } from '../render/monster-animation.js';

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const HURT_MS = 220, DEATH_MS = 1460;
export const actorDirection = (facing, viewer) => ['back', 'right', 'front', 'left'][(facing - viewer + 4) % 4];

export function createMonsters(level, cell, random = Math.random, { list = () => level.monsters ?? [], move = (actor, x, z) => { actor.x = x; actor.z = z; } } = {}) {
  const actors = [];
  let version = 0, lastNow = 0, animator = createMonsterAnimator();
  let signatures = new WeakMap();
  function resume(now) {
    lastNow = now;
    const delta = animator.resume(actors, now);
    if (delta) for (const actor of actors) {
      if (actor.hurtUntil) actor.hurtUntil += delta;
      if (actor.dyingUntil) actor.dyingUntil += delta;
    }
  }
  const open = (x, z) => { const c = cell(x, z); return !!c && !c.wall; };
  const DEFAULTS = { w: .4, h: .9, dir: 0, name: 'creature', hp: 10, damage: 3, defence: 0, accuracy: 4, evasion: 3, attackMs: 1500, speed: 1 };
  // Ready a creature to fight: at its home tile, whole, calm.
  function prepare(actor, i = actors.length) {
    for (const [key, value] of Object.entries(DEFAULTS)) if (actor[key] === undefined) actor[key] = value;
    actor.id ??= `monster-${i}`;
    actor.home ??= { x: actor.x, z: actor.z, dir: actor.dir };
    actor.maxHp ??= actor.hp;
    const { x, z, dir } = actor.home;
    if (!open(x, z)) throw new Error(`Monster ${actor.id} must start on a floor tile.`);
    if (x === level.start.x && z === level.start.z) throw new Error('A monster cannot start on the player entrance.');
    if (actor.x !== x || actor.z !== z) move(actor, x, z);
    return Object.assign(actor, { dir, hp: actor.maxHp, attack: actor.damage, target: null, mode: 'roaming', energy: 0, readyAt: null, hurtUntil: 0, dyingUntil: 0 });
  }
  function reset() {
    animator = createMonsterAnimator(); signatures = new WeakMap();
    const living = list().filter(actor => !actor.state?.dead);
    actors.splice(0, actors.length, ...living.map((actor, i) => prepare(actor, i)));
    version++;
  }
  // A creature that came into being on this level while it is played (spawned, or brought back to life).
  function add(actor) { if (!actors.includes(actor)) { actors.push(prepare(actor)); version++; } }
  // A creature taken out of the world.
  function drop(actor) { const i = actors.indexOf(actor); if (i >= 0) { actors.splice(i, 1); version++; } }
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
  const alive = actor => actor.hp > 0 && !actor.dyingUntil;
  const apart = (actor, player) => Math.abs(actor.x - player.x) + Math.abs(actor.z - player.z);
  function step(player, now = lastNow) {
    resume(now);
    for (const actor of actors) {
      if (!alive(actor)) continue;
      const state = animator.sample(actor, now).state;
      if (state === 'attack' || state === 'hurt') continue;
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
      move(actor, actor.x + dx, actor.z + dz); actor.dir = direction; version++;
      animator.play(actor, 'move', now, { restart: true });
    }
  }
  // Is a living creature on this tile? The player cannot walk into it.
  const occupied = (x, z) => actors.some(actor => alive(actor) && actor.x === x && actor.z === z);
  // The living creature beside the player (or, for the player's own swing, on the tile they face), if any.
  const adjacent = player => actors.filter(actor => alive(actor) && apart(actor, player) <= 1);
  // Turn a creature beside the player toward them (it fights face to face, and turns when struck from behind).
  function face(actor, player) {
    const d = DIRS.findIndex(([dx, dz]) => actor.x + dx === player.x && actor.z + dz === player.z);
    if (d >= 0 && d !== actor.dir && alive(actor)) { actor.dir = d; version++; }
  }
  // Who strikes now. A creature that has just come into reach winds up for 60% of its attack time first;
  // after each blow it waits attackMs. Out of reach, it forgets its wind-up. Returns the actors that strike.
  function engage(player, now) {
    resume(now);
    const strikes = [];
    for (const actor of actors) {
      if (!alive(actor) || apart(actor, player) > 1) {
        actor.readyAt = null;
        if (animator.sample(actor, now).state === 'attack') animator.play(actor, 'idle', now, { force: true });
        continue;
      }
      face(actor, player); // fight face to face, even a creature that was walking away
      if (actor.readyAt === null) actor.readyAt = now + Math.round(actor.attackMs * .6);
      const attack = clipFor(actor, 'attack'), lead = (attack.impactFrame ?? 2) * attack.frameMs;
      if (now >= actor.readyAt - lead) animator.play(actor, 'attack', actor.readyAt - lead);
      if (now >= actor.readyAt) {
        animator.play(actor, 'attack', now - lead, { force: true });
        strikes.push(actor); actor.readyAt = now + actor.attackMs;
      }
    }
    return strikes;
  }
  // The fight is paused (a menu, loading): every wind-up starts over afterwards.
  const freeze = (now = lastNow) => {
    lastNow = now; animator.pause(now);
    for (const actor of actors) actor.readyAt = null;
  };
  // Hurt a creature. Returns true on death; its clip and corpse hold finish before reap() removes it.
  function damage(actor, amount, now) {
    resume(now);
    if (!alive(actor)) return false;
    actor.hp = Math.max(0, actor.hp - amount); version++;
    if (actor.hp > 0) {
      actor.hurtUntil = now + durationOf(actor, 'hurt'); animator.play(actor, 'hurt', now, { force: true }); return false;
    }
    actor.dyingUntil = now + durationOf(actor, 'dead'); actor.hurtUntil = 0; actor.readyAt = null;
    actor.state = { ...actor.state, dead: true }; // remembered, and saved: dead stays dead
    animator.play(actor, 'dead', now, { force: true }); return true;
  }
  function reap(now) {
    resume(now);
    const gone = actors.filter(actor => actor.dyingUntil && now >= actor.dyingUntil);
    for (const actor of gone) actors.splice(actors.indexOf(actor), 1);
    if (gone.length) version++;
    return gone;
  }
  // Legacy activity query; updateAnimations() also tracks idle clips and quantizes redraws.
  const animating = now => actors.some(actor => animator.sample(actor, now).state !== 'idle');
  function updateAnimations(now) {
    resume(now); let changed = false;
    for (const actor of actors) {
      const sample = animator.sample(actor, now), key = `${sample.state}:${sample.frame}:${Math.round(sample.opacity * 8)}`;
      if (signatures.get(actor) !== key) { signatures.set(actor, key); changed = true; }
    }
    if (changed) version++;
    return changed;
  }
  reset();
  return { actors, step, occupied, adjacent, engage, face, freeze, resume, damage, reap, animating, updateAnimations, reset, add, drop,
    animation: (actor, now = lastNow) => animator.sample(actor, now), get version() { return version; },
    at: (x, z) => actors.filter(actor => actor.x === x && actor.z === z),
    stepMs: level.monsterStepMs ?? 1100, graceMs: level.monsterGraceMs ?? 3500 };
}
