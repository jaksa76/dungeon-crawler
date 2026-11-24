import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistence, createSaveStore, peek, FORMAT } from '../../engine/core/persistence.js';
import { createInventory, stacksPersistence, addToStacks, checkItems } from '../../engine/rules/inventory.js';
import { createEquipment } from '../../engine/rules/equipment.js';
import { createCharacter } from '../../engine/rules/combat.js';
import { createExploration, createExplorationStore } from '../../engine/core/exploration.js';
import { createFlags } from '../../engine/core/flags.js';
import { engineBooks } from '../support.mjs';

const itemDefs = engineBooks.items;

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const cell = () => ({}); // an open field
const box = (id, extra = {}) => { const o = { value: 0, loads: [], resets: 0 };
  return Object.assign(o, { id, save: () => o.value, load(d) { o.value = d; o.loads.push(id); }, reset() { o.value = 0; o.resets++; } }, extra); };

test('sections are saved under their namespace and restored; a section added later is reset', async () => {
  const a = createPersistence({ now: () => 5 }), hero = box('hero'), quests = box('quests'); hero.value = 7; quests.value = { rat: 'done' };
  a.engine.register(hero); a.game.register(quests);
  const snap = JSON.parse(JSON.stringify(a.snapshot({ label: 'Crypt' })));
  assert.deepEqual(snap, { format: FORMAT, savedAt: 5, label: 'Crypt', sections: { engine: { hero: { v: 1, data: 7 } }, game: { quests: { v: 1, data: { rat: 'done' } } } } });
  const b = createPersistence(), h2 = box('hero'), q2 = box('quests'), later = box('later'); later.value = 9;
  b.engine.register(h2); b.game.register(q2); b.game.register(later);
  const { issues } = await b.restore(snap);
  assert.equal(h2.value, 7); assert.deepEqual(q2.value, { rat: 'done' }); assert.equal(later.resets, 1); assert.equal(later.value, 0); assert.deepEqual(issues, []);
});

test('engine and game ids cannot collide, and bad sections are refused', () => {
  const p = createPersistence(); p.engine.register(box('hero')); p.game.register(box('hero')); // same id, other namespace: fine
  assert.throws(() => p.game.register(box('hero')), /already registered/);
  assert.throws(() => p.game.register({ id: 'x' }), /save\(\) and load\(\)/);
  assert.throws(() => p.game.register(box('bad id')), /id of letters/);
  assert.throws(() => p.game.register(box('v', { version: 0 })), /bad version/);
});

test('sections load in dependency order, engine first; loops and unknown dependencies are errors', async () => {
  const p = createPersistence(), order = [];
  const mk = (id, extra) => ({ id, save: () => 1, load: () => { order.push(id); }, ...extra });
  p.game.register(mk('g1')); p.engine.register(mk('hero', { after: ['equipment'] })); p.engine.register(mk('equipment')); p.game.register(mk('g2', { after: ['engine.hero'] }));
  await p.restore(p.snapshot()); assert.deepEqual(order, ['equipment', 'hero', 'g1', 'g2']);
  const loop = createPersistence(); loop.engine.register(mk('a', { after: ['b'] })); loop.engine.register(mk('b', { after: ['a'] }));
  assert.throws(() => loop.names, /loop/);
  const lost = createPersistence(); lost.engine.register(mk('a', { after: ['nope'] }));
  assert.throws(() => lost.names, /not registered/);
});

