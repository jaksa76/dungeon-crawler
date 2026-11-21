import test from 'node:test';
import assert from 'node:assert/strict';
import { findTarget, interact, checkBehavior } from '../../engine2d/interaction.js';
import { props, quarter } from '../../game-2/quarter.js';

// A relCell for a fixed picture: props listed per [l, d].
const scene = (spec) => (l, d) => (spec[`${l},${d}`] ? { props: spec[`${l},${d}`] } : {});
const examine = text => ({ type: 'examine', text });
const thing = (anchor, entity, extra = {}) => ({ anchor, entity, ...extra });
const run = (relCell, exit = null) => {
  const said = [];
  interact(relCell, { say: t => said.push(t), exit });
  return said;
};

test('using something against the far side of your own tile runs its behaviour', () => {
  const well = thing('far', { name: 'the well', behavior: examine('Deep.') });
  assert.deepEqual(run(scene({ '0,0': [well] })), ['Deep.']);
});

test('the near side of the tile ahead is within reach, its far side is only seen', () => {
  const near = thing('near', { name: 'a barrel', behavior: examine('Pickled fish.') });
  assert.deepEqual(run(scene({ '0,1': [near] })), ['Pickled fish.']);
  const far = thing('far', { name: 'the stall', behavior: examine('Herbs.') });
  assert.deepEqual(run(scene({ '0,1': [far] })), ['Step closer to use the stall.']);
  assert.equal(findTarget(scene({ '0,1': [far] })).tooFar, true);
});

test('sides that are not in front of the player are ignored', () => {
  const left = thing('left', { name: 'a lamp post', behavior: examine('Lit.') });
  const right = thing('right', { name: 'a crate' });
  assert.deepEqual(run(scene({ '0,0': [left, right], '0,1': [left, right] })), ['There is nothing to use here.']);
});

test("an entity's own behaviour beats its prop's default", () => {
  const entity = { name: 'a barrel', behavior: examine('Mine.') };
  assert.deepEqual(run(scene({ '0,0': [thing('far', entity, { behavior: examine('Default.') })] })), ['Mine.']);
  const plain = { name: 'a barrel' };
  assert.deepEqual(run(scene({ '0,0': [thing('far', plain, { behavior: examine('Default.') })] })), ['Default.']);
});

test('things without a behaviour still answer, and the passage ahead is the fallback', () => {
  const guard = thing('far', { name: 'a town guard' });
  assert.match(run(scene({ '0,0': [guard] }))[0], /a town guard/);
  assert.deepEqual(run(scene({ '0,0': [thing('far', {})] })), ['Nothing of interest.']);
  const exit = { message: 'The door leads out.' };
  assert.deepEqual(run(scene({}), exit), ['The door leads out.']);
  assert.deepEqual(run(scene({ '0,0': [guard] }), exit).length, 1);
  assert.notEqual(run(scene({ '0,0': [guard] }), exit)[0], exit.message);
});

test('a walled or missing cell ahead is not a target', () => {
  assert.equal(findTarget(() => null), null);
  assert.equal(findTarget((l, d) => d === 1 ? { wall: 'stone' } : {}), null);
});

test('unknown behaviour types are rejected', () => {
  assert.throws(() => checkBehavior({ type: 'dance' }, 'the well'), /unknown behavior "dance"/);
  assert.doesNotThrow(() => checkBehavior(undefined, 'x'));
});

test('the village props that carry a behaviour use known types', () => {
  for (const [name, prop] of Object.entries(props)) if (prop.behavior) assert.doesNotThrow(() => checkBehavior(prop.behavior, name));
  for (const name of ['well', 'barrel', 'crate']) assert.equal(props[name].behavior.type, 'open'); // hidden stashes, see inventory.test.mjs
  for (const entity of quarter.entities) {
    const text = (entity.behavior ?? props[entity.prop].behavior)?.text;
    if (text) assert.ok(text.length > 10);
  }
});
