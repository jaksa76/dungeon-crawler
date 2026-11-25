// Settings -> Big controls on a phone: the stick and the pill grow over the scene's edge, a press on that overflow moves the
// hero (it is not a press on the scene), and the setting is saved. Start a static server at the repo root, then:
// node tests/browser/big-controls.browser.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('bigControls', 'true'); } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/games/ravensmoor/?level=village`);
  await page.waitForFunction(() => window.__game2d?.phase === 'playing', null, { timeout: 20000 }); await page.waitForTimeout(500);
  const rects = await page.evaluate(() => __game2d.ui.rects());
  assert.ok(rects.move.cx + rects.move.r > 40, 'the stick reaches into the scene');
  const at = async (x, y) => page.evaluate(([x, y]) => __game2d.ui.client(x, y), [x, y]);
  const where = () => page.evaluate(() => [__game2d.p.x, __game2d.p.z, __game2d.p.dir]);
  const [x0, z0, dir] = await where();
  assert.equal(dir, 0, 'facing north at the start');
  const c = await at(rects.move.cx + rects.move.r - 1, rects.move.cy); // the right edge of the ring, over the scene
  await page.touchscreen.tap(c.x, c.y); await page.waitForTimeout(700);
  assert.deepEqual(await where(), [x0 + 1, z0, 0], 'a press on the overflow strafes right');
  const bare = await at(44, 124); // scene beside the ring, above it: not the stick's
  await page.touchscreen.tap(bare.x, bare.y); await page.waitForTimeout(700);
  assert.deepEqual(await where(), [x0 + 1, z0, 0], 'a press on the scene beside the ring does not move the hero');
  await page.evaluate(() => __game2d.ui.menus.menu.settings()); await page.waitForTimeout(400);
  const toggle = (await page.evaluate(() => __game2d.ui.regions())).find(r => r.title === 'Big controls: on');
  assert.ok(toggle, 'Settings shows Big controls on a phone');
  const t = await at(toggle.x + toggle.w / 2, toggle.y + toggle.h / 2);
  await page.touchscreen.tap(t.x, t.y); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => localStorage.getItem('bigControls')), 'false', 'the choice is saved');
  assert.ok((await page.evaluate(() => __game2d.ui.rects())).move.cx + (await page.evaluate(() => __game2d.ui.rects())).move.r <= 38, 'the small stick stays in its rail');
  // A desktop has no sticks and no such setting.
  const desk = await (await browser.newContext({ viewport: { width: 1100, height: 800 } })).newPage();
  await desk.goto(`${base}/games/ravensmoor/?level=village`);
  await desk.waitForFunction(() => window.__game2d?.phase === 'playing', null, { timeout: 20000 });
  await desk.evaluate(() => __game2d.ui.menus.menu.settings()); await desk.waitForTimeout(400);
  assert.ok(!(await desk.evaluate(() => __game2d.ui.regions())).some(r => r.title?.startsWith('Big controls')));
  assert.deepEqual(errors, []);
  console.log('big controls: ok');
} finally { await browser.close(); }
