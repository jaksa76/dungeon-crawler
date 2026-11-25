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

  const centreOf = r => page.evaluate(([x, y]) => __game2d.ui.client(x, y), [r.x + r.w / 2, r.y + r.h / 2]);
  const regionWith = async title => (await page.evaluate(() => __game2d.ui.regions())).find(r => r.title.startsWith(title));
  const settings = (await page.evaluate(() => __game2d.ui.rects())).buttons[5]; // the sixth menu button
  let c = await centreOf(settings); await page.mouse.click(c.x, c.y); await page.waitForTimeout(250);
  const sound = await regionWith('Sound');
  assert.equal(sound.title, 'Sound: on');
  c = await centreOf(sound); await page.mouse.click(c.x, c.y); await page.waitForTimeout(250);
  assert.equal((await regionWith('Sound')).title, 'Sound: off');
  assert.equal(await page.evaluate(() => localStorage.getItem('ravensmoor.muted')), 'true');
  assert.deepEqual(errors, []);
  console.log('undercrypt secret passage and sound: ok');
} finally {
  await browser.close();
}
