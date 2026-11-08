// Structural guide for one view of the courtyard: a soft depth map, one blurred-ish mask per
// region (each wall type, the floor, the sky, each visible prop) and the region prompts.
// The model gets these as hints, not templates: the depth steers the big masses and the masks say
// what is roughly where, so signs, lamps and flowers are free to stick out.
import { PNG } from 'pngjs';
import { tiles, wallInfo, wallTypes, props, entities, FWD, RIGHT, SIDE_VEC, skyLook, DIRS } from './courtyard.mjs';

export const VIEW = { W: 1280, H: 720, fovY: 50, eye: 0.55, back: 0.4, wallH: 1.7, roofRun: 0.9, ridge: 2.6, edge: 0.12 };
const f = VIEW.H / 2 / Math.tan((VIEW.fovY * Math.PI) / 360);

const wallAt = (i, j) => (tiles[j]?.[i] ?? '#') !== '.' ? (tiles[j]?.[i] ?? '#') : null;

// DDA along a ray; returns the forward distance t of the first wall hit and the wall cell.
function cast(ox, oy, dx, dy) {
  let i = Math.floor(ox + 0.5), j = Math.floor(oy + 0.5);
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const tdx = dx ? Math.abs(1 / dx) : Infinity, tdy = dy ? Math.abs(1 / dy) : Infinity;
  let tx = dx ? (sx > 0 ? i + 0.5 - ox : ox - (i - 0.5)) * tdx : Infinity;
  let ty = dy ? (sy > 0 ? j + 0.5 - oy : oy - (j - 0.5)) * tdy : Infinity;
  for (let n = 0; n < 40; n++) {
    let t;
    if (tx < ty) { t = tx; tx += tdx; i += sx; } else { t = ty; ty += tdy; j += sy; }
    const w = wallAt(i, j);
    if (w) return { t, i, j, type: w };
  }
  return null;
}

function blocked(x0, y0, x1, y1) { // is the segment cut by a wall cell?
  for (let k = 1; k < 24; k++) {
    const u = k / 24, i = Math.round(x0 + (x1 - x0) * u), j = Math.round(y0 + (y1 - y0) * u);
    if (wallAt(i, j)) return true;
  }
  return false;
}

