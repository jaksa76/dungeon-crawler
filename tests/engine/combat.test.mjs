import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveStats, createCharacter, hitChance, strike, createCooldown, compareStats, statDelta, FISTS } from '../../engine/rules/combat.js';
import { createEquipment } from '../../engine/rules/equipment.js';
import { createInventory } from '../../engine/rules/inventory.js';
import { engineBooks } from '../support.mjs';

const itemDefs = engineBooks.items;

const attrs = { strength: 6, vitality: 6, intellect: 4, agility: 5 };
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

test('attributes and what is worn derive HP, MP, damage and defence', () => {
  assert.deepEqual(deriveStats(attrs), { maxHp: 58, maxMp: 24, attack: 6, damage: [5, 7], damageType: null, attackMs: FISTS.speed,
    defence: 2, resist: {}, accuracy: 5, evasion: 5, luck: 0, spellPower: 0, elemental: null, onHit: null });
  const mace = { damage: [6, 10], speed: 850, damageType: 'blunt' };
  const armed = deriveStats(attrs, { weapon: mace, defence: 3, resist: { blade: 0.8 }, bonus: { attack: 1, defence: 1 } });
  assert.deepEqual(armed.damage, [11, 15]); // strength 6 adds 4, the ring 1
  assert.deepEqual([armed.attack, armed.attackMs, armed.damageType, armed.defence, armed.resist], [13, 850, 'blunt', 6, { blade: 0.8 }]);
  assert.equal(deriveStats({ ...attrs, vitality: 10 }).maxHp, 78);
});

test('the hero starts at full health and its stats follow what is worn', () => {
  const pack = createInventory(itemDefs, { size: 4 }), gear = createEquipment(itemDefs);
  const hero = createCharacter(attrs, gear);
  assert.deepEqual([hero.hp, hero.maxHp, hero.mp, hero.maxMp, hero.attack, hero.defence, hero.attackMs], [58, 58, 24, 24, 6, 2, FISTS.speed]);
  pack.add('sword'); pack.add('shield'); gear.equip(pack, 0); gear.equip(pack, 1);
  assert.deepEqual([hero.damage, hero.attack, hero.defence, hero.attackMs], [[10, 14], 12, 4, 700]);
  hero.hp = 1; hero.mp = 0; hero.restore();
  assert.deepEqual([hero.hp, hero.mp], [58, 24]);
  assert.equal(hero.alive, true); hero.hp = 0; assert.equal(hero.alive, false);
});

test('hit chance is 75% when level, moves with accuracy and stays within 20-95%', () => {
  assert.equal(hitChance(5, 5), 0.75);
  assert.ok(hitChance(9, 5) > hitChance(5, 5));
  assert.equal(hitChance(0, 99), 0.2); assert.equal(hitChance(99, 0), 0.95);
});

test('a roll above the chance misses; a hit does attack +-20% less defence, at least 1', () => {
  assert.deepEqual(strike({ attack: 10, accuracy: 5 }, { defence: 0, evasion: 5 }, seq(.9)), { hit: false, damage: 0, resisted: 1 });
  assert.deepEqual(strike({ attack: 10, accuracy: 5 }, { defence: 0, evasion: 5 }, seq(.1, 0)), { hit: true, damage: 8, resisted: 1 });
  assert.deepEqual(strike({ attack: 10, accuracy: 5 }, { defence: 0, evasion: 5 }, seq(.1, 1)), { hit: true, damage: 12, resisted: 1 });
  assert.equal(strike({ attack: 1, accuracy: 5 }, { defence: 50, evasion: 5 }, seq(.1, .5)).damage, 1);
});

test('a weapon rolls a whole number in its range; resistance to its damage type scales it before defence', () => {
  const hero = { damage: [10, 14], damageType: 'blunt', accuracy: 5 };
  assert.equal(strike(hero, { defence: 0, evasion: 5 }, seq(.1, 0)).damage, 10);
  assert.equal(strike(hero, { defence: 0, evasion: 5 }, seq(.1, .999)).damage, 14);
  assert.deepEqual(strike(hero, { defence: 2, evasion: 5, resist: { blunt: 1.5 } }, seq(.1, 0)), { hit: true, damage: 13, resisted: 1.5 });
  assert.equal(strike(hero, { defence: 0, evasion: 5, resist: { blade: 0.5 } }, seq(.1, 0)).damage, 10); // another type
  assert.equal(strike({ ...hero, damageType: null }, { defence: 0, evasion: 5, resist: { blunt: 0.5 } }, seq(.1, 0)).damage, 10);
});

test('the hero’s stats compare in words', () => {
  const before = deriveStats(attrs), after = deriveStats(attrs, { weapon: { damage: [6, 10], speed: 850, damageType: 'blunt' }, defence: 2, resist: { blade: 0.8 } });
  assert.deepEqual(compareStats(before, after, { blunt: { name: 'blunt' } }),
    ['damage 5–7 → 10–14 blunt', 'slower', 'defence 2 → 4', 'blade damage taken ×1 → ×0.8']);
  assert.deepEqual(compareStats(after, after), []);
  assert.deepEqual(statDelta(before, after), ['+6 damage', 'slower', '+2 defence', 'less blade damage taken']);
  assert.deepEqual(statDelta(after, after), []);
});

test('a cooldown makes an action wait', () => {
  const c = createCooldown(700);
  assert.equal(c.ready(0), true); c.use(0);
  assert.equal(c.ready(699), false); assert.equal(c.ready(700), true);
  c.use(700); c.reset(); assert.equal(c.ready(701), true);
  c.use(0, 300); assert.equal(c.ready(300), true); // a wait of its own
});
