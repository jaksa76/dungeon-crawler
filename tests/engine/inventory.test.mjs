import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createInventory, addToStacks, takeStack, takeAll, checkItems } from '../../engine/rules/inventory.js';
import { rollLoot, resolveContents } from '../../engine/rules/loot.js';
import { interact } from '../../engine/rules/interaction.js';
import { engineBooks } from '../support.mjs';

const itemDefs = engineBooks.items;

const defs = {
  potion: { name: 'Potion', type: 'potion', icon: 2, stack: 3, description: 'x' },
  sword: { name: 'Sword', type: 'weapon', icon: 0, description: 'x' },
};
const add = defs => (stacks, id, qty) => addToStacks(defs, stacks, id, qty);

test('adding items stacks them up to the stack size and then uses new slots', () => {
  const pack = createInventory(defs, { size: 3 });
  assert.equal(pack.add('potion', 2), 0);
  assert.equal(pack.add('potion', 2), 0);
  assert.deepEqual(pack.slots.map(s => s && [s.id, s.qty]), [['potion', 3], ['potion', 1], null]);
  assert.equal(pack.count('potion'), 4);
  assert.equal(pack.used, 2);
});

test('items that do not fit are handed back, and unknown items are rejected', () => {
  const pack = createInventory(defs, { size: 1 });
  assert.equal(pack.add('sword'), 0);
  assert.equal(pack.add('sword'), 1);
  assert.equal(pack.add('potion', 5), 5);
  assert.throws(() => pack.add('nope'), /unknown item "nope"/);
});

test('removing takes part of a stack, or empties the slot', () => {
  const pack = createInventory(defs, { size: 2, start: [{ item: 'potion', qty: 3 }] });
  assert.deepEqual(pack.remove(0, 1), { id: 'potion', qty: 1 });
  assert.equal(pack.slots[0].qty, 2);
  assert.deepEqual(pack.remove(0), { id: 'potion', qty: 2 });
  assert.equal(pack.slots[0], null);
  assert.equal(pack.remove(1), null);
});

test('starting items that do not fit are an error', () => {
  assert.throws(() => createInventory(defs, { size: 1, start: [{ item: 'sword' }, { item: 'sword' }] }), /do not fit/);
});

test('dragging a slot moves it, merges the same item, or swaps', () => {
  const pack = createInventory(defs, { size: 4, start: [{ item: 'sword' }, { item: 'potion', qty: 3 }, { item: 'potion', qty: 3 }] });
  // slots: sword, potion x3, potion x3, empty
  assert.equal(pack.move(0, 3), true);                       // into an empty slot
  assert.deepEqual(pack.slots.map(s => s && s.id), [null, 'potion', 'potion', 'sword']);
  assert.equal(pack.move(1, 3), true);                       // different items swap
  assert.deepEqual(pack.slots.map(s => s && s.id), [null, 'sword', 'potion', 'potion']);
  // a full stack does not take more, so dropping onto it swaps
  assert.equal(pack.move(2, 3), true);
  assert.deepEqual(pack.slots.map(s => s && [s.id, s.qty]), [null, ['sword', 1], ['potion', 3], ['potion', 3]]);
  pack.remove(2, 1); pack.remove(3, 2);                      // potion x2 in slot 2, x1 in slot 3
  assert.equal(pack.move(3, 2), true);                       // the same item merges into room that is left
  assert.deepEqual(pack.slots.map(s => s && [s.id, s.qty]), [null, ['sword', 1], ['potion', 3], null]);
  assert.equal(pack.move(0, 1), false);                      // nothing to move
  assert.equal(pack.move(1, 1), false);
  assert.equal(pack.move(1, 9), false);
});

test('taking from a container moves what fits and leaves the rest', () => {
  const pack = createInventory(defs, { size: 2, start: [{ item: 'sword' }] });
  const box = [{ id: 'potion', qty: 3 }, { id: 'potion', qty: 3 }, { id: 'sword', qty: 1 }];
  assert.equal(takeStack(pack, box, 0), 3);
  assert.equal(box.length, 2);
  assert.equal(takeStack(pack, box, 0), 0); // the pack is full
  assert.equal(box.length, 2);
  assert.equal(takeStack(pack, box, 5), 0);
});

test('take all takes every stack that fits and leaves the others behind', () => {
  const pack = createInventory(defs, { size: 2 });
  const box = [{ id: 'sword', qty: 1 }, { id: 'potion', qty: 3 }, { id: 'sword', qty: 1 }];
  assert.deepEqual(takeAll(pack, box), [{ id: 'sword', qty: 1 }, { id: 'potion', qty: 3 }]);
  assert.deepEqual(box, [{ id: 'sword', qty: 1 }]);
  const roomy = createInventory(defs, { size: 4 });
  assert.deepEqual(takeAll(roomy, box), [{ id: 'sword', qty: 1 }]);
  assert.deepEqual(box, []);
});

test('piles of stacks merge up to the stack size', () => {
  const pile = [];
  addToStacks(defs, pile, 'potion', 2); addToStacks(defs, pile, 'potion', 4);
  assert.deepEqual(pile, [{ id: 'potion', qty: 3 }, { id: 'potion', qty: 3 }]);
});

test('loot tables roll by weight, with ranges and an empty chance', () => {
  const table = { entries: [{ item: 'potion', weight: 3, qty: [1, 2] }, { item: 'sword' }], none: 1 };
  // total weight 5: [0, 3) potion, [3, 4) sword, [4, 5) nothing
  assert.deepEqual(rollLoot(table, () => 0), [{ item: 'potion', qty: 1 }]);
  assert.deepEqual(rollLoot(table, () => 0.59), [{ item: 'potion', qty: 2 }]);
  assert.deepEqual(rollLoot(table, () => 0.7), [{ item: 'sword', qty: 1 }]);
  assert.deepEqual(rollLoot(table, () => 0.9), []);
  assert.equal(rollLoot({ rolls: 3, entries: [{ item: 'sword' }] }, () => 0.5).length, 3);
});

