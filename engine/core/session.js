// A game session: the rules of one playthrough, without a screen. The hero, the pack, the world and its creatures, where
// the player stands, the fights, containers and piles, flags and saving all live here; game.js draws it and turns
// input into calls, and the simulation (engine/sim/) drives the same calls from a bot. No DOM: time comes from
// `clock()` and chance from `random()`, so a session given a seeded random and a virtual clock replays exactly.
//
//   createSession({ levels, start, books, ... , random, clock, hooks })
//
// `levels` are level definitions (levels.js), `books` the merged content (content/catalog.js). `hooks` is how a front
// end takes part, every one optional:
//
//   travel(exit, { respawn })   async; take the player to `exit.to` (game.js loads the level's art first, then calls
//                               enter()). Default: enter() at once.
//   ensureArt(levelId)          async; something was spawned on a level: load its art before it shows.
//   openContainer(box)          a container or pile was opened: { title, text, stacks }
//   canTarget(monster)          may the player point at this creature? (game.js: is it drawn?). Default: it stands on
//                               the player's tile or the one they face.
//
// Everything that happens is also an event (on(type, fn), or on('*', fn)): see EVENTS below. Each event is
// { type, t, level, ...details }, plain data.
import { createExploration, createExplorationStore } from './exploration.js';
import { createMonsters } from '../rules/monsters.js';
import { interact as interactWith } from '../rules/interaction.js';
import { createWorld, flat } from './world.js';
import { itemUse } from '../rules/behaviours.js';
import { createEquipment } from '../rules/equipment.js';
import { createCharacter, strike, createCooldown, compareStats, statDelta, FISTS } from '../rules/combat.js';
import { createInventory, addToStacks, checkItems, stacksPersistence, takeStack, takeAll } from '../rules/inventory.js';
import { resolveContents } from '../rules/loot.js';
import { createPersistence } from './persistence.js';
import { createFlags } from './flags.js';

export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
export const DIR_KEYS = 'NESW';
// Movement commands and the direction they go in, relative to the facing.
export const MOVES = { forward: 0, strafeRight: 1, back: 2, strafeLeft: 3 };

// What a session tells its listeners. `t` is clock() when it happened, `level` the level the player is on.
export const EVENTS = {
  message: '{ text }: anything said to the player',
  move: '{ cmd, x, z, dir }: the player stepped or turned',
  blocked: '{ cmd, reason }: a step did not happen (wall, creature, door)',
  attack: '{ target, hit, damage }: the hero swung at a creature (target: { id, kind, name })',
  'damage-dealt': '{ target, amount, hp }: the hero hurt a creature',
  kill: '{ target }: the hero killed a creature',
  'damage-taken': '{ source, amount, hp }: a creature hurt the hero (source: { id, kind, name })',
  evade: '{ source }: a creature missed the hero',
  death: '{ source }: the hero died',
  respawn: '{ to }: the hero woke at the respawn point',
  container: '{ title, stacks }: a container or pile was opened',
  pickup: '{ item, qty, from }: items went into the pack (from a container or pile)',
  drop: '{ item, qty }: items left the pack for the floor',
  use: '{ item, consumed, message }: an item was used from the pack',
  equip: '{ item, slot, changes }: changes are words (rules/combat.js compareStats)', unequip: '{ item, slot, changes }',
  level: '{ from, to }: the player is on another level',
};

const describe = monster => ({ id: monster.id, kind: monster.kind, name: monster.name });

// Props and NPCs stand against a side of their tile; seen from a player facing `dir`, a side is the far, right, near or
// left side of the tile.
const ANCHOR_BY_TURN = ['far', 'right', 'near', 'left'];
export const anchorOf = (side, dir) => ANCHOR_BY_TURN[(DIR_KEYS.indexOf(side) - dir + 4) % 4];

