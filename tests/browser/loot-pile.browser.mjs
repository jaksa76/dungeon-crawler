// What lies on the floor is drawn (TODO-34): a creature's loot, or anything dropped, shows as a sack in the middle of its
// tile, and it is not something to attack. Start a static server at the repo root, then: node tests/browser/loot-pile.browser.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 800 } })).newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/games/ravensmoor/?level=dungeon`);
  await page.waitForFunction(() => window.__game2d?.phase === 'playing', null, { timeout: 20000 });
  // The scene's middle-bottom, where something on the tile ahead lies; sampled before and after.
  const sample = () => page.evaluate(() => {
    const v = __game2d.ui.spec.view, d = __game2d.ui.canvas.getContext('2d').getImageData(v.x + 130, v.y + 120, 60, 40).data;
    let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; return sum;
  });
  const before = await sample();
  // The hero faces south down the corridor from (1,1); drop a torch on the tile ahead, then look again.
  await page.evaluate(() => { __game2d.session.piles.set('dungeon:1,2', [{ id: 'torch', qty: 1 }]); });
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(400); await page.keyboard.press('KeyE'); await page.waitForTimeout(700);
  const after = await sample();
  assert.ok(after > before * 1.15, `the sack is drawn on the tile ahead (${before} -> ${after})`);
  const targets = await page.evaluate(() => __game2d.targets.map(t => t.id));
  assert.ok(!targets.some(id => String(id).startsWith('pile:')), 'a pile is not something to attack');
  // Stepping onto it and using it opens it.
  await page.keyboard.press('KeyW'); await page.waitForTimeout(500);
  await page.keyboard.press('Space'); await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => __game2d.ui.menus.kind), 'container', 'Use on the tile opens the pile');
  assert.deepEqual(errors, []);
  console.log('loot pile: ok');
} finally { await browser.close(); }
