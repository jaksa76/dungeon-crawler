// The screens before the game, on the canvas: main menu, character creation, the saves list, on a desktop and a phone held sideways.
// Start a static server at the repo root, then: node tests/browser/title.browser.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const errors = [];
const open = async (viewport, mobile) => {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/games/ravensmoor/`);
  await page.waitForFunction(() => window.__stage);
  await page.waitForTimeout(500);
  return page;
};
const regions = page => page.evaluate(() => __stage.kit.regions());
const find = async (page, title) => (await regions(page)).find(r => r.title === title || r.title.startsWith(`${title}`));
// Press a region the way the device does: a click, or a tap.
const press = async (page, title, mobile) => {
  const r = await find(page, title); assert.ok(r, `there is a "${title}" to press`);
  const c = await page.evaluate(([x, y]) => { const b = __stage.canvas.getBoundingClientRect(); return { x: b.left + x * b.width / __stage.canvas.width, y: b.top + y * b.height / __stage.canvas.height }; }, [r.x + r.w / 2, r.y + r.h / 2]);
  if (mobile) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(250);
};
const heroName = page => page.evaluate(() => __game2d.hero.name);
try {
  for (const [name, viewport, mobile] of [['desktop', { width: 1100, height: 800 }, false], ['phone', { width: 844, height: 390 }, true]]) {
    let page = await open(viewport, mobile);
    assert.equal(await page.evaluate(() => __stage.screen.name), mobile ? 'mobile' : 'desktop');
    const continues = await find(page, 'Continue');
    assert.ok(continues.disabled, `${name}: no save yet, so Continue is greyed`);
    assert.ok((await find(page, 'Load game')).disabled);
    // Back out of creation and in again
    await press(page, 'New game', mobile);
    assert.ok(await find(page, 'Begin anyway'), `${name}: character creation, with points left`);
    await press(page, 'Back', mobile);
    assert.ok(await find(page, 'New game'), `${name}: Back returns to the main menu`);
    await press(page, 'New game', mobile);
    // Name the hero (the first key replaces the selected name), spend a point, begin
    await page.keyboard.type('Aldric');
    await press(page, 'Raise Strength', mobile);
    assert.ok((await find(page, 'Lower Strength')).disabled === false, `${name}: a point is on Strength`);
    await press(page, 'Begin anyway', mobile);
    await page.waitForFunction(() => window.__game2d, null, { timeout: 15000 });
    assert.equal(await heroName(page), 'Aldric', `${name}: the name typed`);
    assert.equal(await page.evaluate(() => __game2d.hero.attrs.strength), 7, `${name}: the point spent`);
    assert.equal(await page.evaluate(() => __game2d.ui.layout), mobile ? 'mobile' : 'desktop');
    await page.evaluate(() => __game2d.save());
    // Again: the page now has a save to continue, and to load
    await page.reload();
    await page.waitForFunction(() => window.__stage); await page.waitForTimeout(500);
    assert.equal((await find(page, 'Continue')).disabled, false, `${name}: Continue is on once there is a save`);
    await press(page, 'Load game', mobile);
    const row = (await regions(page)).find(r => r.key.startsWith('pick:'));
    assert.ok(row, `${name}: the saves list has the save`);
    await press(page, 'Delete Aldric', mobile);
    assert.ok(await find(page, 'Delete Aldric'), `${name}: delete asks twice (still there after one press)`);
    await press(page, 'Back', mobile);
    assert.ok(await find(page, 'Continue'), `${name}: Back from the saves list`);
    await page.keyboard.press('Enter'); // Continue is the chosen button now
    await page.waitForFunction(() => window.__game2d, null, { timeout: 15000 });
    assert.equal(await heroName(page), 'Aldric', `${name}: Continue and Enter resumes the save`);
    // Settings -> Main menu takes two presses, saves, and returns to the main menu with the save to continue.
    await page.evaluate(() => __game2d.ui.menus.menu.settings()); await page.waitForTimeout(400);
    await press(page, 'Main menu', mobile);
    assert.ok(await find(page, 'Save and leave?'), `${name}: leaving asks first`);
    await press(page, 'Save and leave?', mobile);
    await page.waitForFunction(() => window.__stage && !window.__game2d, null, { timeout: 15000 }); await page.waitForTimeout(500);
    assert.equal((await find(page, 'Continue')).disabled, false, `${name}: back at the main menu, with the save`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__game2d, null, { timeout: 15000 });
    assert.equal(await heroName(page), 'Aldric', `${name}: the save continues after leaving`);
    await page.context().close();
  }
  // A phone held upright is asked to rotate, on the menu too.
  const upright = await open({ width: 390, height: 844 }, true);
  assert.equal(await upright.evaluate(() => __stage.screen.name), 'rotate');
  assert.ok(await upright.getByText('Rotate your device').isVisible());
  assert.deepEqual(errors, []);
  console.log('title screens: ok');
} finally { await browser.close(); }
