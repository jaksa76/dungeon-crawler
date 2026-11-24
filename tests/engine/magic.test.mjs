import test from 'node:test';
import assert from 'node:assert/strict';
import { createEffects, tierValue, isHarmful } from '../../engine/rules/effects.js';
import { spellDamage, spellHeal, canLearn, isImmune, describeSpell, spellRange } from '../../engine/rules/magic.js';
import { defineContent, mergeContent, forgeFamilies } from '../../engine/content/catalog.js';
import { engineContent } from '../../engine/index.js';
import { compareStats, deriveStats } from '../../engine/rules/combat.js';
import { createSimulation } from '../../engine/sim/simulation.js';
import { books, campaign, engineBooks } from '../support.mjs';

const defs = books.effects;

test('tiers pick a number from a list, and the last one holds for anything stronger', () => {
  assert.deepEqual([1, 2, 4, 9].map(t => tierValue([10, 20, 30, 40], t)), [10, 20, 40, 40]);
  assert.equal(tierValue(7, 3), 7); assert.equal(tierValue(undefined, 1), 0);
  assert.equal(isHarmful(defs.burning), true); assert.equal(isHarmful(defs.warded), false); assert.equal(isHarmful(defs.regeneration), false);
});

test('an effect ticks every tickMs, lasts its duration and then ends', () => {
  const fx = createEffects(defs);
  assert.equal(fx.apply('burning', 1), 'new');
  fx.tick(0);
  const ticks = [], ended = [];
  for (let t = 100; t <= 4000; t += 100) { const r = fx.tick(t); ticks.push(...r.ticks); ended.push(...r.ended); }
  assert.deepEqual(ticks.map(t => t.damage), [2, 2, 2], 'three seconds of burning at tier 1 is three ticks');
  assert.deepEqual(ended, ['burning']);
  assert.equal(fx.has('burning'), false);
});

test('a long gap between calls still delivers every tick', () => {
  const fx = createEffects(defs);
  fx.apply('poisoned', 2); fx.tick(0);
  const r = fx.tick(60_000);
  assert.equal(r.ticks.length, 7); assert.deepEqual(r.ended, ['poisoned']);
});

test('applying again: stronger replaces, equal renews, weaker only renews the time', () => {
  const fx = createEffects(defs);
  assert.equal(fx.apply('chilled', 2), 'new');
  assert.equal(fx.apply('chilled', 1), 'weaker'); assert.equal(fx.get('chilled').tier, 2);
  assert.equal(fx.apply('chilled', 2), 'renewed');
  assert.equal(fx.apply('chilled', 3), 'stronger'); assert.equal(fx.get('chilled').tier, 3);
  assert.equal(fx.list.length, 1);
  assert.throws(() => fx.apply('nonsense'), /unknown effect/);
});

test('slow, stun and stat changes add up, and slow is capped', () => {
  const fx = createEffects({ ...defs, deep: { name: 'Deep', duration: 1000, slow: 0.8 } });
  fx.apply('chilled', 2); assert.equal(fx.slow(), 0.35);
  fx.apply('deep'); assert.equal(fx.slow(), 0.9);
  assert.equal(fx.stunned(), false); fx.apply('stunned'); assert.equal(fx.stunned(), true);
  fx.apply('warded', 3); assert.deepEqual(fx.mods(), { attack: 0, defence: 5 });
  assert.deepEqual(fx.view().map(e => [e.id, e.harmful]).sort(), [['chilled', true], ['deep', true], ['stunned', true], ['warded', false]]);
});

test('time stands still while frozen, and effects are saved with the time they have left', () => {
  const fx = createEffects(defs);
  fx.apply('poisoned', 1); fx.tick(0); fx.tick(1500);
  fx.freeze(); assert.equal(fx.tick(900_000).ticks.length, 0);
  assert.equal(fx.has('poisoned'), true);
  const saved = JSON.parse(JSON.stringify(fx.save()));
  const again = createEffects(defs); again.load(saved);
  assert.equal(again.get('poisoned').left, fx.get('poisoned').left);
  again.load([{ id: 'gone', tier: 1, left: 100 }, { id: 'burning', tier: 'x', left: 100 }, null]); // junk is dropped
  assert.equal(again.list.length, 0);
});

