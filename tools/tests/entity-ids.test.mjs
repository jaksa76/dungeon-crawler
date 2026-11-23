import test from 'node:test';
import assert from 'node:assert/strict';
import { quarter, tileTypes, props } from '../../game-2/quarter.js';

// game.js touches the browser when loaded; cellLookup itself is pure.
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
const { cellLookup } = await import('../../engine2d/game.js');

test('entity ids are optional but unique within a level', () => {
  assert.ok(quarter.entities.some(e => e.id === 'start-chest'));
  assert.doesNotThrow(() => cellLookup(quarter, tileTypes, props));
  const twice = { ...quarter, entities: [...quarter.entities, { ...quarter.entities.find(e => e.id === 'start-chest'), x: 4, z: 4, side: 'S' }] };
  assert.throws(() => cellLookup(twice, tileTypes, props), /used twice|not on a floor|two things/);
});
