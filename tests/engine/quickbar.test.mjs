import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickBar } from '../../engine/rules/quickbar.js';
import { createSimulation } from '../../engine/sim/simulation.js';
import { createPersistence } from '../../engine/core/persistence.js';
import { books, campaign } from '../support.mjs';

const potion = { kind: 'item', id: 'health-potion' }, mana = { kind: 'item', id: 'mana-potion' }, bolt = { kind: 'spell', id: 'firebolt' };
const bar = () => createQuickBar({ itemDefs: books.items, spells: books.spells });
const bare = { ...campaign, startingItems: [] }; // nothing in the pack to begin with
const start = (scenario = {}, game = bare) => createSimulation({ campaign: game, seed: 3, scenario: { level: 'dungeon', at: { x: 1, z: 1, dir: 2 }, clear: true, grace: 0, ...scenario } });

test('a slot names an item or a spell, and the same thing is never on the bar twice', () => {
  const b = bar();
  assert.equal(b.size, 8);
  assert.ok(b.set(0, potion)); assert.ok(b.set(3, bolt));
  assert.equal(b.set(8, potion), false, 'there is no ninth slot');
  assert.equal(b.set(1, { kind: 'item', id: 'no-such-thing' }), false);
  assert.equal(b.set(1, { kind: 'item', id: 'iron-key' }), false, 'a key does nothing when pressed');
  assert.ok(b.set(5, potion));
  assert.deepEqual(b.slots.map(s => s?.id ?? null), [null, null, null, 'firebolt', null, 'health-potion', null, null], 'it moved from slot 1 to slot 6');
});

test('putting something on a taken slot swaps when it came from the bar', () => {
  const b = bar();
  b.set(0, potion); b.set(1, mana); b.set(0, mana);
  assert.deepEqual([b.get(0).id, b.get(1).id], ['mana-potion', 'health-potion']);
  assert.ok(b.swap(0, 7)); assert.equal(b.get(0), null); assert.equal(b.get(7).id, 'mana-potion');
});

test('auto-fill takes the first free slot once, and not again after the player cleared it', () => {
  const b = bar();
  b.set(0, bolt);
  assert.equal(b.autoFill(potion), 1);
  assert.equal(b.autoFill(potion), -1, 'already there');
  b.clear(1);
  assert.equal(b.autoFill(potion), -1, 'cleared by hand: it stays off');
  assert.equal(b.autoFill(mana), 1);
});

test('the bar is saved as what the player chose and survives an item rename', () => {
  const b = bar();
  b.set(2, potion); b.set(4, bolt);
  const saved = JSON.parse(JSON.stringify(b.persistence.save()));
  assert.deepEqual(saved.slots, [null, null, { item: 'health-potion' }, null, { spell: 'firebolt' }, null, null, null]);
  const other = bar(), issues = [];
  other.persistence.load({ slots: [{ item: 'gone' }, { spell: 'firebolt' }], offered: [] }, { issue: m => issues.push(m) });
  assert.equal(other.get(1).id, 'firebolt'); assert.equal(issues.length, 1);
  const renamed = createQuickBar({ itemDefs: { ...books.items, 'old-potion': undefined }, spells: books.spells, canonical: id => (id === 'old-potion' ? 'health-potion' : id) });
  renamed.persistence.load({ slots: [{ item: 'old-potion' }] });
  assert.equal(renamed.get(0).id, 'health-potion');
});

test('a new game starts with the bar filled from the starting items, health first', async () => {
  const sim = await start({}, campaign);
  assert.deepEqual(sim.quickbar().map(s => s?.id ?? null).slice(0, 3), ['health-potion', 'mana-potion', null], 'so keys 1 and 2 still mean the two potions');
  assert.equal((await start()).quickbar().filter(Boolean).length, 0, 'an empty pack means an empty bar');
});

test('picking up the first potion and learning the first spell fill the bar by themselves', async () => {
  const sim = await start({ items: [{ item: 'mana-potion', qty: 1 }] });
  const events = []; sim.on('quickbar', e => events.push(e));
  sim.drop('mana-potion'); sim.interact();            // a pile here
  sim.session.openPile();
  assert.deepEqual(sim.take(0), { ok: true, qty: 1 });
  assert.equal(sim.quickbar()[0].id, 'mana-potion');
  sim.learn('firebolt');
  assert.equal(sim.quickbar()[1].id, 'firebolt');
  assert.equal(events.length, 2);
  sim.clearQuick(0);
  sim.drop('mana-potion'); sim.session.openPile(); sim.take(0);
  assert.equal(sim.quickbar()[0], null, 'cleared by hand, it does not fill again');
});

test('pressing a potion slot drinks it; an empty or used-up slot says so and keeps its place', async () => {
  const sim = await start({ items: [{ item: 'health-potion', qty: 1 }], hero: { hp: 5 } });
  sim.setQuick(0, potion);
  const hp = sim.hero.hp;
  assert.equal(sim.quick(0).ok, true);
  assert.ok(sim.hero.hp > hp);
  assert.equal(sim.quickbar()[0].count, 0);
  assert.equal(sim.quickbar()[0].usable, false);
  assert.deepEqual(sim.quick(0), { ok: false, reason: 'none' });
  assert.deepEqual(sim.quick(3), { ok: false, reason: 'empty' });
  sim.session.inventory.add('health-potion', 1);
  assert.equal(sim.quickbar()[0].usable, true, 'the slot refills when the item comes back');
});

test('pressing a spell slot casts it, and the slot shows the cooldown and the mana it needs', async () => {
  const sim = await start({ spells: ['firebolt'], hero: { xp: 120 }, spawn: [{ kind: 'goblin', id: 'foe', x: 1, z: 3, dir: 0 }] });
  sim.setQuick(2, bolt);
  const mp = sim.hero.mp;
  const r = sim.quick(2);
  assert.equal(r.ok, true); assert.ok(sim.hero.mp < mp);
  const view = sim.quickbar()[2];
  assert.equal(view.cost, 5);
  assert.ok(view.cooldown > 0 && view.reason === 'cooldown', 'cooling down');
  sim.wait(2000);
  assert.equal(sim.quickbar()[2].usable, true);
});

test('pressing a weapon slot wears it', async () => {
  const sim = await start({ items: [{ item: 'rusty-sword', qty: 1 }] });
  assert.ok(sim.setQuick(0, { kind: 'item', id: 'rusty-sword' }).ok);
  assert.equal(sim.quick(0).ok, true);
  assert.equal(sim.session.equipment.worn.weapon, 'rusty-sword');
  assert.equal(sim.quickbar()[0].worn, true);
});

test('an old save without a bar gets one from the pack and the spells; a save with one keeps it', async () => {
  const sim = await start({ spells: ['firebolt'], items: [{ item: 'mana-potion', qty: 1 }, { item: 'health-potion', qty: 1 }] });
  const snapshot = sim.snapshot();
  delete snapshot.sections.engine.quickbar;
  const old = await start({ save: snapshot }, campaign);
  assert.deepEqual(old.quickbar().map(s => s?.id ?? null).slice(0, 3), ['health-potion', 'mana-potion', 'firebolt'], 'health first, so the old 1 and 2 keys still mean the same');
  const mine = await start({ spells: ['firebolt'] });
  mine.setQuick(5, bolt);
  const again = await start({ save: mine.snapshot() });
  assert.equal(again.quickbar()[5].id, 'firebolt'); assert.equal(again.quickbar().filter(Boolean).length, 1);
});