test('spell damage rolls its range plus spell power, and resistance scales it; zero is immunity', () => {
  const bolt = books.spells.firebolt, zero = () => 0;
  assert.deepEqual(spellDamage(bolt, {}, 0, zero), { damage: 6, resisted: 1, immune: false });
  assert.equal(spellDamage(bolt, {}, 3, zero).damage, 9);
  assert.equal(spellDamage(bolt, { resist: { fire: 1.5 } }, 0, zero).damage, 9);
  assert.equal(spellDamage(bolt, { resist: { fire: 0.1 } }, 0, zero).damage, 1, 'a hit is at least 1');
  assert.deepEqual(spellDamage(bolt, { resist: { fire: 0 } }, 0, zero), { damage: 0, resisted: 0, immune: true });
  assert.equal(spellDamage(bolt, { immune: ['fire'] }, 0, zero).immune, true);
  assert.equal(spellHeal(books.spells.mending, 2, zero), 12);
  assert.equal(spellRange(books.spells.mending), 0); assert.equal(spellRange(bolt), 3);
});

test('a spell has requirements and a description; effects can be resisted by kind or by name', () => {
  assert.equal(canLearn(books.spells.frostbolt, { level: 1, attrs: { intellect: 4 } }).ok, false);
  assert.equal(canLearn(books.spells.frostbolt, { level: 2, attrs: { intellect: 4 } }).ok, true);
  assert.equal(canLearn({ name: 'X', requires: { intellect: 7 } }, { level: 9, attrs: { intellect: 4 } }).ok, false);
  assert.match(describeSpell(books.spells.firebolt, { damageTypes: books.damageTypes, effects: defs }), /5 mana, fire, 6–10 damage, burning 40%, reaches 3 tiles/);
  assert.equal(isImmune({ immune: ['poison'] }, defs.poisoned, 'poisoned'), true, 'immune to the kind');
  assert.equal(isImmune({ immune: ['burning'] }, defs.burning, 'burning'), true, 'immune to the effect');
  assert.equal(isImmune({ resist: { fire: 0 } }, defs.burning, 'burning'), true);
  assert.equal(isImmune({ resist: { fire: 0.5 } }, defs.burning, 'burning'), false);
});

test('the books check their own references', () => {
  const book = extra => () => mergeContent(engineContent, defineContent('file:///x/', extra));
  const types = { plasma: { name: 'plasma', magic: true } };
  assert.throws(book({ spells: { s: { cost: 1, magicType: 'plasma' } } }), /unknown damage type "plasma"/);
  assert.throws(book({ damageTypes: types, spells: { s: { cost: 1, magicType: 'plasma', target: 'moon' } } }), /unknown target/);
  assert.throws(book({ damageTypes: types, spells: { s: { cost: 1, effect: { id: 'nope' } } } }), /unknown effect "nope"/);
  assert.throws(book({ effects: { e: { name: 'E' } } }), /needs a duration/);
  assert.throws(book({ damageTypes: types, enchantments: { e: { name: 'E', type: 'plasma', tier: 5 } } }), /tier from 1 to 4/);
  assert.throws(book({ items: { book: { name: 'B', teaches: 'nope' } } }), /teaches an unknown spell/);
  assert.throws(book({ monsters: { rat: { immune: ['dust'] } } }), /immune to "dust"/);
  assert.doesNotThrow(book({ damageTypes: types, effects: { burn: { duration: 1000 } }, spells: { s: { cost: 1, magicType: 'plasma', effect: { id: 'burn' } } }, items: { b: { name: 'B', teaches: 's' } } }));
});

test('an enchantment on a family makes an item per material with the effect on it', () => {
  const sword = books.items['iron-sword-flame'], mail = books.items['iron-mail-frost'], plain = books.items['iron-sword'];
  assert.equal(sword.name, 'Iron sword of flame');
  assert.deepEqual(sword.enchant, { id: 'flame', type: 'fire', tier: 2 });
  assert.deepEqual(sword.elemental, { type: 'fire', damage: [2, 4] });
  assert.equal(sword.onHit.effect, 'burning');
  assert.equal(sword.value, plain.value * 3);
  assert.equal(sword.damage[0], plain.damage[0], 'the blow itself is the plain sword');
  assert.equal(mail.resist.frost, 0.75); assert.equal(mail.resist.blade, 0.8, 'its own resistance is kept');
  assert.equal(plain.enchant, undefined);
  assert.equal(books.items['iron-sword-dawn'].enchant.tier, 4);
  assert.equal(books.items['iron-sword-dawn'].drop, false);
  assert.throws(() => forgeFamilies({ x: { name: 'X', materials: ['iron'], enchants: ['nope'] } }, books.materials, books.enchantments), /unknown enchantment/);
});

