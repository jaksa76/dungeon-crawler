import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCharacter, strike } from '../../engine/rules/combat.js';
import { createEquipment } from '../../engine/rules/equipment.js';
import { createInventory, addToStacks, checkItems } from '../../engine/rules/inventory.js';
import { resolveContents } from '../../engine/rules/loot.js';
import { checkBehavior } from '../../engine/rules/interaction.js';
import { campaign, books, levels, artFile, own, campaignWorld } from '../support.mjs';


const itemDefs = books.items, village = levels.village;
const attrs = { strength: 6, vitality: 6, intellect: 4, agility: 5 };
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };
const add = defs => (stacks, id, qty) => addToStacks(defs, stacks, id, qty);
const behaviorOf = entity => entity.behavior ?? village.props[entity.prop].behavior;

test('the campaign starts and respawns on levels it has', () => {
  assert.ok(campaign.levels[campaign.start]);
  assert.ok(campaign.levels[campaign.respawn.level]);
});

test('the items are well formed and the starting kit fits, with nothing to wear', () => {
  assert.doesNotThrow(() => checkItems(itemDefs));
  const pack = createInventory(itemDefs, { size: 48, start: campaign.startingItems });
  assert.ok(pack.slots.every(s => !s || !itemDefs[s.id].slot));
  assert.deepEqual(createEquipment(itemDefs).bonuses(), {});
});

test('Ravensmoor retunes the engine torch but keeps its art and stats', () => {
  assert.match(itemDefs.torch.description, /Undercrypt/);
  assert.equal(itemDefs.torch.icon, 'torch'); assert.equal(itemDefs.torch.stack, 3);
});

test('the village’s start chest has an id, so its contents are saved by name', () => {
  assert.ok(village.level.entities.some(e => e.id === 'start-chest'));
});

test('every container in the village names real items; the chest holds the sword, the well, barrels and crate hide something', () => {
  const opened = village.level.entities.filter(e => behaviorOf(e)?.type === 'open');
  assert.ok(opened.length >= 5);
  for (const entity of opened) {
    const b = behaviorOf(entity);
    for (const id of [...(b.contents ?? []).map(c => c.item), ...(b.loot?.entries ?? []).map(e => e.item)]) assert.ok(itemDefs[id], `unknown item ${id}`);
  }
  const chest = village.level.entities.find(e => e.id === 'start-chest');
  assert.ok(chest.behavior.contents.some(c => c.item === 'sword'));
  assert.ok(resolveContents(chest.behavior, add(itemDefs)).length >= 2);
  for (const name of ['well', 'barrel', 'crate']) {
    const entity = village.level.entities.find(e => e.prop === name);
    assert.ok(resolveContents(behaviorOf(entity), add(itemDefs), () => 0).length >= 1, name);
  }
});

test('the village things that carry a behaviour use known types and say something', () => {
  for (const entity of village.level.entities) {
    const b = behaviorOf(entity);
    if (!b) continue;
    assert.doesNotThrow(() => checkBehavior(b, entity.name ?? entity.prop));
    if (b.text) assert.ok(b.text.length > 10);
  }
});

test('the snake is Ravensmoor’s own creature, with its art in the campaign', () => {
  assert.deepEqual(own(campaign.content, 'monsters'), ['snake']);
  assert.match(books.monsters.snake.assets, /games\/ravensmoor\/assets\/monsters\/snake\/$/);
  assert.equal(campaignWorld().find('dungeon', 'prowler').kind, 'snake');
});

test('the snake can be fought: several hits unarmed, fewer with the sword; it hurts the hero but not in one bite', () => {
  const snake = campaignWorld().all('dungeon', 'monster').find(m => m.kind === 'snake'), hero = createCharacter(attrs, createEquipment(itemDefs));
  const hits = attack => Math.ceil(snake.hp / strike({ attack, accuracy: 5 }, snake, seq(.1, .5)).damage);
  assert.ok(hits(8) >= 4); assert.ok(hits(12) <= 3);
  const bite = strike({ attack: snake.damage, accuracy: snake.accuracy }, hero, seq(.1, .5)).damage;
  assert.ok(bite > 0 && bite * 3 < hero.maxHp);
  assert.ok(bite * 6 >= hero.maxHp); // it does win in the end if you never heal: potions matter
});

