import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { createSimulation } from '../../engine/index.js';
import { campaign } from '../../games/ravensmoor/campaign.js';

const westGate = { x: 1, z: 1, dir: 3 };
const ids = map => map.locations.map(location => location.id);

test('the Old Quarter gate reveals only known destinations and travels to their entry points', async () => {
  const sim = await createSimulation({ campaign, scenario: { at: westGate } });
  assert.deepEqual(ids(sim.forward().worldMap), ['old-quarter']);
  assert.equal(sim.position.x, westGate.x, 'opening the map leaves the hero at the gate');
  assert.equal((await sim.travelToLocation('greybridge')).ok, false);

  sim.strafeLeft();
  sim.interact(); // read the sign on the lamppost
  assert.match(sim.messages.at(-1), /Greybridge/);
  assert.equal((await sim.travelToLocation('greybridge')).ok, false, 'selecting a marker requires a travel gate');
  sim.strafeRight();
  assert.deepEqual(ids(sim.forward().worldMap), ['old-quarter', 'greybridge']);
  assert.deepEqual(await sim.travelToLocation('greybridge'), { ok: true, travelled: 'market' });
  assert.deepEqual(sim.position, campaign.levels.market.start);
  assert.ok(sim.worldMap().locations.find(location => location.id === 'greybridge').here);
  sim.face(2);
  assert.ok(sim.forward().worldMap);
  assert.equal((await sim.travelToLocation('old-quarter')).ok, true);
  assert.deepEqual(sim.position, { ...westGate, dir: 1 });
});

test('a known Undercrypt can be reached across the map and discoveries survive saving and migration', async () => {
  const sim = await createSimulation({ campaign, scenario: { at: { x: 3, z: 2, dir: 1 } } });
  assert.equal(sim.forward().travelled, 'dungeon');
  sim.face(3);
  assert.equal(sim.forward().travelled, 'village');
  sim.flags.set('ravensmoor:heard-of-market', true);
  const legacy = sim.snapshot();
  delete legacy.sections.engine['world-map'];
  const restored = await createSimulation({ campaign, scenario: { save: legacy, at: westGate } });
  assert.deepEqual(ids(restored.forward().worldMap), ['old-quarter', 'undercrypt', 'greybridge']);
  restored.flags.delete('ravensmoor:heard-of-market');
  const saved = await createSimulation({ campaign, scenario: { save: restored.snapshot() } });
  assert.deepEqual(ids(saved.worldMap()), ['old-quarter', 'undercrypt', 'greybridge']);
  assert.equal((await saved.travelToLocation('undercrypt')).travelled, 'dungeon');
  assert.deepEqual(saved.position, campaign.levels.dungeon.start);
  assert.ok(existsSync(new URL(campaign.worldMap.image)) && existsSync(new URL(campaign.levels.market.backdrop)));
});

test('a campaign can give a destination a travel time without spending that time on its departure tile', async () => {
  const travelTime = 2500;
  const slowLocations = campaign.worldMap.locations.map(location => location.id === 'greybridge' ? { ...location, travelTime } : location);
  const slowRoads = { ...campaign, worldMap: { ...campaign.worldMap, locations: slowLocations } };
  const sim = await createSimulation({ campaign: slowRoads, scenario: { at: westGate, flags: { 'ravensmoor:heard-of-market': true } } });
  const start = sim.time;
  assert.equal((await sim.travelToLocation('greybridge')).ok, true);
  assert.equal(sim.time - start, travelTime);
  assert.equal(sim.events.find(event => event.type === 'level' && event.to === 'market').t, start + travelTime);
});
