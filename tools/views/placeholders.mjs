// Render the colour-coded 3D proxy of every view of a map: one image per walkable cell and facing.
//
//   node placeholders.mjs [map.mjs] [--out dir] [--blur 3] [--only x,z,N]
//
// Writes <out>/sharp/x<X>z<Z>-<N|E|S|W>.png, <out>/blur/<same name>.png (the blurred copy is what goes to the image
// generator) and <out>/contact.png, a contact sheet to review the whole map at a glance. The map is a module in the
// format of courtyard.mjs (tiles, wallInfo, props, entities).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { DIRS } from './dirs.mjs';
import { renderProxy } from './proxy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i < 0 ? dflt : args[i + 1]; };
const mapFile = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? path.join(here, 'courtyard.mjs');
const outDir = path.resolve(opt('out', path.join(here, '..', '..', 'game-3', 'assets', 'proxies')));
const blur = Number(opt('blur', 3));
const only = opt('only', null)?.split(',');

const map = await import(pathToFileURL(path.resolve(mapFile)).href);
fs.mkdirSync(path.join(outDir, 'sharp'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'blur'), { recursive: true });

const views = [];
map.tiles.forEach((row, z) => [...row].forEach((ch, x) => { if (ch === '.') for (let d = 0; d < 4; d++) views.push({ x, z, d }); }));

const thumbs = [], TW = 320, TH = 180;
for (const v of views) {
  if (only && !(v.x === +only[0] && v.z === +only[1] && DIRS[v.d] === only[2])) continue;
  const name = `x${v.x}z${v.z}-${DIRS[v.d]}`;
  const r = renderProxy(map, v.x, v.z, v.d, { blur });
  fs.writeFileSync(path.join(outDir, 'sharp', `${name}.png`), PNG.sync.write(r.sharp));
  fs.writeFileSync(path.join(outDir, 'blur', `${name}.png`), PNG.sync.write(r.blurred ?? r.sharp));
  thumbs.push({ name, img: r.sharp });
  console.log(name);
}

// contact sheet: 4 columns (N, E, S, W), one row per cell
const rows = Math.ceil(thumbs.length / 4), sheet = new PNG({ width: TW * 4, height: TH * rows });
thumbs.forEach(({ img }, k) => {
  const ox = (k % 4) * TW, oy = Math.floor(k / 4) * TH, sx = img.width / TW;
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    for (let c = 0; c < 4; c++) sheet.data[((oy + y) * sheet.width + ox + x) * 4 + c] = img.data[((Math.floor(y * sx)) * img.width + Math.floor(x * sx)) * 4 + c];
  }
});
fs.writeFileSync(path.join(outDir, 'contact.png'), PNG.sync.write(sheet));
console.log(`${thumbs.length} views -> ${outDir}`);
