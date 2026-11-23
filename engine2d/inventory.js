// Items, the player's pack and stacks of things lying somewhere (a chest, the floor). Pure logic, no DOM.
//
// `defs` maps an item id to { name, type, icon, description, stack? }. `stack` is how many fit in one
// slot (default 1). A stack is { id, qty }; a container or a floor pile is just an unlimited list of stacks.

export function checkItems(defs) {
  for (const [id, def] of Object.entries(defs)) {
    for (const key of ['name', 'type', 'description']) if (typeof def[key] !== 'string' || !def[key]) throw new Error(`item "${id}" needs a ${key}`);
    if (typeof def.icon !== 'string' || !def.icon) throw new Error(`item "${id}" needs an icon id`);
    if (def.aliases !== undefined && !(Array.isArray(def.aliases) && def.aliases.every(a => typeof a === 'string' && a && !defs[a]))) throw new Error(`item "${id}" has bad aliases (a list of old ids that no item uses now)`);
    if (def.stack !== undefined && !(Number.isInteger(def.stack) && def.stack >= 1)) throw new Error(`item "${id}" has a bad stack size`);
  }
}

// An item that was renamed keeps its old ids in `aliases: ['old-id']`, so saves that name it still load.
export const canonicalId = (defs, id) => (defs[id] ? id : Object.keys(defs).find(key => defs[key].aliases?.includes(id)) ?? id);

const stackMax = (defs, id) => {
  if (!defs[id]) throw new Error(`unknown item "${id}"`);
  return defs[id].stack ?? 1;
};

// Add `qty` of `id` to an unlimited list of stacks, topping up existing stacks first.
export function addToStacks(defs, stacks, id, qty = 1) {
  const max = stackMax(defs, id);
  for (const s of stacks) {
    if (s.id !== id || qty <= 0) continue;
    const n = Math.min(max - s.qty, qty); s.qty += n; qty -= n;
  }
  while (qty > 0) { const n = Math.min(max, qty); stacks.push({ id, qty: n }); qty -= n; }
  return stacks;
}

const validStack = (defs, s) => !!s && !!defs[s.id] && Number.isInteger(s.qty) && s.qty >= 1 && s.qty <= (defs[s.id].stack ?? 1);

// Persistence for a Map of `key -> stacks` (opened containers, piles on the floor). Register the result as a
// section; stacks of items that no longer exist are dropped and reported.
export function stacksPersistence(id, defs, map) {
  return {
    id,
    save: () => Object.fromEntries([...map].map(([key, list]) => [key, list.map(s => ({ id: s.id, qty: s.qty }))])),
    load(data, ctx) {
      map.clear();
      for (const [key, list] of Object.entries(data ?? {})) {
        const stacks = (Array.isArray(list) ? list : []).map(s => s && { ...s, id: canonicalId(defs, s.id) });
        map.set(key, stacks.filter(s => validStack(defs, s) || (ctx?.issue?.(`${id} "${key}": dropped ${JSON.stringify(s)}`), false)).map(s => ({ id: s.id, qty: s.qty })));
      }
    },
    reset: () => map.clear(),
  };
}

// A pack with a fixed number of slots. add() returns how many did not fit.
export function createInventory(defs, { size = 12, start = [] } = {}) {
  const slots = Array(size).fill(null);
  const inventory = {
    slots,
    get size() { return size; },
    add(id, qty = 1) {
      const max = stackMax(defs, id);
      for (const s of slots) {
        if (s?.id !== id || qty <= 0) continue;
        const n = Math.min(max - s.qty, qty); s.qty += n; qty -= n;
      }
      for (let i = 0; i < size && qty > 0; i++) {
        if (slots[i]) continue;
        const n = Math.min(max, qty); slots[i] = { id, qty: n }; qty -= n;
      }
      return qty;
    },
    // Take up to `qty` out of a slot; returns what came out, or null for an empty slot.
    remove(index, qty = Infinity) {
      const s = slots[index];
      if (!s) return null;
      const n = Math.min(qty, s.qty);
      s.qty -= n;
      if (s.qty === 0) slots[index] = null;
      return { id: s.id, qty: n };
    },
    // Drag one slot onto another: into an empty slot, merged into the same item, or swapped. False if nothing changed.
    move(from, to) {
      const a = slots[from], b = slots[to];
      if (!a || from === to || to < 0 || to >= size) return false;
      if (b && b.id === a.id) {
        const n = Math.min(stackMax(defs, a.id) - b.qty, a.qty);
        if (n > 0) { b.qty += n; a.qty -= n; if (a.qty === 0) slots[from] = null; return true; }
      }
      slots[to] = a; slots[from] = b ?? null;
      return true;
    },
    count: id => slots.reduce((sum, s) => sum + (s?.id === id ? s.qty : 0), 0),
    get used() { return slots.filter(Boolean).length; },
    // As a persistence section. Back to the starting items when a save has none.
    persistence: {
      id: 'inventory',
      save: () => slots.map(s => s && { id: s.id, qty: s.qty }),
      load(data, ctx) {
        slots.fill(null);
        (Array.isArray(data) ? data : []).slice(0, size).forEach((saved, i) => {
          if (!saved) return;
          const s = { ...saved, id: canonicalId(defs, saved.id) };
          if (validStack(defs, s)) slots[i] = { id: s.id, qty: s.qty };
          else ctx?.issue?.(`pack slot ${i}: dropped ${JSON.stringify(s)}`);
        });
      },
      reset() { slots.fill(null); for (const { item, qty = 1 } of start) inventory.add(item, qty); },
    },
  };
  for (const { item, qty = 1 } of start) if (inventory.add(item, qty) > 0) throw new Error(`the starting items do not fit in ${size} slots`);
  return inventory;
}

// Move one stack from a container into the pack. Returns how many were taken; the rest stay behind.
export function takeStack(inventory, stacks, index) {
  const stack = stacks[index];
  if (!stack) return 0;
  const left = inventory.add(stack.id, stack.qty), taken = stack.qty - left;
  stack.qty = left;
  if (left === 0) stacks.splice(index, 1);
  return taken;
}

// Move everything that fits. Returns the stacks that were taken, in order.
export function takeAll(inventory, stacks) {
  const taken = [];
  for (let i = 0; i < stacks.length;) {
    const { id } = stacks[i], before = stacks.length, n = takeStack(inventory, stacks, i);
    if (n > 0) taken.push({ id, qty: n });
    if (stacks.length === before) i++; // the stack stayed, whole or in part: go on to the next
  }
  return taken;
}
