import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, flat } from '../../engine/core/world.js';
import { resolveLevel } from '../../engine/core/levels.js';
import { defineContent, mergeContent, engineContent } from '../../engine/index.js';
import { restore, door, examine } from '../../engine/rules/behaviours.js';
import { interact } from '../../engine/rules/interaction.js';

const created = [];
const campaign = defineContent('file:///campaign/', {
  monsters: { wisp: { name: 'wisp', cr: 1 / 8, hp: 4, ac: 12, dmg: 2, h: .5, w: .3, state: { dead: false, glowing: true }, onCreate() { created.push(this.ref); } } },
  props: { lever: { w: .2, h: .5, state: { pulled: false }, interact(game) { this.state.pulled = true; game.find('hall', 'gate').open(game, { force: true }); } } },
});
const books = mergeContent(engineContent, campaign);
const hall = {
  name: 'Hall', environment: 'dungeon', legend: { '.': 'floor', '#': 'dungeon-stone' },
  tiles: ['#####', '#...#', '#...#', '#####'], start: { x: 1, z: 1, dir: 1 },
  entities: [{ prop: 'lever', id: 'lever', x: 1, z: 2, side: 'S' }, { prop: 'barrel', x: 2, z: 2, side: 'S' }],
  doors: [{ door: 'iron-door', id: 'gate', x: 3, z: 1, state: { locked: true } }],
  monsters: [{ monster: 'wisp', id: 'wisp-1', x: 3, z: 2, dir: 3 }, { monster: 'rat', x: 2, z: 1, dir: 3 }],
};
const crypt = { ...hall, name: 'Crypt', entities: [], doors: [], monsters: [{ monster: 'wisp', id: 'deep', x: 2, z: 2, dir: 0 }] };
const levels = { hall: resolveLevel('hall', hall, books), crypt: resolveLevel('crypt', crypt, books) };
const newWorld = () => { created.length = 0; return createWorld({ levels, books }); };
// A game API good enough for methods: say, find, inventory and items, and the door helpers.
const gameFor = (world, extra = {}) => {
  const said = [];
  return { said, say: t => said.push(t), find: world.find, changed: world.changed, isHere: () => true, blocked: () => false,
    items: books.items, inventory: { count: () => 0 }, ...extra };
};

test('a level’s instances are made only when it is first needed, from its definitions', () => {
  const world = newWorld();
  assert.equal(world.isCreated('crypt'), false);
  const gate = world.find('hall', 'gate');
  assert.equal(world.isCreated('hall'), true); assert.equal(world.isCreated('crypt'), false);
  assert.equal(gate.category, 'door'); assert.equal(gate.kind, 'iron-door');
  assert.equal(gate.art, 'dungeon-door', 'a door shows its building');
  assert.deepEqual(gate.state, { open: false, locked: true }, 'the definition’s state, then the placement’s');
  assert.equal(Object.getPrototypeOf(Object.getPrototypeOf(gate)), books.doors['iron-door'], 'methods come from the definition');
  assert.deepEqual(world.all('hall').map(i => i.ref).sort(), ['2,2,S', 'gate', 'lever', 'monster-1', 'wisp-1']);
});

test('things are found by tile, and a move keeps the index right', () => {
  const world = newWorld(), wisp = world.find('hall', 'wisp-1');
  assert.deepEqual(world.at('hall', 3, 2), [wisp]);
  world.move(wisp, 2, 2);
  assert.deepEqual(world.at('hall', 3, 2), []);
  assert.deepEqual(world.at('hall', 2, 2).map(i => i.ref).sort(), ['2,2,S', 'wisp-1']);
  assert.equal(world.doorAt('hall', 3, 1).ref, 'gate');
});

test('creatures get the bestiary’s stats, their own placement, and dead: false', () => {
  const world = newWorld(), rat = world.find('hall', 'monster-1');
  assert.equal(rat.kind, 'rat'); assert.ok(rat.hp > 0); assert.deepEqual(rat.home, { x: 2, z: 1, dir: 3 });
  assert.equal(rat.state.dead, false);
  assert.equal(flat(rat).art, 'rat', 'flat() gives code that spreads objects the inherited fields too');
});

test('state is saved per instance; a load brings it back and skips onCreate; untouched levels pass through', () => {
  const world = newWorld();
  world.find('hall', 'lever'); // creates the hall
  assert.deepEqual(created, [], 'onCreate waits for the API');
  world.setApi({});
  assert.deepEqual(created, ['wisp-1']); created.length = 0;
  world.find('hall', 'wisp-1').state.glowing = false;
  world.find('hall', 'monster-1').state.dead = true;
  const saved = JSON.parse(JSON.stringify(world.persistence.save()));
  assert.deepEqual(Object.keys(saved.levels), ['hall'], 'the crypt was never created');
  const again = newWorld(); again.setApi({});
  again.persistence.load(saved);
  assert.equal(again.find('hall', 'wisp-1').state.glowing, false);
  assert.equal(again.find('hall', 'monster-1').state.dead, true, 'dead stays dead');
  assert.deepEqual(created, [], 'loaded instances already had their onCreate');
  again.find('crypt', 'deep');
  assert.deepEqual(created, ['deep'], 'a level first created after a load is new');
});

