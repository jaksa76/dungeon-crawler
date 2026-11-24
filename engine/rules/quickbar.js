// The quick bar: a row of slots, each a reference to something the hero uses often: an item (a potion, a weapon) or a
// known spell. Slots hold nothing themselves, so the pack and the saves stay `{ id, qty }`; a slot only names what
// it stands for, and the session (core/session.js) says how much of it there is and whether it can be used now.
// Pure data, no DOM. See docs/engine/quickbar.md.
//
//   a slot is null, or { kind: 'item' | 'spell', id }
//
// The bar always has `size` slots (8); a small screen shows the first few. The same thing is never on the bar twice:
// putting it in a second slot moves it.
//
// Auto-fill puts the first potion picked up and the first spell learned in the first free slot, once: what has
// been offered a slot is remembered (`offered`), so a slot the player cleared by hand does not fill again.

export const QUICK_SLOTS = 8;

const sameRef = (a, b) => !!a && !!b && a.kind === b.kind && a.id === b.id;
export const refKey = ref => `${ref.kind}:${ref.id}`;

// `itemDefs` and `spells` are the books' definitions; `canonical(id)` maps an old item id to its current one.
export function createQuickBar({ size = QUICK_SLOTS, itemDefs, spells = {}, canonical = id => id } = {}) {
  const slots = Array(size).fill(null);
  const offered = new Set();
  // What may stand on the bar: a spell, or an item that does something when used or can be worn.
  const valid = ref => !!ref && (ref.kind === 'spell' ? !!spells[ref.id] : ref.kind === 'item' && !!itemDefs[ref.id] && !!(itemDefs[ref.id].use || itemDefs[ref.id].slot));
  const inRange = i => Number.isInteger(i) && i >= 0 && i < size;
  const indexOf = ref => slots.findIndex(s => sameRef(s, ref));

  const bar = {
    size,
    get slots() { return slots.map(s => s && { ...s }); },
    get: i => (inRange(i) && slots[i] ? { ...slots[i] } : null),
    indexOf,
    valid,
    // Put `ref` in slot `i`, taking it from any other slot. Returns false when it cannot go there.
    set(i, ref) {
      if (!inRange(i) || !valid(ref)) return false;
      const was = indexOf(ref);
      if (was === i) return true;
      if (was >= 0) slots[was] = slots[i]; // it moves; what was in `i` takes its place, so a drag between slots swaps
      slots[i] = { kind: ref.kind, id: ref.id };
      offered.add(refKey(ref));
      return true;
    },
    clear(i) { if (!inRange(i) || !slots[i]) return false; offered.add(refKey(slots[i])); slots[i] = null; return true; },
    swap(a, b) { if (!inRange(a) || !inRange(b) || a === b) return false; [slots[a], slots[b]] = [slots[b], slots[a]]; return true; },
    // The first free slot gets `ref`, unless it has been offered a slot before. Returns the slot, or -1.
    autoFill(ref) {
      if (!valid(ref) || offered.has(refKey(ref))) return -1;
      offered.add(refKey(ref));
      if (indexOf(ref) >= 0) return -1;
      const i = slots.indexOf(null);
      if (i < 0) return -1;
      slots[i] = { kind: ref.kind, id: ref.id };
      return i;
    },
    // Take away whatever no longer exists (an item or spell removed from the game).
    prune() { slots.forEach((s, i) => { if (s && !valid(s)) slots[i] = null; }); },

    persistence: {
      id: 'quickbar', after: ['inventory', 'equipment', 'magic'],
      save: () => ({ slots: slots.map(s => s && { [s.kind]: s.id }), offered: [...offered] }),
      load(data, ctx) {
        slots.fill(null); offered.clear();
        const list = Array.isArray(data?.slots) ? data.slots : [];
        list.slice(0, size).forEach((entry, i) => {
          if (!entry) return;
          const ref = typeof entry.item === 'string' ? { kind: 'item', id: canonical(entry.item) } : typeof entry.spell === 'string' ? { kind: 'spell', id: entry.spell } : null;
          if (ref && valid(ref) && indexOf(ref) < 0) slots[i] = ref; else ctx?.issue?.(`quick bar slot ${i + 1}: dropped ${JSON.stringify(entry)}`);
        });
        for (const key of Array.isArray(data?.offered) ? data.offered : []) if (typeof key === 'string') offered.add(key);
        for (const s of slots) if (s) offered.add(refKey(s));
      },
      // A new game, or a save from before the bar existed: the bar starts empty and `seed` (called by the session)
      // fills it from what the hero has.
      reset() { slots.fill(null); offered.clear(); },
    },
  };
  return bar;
}
