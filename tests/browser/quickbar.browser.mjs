// The quick bar in a real browser: keys, taps, drags from the satchel, on the desktop bar and on a phone held sideways.
// Start a static server at the repo root, then: node tests/browser/quickbar.browser.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const errors = [];
const open = async (viewport, mobile) => {
  const page = await (await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile })).newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/games/ravensmoor/?level=village`);
  await page.waitForFunction(() => window.__game2d);
  await page.waitForTimeout(500);
  return page;
};
const bar = page => page.evaluate(() => __game2d.session.quickView().map(v => v && v.id));
// Canvas pixels -> page pixels, and the HUD's rectangles.
const at = (page, [x, y]) => page.evaluate(([x, y]) => __game2d.ui.client(x, y), [x, y]);
const rects = page => page.evaluate(() => __game2d.ui.rects());
const mid = r => [r.x + r.w / 2, r.y + r.h / 2];
const drag = async (page, from, to) => {
  const a = await at(page, from), b = await at(page, to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(a.x + 8, a.y + 8, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up(); await page.waitForTimeout(150);
};
const click = async (page, point) => { const c = await at(page, point); await page.mouse.click(c.x, c.y); await page.waitForTimeout(120); };
const give = page => page.evaluate(() => { const s = __game2d.session; s.hero.hp = 10; s.inventory.add('rusty-sword', 1); s.learn('firebolt'); });
// A pack slot in the satchel, in canvas pixels (the panel sits at the scene's corner).
const packCell = (page, i) => page.evaluate(i => { const v = __game2d.ui.spec.view; return [v.x + 91 + (i % 8) * 20 + 9.5, v.y + 23 + Math.floor(i / 8) * 20 + 9.5]; }, i);
try {
  for (const [name, viewport, mobile] of [['desktop bar', { width: 1100, height: 800 }, false], ['phone rails', { width: 844, height: 390 }, true]]) {
    const page = await open(viewport, mobile);
    await give(page);
    const R = await rects(page);
    assert.equal(R.slots.length, 8, `${name}: eight slots`);
    assert.deepEqual(await bar(page), ['health-potion', 'mana-potion', 'firebolt', null, null, null, null, null]);
    await click(page, mid(R.slots[0]));
    assert.ok(await page.evaluate(() => __game2d.session.hero.hp) > 10, `${name}: a tap drinks the health potion`);
    await page.keyboard.press('Digit1'); // keys work on both
    await click(page, mid(R.buttons[3])); // the bag
    assert.equal(await page.evaluate(() => __game2d.ui.menus.kind), 'inventory', `${name}: the bag button opens the satchel`);
    const slot = await page.evaluate(() => __game2d.session.inventory.slots.findIndex(s => s?.id === 'rusty-sword'));
    await drag(page, await packCell(page, slot), mid(R.slots[5]));
    assert.equal((await bar(page))[5], 'rusty-sword', `${name}: dragged from the satchel onto a slot`);
    await page.keyboard.press('Escape');
    await click(page, mid(R.slots[5]));
    assert.equal(await page.evaluate(() => __game2d.session.equipment.worn.weapon), 'rusty-sword', `${name}: a tap wears the weapon`);
    await drag(page, mid(R.slots[5]), mid(R.slots[7]));
    assert.equal((await bar(page))[7], 'rusty-sword', `${name}: dragged to another slot`);
    await drag(page, mid(R.slots[7]), [160, 60]);
    assert.equal((await bar(page))[7], null, `${name}: dragged off the bar`);
    const held = await at(page, mid(R.slots[2]));
    await page.mouse.move(held.x, held.y); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
    assert.ok((await page.evaluate(() => __game2d.session.messages.at(-1))).startsWith('Fire bolt'), `${name}: press and hold describes it`);
    await page.context().close();
  }
  assert.deepEqual(errors, []);
  console.log('quick bar: ok');
} finally { await browser.close(); }
