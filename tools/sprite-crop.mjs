#!/usr/bin/env node
// Cut a rectangle out of an existing sprite and reduce it to a pixel-art picture: each output pixel takes the most common
// opaque colour of the middle of its block (no smoothing, the sprite's own palette), and transparent parts are filled with a
// background colour. Used for portraits and shop pictures made from the game's own sprites, so they match what is in the
// scene (.claude/skills/pixel-art/pictures.md).
//
//   node tools/sprite-crop.mjs <sprite.png> <out.png> <x> <y> <w> <h> <outW> <outH> [background #rrggbb]
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [input, output, ...rest] = process.argv.slice(2);
const [x, y, w, h, outW, outH] = rest.slice(0, 6).map(Number), bg = rest[6] ?? '#1a1218';
if (!output || [x, y, w, h, outW, outH].some(n => !Number.isFinite(n))) {
  console.error('usage: sprite-crop.mjs <sprite.png> <out.png> <x> <y> <w> <h> <outW> <outH> [background #rrggbb]'); process.exit(1);
}
const src = PNG.sync.read(fs.readFileSync(input)), out = new PNG({ width: outW, height: outH });
const back = [1, 3, 5].map(i => parseInt(bg.slice(i, i + 2), 16));
for (let oy = 0; oy < outH; oy++) for (let ox = 0; ox < outW; ox++) {
  const x0 = x + (ox + .2) * w / outW, x1 = x + (ox + .8) * w / outW, y0 = y + (oy + .2) * h / outH, y1 = y + (oy + .8) * h / outH;
  const counts = new Map(); let opaque = 0, total = 0;
  for (let sy = Math.floor(y0); sy <= Math.ceil(y1) - 1; sy++) for (let sx = Math.floor(x0); sx <= Math.ceil(x1) - 1; sx++) {
    if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
    const i = (sy * src.width + sx) * 4; total++;
    if (src.data[i + 3] < 128) continue;
    opaque++; const key = src.data[i] << 16 | src.data[i + 1] << 8 | src.data[i + 2]; counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let colour = back;
  if (opaque * 2 >= total && counts.size) { let best = 0, n = -1; for (const [k, c] of counts) if (c > n) { best = k; n = c; } colour = [best >> 16 & 255, best >> 8 & 255, best & 255]; }
  out.data.set([...colour, 255], (oy * outW + ox) * 4);
}
fs.writeFileSync(output, PNG.sync.write(out));
console.log(`${output}: ${outW}x${outH} from ${w}x${h} at (${x},${y}) of ${input}`);
