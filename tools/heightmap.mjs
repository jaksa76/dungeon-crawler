#!/usr/bin/env node
// Derive a height map from a painted "stones in mortar" texture
// (cobblestones, stone walls, ...), aligned pixel-for-pixel with the source.
//
//   node heightmap.mjs <texture.png> [options]
//
// Writes <texture>-height.png next to the input (grayscale, white = high).
//
// Steps:
//   1. Classify every pixel as stone or gap. Gaps are dark relative to the
//      image (mortar, outlines) or greenish/yellowish (moss).
//   2. Clean the mask: drop small isolated specks so dithering doesn't punch holes.
//   3. Distance to the nearest gap (exact Euclidean, wrap-around for tileable
//      textures) gives a rounded bevel at every stone edge.
//   4. Each stone also gets a gentle crown relative to its own size.
//   5. A little high-pass detail from the painting adds surface grain.
//
// Options (all optional):
//   --bevel <px>      width of the rounded edge, in source pixels   (default: auto)
//   --crown <0..1>    how much each stone domes in the middle      (default 0.3)
//   --detail <0..1>   painted surface grain mixed in              (default 0.12)
//   --threshold <0..1> gap darkness cut-off, as a luminance quantile (default: Otsu)
//   --no-wrap         texture is not tileable
//   --debug           also write <texture>-mask.png

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

// ---------- args

const args = process.argv.slice(2);
if (!args.length || args[0].startsWith('--')) {
  console.error('usage: node heightmap.mjs <texture.png> [--bevel px] [--crown 0..1] [--detail 0..1] [--threshold 0..1] [--no-wrap] [--debug]');
  process.exit(1);
}
const input = args[0];
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? def : Number(args[i + 1]);
};
const flag = (name) => args.includes(`--${name}`);
const WRAP = !flag('no-wrap');
const CROWN = opt('crown', 0.3);
const DETAIL = opt('detail', 0.12);

const png = PNG.sync.read(fs.readFileSync(input));
const W = png.width, H = png.height, N = W * H;
const src = png.data;

// ---------- helpers

const idx = (x, y) => {
  if (WRAP) { x = ((x % W) + W) % W; y = ((y % H) + H) % H; }
  else { x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1, y)); }
  return y * W + x;
};

// Separable box blur (applied 3x ≈ gaussian).
function blur(a, r) {
  if (r < 1) return a;
  let cur = Float32Array.from(a), tmp = new Float32Array(N);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += cur[idx(k, y)];
      for (let x = 0; x < W; x++) {
        tmp[y * W + x] = s / (2 * r + 1);
        s += cur[idx(x + r + 1, y)] - cur[idx(x - r, y)];
      }
    }
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[idx(x, k)];
      for (let y = 0; y < H; y++) {
        cur[y * W + x] = s / (2 * r + 1);
        s += tmp[idx(x, y + r + 1)] - tmp[idx(x, y - r)];
      }
    }
  }
  return cur;
}

// 1D squared-distance transform (Felzenszwalb & Huttenlocher).
function edt1d(f, n) {
  const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  const inter = (q, p) => ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
  for (let q = 1; q < n; q++) {
    let s = inter(q, v[k]);
    while (s <= z[k]) { k--; s = inter(q, v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) ** 2 + f[v[k]];
  }
  return d;
}

// Euclidean distance from every stone pixel to the nearest gap pixel.
// For tileable textures each line is processed as three copies and the middle kept.
function distanceToGap(stone) {
  const BIG = 1e12, reps = WRAP ? 3 : 1;
  const g = new Float64Array(N);
  for (let x = 0; x < W; x++) {
    const f = new Float64Array(H * reps);
    for (let i = 0; i < H * reps; i++) f[i] = stone[(i % H) * W + x] ? BIG : 0;
    const d = edt1d(f, H * reps);
    for (let y = 0; y < H; y++) g[y * W + x] = d[y + (WRAP ? H : 0)];
  }
  const out = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const f = new Float64Array(W * reps);
    for (let i = 0; i < W * reps; i++) f[i] = g[y * W + (i % W)];
    const d = edt1d(f, W * reps);
    for (let x = 0; x < W; x++) out[y * W + x] = Math.sqrt(d[x + (WRAP ? W : 0)]);
  }
  return out;
}

// Wrap-aware 4-connected components of pixels where mask == value.
function components(mask, value) {
  const label = new Int32Array(N).fill(-1), sizes = [], stack = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    if (mask[i] !== value || label[i] >= 0) continue;
    const id = sizes.length; let size = 0, sp = 0;
    stack[sp++] = i; label[i] = id;
    while (sp) {
      const p = stack[--sp]; size++;
      const x = p % W, y = (p - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!WRAP && (nx < 0 || ny < 0 || nx >= W || ny >= H)) continue;
        const q = idx(nx, ny);
        if (mask[q] === value && label[q] < 0) { label[q] = id; stack[sp++] = q; }
      }
    }
    sizes.push(size);
  }
  return { label, sizes };
}

