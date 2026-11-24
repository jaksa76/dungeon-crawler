#!/usr/bin/env node
// Turns a Codex-painted hero sprite (true pixel art enlarged to hard 12x12 blocks on flat magenta) into a real
// 48 x 96 PNG with transparency: `node tools/hero-sprite.mjs painted.png [out.png]`. Default output is
// engine/assets/ui/hero-sprite.png. Needs only pngjs. See docs/engine/inventory.md.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { PNG } = createRequire(import.meta.url)(path.join(path.dirname(fileURLToPath(import.meta.url)), 'node_modules/pngjs'));
const [input, output = path.join(path.dirname(fileURLToPath(import.meta.url)), '../engine/assets/ui/hero-sprite.png')] = process.argv.slice(2);
if (!input) { console.error('usage: hero-sprite.mjs painted.png [out.png]'); process.exit(1); }
const GW = 48, GH = 96;
const src = PNG.sync.read(fs.readFileSync(input)), { width: W, height: H, data } = src;
const isBg = i => data[i] > 200 && data[i + 1] < 70 && data[i + 2] > 200;
let x0 = W, y0 = H, x1 = -1, y1 = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!isBg((y * W + x) * 4)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
const bh = y1 - y0 + 1, block = bh / GH, nw = Math.round((x1 - x0 + 1) / block);
if (nw > GW) throw new Error(`figure is ${nw} pixels wide, more than ${GW}`);
const out = new PNG({ width: GW, height: GH }), ox = (GW - nw) >> 1;
for (let j = 0; j < GH; j++) for (let i = 0; i < nw; i++) {
  const bins = new Map(); let opaque = 0, total = 0;
  for (let y = Math.floor(y0 + (j + .25) * block); y < Math.ceil(y0 + (j + .75) * block); y++) {
    for (let x = Math.floor(x0 + (i + .25) * block); x < Math.ceil(x0 + (i + .75) * block); x++) {
      const p = (y * W + x) * 4; total++;
      if (isBg(p)) continue;
      opaque++; const key = `${data[p]},${data[p + 1]},${data[p + 2]}`; bins.set(key, (bins.get(key) ?? 0) + 1);
    }
  }
  if (opaque * 2 < total) continue;
  const [r, g, b] = [...bins].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
  out.data.set([r, g, b, 255], (j * GW + i + ox) * 4);
}
fs.writeFileSync(output, PNG.sync.write(out));
console.log(`painted pixel ${block.toFixed(2)} px; figure ${nw} x ${GH}, written to ${output} (${GW} x ${GH})`);