test('what an enchanted weapon changes is said in words', () => {
  const plain = deriveStats({ strength: 6, vitality: 6, intellect: 4, agility: 5 }, { weapon: books.items['iron-sword'] });
  const flame = deriveStats({ strength: 6, vitality: 6, intellect: 4, agility: 5 }, { weapon: books.items['iron-sword-flame'] });
  assert.deepEqual(compareStats(plain, flame, books.damageTypes, defs), ['+2–4 fire damage', 'burning on hit']);
  assert.deepEqual(compareStats(flame, plain, books.damageTypes, defs), ['no more +2–4 fire damage', 'no burning on hit']);
});

// Magic in play: a sim in an arena with one creature at a time.
async function arena(kind, { spells = ['firebolt'], hero = { xp: 120 }, at = { x: 1, z: 2 }, items, equip, seed = 5 } = {}) {
  const sim = await createSimulation({ campaign, seed, scenario: { level: 'dungeon', at: { x: 1, z: 1, dir: 2 }, clear: true, grace: 0, hero, spells, items, equip,
    spawn: [{ kind, id: 'foe', ...at, dir: 0 }] } });
  const events = [];
  sim.on('*', e => events.push(e));
  const foe = () => sim.session.monsters.actors.find(a => a.id === 'foe');
  return { sim, events, foe };
}

test('casting costs mana, waits out its cooldown, and hurts what stands in the line ahead', async () => {
  const { sim, foe } = await arena('goblin', { at: { x: 1, z: 3 } });
  const mp = sim.hero.mp, hp = foe().hp;
  const r = sim.cast('firebolt');
  assert.equal(r.ok, true); assert.equal(sim.hero.mp, mp - 5);
  assert.ok(foe().hp < hp, 'it reached two tiles away');
  assert.deepEqual(sim.cast('firebolt'), { ok: false, reason: 'cooldown', wait: 750 });
  sim.wait(800);
  assert.equal(sim.cast('firebolt').ok, true);
});

test('a spell is refused without the spell, the mana, a target or the knowledge', async () => {
  const { sim } = await arena('goblin', { at: { x: 1, z: 7 } });
  assert.deepEqual(sim.cast('firebolt'), { ok: false, reason: 'no-target' });
  assert.equal(sim.hero.mp, sim.hero.maxMp, 'no mana for a spell with nothing to hit');
  assert.deepEqual(sim.cast('frostbolt'), { ok: false, reason: 'not-known' });
  assert.deepEqual(sim.cast('nonsense'), { ok: false, reason: 'unknown' });
  const none = await arena('goblin', { spells: [] });
  assert.deepEqual(none.sim.cast(), { ok: false, reason: 'no-spells' });
});

test('without the mana a spell is refused', async () => {
  const { sim } = await arena('goblin', { at: { x: 1, z: 3 } });
  sim.hero.mp = 4;
  assert.deepEqual(sim.cast('firebolt'), { ok: false, reason: 'mana' });
  assert.equal(sim.hero.mp, 4);
});

test('a wall stops a bolt, and a creature beside the hero is in reach', async () => {
  const { sim } = await arena('goblin', { at: { x: 1, z: 2 } });
  assert.equal(sim.cast('firebolt').ok, true);
  const walled = await arena('goblin', { at: { x: 1, z: 5 } });
  walled.sim.face(0); // north: the wall of the dead end
  assert.equal(walled.sim.cast('firebolt').reason, 'no-target');
});

test('a creature that resists a kind of magic takes less, and an immune one nothing', async () => {
  const zombie = await arena('zombie'), skeleton = await arena('skeleton'), ghoul = await arena('ghoul', { spells: ['firebolt'] });
  const hp = a => a.foe().hp;
  const zombieHp = hp(zombie); zombie.sim.cast('firebolt');
  const skeletonHp = hp(skeleton); skeleton.sim.cast('firebolt');
  assert.ok(zombieHp - hp(zombie) >= 9, 'a zombie is weak to fire (x1.5 of at least 6)');
  assert.ok(skeletonHp - hp(skeleton) <= 10);
  const frozen = await arena('skeleton', { spells: ['firebolt', 'frostbolt'] });
  const before = frozen.foe().hp; frozen.sim.cast('frostbolt');
  assert.ok(before - frozen.foe().hp <= 4, 'the dead shrug off frost (x0.5)');
  const holyPoison = await arena('skeleton', { spells: ['firebolt'] });
  assert.equal(holyPoison.sim.session.applyEffect(holyPoison.foe(), 'poisoned', 1), 'immune');
  assert.ok(ghoul.sim.session.applyEffect(ghoul.foe(), 'poisoned', 1) === 'immune');
  assert.ok(holyPoison.events.some(e => e.type === 'effect' && e.result === 'immune'));
});

