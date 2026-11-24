import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../engine/core/rng.js';
import { createSession } from '../../engine/core/session.js';
import { createSimulation, prepareCampaign } from '../../engine/sim/simulation.js';
import { runBot, runBots, toCsv, compareReports, MEASURES } from '../../engine/sim/runner.js';
import { campaign } from '../support.mjs';
import { scenarios } from '../../games/ravensmoor/scenarios.js';
import fighter from '../../tools/bots/fighter.mjs';
import explorer from '../../tools/bots/explorer.mjs';
import randomWalker from '../../tools/bots/random-walker.mjs';

test('a seeded random repeats itself, and a different seed does not', () => {
  const take = rng => Array.from({ length: 5 }, rng);
  assert.deepEqual(take(createRng(7)), take(createRng(7)));
  assert.deepEqual(take(createRng('7')), take(createRng(7)), 'a number-like string is that number');
  assert.notDeepEqual(take(createRng(7)), take(createRng(8)));
  assert.ok(take(createRng('any text')).every(v => v >= 0 && v < 1));
});

test('a session plays without a screen: moves, walls and passages', () => {
  const { books, levels } = prepareCampaign(campaign);
  let time = 0;
  const session = createSession({ ...campaign, books, levels, random: createRng(1), clock: () => time });
  const events = [];
  session.on('*', e => events.push(e.type));
  session.begin();
  assert.deepEqual({ ...session.player, steps: 0 }, { x: 2, z: 3, dir: 0, steps: 0 });
  assert.equal(session.move('back').blocked, 'wall');
  assert.equal(session.move('right').moved, true);
  assert.equal(session.move('forward').moved, true); // (3,3)
  session.move('left'); session.move('forward'); session.move('right'); // (3,2) facing E, the Undercrypt door
  const { exit } = session.move('forward');
  assert.equal(exit.to, 'dungeon');
  session.travel(exit);
  assert.equal(session.levelId, 'dungeon');
  assert.ok(events.includes('level') && events.includes('blocked') && events.includes('move'));
  time += 10_000;
  assert.doesNotThrow(() => session.update(time));
});

test('the same seed and bot play the same run; another seed plays another', async () => {
  const play = seed => runBot({ campaign, bot: fighter, seed, scenario: scenarios.undercrypt, maxMs: 120_000 });
  const [a, b, c] = [await play(5), await play(5), await play(6)];
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.curve, c.curve);
});

test('actions take game time, and the creatures act meanwhile', async () => {
  const sim = await createSimulation({ campaign, scenario: { level: 'dungeon' } });
  assert.equal(sim.time, 0);
  sim.forward();
  assert.equal(sim.time, 180);
  sim.turnLeft();
  assert.equal(sim.time, 340);
  sim.wait(1000);
  assert.equal(sim.time, 1340);
  assert.deepEqual(sim.cast(), { ok: false, reason: 'no-spells' });
});

test('a scenario places the hero, gives and equips items and spawns creatures', async () => {
  const sim = await createSimulation({ campaign, scenario: {
    level: 'dungeon', at: { x: 1, z: 3, dir: 2 }, clear: true, hero: { name: 'Tester', spent: { strength: 3 }, hp: 20 },
    items: [{ item: 'health-potion', qty: 3 }], equip: ['sword'], flags: { 'test.flag': 1 },
    spawn: [{ kind: 'rat', id: 'arena-rat', x: 1, z: 5, dir: 0 }],
  } });
  const state = sim.state({ omniscient: true });
  assert.deepEqual(state.position, { x: 1, z: 3, dir: 2, facing: 'S' });
  assert.equal(state.hero.name, 'Tester');
  assert.equal(state.hero.hp, 20);
  assert.equal(state.hero.attrs.strength, 9);
  assert.equal(state.equipment.weapon, 'sword');
  assert.equal(state.inventory.find(s => s.id === 'health-potion').qty, 4); // one from the starting kit
  assert.deepEqual(state.monsters.map(m => m.id), ['arena-rat']);
  assert.equal(sim.flags.get('test.flag'), 1);
  assert.equal(sim.quaff('hp').ok, true);
  assert.equal(sim.state().hero.hp, 40);
});

test('a scenario starts from a save, which survives the round trip', async () => {
  const first = await createSimulation({ campaign, scenario: scenarios.undercrypt });
  first.forward(); first.forward();
  const save = first.snapshot();
  const second = await createSimulation({ campaign, scenario: { save } });
  assert.equal(second.level, 'dungeon');
  assert.deepEqual(second.position, first.position);
  assert.equal(second.equipment.worn.weapon, 'sword');
});

