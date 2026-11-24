import test from 'node:test';
import assert from 'node:assert/strict';
import { xpForCr, levelFor, progress, resolveProgression, DEFAULT_PROGRESSION } from '../../engine/rules/progression.js';
import { createCharacter } from '../../engine/rules/combat.js';
import { createMonster } from '../../engine/rules/stats.js';
import { lootBudget, lootPool, generateLoot, resolveLootRules } from '../../engine/rules/generate-loot.js';
import { resolveContents } from '../../engine/rules/loot.js';
import { addToStacks } from '../../engine/rules/inventory.js';
import { createSimulation } from '../../engine/sim/simulation.js';
import { books, engineBooks, campaign } from '../support.mjs';

const attrs = { strength: 6, vitality: 6, intellect: 4, agility: 5 };

test('what a creature is worth follows its challenge rating, and its own xp wins', () => {
  assert.deepEqual([1 / 8, 1 / 4, 1 / 2, 1, 2, 5].map(xpForCr), [3, 5, 10, 20, 45, 180]);
  assert.equal(createMonster(engineBooks.monsters, 'goblin', { x: 1, z: 1 }).xp, 5);
  assert.equal(createMonster({ imp: { ...engineBooks.monsters.goblin, xp: 77 } }, 'imp', { x: 1, z: 1 }).xp, 77);
});

test('levels come from experience on a curve the game can retune', () => {
  assert.deepEqual([0, 19, 20, 59, 60].map(xp => levelFor(xp)), [1, 1, 2, 2, 3]);
  assert.equal(levelFor(1e9), DEFAULT_PROGRESSION.maxLevel);
  assert.deepEqual(progress(40), { level: 2, xp: 40, from: 20, to: 60, fraction: 0.5 });
  assert.equal(progress(1e9).to, null);
  assert.equal(levelFor(30, resolveProgression({ xpToLevel: n => 100 * (n - 1) })), 1);
  assert.throws(() => resolveProgression({ xpToLevel: () => 5 }), /must need more experience/);
});

test('a level restores health and mana and earns skill points that raise attributes', () => {
  const hero = createCharacter(attrs);
  hero.hp = 3; hero.mp = 1;
  assert.deepEqual(hero.gain(10), { levels: 0, level: 1, points: 0 });
  assert.equal(hero.hp, 3);
  assert.equal(hero.spend('strength'), false, 'no points yet');
  assert.deepEqual(hero.gain(50), { levels: 2, level: 3, points: 4 });
  assert.equal(hero.hp, hero.maxHp); assert.equal(hero.mp, hero.maxMp);
  assert.equal(hero.unspent, 4);
  const attack = hero.attack;
  assert.equal(hero.spend('strength'), true); assert.equal(hero.spend('vitality'), true);
  assert.equal(hero.attrs.strength, 7); assert.equal(hero.unspent, 2);
  assert.ok(hero.attack > attack);
  assert.equal(hero.spend('luck'), false, 'not an attribute');
});

test('the hero saves experience and the points put into attributes, never the level or the attributes', () => {
  const hero = createCharacter(attrs);
  hero.gain(130); hero.spend('strength'); hero.spend('strength'); hero.spend('agility');
  const saved = hero.persistence.save();
  assert.equal(saved.xp, 130); assert.deepEqual(saved.grown, { strength: 2, vitality: 0, intellect: 0, agility: 1 });
  assert.equal('level' in saved, false);
  const again = createCharacter({ ...attrs, strength: 8 }); // the base was retuned
  again.persistence.load(JSON.parse(JSON.stringify(saved)));
  assert.equal(again.level, 4); assert.equal(again.attrs.strength, 10); assert.equal(again.unspent, 3);
  // a slower curve takes points back instead of leaving more than the level earned
  const slow = createCharacter(attrs, null, { progression: { pointsPerLevel: 1 } });
  slow.persistence.load(saved);
  assert.equal(slow.unspent, 0);
  assert.equal(Object.values(slow.attrs).reduce((a, b) => a + b, 0), 21 + 3);
  slow.persistence.reset(); assert.equal(slow.xp, 0);
  createCharacter(attrs).persistence.load({ xp: 'lots', grown: { strength: -4 } }); // junk is read as nothing
});

test('a loot budget grows with the creature, the level, the hero and luck', () => {
  const rules = resolveLootRules(), flat = () => 0.5; // 0.5 rolls the middle of the spread
  const troll = { cr: 5 }, rat = { cr: 1 / 8 };
  assert.equal(lootBudget(rat, { rules, random: flat }), 6 + 40 / 8);
  assert.equal(lootBudget(troll, { rules, random: flat }), 206);
  assert.equal(lootBudget(troll, { rules, random: flat, lootScale: 2 }), 412);
  assert.ok(lootBudget(troll, { rules, random: flat, heroLevel: 5 }) > 206);
  assert.ok(lootBudget(troll, { rules, random: flat, luck: 2 }) > 206);
  assert.equal(lootBudget({ cr: 5, loot: { budget: 30 } }, { rules, random: flat }), 30, 'a declared budget replaces the formula');
  assert.equal(lootBudget({ budget: 12 }, { rules, random: () => 0 }), 6, 'the roll runs from 50% to 150%');
});

