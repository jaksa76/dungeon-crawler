// Swipes on the scene, on a phone held sideways. Start a static server at the repo root, then: node tests/browser/swipe.browser.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/games/ravensmoor/?level=village`);
  await page.waitForFunction(() => window.__game2d);
  await page.waitForTimeout(600);
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const pose = () => page.evaluate(() => ({ x: __game2d.p.x, z: __game2d.p.z, dir: __game2d.p.dir }));
  // Somewhere in the scene with nothing to tap: the middle, a little above the floor.
  const mid = await page.evaluate(() => { const v = __game2d.ui.spec.view; return __game2d.ui.client(v.x + v.w / 2, v.y + 40); });
  const swipe = async (dx, dy, steps = 6) => {
    await touch('touchStart', mid.x, mid.y);
    for (let i = 1; i <= steps; i++) { await touch('touchMove', mid.x + dx * i / steps, mid.y + dy * i / steps); await page.waitForTimeout(16); }
    await touch('touchEnd', mid.x + dx, mid.y + dy); await page.waitForTimeout(350);
  };
  const start = await pose();
  await swipe(0, 70);   // down: forward
  const forward = await pose();
  assert.ok(forward.x !== start.x || forward.z !== start.z, 'a swipe down steps forward');
  await swipe(0, -70);  // up: back
  assert.deepEqual(await pose(), start, 'a swipe up steps back');
  await swipe(-70, 0);
  assert.equal((await pose()).dir, (start.dir + 1) % 4, 'a swipe left turns right');
  await swipe(70, 0);
  assert.equal((await pose()).dir, start.dir, 'a swipe right turns left');
  await swipe(0, 15);   // too short to count
  assert.deepEqual(await pose(), start, 'a short drag settles back and does nothing');
  // With a menu open the swipe does nothing.
  await page.keyboard.press('KeyI'); await page.waitForTimeout(200);
  await swipe(0, 70);
  assert.deepEqual(await pose(), start, 'no swipe while a menu is open');
  assert.deepEqual(errors, []);
  console.log('swipe: ok');
} finally { await browser.close(); }
