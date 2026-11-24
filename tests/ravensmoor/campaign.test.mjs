import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCharacter, strike } from '../../engine/rules/combat.js';
import { createEquipment } from '../../engine/rules/equipment.js';
import { createInventory, addToStacks, checkItems } from '../../engine/rules/inventory.js';
import { resolveContents } from '../../engine/rules/loot.js';
import { checkBehavior } from '../../engine/rules/interaction.js';
import { campaign, books, engineBooks, levels, artFile, own, campaignWorld } from '../support.mjs';


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
  assert.deepEqual(createEquipment(itemDefs).gear(), { weapon: null, defence: 0, resist: {}, bonus: {} });
});

test('Ravensmoor retunes the engine torch but keeps its art and stats', () => {
  assert.match(itemDefs.torch.description, /Undercrypt/);
  assert.equal(itemDefs.torch.icon, 'torch'); assert.equal(itemDefs.torch.stack, 3);
});

test('the village’s start chest has an id, so its contents are saved by name', () => {
  assert.ok(village.level.entities.some(e => e.id === 'start-chest'));
});

test('every container in the village names real items; the chest holds the rusty sword, the well, barrels and crate hide something', () => {
  const opened = village.level.entities.filter(e => behaviorOf(e)?.type === 'open');
  assert.ok(opened.length >= 5);
  for (const entity of opened) {
    const b = behaviorOf(entity);
    for (const id of [...(b.contents ?? []).map(c => c.item), ...(b.loot?.entries ?? []).map(e => e.item)]) assert.ok(itemDefs[id], `unknown item ${id}`);
  }
  const chest = village.level.entities.find(e => e.id === 'start-chest');
  assert.ok(chest.behavior.contents.some(c => c.item === 'rusty-sword'));
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

test('the snake is Ravensmoor’s own creature, with its art in the campaign; the others are the engine’s, retuned', () => {
  assert.deepEqual(own(campaign.content, 'monsters').filter(id => !engineBooks.monsters[id]), ['snake']);
  assert.equal(books.monsters.skeleton.assets, engineBooks.monsters.skeleton.assets); // a house rule keeps the art
  assert.match(books.monsters.snake.assets, /games\/ravensmoor\/assets\/monsters\/snake\/$/);
  assert.equal(campaignWorld().find('dungeon', 'prowler').kind, 'snake');
});

// A hero wearing `items`, and how many middling blows it needs to kill a creature of `kind` in the Undercrypt.
function armed(...items) {
  const pack = createInventory(itemDefs, { size: 8 }), gear = createEquipment(itemDefs);
  for (const id of items) { pack.add(id); gear.equip(pack, pack.slots.findIndex(s => s?.id === id)); }
  return createCharacter(attrs, gear, { unarmed: campaign.unarmed });
}
const blowsToKill = (hero, kind) => {
  const foe = campaignWorld().all('dungeon', 'monster').find(m => m.kind === kind);
  return Math.ceil(foe.hp / strike(hero, foe, seq(.1, .5)).damage);
};

test('the snake can be fought: several hits unarmed, fewer with the rusty sword, fewer still with iron; it hurts the hero but not in one bite', () => {
  const snake = campaignWorld().all('dungeon', 'monster').find(m => m.kind === 'snake'), hero = armed();
  assert.ok(blowsToKill(armed(), 'snake') >= 5);
  assert.ok(blowsToKill(armed('rusty-sword'), 'snake') <= 4);
  assert.ok(blowsToKill(armed('iron-sword'), 'snake') < blowsToKill(armed('rusty-sword'), 'snake'));
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
  for (const [id, def] of Object.entries(itemDefs)) {
    const [icon, material] = def.icon.split('@');
    assert.ok(atlas.icons[icon] !== undefined || sheetIcons.has(icon), `${id}: no icon "${icon}"`);
    if (material) assert.ok(books.materials[material]?.colours?.length >= 2, `${id}: material "${material}" has no colours`);
  }
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

test('weapons and armour come in materials: a rusty sword to start, an iron mace and shield in the Undercrypt, mail in a village crate', () => {
  assert.deepEqual(Object.keys(books.damageTypes).sort(), ['blade', 'blunt', 'pierce']);
  for (const id of ['rusty-sword', 'iron-sword', 'steel-sword', 'iron-mace', 'iron-spear', 'rusty-mail', 'iron-shield']) assert.ok(itemDefs[id], id);
  assert.equal(itemDefs.sword, undefined); // a family, not an item
  assert.deepEqual(itemDefs['iron-sword'].aliases, ['sword']); // old saves keep their sword
  const damage = id => itemDefs[id].damage[0] + itemDefs[id].damage[1];
  assert.ok(damage('rusty-sword') < damage('iron-sword') && damage('iron-sword') < damage('steel-sword') && damage('steel-sword') < damage('mithril-sword'));
  assert.ok(itemDefs['steel-mail'].defence > itemDefs['rusty-mail'].defence);
  const hoard = levels.dungeon.level.entities.find(e => e.id === 'crypt-hoard');
  assert.ok(hoard.behavior.contents.some(c => c.item === 'iron-mace'));
  assert.ok(levels.village.level.entities.some(e => e.prop === 'crate' && e.behavior?.contents?.some(c => c.item === 'rusty-mail')));
});

test('a mace breaks skeletons that shrug off a sword, and a sword cuts zombies better than a spear', () => {
  assert.ok(blowsToKill(armed('iron-mace'), 'skeleton') * 2 <= blowsToKill(armed('iron-sword'), 'skeleton'));
  assert.ok(blowsToKill(armed('iron-sword'), 'zombie') < blowsToKill(armed('iron-spear'), 'zombie'));
});

test('armour makes a fight safer: mail takes off defence and blunts blades', () => {
  const goblin = campaignWorld().all('dungeon', 'monster').find(m => m.kind === 'goblin');
  const cut = hero => strike({ ...goblin, attack: goblin.damage }, hero, seq(.1, .5)).damage;
  assert.ok(cut(armed('iron-mail', 'iron-helmet')) <= cut(armed()) / 2);
});