test('the pool holds what has a value, minus what never drops, gated by the hero level', () => {
  const ids = level => lootPool(books.items, level).map(e => e.id);
  assert.ok(ids(1).includes('health-potion'));
  assert.ok(!ids(1).includes('torch') && !ids(1).includes('scroll') && !ids(1).includes('mithril-mail') && !ids(1).includes('raven-amulet'));
  assert.ok(!ids(1).includes('steel-sword') && ids(3).includes('steel-sword'));
  assert.ok(!ids(9).includes('mithril-sword'));
});

test('generated loot spends the budget and never more', () => {
  const pool = [{ id: 'a', value: 10, weight: 1 }, { id: 'b', value: 30, weight: 1 }];
  const rules = resolveLootRules({ dropChance: 1, maxItems: 5 });
  for (let seed = 1; seed < 50; seed++) {
    let s = seed; const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const found = generateLoot(35, pool, { rules, random });
    assert.ok(found.reduce((sum, { item, qty }) => sum + pool.find(e => e.id === item).value * qty, 0) <= 35);
  }
  assert.deepEqual(generateLoot(5, pool, { rules, random: () => 0.1 }), [], 'nothing is affordable');
  assert.deepEqual(generateLoot(100, pool, { rules, random: () => 0.9, chance: 0.5 }), [], 'the drop chance can say no');
  assert.equal(generateLoot(100, pool, { rules: resolveLootRules({ dropChance: 1, maxItems: 2 }), random: () => 0 }).reduce((n, e) => n + e.qty, 0), 2);
});

test('a container may mix fixed contents, a table and generated loot', () => {
  const stacks = resolveContents({ contents: [{ item: 'torch' }], generate: { budget: 20 } }, (list, id, qty) => addToStacks(books.items, list, id, qty), () => 0,
    spec => [{ item: 'health-potion', qty: spec.budget / 10 }]);
  assert.deepEqual(stacks, [{ id: 'torch', qty: 1 }, { id: 'health-potion', qty: 2 }]);
});

// A creature killed by the hero gives experience, restores them on a level and leaves loot where it fell.
async function duel(kind, { scenario = {}, loot, progression, wounded = false } = {}) {
  const sim = await createSimulation({ campaign: { ...campaign, ...(loot ? { loot } : {}), ...(progression ? { progression } : {}) }, seed: 3, scenario: {
    level: 'dungeon', at: { x: 1, z: 1, dir: 2 }, clear: true, grace: 0, equip: ['iron-mace'], ...scenario,
    spawn: [{ kind, id: 'foe', x: 1, z: 2, dir: 0 }] } });
  const events = [];
  sim.on('*', e => events.push(e));
  if (wounded) sim.session.monsters.actors.find(a => a.id === 'foe').hp = 1;
  let guard = 0;
  while (!events.some(e => e.type === 'kill') && !sim.over && guard++ < 200) sim.attack('foe');
  return { sim, events };
}

test('a kill gives experience, and enough of it a level with health and mana restored', async () => {
  const { sim, events } = await duel('goblin', { scenario: { hero: { xp: 18 } } });
  const kill = events.find(e => e.type === 'kill');
  assert.equal(kill.xp, 5);
  assert.deepEqual(events.filter(e => e.type === 'xp').map(e => [e.amount, e.xp, e.level]), [[5, 23, 2]]);
  assert.equal(events.filter(e => e.type === 'level-up').length, 1);
  assert.equal(sim.hero.level, 2); assert.equal(sim.hero.unspent, 2);
  assert.equal(sim.spend('strength').ok, true);
  assert.deepEqual(sim.spend('nonsense'), { ok: false, reason: 'unknown' });
  sim.spend('strength');
  assert.deepEqual(sim.spend('strength'), { ok: false, reason: 'no-points' });
});

test('a creature leaves what its budget buys on the floor of its tile, which the hero can pick up', async () => {
  const { sim, events } = await duel('ogre', { wounded: true, scenario: { hero: { xp: 400 } }, loot: { dropChance: 1 } });
  const loot = events.find(e => e.type === 'loot');
  assert.ok(loot, 'the ogre left something');
  assert.equal(loot.source.kind, 'ogre');
  assert.ok(loot.items.some(i => i.item === 'health-potion'), 'its own specific potion');
  assert.deepEqual(loot.at, { x: 1, z: 2 });
  assert.ok(loot.value > 0);
  assert.equal(sim.session.piles.get('dungeon:1,2').length > 0, true);
  sim.forward();
  assert.equal(sim.state().pile, true);
  assert.equal(sim.interact().container.title, 'On the floor');
});

test('a creature with loot: false leaves nothing, and the same seed leaves the same things', async () => {
  const { events } = await duel('rat', { loot: { dropChance: 1 } });
  assert.equal(events.some(e => e.type === 'loot'), false);
  const a = (await duel('goblin', { loot: { dropChance: 1 } })).events.find(e => e.type === 'loot');
  const b = (await duel('goblin', { loot: { dropChance: 1 } })).events.find(e => e.type === 'loot');
  assert.deepEqual(a?.items, b?.items);
});
