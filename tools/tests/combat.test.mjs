import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveStats, createCharacter, hitChance, strike, createCooldown } from '../../engine2d/combat.js';
import { createEquipment } from '../../engine2d/equipment.js';
import { createInventory } from '../../engine2d/inventory.js';
import { itemDefs } from '../../game-2/items.js';
import { dungeon } from '../../game-2/dungeon.js';

const attrs = { strength: 6, vitality: 6, intellect: 4, agility: 5 };
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

test('attributes derive HP, MP, attack and defence', () => {
  assert.deepEqual(deriveStats(attrs), { maxHp: 58, maxMp: 24, attack: 8, defence: 2, accuracy: 5, evasion: 5 });
  assert.equal(deriveStats(attrs, { attack: 4, defence: 3 }).attack, 12);
  assert.equal(deriveStats({ ...attrs, vitality: 10 }).maxHp, 78);
});

test('the hero starts at full health and its stats follow what is worn', () => {
  const pack = createInventory(itemDefs, { size: 4 }), gear = createEquipment(itemDefs);
  const hero = createCharacter(attrs, gear);
  assert.deepEqual([hero.hp, hero.maxHp, hero.mp, hero.maxMp, hero.attack, hero.defence], [58, 58, 24, 24, 8, 2]);
  pack.add('sword'); pack.add('shield'); gear.equip(pack, 0); gear.equip(pack, 1);
  assert.deepEqual([hero.attack, hero.defence], [12, 4]);
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
  assert.deepEqual(strike({ attack: 10, accuracy: 5 }, { defence: 0, evasion: 5 }, seq(.9)), { hit: false, damage: 0 });
  assert.deepEqual(strike({ attack: 10, accuracy: 5 }, { defence: 0, evasion: 5 }, seq(.1, 0)), { hit: true, damage: 8 });
  assert.deepEqual(strike({ attack: 10, accuracy: 5 }, { defence: 0, evasion: 5 }, seq(.1, 1)), { hit: true, damage: 12 });
  assert.equal(strike({ attack: 1, accuracy: 5 }, { defence: 50, evasion: 5 }, seq(.1, .5)).damage, 1);
});

test('a cooldown makes an action wait', () => {
  const c = createCooldown(700);
  assert.equal(c.ready(0), true); c.use(0);
  assert.equal(c.ready(699), false); assert.equal(c.ready(700), true);
  c.use(700); c.reset(); assert.equal(c.ready(701), true);
});

test('the snake can be fought: several hits unarmed, fewer with the sword; it hurts the hero but not in one bite', () => {
  const snake = dungeon.monsters[0], hero = createCharacter(attrs, createEquipment(itemDefs));
  const hits = attack => Math.ceil(snake.hp / strike({ attack, accuracy: 5 }, snake, seq(.1, .5)).damage);
  assert.ok(hits(8) >= 4); assert.ok(hits(12) <= 3);
  const bite = strike({ attack: snake.damage, accuracy: snake.accuracy }, hero, seq(.1, .5)).damage;
  assert.ok(bite > 0 && bite * 3 < hero.maxHp);
  assert.ok(bite * 6 >= hero.maxHp); // it does win in the end if you never heal: potions matter
});
