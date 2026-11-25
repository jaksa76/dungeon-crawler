import test from 'node:test';
import assert from 'node:assert/strict';
import { defineContent, mergeContent, forgeFamilies } from '../../engine/content/catalog.js';
import { recolour } from '../../engine/ui/icons.js';
import { engineContent } from '../../engine/content/index.js';

const materials = { bronze: { name: 'Bronze', damage: 0.5, defence: 1 }, steel: { name: 'Steel', damage: 1.5, speed: 0.8, defence: 2 } };

test('a family becomes one item per material, scaled by the material', () => {
  const items = forgeFamilies({
    axe: { name: 'Axe', type: 'weapon', slot: 'weapon', icon: 'hand-axe', damage: [4, 8], speed: 1000, damageType: 'blade',
      materials: ['bronze', 'steel'], aliases: { steel: ['old-axe'] }, description: 'A {material} axe.' },
    cap: { name: 'Cap', type: 'armour', slot: 'head', icon: 'iron-helmet', defence: 1, materials: { steel: { description: 'Shiny.' } }, description: 'x' },
    torch: { name: 'Torch' },
  }, materials);
  assert.deepEqual(Object.keys(items), ['bronze-axe', 'steel-axe', 'steel-cap', 'torch']);
  const axe = items['steel-axe'];
  assert.deepEqual([axe.name, axe.icon, axe.damage, axe.speed, axe.family, axe.material, axe.description, axe.aliases],
    ['Steel axe', 'hand-axe@steel', [6, 12], 800, 'axe', 'steel', 'A steel axe.', ['old-axe']]);
  assert.deepEqual(items['bronze-axe'].damage, [2, 4]);
  assert.equal(items['bronze-axe'].aliases, undefined);
  assert.deepEqual([items['steel-cap'].defence, items['steel-cap'].description], [3, 'Shiny.']);
  assert.throws(() => forgeFamilies({ x: { name: 'X', materials: ['tin'] } }, materials), /unknown material "tin"/);
});

test('books declare damage types; an unknown one is refused', () => {
  const base = new URL('file:///book/');
  const book = types => defineContent(base, { damageTypes: types, items: { club: { name: 'Club', type: 'weapon', slot: 'weapon', icon: 'club', damage: [1, 2], damageType: 'blunt', description: 'x' } } });
  assert.doesNotThrow(() => mergeContent(engineContent, book({ blunt: {} })));
  assert.equal(mergeContent(engineContent, book({ blunt: {} })).damageTypes.blunt.name, 'blunt');
  assert.throws(() => mergeContent(engineContent, book({})), /unknown damage type "blunt"/);
  const resists = defineContent(base, { monsters: { rat: { resist: { plasma: 2 } } } });
  assert.throws(() => mergeContent(engineContent, resists), /creature "rat" \(resist\) names an unknown damage type "plasma"/);
});

test('the engine paints every material, dark to light', () => {
  for (const [id, m] of Object.entries(engineContent.materials)) {
    assert.ok(m.colours.length >= 2 && m.colours.every(c => /^#[0-9a-f]{6}$/i.test(c)), id);
  }
});

test('recolouring repaints grey metal by its brightness and keeps outlines, colours and transparency', () => {
  const px = (...rgba) => rgba;
  const data = new Uint8ClampedArray([
    ...px(0x9b, 0x9c, 0x9c, 255), // mid grey: metal
    ...px(0xee, 0xee, 0xeb, 255), // highlight: metal
    ...px(0x18, 0x0d, 0x0a, 255), // outline: too dark
    ...px(0xb7, 0x64, 0x23, 255), // leather: not grey
    ...px(0x9b, 0x9c, 0x9c, 0),   // transparent
  ]);
  recolour(data, ['#000000', '#ff0000']);
  const at = i => [...data.slice(i * 4, i * 4 + 4)];
  assert.ok(at(0)[0] > 100 && at(0)[1] === 0 && at(0)[2] === 0, `mid grey became ${at(0)}`);
  assert.ok(at(1)[0] > at(0)[0], 'lighter grey stays lighter');
  assert.deepEqual(at(2), [0x18, 0x0d, 0x0a, 255]);
  assert.deepEqual(at(3), [0xb7, 0x64, 0x23, 255]);
  assert.deepEqual(at(4), [0x9b, 0x9c, 0x9c, 0]);
});

test('a portrait is taken from the book that names it: a campaign that repaints an NPC without one keeps the engine’s', async () => {
  const { mergeContent, defineContent } = await import('../../engine/content/catalog.js');
  const engine = defineContent('https://x/engine/assets/', { npcs: { guard: { w: 1, h: 1, portrait: 'portrait.png' } } });
  const repaint = defineContent('https://x/game/assets/', { npcs: { guard: { art: 'guard' } } });
  const own = defineContent('https://x/game/assets/', { npcs: { guard: { portrait: 'face.png' } } });
  assert.equal(mergeContent(engine).npcs.guard.portrait, 'https://x/engine/assets/npcs/guard/portrait.png');
  assert.equal(mergeContent(engine, repaint).npcs.guard.portrait, 'https://x/engine/assets/npcs/guard/portrait.png');
  assert.equal(mergeContent(engine, repaint).npcs.guard.assets, 'https://x/game/assets/npcs/guard/');
  assert.equal(mergeContent(engine, own).npcs.guard.portrait, 'https://x/game/assets/npcs/guard/face.png');
});
