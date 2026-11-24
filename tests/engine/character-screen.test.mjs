import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../../engine/rules/combat.js';
import { helpSections } from '../../engine/ui/help-screen.js';

const attrs = { strength: 6, vitality: 6, intellect: 4, agility: 5 };

test('the hero can preview the stats that points would give, without changing anything', () => {
  const hero = createCharacter(attrs);
  hero.gain(60); // level 3: 4 points
  const before = JSON.stringify(hero.stats());
  const after = hero.statsWithPoints({ vitality: 2, intellect: 1, strength: 1 });
  assert.equal(after.maxHp, hero.maxHp + 10); assert.equal(after.maxMp, hero.maxMp + 5);
  assert.ok(after.attack > hero.attack);
  assert.equal(after.spellPower, hero.spellPower + 1, 'intellect above 4 adds spell power');
  assert.equal(JSON.stringify(hero.stats()), before, 'nothing was spent');
  assert.equal(hero.unspent, 4);
  assert.deepEqual(hero.statsWithPoints(), hero.stats(), 'no points: the same stats');
});

test('the help screen has the engine sections, adds magic when the game has spells, and the game can add or replace sections', () => {
  const titles = o => helpSections(o).map(s => s.title);
  assert.ok(titles({}).includes('Moving') && titles({}).includes('Fighting') && titles({}).includes('Saving') && titles({}).includes('All the keys'));
  assert.equal(titles({}).includes('Magic'), false);
  assert.equal(titles({ magic: true }).includes('Magic'), true);
  const keys = o => helpSections(o).find(s => s.title === 'All the keys').keys.map(([k]) => k);
  assert.ok(keys({ magic: true }).includes('C') && !keys({}).includes('C'));
  assert.ok(keys({}).includes('P') && keys({}).includes('H'));
  const extra = helpSections({ extra: [{ title: 'The raven', text: 'Caw.' }, { title: 'Moving', text: 'Walk.' }] });
  assert.equal(extra.at(-1).title, 'The raven');
  assert.deepEqual(extra.find(s => s.title === 'Moving').text, 'Walk.', 'a section with the same title is replaced');
  assert.equal(extra.filter(s => s.title === 'Moving').length, 1);
});
