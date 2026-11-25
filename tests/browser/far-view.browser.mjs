// Seeing down the street (TODO-31): Greybridge looks six rows deep. Rows beyond the painted three are made from the painted
// art at load (engine/render/far-slots.js): every wall slot has an image, and no file is asked for beyond the painted rows.
// Start a static server at the repo root, then: node tests/browser/far-view.browser.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const errors = [], missing = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 800 } })).newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() === 404) missing.push(r.url()); });
  await page.goto(`${base}/games/ravensmoor/?level=market`);
  await page.waitForFunction(() => window.__game2d?.phase === 'playing', null, { timeout: 20000 });
  const report = await page.evaluate(() => {
    const { view, images } = __game2d, arts = new Set([...images.keys()].filter(k => k.startsWith('walls:')).map(k => k.split(':')[1]));
    const deep = view.wallSlots.filter(s => s.d > 3);
    return { maxDepth: view.V.maxDepth, deep: deep.length, arts: [...arts],
      gaps: [...arts].flatMap(art => view.wallSlots.filter(s => !images.has(`walls:${art}:${s.id}`)).map(s => `${art}:${s.id}`)),
      sizes: deep.slice(0, 3).map(s => { const img = images.get(`walls:${[...arts][0]}:${s.id}`); return [s.w, s.h, img.width, img.height]; }) };
  });
  assert.equal(report.maxDepth, 6);
  assert.ok(report.deep > 10, 'there are wall slots beyond the painted rows');
  assert.ok(report.arts.length >= 3, 'the market has several house designs');
  assert.deepEqual(report.gaps, [], 'every wall slot of every design has an image');
  for (const [w, h, iw, ih] of report.sizes) assert.deepEqual([iw, ih], [w, h], 'a made image is the size of its slot');
  assert.deepEqual(missing.filter(u => /-d[4-9]-/.test(u)), [], 'nothing is fetched for the rows beyond the paint');
  // The Undercrypt keeps its three rows.
  await page.goto(`${base}/games/ravensmoor/?level=dungeon`);
  await page.waitForFunction(() => window.__game2d?.phase === 'playing', null, { timeout: 20000 });
  assert.equal(await page.evaluate(() => __game2d.view.V.maxDepth), 3);
  assert.deepEqual(errors, []);
  console.log('far view: ok');
} finally { await browser.close(); }
