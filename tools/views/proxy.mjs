// 3D proxy of a view: the courtyard as flat-coloured blocks (no lighting, no textures), with a tile grid on the
// floor, rendered by a tiny software rasteriser. It is a rough guide for an image model, not a picture:
// one colour per kind of thing, dark edges so the forms read, and (optionally) a blur so the model keeps freedom.
//
//   node proxy.mjs 2,3,N out.png [--blur 3]     writes out.png (sharp) and out-blur.png
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { tiles, wallInfo, entities, props, FWD, RIGHT, SIDE_VEC, DIRS } from './courtyard.mjs';
import { COLOURS } from './colours.mjs';

export const CAM = { W: 1280, H: 720, fovY: 50, eye: 0.55, back: 0.4, ss: 2 };

// ---------------------------------------------------------------- geometry
function buildWorld() {
  const tris = [], edges = [];
  const quad = (a, b, c, d, col) => { tris.push({ p: [a, b, c], col }, { p: [a, c, d], col }); };
  const edge = (a, b, col, wide = false) => edges.push({ a, b, col, wide });
  const dark = (col) => col.map((v) => Math.round(v * 0.45));
  const fan = (pts, col) => { for (let i = 1; i < pts.length - 1; i++) tris.push({ p: [pts[0], pts[i], pts[i + 1]], col }); };

  // axis-aligned box from world extents
  const box = (x0, x1, y0, y1, z0, z1, col, wire = true) => {
    const c = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    quad(c[0], c[1], c[2], c[3], col); quad(c[4], c[5], c[6], c[7], col);
    quad(c[0], c[1], c[5], c[4], col); quad(c[1], c[2], c[6], c[5], col); quad(c[2], c[3], c[7], c[6], col); quad(c[3], c[0], c[4], c[7], col);
    if (wire) for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) edge(c[i], c[j], dark(col));
  };
  // upright prism with a regular polygon base
  const cyl = (cx, cz, r, y0, y1, col, n = 8) => {
    const ring = (y) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), y, cz + r * Math.sin((i / n) * 2 * Math.PI)]);
    const lo = ring(y0), hi = ring(y1);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(lo[i], lo[j], hi[j], hi[i], col); edge(lo[i], lo[j], dark(col)); edge(hi[i], hi[j], dark(col)); edge(lo[i], hi[i], dark(col)); }
    fan(hi, col);
  };

  // --- buildings: a box reaching back behind the ring (out of sight) with a gable roof in a darker shade
  const outward = (i, j) => (j === 0 ? [0, -1] : j === 4 ? [0, 1] : i === 0 ? [-1, 0] : i === 4 ? [1, 0] : [0, 0]);
  tiles.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '.') return;
    const info = wallInfo[ch] ?? { h: 1.5, run: 0 };
    if (info.far) return; // open scenery, built below
    const col = COLOURS[ch === '#' ? 'wall-stone' : `wall-${ch}`];
    const n = outward(i, j), depth = ch === '#' ? 0 : 2;
    const ext = (c, nn) => (nn === 0 ? [c - 0.5, c + 0.5] : nn > 0 ? [c - 0.5, c + 0.5 + depth] : [c - 0.5 - depth, c + 0.5]);
    const [x0, x1] = ext(i, n[0]), [z0, z1] = ext(j, n[1]);
    box(x0, x1, 0, info.h, z0, z1, col);
    if (!info.run) return;
    const rc = col.map((v) => Math.round(v * 0.7)), h = info.h, r = info.h + info.run;
    if (n[0] === 0) { // north / south rows: ridge along x
      const zm = (z0 + z1) / 2;
      quad([x0, h, z0], [x1, h, z0], [x1, r, zm], [x0, r, zm], rc); quad([x0, h, z1], [x1, h, z1], [x1, r, zm], [x0, r, zm], rc);
      tris.push({ p: [[x0, h, z0], [x0, h, z1], [x0, r, zm]], col: rc }, { p: [[x1, h, z0], [x1, h, z1], [x1, r, zm]], col: rc });
      for (const [a, b] of [[[x0, r, zm], [x1, r, zm]], [[x0, h, z0], [x0, r, zm]], [[x1, h, z0], [x1, r, zm]], [[x0, h, z1], [x0, r, zm]], [[x1, h, z1], [x1, r, zm]]]) edge(a, b, dark(rc));
    } else { // west / east columns: ridge along z
      const xm = (x0 + x1) / 2;
      quad([x0, h, z0], [x0, h, z1], [xm, r, z1], [xm, r, z0], rc); quad([x1, h, z0], [x1, h, z1], [xm, r, z1], [xm, r, z0], rc);
      tris.push({ p: [[x0, h, z0], [x1, h, z0], [xm, r, z0]], col: rc }, { p: [[x0, h, z1], [x1, h, z1], [xm, r, z1]], col: rc });
      for (const [a, b] of [[[xm, r, z0], [xm, r, z1]], [[x0, h, z0], [xm, r, z0]], [[x1, h, z0], [xm, r, z0]], [[x0, h, z1], [xm, r, z1]], [[x1, h, z1], [xm, r, z1]]]) edge(a, b, dark(rc));
    }
  }));

  // --- plaza floor (flat colour) with the tile grid
  quad([0.5, 0, 0.5], [3.5, 0, 0.5], [3.5, 0, 3.5], [0.5, 0, 3.5], COLOURS.floor);
  for (let k = 0; k <= 3; k++) {
    edge([0.5 + k, 0.002, 0.5], [0.5 + k, 0.002, 3.5], COLOURS.grid, true);
    edge([0.5, 0.002, 0.5 + k], [3.5, 0.002, 0.5 + k], COLOURS.grid, true);
  }

  // --- vista north: staircase to a gate, a hill with a castle, the moon
  const lane = COLOURS['wall-V'];
  for (let k = 0; k < 12; k++) box(1.5, 2.5, 0, 0.16 * (k + 1), 0.5 - 0.5 * (k + 1), 0.5 - 0.5 * k, lane);
  box(1.5, 2.5, 1.92, 2.9, -5.9, -5.5, lane);
  box(-6, 10, 0, 3.2, -14, -8, COLOURS.hill, false);
  box(1, 3.5, 3.2, 5.5, -13, -10, COLOURS.castle);
  box(0.8, 1.4, 3.2, 6.6, -12.5, -11.9, COLOURS.castle); box(3.1, 3.7, 3.2, 6.6, -12.5, -11.9, COLOURS.castle);
  fan(Array.from({ length: 12 }, (_, i) => [3 + 2 * Math.cos((i / 12) * 2 * Math.PI), 14 + 2 * Math.sin((i / 12) * 2 * Math.PI), -30]), COLOURS.moon);

  // --- vista east: stream, water wheel, waterfall
  quad([4.5, 0.001, 1.5], [10, 0.001, 1.5], [10, 0.001, 2.5], [4.5, 0.001, 2.5], COLOURS.stream);
  box(10, 13, 0, 4, -1, 5, COLOURS.hill, false);
  box(9.9, 10, 0.01, 3.6, 1.5, 2.5, COLOURS.waterfall);
  {
    const n = 10, z0 = 0.9, z1 = 1.3, pts = Array.from({ length: n }, (_, i) => [7.5 + Math.cos((i / n) * 2 * Math.PI), 1 + Math.sin((i / n) * 2 * Math.PI)]);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad([pts[i][0], pts[i][1], z0], [pts[j][0], pts[j][1], z0], [pts[j][0], pts[j][1], z1], [pts[i][0], pts[i][1], z1], COLOURS.wheel); edge([pts[i][0], pts[i][1], z0], [pts[j][0], pts[j][1], z0], dark(COLOURS.wheel)); }
    fan(pts.map(([x, y]) => [x, y, z0]), COLOURS.wheel);
  }

  // --- props, standing against one side of their tile, simple shapes in one colour each
  for (const e of entities) {
    const p = props[e.prop], sv = SIDE_VEC[e.side], col = COLOURS[e.prop];
    const horiz = sv[1] !== 0; // wall runs along x (north / south side)
    const dd = e.prop === 'stall' ? p.sideW : p.w; // depth away from the wall
    const off = 0.5 - 0.12 - dd / 2;
    const cx = e.x + sv[0] * off, cz = e.z + sv[1] * off;
    // box in (tangent t0..t1, depth d0..d1) coordinates around the footprint centre; depth grows towards the plaza
    const B = (t0, t1, d0, d1, y0, y1) => horiz ? box(cx + t0, cx + t1, y0, y1, cz - sv[1] * d1, cz - sv[1] * d0, col) : box(cx - sv[0] * d1, cx - sv[0] * d0, y0, y1, cz + t0, cz + t1, col);
    // (for horiz sides depth is along z, otherwise along x; the min/max order does not matter for a box)
    switch (e.prop) {
      case 'stall':
        B(-0.45, 0.45, -dd / 2, dd / 2, 0, 0.5); // counter
        B(-0.45, -0.4, -dd / 2, -dd / 2 + 0.05, 0.5, 1.0); B(0.4, 0.45, -dd / 2, -dd / 2 + 0.05, 0.5, 1.0); // posts
        B(-0.5, 0.5, -dd / 2 - 0.05, dd / 2 + 0.05, 0.95, 1.05); // awning
        break;
      case 'well': cyl(cx, cz, 0.3, 0, 0.4, col, 10); B(-0.28, -0.22, -0.03, 0.03, 0.4, 0.7); B(0.22, 0.28, -0.03, 0.03, 0.4, 0.7); B(-0.31, 0.31, -0.25, 0.25, 0.7, 0.8); break;
      case 'lamppost': B(-0.03, 0.03, -0.03, 0.03, 0, 1.2); B(-0.08, 0.08, -0.08, 0.08, 1.2, 1.35); B(0.05, 0.31, -0.01, 0.01, 0.65, 1.1); break;
      case 'guard': case 'hooded': case 'villager':
        cyl(cx, cz, p.w / 2 * 0.8, 0, p.h * 0.78, col, 8); box(cx - p.w * 0.25, cx + p.w * 0.25, p.h * 0.78, p.h, cz - p.w * 0.25, cz + p.w * 0.25, col); break;
      case 'barrel': cyl(cx, cz, p.w / 2, 0, p.h, col, 8); break;
      default: B(-p.w / 2, p.w / 2, -dd / 2, dd / 2, 0, p.h); // crate, chest
    }
  }
  return { tris, edges };
}
let world = null;