// A level's cells, as movement, the renderer, the map and the creatures see them: { wall, door? } | { entities?, door? }
// | {} | null. The map is fixed; what stands on it comes from the world, so doors and spawned things count at once.
export function cellLookup(world, id, { level, tileTypes }) {
  const rows = level.tiles;
  return (x, z) => {
    if (z < 0 || z >= rows.length || x < 0 || x >= rows[0].length) return null;
    const t = tileTypes[rows[z][x]];
    if (!t) return null;
    if (t.wall) return { wall: t.art };
    const things = world.at(id, x, z);
    const door = things.find(i => i.category === 'door') ?? null;
    if (door && !(door.isOpen?.() ?? door.state.open)) return { wall: door.art, door };
    const entities = things.filter(i => i.category === 'prop' || i.category === 'npc');
    return entities.length ? { entities, door } : door ? { door } : {};
  };
}

export function createSession({ levels: definitions, start, books, startingItems = [], respawn = { level: start },
  inventorySize = 48, heroAttributes = { strength: 6, vitality: 6, intellect: 4, agility: 5 }, unarmed = FISTS,
  creation = null, persist = [], level: firstLevel = start, random = () => Math.random(), clock = () => performance.now(),
  hooks = {} }) {
  const itemDefs = books.items;
  if (!Object.hasOwn(definitions, start)) throw new Error(`The start level "${start}" is not one of the levels`);
  if (!Object.hasOwn(definitions, respawn.level)) throw new Error(`The respawn level "${respawn.level}" is not one of the levels`);
  if (!Object.hasOwn(definitions, firstLevel)) throw new Error(`Unknown level: ${firstLevel}`);
  for (const def of Object.values(itemDefs)) { const use = itemUse(def); if (use) def.use = use; } // data { hp, mp } -> restore()
  checkItems(itemDefs);

  const listeners = new Map();
  const emit = (type, details = {}) => {
    const event = { type, t: clock(), level: session.levelId, ...details };
    for (const fn of [...(listeners.get(type) ?? []), ...(listeners.get('*') ?? [])]) fn(event);
  };
  const messages = []; // every message said, kept for the journal's message log
  function say(text) {
    messages.push(text);
    if (messages.length > 100) messages.shift();
    emit('message', { text });
  }

  // Every placed and spawned thing, as instances with saved state (world.js). Levels are created when first needed.
  const world = createWorld({ levels: definitions, books });
  const explorations = createExplorationStore();
  // A level as the rules see it: its map lookup, what has been explored and its creatures. Made once per level.
  const contexts = new Map();
  function context(id) {
    if (!Object.hasOwn(definitions, id)) throw new Error(`Unknown level: ${id}`);
    if (!contexts.has(id)) {
      const def = definitions[id];
      world.level(id);
      const cell = cellLookup(world, id, def);
      const exploration = createExploration(def.level, cell);
      explorations.attach(id, exploration);
      const monsters = createMonsters(def.level, cell, random, { list: () => world.all(id, 'monster'), move: world.move });
      contexts.set(id, { ...def, id, cell, exploration, monsters });
    }
    return contexts.get(id);
  }

  const inventory = createInventory(itemDefs, { size: inventorySize, start: startingItems });
  const equipment = createEquipment(itemDefs);
  const hero = createCharacter(heroAttributes, equipment, { unarmed, name: creation?.name });
  if (creation) { hero.build(creation.spent); hero.restore(); }
  const containers = new Map(); // `level:x,z,side` -> stacks of opened containers (rolled the first time they are opened)
  const piles = new Map(); // `level:x,z` -> stacks the player dropped
  const flags = createFlags(); // the game's own facts (dialogue, quests): saved with the game
  const swing = createCooldown(hero.attackMs);
  const p = { x: 0, z: 0, dir: 0, steps: 0 };
  let active = context(firstLevel), dead = false, openBox = null, monsterDue = 0;
  Object.assign(p, active.level.start);

  // A container is named in saves by its `id` (stable when the level is edited), or else by where it stands.
  const containerKey = entity => `${session.levelId}:${entity.id ?? `${entity.x},${entity.z},${entity.side}`}`;
  const pileKey = () => `${session.levelId}:${p.x},${p.z}`;
  function showBox(box) { openBox = box; emit('container', { title: box.title, stacks: box.stacks.map(s => ({ ...s })) }); hooks.openContainer?.(box); }
  function openContainer(entity, behavior = {}) {
    const key = containerKey(entity);
    if (!containers.has(key)) containers.set(key, resolveContents(behavior, (list, id, qty) => addToStacks(itemDefs, list, id, qty), random));
    showBox({ title: behavior.title ?? entity.name ?? 'Container', text: behavior.text, stacks: containers.get(key), from: entity.id ?? entity.name ?? 'container' });
  }
  function openPile() {
    const stacks = piles.get(pileKey());
    if (!stacks?.length) return false;
    showBox({ title: 'On the floor', text: 'Things lie here where they were dropped.', stacks, from: 'floor' });
    return true;
  }

  // The cell `d` ahead and `l` to the right of the player, with its props placed relative to the player's facing.
  function relCell(l, d, at = p) {
    const [fx, fz] = DIRS[at.dir], [rx, rz] = DIRS[(at.dir + 1) % 4];
    const x = at.x + fx * d + rx * l, z = at.z + fz * d + rz * l, c = active.cell(x, z);
    if (!c || c.wall) return c;
    return {
      x, z,
      props: (c.entities ?? []).map(e => ({ ...flat(e), type: e.prop, anchor: anchorOf(e.side, at.dir), entity: e })),
      monsters: active.monsters.at(x, z),
    };
  }
  const exitAhead = () => active.level.exits?.find(exit => exit.x === p.x && exit.z === p.z && exit.dir === p.dir) ?? null;
  const liveMonster = inst => inst.category === 'monster' && !inst.state.dead;
  const alive = actor => actor.hp > 0 && !actor.dyingUntil;
  const ahead = () => { const [dx, dz] = DIRS[p.dir]; return { x: p.x + dx, z: p.z + dz }; };

  // Say what the player is looking at: a passage ahead, a pile here, whatever stands against the far side of this
  // tile, or against the near or far side of the tile ahead.
  function look() {
    const exit = exitAhead();
    if (exit?.message) { say(exit.message); return; }
    if (piles.get(pileKey())?.length) say('Something lies on the floor here.');
    for (const d of [0, 1]) for (const pr of relCell(0, d)?.props ?? []) {
      const name = pr.entity.name;
      if (!name) continue;
      if (d === 0 && pr.anchor === 'far') say(`You stand before ${name}.`);
      if (d === 1 && (pr.anchor === 'far' || pr.anchor === 'near')) say(`You see ${name}.`);
    }
  }

  // The state a command would lead to, or null when a wall or a creature is in the way.
  function plan(cmd) {
    if (cmd === 'left' || cmd === 'right') return { ...p, dir: (p.dir + (cmd === 'left' ? 3 : 1)) % 4 };
    if (!(cmd in MOVES)) throw new Error(`unknown move "${cmd}"`);
    const [dx, dz] = DIRS[(p.dir + MOVES[cmd]) % 4];
    const c = active.cell(p.x + dx, p.z + dz);
    if (!c || c.wall || active.monsters.occupied(p.x + dx, p.z + dz)) return null;
    return { ...p, x: p.x + dx, z: p.z + dz, steps: p.steps + 1 };
  }

  // A step or turn. `before()` runs once the player has moved, before anything is said. Returns { moved: true } | { exit } (stepping forward into a passage: the caller travels) |
  // { blocked: reason }. Says what blocks the way, and what the player now sees.
  function move(cmd, { before } = {}) {
    const exit = cmd === 'forward' && exitAhead();
    if (exit) return { exit };
    const st = plan(cmd);
    if (!st) {
      const [dx, dz] = DIRS[(p.dir + MOVES[cmd]) % 4];
      const door = active.cell(p.x + dx, p.z + dz)?.door;
      const reason = active.monsters.occupied(p.x + dx, p.z + dz) ? 'creature' : door ? (door.state.locked ? 'locked' : 'door') : 'wall';
      say({ creature: 'A creature blocks your way.', locked: 'The door is locked.', door: 'The door is shut.', wall: 'You bump into a wall.' }[reason]);
      emit('blocked', { cmd, reason });
      return { blocked: reason };
    }
    Object.assign(p, st);
    openBox = null;
    active.exploration.reveal(p);
    before?.(); // game.js shows the new picture before anything is said about it
    emit('move', { cmd, x: p.x, z: p.z, dir: p.dir });
    look();
    return { moved: true };
  }

  // Use what is in front of the player (rules/interaction.js).
  function interact() {
    const [dx, dz] = DIRS[p.dir];
    interactWith(relCell, { say, game: api, exit: exitAhead(), door: active.cell(p.x + dx, p.z + dz)?.door ?? null, pile: openPile });
  }

  // Using an item from the pack: its definition's use(game, stack) (see rules/behaviours.js). It returns
  // { consumed, message }: a consumed item is used up, the message is shown in the satchel.
  function useItem(index) {
    const stack = inventory.slots[index], def = stack && itemDefs[stack.id];
    if (!def?.use) return { message: 'Nothing happens.' };
    const result = def.use.call(def, api, stack) ?? {};
    if (result.consumed && inventory.slots[index]?.id === stack.id) inventory.remove(index, 1);
    emit('use', { item: stack.id, consumed: !!result.consumed, message: result.message ?? '' });
    return { message: result.message ?? '', consumed: !!result.consumed };
  }
  // Drink the first potion in the pack that restores `kind` ('hp' or 'mp'), without opening the satchel.
  function quickUse(kind) {
    const index = inventory.slots.findIndex(stack => stack && itemDefs[stack.id].use?.restores?.[kind]);
    if (index < 0) { say(`You have no ${kind === 'hp' ? 'health' : 'mana'} potion.`); return null; }
    return useItem(index);
  }
  function drop(index, qty) {
    const gone = inventory.remove(index, qty);
    if (!gone) return null;
    const pile = piles.get(pileKey()) ?? [];
    piles.set(pileKey(), pile);
    addToStacks(itemDefs, pile, gone.id, gone.qty);
    emit('drop', { item: gone.id, qty: gone.qty });
    return gone;
  }
  // From the open container (or pile) into the pack: one stack, or everything that fits.
  function take(index) {
    if (!openBox) return 0;
    const stack = openBox.stacks[index];
    if (!stack) return 0;
    const id = stack.id, n = takeStack(inventory, openBox.stacks, index);
    if (n) emit('pickup', { item: id, qty: n, from: openBox.from });
    return n;
  }
  function takeEverything() {
    if (!openBox) return [];
    const taken = takeAll(inventory, openBox.stacks);
    for (const { id, qty } of taken) emit('pickup', { item: id, qty, from: openBox.from });
    return taken;
  }
  // Wearing and taking off. The message says what that changes in a fight: "You equip the iron mace: damage 7–11
  // blade → 9–13 blunt, slower." `changes` is the same as a list.
  function withChanges(before, result) {
    if (!result.ok) return result;
    const changes = compareStats(before, hero.stats(), books.damageTypes);
    return changes.length ? { ...result, changes, message: `${result.message.replace(/\.$/, '')}: ${changes.join(', ')}.` } : { ...result, changes };
  }
  function equip(index, slot = null) {
    const id = inventory.slots[index]?.id, before = hero.stats(), result = withChanges(before, equipment.equip(inventory, index, slot));
    if (result.ok) emit('equip', { item: id, slot: result.slot, changes: result.changes });
    return result;
  }
  function unequip(slot, toIndex = null) {
    const id = equipment.worn[slot], before = hero.stats(), result = withChanges(before, equipment.unequip(inventory, slot, toIndex));
    if (result.ok) emit('unequip', { item: id, slot, changes: result.changes });
    return result;
  }
  // What wearing a pack item would change, in short words (statDelta, for the satchel), or null for an item not worn.
  function wouldChange(itemId) {
    if (!itemDefs[itemId]?.slot || !equipment.targetFor(itemId)) return null;
    return statDelta(hero.stats(), hero.statsWith(equipment.gear(equipment.preview(itemId))), books.damageTypes);
  }

  // Fighting. The hero swings at a creature (`targetId`, or the one on the tile they face or share), then waits out a
  // cooldown. Returns { ok: false, reason } when no blow was struck ('dead', 'gone', 'far', 'empty'), { waiting } while
  // the cooldown runs, or { ok: true, target, hit, damage, killed }.
  function attack(targetId = null) {
    if (dead) return { ok: false, reason: 'dead' };
    const now = clock(), { x: ax, z: az } = ahead();
    const target = targetId ? active.monsters.actors.find(a => a.id === targetId && alive(a))
      : active.monsters.adjacent(p).find(a => (a.x === p.x && a.z === p.z) || (a.x === ax && a.z === az));
    if (targetId && (!target || !(hooks.canTarget ?? defaultCanTarget)(target))) return { ok: false, reason: 'gone' };
    if (targetId && Math.abs(target.x - p.x) + Math.abs(target.z - p.z) > 1) { say('Step closer to attack.'); return { ok: false, reason: 'far' }; }
    if (!swing.ready(now)) return { ok: true, waiting: true, target };
    swing.use(now, hero.attackMs); // the weapon sets the pace
    if (!target) { say('You swing at the empty air.'); return { ok: false, reason: 'empty' }; }
    active.monsters.face(target, p);
    const result = strike(hero, target, random);
    emit('attack', { target: describe(target), hit: result.hit, damage: result.damage });
    let killed = false;
    if (!result.hit) say(`You miss the ${target.name}.`);
    else {
      say(`You hit the ${target.name} for ${result.damage}.${resistance(target, result.resisted)}`);
      killed = active.monsters.damage(target, result.damage, now);
      emit('damage-dealt', { target: describe(target), amount: result.damage, hp: target.hp });
      if (killed) { say(`The ${target.name} dies.`); emit('kill', { target: describe(target) }); target.onDeath?.(api); }
    }
    return { ok: true, target, hit: result.hit, damage: result.damage, killed };
  }
  // A few words when a creature shrugs off or is weak to the hero's damage type.
  const resistance = (target, resisted) => {
    const type = books.damageTypes[hero.damageType]?.name ?? hero.damageType;
    return resisted < 1 ? ` It resists ${type}.` : resisted > 1 ? ` It is weak to ${type}.` : '';
  };
  const defaultCanTarget = target => (target.x === p.x && target.z === p.z) || (target.x === ahead().x && target.z === ahead().z);

  // A creature's blow. Returns { hit, damage }.
  function struckBy(actor) {
    const result = strike(actor, hero, random);
    if (!result.hit) { say(`The ${actor.name} misses you.`); emit('evade', { source: describe(actor) }); return result; }
    hero.hp = Math.max(0, hero.hp - result.damage);
    say(`The ${actor.name} ${actor.verb ?? 'hits'} you for ${result.damage}.`);
    emit('damage-taken', { source: describe(actor), amount: result.damage, hp: hero.hp });
    if (hero.hp <= 0 && !dead) { dead = true; swing.reset(); emit('death', { source: describe(actor) }); }
    return result;
  }

  // The creatures' turn: run it every frame (or every simulated tick). `paused` (a menu is open, the page is hidden,
  // a level is loading, the hero is dead) holds every wind-up. Returns { changed, struck, gone }: whether anything
  // a renderer shows changed, the blows that landed or missed, and the corpses taken away.
  let drawnVersion = world.version;
  function update(now = clock(), { paused = false } = {}) {
    const monsters = active.monsters, struck = [];
    if (paused || dead) { monsterDue = now + monsters.stepMs; monsters.freeze(now); return { changed: false, struck, gone: [] }; }
    monsters.resume(now);
    const gone = monsters.reap(now);
    for (const actor of gone) if (actor.spawned) world.remove(actor); // a spawned creature that died is gone for good
    let changed = gone.length > 0 || world.version !== drawnVersion;
    drawnVersion = world.version;
    if (monsters.actors.length && now >= monsterDue) {
      monsterDue = now + monsters.stepMs;
      const version = monsters.version;
      monsters.step(p, now);
      changed ||= version !== monsters.version;
    }
    if (monsters.actors.length && now >= monsterDue - monsters.stepMs) {
      const version = monsters.version;
      for (const actor of monsters.engage(p, now)) { if (dead) break; struck.push({ actor, ...struckBy(actor) }); }
      changed ||= version !== monsters.version;
    }
    changed = monsters.updateAnimations(now) || changed;
    return { changed, struck, gone };
  }
  // Give the player a moment before the creatures move (arriving on a level, coming back to the page).
  const delayMonsters = (ms = active.monsters.graceMs, now = clock()) => { monsterDue = now + ms; };

  // Put the player on level `id` at `spawn`. Called by the travel hook once the level is ready. `respawn` (waking after
  // death) brings every level's living creatures back whole and heals the hero.
  function enter(id, spawn = null, { respawn: waking = false } = {}) {
    const destination = context(id);
    spawn ??= destination.level.start;
    const landing = destination.cell(spawn.x, spawn.z);
    if (!landing || landing.wall) throw new Error('The destination has no safe landing.');
    const from = session.levelId;
    active.level.onExit?.(api);
    active = destination; openBox = null;
    if (waking) { for (const c of contexts.values()) c.monsters.reset(); hero.restore(); }
    else active.monsters.reset();
    delayMonsters();
    Object.assign(p, spawn, { steps: 0 });
    active.exploration.reveal(p);
    emit('level', { from, to: id });
    say(`You enter ${active.level.shortName ?? active.level.name}.`); look();
    active.level.onEnter?.(api);
  }
  const travel = (exit, options = {}) => (hooks.travel ? hooks.travel(exit, options) : (enter(exit.to, exit.spawn, options), Promise.resolve(true)));

  // Back to the respawn point after death (by default the start of the first level), healed; the creatures start over.
  // Returns whether it worked: at once without a travel hook, else as a promise.
  function revive() {
    const exit = { to: respawn.level, spawn: respawn.spawn ?? definitions[respawn.level].level.start };
    const woke = ok => {
      if (!ok) return false;
      dead = false; swing.reset();
      emit('respawn', { to: respawn.level });
      say(respawn.message ?? 'You awaken, safe once more.');
      return true;
    };
    if (!hooks.travel) { enter(exit.to, exit.spawn, { respawn: true }); return woke(true); }
    return hooks.travel(exit, { respawn: true }).then(woke);
  }

  // The game API: what content methods get as `game` (see rules/behaviours.js and docs/engine/behaviour.md). Instances
  // are found by level and key; spawn and respawn resolve once the thing's art is loaded, if its level is being played.
  async function arrive(inst) {
    world.changed();
    if (contexts.has(inst.level)) await hooks.ensureArt?.(inst.level);
    if (inst.level === session.levelId && liveMonster(inst)) active.monsters.add(inst);
    world.changed();
  }
  const api = {
    say, flags, hero, inventory, equipment, items: itemDefs, random,
    get level() { return session.levelId; },
    get player() { return { x: p.x, z: p.z, dir: p.dir }; },
    find: (level, key) => world.find(level, key),
    all: (level = session.levelId, category) => world.all(level, category),
    at: (level, x, z) => world.at(level, x, z),
    async spawn(kind, at) { const inst = world.spawn(kind, { level: session.levelId, ...at }); await arrive(inst); return inst; },
    remove(inst) {
      if (inst.category === 'monster' && inst.level === session.levelId) active.monsters.drop(inst);
      return world.remove(inst);
    },
    async respawn(inst, key) { const it = world.respawn(inst, key); if (it) await arrive(it); return it; },
    openContainer: (entity, spec) => openContainer(entity, spec),
    changed: () => world.changed(),
    isHere: inst => inst.level === session.levelId,
    // Is the player or a living creature on this instance's tile (a door must not shut on them)?
    blocked: inst => (inst.level === session.levelId && p.x === inst.x && p.z === inst.z) || world.at(inst.level, inst.x, inst.z).some(liveMonster),
    travel: (to, spawn) => travel({ to, spawn }),
  };

  // Saving. Every component that has state to keep registers a section with the persistence registry (persistence.js);
  // the game adds its own.
  const persistence = createPersistence();
  persistence.engine.register(world.persistence); // first: the player's level opens with its things already restored
  persistence.engine.register({
    id: 'player', // where the hero stands
    save: () => ({ levelId: session.levelId, x: p.x, z: p.z, dir: p.dir }),
    async load(at, ctx) {
      // Loading while playing may mean another level: go there first (the same way an exit does).
      if (at && at.levelId !== session.levelId && Object.hasOwn(definitions, at.levelId) && !(await travel({ to: at.levelId, spawn: { x: at.x, z: at.z, dir: at.dir } }))) throw new Error('the saved level could not be opened');
      const floor = at && at.levelId === session.levelId && active.cell(at.x, at.z);
      if (floor && !floor.wall && Number.isInteger(at.dir)) Object.assign(p, { x: at.x, z: at.z, dir: ((at.dir % 4) + 4) % 4 });
      else ctx.issue('the saved position is not on this level');
    },
  });
  for (const part of [inventory, equipment, hero, explorations]) persistence.engine.register(part.persistence);
  persistence.engine.register(stacksPersistence('containers', itemDefs, containers));
  persistence.engine.register(stacksPersistence('piles', itemDefs, piles));
  persistence.game.register(flags.persistence);
  for (const section of typeof persist === 'function' ? persist({ flags, hero, inventory, equipment, itemDefs, say }) : persist) persistence.game.register(section);

  // Put a save back: every component is restored, the creatures start over. `respawn` also heals the hero.
  // Returns { issues }.
  async function load(snapshot, { respawn: waking = false } = {}) {
    const result = await persistence.restore(snapshot);
    await hooks.ensureArt?.(session.levelId);
    for (const c of contexts.values()) c.monsters.reset();
    if (waking) hero.restore();
    dead = false; openBox = null; swing.reset(); delayMonsters();
    return result;
  }

  // A new game, or a loaded one, starts: instances made so far get their onCreate, the level its onEnter.
  function begin({ welcome = true, loaded = false } = {}) {
    if (welcome) say(loaded ? `Welcome back, ${hero.name}.` : `Welcome to ${active.level.name}, ${hero.name}.`);
    world.setApi(api);
    active.exploration.reveal(p);
    active.level.onEnter?.(api);
    delayMonsters();
  }

  const session = {
    books, itemDefs, definitions, world, hero, inventory, equipment, flags, persistence, containers, piles, messages, api,
    random, clock, swing, player: p,
    get levelId() { return active.id; },
    get context() { return active; },
    get level() { return active.level; },
    get monsters() { return active.monsters; },
    get dead() { return dead; },
    get openBox() { return openBox; },
    closeBox() { openBox = null; },
    contextOf: context,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit, say, look, relCell, plan, move, interact, useItem, quickUse, drop, take, takeAll: takeEverything, equip, unequip, wouldChange,
    attack, struckBy, update, delayMonsters, enter, travel, revive, load, begin, exitAhead, openContainer, openPile,
  };
  return session;
}