test('a container holds its contents plus what was rolled', () => {
  const stacks = resolveContents({ contents: [{ item: 'sword' }, { item: 'potion', qty: 2 }], loot: { entries: [{ item: 'potion' }] } }, add(defs), () => 0);
  assert.deepEqual(stacks, [{ id: 'sword', qty: 1 }, { id: 'potion', qty: 3 }]);
  assert.deepEqual(resolveContents({ contents: [] }, add(defs)), []);
});

test('using a container hands the container and what it holds to the game', () => {
  const entity = { name: 'a chest', behavior: { type: 'open', title: 'Chest', contents: [{ item: 'sword' }] } };
  const relCell = (l, d) => (d === 0 ? { props: [{ anchor: 'far', entity }] } : {});
  const opened = [];
  interact(relCell, { say() {}, openContainer: (e, spec) => opened.push([e, spec]) });
  assert.equal(opened[0][0], entity);
  assert.deepEqual(opened[0][1].contents, [{ item: 'sword' }]); assert.equal(opened[0][1].title, 'Chest');
});

test('a pile on the floor is opened when nothing else is in reach, before the door ahead', () => {
  const said = [];
  let piles = 0;
  interact(() => ({}), { say: t => said.push(t), exit: { message: 'door' }, pile: () => { piles++; return true; } });
  assert.equal(piles, 1);
  assert.deepEqual(said, []);
  interact(() => ({}), { say: t => said.push(t), exit: { message: 'door' }, pile: () => false });
  assert.deepEqual(said, ['door']);
});

test('a pile also wins over a person with nothing to do, but not over a container', () => {
  const guard = { name: 'a guard' }, chest = { name: 'a chest', behavior: { type: 'open', contents: [] } };
  const facing = entity => (l, d) => (d === 0 ? { props: [{ anchor: 'far', entity }] } : {});
  const log = [];
  const ctx = { say: t => log.push(t), openContainer: () => log.push('chest'), pile: () => { log.push('pile'); return true; } };
  interact(facing(guard), ctx);
  interact(facing(chest), ctx);
  assert.deepEqual(log, ['pile', 'chest']);
});

const iconDir = new URL('../../engine/assets/icons/', import.meta.url);
const sheetsFile = new URL('../../art/engine/icons/sheets.json', import.meta.url);
const atlas = JSON.parse(fs.readFileSync(new URL('atlas.json', iconDir), 'utf8'));
const sheets = JSON.parse(fs.readFileSync(sheetsFile, 'utf8')).sheets;

test('the icon list has 100 to 200 unique icons, a full sheet of interface icons, and all of them are in the atlas', () => {
  const ids = sheets.flatMap(s => s.icons.map(line => line.split('|')[0]));
  assert.equal(new Set(ids).size, ids.length, 'icon ids are unique');
  assert.ok(ids.length >= 100 && ids.length <= 200, `${ids.length} icons`);
  assert.ok(sheets.every(s => s.icons.length === 24), 'every sheet is 6 x 4');
  for (const id of ids) assert.ok(atlas.icons[id] !== undefined, `${id} is missing from the atlas; run node tools/icon-sheets.mjs pack`);
  assert.equal(Object.keys(atlas.icons).length, ids.length);
});

test('every icon is true 16x16 pixel art, stored enlarged 4x so the atlas tiles stay 64x64', () => {
  const ids = sheets.flatMap(s => s.icons.map(line => line.split('|')[0]));
  for (const id of ids) assert.equal(atlas.native[id], 16, id);
  assert.equal(Object.keys(atlas.native).length, ids.length);
  assert.equal(atlas.size / 16, 4);
});

test('the atlas image is as large as its manifest says, and the panel and HUD use icons that exist', async () => {
  const { MENU_ICONS } = await import('../../engine/ui/hud.js');
  const header = fs.readFileSync(new URL('atlas.png', iconDir));
  const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
  assert.equal(width, atlas.cols * atlas.size);
  assert.equal(height, Math.ceil(Object.keys(atlas.icons).length / atlas.cols) * atlas.size);
  for (const id of MENU_ICONS) assert.ok(atlas.icons[id] !== undefined, id);
});

test('the detailed icon set has the same 144 ids as the pixel set, none of them pixel art', () => {
  const hd = JSON.parse(fs.readFileSync(new URL('atlas-hd.json', iconDir), 'utf8'));
  assert.deepEqual(Object.keys(hd.icons).sort(), Object.keys(atlas.icons).sort());
  assert.deepEqual(hd.native, {});
  const header = fs.readFileSync(new URL('atlas-hd.png', iconDir));
  assert.equal(header.readUInt32BE(16), hd.cols * hd.size);
});

test('the engine items are well formed and every one has an icon in the atlas', () => {
  assert.doesNotThrow(() => checkItems(itemDefs));
  for (const [id, def] of Object.entries(itemDefs)) assert.ok(atlas.icons[def.icon] !== undefined, `${id} uses an icon that is not in the atlas: ${def.icon}`);
});

test('the loot of the engine props names real items, and every hidden stash holds something', () => {
  for (const [name, prop] of Object.entries(engineBooks.props)) {
    const b = prop.behavior;
    if (b?.type !== 'open') continue;
    for (const id of [...(b.contents ?? []).map(c => c.item), ...(b.loot?.entries ?? []).map(e => e.item)]) assert.ok(itemDefs[id], `${name}: unknown item ${id}`);
    assert.ok(resolveContents(b, add(itemDefs), () => 0).length >= 1, name);
  }
});
