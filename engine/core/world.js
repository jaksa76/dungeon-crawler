// The world: every placed and spawned thing as an instance of its definition, level by level.
//
// An instance is `Object.create(definition)`: methods and data come from the definition (a campaign can override them),
// and the instance has its own placement (x, z, side or dir, id), `state` (plain JSON: the only part that is saved) and
// whatever runtime fields the engine gives it. Categories: 'prop', 'npc', 'door', 'monster'. `ref` is what it is
// known by on its level (its id, or where it stands, or spawn-<n>); `level` is its level's id.
//
// Levels are created lazily: the first time anything needs one (the player enters it, or code reaches into it with
// find/spawn), its instances are made from the level's placements and given their saved state. Saved state of levels
// not created yet waits as plain data. Nothing is unloaded: leaving a level only stops drawing and simulating it.
//
// Lookups go through at(), find() and all(), and moves through move(), so the indexes behind them (per level, by tile
// and by key) can change without touching the callers.
//
// Saved: per level, the state of each placed instance (or that it was removed) and every spawned instance with its
// placement, plus the counter for spawned ids.
import { createMonster } from '../rules/stats.js';
import { behaviourFrom } from '../rules/behaviours.js';

const BOOKS = { prop: 'props', npc: 'npcs', door: 'doors', monster: 'monsters' };
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const tileKey = (x, z) => `${x},${z}`;
// Everything an object has, its own fields and its definition's, as one plain object (for code that spreads objects).
export function flat(object) { const out = {}; for (const key in object) out[key] = object[key]; return out; }