test('burning hurts a creature over time and can kill it, with experience for the hero', async () => {
  const { sim, events, foe } = await arena('goblin');
  foe().hp = 4; // goblin: 19 hp
  sim.session.applyEffect(foe(), 'burning', 2);
  sim.wait(6000);
  assert.ok(events.some(e => e.type === 'kill' && e.target.id === 'foe'), 'it burned to death');
  assert.equal(sim.hero.xp > 120, true);
});

test('a chill slows a creature and a stun stops it', async () => {
  const { sim, foe } = await arena('goblin', { at: { x: 1, z: 6 } });
  sim.session.applyEffect(foe(), 'chilled', 2);
  sim.wait(50);
  assert.equal(foe().slowFactor, 0.65);
  sim.session.applyEffect(foe(), 'stunned', 1);
  sim.wait(50);
  assert.equal(foe().stunned, true);
  sim.wait(2500);
  assert.equal(foe().stunned, false, 'a stun ends');
});

test('a stunned creature does not strike, and one that is not stunned does', async () => {
  const quick = await arena('goblin', { hero: { xp: 0 } });
  quick.sim.wait(4000);
  assert.ok(quick.events.some(e => e.type === 'damage-taken' || e.type === 'evade'), 'an ordinary goblin strikes');
  const stunned = await arena('goblin', { hero: { xp: 0 } });
  stunned.sim.session.applyEffect(stunned.foe(), 'stunned', 4);
  stunned.sim.wait(2000);
  assert.equal(stunned.events.some(e => e.type === 'damage-taken' || e.type === 'evade'), false);
});

test('effects on the hero hurt, heal, change stats, wear off, and are saved', async () => {
  const { sim } = await arena('goblin', { at: { x: 1, z: 9 }, hero: { xp: 0 } });
  const { session, hero } = sim;
  const defence = hero.defence, hp = hero.hp;
  session.applyEffect('hero', 'warded', 2);
  assert.equal(hero.defence, defence + 3);
  session.applyEffect('hero', 'poisoned', 1);
  sim.wait(3500);
  assert.ok(hero.hp < hp, 'the poison hurt');
  const saved = JSON.parse(JSON.stringify(session.persistence.snapshot({})));
  assert.deepEqual(saved.sections.engine.magic.data.effects.map(e => e.id).sort(), ['poisoned', 'warded']);
  session.applyEffect('hero', 'chilled', 4);
  assert.equal(hero.attackMs, Math.round(hero.unarmed.speed / 0.35), 'a chilled hero swings slower');
  sim.wait(60_000);
  assert.equal(session.heroEffects.list.length, 0, 'everything wore off');
  assert.equal(hero.defence, defence);
});

test('a hero with a ring of fire warding is hurt less by burning', async () => {
  const bare = await arena('goblin', { at: { x: 1, z: 9 }, hero: { xp: 0 } }), ringed = await arena('goblin', { at: { x: 1, z: 9 }, hero: { xp: 0 }, items: [{ item: 'ember-ring' }], equip: ['ember-ring'] });
  const burn = async a => { a.sim.session.applyEffect('hero', 'burning', 3); const hp = a.sim.hero.hp; a.sim.wait(6000); return hp - a.sim.hero.hp; };
  const [a, b] = [await burn(bare), await burn(ringed)];
  assert.ok(b < a, `the ring cut the burn from ${a} to ${b}`);
});

test('a death by burning is a death', async () => {
  const { sim, events, foe } = await arena('goblin', { at: { x: 1, z: 9 }, hero: { xp: 0 } });
  sim.hero.hp = 2;
  sim.session.applyEffect('hero', 'burning', 4);
  sim.wait(5000);
  assert.equal(sim.dead, true);
  assert.equal(events.find(e => e.type === 'death').source.kind, 'burning');
  void foe;
});

test('a spell on oneself heals and puts its effect on the hero', async () => {
  const { sim } = await arena('goblin', { spells: ['mending', 'ward'], at: { x: 1, z: 9 }, hero: { xp: 60 } });
  sim.hero.hp = 10;
  const r = sim.cast('mending');
  assert.equal(r.ok, true); assert.ok(sim.hero.hp >= 20);
  assert.equal(sim.session.heroEffects.has('regeneration'), true);
  assert.equal(sim.cast('ward').ok, true);
  assert.equal(sim.state().hero.effects.some(e => e.id === 'warded' && !e.harmful), true);
});