// ---------------------------------------------------------------- rasteriser
export function renderProxy(cx, cz, dir, { blur = 0, cam = CAM } = {}) {
  world ??= buildWorld();
  const { tris, edges } = world;
  const S = cam.ss, W = cam.W * S, H = cam.H * S, f = (H / 2) / Math.tan((cam.fovY * Math.PI) / 360);
  const fw = FWD[dir], rt = RIGHT[dir], cp = [cx - fw[0] * cam.back, cz - fw[1] * cam.back];
  const toCam = (p) => [(p[0] - cp[0]) * rt[0] + (p[2] - cp[1]) * rt[1], p[1] - cam.eye, (p[0] - cp[0]) * fw[0] + (p[2] - cp[1]) * fw[1]]; // x right, y up, z ahead
  const proj = (c) => [W / 2 + (f * c[0]) / c[2], H / 2 - (f * c[1]) / c[2], 1 / c[2]];
  const NEAR = 0.05;
  const img = new Uint8Array(W * H * 3);
  const zb = new Float32Array(W * H); // 1/z, larger = nearer
  const sky = COLOURS.sky;
  for (let i = 0; i < W * H; i++) { img[i * 3] = sky[0]; img[i * 3 + 1] = sky[1]; img[i * 3 + 2] = sky[2]; }

  const clipNear = (poly) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ia = a[2] >= NEAR, ib = b[2] >= NEAR;
      if (ia) out.push(a);
      if (ia !== ib) { const t = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]); }
    }
    return out;
  };
  const fillTri = (a, b, c, col) => {
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(den) < 1e-9) return;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den;
      const w1 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const iz = w0 * a[2] + w1 * b[2] + w2 * c[2], k = y * W + x;
      if (iz > zb[k]) { zb[k] = iz; img[k * 3] = col[0]; img[k * 3 + 1] = col[1]; img[k * 3 + 2] = col[2]; }
    }
  };
  for (const t of tris) {
    const poly = clipNear(t.p.map(toCam));
    if (poly.length < 3) continue;
    const q = poly.map(proj);
    for (let i = 1; i < q.length - 1; i++) fillTri(q[0], q[i], q[i + 1], t.col);
  }
  const line = (a, b, col, wide) => {
    let ca = toCam(a), cb = toCam(b);
    if (ca[2] < NEAR && cb[2] < NEAR) return;
    if (ca[2] < NEAR) { const t = (NEAR - ca[2]) / (cb[2] - ca[2]); ca = [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, NEAR]; }
    if (cb[2] < NEAR) { const t = (NEAR - cb[2]) / (ca[2] - cb[2]); cb = [cb[0] + (ca[0] - cb[0]) * t, cb[1] + (ca[1] - cb[1]) * t, NEAR]; }
    const p = proj(ca), q = proj(cb), n = Math.ceil(Math.max(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1])));
    const size = wide ? 3 : 2;
    for (let s = 0; s <= n; s++) {
      const u = n ? s / n : 0, x = p[0] + (q[0] - p[0]) * u, y = p[1] + (q[1] - p[1]) * u, iz = p[2] + (q[2] - p[2]) * u;
      for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
        const X = Math.floor(x) + dx - 1, Y = Math.floor(y) + dy - 1;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const k = Y * W + X;
        if (iz >= zb[k] * 0.99) { img[k * 3] = col[0]; img[k * 3 + 1] = col[1]; img[k * 3 + 2] = col[2]; }
      }
    }
  };
  for (const e of edges) line(e.a, e.b, e.col, e.wide);

  // downsample S x S
  const w = cam.W, h = cam.H, out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) sum += img[((y * S + dy) * W + x * S + dx) * 3 + c];
      out.data[(y * w + x) * 4 + c] = Math.round(sum / (S * S));
    }
    out.data[(y * w + x) * 4 + 3] = 255;
  }
  return { sharp: out, blurred: blur ? gaussian(out, blur) : null };
}

