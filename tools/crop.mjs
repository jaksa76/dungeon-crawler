#!/usr/bin/env node
// Crop a rectangle out of a PNG.  node crop.mjs <in.png> <out.png> <x> <y> <w> <h>
import fs from 'node:fs';
import { PNG } from 'pngjs';
const [input, output, ...r] = process.argv.slice(2);
const [x, y, w, h] = r.map(Number);
const src = PNG.sync.read(fs.readFileSync(input));
const out = new PNG({ width: w, height: h });
PNG.bitblt(src, out, x, y, w, h, 0, 0);
fs.writeFileSync(output, PNG.sync.write(out));
console.log(`${output}: ${w}x${h} from (${x},${y})`);
