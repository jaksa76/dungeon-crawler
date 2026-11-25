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
//   passTravelTime(ms)          in a headless playthrough, advance the clock before entering.
//   ensureArt(levelId)          async; something was spawned on a level: load its art before it shows.
//   openContainer(box)          a container or pile was opened: { title, text, stacks }
//   openShop(shop)              a merchant was opened: { title, text, image, view(), buy(id), sell(index, id) }
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
import { createEffects, tierValue } from '../rules/effects.js';
import { spellDamage, spellHeal, spellRange, canLearn, isImmune, describeSpell } from '../rules/magic.js';
import { createEquipment } from '../rules/equipment.js';
import { createCharacter, strike, createCooldown, compareStats, statDelta, FISTS } from '../rules/combat.js';
import { createInventory, addToStacks, checkItems, stacksPersistence, takeStack, takeAll, canonicalId } from '../rules/inventory.js';
import { createWallet, merchantTrade } from '../rules/economy.js';
import { createQuickBar, QUICK_SLOTS } from '../rules/quickbar.js';
import { resolveContents } from '../rules/loot.js';
import { resolveLootRules, lootBudget, lootPool, generateLoot } from '../rules/generate-loot.js';
import { createPersistence } from './persistence.js';
import { createFlags } from './flags.js';
import { createWorldMap } from './world-map.js';
import { createTraps } from '../rules/traps.js';
import { createDialogue } from './dialogue.js';
import { createQuests } from './quests.js';

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
  kill: '{ target, xp }: the hero killed a creature (xp: what it was worth)',
  xp: '{ amount, xp, level }: the hero gained experience',
  learn: '{ spell }: the hero learned a spell',
  cast: '{ spell, targets, mana }: the hero cast a spell (targets: [{ id, kind, name }], none for a spell cast on oneself)',
  effect: '{ target, effect, tier, result }: a status effect was put on the hero (target: \'hero\') or a creature ({ id, kind, name }); result is new, stronger, renewed, weaker or immune',
  'effect-end': '{ target, effect }: a status effect wore off',
  'level-up': '{ level, points }: the hero reached a new level (health and mana are restored)',
  spend: '{ attribute, value, unspent }: a skill point went into an attribute',
  loot: '{ source, items, value, budget, at }: a creature left things behind (items: [{ item, qty }], on the floor where it fell)',
  'damage-taken': '{ source, amount, hp, effect? }: a creature hurt the hero (source: { id, kind, name }), or a status effect did (effect: its id)',
  evade: '{ source }: a creature missed the hero',
  death: '{ source }: the hero died',
  respawn: '{ to }: the hero woke at the respawn point',
  container: '{ title, stacks }: a container or pile was opened',
  door: '{ id, open }: a door opened or closed on this level',
  pickup: '{ item, qty, from }: items went into the pack or gold went into the purse (from a container or pile)',
  drop: '{ item, qty }: items left the pack for the floor',
  use: '{ item, consumed, message }: an item was used from the pack',
  quickbar: '{ slots }: the quick bar changed (slots: [null or { kind: "item" or "spell", id }])',
  equip: '{ item, slot, changes }: changes are words (rules/combat.js compareStats)', unequip: '{ item, slot, changes }',
  level: '{ from, to }: the player is on another level',
  ending: '{ title, text, image? }: the campaign chapter is complete',
  story: '{ title, pages }: a story moment was shown (game.showStory; pages: how many)',
};

