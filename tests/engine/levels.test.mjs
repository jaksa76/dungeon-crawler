import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLevel } from '../../engine/core/levels.js';
import { engineBooks } from '../support.mjs';


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

test('creatures, doors and things are placements, checked when the level is resolved', () => {
  const { level } = resolve({ monsters: [{ monster: 'rat', id: 'rat-1', x: 1, z: 1, dir: 2 }], doors: [{ door: 'iron-door', id: 'gate', x: 1, z: 0 }],
    tiles: ['#.#', '#.#', '###'], start: { x: 1, z: 1, dir: 0 }, entities: [] });
  assert.deepEqual(level.monsters, [{ monster: 'rat', id: 'rat-1', x: 1, z: 1, dir: 2 }]);
  assert.equal(level.doors[0].id, 'gate');
  assert.throws(() => resolve({ doors: [{ door: 'iron-door', x: 0, z: 0 }] }), /not on a floor tile/);
  assert.throws(() => resolve({ doors: [{ door: 'portcullis', x: 1, z: 1 }] }), /unknown door/);
  assert.throws(() => resolve({ doors: [{ door: 'iron-door', x: 1, z: 1 }] }), /player's entrance/);
});

test('unknown names and unmapped map characters are errors', () => {
  assert.throws(() => resolve({ environment: 'moon' }), /unknown environment/);
  assert.throws(() => resolve({ legend: { ...square.legend, D: 'castle' } }), /unknown building/);
  assert.throws(() => resolve({ tiles: ['#X#', '#.#', '###'] }), /not in the legend/);
  assert.throws(() => resolve({ entities: [{ prop: 'throne', x: 1, z: 1, side: 'N' }] }), /unknown prop/);
  assert.throws(() => resolve({ entities: [{ npc: 'king', x: 1, z: 1, side: 'N' }] }), /unknown NPC/);
  assert.throws(() => resolve({ entities: [{ prop: 'chest', npc: 'guard', x: 1, z: 1, side: 'N' }] }), /one of prop or npc/);
  assert.throws(() => resolve({ monsters: [{ monster: 'dragon', x: 1, z: 1 }] }), /unknown monster/);
  assert.throws(() => resolve({ entities: [{ prop: 'chest', x: 1, z: 1 }] }), /needs a side/);
  assert.throws(() => resolve({ entities: [{ prop: 'chest', x: 0, z: 0, side: 'N' }] }), /not on a floor tile/);
  assert.throws(() => resolve({ entities: [{ prop: 'chest', x: 1, z: 1, side: 'N' }, { prop: 'barrel', x: 1, z: 1, side: 'N' }] }), /two things on the N side/);
  assert.throws(() => resolve({ entities: [{ prop: 'chest', x: 1, z: 1, side: 'N', behavior: { type: 'dance' } }] }), /unknown behavior/);
});

test('entity ids are optional but unique within a level', () => {
  assert.doesNotThrow(() => resolve());
  assert.throws(() => resolve({ entities: [...square.entities, { id: 'box', prop: 'barrel', x: 1, z: 1, side: 'S' }] }), /used twice/);
});
