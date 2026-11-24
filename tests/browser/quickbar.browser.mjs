// The quick bar in a real browser: keys, taps, drags from the satchel, on the desktop panel and on a phone.
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
const drag = async (page, from, to) => {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 30, { steps: 4 }); await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up(); await page.waitForTimeout(150);
};
const centre = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
const give = page => page.evaluate(() => { const s = __game2d.session; s.hero.hp = 10; s.inventory.add('rusty-sword', 1); s.learn('firebolt'); });
try {
  // Desktop: the panel draws eight slots; the starting potions and the first spell are on the bar.
  let page = await open({ width: 1100, height: 800 }, false);
  await give(page);
  assert.deepEqual(await bar(page), ['health-potion', 'mana-potion', 'firebolt', null, null, null, null, null]);
  await page.keyboard.press('Digit1');
  assert.ok(await page.evaluate(() => __game2d.session.hero.hp) > 10, 'key 1 drinks the health potion');
  const ui = await page.locator('#ui').boundingBox();
  const slot = i => ({ x: ui.x + (545 + (i + .5) * 75.6) / 1448 * ui.width, y: ui.y + 167 / 241 * ui.height });
  await page.keyboard.press('KeyI'); await page.waitForTimeout(250);
  const at = await page.evaluate(() => __game2d.session.inventory.slots.findIndex(s => s?.id === 'rusty-sword'));
  await drag(page, centre(await page.locator(`.rpg-grid .rpg-cell[data-slot="${at}"]`).boundingBox()), slot(5));
  assert.equal((await bar(page))[5], 'rusty-sword', 'dragged from the satchel onto a painted slot');
  await page.keyboard.press('Escape');
  await page.mouse.click(slot(5).x, slot(5).y);
  assert.equal(await page.evaluate(() => __game2d.session.equipment.worn.weapon), 'rusty-sword', 'a click wears the weapon');
  await drag(page, slot(5), slot(7));
  assert.equal((await bar(page))[7], 'rusty-sword', 'dragged to another slot');
  await drag(page, slot(7), { x: ui.x + 200, y: ui.y - 300 });
  assert.equal((await bar(page))[7], null, 'dragged off the bar');
  await page.close();

  // Phone: six buttons in the rail.
  page = await open({ width: 844, height: 390 }, true);
  await give(page);
  const button = i => page.locator(`.rpg-slots button[data-quick="${i}"]`);
  assert.equal(await page.locator('.rpg-slots button').count(), 6);
  for (const b of await page.locator('.rpg-slots button').all()) { const r = await b.boundingBox(); assert.ok(r.width >= 44 && r.height >= 44, 'at least 44 px to tap'); }
  await page.evaluate(() => { __game2d.session.hero.mp = 1; });
  const tap = centre(await button(1).boundingBox());
  await page.touchscreen.tap(tap.x, tap.y);
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => __game2d.session.hero.mp) > 1, 'a tap drinks the mana potion');
  await page.click('button[title="Inventory"]'); await page.waitForTimeout(250);
  const at2 = await page.evaluate(() => __game2d.session.inventory.slots.findIndex(s => s?.id === 'rusty-sword'));
  await drag(page, centre(await page.locator(`.rpg-grid .rpg-cell[data-slot="${at2}"]`).boundingBox()), centre(await button(4).boundingBox()));
  assert.equal((await bar(page))[4], 'rusty-sword', 'dragged from the satchel onto a button');
  await page.click('.rpg-panel footer button');
  await drag(page, centre(await button(4).boundingBox()), centre(await button(3).boundingBox()));
  assert.equal((await bar(page))[3], 'rusty-sword', 'moved to another slot');
  const held = centre(await button(3).boundingBox());
  await page.mouse.move(held.x, held.y); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
  assert.match(await page.locator('.rpg-notice').textContent(), /Rusty sword/, 'press and hold describes it');
  assert.equal((await bar(page))[3], 'rusty-sword', 'and does not use it');
  await page.close();
  assert.deepEqual(errors, []);
  console.log('quick bar: ok');
} finally { await browser.close(); }
