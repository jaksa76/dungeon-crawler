#!/usr/bin/env node
// 2D art pipeline for game-2 (see docs/2d-compositing-plan.md).
//
//   node tools/studio2d.mjs bake [walls|props|floor|backdrop|props:<art> ...]  placeholder slot images -> game-2/assets/
//   node tools/studio2d.mjs guides                     guide + key images per sheet -> game-2/art/guides/
//   node tools/studio2d.mjs slice <sheet> <painted.png> [out dir]  cut a painted sheet -> game-2/assets/
//   node tools/studio2d.mjs plan                       list sheets and the slots each one provides
//   node tools/studio2d.mjs paint <sheet> [--model flux|sdxl] [--denoise N] [--seed N] [--prompt text|@file] [--guide file] [--out file] [--slice]
//                                                      repaint a guide with the local ComfyUI (tools/comfy/), -> game-2/art/painted/
//        sdxl can also be steered: [--controlnet STRENGTH] [--ipadapter WEIGHT] [--ref image]  (see tools/comfy/paint.mjs)
//        `paint floor` paints the ground as a new picture (the guide only fixes the horizon), not a repaint of its texture
//   add --px to any command to work on the pixel slice (docs/pixel-slice.md; resolution and canvas factor in game-2/quarter-px.js,
//   160x90 painted on 1280x720 by default): art under game-2/px/, one panel per sheet, sliced by reading one pixel per cell
//
// Runs the studio page (tools/studio2d/studio.html) in headless Chromium via Playwright.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

let [cmd, ...args] = process.argv.slice(2);
const PX = args.includes('--px');
args = args.filter((a) => a !== '--px');
if (cmd === 'paint') {
  const { paintSheet } = await import('./comfy/paint.mjs');
  const { sheet, file, slice } = await paintSheet(PX ? [...args, '--px'] : args, ROOT);
  if (!slice) { console.log(`next: node tools/studio2d.mjs slice ${sheet} ${path.relative(ROOT, file)}${PX ? ' --px' : ''}`); process.exit(0); }
  [cmd, args] = ['slice', [sheet, file]];
}
if (!['bake', 'guides', 'slice', 'plan'].includes(cmd)) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 13).join('\n'));
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/tools/studio2d/studio.html${PX ? '?px' : ''}`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => { if (m.text().startsWith('px:')) console.log(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.studio, null, { timeout: 60000 });

  let files = {}, outDir = path.join(ROOT, PX ? 'game-2/px/assets' : 'game-2/assets');
  if (cmd === 'bake') files = await page.evaluate((only) => window.studio.bake(only), args);
  if (cmd === 'guides') { files = await page.evaluate(() => window.studio.guides()); outDir = path.join(ROOT, PX ? 'game-2/px/art' : 'game-2/art'); }
  if (cmd === 'plan') {
    const plan = await page.evaluate(() => window.studio.plan());
    for (const s of plan.sheets) console.log(`${s.name}\n${s.scenes.map((sc) => `  ${sc.art}: ${sc.slots.join(' ')}`).join('\n')}`);
  }
  if (cmd === 'slice') {
    const [sheet, input, dir] = args;
    if (dir) outDir = path.resolve(dir);
    if (!sheet || !input) throw new Error('usage: slice <sheet name> <painted.png>');
    const data = 'data:image/png;base64,' + fs.readFileSync(input).toString('base64');
    files = await page.evaluate(([s, d]) => window.studio.slice(s, d), [sheet, data]);
  }
  for (const [rel, dataURL] of Object.entries(files)) {
    const out = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(dataURL.split(',')[1], 'base64'));
  }
  if (Object.keys(files).length) console.log(`wrote ${Object.keys(files).length} files under ${path.relative(ROOT, outDir)}/`);
} finally {
  await browser.close();
  server.close();
}
