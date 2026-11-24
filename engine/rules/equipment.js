// What the hero wears. Pure logic, no DOM.
//
// `slots` is a list of { id, label, accepts?, ghost } (`accepts` defaults to the id: two ring slots both accept
// 'ring'). An item fits a slot when its definition says `slot: <accepts>`. Worn items are not in the pack.
//
// What worn items do in a fight (gear(), read by rules/combat.js):
//   a weapon:  damage: [min, max], speed (ms between blows), damageType
//   armour:    defence (taken off every blow), resist: { <damage type>: multiplier on damage taken }
//   anything:  bonus: { attack, defence }, added to the hero's damage and defence (rings, amulets)

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
    // What would be worn if `itemId` were put on (in `slotId`, or where equip() would put it): slot -> item id.
    preview(itemId, slotId = targetFor(itemId)) { return slotId ? { ...worn, [slotId]: itemId } : { ...worn }; },
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
      return { ok: true, slot: slotId, message: `You equip the ${name.toLowerCase()}.` };
    },
    // Take off what is in a slot and put it in the pack, in `toIndex` if that is empty. { ok, message }.
    unequip(inventory, slotId, toIndex = null) {
      const id = worn[slotOf(slotId).id];
      if (!id) return { ok: false, message: 'Nothing is worn there.' };
      if (toIndex !== null && !inventory.slots[toIndex]) inventory.slots[toIndex] = { id, qty: 1 };
      else if (inventory.add(id, 1) > 0) return { ok: false, message: 'Your pack is full.' };
      worn[slotId] = null;
      return { ok: true, message: `You take off the ${defs[id].name.toLowerCase()}.` };
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
    // What everything worn adds up to: { weapon, defence, resist, bonus }. `weapon` is the worn item with a damage
    // range (null for bare hands); resistances of several pieces multiply. `wearing` is what to add up instead of
    // what is worn (see preview()).
    gear(wearing = worn) {
      let weapon = null, defence = 0;
      const resist = {}, bonus = {};
      for (const id of Object.values(wearing)) {
        const def = defs[id];
        if (!def) continue;
        if (Array.isArray(def.damage)) weapon ??= def;
        defence += def.defence ?? 0;
        for (const [k, v] of Object.entries(def.resist ?? {})) resist[k] = (resist[k] ?? 1) * v;
        for (const [k, v] of Object.entries(def.bonus ?? {})) bonus[k] = (bonus[k] ?? 0) + v;
      }
      return { weapon, defence, resist, bonus };
    },
  };
}