test('sections migrate version by version; newer, unmigratable and failing data reset the section and report', async () => {
  const p = createPersistence(), s = box('s', { version: 3, migrate: { 1: d => ({ ...d, a: 1 }), 2: d => ({ ...d, b: 2 }) } });
  p.game.register(s);
  const env = v => ({ format: FORMAT, savedAt: 1, sections: { game: { s: { v, data: { start: true } } } } });
  assert.deepEqual((await p.restore(env(1))).issues, []); assert.deepEqual(s.value, { start: true, a: 1, b: 2 });
  assert.equal((await p.restore(env(4))).issues[0].problem, 'newer'); assert.equal(s.value, 0);
  const gap = createPersistence(), g = box('g', { version: 3, migrate: { 2: d => d } }); gap.game.register(g);
  assert.equal((await gap.restore({ format: FORMAT, sections: { game: { g: { v: 1, data: 1 } } } })).issues[0].problem, 'no-migration');
  const bad = createPersistence(), x = box('x', { load() { throw new Error('boom'); } }); bad.game.register(x);
  const r = await bad.restore({ format: FORMAT, sections: { game: { x: { v: 1, data: 1 } } } });
  assert.equal(r.issues[0].problem, 'failed'); assert.equal(x.resets, 1);
  await assert.rejects(p.restore({ nope: 1 }), TypeError);
});

test('sections nobody registered, or too new to read, are written back unchanged', async () => {
  const p = createPersistence(), s = box('s'); p.game.register(s);
  await p.restore({ format: FORMAT, savedAt: 1, sections: { engine: { old: { v: 1, data: [1] } }, game: { s: { v: 2, data: 5 }, mod: { v: 1, data: { keep: 'me' } } } } });
  const out = p.snapshot();
  assert.deepEqual(out.sections.game.mod, { v: 1, data: { keep: 'me' } });
  assert.deepEqual(out.sections.engine.old, { v: 1, data: [1] });
  assert.deepEqual(out.sections.game.s, { v: 1, data: 0 }); // the registered one is saved afresh
});

test('a snapshot is detached from live state, and the digest ignores the time', () => {
  let t = 1; const p = createPersistence({ now: () => t }), s = box('s'); s.value = { list: [1] }; p.game.register(s);
  const snap = p.snapshot(); s.value.list.push(2);
  assert.deepEqual(snap.sections.game.s.data, { list: [1] });
  const d1 = p.digest(p.snapshot()); t = 99; assert.equal(p.digest(p.snapshot()), d1);
  s.value = { list: [] }; assert.notEqual(p.digest(p.snapshot()), d1);
  s.value = () => 1; assert.equal(JSON.stringify(p.snapshot().sections.game.s), '{"v":1}'); // functions cannot be saved: nothing is stored
});

test('the engine components round-trip through the registry', async () => {
  const world = () => {
    const equipment = createEquipment(itemDefs), inventory = createInventory(itemDefs, { size: 16, start: [{ item: 'health-potion' }] });
    const hero = createCharacter({ strength: 6, vitality: 6, intellect: 4, agility: 5 }, equipment), flags = createFlags();
    const containers = new Map(), piles = new Map(), explorations = createExplorationStore();
    const p = createPersistence({ now: () => 1 });
    for (const part of [inventory, equipment, hero, explorations]) p.engine.register(part.persistence);
    p.engine.register(stacksPersistence('containers', itemDefs, containers)); p.engine.register(stacksPersistence('piles', itemDefs, piles));
    p.game.register(flags.persistence);
    return { p, inventory, equipment, hero, flags, containers, piles, explorations };
  };
  const a = world();
  a.inventory.add('sword'); a.inventory.add('torch', 2);
  a.equipment.equip(a.inventory, a.inventory.slots.findIndex(s => s?.id === 'sword'));
  a.hero.hp = 11; a.hero.mp = 3;
  a.containers.set('crypt:3,4,N', addToStacks(itemDefs, [], 'key')); a.piles.set('village:1,1', addToStacks(itemDefs, [], 'torch', 2));
  a.flags.set('quests.rat', { stage: 2 });
  const level = { exploration: { radius: 2 } }, e = createExploration(level, cell); a.explorations.attach('crypt', e); e.reveal({ x: 5, z: 5 });
  const snap = JSON.parse(JSON.stringify(a.p.snapshot()));

  const b = world(); b.flags.set('stray', 1);
  const e2 = createExploration(level, cell); b.explorations.attach('crypt', e2);
  const { issues } = await b.p.restore(snap);
  assert.deepEqual(issues, []);
  assert.deepEqual(b.inventory.slots, a.inventory.slots); assert.deepEqual(b.equipment.worn, a.equipment.worn);
  assert.equal(b.hero.hp, 11); assert.equal(b.hero.mp, 3);
  assert.deepEqual([...b.containers], [...a.containers]); assert.deepEqual([...b.piles], [...a.piles]);
  assert.deepEqual(b.flags.get('quests.rat'), { stage: 2 }); assert.equal(b.flags.has('stray'), false);
  assert.deepEqual([...e2.known].sort(), [...e.known].sort()); assert.ok(e2.known.size > 1);
  // levels loaded after the restore pick up their saved cells
  const e3 = createExploration(level, cell), c = world(); await c.p.restore(snap); c.explorations.attach('crypt', e3);
  assert.deepEqual([...e3.known].sort(), [...e.known].sort());
});