test('an area spell strikes everything in its reach', async () => {
  const { sim, events } = await arena('goblin', { spells: ['thunderclap'], hero: { xp: 120 } });
  await sim.session.api.spawn('goblin', { id: 'second', x: 1, z: 3, dir: 0 });
  sim.hero.mp = sim.hero.maxMp;
  const r = sim.cast('thunderclap');
  assert.equal(r.ok, true); assert.equal(r.targets.length, 2);
  assert.equal(events.filter(e => e.type === 'damage-dealt').length, 2);
});

test('an enchanted weapon adds its own damage and may put its effect on what it hits', async () => {
  const plain = await arena('zombie', { equip: ['iron-sword'], hero: { xp: 0 } }), flame = await arena('zombie', { equip: ['iron-sword-flame'], hero: { xp: 0 } });
  for (const a of [plain, flame]) a.foe().hp = a.foe().maxHp = 5000; // it must outlast the swings
  const deal = a => { for (let i = 0; i < 12; i++) a.sim.attack('foe'); return a.events.filter(e => e.type === 'damage-dealt').reduce((n, e) => n + e.amount, 0); };
  const [dp, df] = [deal(plain), deal(flame)];
  assert.ok(df >= dp + 12, `the flaming sword does more (${df} against ${dp})`);
  assert.ok(flame.events.some(e => e.type === 'effect' && e.effect === 'burning'), 'and sets the zombie alight');
});

test('a poisonous creature may poison the hero, and an antidote cures it', async () => {
  const { sim, events } = await arena('spider', { hero: { xp: 0 }, items: [{ item: 'antidote', qty: 2 }], at: { x: 1, z: 2 } });
  for (let i = 0; i < 30 && !sim.session.heroEffects.has('poisoned') && !sim.dead; i++) sim.wait(500);
  assert.ok(sim.session.heroEffects.has('poisoned') || sim.dead, 'a spider bites with venom');
  if (sim.dead) return;
  const r = sim.use('antidote');
  assert.equal(r.consumed, true);
  assert.equal(sim.session.heroEffects.has('poisoned'), false);
  assert.equal(sim.use('antidote').message, 'You are not poisoned.');
  void events;
});

test('a scroll teaches a spell once and is used up; requirements are checked; spells are saved', async () => {
  const { sim } = await arena('goblin', { spells: [], at: { x: 1, z: 9 }, hero: { xp: 0 }, items: [{ item: 'scroll-firebolt' }, { item: 'scroll-firebolt' }, { item: 'tome-frostbolt' }] });
  const r = sim.use('scroll-firebolt');
  assert.equal(r.consumed, true); assert.deepEqual(sim.session.known, ['firebolt']);
  assert.equal(sim.use('scroll-firebolt').consumed, false, 'known already: not used up');
  assert.match(sim.use('tome-frostbolt').message, /must be level 2/);
  assert.equal(sim.inventory.count('tome-frostbolt'), 1);
  sim.hero.gain(60);
  assert.equal(sim.use('tome-frostbolt').consumed, true);
  const saved = JSON.parse(JSON.stringify(sim.session.persistence.snapshot({})));
  assert.deepEqual(saved.sections.engine.magic.data.known, ['firebolt', 'frostbolt']);
  assert.equal(sim.session.setReadySpell('frostbolt'), 'frostbolt');
  assert.equal(sim.state().readySpell, 'frostbolt');
  assert.equal(sim.state().spells.length, 2);
});

test('the engine predefines the kinds of magic and the common effects, and its creatures resist them', () => {
  assert.deepEqual(Object.keys(engineBooks.damageTypes).sort(), ['fire', 'frost', 'holy', 'poison', 'shock']);
  assert.ok(engineBooks.damageTypes.fire.colour && engineBooks.damageTypes.fire.magic);
  assert.deepEqual(Object.keys(engineBooks.effects).sort(), ['burning', 'chilled', 'poisoned', 'regeneration', 'stunned', 'warded']);
  assert.deepEqual(engineBooks.spells, {}, 'spells are the campaign’s');
  const { skeleton, zombie, spider, troll } = engineBooks.monsters;
  assert.deepEqual([skeleton.immune, skeleton.resist.holy, zombie.resist.fire, troll.resist.fire], [['poison'], 1.5, 1.5, 1.5]);
  assert.equal(spider.onHit.effect, 'poisoned');
  // and a campaign that adds a physical resistance keeps them
  assert.equal(books.monsters.skeleton.resist.blunt, 1.5); assert.equal(books.monsters.skeleton.resist.holy, 1.5);
  assert.deepEqual(books.monsters.skeleton.immune, ['poison']);
});
