// What the hero wears. Pure logic, no DOM.
//
// `slots` is a list of { id, label, accepts?, ghost } (`accepts` defaults to the id: two ring slots both accept
// 'ring'). An item fits a slot when its definition says `slot: <accepts>`. `bonus` on a definition, e.g.
// { attack: 4, defence: 1 }, is added up by bonuses() for the combat rules. Worn items are not in the pack.

export const equipSlots = [
  { id: 'head', label: 'Head', ghost: 'leather-cap' },
  { id: 'amulet', label: 'Amulet', ghost: 'amulet' },
  { id: 'weapon', label: 'Weapon', ghost: 'short-sword' },
  { id: 'shield', label: 'Shield', ghost: 'round-shield' },
  { id: 'armour', label: 'Armour', ghost: 'tunic' },
  { id: 'gloves', label: 'Gloves', ghost: 'leather-gloves' },
  { id: 'ring1', label: 'Ring', accepts: 'ring', ghost: 'silver-ring' },
  { id: 'ring2', label: 'Ring', accepts: 'ring', ghost: 'silver-ring' },
  { id: 'boots', label: 'Boots', ghost: 'leather-boots' },
];

export function createEquipment(defs, slots = equipSlots) {
  const worn = Object.fromEntries(slots.map(s => [s.id, null]));
  const slotOf = id => { const s = slots.find(x => x.id === id); if (!s) throw new Error(`unknown equipment slot "${id}"`); return s; };
  const fits = (itemId, slotId) => !!defs[itemId] && defs[itemId].slot === (slotOf(slotId).accepts ?? slotId);
  // Where an item would go: the first empty compatible slot, else the first compatible one.
  const targetFor = itemId => {
    const ok = slots.filter(s => fits(itemId, s.id));
    return (ok.find(s => !worn[s.id]) ?? ok[0])?.id ?? null;
  };
  return {
    slots, worn, fits, targetFor,
    // Wear one item from a pack slot. What was worn there goes back to the pack. { ok, message }.
    equip(inventory, index, slotId = null) {
      const stack = inventory.slots[index];
      if (!stack) return { ok: false, message: 'Nothing to equip.' };
      const name = defs[stack.id].name;
      slotId ??= targetFor(stack.id);
      if (!slotId || !fits(stack.id, slotId)) return { ok: false, message: `You cannot wear ${name.toLowerCase()} there.` };
      const old = worn[slotId], taken = inventory.remove(index, 1);
      if (old && inventory.add(old, 1) > 0) { inventory.add(taken.id, 1); return { ok: false, message: 'Your pack is full.' }; } // no room for the old one: undo
      worn[slotId] = stack.id;
      return { ok: true, slot: slotId, message: `You equip ${name.toLowerCase()}.` };
    },
    // Take off what is in a slot and put it in the pack, in `toIndex` if that is empty. { ok, message }.
    unequip(inventory, slotId, toIndex = null) {
      const id = worn[slotOf(slotId).id];
      if (!id) return { ok: false, message: 'Nothing is worn there.' };
      if (toIndex !== null && !inventory.slots[toIndex]) inventory.slots[toIndex] = { id, qty: 1 };
      else if (inventory.add(id, 1) > 0) return { ok: false, message: 'Your pack is full.' };
      worn[slotId] = null;
      return { ok: true, message: `You take off ${defs[id].name.toLowerCase()}.` };
    },
    // As a persistence section: what is worn in each slot.
    persistence: {
      id: 'equipment',
      save: () => ({ ...worn }),
      load(data, ctx) {
        for (const slot of Object.keys(worn)) {
          const saved = data?.[slot] ?? null, id = saved && (defs[saved] ? saved : Object.keys(defs).find(k => defs[k].aliases?.includes(saved)) ?? saved);
          if (id && !fits(id, slot)) { ctx?.issue?.(`${slot}: dropped "${id}"`); worn[slot] = null; } else worn[slot] = id;
        }
      },
      reset() { for (const slot of Object.keys(worn)) worn[slot] = null; },
    },
    // Total of every worn item's `bonus`.
    bonuses() {
      const total = {};
      for (const id of Object.values(worn)) for (const [k, v] of Object.entries(defs[id]?.bonus ?? {})) total[k] = (total[k] ?? 0) + v;
      return total;
    },
  };
}