export function buildScene(cx, cz, dir) {
  const { W, H, eye, back, wallH, roofRun, edge } = VIEW;
  const fw = FWD[dir], rt = RIGHT[dir];
  const cam = [cx - fw[0] * back, cz - fw[1] * back];

  // --- walls and floor: depth per pixel, region per pixel (0 sky, 1 floor, 2.. wall types)
  const typeList = [...new Set([...tiles.join('')].filter((c) => c !== '.'))];
  const depth = new Float32Array(W * H).fill(Infinity);
  const region = new Int16Array(W * H); // 0 sky, 1 floor, 2+i wall type i
  for (let x = 0; x < W; x++) {
    const a = (x + 0.5 - W / 2) / f;
    const hit = cast(cam[0], cam[1], fw[0] + rt[0] * a, fw[1] + rt[1] * a);
    const info = hit ? wallInfo[hit.type] ?? { h: 1.7, run: 0 } : null;
    const s = hit ? hit.t + (info.far ?? 0) : 99;
    const typeIdx = hit ? 2 + typeList.indexOf(hit.type) : 0;
    for (let y = 0; y < H; y++) {
      const k = (H / 2 - (y + 0.5)) / f; // slope of the ray
      let d = Infinity, r = 0;
      if (k < 0 && eye / -k < s) { d = eye / -k; r = 1; }
      else if (hit) {
        const yh = eye + k * s;
        if (yh <= info.h) { d = s; r = typeIdx; }
        else if (info.run) { // roof plane rising away from the eave
          const sr = k - 1 !== 0 ? (info.h - s - eye) / (k - 1) : -1;
          if (sr >= s && sr <= s + info.run && eye + k * sr <= info.h + info.run) { d = sr; r = typeIdx; }
        }
      }
      depth[y * W + x] = d; region[y * W + x] = r;
    }
  }

  // --- props
  const seen = [];
  entities.forEach((e, n) => {
    const p = props[e.prop], sv = SIDE_VEC[e.side];
    const along = sv[0] * fw[0] + sv[1] * fw[1]; // +1 far, -1 near, 0 beside
    const pw0 = along !== 0 ? p.w : (p.sideW ?? p.w); // seen from the side a prop is as wide as it is deep
    const off = along !== 0 ? 0.5 - edge : Math.max(0, 0.5 - edge - pw0 / 2);
    const px = e.x + sv[0] * off, pz = e.z + sv[1] * off;
    const dxw = px - cam[0], dzw = pz - cam[1];
    const s = dxw * fw[0] + dzw * fw[1], lat = dxw * rt[0] + dzw * rt[1];
    if (s < 0.3) return;
    const cxp = W / 2 + (f * lat) / s, pw = (f * pw0) / s, ph = (f * p.h) / s, by = H / 2 + (f * eye) / s;
    const rect = { x0: cxp - pw / 2, x1: cxp + pw / 2, y0: by - ph, y1: by };
    const visibleW = Math.min(rect.x1, W) - Math.max(rect.x0, 0);
    if (visibleW < pw * 0.35 || blocked(cam[0], cam[1], px, pz)) return;
    seen.push({ n, e, p, s, lat, rect });
  });
  seen.sort((a, b) => b.s - a.s);

  // --- depth image: disparity, near = bright. Props are flat cards, softer than the walls.
  const disp = (d) => (d === Infinity ? 0 : Math.max(0, Math.min(1, (1 / d - 1 / 7) / (1 / 1.0 - 1 / 7))));
  const depthPng = new PNG({ width: W, height: H });
  const val = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) val[i] = disp(depth[i]);
  const PROP_DEPTH = false; // flat cards in the depth map made props look like bubbles; the region prompts place them instead
  for (const o of PROP_DEPTH ? seen : []) {
    const cxm = (o.rect.x0 + o.rect.x1) / 2, cym = (o.rect.y0 + o.rect.y1) / 2;
    const rx = (o.rect.x1 - o.rect.x0) / 2, ry = (o.rect.y1 - o.rect.y0) / 2;
    const v = disp(o.s);
    for (let y = Math.max(0, Math.floor(o.rect.y0)); y < Math.min(H, Math.ceil(o.rect.y1)); y++)
      for (let x = Math.max(0, Math.floor(o.rect.x0)); x < Math.min(W, Math.ceil(o.rect.x1)); x++) {
        const q = Math.abs((x - cxm) / rx) ** 4 + Math.abs((y - cym) / ry) ** 4; // rounded box
        if (q <= 1 && o.s < depth[y * W + x]) val[y * W + x] = v;
      }
  }
  for (let i = 0; i < W * H; i++) {
    const g = Math.round(val[i] * 255);
    depthPng.data[i * 4] = depthPng.data[i * 4 + 1] = depthPng.data[i * 4 + 2] = g; depthPng.data[i * 4 + 3] = 255;
  }

  // --- region masks (white on black), grown so neighbouring regions overlap a little
  const mask = (test, grow = 0, rect = null) => {
    const png = new PNG({ width: W, height: H });
    const on = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) on[i] = test(i) ? 1 : 0;
    let m = on;
    if (grow) { // horizontal then vertical box grow
      const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) { let last = -1e9; for (let x = 0; x < W; x++) { if (on[y * W + x]) last = x; if (x - last <= grow) tmp[y * W + x] = 1; }
        last = 1e9; for (let x = W - 1; x >= 0; x--) { if (on[y * W + x]) last = x; if (last - x <= grow) tmp[y * W + x] = 1; } }
      for (let x = 0; x < W; x++) { let last = -1e9; for (let y = 0; y < H; y++) { if (tmp[y * W + x]) last = y; if (y - last <= grow) out[y * W + x] = 1; }
        last = 1e9; for (let y = H - 1; y >= 0; y--) { if (tmp[y * W + x]) last = y; if (last - y <= grow) out[y * W + x] = 1; } }
      m = out;
    }
    for (let i = 0; i < W * H; i++) { const g = m[i] ? 255 : 0; png.data[i * 4] = png.data[i * 4 + 1] = png.data[i * 4 + 2] = g; png.data[i * 4 + 3] = 255; }
    return png;
  };

  // every pixel belongs to exactly one region (props win), so region prompts are not averaged together
  const owner = Int16Array.from(region);
  seen.forEach((o, k) => {
    const grow = 0.12, cxm = (o.rect.x0 + o.rect.x1) / 2, cym = (o.rect.y0 + o.rect.y1) / 2;
    const rx = ((o.rect.x1 - o.rect.x0) / 2) * (1 + grow), ry = ((o.rect.y1 - o.rect.y0) / 2) * (1 + grow);
    o.id = 1000 + k;
    for (let y = Math.max(0, Math.floor(cym - ry)); y < Math.min(H, Math.ceil(cym + ry)); y++)
      for (let x = Math.max(0, Math.floor(cxm - rx)); x < Math.min(W, Math.ceil(cxm + rx)); x++)
        if (((x - cxm) / rx) ** 2 + ((y - cym) / ry) ** 2 <= 1) owner[y * W + x] = o.id;
  });

  const regions = [];
  regions.push({ id: 'sky', png: mask((i) => owner[i] === 0, 6), text: skyLook[DIRS[dir]] });
  regions.push({ id: 'floor', png: mask((i) => owner[i] === 1, 6), text: 'wet cobblestone street, irregular rounded stones, warm lantern light reflecting on the stones, weeds between them' });
  const present = new Set();
  for (let i = 0; i < W * H; i++) if (owner[i] >= 2 && owner[i] < 1000) present.add(owner[i]);
  for (const r of [...present].sort()) {
    const t = typeList[r - 2];
    regions.push({ id: `wall-${t === '#' ? 'stone' : t}`, png: mask((i) => owner[i] === r, 6), text: wallTypes[t] });
  }
  for (const o of seen) regions.push({ id: `prop-${o.e.prop}-${o.n}`, text: o.p.look, png: mask((i) => owner[i] === o.id, 4) });

  const wallCols = new Set(); // for a human-readable summary
  const describe = seen.map((o) => `${o.e.name ?? o.e.prop} (${o.s.toFixed(1)} ahead, ${o.lat < -0.2 ? 'left' : o.lat > 0.2 ? 'right' : 'centre'})`);
  return { depthPng, regions, seen, describe };
}

export const png = (p) => PNG.sync.write(p);