test('a removed placed thing stays removed after a load; respawn brings it back', () => {
  const world = newWorld(), barrel = world.find('hall', '2,2,S');
  assert.equal(world.remove(barrel), true);
  assert.equal(world.find('hall', '2,2,S'), null);
  const again = newWorld(); again.persistence.load(JSON.parse(JSON.stringify(world.persistence.save())));
  assert.equal(again.find('hall', '2,2,S'), null);
  const back = again.respawn('hall', '2,2,S');
  assert.equal(back.prop, 'barrel'); assert.equal(again.find('hall', '2,2,S'), back);
});

test('spawned things are checked, indexed, saved with their placement, and get fresh ids', () => {
  const world = newWorld(); world.setApi({});
  const wisp = world.spawn('wisp', { level: 'crypt', x: 1, z: 2, dir: 0 });
  assert.equal(wisp.ref, 'spawn-1'); assert.equal(wisp.spawned, true); assert.deepEqual(world.at('crypt', 1, 2), [wisp]);
  assert.ok(created.includes('spawn-1'), 'onCreate runs for a spawned thing');
  const crate = world.spawn('crate', { level: 'hall', x: 3, z: 2, side: 'N', id: 'loot' });
  assert.equal(crate.category, 'prop');
  assert.throws(() => world.spawn('crate', { level: 'hall', x: 3, z: 2, side: 'N' }), /side .* is taken/);
  assert.throws(() => world.spawn('crate', { level: 'hall', x: 0, z: 0, side: 'N' }), /not a floor tile/);
  assert.throws(() => world.spawn('crate', { level: 'hall', x: 1, z: 1 }), /needs a side/);
  assert.throws(() => world.spawn('dragon', { level: 'hall', x: 1, z: 1 }), /unknown kind/);
  assert.throws(() => world.spawn('wisp', { level: 'hall', x: 1, z: 1, id: 'lever' }), /already used/);
  const again = newWorld(); again.persistence.load(JSON.parse(JSON.stringify(world.persistence.save())));
  const back = again.find('crypt', 'spawn-1');
  assert.equal(back.kind, 'wisp'); assert.deepEqual([back.x, back.z], [1, 2]);
  assert.equal(again.spawn('wisp', { level: 'crypt', x: 3, z: 2 }).ref, 'spawn-2', 'the id counter is saved too');
  assert.equal(again.remove(back), true);
  assert.equal(JSON.stringify(again.persistence.save()).includes('"spawn-1"'), false, 'a removed spawned thing is simply gone');
});

test('respawn restores the starting state and the home tile', () => {
  const world = newWorld(), wisp = world.find('hall', 'wisp-1');
  wisp.state.dead = true; world.move(wisp, 1, 1);
  world.respawn(wisp);
  assert.deepEqual(wisp.state, { dead: false, glowing: true }); assert.deepEqual([wisp.x, wisp.z], [3, 2]);
});

test('a door opens and closes; locked, it needs its key or force', () => {
  const world = newWorld(), gate = world.find('hall', 'gate'), game = gameFor(world);
  assert.equal(gate.open(game), false); assert.deepEqual(game.said, ['It is locked.']);
  const keyed = gameFor(world, { inventory: { count: id => (id === 'key' ? 1 : 0) } });
  assert.equal(gate.open(keyed), true); assert.equal(gate.isOpen(), true); assert.equal(gate.state.locked, false);
  assert.match(keyed.said[0], /unlock it with the iron key/);
  gate.interact(game); assert.equal(gate.isOpen(), false, 'Use on an open door closes it');
  assert.equal(gate.close(gameFor(world, { blocked: () => true })), true, 'already shut');
  gate.state.locked = true;
  assert.equal(gate.open(game, { force: true }), true, 'a lever or a spell forces it');
});

test('a campaign method reaches another instance: the lever opens the gate', () => {
  const world = newWorld(), game = gameFor(world);
  const lever = world.find('hall', 'lever');
  interact((l, d) => (d === 0 ? { props: [{ anchor: 'far', entity: lever }] } : {}), { say: game.say, game });
  assert.equal(lever.state.pulled, true); assert.equal(world.find('hall', 'gate').isOpen(), true);
});

test('Use on a door ahead runs the door, after a pile but before a passage', () => {
  const world = newWorld(), gate = world.find('hall', 'gate'), game = gameFor(world);
  gate.state.locked = false;
  interact(() => ({}), { say: game.say, game, door: gate, exit: { message: 'passage' } });
  assert.equal(gate.isOpen(), true);
});

test('restore() heals, is used up, and says what it restores; examine() says its text', () => {
  const hero = { hp: 10, maxHp: 30, mp: 5, maxMp: 5 }, said = [], game = { hero, say: t => said.push(t) };
  const potion = { name: 'Health potion', use: restore({ hp: 20 }) };
  assert.deepEqual(potion.use.restores, { hp: 20, mp: 0 });
  assert.equal(potion.use.call(potion, game).consumed, true); assert.equal(hero.hp, 30);
  assert.equal(potion.use.call(potion, game).consumed, undefined, 'not wasted on full health');
  examine('Old stones.').call({}, game);
  assert.equal(said.at(-1), 'Old stones.');
  assert.deepEqual(door().state, { open: false, locked: false });
});
