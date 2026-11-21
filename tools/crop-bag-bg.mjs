#!/usr/bin/env node
// Turns the image Codex painted for the satchel screen into engine2d/assets/inventory-bg.png: the horizontal
// 16:9 band (y 80 to 944 of the 1536x1024 original) scaled to 1280x720. See docs/inventory.md.
//   node tools/crop-bag-bg.mjs path/to/painted.png
// Needs Playwright and Chromium (CHROMIUM_PATH overrides the executable), like the other tools here.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) { console.error('usage: node tools/crop-bag-bg.mjs painted.png'); process.exit(1); }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage();
const png = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
  if (img.width !== 1536 || img.height !== 1024) throw new Error(`expected 1536x1024, got ${img.width}x${img.height}`);
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
  const g = canvas.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 80, 1536, 864, 0, 0, 1280, 720);
  return canvas.toDataURL('image/png').split(',')[1];
}, fs.readFileSync(input).toString('base64'));
const out = path.join(ROOT, 'engine2d/assets/inventory-bg.png');
fs.writeFileSync(out, Buffer.from(png, 'base64'));
await browser.close();
console.log(`wrote ${path.relative(ROOT, out)} (${fs.statSync(out).size} bytes)`);
