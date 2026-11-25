import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseLayout, fitScale, LAYOUTS, VIEW_W, VIEW_H } from '../../engine/ui/screen.js';
import { hudRects } from '../../engine/ui/hud.js';
import { plain, wrapText, fitText, createCanvasKit } from '../../engine/ui/canvas.js';

// The canvas kit draws with a Path2D font and a 2D context; neither exists in node, so stand in for them.
globalThis.Path2D = class { rect() {} };
const stubContext = () => new Proxy({}, { get: (target, name) => (name in target ? target[name] : () => {}), set: (target, name, value) => { target[name] = value; return true; } });

test('there are two layouts built round the same 320x180 scene', () => {
  assert.deepEqual([VIEW_W, VIEW_H], [320, 180]);
  assert.deepEqual([LAYOUTS.desktop.w, LAYOUTS.desktop.h], [320, 240]);
  assert.deepEqual([LAYOUTS.mobile.w, LAYOUTS.mobile.h], [400, 180]);
  assert.deepEqual(LAYOUTS.desktop.view, { x: 0, y: 0, w: 320, h: 180 });
  assert.deepEqual(LAYOUTS.mobile.view, { x: 40, y: 0, w: 320, h: 180 });
  assert.equal(LAYOUTS.desktop.bar.h, 60, 'the bar fills what is under the scene');
});

test('a phone held upright asks for a rotation; a desktop never does', () => {
  assert.equal(chooseLayout({ coarse: false, width: 1280, height: 720 }), 'desktop');
  assert.equal(chooseLayout({ coarse: false, width: 400, height: 900 }), 'desktop', 'a narrow desktop window is still a desktop');
  assert.equal(chooseLayout({ coarse: true, width: 915, height: 412 }), 'mobile');
  assert.equal(chooseLayout({ coarse: true, width: 412, height: 915 }), 'rotate');
  assert.equal(chooseLayout({ coarse: false, width: 915, height: 412, force: 'mobile' }), 'mobile', '?layout=mobile');
  assert.equal(chooseLayout({ coarse: true, width: 915, height: 412, force: 'desktop' }), 'desktop', '?layout=desktop');
});

test('the canvas is shown at a whole number of device pixels per pixel', () => {
  // A Pixel 7a held sideways: 914 x 411 CSS pixels at 2.625 device pixels each is 2400 x 1080, exactly six times 400 x 180.
  const pixel = fitScale(LAYOUTS.mobile, 914, 411, 2.625);
  assert.equal(pixel.k, 6); assert.equal(pixel.crisp, true);
  assert.ok(Math.abs(pixel.cssW * 2.625 - 2400) < 1e-6, 'six device pixels per canvas pixel');
  assert.equal(fitScale(LAYOUTS.mobile, 844, 390, 3).k, 6, 'an iPhone held sideways');
  assert.equal(fitScale(LAYOUTS.mobile, 667, 375, 2).k, 3, 'an iPhone SE');
  assert.equal(fitScale(LAYOUTS.desktop, 1280, 800 - 70, 1).k, 3, 'a desktop leaves room for the help line');
  assert.equal(fitScale(LAYOUTS.desktop, 1920, 1080, 1).k, 4);
  for (const [layout, w, h, dpr] of [[LAYOUTS.desktop, 1366, 700, 1.25], [LAYOUTS.mobile, 851, 393, 2.75]]) {
    const { k, cssW, cssH } = fitScale(layout, w, h, dpr);
    assert.ok(Number.isInteger(k) && cssW <= w + 0.01 && cssH <= h + 0.01, 'never bigger than the window, and a whole number');
  }
  const tiny = fitScale(LAYOUTS.desktop, 200, 150, 1);
  assert.equal(tiny.crisp, false); assert.ok(tiny.k < 1, 'a window smaller than the canvas shrinks it smoothly instead');
});

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('the HUD fits its layout: everything is on the canvas, nothing overlaps, and the rails keep their rims', () => {
  for (const layout of Object.values(LAYOUTS)) {
    const r = hudRects(layout, 8), things = { head: r.head, hp: r.hp, mp: r.mp, xp: r.xp, minimap: r.minimap, ...Object.fromEntries(r.buttons.map((b, i) => [`button ${i}`, b])), ...Object.fromEntries(r.slots.map((b, i) => [`slot ${i}`, b])) };
    assert.equal(r.buttons.length, 6); assert.equal(r.slots.length, 8);
    for (const [name, box] of Object.entries(things)) {
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= layout.w && box.y + box.h <= layout.h, `${layout.name} ${name} is on the canvas`);
      if (layout.view) assert.ok(!overlap(box, layout.view) || layout.name === 'desktop' && box.y >= VIEW_H || false, `${layout.name} ${name} is outside the scene`);
    }
    const names = Object.keys(things);
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      assert.ok(!overlap(things[names[i]], things[names[j]]), `${layout.name}: ${names[i]} and ${names[j]} overlap`);
    }
  }
  const m = hudRects(LAYOUTS.mobile);
  for (const box of [m.head, m.hp, m.mp, m.xp, ...m.buttons]) assert.ok(box.x + box.w <= 38, 'left rail content stays inside the rim at x 38');
  for (const box of [m.minimap, ...m.slots]) assert.ok(box.x >= 362 && box.x + box.w <= 399, 'right rail content stays inside the rim at x 361');
  assert.deepEqual([m.move.cx, m.turn.cx], [19, 380]);
  assert.ok(m.slots.every(s => s.w >= 18 && s.h >= 18), 'a quick slot is at least 18 pixels, 41 CSS pixels on a Pixel 7a');
  assert.equal(hudRects(LAYOUTS.desktop).numbers, true); assert.equal(m.numbers, false);
});