const TARGET_RANGE = 3; // how far down the line ahead the hero picks out a creature without pointing at it (session.targeted)
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
  creation = null, persist = [], progression, loot: lootOptions, startingSpells = [], quickSlots = QUICK_SLOTS, level: firstLevel = start, random = () => Math.random(), clock = () => performance.now(),
  quests: questDefinitions = {}, worldMap, hooks = {} }) {
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
  const wallet = createWallet();
  const lootReceiver = { add: (id, qty) => itemDefs[id].currency ? qty - wallet.gain(qty) : inventory.add(id, qty) };
  const equipment = createEquipment(itemDefs);
  const heroFx = createEffects(books.effects); // the status effects on the hero (creatures carry their own, `fx`)
  const hero = createCharacter(heroAttributes, equipment, { unarmed, name: creation?.name, progression,
    modifiers: () => ({ ...heroFx.mods(), slow: heroFx.slow() }) });
  const known = new Set(startingSpells), spellReadyAt = new Map(); // the spells the hero knows, and when each may be cast again
  let readySpell = startingSpells[0] ?? null; // the spell a bare cast() uses
  const lootRules = resolveLootRules(lootOptions);
  if (creation) { hero.build(creation.spent); hero.restore(); }
  const containers = new Map(); // `level:x,z,side` -> stacks of opened containers (rolled the first time they are opened)
  const piles = new Map(); // `level:x,z` -> stacks the player dropped
  const map = createWorldMap(worldMap, definitions);
  const flags = createFlags((flag, value) => {
    map?.flag(flag, value);
    if (value !== undefined) runTriggers('flagSet', { flag, value });
  });
  const quests = createQuests(questDefinitions, () => api);
  const swing = createCooldown(hero.attackMs);
  const p = { x: 0, z: 0, dir: 0, steps: 0 };
  let active = context(firstLevel), dead = false, openBox = null, openShopView = null, monsterDue = 0;
  Object.assign(p, active.level.start);
  const traps = createTraps(definitions, { say, hurt: hurtHero });
  let restoring = false;

  function runTriggers(on, event) {
    if (restoring) return;
    const source = active;
    for (const trigger of source.level.triggers ?? []) {
      if (active !== source || dead) break;
      if (trigger.on !== on) continue;
      if (trigger.x !== undefined && trigger.x !== event.x || trigger.z !== undefined && trigger.z !== event.z) continue;
      if (trigger.side !== undefined && trigger.side !== event.side || trigger.flag !== undefined && trigger.flag !== event.flag) continue;
      if (!trigger.when || trigger.when(api, event)) trigger.effect(api, event);
    }
  }

  function lookTriggers(entered) {
    const source = active;
    const { x, z, dir } = p;
    if (entered) runTriggers('enterTile', { x, z });
    if (active === source && p.x === x && p.z === z && p.dir === dir) runTriggers('faceSide', { x, z, side: DIR_KEYS[dir] });
  }

  // A container is named in saves by its `id` (stable when the level is edited), or else by where it stands.
  const containerKey = entity => `${session.levelId}:${entity.id ?? `${entity.x},${entity.z},${entity.side}`}`;
  const pileKey = () => `${session.levelId}:${p.x},${p.z}`;
  function showBox(box) { openBox = box; openShopView = null; emit('container', { title: box.title, stacks: box.stacks.map(s => ({ ...s })) }); hooks.openContainer?.(box); }
  function openShop(entity) {
    if (typeof entity === 'string') entity = world.find(session.levelId, entity);
    if (dead || !entity?.merchant || entity.level !== session.levelId) return null;
    const trade = merchantTrade(entity, entity.merchant, inventory, itemDefs, wallet);
    const run = action => (...args) => {
      if (openShopView !== shop || dead || world.find(session.levelId, entity.ref) !== entity) return { ok: false, message: 'The merchant is no longer available.' };
      const result = action(...args);
      if (result.ok) say(result.message);
      return result;
    };
    const shop = { ...trade, buy: run(trade.buy), sell: run(trade.sell), close() { if (openShopView === shop) openShopView = null; } };
    openBox = null; openShopView = shop;
    hooks.openShop?.(shop);
    return shop;
  }
  function openContainer(entity, behavior = {}) {
    const key = containerKey(entity);
    if (!containers.has(key)) containers.set(key, resolveContents(behavior, (list, id, qty) => addToStacks(itemDefs, list, id, qty), random, spec => generated(spec, spec)));
    showBox({ title: behavior.title ?? entity.name ?? 'Container', text: behavior.text, stacks: containers.get(key), from: entity.id ?? entity.name ?? 'container' });
  }
  // Loot worked out from a value budget (rules/generate-loot.js): for the hero as they are now, on the level they are on.
  // `source` is a creature's stat block or a container's `generate`; `spec.chance` and `spec.filter` (item types) narrow it.
  function generated(source, spec = {}) {
    const budget = lootBudget(source, { rules: lootRules, lootScale: active.level.lootScale ?? 1, heroLevel: hero.level, luck: hero.luck, random });
    const types = spec.types, pool = lootPool(itemDefs, hero.level, types ? (id, def) => types.includes(def.type) : null);
    return Object.assign(generateLoot(budget, pool, { rules: lootRules, random, chance: spec.chance ?? (source === spec ? 1 : lootRules.dropChance) }), { budget });
  }
  // What a creature leaves where it fell: its own `loot` (specific: { contents, loot, generate }, or false for nothing), else
  // generated from its challenge rating. Goes on the floor of its tile as a pile.
  function leaveLoot(actor) {
    const spec = actor.loot;
    if (spec === false) return;
    const stacks = [];
    let budget = 0, generatedValue = 0;
    const worth = list => list.reduce((sum, { item, qty }) => sum + (itemDefs[item].value ?? 0) * qty, 0);
    if (spec && (spec.contents || spec.loot || spec.generate)) {
      const made = resolveContents(spec, (list, id, qty) => addToStacks(itemDefs, list, id, qty), random, g => { const found = generated(g, g); budget = found.budget; generatedValue = worth(found); return found; });
      stacks.push(...made);
    } else {
      const found = generated(actor, {});
      budget = found.budget;
      for (const { item, qty } of found) addToStacks(itemDefs, stacks, item, qty);
    }
    if (!stacks.length) return;
    const key = `${session.levelId}:${actor.x},${actor.z}`, pile = piles.get(key) ?? [];
    piles.set(key, pile);
    for (const { id, qty } of stacks) addToStacks(itemDefs, pile, id, qty);
    const items = stacks.map(({ id, qty }) => ({ item: id, qty })), value = worth(items);
    budget += value - generatedValue; // what the creature was given outright counts against nothing
    say(`The ${actor.name} leaves something behind.`);
    emit('loot', { source: describe(actor), items, value, budget: Math.round(budget), at: { x: actor.x, z: actor.z } });
  }
  // Experience for a kill: say it, and say it when it makes a level.
  function reward(actor) {
    const amount = actor.xp ?? 0;
    if (!amount) return;
    const gained = hero.gain(amount);
    say(`You gain ${amount} experience.`);
    emit('xp', { amount, xp: hero.xp, level: hero.level });
    if (gained.levels > 0) {
      say(`You reach level ${gained.level}! Your health and mana are restored${gained.points ? `, and you have ${hero.unspent} skill point${hero.unspent === 1 ? '' : 's'} to spend` : ''}.`);
      emit('level-up', { level: gained.level, points: hero.unspent });
    }
  }
  // Put a skill point into an attribute. Returns { ok, ... }.
  function spend(attribute) {
    if (!hero.spend(attribute)) return { ok: false, reason: hero.unspent <= 0 ? 'no-points' : 'unknown' };
    emit('spend', { attribute, value: hero.attrs[attribute], unspent: hero.unspent });
    return { ok: true, attribute, value: hero.attrs[attribute], unspent: hero.unspent };
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
      pile: !!piles.get(`${active.id}:${x},${z}`)?.length, // things on the floor here (what creatures left, what was dropped)
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
      const visibleDoor = door && (!door.hidden || door.state.revealed);
      const reason = active.monsters.occupied(p.x + dx, p.z + dz) ? 'creature' : visibleDoor ? (door.state.locked ? 'locked' : 'door') : 'wall';
      say({ creature: 'A creature blocks your way.', locked: 'The door is locked.', door: 'The door is shut.', wall: 'You bump into a wall.' }[reason]);
      emit('blocked', { cmd, reason });
      return { blocked: reason };
    }
    const entered = p.x !== st.x || p.z !== st.z;
    dialogue.close();
    Object.assign(p, st);
    openBox = null; openShopView = null;
    active.exploration.reveal(p);
    before?.(); // game.js shows the new picture before anything is said about it
    if (entered) traps.enter(active.id, p.x, p.z);
    emit('move', { cmd, x: p.x, z: p.z, dir: p.dir });
    look();
    lookTriggers(entered);
    return { moved: true };
  }

  // Use what is in front of the player (rules/interaction.js).
  function interact() {
    const [dx, dz] = DIRS[p.dir];
    const x = p.x + dx, z = p.z + dz;
    interactWith(relCell, { say, game: api, exit: exitAhead(), door: active.cell(x, z)?.door ?? null, pile: openPile,
      inspect: () => traps.inspect(active.id, x, z) || traps.inspect(active.id, p.x, p.z) });
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
    const id = stack.id, n = takeStack(lootReceiver, openBox.stacks, index);
    if (n) { emit('pickup', { item: id, qty: n, from: openBox.from }); quickFill({ kind: 'item', id }); }
    return n;
  }
  function takeEverything() {
    if (!openBox) return [];
    const taken = takeAll(lootReceiver, openBox.stacks);
    for (const { id, qty } of taken) { emit('pickup', { item: id, qty, from: openBox.from }); quickFill({ kind: 'item', id }); }
    return taken;
  }
  // Wearing and taking off. The message says what that changes in a fight: "You equip the iron mace: damage 7–11
  // blade → 9–13 blunt, slower." `changes` is the same as a list.
  function withChanges(before, result) {
    if (!result.ok) return result;
    const changes = compareStats(before, hero.stats(), books.damageTypes, books.effects);
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
    return statDelta(hero.stats(), hero.statsWith(equipment.gear(equipment.preview(itemId))), books.damageTypes, books.effects);
  }

  // Fighting. The hero swings at a creature (`targetId`, or the one on the tile they face or share), then waits out a
  // cooldown. Returns { ok: false, reason } when no blow was struck ('dead', 'gone', 'far', 'empty'), { waiting } while
  // the cooldown runs, or { ok: true, target, hit, damage, killed }.
  function attack(targetId = null) {
    if (dead) return { ok: false, reason: 'dead' };
    if (heroFx.stunned()) { say('You are stunned.'); return { ok: false, reason: 'stunned' }; }
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
    // An enchanted weapon adds damage of its own type, which the creature's resistance to that type scales.
    let extra = 0;
    const ele = hero.elemental;
    if (result.hit && ele) extra = Math.round((ele.damage[0] + Math.floor(random() * (ele.damage[1] - ele.damage[0] + 1))) * (target.resist?.[ele.type] ?? 1));
    const total = result.damage + extra;
    emit('attack', { target: describe(target), hit: result.hit, damage: total });
    let killed = false;
    if (!result.hit) say(`You miss the ${target.name}.`);
    else {
      say(`You hit the ${target.name} for ${total}.${extra ? ` (${extra} ${books.damageTypes[ele.type]?.name ?? ele.type})` : ''}${resistance(target, result.resisted)}`);
      killed = active.monsters.damage(target, total, now);
      emit('damage-dealt', { target: describe(target), amount: total, hp: target.hp });
      if (killed) slay(target);
      else if (hero.onHit && random() < (hero.onHit.chance ?? 1)) applyEffect(target, hero.onHit.effect, hero.onHit.tier ?? 1);
    }
    return { ok: true, target, hit: result.hit, damage: total, killed };
  }
  // A creature the hero killed: the experience, and what it leaves behind.
  function slay(target) {
    say(`The ${target.name} dies.`); emit('kill', { target: describe(target), xp: target.xp ?? 0 });
    reward(target); leaveLoot(target); target.onDeath?.(api);
  }

  // Status effects (rules/effects.js). `target` is 'hero' or a creature. Returns how it went: 'new', 'stronger', 'renewed',
  // 'weaker' or 'immune'. A creature's effects live on it (`fx`) until it is reset.
  function applyEffect(target, id, tier = 1) {
    const def = books.effects[id];
    if (!def) throw new Error(`unknown effect "${id}"`);
    const hero_ = target === 'hero', who = hero_ ? hero : target;
    const name = def.name.toLowerCase(), you = hero_ ? 'You' : `The ${target.name}`;
    if (isImmune(hero_ ? { resist: hero.resist } : who, def, id)) {
      say(hero_ ? `You shrug off the ${name}.` : `The ${target.name} is immune to ${name}.`);
      emit('effect', { target: hero_ ? 'hero' : describe(target), effect: id, tier, result: 'immune' });
      return 'immune';
    }
    const set = hero_ ? heroFx : (target.fx ??= createEffects(books.effects));
    const result = set.apply(id, tier);
    if (!hero_) { target.slowFactor = 1 - set.slow(); target.stunned = set.stunned(); }
    if (result !== 'weaker') say(`${you} ${hero_ ? 'are' : 'is'} ${result === 'renewed' ? 'still ' : ''}${name}.`);
    emit('effect', { target: hero_ ? 'hero' : describe(target), effect: id, tier, result });
    return result;
  }

  // Hurt the hero from something that is not a blow: an effect's tick. Death works as it does for a blow.
  function hurtHero(amount, source, effect = undefined) {
    hero.hp = Math.max(0, hero.hp - amount);
    emit('damage-taken', { source, amount, hp: hero.hp, ...(effect ? { effect } : {}) });
    if (hero.hp <= 0 && !dead) { dead = true; swing.reset(); emit('death', { source }); }
  }

  // Let time pass for every status effect: ticks of damage and healing, effects that end. Hero first, then creatures.
  function tickEffects(now) {
    const { ticks, ended } = heroFx.tick(now);
    for (const t of ticks) {
      const def = books.effects[t.id];
      if (t.damage) {
        const amount = Math.round(t.damage * (hero.resist[def.magicType] ?? 1));
        if (amount > 0) { say(`The ${def.name.toLowerCase()} hurts you for ${amount}.`); hurtHero(amount, { id: t.id, kind: t.id, name: def.name }, t.id); }
      }
      if (t.heal && !dead) hero.hp = Math.min(hero.maxHp, hero.hp + t.heal);
    }
    for (const id of ended) { say(`The ${books.effects[id].name.toLowerCase()} fades.`); emit('effect-end', { target: 'hero', effect: id }); }
    let changed = ticks.length > 0 || ended.length > 0;
    for (const actor of active.monsters.actors) {
      if (!actor.fx) continue;
      const result = actor.fx.tick(now);
      for (const t of result.ticks) {
        const def = books.effects[t.id];
        if (t.damage && alive(actor)) {
          const amount = Math.round(t.damage * (actor.resist?.[def.magicType] ?? 1));
          if (amount > 0) {
            const killed = active.monsters.damage(actor, amount, now);
            emit('damage-dealt', { target: describe(actor), amount, hp: actor.hp });
            if (killed) slay(actor);
          }
        }
        if (t.heal && alive(actor)) actor.hp = Math.min(actor.maxHp, actor.hp + t.heal);
      }
      for (const id of result.ended) emit('effect-end', { target: describe(actor), effect: id });
      actor.slowFactor = 1 - actor.fx.slow(); actor.stunned = actor.fx.stunned();
      changed ||= result.ticks.length > 0;
    }
    return changed;
  }

  // Spells. The creatures in the line the hero faces: on their own tile, then each tile ahead, up to `range`, never past a wall.
  function foesInLine(range) {
    const found = [];
    for (let d = 0; d <= range; d++) {
      const x = p.x + DIRS[p.dir][0] * d, z = p.z + DIRS[p.dir][1] * d;
      if (d > 0) { const c = active.cell(x, z); if (!c || c.wall) break; }
      found.push(...active.monsters.at(x, z).filter(alive));
    }
    return found;
  }
  // The creature the hero has in their sights, whose status effects the view shows: the one pointed at (`pointedId`,
  // when it is alive and may be targeted), else the nearest in the line ahead, up to TARGET_RANGE tiles. Null if none.
  function targeted(pointedId = null) {
    const pointed = pointedId && active.monsters.actors.find(a => a.id === pointedId && alive(a));
    if (pointed && (hooks.canTarget ?? defaultCanTarget)(pointed)) return pointed;
    return foesInLine(TARGET_RANGE)[0] ?? null;
  }
  // The quick bar (rules/quickbar.js): slots that name an item or a spell. This is what each one stands for right now.
  const quickbar = createQuickBar({ size: quickSlots, itemDefs, spells: books.spells, canonical: id => canonicalId(itemDefs, id) });
  const quickChanged = () => emit('quickbar', { slots: quickbar.slots });
  // A potion picked up, or a spell learned, takes the first free slot (once: see quickbar.js).
  function quickFill(ref) {
    if (ref.kind === 'item' && !itemDefs[ref.id]?.use?.restores) return;
    if (quickbar.autoFill(ref) >= 0) quickChanged();
  }
  // Fill an empty bar from what the hero has: health potions, then mana potions, then the other potions, then the spells.
  // A new game, and a save from before the bar existed, start this way.
  function quickSeed() {
    const potions = [...new Set(inventory.slots.filter(Boolean).map(s => s.id))].filter(id => itemDefs[id].use?.restores);
    const rank = id => (itemDefs[id].use.restores.hp ? 0 : itemDefs[id].use.restores.mp ? 1 : 2);
    for (const id of potions.sort((a, b) => rank(a) - rank(b))) quickbar.autoFill({ kind: 'item', id });
    for (const id of known) quickbar.autoFill({ kind: 'spell', id });
  }
  // One slot as the screen draws it: what it is, how many there are, and whether it can be used now. null for an empty slot.
  // (Cheap: the screen asks every frame. `quickDescribe` has the long text.)
  function quickSlotView(i) {
    const ref = quickbar.get(i);
    if (!ref) return null;
    if (ref.kind === 'spell') {
      const spell = books.spells[ref.id], isKnown = known.has(ref.id), total = spell.cooldown ?? 0, left = Math.max(0, (spellReadyAt.get(ref.id) ?? 0) - clock());
      const reason = !isKnown ? 'unknown' : left > 0 ? 'cooldown' : hero.mp < spell.cost ? 'mana' : null;
      return { ...ref, name: spell.name, icon: spell.icon ?? 'spell', magicType: spell.magicType, cost: spell.cost, cooldown: total ? Math.min(1, left / total) : 0, usable: !reason, reason };
    }
    const def = itemDefs[ref.id], count = inventory.count(ref.id), worn = Object.values(equipment.worn).includes(ref.id);
    return { ...ref, name: def.name, icon: def.icon, enchant: def.enchant ?? null, count, worn, usable: count > 0, reason: count > 0 ? null : worn ? 'worn' : 'none' };
  }
  // A slot's name and what it does, in words: { name, text } (null for an empty slot).
  function quickDescribe(i) {
    const view = quickSlotView(i);
    if (!view) return null;
    if (view.kind === 'item') return { name: view.name, text: itemDefs[view.id].description };
    return { name: view.name, text: known.has(view.id) ? describeSpell(books.spells[view.id], { damageTypes: books.damageTypes, effects: books.effects, power: hero.spellPower }) : 'You no longer know this spell.' };
  }
  const quickView = () => Array.from({ length: quickbar.size }, (_, i) => quickSlotView(i));
  // Press slot `i`: an item is used (or worn, if it is a weapon or armour), a spell is cast at what is ahead. { ok, ... } or { ok: false, reason }.
  function quickActivate(i, cast = id => session.cast(id)) {
    if (dead) return { ok: false, reason: 'dead' };
    const view = quickSlotView(i);
    if (!view) return { ok: false, reason: 'empty' };
    if (view.kind === 'spell') return cast(view.id);
    if (!view.count) {
      say(view.worn ? `You are already using the ${view.name.toLowerCase()}.` : `You have no ${view.name.toLowerCase()}.`);
      return { ok: false, reason: view.reason };
    }
    const index = inventory.slots.findIndex(s => s?.id === view.id);
    if (itemDefs[view.id].use) return { ok: true, ...useItem(index) };
    return equip(index);
  }

  const spellList = () => [...known].map(id => ({ id, ...books.spells[id], ready: clock() >= (spellReadyAt.get(id) ?? 0), description: describeSpell(books.spells[id], { damageTypes: books.damageTypes, effects: books.effects, power: hero.spellPower }) }));
  // Learn a spell. Returns { ok, message, reason? } and says it.
  function learn(id) {
    const spell = books.spells[id];
    if (!spell) return { ok: false, reason: 'unknown', message: 'You cannot make sense of it.' };
    if (known.has(id)) { const message = `You already know ${spell.name}.`; say(message); return { ok: false, reason: 'known', message }; }
    const can = canLearn(spell, hero);
    if (!can.ok) { say(can.reason); return { ok: false, reason: 'requirements', message: can.reason }; }
    known.add(id); readySpell ??= id;
    const message = `You learn ${spell.name}.`;
    say(message); emit('learn', { spell: id }); quickFill({ kind: 'spell', id });
    return { ok: true, message };
  }
  // Cast a spell (by id; without one, the ready spell) at a creature in the line ahead (`targetId`, or the nearest). Returns
  // { ok: false, reason } ('dead', 'unknown', 'not-known', 'stunned', 'cooldown', 'mana', 'no-target') or { ok: true, spell, targets, ... }.
  function cast(id = readySpell, targetId = null) {
    if (dead) return { ok: false, reason: 'dead' };
    const spell = books.spells[id];
    if (!spell) return { ok: false, reason: id ? 'unknown' : 'no-spells' };
    if (!known.has(id)) { say(`You do not know ${spell.name}.`); return { ok: false, reason: 'not-known' }; }
    if (heroFx.stunned()) { say('You are stunned.'); return { ok: false, reason: 'stunned' }; }
    const now = clock(), wait = (spellReadyAt.get(id) ?? 0) - now;
    if (wait > 0) return { ok: false, reason: 'cooldown', wait };
    if (hero.mp < spell.cost) { say('You do not have the mana.'); return { ok: false, reason: 'mana' }; }
    const aim = spell.target ?? 'foe';
    let foes = [];
    if (aim !== 'self') {
      const line = foesInLine(spellRange(spell));
      foes = targetId ? line.filter(a => a.id === targetId) : aim === 'area' ? line : line.slice(0, 1);
      if (!foes.length) { say(`${spell.name} has nothing to strike.`); return { ok: false, reason: 'no-target' }; }
    }
    hero.mp -= spell.cost; spellReadyAt.set(id, now + (spell.cooldown ?? 0));
    const type = books.damageTypes[spell.magicType]?.name ?? spell.magicType, results = [];
    if (aim === 'self') {
      const healed = Math.min(hero.maxHp - hero.hp, spellHeal(spell, hero.spellPower, random));
      hero.hp += healed;
      say(`You cast ${spell.name.toLowerCase()}${healed ? ` and recover ${healed} health` : ''}.`);
      if (spell.effect && random() < (spell.effect.chance ?? 1)) applyEffect('hero', spell.effect.id, spell.effect.tier ?? 1);
      results.push({ target: 'hero', healed });
    }
    for (const foe of foes) {
      const hit = spellDamage(spell, foe, hero.spellPower, random);
      let killed = false;
      if (hit.immune) say(`The ${foe.name} is immune to ${type}.`);
      else if (hit.damage) {
        say(`Your ${spell.name.toLowerCase()} hits the ${foe.name} for ${hit.damage}.${hit.resisted < 1 ? ` It resists ${type}.` : hit.resisted > 1 ? ` It is weak to ${type}.` : ''}`);
        killed = active.monsters.damage(foe, hit.damage, now);
        emit('damage-dealt', { target: describe(foe), amount: hit.damage, hp: foe.hp });
      } else say(`You cast ${spell.name.toLowerCase()} at the ${foe.name}.`);
      if (killed) slay(foe);
      else if (spell.effect && !hit.immune && random() < (spell.effect.chance ?? 1)) applyEffect(foe, spell.effect.id, spell.effect.tier ?? 1);
      results.push({ target: describe(foe), damage: hit.damage, resisted: hit.resisted, immune: hit.immune, killed });
    }
    emit('cast', { spell: id, targets: results.map(r => r.target), mana: hero.mp });
    return { ok: true, spell: id, mana: hero.mp, targets: results };
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
    say(`The ${actor.name} ${actor.verb ?? 'hits'} you for ${result.damage}.`);
    hurtHero(result.damage, describe(actor));
    if (!dead && actor.onHit && random() < (actor.onHit.chance ?? 1)) applyEffect('hero', actor.onHit.effect, actor.onHit.tier ?? 1); // a poisonous bite
    return result;
  }

  // The creatures' turn: run it every frame (or every simulated tick). `paused` (a menu is open, the page is hidden,
  // a level is loading, the hero is dead) holds every wind-up. Returns { changed, struck, gone }: whether anything
  // a renderer shows changed, the blows that landed or missed, and the corpses taken away.
  let drawnVersion = world.version;
  function update(now = clock(), { paused = false } = {}) {
    const monsters = active.monsters, struck = [];
    if (paused || dead) {
      monsterDue = now + monsters.stepMs; monsters.freeze(now);
      heroFx.freeze(); for (const actor of monsters.actors) actor.fx?.freeze(); // time stands still for effects too
      return { changed: false, struck, gone: [] };
    }
    monsters.resume(now);
    const effectsChanged = tickEffects(now);
    const gone = monsters.reap(now);
    for (const actor of gone) if (actor.spawned) world.remove(actor); // a spawned creature that died is gone for good
    let changed = effectsChanged || gone.length > 0 || world.version !== drawnVersion;
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
    dialogue.close();
    active.level.onExit?.(api);
    active = destination; openBox = null; openShopView = null;
    if (waking) { for (const c of contexts.values()) c.monsters.reset(); hero.restore(); heroFx.clear(); }
    else active.monsters.reset();
    delayMonsters();
    Object.assign(p, spawn, { steps: 0 });
    active.exploration.reveal(p);
    map?.visit(id);
    emit('level', { from, to: id });
    say(`You enter ${active.level.shortName ?? active.level.name}.`); look();
    active.level.onEnter?.(api);
    if (!waking) lookTriggers(true);
  }
  function travel(exit, options = {}) {
    if (exit.worldMap) {
      if (map) hooks.openWorldMap?.(worldMapView());
      return Promise.resolve(!!map);
    }
    if (hooks.travel) return hooks.travel(exit, options);
    if (exit.travelTime) hooks.passTravelTime?.(exit.travelTime);
    enter(exit.to, exit.spawn, options);
    return Promise.resolve(true);
  }
  const worldMapView = () => map?.view(session.levelId) ?? null;
  function travelToLocation(id) {
    const exit = !dead && exitAhead()?.worldMap && map?.exit(id, session.levelId);
    return exit ? travel(exit) : Promise.resolve(false);
  }

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
    discoverLocation: id => map?.discover(id) ?? false,
    say, flags, quests, hero, inventory, equipment, items: itemDefs, random, learn, applyEffect,
    talk: (speaker, tree) => dialogue.talk(speaker, tree),
    showEnding(ending) { emit('ending', ending); hooks.showEnding?.(ending); },
    // A story moment: { title?, pages: [{ image?, title?, text }] }, or one page. Shown full screen until read (the game's
    // hook); in a simulation it is only the event. `done(game)` runs when the player closes it (at once without a screen).
    showStory(story, done = null) {
      emit('story', { title: story.title ?? story.pages?.[0]?.title ?? null, pages: story.pages?.length ?? 1 });
      if (hooks.showStory) hooks.showStory(story, () => done?.(api)); else done?.(api);
    },
    removeEffect: id => heroFx.remove(id),
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
    openShop, gainGold: qty => wallet.gain(qty),
    changed: () => world.changed(),
    doorChanged(inst) {
      world.changed();
      if (inst.level === session.levelId) {
        active.exploration.reveal(p);
        emit('door', { id: inst.id, open: inst.state.open });
      }
    },
    detectTrap: (x, z) => traps.detect(active.id, x, z),
    disarmTrap: (x, z) => traps.disarm(active.id, x, z),
    isHere: inst => inst.level === session.levelId,
    // Is the player or a living creature on this instance's tile (a door must not shut on them)?
    blocked: inst => (inst.level === session.levelId && p.x === inst.x && p.z === inst.z) || world.at(inst.level, inst.x, inst.z).some(liveMonster),
    travel: (to, spawn) => travel({ to, spawn }),
  };
  const dialogue = createDialogue(api, line => hooks.showDialogue?.(line));

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
  persistence.engine.register({
    id: 'magic', after: ['hero'], // the spells the hero knows, the one ready, and the effects on them
    save: () => ({ known: [...known], ready: readySpell, effects: heroFx.save() }),
    load(data, ctx) {
      known.clear(); spellReadyAt.clear();
      for (const id of Array.isArray(data?.known) ? data.known : []) { if (books.spells[id]) known.add(id); else ctx?.issue?.(`spell "${id}" no longer exists`); }
      readySpell = known.has(data?.ready) ? data.ready : [...known][0] ?? null;
      heroFx.load(data?.effects);
    },
    reset() { known.clear(); spellReadyAt.clear(); for (const id of startingSpells) known.add(id); readySpell = startingSpells[0] ?? null; heroFx.clear(); },
  });
  persistence.engine.register({ ...quickbar.persistence, reset() { quickbar.persistence.reset(); quickSeed(); } }); // a save without a bar gets one from what the hero has
  persistence.engine.register(stacksPersistence('containers', itemDefs, containers));
  persistence.engine.register(stacksPersistence('piles', itemDefs, piles));
  persistence.engine.register(wallet.persistence);
  if (Object.values(definitions).some(({ level }) => level.traps?.length)) persistence.engine.register(traps.persistence);
  if (Object.keys(questDefinitions).length) persistence.engine.register(quests.persistence);
  if (map) persistence.engine.register(map.persistence);
  persistence.game.register(flags.persistence);
  for (const section of typeof persist === 'function' ? persist({ flags, hero, inventory, equipment, itemDefs, say }) : persist) persistence.game.register(section);

  // Put a save back: every component is restored, the creatures start over. `respawn` also heals the hero.
  // Returns { issues }.
  async function load(snapshot, { respawn: waking = false } = {}) {
    dialogue.close();
    restoring = true;
    let result;
    try { result = await persistence.restore(snapshot); }
    finally { restoring = false; }
    if (map) {
      map.visit(session.levelId);
      for (const level of explorations.visited()) map.visit(level);
      for (const flag of flags.keys) map.flag(flag, flags.get(flag));
    }
    await hooks.ensureArt?.(session.levelId);
    for (const c of contexts.values()) c.monsters.reset();
    if (waking) { hero.restore(); heroFx.clear(); }
    dead = false; openBox = null; openShopView = null; swing.reset(); delayMonsters();
    return result;
  }

  // A new game, or a loaded one, starts: instances made so far get their onCreate, the level its onEnter.
  function begin({ welcome = true, loaded = false } = {}) {
    if (welcome) say(loaded ? `Welcome back, ${hero.name}.` : `Welcome to ${active.level.name}, ${hero.name}.`);
    world.setApi(api);
    map?.visit(session.levelId);
    active.exploration.reveal(p);
    active.level.onEnter?.(api);
    if (!loaded) lookTriggers(true);
    delayMonsters();
  }

  const session = {
    books, itemDefs, definitions, world, hero, inventory, equipment, flags, persistence, containers, piles, messages, api,
    dialogue, quests, wallet,
    random, clock, swing, player: p, heroEffects: heroFx,
    get known() { return [...known]; },
    quickbar, quickView, quickDescribe,
    quickSet(i, ref) { const ok = quickbar.set(i, ref); if (ok) quickChanged(); return ok; },
    quickClear(i) { const ok = quickbar.clear(i); if (ok) quickChanged(); return ok; },
    quickSwap(a, b) { const ok = quickbar.swap(a, b); if (ok) quickChanged(); return ok; },
    quickActivate,
    get readySpell() { return readySpell; },
    setReadySpell(id) { if (known.has(id)) readySpell = id; return readySpell; },
    spells: spellList,
    get levelId() { return active.id; },
    get context() { return active; },
    get level() { return active.level; },
    get monsters() { return active.monsters; },
    get dead() { return dead; },
    get openBox() { return openBox; },
    get openShop() { return openShopView; },
    closeBox() { openBox = null; },
    contextOf: context,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit, say, look, relCell, plan, move, interact, useItem, quickUse, drop, take, takeAll: takeEverything, equip, unequip, wouldChange, spend, learn, cast, applyEffect,
    attack, targeted, struckBy, update, delayMonsters, enter, travel, revive, load, begin, exitAhead, openContainer, openPile,
    worldMapView, travelToLocation,
  };
  quickSeed(); // a new game's bar, from the starting items and spells
  return session;
}
