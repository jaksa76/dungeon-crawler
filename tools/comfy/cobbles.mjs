// A structure guide for `paint floor --cobbles`: the ground plane covered with many small irregular cobbles in
// one-point perspective. Flux repaints it at a moderate denoise (0.66-0.72), so the stone count and size survive
// while the surface becomes hand-painted. (At 0.8+ Flux merges the cells into a few big flagstones; a guide made of
// straight courses comes back as flat bricks.) The cobbles are the cells of a staggered, jittered lattice in a warped
// plane, so their world size grows slowly with distance and they never collapse into slivers; no courses, no straight joints.
// Same sheet layout as the floor guide: #202020 bars, the view band in the middle, magenta above the ground.
import { DEFAULT_VIEW } from '../../engine2d/view.js';
import { encodePng } from './ramp.mjs';

// One calm warm-mauve family with small variation: the stones differ in shape, not hue (a guide with orange and tan
// stones came back from Flux as orange and grey halves).
const PALETTE = [[140, 104, 116], [132, 98, 112], [146, 110, 116], [126, 96, 110], [142, 106, 112]];
const GROUT = [58, 36, 50];

function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// opts: seed, scale (multiplies the stone size: 0.8 = a quarter more stones), w0 (stone width at the bottom of the
// view, in eye heights), d0 (stone depth), grow (how fast stones grow with distance), edge (grout width in lattice
// units), jit (seed jitter). Returns an RGB PNG.
export function cobbleGuide(size, opts = {}) {
  const { seed = 3, scale = 1, grow = 0.6, edge = 0.09, jit = 0.42 } = opts;
  const w0 = (opts.w0 ?? 0.32) * scale, d0 = (opts.d0 ?? 0.25) * scale;
  const { w: W, h: Hs } = size, V = DEFAULT_VIEW;
  const k = W / V.W, top = (Hs - V.H * k) / 2, bot = top + V.H * k;
  const yh = top + (V.H / 2) * k, F = (V.H * k / 2) / Math.tan((V.fovY / 2) * Math.PI / 180);
  const zb = F / (bot - yh), groundTop = Math.round(yh + 28 * k / 2.4);
  const g = (z) => (z / zb) ** grow;
  const z0 = zb * 0.8;
  const vOf = (z) => (grow === 1 ? (zb / d0) * Math.log(z / z0) : (zb / d0) * (((z / zb) ** (1 - grow) - (z0 / zb) ** (1 - grow)) / (1 - grow)));
  const uOf = (x, z) => x / (w0 * g(z));
  const rnd = mulberry32(seed);

  // staggered, jittered seed lattice in (u, v): rows j (v = j - 1), columns i (u = i - nu + stagger)
  const vmax = vOf(F / (groundTop + 1 - yh)) + 1.5, nu = Math.ceil(uOf((W / 2) * (F / (groundTop + 1 - yh)) / F, F / (groundTop + 1 - yh))) + 2;
  const rows = Math.ceil(vmax) + 2, cols = 2 * nu + 1, S = [];
  for (let j = 0; j < rows; j++) {
    S.push([]);
    for (let i = 0; i < cols; i++) {
      const sh = 0.9 + 0.2 * rnd();
      S[j].push({ u: i - nu + 0.5 * (j % 2) + (rnd() * 2 - 1) * jit, v: j - 1 + (rnd() * 2 - 1) * jit,
        c: PALETTE[Math.floor(rnd() * PALETTE.length)].map((c) => Math.max(0, Math.min(255, c * sh + (rnd() * 12 - 6)))) });
    }
  }

  const row = W * 3 + 1, raw = Buffer.alloc(row * Hs);
  const put = (x, y, c) => { const o = y * row + 1 + x * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; };
  for (let y = 0; y < Hs; y++) for (let x = 0; x < W; x++) {
    if (y < top || y >= bot) { put(x, y, [32, 32, 32]); continue; }
    if (y < groundTop) { put(x, y, [255, 0, 255]); continue; }
    const z = F / (y - yh + 1e-6), u = uOf((x - W / 2) * z / F, z), v = vOf(z);
    const j0 = Math.round(v) + 1, i0 = Math.round(u) + nu;
    let d1 = 9, d2 = 9, best = null;
    for (let j = Math.max(0, j0 - 2); j <= Math.min(rows - 1, j0 + 2); j++) for (let i = Math.max(0, i0 - 2); i <= Math.min(cols - 1, i0 + 2); i++) {
      const s = S[j][i], d = Math.hypot(u - s.u, v - s.v);
      if (d < d1) { d2 = d1; d1 = d; best = s; } else if (d < d2) d2 = d;
    }
    if (!best || d2 - d1 < edge) { put(x, y, GROUT); continue; }
    const lift = 0.93 + 0.14 * (1 - Math.min(1, d1 / 0.7));
    put(x, y, best.c.map((c) => Math.max(0, Math.min(255, Math.round(c * lift)))));
  }
  return encodePng(W, Hs, 2, raw);
}
