// Recorded sound: the engine's samples load after the first key press, each level's track plays (opened on its own page),
// muting pauses it. Start a static server at the repo root, then: node tests/browser/sound.browser.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 800 } })).newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/games/ravensmoor/?level=village`);
  await page.waitForFunction(() => window.__game2d?.phase === 'playing', null, { timeout: 20000 });
  await page.keyboard.press('KeyQ'); // a gesture: the sound starts
  await page.waitForFunction(() => { const s = __game2d.sound.status(); return s.playing && Object.keys(s.samples).length >= 6; }, null, { timeout: 15000 });
  const status = await page.evaluate(() => __game2d.sound.status());
  assert.match(status.track, /old-quarter\.mp3$/);
  assert.deepEqual(Object.keys(status.samples).sort(), ['door', 'gold', 'hit', 'hurt', 'pickup', 'step']);
  assert.equal(status.samples.step, 5, 'every footstep loaded');
  await page.evaluate(() => __game2d.sound.setMuted(true));
  await page.waitForTimeout(1800);
  assert.equal((await page.evaluate(() => __game2d.sound.status())).playing, false, 'muting pauses the track');
  await page.evaluate(() => __game2d.sound.setMuted(false));
  await page.goto(`${base}/games/ravensmoor/?level=dungeon`);
  await page.waitForFunction(() => window.__game2d?.phase === 'playing', null, { timeout: 20000 });
  await page.keyboard.press('KeyQ');
  await page.waitForFunction(() => __game2d.sound.status().playing, null, { timeout: 15000 });
  assert.match((await page.evaluate(() => __game2d.sound.status())).track, /undercrypt\.mp3$/);
  assert.deepEqual(errors, []);
  console.log('sound: ok');
} finally { await browser.close(); }
