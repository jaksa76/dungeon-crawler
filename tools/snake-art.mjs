#!/usr/bin/env node
// node tools/snake-art.mjs guide | slice
// The guide fixes four directions and four distance cards. Slice preserves each
// card's transparent padding, so fading tails don't change the creature's size.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
if (!['guide', 'slice'].includes(mode)) throw new Error('Usage: node tools/snake-art.mjs guide | slice');
const directions = ['front', 'back', 'left', 'right'];
const sizes = [[104, 224], [72, 156], [48, 104], [28, 60]];
const frames = sizes.flatMap(([w, h], depth) => directions.map((direction, column) => ({
  direction, depth, x: column * 256 + 128 - w / 2, y: depth * 256 + 240 - h, w, h,
})));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const input = mode === 'slice' ? 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'game-2/art/painted/monsters-snake.png')).toString('base64') : null;
  const result = await page.evaluate(async ({ mode, frames, input }) => {
    const make = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
    if (mode === 'guide') {
      const c = make(1024, 1024), g = c.getContext('2d');
      for (const r of frames) {
        g.fillStyle = '#545b6440'; g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = '#82909d'; g.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1);
        g.fillStyle = '#788590'; g.font = '12px monospace'; g.textAlign = 'center';
        g.fillText(`${r.direction} d${r.depth}`, r.x + r.w / 2, r.y + r.h + 13);
      }
      return { files: { 'game-2/art/guides/snake-atlas.png': c.toDataURL() }, width: 1024, height: 1024, frames };
    }
    const image = await new Promise((resolve, reject) => {
      const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = input;
    });
    const atlas = make(image.width, image.height), ag = atlas.getContext('2d'); ag.drawImage(image, 0, 0);
    const data = ag.getImageData(0, 0, image.width, image.height).data;
    const output = {}, sourceFrames = [];
    // Generation can shift the rows. Find the four separated silhouettes in
    // each column instead of clipping tails to the guide's nominal rectangles.
    for (let column = 0; column < 4; column++) {
      const x0 = Math.floor(column * image.width / 4), x1 = Math.floor((column + 1) * image.width / 4);
      const bands = [];
      for (let y = 0; y < image.height; y++) {
        let ink = false;
        for (let x = x0; x < x1; x++) if (data[(y * image.width + x) * 4 + 3] > 16) { ink = true; break; }
        if (!ink) continue;
        const previous = bands.at(-1);
        if (previous && y - previous.bottom <= 12) previous.bottom = y;
        else bands.push({ top: y, bottom: y });
      }
      if (bands.length !== 4) throw new Error(`Expected four sprites in column ${column}, found ${bands.length}.`);
      for (const [depth, band] of bands.entries()) {
        const r = frames.find(frame => frame.depth === depth && frame.direction === ['front', 'back', 'left', 'right'][column]);
        let left = x1, right = x0;
        for (let y = band.top; y <= band.bottom; y++) for (let x = x0; x < x1; x++) {
          if (data[(y * image.width + x) * 4 + 3] > 16) { left = Math.min(left, x); right = Math.max(right, x); }
        }
        const source = { x: left, y: band.top, w: right - left + 1, h: band.bottom - band.top + 1 };
        const c = make(r.w, r.h), g = c.getContext('2d'); g.imageSmoothingEnabled = false;
        const scale = Math.min((r.w - 4) / source.w, (r.h - 4) / source.h);
        const w = Math.round(source.w * scale), h = Math.round(source.h * scale);
        g.drawImage(image, source.x, source.y, source.w, source.h, Math.floor((r.w - w) / 2), r.h - h - 2, w, h);
        output[`game-2/dungeon/assets/monsters/snake/${r.direction}-d${r.depth}.png`] = c.toDataURL();
        sourceFrames.push({ ...r, source });
      }
    }
    return { files: output, width: image.width, height: image.height, frames: sourceFrames };
  }, { mode, frames, input });
  for (const [relative, data] of Object.entries(result.files)) {
    const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  }
  fs.writeFileSync(path.join(root, 'game-2/art/snake-atlas.json'), JSON.stringify({ width: result.width, height: result.height, guideWidth: 1024, guideHeight: 1024, columns: directions, rows: 'd0 (contact), d1 (near), d2 (far), d3 (dark)', frames: result.frames }, null, 2) + '\n');
  console.log(`Wrote ${Object.keys(result.files).length} ${mode === 'guide' ? 'guide' : 'sprite'} PNGs.`);
} finally { await browser.close(); }
