import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventory } from '../../engine/rules/inventory.js';
import { createEquipment, equipSlots } from '../../engine/rules/equipment.js';
import { engineBooks } from '../support.mjs';

const itemDefs = engineBooks.items;

const setup = (size = 4) => { const pack = createInventory(itemDefs, { size }); return { pack, gear: createEquipment(itemDefs) }; };

test('equip takes the item out of the pack and into its slot', () => {
  const { pack, gear } = setup(); pack.add('sword');
  const r = gear.equip(pack, 0);
  assert.equal(r.ok, true); assert.equal(gear.worn.weapon, 'sword'); assert.equal(pack.count('sword'), 0);
  assert.deepEqual(gear.bonuses(), { attack: 4 });
});

test('an item only fits its own slot; others are refused and nothing changes', () => {
  const { pack, gear } = setup(); pack.add('sword');
  assert.equal(gear.equip(pack, 0, 'shield').ok, false);
  assert.equal(gear.equip(pack, 0, 'head').ok, false);
  assert.equal(pack.count('sword'), 1);
  assert.equal(gear.equip(pack, 1).ok, false); // empty slot
  pack.add('health-potion');
  assert.equal(gear.equip(pack, 1).ok, false); // not wearable
});

test('equipping over something swaps it back into the pack', () => {
  const { pack, gear } = setup(1); pack.add('sword'); gear.equip(pack, 0);
  pack.add('sword'); // a second one
  assert.equal(gear.equip(pack, 0).ok, true);
  assert.equal(pack.count('sword'), 1); assert.equal(gear.worn.weapon, 'sword');
});

test('a full pack refuses a swap that would need a free slot, and keeps everything', () => {
  const defs = { ammo: { name: 'Ammo', slot: 'weapon', stack: 2 }, rock: { name: 'Rock' }, old: { name: 'Old', slot: 'weapon' } };
  const pack = createInventory(defs, { size: 2 }), gear = createEquipment(defs);
  pack.add('old'); gear.equip(pack, 0); pack.add('ammo', 2); pack.add('rock');
  const r = gear.equip(pack, 0);
  assert.equal(r.ok, false); assert.equal(pack.count('ammo'), 2); assert.equal(gear.worn.weapon, 'old');
});

test('unequip returns the item to the pack, to a chosen empty slot if asked', () => {
  const { pack, gear } = setup(); pack.add('sword'); gear.equip(pack, 0);
  assert.equal(gear.unequip(pack, 'weapon', 3).ok, true);
  assert.equal(pack.slots[3].id, 'sword'); assert.equal(gear.worn.weapon, null);
  assert.equal(gear.unequip(pack, 'weapon').ok, false);
});

test('unequip fails when the pack is full', () => {
  const { pack, gear } = setup(1); pack.add('sword'); gear.equip(pack, 0); pack.add('torch');
  assert.equal(gear.unequip(pack, 'weapon').ok, false); assert.equal(gear.worn.weapon, 'sword');
});

test('every wearable item names a real slot, and both ring slots accept rings', () => {
  const accepted = new Set(equipSlots.map(s => s.accepts ?? s.id));
  for (const [id, def] of Object.entries(itemDefs)) if (def.slot) assert.ok(accepted.has(def.slot), id);
  const g = createEquipment({ ring: { slot: 'ring', name: 'r' } });
  assert.equal(g.fits('ring', 'ring1'), true); assert.equal(g.fits('ring', 'ring2'), true); assert.equal(g.fits('ring', 'head'), false);
});
