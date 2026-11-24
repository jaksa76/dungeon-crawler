import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMonster, monsterStats } from '../../engine/rules/stats.js';
import { engineBooks, artFile } from '../support.mjs';

const kinds = Object.keys(engineBooks.monsters);

test('a creature is more dangerous the higher its D&D challenge rating', () => {
  const all = kinds.map(k => createMonster(engineBooks.monsters, k, { x: 1, z: 1 })).sort((a, b) => a.cr - b.cr);
  const threat = m => m.hp * m.damage;
  for (let i = 1; i < all.length; i++) {
    if (all[i].cr > all[i - 1].cr) assert.ok(threat(all[i]) > threat(all[i - 1]), `${all[i].name} should out-threaten ${all[i - 1].name}`);
  }
});

test('stat blocks convert the D&D way: a CR 1/4 snake with 11 hp, AC 14 and 7.5 damage', () => {
  assert.deepEqual(monsterStats({ cr: 1 / 4, hp: 11, ac: 14, dmg: 7.5 }), { cr: .25, hp: 30, damage: 12, evasion: 5, accuracy: 4, defence: 0 });
});

test('a placed creature keeps its placement and its book entry, and an unknown kind is an error', () => {
  const troll = createMonster(engineBooks.monsters, 'troll', { id: 'troll-1', x: 4, z: 2, dir: 1 });
  assert.equal(troll.id, 'troll-1'); assert.equal(troll.kind, 'troll'); assert.equal(troll.art, 'troll');
  assert.equal(troll.animations.idle.frameMs, 500, 'a heavy creature moves slowly');
  assert.throws(() => createMonster(engineBooks.monsters, 'dragon', {}), /Unknown monster/);
});

test('every creature in the book has its sixteen frames', () => {
  for (const kind of kinds) for (const d of ['front', 'back', 'left', 'right']) for (let n = 0; n < 4; n++) {
    assert.ok(fs.existsSync(artFile(engineBooks.monsters[kind], `${d}-d${n}.png`)), `${kind} ${d}-d${n}`);
  }
});