test('components drop what no longer exists and report it; hero saves its build, not its attributes, and is never a corpse', async () => {
  const equipment = createEquipment(itemDefs), inventory = createInventory(itemDefs, { size: 4 });
  const hero = createCharacter({ strength: 6, vitality: 6, intellect: 4, agility: 5 }, equipment), p = createPersistence();
  for (const part of [inventory, equipment, hero]) p.engine.register(part.persistence);
  const issues = [];
  const res = await p.restore({ format: FORMAT, sections: { engine: {
    inventory: { v: 1, data: [{ id: 'gone', qty: 1 }, { id: 'torch', qty: 99 }, { id: 'torch', qty: 2 }, null, { id: 'key', qty: 1 }] },
    equipment: { v: 1, data: { weapon: 'health-potion', head: 'leather-cap' } },
    hero: { v: 1, data: { hp: 0, mp: 'x' } } } } });
  issues.push(...res.issues);
  assert.deepEqual(inventory.slots, [null, null, { id: 'torch', qty: 2 }, null]);
  assert.equal(equipment.worn.weapon, null); assert.equal(equipment.worn.head, 'leather-cap');
  assert.equal(hero.hp, hero.maxHp); assert.equal(hero.mp, hero.maxMp);
  assert.equal(issues.length, 3); assert.deepEqual(Object.keys(hero.persistence.save()), ['name', 'spent', 'hp', 'mp']);
});

test('the hero loads after the equipment, so its limits already count worn gear', async () => {
  const defs = { ring: { name: 'R', type: 'x', description: 'd', icon: 'i', slot: 'amulet', bonus: {} } };
  const equipment = createEquipment(itemDefs), hero = createCharacter({ strength: 6, vitality: 6, intellect: 4, agility: 5 }, equipment), p = createPersistence();
  p.engine.register(hero.persistence); p.engine.register(equipment.persistence); // registered in the wrong order on purpose
  assert.deepEqual(p.names, ['engine.equipment', 'engine.hero']);
});

test('flags hold JSON values only and can be deleted', () => {
  const f = createFlags(); f.set('a.b', [1, { c: 2 }]); assert.deepEqual(f.get('a.b'), [1, { c: 2 }]); assert.equal(f.get('nope', 'dflt'), 'dflt');
  const v = f.get('a.b'); v.push(3); assert.deepEqual(f.get('a.b'), [1, { c: 2 }, 3]); // stored by reference after the first copy: fine, saved by value
  f.set('a.b', undefined); assert.equal(f.has('a.b'), false);
  assert.throws(() => f.set('', 1)); const loop = {}; loop.self = loop; assert.throws(() => f.set('x', loop));
});

