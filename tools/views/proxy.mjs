// 3D proxy of a map: flat-coloured blocks (no lighting, no textures), a tile grid on the floor, thin dark edge
// lines, rendered by a tiny software rasteriser. It is a rough guide for an image model, not a picture.
// Everything is built from the map (see courtyard.mjs for the format); nothing here is specific to one map.
//
//   import { renderProxy } from './proxy.mjs';   renderProxy(map, x, z, dir, { blur: 3 }) -> { sharp, blurred }  (pngjs images)
import { PNG } from 'pngjs';
import { FWD, RIGHT, SIDE_VEC } from './dirs.mjs';
import { COLOURS } from './colours.mjs';

export const CAM = { W: 1280, H: 720, fovY: 50, eye: 0.55, back: 0.4, ss: 2 };
const MAX_WALL = 1.9; // proxy walls are a little lower than the game's so roofs and sky show

const NEIGHBOURS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// ---------------------------------------------------------------- geometry
function buildWorld(map) {
  const { tiles, wallInfo = {}, props = {}, entities = [] } = map;
  const tris = [], edges = [];
  const quad = (a, b, c, d, col) => { tris.push({ p: [a, b, c], col }, { p: [a, c, d], col }); };
  const edge = (a, b, col, wide = false) => edges.push({ a, b, col, wide });
  const dark = (col) => col.map((v) => Math.round(v * 0.45));
  const fan = (pts, col) => { for (let i = 1; i < pts.length - 1; i++) tris.push({ p: [pts[0], pts[i], pts[i + 1]], col }); };
  const at = (i, j) => tiles[j]?.[i] ?? '#';
  const isFloor = (i, j) => at(i, j) === '.';

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

  // --- buildings: a box reaching back behind the edge of the plaza (out of sight) with a gable roof in a darker shade
  tiles.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '.') return;
    const w = wallInfo[ch] ?? { h: 1.5, run: 0 };
    if (w.far) return; // open scenery, built below
    if (w.water) { quad([i - 0.5, 0.001, j - 0.5], [i + 0.5, 0.001, j - 0.5], [i + 0.5, 0.001, j + 0.5], [i - 0.5, 0.001, j + 0.5], COLOURS.stream); return; }
    const info = { ...w, h: Math.min(w.h, MAX_WALL) };
    const col = COLOURS[w.colour ?? (ch === '#' ? 'wall-stone' : `wall-${ch}`)] ?? COLOURS['wall-stone'];
    const open = NEIGHBOURS.find(([dx, dz]) => isFloor(i + dx, j + dz)); // direction towards the plaza
    const n = open ? [-open[0], -open[1]] : [0, 0], depth = open && info.run ? 2 : 0;
    const ext = (c, nn) => (nn === 0 ? [c - 0.5, c + 0.5] : nn > 0 ? [c - 0.5, c + 0.5 + depth] : [c - 0.5 - depth, c + 0.5]);
    const [x0, x1] = ext(i, n[0]), [z0, z1] = ext(j, n[1]);
    box(x0, x1, 0, info.h, z0, z1, col);
    if (w.people) for (const [dx, dz] of [[-0.2, 0.15], [0.15, -0.15], [0.22, 0.22]].slice(0, w.people)) cyl(i + dx, j + dz, 0.09, info.h, info.h + 0.5, COLOURS.onlooker, 8); // townsfolk on the terrace
    if (!info.run || !open) return;
    const rc = col.map((v) => Math.round(v * 0.7)), h = info.h, r = info.h + info.run;
    if (n[0] === 0) { // wall on a north / south side: ridge along x
      const zm = (z0 + z1) / 2;
      quad([x0, h, z0], [x1, h, z0], [x1, r, zm], [x0, r, zm], rc); quad([x0, h, z1], [x1, h, z1], [x1, r, zm], [x0, r, zm], rc);
      tris.push({ p: [[x0, h, z0], [x0, h, z1], [x0, r, zm]], col: rc }, { p: [[x1, h, z0], [x1, h, z1], [x1, r, zm]], col: rc });
      for (const [a, b] of [[[x0, r, zm], [x1, r, zm]], [[x0, h, z0], [x0, r, zm]], [[x1, h, z0], [x1, r, zm]], [[x0, h, z1], [x0, r, zm]], [[x1, h, z1], [x1, r, zm]]]) edge(a, b, dark(rc));
    } else { // wall on a west / east side: ridge along z
      const xm = (x0 + x1) / 2;
      quad([x0, h, z0], [x0, h, z1], [xm, r, z1], [xm, r, z0], rc); quad([x1, h, z0], [x1, h, z1], [xm, r, z1], [xm, r, z0], rc);
      tris.push({ p: [[x0, h, z0], [x1, h, z0], [xm, r, z0]], col: rc }, { p: [[x0, h, z1], [x1, h, z1], [xm, r, z1]], col: rc });
      for (const [a, b] of [[[xm, r, z0], [xm, r, z1]], [[x0, h, z0], [xm, r, z0]], [[x1, h, z0], [xm, r, z0]], [[x0, h, z1], [xm, r, z1]], [[x1, h, z1], [xm, r, z1]]]) edge(a, b, dark(rc));
    }
  }));

  // --- floor: flat colour with the tile grid
  const seen = new Set();
  tiles.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== '.') return;
    quad([i - 0.5, 0, j - 0.5], [i + 0.5, 0, j - 0.5], [i + 0.5, 0, j + 0.5], [i - 0.5, 0, j + 0.5], COLOURS.floor);
    for (const [a, b, key] of [[[i - 0.5, j - 0.5], [i + 0.5, j - 0.5], `h${i},${j}`], [[i - 0.5, j + 0.5], [i + 0.5, j + 0.5], `h${i},${j + 1}`],
      [[i - 0.5, j - 0.5], [i - 0.5, j + 0.5], `v${i},${j}`], [[i + 0.5, j - 0.5], [i + 0.5, j + 0.5], `v${i + 1},${j}`]]) {
      if (seen.has(key)) continue; seen.add(key);
      edge([a[0], 0.002, a[1]], [b[0], 0.002, b[1]], COLOURS.grid, true);
    }
  }));

  // --- scenery: open cells at the edge of the map ('far' in wallInfo) with a `scenery` kind: stairs | mill
  tiles.forEach((row, j) => [...row].forEach((ch, i) => {
    const w = wallInfo[ch];
    if (!w?.far) return;
    const open = NEIGHBOURS.find(([dx, dz]) => isFloor(i + dx, j + dz));
    if (!open) return;
    const o = [-open[0], -open[1]], tv = [-o[1], o[0]]; // outward direction and tangent
    // local (u outward from the cell's plaza edge at u = -0.5, t tangent) to world
    const W3 = (u, t, y) => [i + o[0] * u + tv[0] * t, y, j + o[1] * u + tv[1] * t];
    const lbox = (u0, u1, t0, t1, y0, y1, col, wire = true) => {
      const a = W3(u0, t0, y0), b = W3(u1, t1, y1);
      box(Math.min(a[0], b[0]), Math.max(a[0], b[0]), y0, y1, Math.min(a[2], b[2]), Math.max(a[2], b[2]), col, wire);
    };
    if (w.scenery === 'stairs') {
      // lower flight to a landing, then two flights left and right around a central pier, up to the gate
      const lane = COLOURS['wall-V'], f = w.far, step = 0.16;
      const flight = (u0, u1, t0, t1, y0, n) => { for (let k = 0; k < n; k++) lbox(u0 + ((u1 - u0) / n) * k, u0 + ((u1 - u0) / n) * (k + 1), t0, t1, 0, y0 + step * (k + 1), lane); };
      const lowEnd = -0.5 + f * 0.45, landEnd = lowEnd + 1.0, top = landEnd + f * 0.4;
      flight(-0.5, lowEnd, -0.5, 0.5, 0, 6); // lower flight, 6 steps
      lbox(lowEnd, landEnd, -1.1, 1.1, 0, 0.96, lane); // landing, wider than the lane
      flight(landEnd, top, -1.1, -0.3, 0.96, 6); // left flight
      flight(landEnd, top, 0.3, 1.1, 0.96, 6); // right flight
      lbox(landEnd, top, -0.3, 0.3, 0, 1.5, lane); // pier between the flights
      lbox(top, top + 0.4, -1.1, 1.1, 1.92, 2.9, lane); // gate
      lbox(-0.5, 0.5, -0.5, 0.5, 1.15, 1.5, COLOURS['wall-T']); // footbridge joining the terraces on either side of the lane
      { const c = W3(0, 0, 0); cyl(c[0], c[2], 0.09, 1.5, 2.0, COLOURS.onlooker, 8); } // someone standing on it
      lbox(top + 2, top + 8, -8, 8, 0, 3.2, COLOURS.hill, false); // wooded hill
      lbox(top + 4, top + 7, -1, 1.5, 3.2, 5.5, COLOURS.castle);
      lbox(top + 5.9, top + 6.5, -1.2, -0.6, 3.2, 6.6, COLOURS.castle); lbox(top + 5.9, top + 6.5, 1.1, 1.7, 3.2, 6.6, COLOURS.castle);
      fan(Array.from({ length: 12 }, (_, k) => W3(30, 1 + 2 * Math.cos((k / 12) * 2 * Math.PI), 14 + 2 * Math.sin((k / 12) * 2 * Math.PI))), COLOURS.moon);
    }
  }));

  // --- river: the water cells flow on past the east edge of the map to a far shore (houses, a mill and its wheel, waterfalls down a wooded cliff)
  const waterCells = [];
  tiles.forEach((row, j) => [...row].forEach((ch, i) => { if (wallInfo[ch]?.scenery === 'river') waterCells.push([i, j]); }));
  if (waterCells.length) {
    const xe = Math.max(...waterCells.map(([i]) => i)) + 0.5, xf = xe + 5.2; // east edge of the map, far shore
    const dk = (c) => c.map((v) => Math.round(v * 0.7));
    quad([xe, 0.001, -6], [xf, 0.001, -6], [xf, 0.001, 10], [xe, 0.001, 10], COLOURS.stream);
    quad([xe - 1, 0.001, -6], [xe, 0.001, -6], [xe, 0.001, -0.5], [xe - 1, 0.001, -0.5], COLOURS.stream); // the river runs on north of the last water cell
    quad([xf, 0.001, -6], [xf + 1.2, 0.001, -6], [xf + 1.2, 0.001, 10], [xf, 0.001, 10], COLOURS.floor); // quay on the far shore
    // a few small houses, far apart, set back from the quay
    const house = (z0, z1, x1, h) => { box(xf + 0.9, x1, 0, h, z0, z1, COLOURS.shore); box(xf + 0.8, x1 + 0.1, h, h + 0.5, z0 - 0.1, z1 + 0.1, dk(COLOURS.shore)); };
    house(-0.9, 0.1, xf + 2.4, 1.5); house(1.4, 2.4, xf + 2.5, 1.7); house(6.6, 7.6, xf + 2.4, 1.5);
    box(xf + 0.9, xf + 3.0, 0, 2.0, 3.6, 5.0, COLOURS['wall-M']); box(xf + 0.8, xf + 3.1, 2.0, 2.6, 3.5, 5.1, dk(COLOURS['wall-M'])); // the mill
    fan(Array.from({ length: 12 }, (_, k) => [xf + 0.8, 0.7 + 0.6 * Math.sin((k / 12) * 2 * Math.PI), 4.3 + 0.6 * Math.cos((k / 12) * 2 * Math.PI)]), COLOURS.wheel); // its wheel
    box(xf + 0.5, xf + 6, 0, 3.8, -6, -1.6, COLOURS.hill, false); // wooded cliff
    quad([xf + 0.45, 0.01, -3.6], [xf + 0.45, 0.01, -2.4], [xf + 0.45, 3.4, -2.4], [xf + 0.45, 3.4, -3.6], COLOURS.waterfall); // waterfalls
    quad([xf + 0.45, 0.01, -5.4], [xf + 0.45, 0.01, -4.8], [xf + 0.45, 2.6, -4.8], [xf + 0.45, 2.6, -5.4], COLOURS.waterfall);
    box(xf + 3.5, xf + 12, 0, 5, -6, 10, COLOURS.hill, false); // hills behind everything
  }

  // --- props, standing against one side of their tile, simple shapes in one colour each
  const parts = []; // each prop keeps its own triangles so a view can leave it out
  for (const e of entities) {
    const t0 = tris.length, e0 = edges.length;
    const p = props[e.prop], sv = SIDE_VEC[e.side], col = COLOURS[e.prop] ?? [128, 128, 128];
    const horiz = sv[1] !== 0; // the wall runs along x (north / south side)
    const dd = p.sideW ?? p.w; // depth away from the wall
    const off = 0.5 - (p.edge ?? 0.12) - dd / 2;
    const cx = e.x + sv[0] * off, cz = e.z + sv[1] * off;
    // box in (tangent t0..t1, depth d0..d1) coordinates around the footprint centre; depth grows towards the plaza
    const B = (t0, t1, d0, d1, y0, y1) => horiz ? box(cx + t0, cx + t1, y0, y1, cz - sv[1] * d1, cz - sv[1] * d0, col) : box(cx - sv[0] * d1, cx - sv[0] * d0, y0, y1, cz + t0, cz + t1, col);
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
      default: B(-p.w / 2, p.w / 2, -dd / 2, dd / 2, 0, p.h); // crate, chest and anything else: a box
    }
    parts.push({ e, tris: tris.splice(t0), edges: edges.splice(e0) });
  }
  return { tris, edges, parts };
}
const worlds = new WeakMap();

// ---------------------------------------------------------------- rasteriser
export function renderProxy(map, cx, cz, dir, { blur = 0, cam = CAM } = {}) {
  if (!worlds.has(map)) worlds.set(map, buildWorld(map));
  const world = worlds.get(map);
  // Like the 2D engine: in the viewer's own cell only the prop against the side being faced is drawn
  // (the camera stands 0.4 tiles back, so the others would be at the viewer's face or behind).
  const shown = world.parts.filter(({ e }) => e.x !== cx || e.z !== cz || (SIDE_VEC[e.side][0] === FWD[dir][0] && SIDE_VEC[e.side][1] === FWD[dir][1]));
  const tris = world.tris.concat(...shown.map((p) => p.tris)), edges = world.edges.concat(...shown.map((p) => p.edges));
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

export function gaussian(src, sigma) {
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
