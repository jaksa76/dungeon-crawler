// A game without a screen, for bots: the same session the browser plays (engine/core/session.js), on a virtual clock
// that only moves when the bot acts or waits, with seeded chance. Nothing is drawn, so a run takes milliseconds and the
// same seed, scenario and bot always play out the same way. See docs/engine/bots.md.
//
//   const sim = await createSimulation({ campaign, seed: 7, scenario: { level: 'dungeon' } });
//   while (!sim.over) sim.attack() ... sim.forward() ... sim.wait(500);
//
// Every action takes game time, like a player's: a step 180 ms, a turn 160 ms (`pace`), and the creatures act
// meanwhile, in ticks of `tickMs`. An attack waits for the hero's cooldown first. Actions return what happened
// as plain data, and never throw for a move the rules forbid: the result says why.
import { mergeContent } from '../content/catalog.js';
import { engineContent } from '../content/index.js';
import { resolveLevel } from '../core/levels.js';
import { createSession, DIRS, MOVES, EVENTS } from '../core/session.js';
import { createRng } from '../core/rng.js';
import { observe, viewAhead, knownMap, findPath, visibleMonsters } from './observe.js';

export const PACE = { step: 180, strafe: 150, turn: 160, interact: 250, use: 400, equip: 600, take: 200, drop: 200, cast: 450 };

// The campaign's books and levels, resolved once and shared by every run (they are not changed while playing).
const prepared = new WeakMap();
export function prepareCampaign(campaign) {
  if (!prepared.has(campaign)) {
    const books = mergeContent(engineContent, ...[campaign.content ?? []].flat());
    const levels = Object.fromEntries(Object.entries(campaign.levels).map(([id, def]) => [id, resolveLevel(id, def, books)]));
    prepared.set(campaign, { books, levels });
  }
  return prepared.get(campaign);
}