test('save slots: list newest first, independent, and quiet when storage is missing, blocked or corrupt', () => {
  const store = createSaveStore(memory(), 'g'), env = (t, label) => ({ format: FORMAT, savedAt: t, label, sections: {} });
  assert.deepEqual(store.list(), []); assert.equal(store.load('slot-1'), null);
  assert.equal(store.save('slot-1', env(1, 'Village')), true); assert.equal(store.save('slot-2', env(5, 'Crypt')), true); store.save('slot-1', env(9, 'Village'));
  assert.deepEqual(store.list().map(s => [s.slot, s.label]), [['slot-1', 'Village'], ['slot-2', 'Crypt']]);
  assert.equal(store.has('slot-2'), true); store.clear('slot-2'); assert.deepEqual(store.list().map(s => s.slot), ['slot-1']);
  assert.equal(store.save('../evil', env(1)), false); assert.equal(store.load('bad slot'), null);
  const m = memory(); m.setItem('g:slot:slot-1', '{not json'); m.setItem('g:slot:slot-2', JSON.stringify({ old: 1 })); m.setItem('g:slots', JSON.stringify(['slot-1', 'slot-2']));
  assert.deepEqual(createSaveStore(m, 'g').list(), []);
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('denied'); } };
  const b = createSaveStore(blocked, 'g'); assert.deepEqual(b.list(), []); assert.equal(b.save('slot-1', env(1)), false); assert.equal(b.load('slot-1'), null);
  assert.equal(createSaveStore(null, 'g').save('slot-1', env(1)), false);
});

test('peek reads a section without loading it', () => {
  const p = createPersistence(); p.engine.register(box('player', { save: () => ({ levelId: 'crypt' }) }));
  assert.equal(peek(p.snapshot(), 'engine.player').levelId, 'crypt'); assert.equal(peek(null, 'engine.player'), undefined);
});

test('the hero saves the points the player spent, so retuning the base reaches old heroes', async () => {
  const mk = base => { const equipment = createEquipment(itemDefs), hero = createCharacter(base, equipment, { name: 'Hero' }), p = createPersistence();
    p.engine.register(equipment.persistence); p.engine.register(hero.persistence); return { hero, p }; };
  const a = mk({ strength: 6, vitality: 6, intellect: 4, agility: 5 });
  a.hero.name = 'Mira'; a.hero.build({ strength: 2, agility: 1, vitality: -3, intellect: 1.5 }); // bad numbers count as 0
  assert.deepEqual(a.hero.spent, { strength: 2, vitality: 0, intellect: 0, agility: 1 });
  assert.equal(a.hero.attack, 8 - 2 + 2); // bare hands: 1-3, plus strength 8 - 2
  const snap = JSON.parse(JSON.stringify(a.p.snapshot()));
  assert.deepEqual(Object.keys(snap.sections.engine.hero.data).sort(), ['hp', 'mp', 'name', 'spent']);
  const b = mk({ strength: 8, vitality: 6, intellect: 4, agility: 5 }); // the game was retuned: base strength 6 -> 8
  await b.p.restore(snap);
  assert.equal(b.hero.name, 'Mira'); assert.equal(b.hero.attrs.strength, 10); assert.equal(b.hero.attrs.agility, 6);
  await b.p.restore({ format: FORMAT, sections: {} }); // a save without a hero section: back to the start
  assert.equal(b.hero.name, 'Hero'); assert.equal(b.hero.attrs.strength, 8);
});

test('renamed items load through their aliases; bad aliases are refused', async () => {
  const defs = { blade: { ...itemDefs.sword, aliases: ['sword'] }, 'health-potion': itemDefs['health-potion'] };
  const inv = createInventory(defs, { size: 4 }), eq = createEquipment(defs), map = new Map(), p = createPersistence();
  p.engine.register(inv.persistence); p.engine.register(eq.persistence); p.engine.register(stacksPersistence('piles', defs, map));
  const { issues } = await p.restore({ format: FORMAT, sections: { engine: {
    inventory: { v: 1, data: [{ id: 'sword', qty: 1 }] }, equipment: { v: 1, data: { weapon: 'sword' } }, piles: { v: 1, data: { 'v:1,1': [{ id: 'sword', qty: 1 }] } } } } });
  assert.deepEqual(issues, []); assert.equal(inv.slots[0].id, 'blade'); assert.equal(eq.worn.weapon, 'blade'); assert.equal(map.get('v:1,1')[0].id, 'blade');
  assert.throws(() => checkItems({ ...defs, other: { ...itemDefs.torch, aliases: ['blade'] } }), /bad aliases/);
});
