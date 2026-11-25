// Start a static server at the root, then: node tests/browser/world-map.browser.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const issues = [];

async function testMap(viewport, layout) {
  const isMobile = layout !== 'desktop';
  const context = await browser.newContext({ viewport, isMobile, hasTouch: isMobile });
  try {
    const page = await context.newPage();
    page.on('pageerror', error => issues.push(error.message));
    await page.goto(`${base}/games/ravensmoor/?level=village`);
    await page.waitForFunction(() => window.__game2d?.phase === 'playing');
    if (layout === 'portrait') { // held upright a phone shows the rotate overlay, not the game
      assert.equal(await page.evaluate(() => __game2d.ui.layout), 'rotate');
      assert.ok(await page.getByText('Rotate your device').isVisible());
      return;
    }
    const key = async code => { await page.keyboard.press(code); await page.waitForTimeout(250); };
    const kind = () => page.evaluate(() => __game2d.ui.menus.kind);
    const marker = async title => (await page.evaluate(() => __game2d.ui.regions())).find(r => r.key.startsWith('map:') && r.title.startsWith(title));
    const tap = async region => { const c = await page.evaluate(([x, y]) => __game2d.ui.client(x, y), [region.x + region.w / 2, region.y + region.h / 2]); await page.mouse.click(c.x, c.y); };
    await key('KeyW'); await key('KeyW'); await key('KeyA'); await key('KeyQ'); await key('KeyW');
    await page.waitForFunction(() => __game2d.ui.menus.kind === 'world-map');
    await page.waitForTimeout(400);
    assert.match((await marker('Old Quarter')).title, /you are here/);
    assert.equal((await marker('Old Quarter')).disabled, true);
    assert.equal(await marker('Greybridge'), undefined);
    assert.equal(await marker('Undercrypt'), undefined);

    await key('Escape');
    assert.equal(await kind(), null);
    await key('KeyA'); await key('Space'); await key('KeyD'); await key('KeyW');
    await page.waitForFunction(() => __game2d.ui.menus.kind === 'world-map');
    await page.waitForTimeout(400);
    const greybridge = await marker('Greybridge');
    assert.ok(greybridge.w >= 16 && greybridge.h >= 12, 'a marker is big enough to tap');
    if (process.env.SCREENSHOT_DIR) await page.locator('canvas').screenshot({ path: join(process.env.SCREENSHOT_DIR, `world-map-${layout}.png`) });
    await tap(greybridge);
    await page.waitForFunction(() => window.__game2d?.session.levelId === 'market' && window.__game2d.phase === 'playing');
    assert.equal(await kind(), null, 'the map closes on arrival');
    assert.equal(await page.evaluate(() => __game2d.images.get('backdrop:N')?.naturalWidth > 0), true);
    if (process.env.SCREENSHOT_DIR && !isMobile) await page.locator('canvas').screenshot({ path: join(process.env.SCREENSHOT_DIR, 'greybridge-desktop.png') });
    await key('KeyQ'); await key('KeyQ'); await key('KeyW');
    await page.waitForFunction(() => __game2d.ui.menus.kind === 'world-map');
    await page.waitForTimeout(400);
    await tap(await marker('Old Quarter'));
    await page.waitForFunction(() => window.__game2d?.session.levelId === 'village' && window.__game2d.phase === 'playing');
  } finally { await context.close(); }
}

try {
  await testMap({ width: 1100, height: 800 }, 'desktop');
  await testMap({ width: 390, height: 844 }, 'portrait');
  await testMap({ width: 844, height: 390 }, 'landscape');
  assert.deepEqual(issues, []);
  console.log('world map travel on desktop and phone: ok');
} finally { await browser.close(); }
