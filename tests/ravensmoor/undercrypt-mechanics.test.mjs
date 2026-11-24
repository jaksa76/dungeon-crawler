import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../../engine/index.js';
import { campaign } from '../../games/ravensmoor/campaign.js';

const start = (at, scenario = {}) => createSimulation({ campaign, scenario: { level: 'dungeon', at, clear: true, ...scenario } });

test('the warded gate needs the iron key found in the warden’s lockbox', async () => {
  const sim = await start({ x: 15, z: 15, dir: 2 });
  assert.equal(sim.forward().reason, 'locked');
  sim.interact();
  assert.equal(sim.forward().reason, 'locked');
  assert.equal(sim.walkTo({ x: 11, z: 1 }, { known: false }).ok, true);
  sim.face(1);
  assert.equal(sim.interact().container.title, 'Warden’s lockbox');
  assert.equal(sim.take(0).ok, true);
  assert.equal(sim.inventory.count('key'), 1);
  assert.equal(sim.walkTo({ x: 15, z: 15 }, { known: false }).ok, true);
  sim.face(2);
  sim.interact();
  assert.equal(sim.forward().ok, true);
  assert.equal(sim.session.api.find('dungeon', 'seal-gate').isOpen(), true);
});

test('the concealed door leads to a working pressure plate and a gold cache', async () => {
  const sim = await start({ x: 3, z: 15, dir: 2 });
  assert.equal(sim.forward().reason, 'wall');
  sim.interact();
  assert.equal(sim.forward().ok, true);
  assert.equal(sim.forward().ok, true);
  const grate = sim.session.api.find('dungeon', 'plate-gate');
  assert.equal(grate.isOpen(), false);
  assert.equal(sim.strafeRight().ok, true);
  assert.equal(grate.isOpen(), true);
  assert.equal(sim.walkTo({ x: 5, z: 17 }, { known: false }).ok, true);
  sim.face(1);
  assert.equal(sim.interact().container.title, 'Hidden coffer');
  assert.equal(sim.takeAll().ok, true);
  assert.equal(sim.session.wallet.amount, 30);
});

test('the dart trap damages an unwary hero and stays disarmed after a reload', async () => {
  const at = { x: 13, z: 15, dir: 1 };
  const hot = await start(at);
  const hp = hot.hero.hp;
  hot.forward();
  assert.equal(hot.hero.hp, hp - 9);
  assert.ok(hot.events.some(event => event.type === 'damage-taken' && event.source.kind === 'dart'));

  const wary = await start(at);
  wary.interact();
  assert.match(wary.messages.at(-1), /loose tile/);
  wary.interact();
  assert.match(wary.messages.at(-1), /disarm/);
  const restored = await start(at, { save: wary.snapshot() });
  const restoredHp = restored.hero.hp;
  restored.forward();
  assert.equal(restored.hero.hp, restoredHp);
});

test('a live Seal Warden guards the Raven Seal reliquary', async () => {
  const sim = await start({ x: 12, z: 19, dir: 3 }, { clear: false, grace: 60000, equip: ['iron-mace'] });
  assert.equal(sim.interact().container, null);
  assert.match(sim.messages.at(-1), /warden still binds/);
  const warden = sim.session.api.find('dungeon', 'seal-warden');
  assert.equal(sim.walkTo({ x: 13, z: 18 }, { known: false }).ok, true);
  sim.face(1);
  warden.hp = 1;
  for (let i = 0; i < 8 && !warden.state.dead; i++) sim.attack(warden.id);
  assert.equal(warden.state.dead, true);
  assert.equal(sim.walkTo({ x: 12, z: 19 }, { known: false }).ok, true);
  sim.face(3);
  assert.deepEqual(sim.interact().container.stacks, [{ id: 'raven-seal', qty: 1 }]);
  assert.equal(sim.take(0).ok, true);
  assert.equal(sim.inventory.count('raven-seal'), 1);
});