function otsu(values) {
  const bins = 256, hist = new Float64Array(bins);
  for (const v of values) hist[Math.min(bins - 1, Math.floor(v * bins))]++;
  let sum = 0; for (let i = 0; i < bins; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 0;
  for (let i = 0; i < bins; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = values.length - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return (t + 0.5) / bins;
}

function quantile(values, q) {
  const s = Float32Array.from(values).sort();
  return s[Math.floor(q * (s.length - 1))];
}

// ---------- 1. classify

const lum = new Float32Array(N), moss = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2];
  lum[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  moss[i] = g > b + 12 && g > r * 0.75 ? 1 : 0;
}

// Estimate the art's pixel size (upscaled pixel art) to scale all radii.
let runs = 0, changes = 0;
for (let y = 0; y < H; y += 7) for (let x = 1; x < W; x++) {
  runs++;
  const a = (y * W + x) * 4, b = a - 4;
  if (Math.abs(src[a] - src[b]) + Math.abs(src[a + 1] - src[b + 1]) + Math.abs(src[a + 2] - src[b + 2]) > 24) changes++;
}
const artPx = Math.max(1, Math.round(runs / Math.max(1, changes)));

const smooth = blur(lum, Math.max(1, Math.round(artPx * 0.4)));
const T = args.includes('--threshold') ? quantile(smooth, opt('threshold', 0.3)) : otsu(smooth);
let stone = new Uint8Array(N);
for (let i = 0; i < N; i++) stone[i] = smooth[i] > T && !moss[i] ? 1 : 0;

// ---------- 2. clean. The mortar is one connected network: keep its largest
// component as gaps; every other enclosed dark shape is a painted crack (or
// dithering) and becomes stone, remembered so it can be carved in shallowly.
// Small stone specks inside the mortar become gap.
const crack = new Uint8Array(N);
{
  const { label, sizes } = components(stone, 0);
  const main = sizes.indexOf(Math.max(...sizes));
  for (let i = 0; i < N; i++) if (label[i] >= 0 && label[i] !== main) { stone[i] = 1; crack[i] = 1; }
}
{
  const minArea = (artPx * 2.5) ** 2;
  const { label, sizes } = components(stone, 1);
  for (let i = 0; i < N; i++) if (label[i] >= 0 && sizes[label[i]] < minArea) stone[i] = 0;
}

// ---------- 3. bevel from distance to the gaps
const dist = distanceToGap(stone);
const stoneDists = [];
for (let i = 0; i < N; i++) if (stone[i]) stoneDists.push(dist[i]);
const BEVEL = opt('bevel', Math.max(2, quantile(stoneDists, 0.8)));

// ---------- 4. crown: normalise distance by each stone's own maximum
const { label } = components(stone, 1);
const maxD = [];
for (let i = 0; i < N; i++) if (label[i] >= 0) maxD[label[i]] = Math.max(maxD[label[i]] || 0, dist[i]);

// ---------- 5. combine
const detail = new Float32Array(N);
const low = blur(lum, Math.max(2, artPx * 2));
for (let i = 0; i < N; i++) detail[i] = lum[i] - low[i];

let height = new Float32Array(N);
for (let i = 0; i < N; i++) {
  if (!stone[i]) { height[i] = 0.04 * detail[i]; continue; }
  const t = Math.min(1, dist[i] / BEVEL);
  const bevel = Math.sin((t * Math.PI) / 2);           // rounded edge, flat-ish top
  const crown = Math.sqrt(dist[i] / Math.max(1, maxD[label[i]])); // gentle dome per stone
  height[i] = (1 - CROWN) * bevel + CROWN * crown + DETAIL * detail[i] * 4 - (crack[i] ? 0.15 : 0);
}
height = blur(height, Math.max(1, Math.round(artPx * 0.25)));
let lo = Infinity, hi = -Infinity;
for (const v of height) { lo = Math.min(lo, v); hi = Math.max(hi, v); }

// ---------- write
function writeGray(file, get) {
  const out = new PNG({ width: W, height: H });
  for (let i = 0; i < N; i++) {
    const v = Math.max(0, Math.min(255, Math.round(get(i) * 255)));
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
    out.data[i * 4 + 3] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(out));
}

const base = input.replace(/\.png$/i, '');
writeGray(`${base}-height.png`, (i) => (height[i] - lo) / (hi - lo));
if (flag('debug')) writeGray(`${base}-mask.png`, (i) => stone[i]);

console.log(`${path.basename(input)}: ${W}x${H}, art pixel ≈ ${artPx}px, gap threshold ${T.toFixed(3)}, `
  + `${maxD.length} stones, bevel ${BEVEL.toFixed(1)}px → ${path.basename(base)}-height.png`);
