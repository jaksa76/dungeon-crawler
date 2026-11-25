// Dialogue with portraits (TODO-33): talking to the guard shows his portrait top left with the text beside it, on a desktop
// and a phone, and the choices still work. Start a static server at the repo root, then: node tests/browser/dialogue.browser.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const errors = [];
try {
  for (const [name, viewport, mobile] of [['desktop', { width: 1100, height: 800 }, false], ['phone', { width: 844, height: 390 }, true]]) {
    const page = await (await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile })).newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/games/ravensmoor/?level=village`);
    await page.waitForFunction(() => window.__game2d?.phase === 'playing', null, { timeout: 20000 });
    await page.evaluate(() => { const s = __game2d.session; Object.assign(s.player, { x: 1, z: 1, dir: 0 }); s.interact(); });
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => __game2d.ui.menus.kind), 'dialogue');
    const view = await page.evaluate(() => __game2d.ui.spec.view);
    const colours = await page.evaluate(({ x, y }) => {
      const d = __game2d.ui.canvas.getContext('2d').getImageData(x + 6, y + 21, 64, 64).data, seen = new Set();
      for (let i = 0; i < d.length; i += 4) seen.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]);
      return seen.size;
    }, view);
    assert.ok(colours > 12, `${name}: the guard's portrait is drawn (${colours} colours)`);
    const choice = (await page.evaluate(() => __game2d.ui.regions())).find(r => r.key === 'choice:0');
    const c = await page.evaluate(([x, y]) => __game2d.ui.client(x, y), [choice.x + choice.w / 2, choice.y + choice.h / 2]);
    if (mobile) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => __game2d.flags.get('ravensmoor:heard-guard')), true, `${name}: the choice works`);
    await page.context().close();
  }
  assert.deepEqual(errors, []);
  console.log('dialogue: ok');
} finally { await browser.close(); }
