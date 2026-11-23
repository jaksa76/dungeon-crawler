// The game state: everything a save file holds, as plain data, and the store that keeps it. No DOM, no clock.
//
// The state is a JSON object, separate from rendering and input. Anything the player can change and would
// expect to find again after a reload belongs here; later milestones (stats, flags, quests, known places) add
// their own fields and a migration, and nothing else needs to learn how saving works.
//
//   { version, savedAt, levelId, position: { x, z, dir },
//     hero: { attrs, hp, mp }, inventory: [stack|null], equipment: { slotId: itemId|null },
//     explored: { levelId: ['x,z'] }, containers: { key: [stack] }, piles: { key: [stack] },
//     flags: {}, locations: [] }

export const STATE_VERSION = 1;

// A migration turns a state of version n into version n + 1: MIGRATIONS[n](state). Add one whenever the shape
// changes and raise STATE_VERSION, so old saves keep loading.
export const MIGRATIONS = {};

// Bring a parsed save up to STATE_VERSION. Returns null for anything that cannot be a save of this game
// (not an object, no version, from a newer version, or a gap in the migrations).
export function migrate(state, { version = STATE_VERSION, migrations = MIGRATIONS } = {}) {
  if (!state || typeof state !== 'object' || !Number.isInteger(state.version) || state.version < 1 || state.version > version) return null;
  let s = state;
  while (s.version < version) {
    const step = migrations[s.version];
    if (!step) return null;
    s = { ...step(structuredClone(s)), version: s.version + 1 };
  }
  return s;
}

const copyStacks = stacks => stacks.map(s => s && { id: s.id, qty: s.qty });

// Read the live game into a state. `parts`: levelId, p {x,z,dir}, hero, inventory, equipment, explored (an object
// of arrays), containers and piles (Map or object of key -> stacks), flags, locations.
export function captureState({ levelId, p, hero, inventory, equipment, explored = {}, containers = {}, piles = {}, flags = {}, locations = [] }, now = Date.now()) {
  const mapOf = source => Object.fromEntries([...(source instanceof Map ? source : Object.entries(source))].map(([k, v]) => [k, copyStacks(v)]));
  return {
    version: STATE_VERSION, savedAt: now, levelId,
    position: { x: p.x, z: p.z, dir: p.dir },
    hero: { attrs: { ...hero.attrs }, hp: hero.hp, mp: hero.mp },
    inventory: copyStacks(inventory.slots),
    equipment: { ...equipment.worn },
    explored: Object.fromEntries(Object.entries(explored).map(([id, cells]) => [id, [...cells]])),
    containers: mapOf(containers), piles: mapOf(piles),
    flags: structuredClone(flags), locations: [...locations],
  };
}

const validStack = (defs, s) => s && defs[s.id] && Number.isInteger(s.qty) && s.qty >= 1 && s.qty <= (defs[s.id].stack ?? 1);

// Put a state back into the live objects, leaving out anything that no longer exists in the game (an item or a
// slot that was removed since the save). Returns what the caller must set itself: the level, the position and
// the explored cells. Mutates `inventory`, `equipment` and `hero` in place; fills `containers` and `piles` (Maps).
export function restoreState(state, { defs, hero, inventory, equipment, containers, piles }) {
  const stacks = list => (Array.isArray(list) ? list : []).filter(s => validStack(defs, s)).map(s => ({ id: s.id, qty: s.qty }));
  Object.assign(hero.attrs, state.hero?.attrs ?? {});
  inventory.slots.fill(null);
  (state.inventory ?? []).slice(0, inventory.size).forEach((s, i) => { if (validStack(defs, s)) inventory.slots[i] = { id: s.id, qty: s.qty }; });
  for (const slot of Object.keys(equipment.worn)) {
    const id = state.equipment?.[slot];
    equipment.worn[slot] = id && equipment.fits(id, slot) ? id : null;
  }
  const clamp = (v, max) => Math.min(max, Math.max(0, Number.isFinite(v) ? Math.round(v) : max));
  hero.hp = clamp(state.hero?.hp, hero.maxHp); hero.mp = clamp(state.hero?.mp, hero.maxMp);
  if (hero.hp === 0) hero.hp = hero.maxHp; // a save is never a corpse
  containers.clear(); piles.clear();
  for (const [key, list] of Object.entries(state.containers ?? {})) containers.set(key, stacks(list));
  for (const [key, list] of Object.entries(state.piles ?? {})) piles.set(key, stacks(list));
  return {
    levelId: state.levelId, position: state.position,
    explored: new Map(Object.entries(state.explored ?? {}).map(([id, cells]) => [id, cells.filter(c => typeof c === 'string')])),
    flags: structuredClone(state.flags ?? {}), locations: [...(state.locations ?? [])],
  };
}

// A save slot in a Storage (localStorage). Storage can be missing, full or blocked (private browsing); every call
// then fails quietly and the game simply plays without saving.
export function createSaveStore(storage, key = 'dungeon-crawler:save') {
  const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
  return {
    load: () => safe(() => migrate(JSON.parse(storage.getItem(key))), null),
    save: state => safe(() => { storage.setItem(key, JSON.stringify(state)); return true; }, false),
    clear: () => safe(() => { storage.removeItem(key); return true; }, false),
    has: () => safe(() => storage.getItem(key) !== null, false),
  };
}