test('the HUD lines up: one top line and even margins on the desktop bar, one column per rail on a phone', () => {
  const d = hudRects(LAYOUTS.desktop, 8), right = box => box.x + box.w, bottom = box => box.y + box.h;
  assert.equal(new Set([d.head, d.hp, d.buttons[0], d.minimap].map(b => b.y)).size, 1, 'head, bars, buttons and minimap start on one line');
  assert.equal(d.head.x, 320 - right(d.minimap), 'the same margin at both ends of the bar');
  assert.deepEqual([d.hp.x - right(d.head), d.slots[0].x - right(d.hp), d.minimap.x - right(d.slots.at(-1))], [4, 4, 4], 'the groups are 4 pixels apart');
  assert.equal(d.buttons[0].x - d.slots[0].x, right(d.slots.at(-1)) - right(d.buttons.at(-1)), 'the buttons are centred on the quick bar');
  assert.equal(bottom(d.slots[0]), bottom(d.xp), 'the quick bar ends where the bars do');
  const six = hudRects(LAYOUTS.desktop, 6);
  assert.ok(six.buttons[0].x >= right(six.hp) + 4, 'with fewer slots the buttons still clear the bars');
  const m = hudRects(LAYOUTS.mobile, 8);
  for (const box of [m.head, m.hp, m.mp, m.xp]) assert.deepEqual([box.x, right(box)], [m.buttons[0].x, right(m.buttons[1])], 'the left rail is one column');
  assert.deepEqual([m.minimap.x, right(m.minimap)], [m.slots[0].x, right(m.slots[1])], 'the right rail is one column');
  assert.equal(m.slots[0].y - bottom(m.minimap), 1, 'the minimap sits one pixel above the slots, as the slots sit apart');
  assert.equal(m.buttons[0].x, 400 - right(m.slots[1]), 'the rails mirror each other');
});

test('text the bitmap font cannot draw becomes something it can, and wraps to the width', () => {
  assert.equal(plain('Fire × 2 – café “quoted”'), 'Fire x 2 - cafe "quoted"');
  assert.equal(plain('☃'), '?');
  assert.deepEqual(wrapText('one two three four', 50), ['one two', 'three four'], '10 characters a line');
  assert.deepEqual(wrapText('one two three four', 45), ['one two', 'three', 'four'], '9 characters a line');
  assert.deepEqual(wrapText('a\nb', 100), ['a', 'b'], 'a newline starts a line');
  assert.deepEqual(wrapText('abcdefghijkl', 25), ['abcde', 'fghij', 'kl'], 'a word too long for a line is cut');
  assert.equal(fitText('Hello world', 100), 'Hello world');
  assert.equal(fitText('Hello world', 40), 'Hello...');
  assert.equal(fitText('Hello world', 40).length * 5 <= 40, true);
});

test('regions answer for the point: topmost first, clipped, scrollable', () => {
  const kit = createCanvasKit(stubContext());
  kit.begin();
  kit.hit(0, 0, 100, 100, { key: 'panel' });
  kit.hit(10, 10, 20, 20, { key: 'button' });
  assert.equal(kit.at(15, 15).key, 'button', 'a later region is on top');
  assert.equal(kit.at(50, 50).key, 'panel');
  assert.equal(kit.at(150, 50), null);
  assert.equal(kit.at(15, 15, r => r.key === 'panel').key, 'panel', 'a filter looks through');
  kit.begin();
  assert.equal(kit.at(15, 15), null, 'a new frame forgets the last one');

  kit.origin(40, 0);
  kit.hit(5, 5, 10, 10, { key: 'shifted' });
  assert.deepEqual(kit.regions().find(r => r.key === 'shifted'), { key: 'shifted', x: 45, y: 5, w: 10, h: 10, title: '', disabled: false }, 'regions are in canvas pixels');
  kit.begin();

  // A scrolling area clips what it holds: a button scrolled out of view cannot be pressed.
  const state = kit.scroll('list', 0, 0, 100, 40, () => { kit.hit(0, 10, 100, 10, { key: 'near' }); kit.hit(0, 100, 100, 10, { key: 'far' }); return 200; });
  assert.equal(state.max, 160, 'content 200 tall in an area 40 tall scrolls by 160');
  assert.equal(kit.at(50, 15).key, 'near');
  assert.ok(kit.at(50, 105) === null, 'outside the area is outside');
  kit.scrollState('list').y = 100;
  kit.begin(); kit.scroll('list', 0, 0, 100, 40, () => { kit.hit(0, 10, 100, 10, { key: 'near' }); kit.hit(0, 100, 100, 10, { key: 'far' }); return 200; });
  assert.equal(kit.at(50, 5).key, 'far', 'scrolled by 100, the far button is at y 0 to 10');
  assert.equal(kit.at(50, 15).key?.startsWith('scroll'), true, 'and the near one has scrolled out: only the area is left under the point');
});
