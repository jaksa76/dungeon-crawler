#!/usr/bin/env node
// Checks that the game's one canvas is shown at a whole number of device pixels per canvas pixel (so every pixel is the same size),
// in a range of desktop and phone windows, and that a phone held upright shows the rotate overlay. A fractional scale makes pixels uneven.
// See docs/engine/ui.md. Needs Playwright and Chromium (CHROMIUM_PATH overrides the executable), like the other tools here.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.woff': 'font/woff' };

const server = http.createServer((req, res) => {
  let file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (/[\\/]$/.test(file)) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }); res.end(data);
  });
}).listen(0);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });

// [name, CSS viewport, device pixel ratio, touch, expected layout]
const windows = [
  ['desktop 1100x800', { width: 1100, height: 800 }, 1, false, 'desktop'],
  ['desktop 1920x1080', { width: 1920, height: 1080 }, 1, false, 'desktop'],
  ['laptop 1366x700 at 1.25', { width: 1366, height: 700 }, 1.25, false, 'desktop'],
  ['Pixel 7a sideways', { width: 915, height: 412 }, 2.625, true, 'mobile'],
  ['iPhone 12 sideways', { width: 844, height: 390 }, 3, true, 'mobile'],
  ['iPhone SE sideways', { width: 667, height: 375 }, 2, true, 'mobile'],
  ['short phone sideways', { width: 740, height: 360 }, 2.5, true, 'mobile'],
  ['Pixel 7a upright', { width: 412, height: 915 }, 2.625, true, 'rotate'],
];
let failures = 0;
for (const [name, viewport, deviceScaleFactor, touch, expected] of windows) {
  const context = await browser.newContext({ viewport, deviceScaleFactor, isMobile: touch, hasTouch: touch });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/games/ravensmoor/?level=village`);
  await page.waitForFunction(() => window.__game2d);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => { const c = __game2d.ui.canvas, b = c.getBoundingClientRect(); return { layout: __game2d.ui.layout, w: c.width, h: c.height, cssW: b.width, cssH: b.height, dpr: devicePixelRatio, k: __game2d.ui.scale.k };
  });
  const perPixel = r.cssW * r.dpr / r.w, vertical = r.cssH * r.dpr / r.h;
  const whole = Math.abs(perPixel - Math.round(perPixel)) < 0.01 && Math.abs(vertical - Math.round(vertical)) < 0.01;
  const overlay = expected === 'rotate' ? await page.getByText('Rotate your device').isVisible() : true;
  const ok = r.layout === expected && whole && overlay;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${r.layout} ${r.w}x${r.h} at ${perPixel.toFixed(3)} x ${vertical.toFixed(3)} device pixels per pixel${expected === 'rotate' ? (overlay ? ', overlay shown' : ', NO overlay') : ''}`);
  await context.close();
}
await browser.close(); server.close();
if (failures) { console.error(`${failures} layout(s) with uneven pixels`); process.exit(1); }
console.log('every layout is a whole number of device pixels per pixel');
