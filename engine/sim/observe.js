// What a bot can know, as plain data: the hero, the pack, what lies ahead, the creatures in sight, the explored map.
// A bot sees what a player sees: creatures on its own tile, beside it, or down the corridor it faces, as far as the
// view goes (`depth`). `observe(session, { omniscient: true })` lists every creature on the level instead, for tests
// and for designers who want to know what the bot could not.
import { DIRS, DIR_KEYS } from '../core/session.js';

export const VIEW_DEPTH = 3;
const alive = actor => actor.hp > 0 && !actor.dyingUntil;
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

function monsterView(session, actor) {
  const p = session.player;
  return { id: actor.id, kind: actor.kind, name: actor.name, x: actor.x, z: actor.z, dir: actor.dir, hp: actor.hp, maxHp: actor.maxHp,
    mode: actor.mode, distance: distance(actor, p), adjacent: distance(actor, p) <= 1 };
}

// The creatures the player can see: on their tile, next to it, or in the three columns ahead up to `depth`, stopping
// at the first wall straight ahead.
export function visibleMonsters(session, { depth = VIEW_DEPTH, omniscient = false } = {}) {
  const { monsters, player: p } = session, seen = new Set();
  const living = monsters.actors.filter(alive);
  if (omniscient) return living.map(a => monsterView(session, a));
  for (const a of living) if (distance(a, p) <= 1) seen.add(a);
  for (let d = 0; d <= depth; d++) {
    const centre = session.relCell(0, d);
    if (!centre || centre.wall) break;
    for (const l of [-1, 0, 1]) {
      const c = session.relCell(l, d);
      if (c && !c.wall) for (const a of c.monsters) if (alive(a)) seen.add(a);
    }
  }
  return [...seen].map(a => monsterView(session, a)).sort((a, b) => a.distance - b.distance);
}

// What lies straight ahead, tile by tile, up to `depth`: [{ d, x, z, wall?, door?, exit?, things, monsters }].
// d = 0 is the player's own tile.
export function viewAhead(session, depth = VIEW_DEPTH) {
  const out = [], p = session.player;
  for (let d = 0; d <= depth; d++) {
    const [fx, fz] = DIRS[p.dir], x = p.x + fx * d, z = p.z + fz * d, c = session.context.cell(x, z);
    if (!c) { out.push({ d, x, z, wall: true, edge: true }); break; }
    const door = c.door ? { id: c.door.id ?? c.door.ref, name: c.door.name, open: !c.wall, locked: !!c.door.state.locked } : undefined;
    if (c.wall) { out.push({ d, x, z, wall: true, ...(door ? { door } : {}) }); break; }
    const rel = session.relCell(0, d);
    const exit = d === 0 ? session.exitAhead() : null;
    out.push({ d, x, z, ...(door ? { door } : {}), ...(exit ? { exit: { to: exit.to } } : {}),
      things: rel.props.map(pr => ({ id: pr.entity.id ?? pr.entity.ref, kind: pr.entity.prop, name: pr.entity.name ?? null, side: pr.entity.side, anchor: pr.anchor })),
      monsters: rel.monsters.filter(alive).map(a => a.id) });
  }
  return out;
}

// The level as far as the player has explored it: rows of characters, '#' wall, '.' floor, '+' a shut door, ' ' not
// known yet. `known(x, z)` and `open(x, z)` answer for one tile.
export function knownMap(session) {
  const { context } = session, tiles = context.level.tiles, known = (x, z) => context.exploration.isKnown(x, z);
  const rows = tiles.map((row, z) => [...row].map((_, x) => {
    if (!known(x, z)) return ' ';
    const c = context.cell(x, z);
    return !c ? ' ' : c.door && c.wall ? '+' : c.wall ? '#' : '.';
  }).join(''));
  const open = (x, z) => { const c = context.cell(x, z); return !!c && !c.wall; };
  return { width: tiles[0].length, height: tiles.length, rows, known, open, explored: context.exploration.known.size };
}

// The shortest walk to `to` ({ x, z }), as directions (0 N, 1 E, 2 S, 3 W) one tile each, or null. `known` (default)
// walks only explored floor, though the goal itself may be unexplored; living creatures block the way unless they
// stand on the goal.
export function findPath(session, to, { known = true } = {}) {
  const { context, player: p } = session;
  const isGoal = (x, z) => x === to.x && z === to.z;
  const passable = (x, z) => {
    const c = context.cell(x, z);
    if (!c || c.wall) return false;
    if (isGoal(x, z)) return true;
    if (known && !context.exploration.isKnown(x, z)) return false;
    return !context.monsters.occupied(x, z);
  };
  const from = new Map([[`${p.x},${p.z}`, null]]), queue = [[p.x, p.z]];
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i];
    if (isGoal(x, z)) {
      const route = [];
      for (let key = `${x},${z}`; from.get(key); key = from.get(key).prev) route.unshift(from.get(key).dir);
      return route;
    }
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0], nz = z + DIRS[d][1], key = `${nx},${nz}`;
      if (from.has(key) || !passable(nx, nz)) continue;
      from.set(key, { prev: `${x},${z}`, dir: d });
      queue.push([nx, nz]);
    }
  }
  return null;
}

// Everything at once: what a bot reads each turn.
export function observe(session, { omniscient = false, depth = VIEW_DEPTH } = {}) {
  const { hero, inventory, equipment, player: p, itemDefs } = session;
  return {
    t: session.clock(), level: session.levelId, levelName: session.level.shortName ?? session.level.name,
    position: { x: p.x, z: p.z, dir: p.dir, facing: DIR_KEYS[p.dir] },
    dead: session.dead,
    hero: { name: hero.name, level: hero.level, xp: hero.xp, unspent: hero.unspent, luck: hero.luck, hp: hero.hp, maxHp: hero.maxHp, mp: hero.mp, maxMp: hero.maxMp, attack: hero.attack, defence: hero.defence,
      accuracy: hero.accuracy, evasion: hero.evasion, attrs: { ...hero.attrs }, attackReady: session.swing.ready(session.clock()) },
    inventory: inventory.slots.map((s, slot) => s && { slot, id: s.id, qty: s.qty, name: itemDefs[s.id].name, type: itemDefs[s.id].type,
      ...(itemDefs[s.id].use?.restores ? { restores: { ...itemDefs[s.id].use.restores } } : {}), ...(itemDefs[s.id].slot ? { wear: itemDefs[s.id].slot } : {}) }).filter(Boolean),
    equipment: { ...equipment.worn },
    monsters: visibleMonsters(session, { depth, omniscient }),
    ahead: viewAhead(session, depth),
    // Things standing against the sides of the player's own tile (turn to a side to face one, then interact).
    here: session.context.cell(p.x, p.z)?.entities?.map(e => ({ id: e.id ?? e.ref, kind: e.prop, name: e.name ?? null, side: e.side, dir: DIR_KEYS.indexOf(e.side) })) ?? [],
    // Something lies on the floor of the hero's own tile (a creature left it, or the hero dropped it): interact() opens it.
    pile: !!session.piles.get(`${session.levelId}:${p.x},${p.z}`)?.length,
    container: session.openBox ? { title: session.openBox.title, stacks: session.openBox.stacks.map(s => ({ ...s })) } : null,
    explored: session.context.exploration.known.size,
  };
}
