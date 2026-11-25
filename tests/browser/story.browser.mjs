// Story moments (game.showStory): full-screen pages over the scene and the HUD on a desktop and a phone; Enter and a tap turn
// the page, Escape skips, the game waits underneath, and the Raven Seal ending is one. Start a static server at the repo
// root, then: node tests/browser/story.browser.mjs
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
    await page.evaluate(() => { window.__closed = 0; __game2d.game.showStory({ title: 'A dream', pages: [{ text: 'Ravens circle the bell tower.' }, { text: 'You wake.' }] }, () => window.__closed++); });
    await page.waitForTimeout(300);
    const story = () => page.evaluate(() => { const s = __game2d.ui.menus.story; return s && { page: s.page, pages: s.pages }; });
    assert.deepEqual(await story(), { page: 0, pages: 2 });
    const pose = await page.evaluate(() => [__game2d.p.x, __game2d.p.z, __game2d.p.dir]);
    await page.keyboard.press('KeyW'); await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => [__game2d.p.x, __game2d.p.z, __game2d.p.dir]), pose, `${name}: the game waits under a story`);
    const page2 = await page.evaluate(() => __game2d.ui.regions().find(r => r.key === 'story:page'));
    assert.deepEqual([page2.x, page2.y, page2.w, page2.h], [0, 0, ...(mobile ? [400, 180] : [320, 240])], `${name}: it covers the whole canvas`);
    if (mobile) { const c = await page.evaluate(() => __game2d.ui.client(200, 90)); await page.touchscreen.tap(c.x, c.y); }
    else await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    assert.deepEqual(await story(), { page: 1, pages: 2 }, `${name}: the page turns`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    assert.equal(await story(), null, `${name}: Escape skips the rest`);
    assert.equal(await page.evaluate(() => window.__closed), 1, `${name}: done runs once`);
    // Two stories asked for at once: the second waits its turn.
    await page.evaluate(() => { __game2d.game.showStory({ text: 'First.' }); __game2d.game.showStory({ text: 'Second.' }, () => window.__closed++); });
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    assert.ok(await story(), `${name}: the second story follows the first`);
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    assert.equal(await story(), null); assert.equal(await page.evaluate(() => window.__closed), 2);
    // The ending is a story page with its picture.
    await page.evaluate(async () => { const { ravenSealEnding } = await import('/games/ravensmoor/content/ending.js'); __game2d.game.showEnding(ravenSealEnding); });
    await page.waitForTimeout(800);
    assert.deepEqual(await story(), { page: 0, pages: 1 });
    if (process.env.SCREENSHOT_DIR) await page.locator('canvas').screenshot({ path: `${process.env.SCREENSHOT_DIR}/story-${name}.png` });
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    assert.equal(await story(), null, `${name}: the last page closes`);
    await page.keyboard.press('KeyW'); await page.waitForTimeout(400);
    assert.notDeepEqual(await page.evaluate(() => [__game2d.p.x, __game2d.p.z, __game2d.p.dir]), pose, `${name}: play resumes`);
    await page.context().close();
  }
  assert.deepEqual(errors, []);
  console.log('story: ok');
} finally { await browser.close(); }
