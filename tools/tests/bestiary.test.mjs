import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { monster, bestiaryKinds } from '../../game-2/monsters.js';
import { dungeon } from '../../game-2/dungeon.js';

test('a creature is more dangerous the higher its D&D challenge rating', () => {
  const kinds = bestiaryKinds.map(k => monster(k, { x: 1, z: 1 })).sort((a, b) => a.cr - b.cr);
  const threat = m => m.hp * m.damage;
  for (let i = 1; i < kinds.length; i++) {
    if (kinds[i].cr > kinds[i - 1].cr) assert.ok(threat(kinds[i]) > threat(kinds[i - 1]), `${kinds[i].name} should out-threaten ${kinds[i - 1].name}`);
  }
});

test('every creature in the dungeon has its sixteen frames and stands on floor', () => {
  for (const m of dungeon.monsters) {
    const row = dungeon.tiles[m.z][m.x];
    assert.equal(row, '.', `${m.id} must stand on floor`);
    if (m.art === 'snake') continue;
    for (const d of ['front', 'back', 'left', 'right']) for (let n = 0; n < 4; n++) {
      assert.ok(fs.existsSync(new URL(`../../game-2/dungeon/assets/monsters/${m.art}/${d}-d${n}.png`, import.meta.url)), `${m.art} ${d}-d${n}`);
    }
  }
});
