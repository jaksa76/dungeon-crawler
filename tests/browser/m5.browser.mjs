// Start a static server at the repo root, then: node tests/browser/m5.browser.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const errors = [];
async function fixture(mobile = false) {
  const page = await browser.newPage(mobile ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } : { viewport: { width: 1100, height: 850 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/games/ravensmoor/?level=dungeon`);
  await page.waitForFunction(() => window.__game2d?.targets);
  await page.evaluate(() => {
    const g = window.__game2d;
    g.monsters.actors.splice(2);
    for (const a of g.monsters.actors) Object.assign(a, { x: 1, z: 2, dir: 0, w: .4, h: .9, hp: 200, maxHp: 200,
      defence: 0, evasion: 0, damage: 0, accuracy: 0, speed: 0, attackMs: 100000 });
    g.hero.accuracy = 100; Math.random = () => .5;
  });
  await page.waitForFunction(() => __game2d.targets.filter(t => t.kind === 'actor').length === 2);
  return page;
}
async function point(page, index = 0) {
  // The target's rectangle is in the scene's 640 x 360; the scene sits in the canvas at spec.view (320 x 180 pixels there).
  return page.evaluate(i => { const { rect } = __game2d.targets.filter(t => t.kind === 'actor')[i], v = __game2d.ui.spec.view;
    return __game2d.ui.client(v.x + (rect.x + rect.w / 2) / 2, v.y + (rect.y + rect.h * .4) / 2); }, index);
}
const health = page => page.evaluate(() => __game2d.monsters.actors.map(a => a.hp));
try {
  const page = await fixture();
  const p = await point(page);
  await page.mouse.move(p.x, p.y);
  assert.equal(await page.locator('#game').evaluate(e => e.style.cursor), 'crosshair');
  await page.mouse.down(); await page.waitForTimeout(1550); await page.mouse.up();
  let hp = await health(page);
  assert.ok(hp[0] < 190, 'holding repeats attacks at cooldown');
  assert.equal(hp[1], 200, 'held target never switches to its neighbour');
  await page.waitForTimeout(750);
  const second = await point(page, 1);
  await page.mouse.click(second.x, second.y);
  assert.ok((await health(page))[1] < 200, 'second creature can be selected individually');
  assert.equal(await page.locator('#game').evaluate(e => e.title), 'Attack giant rat', 'mouse hover follows the pointer after attacking');
  await page.evaluate(() => __game2d.monsters.damage(__game2d.monsters.actors[0], 1000, performance.now()));
  await page.waitForTimeout(650);
  assert.equal(await page.evaluate(() => __game2d.monsters.actors[0].hp), 0, 'corpse remains after collapse');
  assert.equal(await page.evaluate(() => __game2d.targets.some(t => t.id === 'prowler')), false, 'corpse cannot be attacked');
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(() => __game2d.monsters.actors.length), 1, 'corpse is eventually removed');

  // ID masks honour alpha holes, draw order and wall occlusion. Exact prop
  // identity reaches the handler rather than falling back to the front object.
  assert.deepEqual(await page.evaluate(async () => {
    const { createSceneTargets } = await import('/engine/render/scene-targets.js');
    const { interactTarget } = await import('/engine/rules/interaction.js');
    const pick = createSceneTargets(20, 20), sprite = document.createElement('canvas'); sprite.width = sprite.height = 10;
    const g = sprite.getContext('2d'); g.fillRect(0, 0, 10, 10); g.clearRect(0, 0, 2, 2);
    const rect = { x: 0, y: 0, w: 20, h: 20 }, entity = { name: 'clicked chest' };
    pick.begin(20, 20); pick.stamp(sprite, null, rect, { id: 'back' });
    pick.stamp(sprite, null, { x: 8, y: 0, w: 10, h: 20 }, { id: 'front' });
    pick.block([[0, 10], [20, 10], [20, 20], [0, 20]]); pick.finish();
    let opened, said;
    interactTarget({ entity, prop: { behavior: { type: 'open' } } }, { openContainer: e => { opened = e.name; } });
    interactTarget({ entity, prop: {}, tooFar: true }, { say: s => { said = s; } });
    return [pick.at(0, 0), pick.at(5, 5)?.id, pick.at(12, 5)?.id, pick.at(5, 15), opened, said];
  }), [null, 'back', 'front', null, 'clicked chest', 'Step closer to use clicked chest.']);

  const village = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  village.on('pageerror', error => errors.push(error.message));
  await village.goto(`${base}/games/ravensmoor/?level=village`);
  await village.waitForFunction(() => window.__game2d?.targets);
  await village.evaluate(() => Object.assign(__game2d.p, { x: 3, z: 2, dir: 0 }));
  await village.keyboard.press('ArrowRight'); await village.waitForTimeout(350);
  await village.keyboard.press('ArrowLeft'); await village.waitForTimeout(350);
  const chest = await village.evaluate(() => __game2d.targets.find(t => t.entity?.prop === 'chest'));
  assert.equal(chest.tooFar, false);
  const click = await village.evaluate(rect => { const v = __game2d.ui.spec.view;
    return __game2d.ui.client(v.x + (rect.x + rect.w / 2) / 2, v.y + Math.min(350, rect.y + rect.h / 3) / 2); }, chest.rect);
  await village.mouse.click(click.x, click.y);
  await village.waitForTimeout(100);
  assert.equal(await village.evaluate(() => __game2d.ui.menus.kind), 'container', 'clicking the rendered chest opens its container');

  const mobile = await fixture(true), t = await point(mobile);
  await mobile.touchscreen.tap(t.x, t.y);
  hp = await health(mobile); assert.ok(hp[0] < 200); assert.equal(hp[1], 200);
  await mobile.waitForTimeout(800);
  const cdp = await mobile.context().newCDPSession(mobile);
  // A drag across a creature is a swipe, not an attack: swiping left turns right.
  const facing = await mobile.evaluate(() => __game2d.p.dir);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: t.x, y: t.y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: t.x - 90, y: t.y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForTimeout(350);
  assert.deepEqual(await health(mobile), hp, 'swiping across a creature does not attack');
  assert.equal(await mobile.evaluate(() => __game2d.p.dir), (facing + 1) % 4, 'left swipe still turns right');
  await mobile.keyboard.press('ArrowLeft'); await mobile.waitForTimeout(350);
  const hold = await point(mobile);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hold.x, y: hold.y }] });
  await mobile.waitForTimeout(1600);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok((await health(mobile))[0] < hp[0] - 8, 'touch hold repeats');
  // A save load ends a held attack even if a new actor reuses the same ID.
  await mobile.waitForTimeout(800);
  const beforeLoad = await point(mobile);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: beforeLoad.x, y: beforeLoad.y }] });
  await mobile.waitForTimeout(220);
  await mobile.evaluate(async () => {
    const g = __game2d, snapshot = g.persistence.snapshot();
    await g.loadState(snapshot);
    g.monsters.actors.splice(2);
    for (const a of g.monsters.actors) Object.assign(a, { x: 1, z: 2, dir: 0, w: .4, h: .9, hp: 200, maxHp: 200,
      defence: 0, evasion: 0, damage: 0, accuracy: 0, speed: 0, attackMs: 100000 });
  });
  await mobile.waitForTimeout(1000);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual(await health(mobile), [200, 200], 'loading a save cancels held attacks on reused actor IDs');
  assert.deepEqual(errors, []);
  console.log('M5 browser checks passed: individual targets, hold, corpses, occlusion, props, mobile taps, holds and swipes.');
} finally { await browser.close(); }
