import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../../engine/index.js';
import { campaign } from '../../games/ravensmoor/campaign.js';

test('dialogue choices reveal the market and change what villagers say after a save', async () => {
  const sim = await createSimulation({ campaign, scenario: { at: { x: 1, z: 1, dir: 0 } } });
  const first = sim.talk().dialogue;
  assert.equal(first.title, 'Town guard');
  assert.match(sim.choose(0).dialogue.text, /stranger by the chest/);
  assert.equal(sim.flags.get('ravensmoor:heard-guard'), true);
  assert.equal(sim.talk().dialogue.choices[1], 'Where does the west road lead?');
  assert.match(sim.choose(1).dialogue.text, /Greybridge/);
  assert.equal(sim.flags.get('ravensmoor:heard-of-market'), true);

  const resumed = await createSimulation({ campaign, scenario: { save: sim.snapshot(), at: { x: 1, z: 3, dir: 3 } } });
  assert.equal(resumed.flags.get('ravensmoor:heard-of-market'), true);
  assert.match(resumed.talk().dialogue.text, /So the guard told you/);
});

test('the stranger offers the Raven Seal quest, which can be completed and rewarded once', async () => {
  const at = { x: 3, z: 2, dir: 2 };
  const sim = await createSimulation({ campaign, scenario: { at } });
  assert.deepEqual(sim.journal(), []);
  assert.equal(sim.talk().dialogue.title, 'Hooded stranger');
  assert.equal(sim.inventory.count('raven-horn'), 1);
  assert.match(sim.choose(0).dialogue.text, /Sound the horn/);
  assert.equal(sim.journal()[0].status, 'active');
  assert.match(sim.journal()[0].objective, /Enter the Undercrypt/);
  sim.face(1);
  assert.equal(sim.forward().travelled, 'dungeon');
  assert.match(sim.journal()[0].objective, /warden’s key in the northern passage/);

  const resumed = await createSimulation({ campaign, scenario: { save: sim.snapshot(), items: [{ item: 'raven-seal' }] } });
  assert.match(resumed.journal()[0].objective, /Take the Raven Seal/);
  resumed.travel('village', at);
  const goldBefore = resumed.session.wallet.amount;
  assert.match(resumed.talk().dialogue.text, /Will you give it to me/);
  const handOver = resumed.session.dialogue.current.choices[0];
  assert.equal(resumed.choose(0).ok, true);
  assert.equal(handOver.choose(), false, 'a stale button cannot give the reward again');
  assert.equal(resumed.inventory.count('raven-seal'), 0);
  assert.equal(resumed.session.wallet.amount, goldBefore + 40);
  assert.equal(resumed.journal()[0].status, 'completed');
  assert.equal(resumed.outcome, 'won');
  assert.equal(resumed.events.find(event => event.type === 'ending').title, 'The Quiet Bell');

  const final = await createSimulation({ campaign, scenario: { save: resumed.snapshot() } });
  assert.equal(final.talk().dialogue.choices.length, 0);
  assert.match(final.dialogue().text, /Go west/);
  assert.equal(final.session.wallet.amount, goldBefore + 40);
  assert.equal(final.flags.get('ravensmoor:seal-returned'), true);
  assert.equal(final.journal()[0].status, 'completed');
});

test('tile, facing and flag triggers respond to play but do not replay on load', async () => {
  const observations = [];
  const village = { ...campaign.levels.village, triggers: [
    { on: 'enterTile', x: 2, z: 2, effect(game) { observations.push('tile'); game.flags.set('test:fountain', true); } },
    { on: 'flagSet', flag: 'test:fountain', effect(game) { observations.push('flag'); game.flags.set('test:fountain', true); } },
    { on: 'faceSide', x: 2, z: 2, side: 'E', effect() { observations.push('facing'); } },
  ] };
  const testCampaign = { ...campaign, levels: { ...campaign.levels, village } };
  const sim = await createSimulation({ campaign: testCampaign });
  assert.deepEqual(observations, []);
  assert.equal(sim.forward().ok, true);
  sim.turnRight();
  assert.deepEqual(observations, ['tile', 'flag', 'facing']);
  const loaded = await createSimulation({ campaign: testCampaign, scenario: { save: sim.snapshot() } });
  assert.equal(loaded.flags.get('test:fountain'), true);
  assert.deepEqual(observations, ['tile', 'flag', 'facing']);
});
