// Colour-coded layout of one view, for image models that take a layout picture (e.g. Codex / ChatGPT).
//   node layout.mjs 2,3,N <out.png>
// Every region of the view (sky, floor, each wall type, each prop) is one flat colour. Prints the legend.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { DIRS } from './courtyard.mjs';
import { buildScene, png } from './scene.mjs';

import { COLOURS } from './colours.mjs';
const name = (id) => id.startsWith('prop-') ? id.split('-')[1] : id;
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

const [x, z, d] = process.argv[2].split(',');
const scene = buildScene(+x, +z, DIRS.indexOf(d));
const out = new PNG({ width: 1280, height: 720 });
const order = [...scene.regions].sort((a, b) => (a.id.startsWith('prop-') ? 1 : 0) - (b.id.startsWith('prop-') ? 1 : 0));
for (const r of order) {
  const c = COLOURS[name(r.id)] ?? [128, 128, 128];
  for (let i = 0; i < 1280 * 720; i++) if (r.png.data[i * 4]) { out.data[i * 4] = c[0]; out.data[i * 4 + 1] = c[1]; out.data[i * 4 + 2] = c[2]; out.data[i * 4 + 3] = 255; }
}
fs.writeFileSync(process.argv[3], png(out));
for (const r of order) console.log(`${hex(COLOURS[name(r.id)] ?? [128, 128, 128])}  ${r.id}: ${r.text}`);