test('the bot sees what is in front of it, not the whole level', async () => {
  const sim = await createSimulation({ campaign, scenario: { level: 'dungeon', at: { x: 1, z: 1, dir: 2 }, clear: true,
    spawn: [{ kind: 'rat', id: 'near', x: 1, z: 3, dir: 0 }, { kind: 'rat', id: 'far', x: 9, z: 9, dir: 0 }] } });
  assert.deepEqual(sim.monsters().map(m => m.id), ['near']);
  assert.deepEqual(sim.state({ omniscient: true }).monsters.map(m => m.id).sort(), ['far', 'near']);
  sim.turnLeft();
  assert.deepEqual(sim.monsters().map(m => m.id), []);
  assert.equal(sim.view()[0].d, 0);
  assert.ok(sim.map().rows.every(row => row.length === 17));
  assert.deepEqual(sim.path({ x: 1, z: 2 }), [2]);
});

test('fights emit events; death ends a run unless the scenario respawns', async () => {
  const duel = { level: 'dungeon', at: { x: 1, z: 1, dir: 2 }, clear: true, grace: 0, hero: { hp: 1 },
    spawn: [{ kind: 'troll', id: 'troll', x: 1, z: 2, dir: 0 }] };
  const sim = await createSimulation({ campaign, seed: 1, scenario: duel });
  sim.wait(30_000);
  assert.equal(sim.outcome, 'dead');
  const types = sim.drain().map(e => e.type);
  assert.ok(types.includes('death') && types.includes('damage-taken'));
  const again = await createSimulation({ campaign, seed: 1, scenario: duel, respawn: true });
  again.wait(30_000);
  assert.equal(again.over, false);
  assert.equal(again.level, 'village');
  assert.equal(again.hero.hp, again.hero.maxHp);
});

test('containers open, and taking from them is a pickup', async () => {
  const sim = await createSimulation({ campaign, scenario: { at: { x: 3, z: 2, dir: 0 } } });
  const { container } = sim.interact();
  assert.equal(container.title, 'Chest');
  const { taken } = sim.takeAll();
  assert.ok(taken.some(s => s.id === 'sword'));
  assert.ok(sim.drain().some(e => e.type === 'pickup' && e.item === 'sword'));
  assert.equal(sim.equip('sword').ok, true);
  assert.equal(sim.equipment.worn.weapon, 'sword');
});

test('the example bots play to the end and the fighter wins a duel', async () => {
  const report = await runBots({ campaign, bot: fighter, runs: 20, scenario: scenarios['snake-duel'] });
  assert.ok(report.summary.winRate >= 0.9, `the armed hero beats one snake (won ${report.summary.winRate})`);
  for (const bot of [explorer, randomWalker]) {
    const run = await runBot({ campaign, bot, seed: 3, scenario: scenarios.undercrypt, maxMs: 60_000 });
    assert.ok(['won', 'dead', 'timeout'].includes(run.outcome));
    assert.ok(run.time > 0);
  }
});

test('reports summarise runs, write CSV and compare', async () => {
  const a = await runBots({ campaign, bot: fighter, runs: 4, scenario: scenarios.undercrypt, maxMs: 60_000, sampleMs: 5000 });
  const b = await runBots({ campaign, bot: fighter, runs: 4, seed: 50, scenario: scenarios.undercrypt, maxMs: 60_000, sampleMs: 5000 });
  assert.equal(a.summary.runs, 4);
  assert.equal(Object.values(a.summary.outcomes).reduce((x, y) => x + y, 0), 4);
  assert.ok(a.summary.measures.kills.mean > 0);
  assert.ok(a.summary.levels.dungeon.kills > 0);
  assert.equal(a.summary.curve[0].t, 0);
  assert.equal(a.summary.curve[1].t, 5000);
  const csv = toCsv(a.runs).trim().split('\n');
  assert.equal(csv.length, 5);
  assert.deepEqual(csv[0].split(','), ['seed', 'outcome', 'survived', 'level', ...MEASURES]);
  const rows = compareReports(a, b);
  assert.ok(rows.some(r => r.metric === 'kills (mean)'));
  assert.deepEqual(compareReports(a, a).filter(r => r.delta !== 0), []);
});
