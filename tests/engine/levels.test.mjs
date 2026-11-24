import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLevel } from '../../engine/core/levels.js';
import { engineBooks } from '../support.mjs';

// game.js touches the browser when loaded; cellLookup itself is pure.
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
const { cellLookup } = await import('../../engine/core/game.js');

const square = {
  name: 'Test square', environment: 'town',
  legend: { '.': 'floor', '#': 'stone-wall', D: 'house-door' },
  tiles: ['#D#', '#.#', '###'],
  start: { x: 1, z: 1, dir: 0 },
  entities: [{ id: 'box', prop: 'chest', x: 1, z: 1, side: 'N' }, { npc: 'guard', name: 'a guard', x: 1, z: 1, side: 'W' }],
};
const resolve = (changes = {}) => resolveLevel('square', { ...square, ...changes }, engineBooks);

test('a level names buildings, props, NPCs and its environment by id, and gets their art folders', () => {
  const { level, tileTypes, props, environment } = resolve();
  assert.deepEqual(tileTypes['.'], { floor: true });
  assert.equal(tileTypes.D.art, 'house-door'); assert.match(tileTypes.D.assets, /engine\/assets\/walls\/house-door\/$/);
  assert.match(props.chest.assets, /engine\/assets\/props\/chest\/$/);
  assert.match(props.guard.assets, /engine\/assets\/npcs\/guard\/$/);
  assert.deepEqual(level.entities.map(e => e.prop), ['chest', 'guard']);
  assert.equal(environment.backdrop, true); assert.equal(level.atmosphere, undefined);
});

test('a dungeon environment brings its darkness and fog of war, and a level may override them', () => {
  const dark = resolve({ environment: 'dungeon' });
  assert.ok(dark.level.atmosphere && dark.level.exploration.radius > 0);
  assert.equal(dark.environment.backdrop, false);
  assert.equal(resolve({ environment: 'dungeon', exploration: { radius: 1 } }).level.exploration.radius, 1);
});

test('creatures are placed by kind, with the bestiary’s stats', () => {
  const { level } = resolve({ monsters: [{ monster: 'rat', id: 'rat-1', x: 1, z: 1, dir: 2 }] });
  assert.equal(level.monsters[0].id, 'rat-1'); assert.equal(level.monsters[0].kind, 'rat'); assert.ok(level.monsters[0].hp > 0);
});

test('unknown names and unmapped map characters are errors', () => {
  assert.throws(() => resolve({ environment: 'moon' }), /unknown environment/);
  assert.throws(() => resolve({ legend: { ...square.legend, D: 'castle' } }), /unknown building/);
  assert.throws(() => resolve({ tiles: ['#X#', '#.#', '###'] }), /not in the legend/);
  assert.throws(() => resolve({ entities: [{ prop: 'throne', x: 1, z: 1, side: 'N' }] }), /unknown prop/);
  assert.throws(() => resolve({ entities: [{ npc: 'king', x: 1, z: 1, side: 'N' }] }), /unknown NPC/);
  assert.throws(() => resolve({ entities: [{ prop: 'chest', npc: 'guard', x: 1, z: 1, side: 'N' }] }), /one of prop or npc/);
  assert.throws(() => resolve({ monsters: [{ monster: 'dragon', x: 1, z: 1 }] }), /Unknown monster/);
});

test('entity ids are optional but unique within a level', () => {
  const { level, tileTypes, props } = resolve();
  assert.doesNotThrow(() => cellLookup(level, tileTypes, props));
  const twice = { ...level, entities: [...level.entities, { ...level.entities[0], side: 'S' }] };
  assert.throws(() => cellLookup(twice, tileTypes, props), /used twice/);
});