function gaussian(src, sigma) {
  const r = Math.ceil(sigma * 3), k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const sum = k.reduce((a, b) => a + b, 0); k.forEach((_, i) => { k[i] /= sum; });
  const { width: w, height: h } = src, tmp = new Float32Array(w * h * 3), out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let v = 0; for (let i = -r; i <= r; i++) v += k[i + r] * src.data[(y * w + Math.min(w - 1, Math.max(0, x + i))) * 4 + c]; tmp[(y * w + x) * 3 + c] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) { let v = 0; for (let i = -r; i <= r; i++) v += k[i + r] * tmp[(Math.min(h - 1, Math.max(0, y + i)) * w + x) * 3 + c]; out.data[(y * w + x) * 4 + c] = Math.round(v); }
    out.data[(y * w + x) * 4 + 3] = 255;
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('proxy.mjs')) {
  const [x, z, d] = process.argv[2].split(','), out = process.argv[3];
  const bi = process.argv.indexOf('--blur'), blur = bi > 0 ? Number(process.argv[bi + 1]) : 3;
  const r = renderProxy(+x, +z, DIRS.indexOf(d), { blur });
  fs.writeFileSync(out, PNG.sync.write(r.sharp));
  if (r.blurred) fs.writeFileSync(out.replace(/\.png$/, '-blur.png'), PNG.sync.write(r.blurred));
}