test('the snake has all sixteen exported direction and distance frames', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../art/ravensmoor/snake-atlas.json', import.meta.url)));
  const frames = new Set();
  for (const frame of manifest.frames) {
    const key = `${frame.direction}-d${frame.depth}`;
    const png = fs.readFileSync(artFile(books.monsters.snake, `${key}.png`));
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png.readUInt32BE(16), frame.w); assert.equal(png.readUInt32BE(20), frame.h);
    assert.equal(png[25], 6, 'sprites must retain an alpha channel');
    frames.add(key);
  }
  assert.equal(frames.size, 16);
});

test('every creature in the Undercrypt stands on floor and has its sixteen frames', () => {
  const { level, tileTypes } = levels.dungeon;
  for (const m of campaignWorld().all('dungeon', 'monster')) {
    assert.equal(tileTypes[level.tiles[m.z][m.x]].floor, true, `${m.id} must stand on floor`);
    for (const d of ['front', 'back', 'left', 'right']) for (let n = 0; n < 4; n++) {
      assert.ok(fs.existsSync(new URL(`${d}-d${n}.png`, m.assets)), `${m.art} ${d}-d${n}`);
    }
  }
});

test('every item has an icon, from the engine’s atlas or Ravensmoor’s own sheet, and the sheet holds all its icons', () => {
  const atlas = JSON.parse(fs.readFileSync(new URL('../../engine/assets/icons/atlas.json', import.meta.url), 'utf8'));
  const sheetIcons = new Set(Object.values(books.icons).flatMap(sheet => sheet.icons));
  for (const [id, def] of Object.entries(itemDefs)) assert.ok(atlas.icons[def.icon] !== undefined || sheetIcons.has(def.icon), `${id}: no icon "${def.icon}"`);
  for (const sheet of Object.values(books.icons)) for (const version of [sheet, sheet.detailed].filter(Boolean)) {
    const png = fs.readFileSync(new URL(version.url));
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    const cols = Math.floor(png.readUInt32BE(16) / version.tile), rows = Math.floor(png.readUInt32BE(20) / version.tile);
    assert.ok(cols * rows >= sheet.icons.length, `${sheet.id}: ${sheet.icons.length} icons in ${cols * rows} tiles`);
    assert.equal(png[25], 6, `${sheet.id}: icons need an alpha channel`);
  }
});

test('Ravensmoor’s icon sheet lists its icons in the order the icon tool packed them', () => {
  const { sheets } = JSON.parse(fs.readFileSync(new URL('../../art/ravensmoor/icons/sheets.json', import.meta.url), 'utf8'));
  assert.deepEqual(books.icons.ravensmoor.icons, sheets.flatMap(s => s.icons.map(line => line.split('|')[0])));
});

test('the raven amulet is Ravensmoor’s own item, worn as an amulet, and hidden in the village well', () => {
  assert.deepEqual(books.items['raven-amulet'].slot, 'amulet');
  const well = village.level.entities.find(e => e.prop === 'well');
  assert.ok(well.behavior.contents.some(c => c.item === 'raven-amulet'));
});

// A game API over a world of the campaign, for content methods: enough to talk, carry things and open doors.
function play() {
  const world = campaignWorld(), said = [], inventory = createInventory(itemDefs, { size: 48 });
  const game = { say: t => said.push(t), inventory, items: itemDefs, find: world.find, changed: world.changed,
    level: 'village', isHere: inst => inst.level === 'village', blocked: () => false };
  return { world, said, inventory, game };
}

test('the hooded stranger gives the Raven horn once, and remembers it', () => {
  const { world, said, inventory, game } = play(), stranger = world.all('village', 'npc').find(n => n.prop === 'hooded');
  stranger.interact(game);
  assert.equal(inventory.count('raven-horn'), 1); assert.equal(stranger.state.gaveHorn, true);
  stranger.interact(game);
  assert.equal(inventory.count('raven-horn'), 1); assert.match(said.at(-1), /Sound the horn/);
});

test('the Raven horn opens the locked crypt gate in the Undercrypt from the village', () => {
  const { world, said, game } = play(), gate = world.find('dungeon', 'crypt-gate');
  assert.equal(gate.isOpen(), false); assert.equal(gate.state.locked, true);
  const horn = itemDefs['raven-horn'], result = horn.use.call(horn, game);
  assert.equal(gate.isOpen(), true); assert.equal(result.consumed, undefined, 'the horn is kept');
  assert.match(said.at(-1), /Far below/);
  horn.use.call(horn, game);
  assert.match(said.at(-1), /already stands open/);
});
