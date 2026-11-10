import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMonsters, actorDirection } from '../../engine2d/monsters.js';
import { createView } from '../../engine2d/view.js';
import { dungeon } from '../../game-2/dungeon.js';

const cellFor = rows => (x, z) => rows[z]?.[x] === '.' ? {} : rows[z]?.[x] ? { wall: 'stone' } : null;
const fixture = (rows, monster) => {
  const level = { tiles: rows, start: { x: 3, z: 1 }, monsters: [{ id: 'test', w: .4, h: .9, ...monster }] };
  return createMonsters(level, cellFor(rows), () => .1);
};

test('a roaming monster takes single floor steps and never walks through walls', () => {
  const cell = cellFor(dungeon.tiles.map(row => row.replace('E', '#')));
  const monsters = createMonsters(dungeon, cell, () => .1), actor = monsters.actors[0];
  for (let i = 0; i < 200; i++) {
    const old = { x: actor.x, z: actor.z };
    monsters.step({ x: -20, z: -20 });
    assert.equal(Math.abs(actor.x - old.x) + Math.abs(actor.z - old.z), 1);
    assert.equal(cell(actor.x, actor.z)?.wall, undefined);
    assert.equal(actor.mode, 'roaming');
  }
});

test('seeing the player starts pursuit, and reaching their tile catches them', () => {
  const monsters = fixture(['#####', '#...#', '#####'], { x: 1, z: 1, dir: 1 });
  const player = { x: 3, z: 1 };
  assert.equal(monsters.step(player), null);
  assert.equal(monsters.actors[0].mode, 'hunting');
  assert.equal(monsters.actors[0].x, 2);
  assert.equal(monsters.step(player), monsters.actors[0]);
  assert.equal(monsters.caught(player), monsters.actors[0]);
});

test('masonry blocks perception, including nearby parallel corridors', () => {
  const monsters = fixture(['#####', '#...#', '###.#', '#...#', '#####'], { x: 1, z: 1, dir: 1 });
  monsters.step({ x: 1, z: 3 });
  assert.equal(monsters.actors[0].mode, 'roaming');
  assert.equal(monsters.actors[0].target, null);
});

test('pursuit remembers the last sighting without tracking an unseen player', () => {
  const monsters = fixture(['#######', '#.....#', '#.###.#', '#.....#', '#######'], { x: 1, z: 1, dir: 1 });
  monsters.step({ x: 4, z: 1 });
  assert.deepEqual(monsters.actors[0].target, { x: 4, z: 1 });
  monsters.step({ x: 1, z: 3 });
  assert.deepEqual(monsters.actors[0].target, { x: 4, z: 1 });
  assert.equal(monsters.actors[0].x, 3);
});

test('dead ends reverse direction, and reset restores a fresh encounter', () => {
  const monsters = fixture(['#####', '#...#', '#####'], { x: 1, z: 1, dir: 3 });
  monsters.step({ x: -20, z: -20 });
  assert.equal(monsters.actors[0].dir, 1);
  assert.equal(monsters.caught({ x: 2, z: 1 }), monsters.actors[0]);
  monsters.reset();
  assert.deepEqual({ x: monsters.actors[0].x, dir: monsters.actors[0].dir, target: monsters.actors[0].target }, { x: 1, dir: 3, target: null });
});

test('monster frames select relative direction and shrink at each depth', () => {
  assert.equal(actorDirection(2, 0), 'front');
  assert.equal(actorDirection(0, 0), 'back');
  assert.equal(actorDirection(1, 0), 'right');
  assert.equal(actorDirection(3, 0), 'left');
  assert.equal(actorDirection(3, 1), 'front');
  const view = createView();
  const widths = [0, 1, 2, 3].map(d => view.actorSlot(0, d, .4, .9).full.w);
  assert(widths.every((w, i) => !i || w < widths[i - 1]));
});

test('invalid wall spawns and instant entrance kills are rejected', () => {
  assert.throws(() => fixture(['#####', '#...#', '#####'], { x: 0, z: 0 }), /floor tile/);
  assert.throws(() => fixture(['#####', '#...#', '#####'], { x: 3, z: 1 }), /player entrance/);
});

test('the snake has all sixteen exported direction and distance frames', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../game-2/art/snake-atlas.json', import.meta.url)));
  const frames = new Set();
  for (const frame of manifest.frames) {
    const key = `${frame.direction}-d${frame.depth}`;
    const png = fs.readFileSync(new URL(`../../game-2/dungeon/assets/monsters/snake/${key}.png`, import.meta.url));
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png.readUInt32BE(16), frame.w); assert.equal(png.readUInt32BE(20), frame.h);
    assert.equal(png[25], 6, 'sprites must retain an alpha channel');
    frames.add(key);
  }
  assert.equal(frames.size, 16);
  for (const direction of ['front', 'back', 'left', 'right']) for (let d = 0; d <= 3; d++) assert(frames.has(`${direction}-d${d}`));
});
