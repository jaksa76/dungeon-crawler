// Settings -> Swipe to move on a phone: the rails show a strafe button each instead of the stick and the pill; a press
// strafes, a hold repeats, swipes still step, and the setting is saved. Start a static server at the repo root,
// then: node tests/browser/swipe-controls.browser.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('swipeControls', 'true'); } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/games/ravensmoor/?level=village`);
  await page.waitForFunction(() => window.__game2d?.phase === 'playing', null, { timeout: 20000 }); await page.waitForTimeout(500);
  const rects = await page.evaluate(() => __game2d.ui.rects());
  assert.ok(rects.strafeLeft && rects.strafeRight && !rects.move, 'strafe buttons instead of the stick and the pill');
  if (process.env.SCREENSHOT_DIR) await page.locator('canvas').screenshot({ path: `${process.env.SCREENSHOT_DIR}/swipe-controls.png` });
  const at = (x, y) => page.evaluate(([x, y]) => __game2d.ui.client(x, y), [x, y]);
  const pose = () => page.evaluate(() => [__game2d.p.x, __game2d.p.z, __game2d.p.dir]);
  const centre = r => at(r.x + r.w / 2, r.y + r.h / 2);
  const [x0, z0] = await pose();
  const right = await centre(rects.strafeRight);
  await page.touchscreen.tap(right.x, right.y); await page.waitForTimeout(600);
  assert.deepEqual(await pose(), [x0 + 1, z0, 0], 'the right button strafes right');
  const left = await centre(rects.strafeLeft);
  await page.touchscreen.tap(left.x, left.y); await page.waitForTimeout(600);
  assert.deepEqual(await pose(), [x0, z0, 0], 'the left button strafes left');
  // Held, it repeats: right, then right again, then back left twice the same way.
  await page.touchscreen.tap(right.x, right.y); await page.waitForTimeout(600);
  const cdp0 = await context.newCDPSession(page);
  await cdp0.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: left.x, y: left.y, id: 2 }] });
  await page.waitForTimeout(1300);
  await cdp0.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(600);
  const held = await pose();
  assert.ok(held[0] <= x0 - 1, `holding the left button keeps strafing (at x ${held[0]}, from ${x0 + 1})`);
  const back = held[0];
  for (let x = back; x < x0; x++) { await page.touchscreen.tap(right.x, right.y); await page.waitForTimeout(600); }
  assert.deepEqual(await pose(), [x0, z0, 0], 'back where it started');
  // A swipe down still steps forward.
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const mid = await page.evaluate(() => { const v = __game2d.ui.spec.view; return __game2d.ui.client(v.x + v.w / 2, v.y + 40); });
  await touch('touchStart', mid.x, mid.y);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', mid.x, mid.y + 70 * i / 6); await page.waitForTimeout(16); }
  await touch('touchEnd', mid.x, mid.y + 70); await page.waitForTimeout(500);
  const [x1, z1] = await pose();
  assert.ok(x1 !== x0 || z1 !== z0, 'a swipe down steps forward');
  // Settings: Swipe to move is on, Big controls is hidden; turning it off brings the stick back and is saved.
  await page.evaluate(() => __game2d.ui.menus.menu.settings()); await page.waitForTimeout(400);
  const regions = await page.evaluate(() => __game2d.ui.regions());
  assert.ok(!regions.some(r => r.title?.startsWith('Big controls')), 'Big controls is hidden while swiping');
  const toggle = regions.find(r => r.title === 'Swipe to move: on');
  assert.ok(toggle);
  const t = await centre(toggle);
  await page.touchscreen.tap(t.x, t.y); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => localStorage.getItem('swipeControls')), 'false');
  assert.ok((await page.evaluate(() => __game2d.ui.rects())).move, 'the stick is back');
  assert.deepEqual(errors, []);
  console.log('swipe controls: ok');
} finally { await browser.close(); }
