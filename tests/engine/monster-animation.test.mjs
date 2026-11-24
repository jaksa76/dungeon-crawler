import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createMonster } from '../../engine/rules/stats.js';
import { books, artFile } from '../support.mjs';
import { createMonsterAnimator, durationOf, FRAME_LAYOUT, FRAME_COLUMNS } from '../../engine/render/monster-animation.js';
import { arrangeActors } from '../../engine/render/actor-layout.js';
import { createMonsters } from '../../engine/rules/monsters.js';

// Every creature the game can show: the engine's bestiary and the campaign's own (they share the art pipeline).
const bestiaryKinds = Object.keys(books.monsters);
const monster = (kind, at) => createMonster(books.monsters, kind, at);

test('data controls frames and timing, actions recover to idle, death is terminal', () => {
  const a = { animations: { attack: { frames: 3, frameMs: 50 }, dead: { holdMs: 400 } } };
  const animation = createMonsterAnimator();
  animation.play(a, 'attack', 100);
  assert.equal(animation.sample(a, 200).frame, 2);
  assert.equal(animation.play(a, 'move', 210), false);
  assert.equal(animation.sample(a, 250).state, 'idle');
  animation.play(a, 'hurt', 300);
  assert.equal(animation.play(a, 'attack', 310), false);
  animation.play(a, 'dead', 400, { force: true });
  assert.equal(animation.sample(a, 1000).frame, 3);
  assert.equal(animation.sample(a, 1000).opacity, 1);
  assert.equal(animation.sample(a, 1300).opacity, .3);
  assert.equal(animation.play(a, 'idle', 1400, { force: true }), false);
  assert.equal(durationOf(a, 'dead'), 960);
  assert.equal(FRAME_LAYOUT.dead.column + FRAME_LAYOUT.dead.frames, FRAME_COLUMNS);
});

test('pausing preserves playback and corpse lifetime', () => {
  const m = createMonsters({ start: { x: 0, z: 0 }, monsters: [{ x: 1, z: 0 }] }, () => ({}));
  const a = m.actors[0];
  m.damage(a, 100, 100);
  m.freeze(200); m.freeze(1200);
  assert.equal(m.animation(a, 5000).frame, 0);
  m.resume(5200);
  assert.equal(m.reap(6200).length, 0);
  assert.equal(m.reap(6560).length, 1);
});

test('attack pose winds up before impact and movement resumes afterwards', () => {
  const m = createMonsters({ start: { x: 0, z: 0 }, monsters: [{ x: 1, z: 0, attackMs: 1000 }] }, () => ({}));
  const a = m.actors[0], player = { x: 0, z: 0 };
  assert.equal(m.engage(player, 100).length, 0);
  assert.equal(m.engage(player, 460).length, 0);
  assert.equal(m.animation(a, 460).state, 'attack');
  assert.equal(m.engage(player, 700).length, 1);
  assert.equal(m.animation(a, 700).frame, 2);
  assert.equal(m.animation(a, 1000).state, 'idle');
});

test('formations are stable, fit the corridor and use multiple depth ranks', () => {
  const actors = ['c', 'a', 'b', 'd'].map(id => ({ id, w: .7, h: 1 }));
  const layout = arrangeActors(actors);
  assert.deepEqual(layout, arrangeActors(actors.reverse()));
  assert.equal(new Set(layout.map(a => a.offsetDepth)).size, 2);
  for (const a of layout) assert.ok(Math.abs(a.offsetX) + a.w / 2 <= .431);
  assert.ok(layout[0].offsetX < layout[1].offsetX);
  assert.deepEqual(actors.map(a => a.w), [.7, .7, .7, .7]);
});

test('every bestiary kind has a complete four-depth animation set matching its data', () => {
  for (const kind of bestiaryKinds) {
    const actor = monster(kind, {});
    for (const [state, clip] of Object.entries(actor.animations)) {
      assert.ok(clip.frames > 0 && clip.frames <= FRAME_LAYOUT[state].frames);
      assert.ok(clip.frameMs > 0);
    }
    for (let d = 0; d < 4; d++) {
      const png = fs.readFileSync(artFile(books.monsters[kind], `animation-d${d}.png`));
      assert.equal(png.toString('ascii', 1, 4), 'PNG');
      assert.equal(png.readUInt32BE(16) % FRAME_COLUMNS, 0);
      assert.equal(png.readUInt32BE(20) % 4, 0);
      assert.equal(png[25], 6, 'RGBA transparency is preserved');
    }
  }
});

test('every monster has authored directional poses, with source and atlas metadata in sync', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../art/engine/animations/keyposes.json', import.meta.url)));
  assert.deepEqual(manifest.directions, ['front', 'back', 'left', 'right']);
  assert.deepEqual(Object.keys(manifest.monsters).sort(), [...bestiaryKinds].sort());
  for (const kind of bestiaryKinds) {
    const meta = manifest.monsters[kind];
    const source = fs.readFileSync(new URL(`../../${meta.source}`, import.meta.url));
    assert.equal(createHash('sha256').update(source).digest('hex'), meta.sha256, `${kind}: regenerate atlases after changing source art`);
    assert.ok(meta.rows.includes('windup') && meta.rows.includes('impact') && meta.rows.includes('hurt') && meta.rows.includes('corpse'));
    if (kind !== 'snake') assert.ok(meta.rows.includes('walk-a') && meta.rows.includes('walk-b'));
    for (const direction of manifest.directions) {
      assert.equal(meta.bounds[direction].length, meta.rows.length);
      for (const r of meta.bounds[direction]) {
        assert.ok(r.w > 8 && r.h > 8);
        assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= meta.sourceSize[0] && r.y + r.h <= meta.sourceSize[1]);
      }
    }
    for (let d = 0; d < 4; d++) {
      const png = fs.readFileSync(artFile(books.monsters[kind], `animation-d${d}.png`));
      assert.deepEqual([png.readUInt32BE(16) / FRAME_COLUMNS, png.readUInt32BE(20) / 4], meta.depths[d].cell);
    }
  }
});
