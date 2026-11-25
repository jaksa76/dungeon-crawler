#!/usr/bin/env node
// Turn a Codex painting of pixel art (art pixels enlarged to blocks, possibly a fractional size, on a flat magenta
// surround) into the real low-resolution image: crop the non-magenta band, then give each output pixel the most common
// colour of the block it covers, so the palette stays the painting's and edges stay hard. Used for the world map
// (docs/engine/content.md, World travel).
//
//   node tools/pixelate.mjs <painted.png> <out.png> <width> <height>
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [input, output, width, height] = process.argv.slice(2);
if (!output || !(width > 0) || !(height > 0)) { console.error('usage: pixelate.mjs <painted.png> <out.png> <width> <height>'); process.exit(1); }
const src = PNG.sync.read(fs.readFileSync(input));
const at = (x, y) => { const i = (y * src.width + x) * 4; return [src.data[i], src.data[i + 1], src.data[i + 2]]; };
const magenta = ([r, g, b]) => r > 200 && b > 200 && g < 80; // generous: image tools blend a fringe at the band's edge
// The band: rows and columns that are not all magenta.
const rowIsMagenta = y => { for (let x = 0; x < src.width; x++) if (!magenta(at(x, y))) return false; return true; };
const colIsMagenta = x => { for (let y = 0; y < src.height; y++) if (!magenta(at(x, y))) return false; return true; };
let top = 0, bottom = src.height - 1, left = 0, right = src.width - 1;
while (top < bottom && rowIsMagenta(top)) top++;
while (bottom > top && rowIsMagenta(bottom)) bottom--;
while (left < right && colIsMagenta(left)) left++;
while (right > left && colIsMagenta(right)) right--;
const bw = right - left + 1, bh = bottom - top + 1;
const out = new PNG({ width: +width, height: +height });
let empty = 0;
for (let oy = 0; oy < height; oy++) for (let ox = 0; ox < width; ox++) {
  // The middle of the block, so a neighbour's edge does not win: sample its inner half.
  const x0 = left + (ox + .25) * bw / width, x1 = left + (ox + .75) * bw / width;
  const y0 = top + (oy + .25) * bh / height, y1 = top + (oy + .75) * bh / height;
  const counts = new Map();
  for (let y = Math.floor(y0); y <= Math.min(bottom, Math.ceil(y1)); y++) for (let x = Math.floor(x0); x <= Math.min(right, Math.ceil(x1)); x++) {
    const c = at(x, y); if (magenta(c)) continue;
    const key = c[0] << 16 | c[1] << 8 | c[2]; counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (!counts.size) { empty++; continue; } // left transparent
  let best = 0, n = -1; for (const [key, count] of counts) if (count > n) { best = key; n = count; }
  const i = (oy * width + ox) * 4;
  out.data.set([best >> 16 & 255, best >> 8 & 255, best & 255, 255], i);
}
fs.writeFileSync(output, PNG.sync.write(out));
console.log(`${output}: ${width}x${height} from the band ${bw}x${bh} at (${left},${top})`);
if (empty) console.warn(`warning: ${empty} pixels had only magenta under them and are transparent`);
