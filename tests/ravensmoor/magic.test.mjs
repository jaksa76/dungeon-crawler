// Ravensmoor's magic (games/ravensmoor/content/magic.js): the first spell comes from the village chest, every spell can be
// learned from something, the enchanted gear exists at every tier, and a bot that casts does better than one that does not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runBots } from '../../engine/sim/runner.js';
import { createSimulation } from '../../engine/sim/simulation.js';
import { campaign, levels, books } from '../support.mjs';
import { scenarios } from '../../games/ravensmoor/scenarios.js';
import fighter from '../../tools/bots/fighter.mjs';
import caster from '../../tools/bots/caster.mjs';

test('the village chest holds a scroll that teaches the fire bolt, which can then be cast', async () => {
  const chest = levels.village.level.entities.find(e => e.id === 'start-chest');
  assert.ok(chest.behavior.contents.some(c => c.item === 'scroll-firebolt'));
  const sim = await createSimulation({ campaign, scenario: { level: 'dungeon', at: { x: 1, z: 1, dir: 2 }, clear: true, items: [{ item: 'scroll-firebolt' }],
    spawn: [{ kind: 'goblin', id: 'g', x: 1, z: 3, dir: 0 }] } });
  assert.deepEqual(sim.session.known, []);
  assert.equal(sim.use('scroll-firebolt').consumed, true);
  assert.equal(sim.cast('firebolt').ok, true);
});

test('every spell can be learned from a book or scroll, and every book teaches a spell that exists', () => {
  const teachers = Object.values(books.items).filter(i => i.teaches);
  for (const id of Object.keys(books.spells)) assert.ok(teachers.some(i => i.teaches === id), `nothing teaches ${id}`);
  for (const item of teachers) assert.ok(books.spells[item.teaches]);
});

test('enchanted gear comes in every tier, in the colour of its magic, and costs more than the plain item', () => {
  const enchanted = Object.entries(books.items).filter(([, i]) => i.enchant);
  assert.deepEqual([...new Set(enchanted.map(([, i]) => i.enchant.tier))].sort(), [1, 2, 3, 4]);
  for (const [id, item] of enchanted) {
    assert.match(books.damageTypes[item.enchant.type].colour, /^#[0-9a-f]{6}$/i, id);
    assert.ok(books.damageTypes[item.enchant.type].magic, id);
    if (item.family) assert.ok(item.value > books.items[`${item.material}-${item.family}`].value, `${id} should be worth more`);
  }
  assert.equal(books.items['iron-sword-dawn'].drop, false, 'the best is not left by creatures');
});

test('the Undercrypt hoard holds an enchanted sword and a scroll', () => {
  const hoard = levels.dungeon.level.entities.find(e => e.id === 'crypt-hoard');
  assert.ok(hoard.behavior.contents.some(c => books.items[c.item].enchant));
  assert.ok(hoard.behavior.contents.some(c => books.items[c.item].teaches));
});

test('some creatures resist a kind of magic, so the right spell matters', async () => {
  const { monsters } = books;
  assert.ok(monsters.zombie.resist.fire > 1 && monsters.zombie.resist.frost < 1);
  assert.deepEqual(monsters.skeleton.immune, ['poison']);
  assert.ok(monsters.snake.resist.frost > 1);
  assert.equal(monsters.spider.onHit.effect, 'poisoned');
});

test('a bot that casts kills more than one that does not, with the same seeds', async () => {
  const run = bot => runBots({ campaign, bot, runs: 40, scenario: scenarios.undercrypt, maxMs: 180_000 });
  const [plain, magic] = [await run(fighter), await run(caster)];
  assert.ok(magic.summary.measures.kills.mean > plain.summary.measures.kills.mean, `${magic.summary.measures.kills.mean} against ${plain.summary.measures.kills.mean}`);
});