// `campaign`: what a game page passes to startGame (games/<name>/campaign.js). `seed`: the run's chance. `scenario`: where
// and how the run starts (below). `tickMs`: the fixed time step. `pace`: how long actions take. `respawn`: on death,
// wake at the respawn point and carry on (default: the run is over).
//
// scenario: {
//   save        a snapshot (persistence) to start from: everything else is applied on top of it
//   level, at   the level to start on, and { x, z, dir } on it (default: the campaign's start)
//   hero        { name, spent: { strength: 2, ... }, xp, hp, mp }: points spent at character creation, experience, current hp/mp
//   spells      ['firebolt', ...] spells the hero knows (learned after the hero's level is set, so `requires` counts)
//   items       [{ item, qty }] added to the pack;  equip: ['sword', ...] worn (taken from the pack, or given)
//   spawn       [{ kind, x, z, dir?, id?, level? }] creatures (or props) put into the world
//   clear       true: remove the level's own creatures first (an arena for the spawned ones)
//   flags       { key: value } set before the run
//   grace       ms before the creatures first move (default: the level's monsterGraceMs, as when a player arrives)
//   setup(sim)  anything else, as code (may be async)
// }
export async function createSimulation({ campaign, seed = 1, scenario = {}, tickMs = 50, pace = {}, respawn = false } = {}) {
  if (!campaign?.levels) throw new Error('createSimulation needs a campaign (its levels, start and content)');
  const { books, levels } = prepareCampaign(campaign);
  const random = createRng(seed), speed = { ...PACE, ...pace };
  let time = 0;
  const session = createSession({ ...campaign, levels, books, random, clock: () => time,
    level: scenario.level ?? campaign.start,
    creation: scenario.hero ? { name: scenario.hero.name, spent: scenario.hero.spent } : null });
  const { hero, inventory, equipment, flags, player: p } = session;
  const events = [];
  session.on('*', event => events.push(event));

  if (scenario.save) await session.load(scenario.save);
  if (scenario.at) {
    const { x, z, dir = 0 } = scenario.at, c = session.context.cell(x, z);
    if (!c || c.wall) throw new Error(`scenario: (${x},${z}) is not a floor tile on "${session.levelId}"`);
    Object.assign(p, { x, z, dir });
  }
  session.begin({ welcome: false });
  if (scenario.hero) {
    if (Number.isFinite(scenario.hero.xp)) hero.gain(scenario.hero.xp);
    if (Number.isFinite(scenario.hero.hp)) hero.hp = Math.min(hero.maxHp, scenario.hero.hp);
    if (Number.isFinite(scenario.hero.mp)) hero.mp = Math.min(hero.maxMp, scenario.hero.mp);
  }
  for (const id of scenario.spells ?? []) { const learned = session.learn(id); if (!learned.ok && learned.reason !== 'known') throw new Error(`scenario: ${learned.message}`); }
  for (const [key, value] of Object.entries(scenario.flags ?? {})) flags.set(key, value);
  for (const { item, qty = 1 } of scenario.items ?? []) if (inventory.add(item, qty) > 0) throw new Error(`scenario: ${item} does not fit in the pack`);
  for (const item of scenario.equip ?? []) {
    let index = inventory.slots.findIndex(s => s?.id === item);
    if (index < 0) { inventory.add(item, 1); index = inventory.slots.findIndex(s => s?.id === item); }
    const result = equipment.equip(inventory, index);
    if (!result.ok) throw new Error(`scenario: cannot equip ${item}: ${result.message}`);
  }
  if (scenario.clear) for (const m of session.world.all(session.levelId, 'monster')) session.api.remove(m);
  for (const { kind, level, ...at } of scenario.spawn ?? []) await session.api.spawn(kind, { ...at, ...(level ? { level } : {}) });
  session.context.monsters.reset();
  session.context.exploration.reveal(p);
  session.delayMonsters(scenario.grace); // the creatures hold still for the level's grace time, as when a player arrives

  let outcome = null; // 'dead' | 'won' | 'stopped' | null while running
  session.on('death', () => { if (!respawn) outcome ??= 'dead'; });
  const over = () => outcome !== null;

  // Let `ms` of game time pass: the creatures move and fight in fixed ticks. Stops early when the run is over.
  function advance(ms) {
    const end = time + Math.max(0, ms);
    while (time < end && !over()) {
      time = Math.min(end, time + tickMs);
      session.update(time);
      if (session.dead && respawn && !session.revive()) outcome ??= 'dead';
    }
    time = Math.max(time, end);
  }
  // Every action: skip if the run is over, else do it and let its time pass.
  const act = (ms, fn) => { if (over()) return { ok: false, reason: 'over' }; const result = fn(); advance(ms); return result; };
  const stackIndex = item => typeof item === 'number' ? item : inventory.slots.findIndex(s => s?.id === item);

  function step(cmd) {
    return act(cmd === 'left' || cmd === 'right' ? speed.turn : cmd === 'forward' || cmd === 'back' ? speed.step : speed.strafe, () => {
      const result = session.move(cmd);
      if (result.exit) {
        const from = session.levelId;
        session.travel(result.exit); // headless travel is synchronous
        return { ok: session.levelId !== from, travelled: session.levelId };
      }
      return result.moved ? { ok: true } : { ok: false, reason: result.blocked };
    });
  }

  const sim = {
    session, hero, inventory, equipment, flags, books, events, seed,
    get time() { return time; },
    get over() { return over(); },
    get outcome() { return outcome; },
    get level() { return session.levelId; },
    get position() { return { x: p.x, z: p.z, dir: p.dir }; },
    get dead() { return session.dead; },
    get messages() { return session.messages; },

    // Observation: plain data, see observe.js.
    state: (options) => observe(session, options),
    view: (depth) => viewAhead(session, depth),
    map: () => knownMap(session),
    monsters: () => visibleMonsters(session),
    path: (to, options) => findPath(session, to, options),
    exits: () => (session.level.exits ?? []).map(({ x, z, dir, to }) => ({ x, z, dir, to })),
    // Events since the last call (or since the start), and stop collecting them.
    drain: () => events.splice(0),
    on: (type, fn) => session.on(type, fn),

    // Control: the same actions a player has.
    move: cmd => step(cmd),
    forward: () => step('forward'), back: () => step('back'),
    strafeLeft: () => step('strafeLeft'), strafeRight: () => step('strafeRight'),
    turnLeft: () => step('left'), turnRight: () => step('right'),
    // Turn to face a direction (0 N, 1 E, 2 S, 3 W), the short way round.
    face(dir) {
      dir = ((dir % 4) + 4) % 4;
      while (!over() && p.dir !== dir) step((dir - p.dir + 4) % 4 === 3 ? 'left' : 'right');
      return { ok: p.dir === dir };
    },
    // Walk to a tile along known floor (see path()). Stops when blocked or when `until()` says so; returns { ok, reason }.
    walkTo(to, { until, known = true } = {}) {
      for (;;) {
        if (over()) return { ok: false, reason: 'over' };
        if (p.x === to.x && p.z === to.z) return { ok: true };
        if (until?.(sim)) return { ok: false, reason: 'until' };
        const route = findPath(session, to, { known });
        if (!route?.length) return { ok: false, reason: 'no-path' };
        sim.face(route[0]);
        const result = sim.forward();
        if (!result.ok) return { ok: false, reason: result.reason ?? 'blocked' };
      }
    },
    // Swing at a creature (by id, or the one faced). Waits out the cooldown first, as holding the button does.
    attack(targetId = null) {
      for (;;) {
        if (over()) return { ok: false, reason: 'over' };
        const { target, waiting, ...result } = session.attack(targetId);
        advance(tickMs);
        if (!waiting) return target ? { ...result, target: target.id, hp: target.hp } : result;
      }
    },
    interact: () => act(speed.interact, () => { session.interact(); return { ok: true, container: session.openBox ? boxView() : null }; }),
    // Put a skill point (from levelling up) into an attribute: 'strength', 'vitality', 'intellect' or 'agility'.
    spend: attribute => act(100, () => session.spend(attribute)),
    // Talking is Use on an NPC (talk behaviours arrive with dialogue); casting needs spells, which the engine has not yet.
    talk: () => sim.interact(),
    // Magic: cast a spell (an id; without one the ready spell) at the nearest creature in the line ahead, or at `targetId`.
    // { ok, spell, targets } or { ok: false, reason: 'no-spells' | 'unknown' | 'not-known' | 'stunned' | 'cooldown' | 'mana' | 'no-target' }.
    cast: (spell, targetId = null) => act(speed.cast, () => session.cast(spell, targetId)),
    // Learn a spell, as reading its book would (`requires` still counts).
    learn: spell => act(speed.use, () => session.learn(spell)),
    // The known spells: [{ id, name, cost, magicType, ready, description, ... }].
    spells: () => session.spells(),
    // The pack: an item id or a slot index.
    use(item) {
      const index = stackIndex(item);
      if (index < 0 || !inventory.slots[index]) return { ok: false, reason: 'no-item' };
      return act(speed.use, () => ({ ok: true, ...session.useItem(index) }));
    },
    // Drink the first potion that restores 'hp' or 'mp'.
    quaff(kind = 'hp') { return act(speed.use, () => { const r = session.quickUse(kind); return r ? { ok: true, ...r } : { ok: false, reason: 'no-potion' }; }); },
    // The quick bar (rules/quickbar.js): what is in each slot (null for an empty one), put something in a slot
    // ({ kind: 'item' | 'spell', id }), empty one, and press one: use the item, wear the weapon, cast the spell at what is ahead.
    quickbar: () => session.quickView(),
    setQuick: (slot, ref) => ({ ok: session.quickSet(slot, ref) }),
    clearQuick: slot => ({ ok: session.quickClear(slot) }),
    quick: slot => act(speed.use, () => session.quickActivate(slot)),
    equip(item, slot = null) {
      const index = stackIndex(item);
      if (index < 0 || !inventory.slots[index]) return { ok: false, reason: 'no-item' };
      return act(speed.equip, () => session.equip(index, slot));
    },
    unequip: slot => act(speed.equip, () => session.unequip(slot)),
    drop(item, qty = Infinity) {
      const index = stackIndex(item);
      return act(speed.drop, () => { const gone = session.drop(index, qty); return gone ? { ok: true, ...gone } : { ok: false, reason: 'no-item' }; });
    },
    // The open container (after interact()): its stacks, then take one or all.
    container: () => (session.openBox ? boxView() : null),
    take: index => act(speed.take, () => { const n = session.take(index); return { ok: n > 0, qty: n }; }),
    takeAll: () => act(speed.take, () => { const taken = session.takeAll(); return { ok: taken.length > 0, taken }; }),
    wait: ms => act(ms, () => ({ ok: true })),
    // Go to a level directly, as content's game.travel does (a scenario shortcut, not a player action).
    travel: (to, spawn) => act(0, () => { session.enter(to, spawn); return { ok: true }; }),
    // End the run: 'won' when the bot reached its goal, or 'stopped'.
    stop(result = 'stopped') { outcome ??= result; },
    // The whole game as a save, to start other runs from (scenario.save).
    snapshot: () => session.persistence.snapshot({ label: 'simulation' }),
  };
  const boxView = () => ({ title: session.openBox.title, stacks: session.openBox.stacks.map(s => ({ ...s })) });
  return sim;
}

export { EVENTS, DIRS, MOVES };
