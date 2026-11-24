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
    const move = async (key, command) => {
      if (isMobile) await page.locator(`[data-cmd="${command}"]`).tap();
      else await page.keyboard.press(key);
    };
    const forward = () => move('KeyW', 'forward');
    await forward();
    await forward();
    await move('KeyA', 'strafeLeft');
    await move('KeyQ', 'left');
    await forward();
    const map = page.getByRole('dialog', { name: 'World map' });
    await map.waitFor();
    assert.equal(await map.getByRole('button', { name: 'Old Quarter, current location' }).isDisabled(), true);
    assert.equal(await map.getByRole('button', { name: 'Greybridge' }).count(), 0);
    assert.equal(await map.getByRole('button', { name: 'Undercrypt' }).count(), 0);

    await map.getByRole('button', { name: 'Close' }).click();
    await move('KeyA', 'strafeLeft');
    if (isMobile) await page.locator('[data-act="interact"]').tap();
    else await page.keyboard.press('Space');
    await move('KeyD', 'strafeRight');
    await forward();
    await map.waitFor();
    await page.waitForFunction(() => document.querySelector('.rpg-world-map img')?.naturalWidth > 0);
    const marker = map.getByRole('button', { name: 'Greybridge' });
    const size = await marker.boundingBox();
    assert.ok(size.width >= 44 && size.height >= 44);
    if (process.env.SCREENSHOT_DIR) {
      await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, `world-map-${layout}.png`) });
    }
    if (isMobile) await marker.tap();
    else await marker.click();
    await page.waitForFunction(() => window.__game2d?.session.levelId === 'market' && window.__game2d.phase === 'playing');
    await map.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => __game2d.images.get('backdrop:N')?.naturalWidth > 0), true);
    if (process.env.SCREENSHOT_DIR && !isMobile) {
      await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, 'greybridge-desktop.png') });
    }
    await move('KeyQ', 'left');
    await move('KeyQ', 'left');
    await forward();
    const oldQuarter = map.getByRole('button', { name: 'Old Quarter' });
    if (isMobile) await oldQuarter.tap();
    else await oldQuarter.click();
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
