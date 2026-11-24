import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const NativeAudio = window.AudioContext;
    window.audioProbe = { notes: 0 };
    window.AudioContext = class extends NativeAudio {
      createOscillator() { window.audioProbe.notes++; return super.createOscillator(); }
    };
  });
  await page.goto(`${base}/games/ravensmoor/?level=dungeon`);
  await Promise.race([
    page.waitForFunction(() => window.__game2d),
    page.waitForEvent('pageerror').then(error => { throw error; }),
  ]).catch(error => { throw new Error(`${error.message}\n${errors.join('\n')}`, { cause: error }); });
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.audioProbe.notes > 0);

  // Get to the wall without having unrelated roaming creatures block the route under test.
  await page.evaluate(() => {
    const { session, p } = window.__game2d;
    for (const actor of session.monsters.actors.slice()) session.api.remove(actor);
    Object.assign(p, { x: 3, z: 15, dir: 2 });
  });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => __game2d.game.find('dungeon', 'secret-passage').isOpen());
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => __game2d.p.z === 16);
  if (process.env.SCREENSHOT_DIR) {
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, 'undercrypt-secret-passage.png') });
  }

  const hud = await page.locator('#ui').boundingBox();
  await page.mouse.click(hud.x + hud.width * 1090 / 1448, hud.y + hud.height * 66 / 241);
  const sound = page.getByRole('button', { name: 'Sound', exact: true });
  assert.equal(await sound.getAttribute('aria-pressed'), 'true');
  await sound.click();
  assert.equal(await sound.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.evaluate(() => localStorage.getItem('ravensmoor.muted')), 'true');
  assert.deepEqual(errors, []);
  console.log('undercrypt secret passage and sound: ok');
} finally {
  await browser.close();
}
