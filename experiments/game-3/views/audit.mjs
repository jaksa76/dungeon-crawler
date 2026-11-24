// Is this map practical to paint? Renders every view and reports what is wrong before any image is paid for.
//
//   node audit.mjs [map.mjs] [--json out.json]
//
// Per view it measures how much of the frame each colour takes and flags:
//   FILLED  one prop covers a big part of the frame (the view is just that prop)
//   FACADE  one building front fills most of the frame (an edge cell facing the wall: a close-up, fine if it is a good facade)
// and it lists cells that cannot be reached and each cell's best / worst view.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { DIRS } from './dirs.mjs';
import { renderProxy } from './proxy.mjs';
import { COLOURS } from './colours.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const mapFile = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? path.join(here, 'courtyard.mjs');
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const map = await import(pathToFileURL(path.resolve(mapFile)).href);

const keys = Object.keys(COLOURS).filter((k) => k !== 'grid');
const propKeys = new Set(Object.keys(map.props ?? {}));
const nearest = (r, g, b) => {
  let best = null, bd = 30 * 30;
  for (const k of keys) { const c = COLOURS[k], d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (d < bd) { bd = d; best = k; } }
  return best;
};

const floor = (x, z) => map.tiles[z]?.[x] === '.';
const results = [];
for (let z = 0; z < map.tiles.length; z++) for (let x = 0; x < map.tiles[z].length; x++) {
  if (!floor(x, z)) continue;
  for (let d = 0; d < 4; d++) {
    const { sharp } = renderProxy(map, x, z, d);
    const counts = {}; let total = 0;
    for (let i = 0; i < sharp.width * sharp.height; i += 3) { // every third pixel is plenty
      const k = nearest(sharp.data[i * 4], sharp.data[i * 4 + 1], sharp.data[i * 4 + 2]);
      total++; if (k) counts[k] = (counts[k] ?? 0) + 1;
    }
    const share = Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, n / total]));
    const flags = [];
    const bigProp = Object.entries(share).filter(([k]) => propKeys.has(k)).sort((a, b) => b[1] - a[1])[0];
    if (bigProp && bigProp[1] > 0.3) flags.push(`FILLED by ${bigProp[0]} ${Math.round(bigProp[1] * 100)}%`);
    const walls = Object.entries(share).filter(([k]) => k.startsWith('wall-')).sort((a, b) => b[1] - a[1]);
    if (walls[0] && walls[0][1] > 0.6) flags.push(`FACADE ${walls[0][0]} ${Math.round(walls[0][1] * 100)}%`);
    const distinct = Object.values(share).filter((v) => v > 0.02).length;
    results.push({ view: `x${x}z${z}-${DIRS[d]}`, x, z, d, flags, distinct, share });
  }
}

// reachability from the start cell
const start = map.start ?? results[0];
const seen = new Set([`${start.x},${start.z}`]), todo = [[start.x, start.z]];
while (todo.length) { const [x, z] = todo.pop(); for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { const k = `${x + dx},${z + dz}`; if (floor(x + dx, z + dz) && !seen.has(k)) { seen.add(k); todo.push([x + dx, z + dz]); } } }
const cells = [...new Set(results.map((r) => `${r.x},${r.z}`))];

console.log(`${results.length} views in ${cells.length} cells; ${cells.filter((c) => !seen.has(c)).length} unreachable cells\n`);
console.log('view      flags                                  distinct colours');
for (const r of results) console.log(`${r.view.padEnd(9)} ${(r.flags.join('; ') || 'ok').padEnd(38)} ${r.distinct}`);
const bad = results.filter((r) => r.flags.length);
console.log(`\n${bad.length} of ${results.length} views flagged`);
for (const c of cells) {
  const v = results.filter((r) => `${r.x},${r.z}` === c);
  const ok = v.filter((r) => !r.flags.length).length;
  console.log(`cell (${c}): ${ok}/4 views ok`);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