export function createWorld({ levels, books }) {
  const created = new Map();  // level id -> { def, byKey: Map, tiles: Map, removed: Set }
  let pending = new Map();    // level id -> saved data for a level not created yet
  let counter = 0, version = 0, api = null, waiting = [];

  // One prototype per definition: the book entry, with its data behaviour turned into a method.
  const prototypes = new Map();
  function prototypeFor(category, kind) {
    const cacheKey = `${category}:${kind}`;
    if (prototypes.has(cacheKey)) return prototypes.get(cacheKey);
    const entry = books[BOOKS[category]]?.[kind];
    if (!entry) throw new Error(`unknown ${category} "${kind}"`);
    let proto;
    if (category === 'monster') proto = Object.assign(createMonster(books.monsters, kind), { state: entry.state ?? { dead: false } });
    else {
      proto = Object.create(entry);
      if (typeof entry.interact !== 'function' && entry.behavior) proto.interact = behaviourFrom(entry.behavior);
      if (category === 'door') Object.assign(proto, { art: books.buildings[entry.building].art, assets: books.buildings[entry.building].assets });
    }
    Object.assign(proto, { category, kind });
    prototypes.set(cacheKey, proto);
    return proto;
  }

  function instantiate(level, category, kind, placement, key, { spawned = false, state } = {}) {
    const proto = prototypeFor(category, kind), inst = Object.create(proto);
    const { prop, npc, door, monster, behavior, state: placedState, category: _c, ...rest } = placement;
    Object.assign(inst, rest, { ref: key, id: placement.id, level: level.id, spawned, placement: copy({ ...placement, state: undefined }) });
    if (category === 'prop' || category === 'npc') inst.prop = kind;
    if (behavior) inst.interact = behaviourFrom(behavior); // a placement's own behaviour wins over its definition's
    inst.state = { ...copy(proto.state ?? {}), ...copy(placedState ?? {}), ...copy(state ?? {}) };
    return inst;
  }

  function index(level, inst) {
    level.byKey.set(inst.ref, inst);
    const at = tileKey(inst.x, inst.z);
    if (!level.tiles.has(at)) level.tiles.set(at, new Set());
    level.tiles.get(at).add(inst);
  }
  function unindex(level, inst) {
    level.byKey.delete(inst.ref);
    level.tiles.get(tileKey(inst.x, inst.z))?.delete(inst);
  }

  // The keys placed instances are known by: their id, or where they stand.
  const placedKey = {
    entity: (e) => e.id ?? `${e.x},${e.z},${e.side}`,
    door: (d) => d.id ?? `door:${d.x},${d.z}`,
    monster: (m, i) => m.id ?? `monster-${i}`,
  };

  function create(id) {
    if (created.has(id)) return created.get(id);
    const def = levels[id];
    if (!def) throw new Error(`Unknown level: ${id}`);
    const level = { id, def, byKey: new Map(), tiles: new Map(), removed: new Set() };
    created.set(id, level);
    const saved = pending.get(id); pending.delete(id);
    const fresh = [];
    const place = (category, kind, placement, key) => {
      if (saved?.placed?.[key]?.removed) { level.removed.add(key); return; }
      const inst = instantiate(level, category, kind, placement, key, { state: saved?.placed?.[key]?.state });
      if (category === 'monster') inst.home = { x: inst.x, z: inst.z, dir: inst.dir ?? 0 };
      index(level, inst);
      if (!saved) fresh.push(inst);
    };
    for (const e of def.level.entities) place(e.category, e.prop, e, placedKey.entity(e));
    for (const d of def.level.doors) place('door', d.door, d, placedKey.door(d));
    def.level.monsters.forEach((m, i) => place('monster', m.monster, m, placedKey.monster(m, i)));
    for (const s of saved?.spawned ?? []) {
      try {
        const inst = instantiate(level, s.category, s.kind, s.placement, s.key, { spawned: true, state: s.state });
        if (s.category === 'monster') inst.home = { x: inst.x, z: inst.z, dir: inst.dir ?? 0 };
        index(level, inst);
      } catch (error) { console.warn(`save: a spawned ${s.category} "${s.kind}" was dropped: ${error.message}`); }
    }
    created_(fresh);
    return level;
  }
  // onCreate runs once per playthrough, when the game API exists (instances made before it wait for it).
  function created_(list) {
    if (!api) { waiting.push(...list); return; }
    for (const inst of list) inst.onCreate?.(api);
  }

  const levelOf = inst => created.get(inst.level);
  const statics = id => levels[id].level; // a level's placements and map, without creating it

  const world = {
    get version() { return version; },
    changed() { version++; },
    // The game API handed to methods. Instances created before it waited for their onCreate.
    setApi(game) { api = game; const list = waiting; waiting = []; created_(list); },
    level: id => create(id),
    isCreated: id => created.has(id),
    find: (level, key) => create(level).byKey.get(key) ?? null,
    all(level, category = null) {
      const list = [...create(level).byKey.values()];
      return category ? list.filter(inst => inst.category === category) : list;
    },
    at(level, x, z) { return [...(create(level).tiles.get(tileKey(x, z)) ?? [])]; },
    doorAt(level, x, z) { return world.at(level, x, z).find(inst => inst.category === 'door') ?? null; },
    // Move an instance on its level (monsters walking). Keeps the tile index up to date.
    move(inst, x, z) {
      const level = levelOf(inst);
      if (!level) { inst.x = x; inst.z = z; return; }
      level.tiles.get(tileKey(inst.x, inst.z))?.delete(inst);
      inst.x = x; inst.z = z;
      if (!level.tiles.has(tileKey(x, z))) level.tiles.set(tileKey(x, z), new Set());
      level.tiles.get(tileKey(x, z)).add(inst);
    },

    // A new instance of `kind`: { level, x, z, dir? | side?, id?, state?, category?, <fields and methods> }. The
    // category is found from the books (prop, NPC, door or monster) unless given. Returns the instance.
    spawn(kind, at) {
      if (!at || !levels[at.level]) throw new Error(`spawn: unknown level "${at?.level}"`);
      const categories = Object.keys(BOOKS).filter(c => books[BOOKS[c]][kind]);
      const category = at.category ?? (categories.length === 1 ? categories[0] : null);
      if (!category) throw new Error(categories.length ? `spawn: "${kind}" is a ${categories.join(' and a ')}; say which (category)` : `spawn: unknown kind "${kind}"`);
      const level = create(at.level), map = statics(at.level), where = `(${at.x},${at.z})`;
      if (levels[at.level].tileTypes[map.tiles[at.z]?.[at.x]]?.floor !== true) throw new Error(`spawn: ${where} is not a floor tile`);
      const here = world.at(at.level, at.x, at.z);
      if (category === 'door' && here.some(i => i.category === 'door')) throw new Error(`spawn: there is already a door at ${where}`);
      if (category === 'prop' || category === 'npc') {
        if (!'NESW'.includes(at.side) || at.side?.length !== 1) throw new Error(`spawn: a ${category} needs a side: N, E, S or W`);
        if (here.some(i => i.side === at.side)) throw new Error(`spawn: the ${at.side} side of ${where} is taken`);
      }
      const key = at.id ?? `spawn-${++counter}`;
      if (level.byKey.has(key)) throw new Error(`spawn: the id "${key}" is already used on level "${at.level}"`);
      const { level: _l, ...placement } = at;
      const inst = instantiate(level, category, kind, placement, key, { spawned: true });
      if (category === 'monster') inst.home = { x: inst.x, z: inst.z, dir: inst.dir ?? 0 };
      index(level, inst); version++;
      created_([inst]);
      return inst;
    },
    // Take an instance out of the world. A placed one is remembered as removed, so its level data does not bring it back.
    remove(inst) {
      const level = levelOf(inst);
      if (!level || level.byKey.get(inst.ref) !== inst) return false;
      unindex(level, inst);
      if (!inst.spawned) level.removed.add(inst.ref);
      version++;
      return true;
    },
    // Back to the definition's starting state (a dead creature lives again, at its home). A removed placed instance,
    // named by level and key, comes back. Returns the instance.
    respawn(inst, key = null) {
      if (typeof inst === 'string') {
        const level = create(inst);
        if (level.removed.has(key)) {
          level.removed.delete(key);
          const map = statics(inst), found = [
            ...map.entities.map(e => [e.category, e.prop, e, placedKey.entity(e)]),
            ...map.doors.map(d => ['door', d.door, d, placedKey.door(d)]),
            ...map.monsters.map((m, i) => ['monster', m.monster, m, placedKey.monster(m, i)]),
          ].find(([, , , k]) => k === key);
          if (!found) return null;
          const fresh = instantiate(level, found[0], found[1], found[2], key);
          if (found[0] === 'monster') fresh.home = { x: fresh.x, z: fresh.z, dir: fresh.dir ?? 0 };
          index(level, fresh); version++;
          return fresh;
        }
        inst = level.byKey.get(key);
        if (!inst) return null;
      }
      inst.state = { ...copy(Object.getPrototypeOf(inst).state ?? {}), ...copy(inst.placement?.state ?? {}) };
      if (inst.home) world.move(inst, inst.home.x, inst.home.z);
      version++;
      return inst;
    },

    persistence: {
      id: 'world',
      save() {
        const out = { counter, levels: {} };
        for (const [id, data] of pending) out.levels[id] = copy(data);
        for (const [id, level] of created) {
          const placed = {}, spawned = [];
          for (const key of level.removed) placed[key] = { removed: true };
          for (const inst of level.byKey.values()) {
            if (inst.spawned) spawned.push({ key: inst.ref, kind: inst.kind, category: inst.category, placement: inst.placement, state: copy(inst.state) });
            else placed[inst.ref] = { state: copy(inst.state) };
          }
          out.levels[id] = { placed, spawned };
        }
        return out;
      },
      load(data) {
        created.clear(); waiting = []; version++;
        counter = Number.isInteger(data?.counter) ? data.counter : 0;
        pending = new Map(Object.entries(data?.levels ?? {}).filter(([id]) => levels[id]));
      },
      reset() { created.clear(); pending = new Map(); counter = 0; waiting = []; version++; },
    },
  };
  return world;
}
