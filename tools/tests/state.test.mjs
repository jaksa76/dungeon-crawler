import test from 'node:test';
import assert from 'node:assert/strict';
import { captureState, restoreState, migrate, createSaveStore, STATE_VERSION } from '../../engine2d/state.js';
import { createInventory, addToStacks } from '../../engine2d/inventory.js';
import { createEquipment } from '../../engine2d/equipment.js';
import { createCharacter } from '../../engine2d/combat.js';
import { itemDefs } from '../../game-2/items.js';

const world = () => {
  const equipment = createEquipment(itemDefs), inventory = createInventory(itemDefs, { size: 16 });
  const hero = createCharacter({ strength: 6, vitality: 6, intellect: 4, agility: 5 }, equipment);
  return { defs: itemDefs, hero, inventory, equipment, containers: new Map(), piles: new Map() };
};
const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

test('a captured state survives JSON and restores the same hero, pack, worn items, containers and map', () => {
  const a = world();
  a.inventory.add('health-potion', 3); a.inventory.add('sword');
  a.equipment.equip(a.inventory, a.inventory.slots.findIndex(s => s?.id === 'sword'));
  a.hero.hp = 11; a.hero.mp = 3;
  const chest = addToStacks(itemDefs, [], 'torch', 2), pile = addToStacks(itemDefs, [], 'key');
  a.containers.set('crypt:3,4,N', chest); a.piles.set('village:1,1', pile);
  const state = captureState({ levelId: 'crypt', p: { x: 3, z: 4, dir: 2 }, ...a, explored: { crypt: new Set(['1,1', '1,2']) }, flags: { met: true } }, 123);
  const b = world();
  const restored = restoreState(JSON.parse(JSON.stringify(state)), b);
  assert.deepEqual(b.inventory.slots, a.inventory.slots);
  assert.deepEqual(b.equipment.worn, a.equipment.worn);
  assert.equal(b.hero.hp, 11); assert.equal(b.hero.mp, 3);
  assert.deepEqual(b.containers.get('crypt:3,4,N'), chest);
  assert.deepEqual(b.piles.get('village:1,1'), pile);
  assert.equal(restored.levelId, 'crypt'); assert.deepEqual(restored.position, { x: 3, z: 4, dir: 2 });
  assert.deepEqual(restored.explored.get('crypt'), ['1,1', '1,2']); assert.deepEqual(restored.flags, { met: true });
});

test('items and slots that no longer exist are dropped, and a save is never a corpse', () => {
  const a = world();
  const state = captureState({ levelId: 'v', p: { x: 0, z: 0, dir: 0 }, ...a });
  state.inventory[0] = { id: 'removed-item', qty: 1 }; state.inventory[1] = { id: 'torch', qty: 99 };
  state.equipment.weapon = 'health-potion'; state.hero.hp = 0;
  const b = world(); restoreState(state, b);
  assert.equal(b.inventory.used, 0); assert.equal(b.equipment.worn.weapon, null); assert.equal(b.hero.hp, b.hero.maxHp);
});

test('old saves are migrated step by step; unknown, newer or broken ones are refused', () => {
  const migrations = { 1: s => ({ ...s, flags: {} }), 2: s => ({ ...s, locations: [] }) };
  const out = migrate({ version: 1, levelId: 'v' }, { version: 3, migrations });
  assert.deepEqual(out, { version: 3, levelId: 'v', flags: {}, locations: [] });
  assert.equal(migrate({ version: 4 }, { version: 3, migrations }), null);
  assert.equal(migrate({ version: 1 }, { version: 3, migrations: { 1: s => s } }), null); // gap
  assert.equal(migrate(null), null); assert.equal(migrate({}), null);
});

test('the store round-trips, and survives missing, full, blocked or corrupt storage', () => {
  const a = world(), state = captureState({ levelId: 'v', p: { x: 1, z: 2, dir: 3 }, ...a });
  const store = createSaveStore(memory(), 'k');
  assert.equal(store.has(), false); assert.equal(store.load(), null);
  assert.equal(store.save(state), true); assert.equal(store.has(), true);
  assert.equal(store.load().version, STATE_VERSION); assert.deepEqual(store.load().position, { x: 1, z: 2, dir: 3 });
  store.clear(); assert.equal(store.load(), null);
  const bad = memory(); bad.setItem('k', '{not json'); assert.equal(createSaveStore(bad, 'k').load(), null);
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('denied'); } };
  const s = createSaveStore(blocked, 'k'); assert.equal(s.load(), null); assert.equal(s.save(state), false);
  assert.equal(createSaveStore(null, 'k').save(state), false);
});
