#!/usr/bin/env node
// Checks that every art canvas in game two's HUD is shown at exactly the UI's pixel size (--rpg-px screen
// pixels per canvas pixel), in several phone and desktop layouts. A fractional scale makes pixels uneven.
// Needs Playwright and Chromium (CHROMIUM_PATH overrides the executable), like the other tools here.
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

const layouts = [
  ['desktop', { width: 1100, height: 800 }, false], ['landscape', { width: 844, height: 390 }, true],
  ['short landscape', { width: 740, height: 360 }, true], ['portrait', { width: 390, height: 844 }, true],
  ['short portrait', { width: 360, height: 640 }, true],
];
let failures = 0;
for (const [name, viewport, mobile] of layouts) {
  const context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile });
  const page = await context.newPage();
  await page.goto(`http://localhost:${server.address().port}/game-2/`);
  await page.waitForFunction(() => window.__game2d);
  await page.waitForTimeout(500);
  // Open the bag so its icons are on screen too.
  if (mobile) await page.click('button[title="Inventory"]');
  else {
    const ui = await page.locator('#ui').boundingBox();
    await page.mouse.click(ui.x + (545 + 3 * 99 + 50) / 1448 * ui.width, ui.y + 66 / 241 * ui.height);
  }
  await page.waitForTimeout(250);
  const { px, bad, count } = await page.evaluate(() => {
    const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rpg-px'));
    const canvases = [...document.querySelectorAll('canvas.rpg-portrait, canvas.rpg-map, .rpg-slots canvas, .rpg-menus canvas, .rpg-cell canvas, .rpg-hero, .rpg-dialog-body > canvas')]
      .filter(c => c.clientWidth);
    const bad = canvases.filter(c => c.clientWidth !== c.width * px || c.clientHeight !== c.height * px)
      .map(c => `${c.className || c.parentElement.parentElement.className} ${c.width}px shown at ${c.clientWidth}px`);
    return { px, bad, count: canvases.length };
  });
  console.log(`${bad.length ? 'FAIL' : 'ok  '} ${name}: ${count} canvases at ${px}x${bad.length ? ' — ' + bad.join('; ') : ''}`);
  failures += bad.length;
  await context.close();
}
await browser.close(); server.close();
process.exit(failures ? 1 : 0);
