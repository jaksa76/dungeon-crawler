// A shop with a picture of its keeper (TODO-32): the smithy shows its interior on the left and its wares beside it, on a
// desktop and a phone, and buying still works. Start a static server at the repo root, then: node tests/browser/shop.browser.mjs
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
    await page.goto(`${base}/games/ravensmoor/?level=market`);
    await page.waitForFunction(() => window.__game2d?.phase === 'playing', null, { timeout: 20000 });
    await page.evaluate(() => { const s = __game2d.session; Object.assign(s.player, { x: 3, z: 1, dir: 0 }); s.api.gainGold(80); s.interact(); });
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => __game2d.ui.menus.kind), 'shop');
    const view = await page.evaluate(() => __game2d.ui.spec.view);
    const rows = (await page.evaluate(() => __game2d.ui.regions())).filter(r => r.key.startsWith('shop:'));
    assert.ok(rows.length >= 4, `${name}: the wares are listed`);
    assert.ok(rows.every(r => r.x >= view.x + 125), `${name}: beside the picture, not over it`);
    // The picture is drawn: the panel's left part is not the flat panel colour.
    const colours = await page.evaluate(({ x, y }) => {
      const g = __game2d.ui.canvas.getContext('2d'), d = g.getImageData(x + 10, y + 30, 100, 120).data, seen = new Set();
      for (let i = 0; i < d.length; i += 4) seen.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]);
      return seen.size;
    }, view);
    assert.ok(colours > 12, `${name}: the keeper's picture is drawn (${colours} colours)`);
    const iron = rows.find(r => r.key === 'shop:iron-sword');
    const c = await page.evaluate(([x, y]) => __game2d.ui.client(x, y), [iron.x + iron.w / 2, iron.y + iron.h / 2]);
    if (mobile) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => __game2d.inventory.count('iron-sword')), 1, `${name}: buying works`);
    await page.context().close();
  }
  assert.deepEqual(errors, []);
  console.log('shop: ok');
} finally { await browser.close(); }
