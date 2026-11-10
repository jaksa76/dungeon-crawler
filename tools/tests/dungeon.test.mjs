import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { levels } from '../../game-2/levels.js';
import { createExploration } from '../../engine2d/exploration.js';
import { createView } from '../../engine2d/view.js';

const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const floor = (def, x, z) => def.tileTypes[def.level.tiles[z]?.[x]]?.floor === true;

test('the dungeon is enclosed and every corridor is reachable from its entrance', () => {
  const def = levels.dungeon, rows = def.level.tiles, start = def.level.start;
  const width = rows[0].length;
  assert(rows.every(row => row.length === width));
  assert(floor(def, start.x, start.z));
  for (let z = 0; z < rows.length; z++) for (let x = 0; x < width; x++) {
    assert(def.tileTypes[rows[z][x]], `unknown tile at ${x},${z}`);
    if (x === 0 || z === 0 || x === width - 1 || z === rows.length - 1) assert(!floor(def, x, z));
  }
  const queue = [[start.x, start.z]], visited = new Set();
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i], key = `${x},${z}`;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const [dx, dz] of directions) if (floor(def, x + dx, z + dz)) queue.push([x + dx, z + dz]);
  }
  assert.equal(visited.size, rows.join('').split('').filter(t => def.tileTypes[t].floor).length);
  assert(visited.size > 100, 'a labyrinth should contain substantial exploration space');
});

test('both travel directions have a valid door, destination and landing tile', () => {
  for (const def of Object.values(levels)) for (const exit of def.level.exits) {
    assert(floor(def, exit.x, exit.z));
    const [dx, dz] = directions[exit.dir];
    assert(def.tileTypes[def.level.tiles[exit.z + dz]?.[exit.x + dx]]?.wall);
    const destination = levels[exit.to]; assert(destination);
    const spawn = exit.spawn ?? destination.level.start;
    assert(floor(destination, spawn.x, spawn.z));
    assert(spawn.dir >= 0 && spawn.dir < 4);
  }
});

test('discovery stops at walls and keeps previously explored corridors', () => {
  const def = levels.dungeon;
  const cell = (x, z) => {
    const tile = def.tileTypes[def.level.tiles[z]?.[x]];
    return tile ? tile.wall ? { wall: tile.art } : {} : null;
  };
  const map = createExploration(def.level, cell);
  map.reveal(def.level.start);
  assert(map.isKnown(1, 1)); assert(map.isKnown(0, 1), 'entrance door should be recorded');
  assert(!map.isKnown(3, 1), 'the corridor behind a solid wall should remain hidden');
  assert(!map.isKnown(15, 15), 'distant passages should remain hidden');
  map.reveal({ x: 1, z: 3 });
  assert(map.isKnown(2, 3)); assert(map.isKnown(0, 1), 'previous discoveries are retained');
});

test('every required wall slot and the floor have baked artwork', () => {
  for (const art of ['dungeon-stone', 'dungeon-door']) for (const slot of createView().wallSlots) {
    const file = new URL(`../../game-2/dungeon/assets/walls/${art}/${slot.id}.png`, import.meta.url);
    const data = fs.readFileSync(file);
    assert.equal(data.toString('ascii', 1, 4), 'PNG');
    assert(data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0);
  }
  assert(fs.existsSync(new URL('../../game-2/dungeon/assets/floor.png', import.meta.url)));
});
