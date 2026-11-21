#!/usr/bin/env node
// Icon sheets for game two: from the list in game-2/art/icons/sheets.json to the atlas the game loads.
//
//   node tools/icon-sheets.mjs list                     the sheets and their icons
//   node tools/icon-sheets.mjs prompt <sheet> [refs..]  the prompt for an image model (refs: names of attached reference images)
//   node tools/icon-sheets.mjs slice <sheet> <file.png> cut a painted sheet into game-2/art/icons/png/<id>.png
//   node tools/icon-sheets.mjs pack                     build game-2/art/icons/atlas.png and atlas.json
//
// A sheet is painted on a flat magenta background, 6 columns x 4 rows of 256px cells on a 1536x1024 canvas. `slice`
// turns the magenta into real transparency, finds each icon (even if it drifted out of its cell), trims it and fits
// it into a 64x64 tile. A sheet marked "native": 16 in sheets.json is true 16x16 pixel art, painted as 12x12-pixel
// blocks: slice samples it back to a real grid (`native` pixels across) with no smoothing, and pack stores it enlarged
// by a whole number with nearest neighbour inside its 64x64 tile and records it under "native". Needs only pngjs. See docs/icons.md.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { PNG } = createRequire(import.meta.url)('pngjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'game-2/art/icons');
const COLS = 6, ROWS = 4, CELL = 256, TILE = 64, INNER = 56, ATLAS_COLS = 12;
// --hd: the detailed set. Its sheets are painted at high resolution (not pixel art) and shrunk smoothly into the tiles;
// it is written to png-hd/ and atlas-hd.png/json instead, and the game can switch to it (see docs/icons.md).
const HD = process.argv.includes('--hd'), SUFFIX = HD ? '-hd' : '';
const { sheets } = JSON.parse(fs.readFileSync(path.join(DIR, 'sheets.json'), 'utf8'));
const parse = line => { const [id, ...rest] = line.split('|'); return { id, what: rest.join('|') }; };
const sheetNamed = name => { const s = sheets.find(s => s.id === name); if (!s) throw new Error(`no sheet "${name}"; try: ${sheets.map(s => s.id).join(', ')}`); return s; };

// ---------- the prompt
function prompt(sheet, refs) {
  if (sheet.native) return nativePrompt(sheet, refs);
  const list = sheet.icons.map(parse).map((icon, i) => `${i + 1}. ${icon.id}: ${icon.what}`).join('\n');
  const refText = refs.length ? `Attached reference images (${refs.join(', ')}): keep exactly the same rendering style, outline weight, colour saturation and top-left lighting as these.` : '';
  return `$imagegen Use your image generation tool to create ONE image, and save it in the current directory as sheet-${sheet.id}.png (copy the generated file there if the tool saves it elsewhere; do not overwrite other files). Then reply with just the saved file name.

An icon sheet for a retro fantasy dungeon-crawler RPG: "${sheet.title}". Style: pixel-art look like an early-1990s CRPG, crisp dark outlines, limited rich palette, soft lighting from the top left, each icon readable at 32 pixels. ${refText}

Canvas 1536x1024. The whole background is one flat, solid, pure magenta (#FF00FF): no gradient, no texture, no vignette, no shadow or glow on the background, because it will be removed with a colour key. Never use magenta or hot pink inside an icon.

Layout: exactly 6 columns by 4 rows = 24 equal cells of 256x256 pixels. NO visible grid lines, borders, frames, plates or labels. Exactly one icon per cell, centred in its cell, filling about 75-80% of the cell, wholly inside its cell with clear magenta margin all round, so icons never touch each other or the edges. Each icon is a single object (a pair or bundle counts as one object where the description says so), shown as a game inventory icon, with no hands, no characters, no text, no numbers and no letters.

The 24 icons, in reading order (row 1 left to right, then row 2, and so on):
${list}

Do not add anything else to the image.
`;
}

function nativePrompt(sheet, refs) {
  const n = sheet.native, block = Math.round(192 / n);
  const list = sheet.icons.map(parse).map((icon, i) => `${i + 1}. ${icon.id}: ${icon.what}`).join('\n');
  const refText = refs.length ? `Attached reference image (${refs.join(', ')}): a finished sheet of ${n} by ${n} sprites in exactly the target style. Match its pixel scale (blocks of the same size), outline, flat shading and palette feel; do NOT copy its subjects.` : '';
  return `$imagegen Use your image generation tool to create ONE image, and save it in the current directory as sheet-${sheet.id}.png (copy the generated file there if the tool saves it elsewhere; do not overwrite other files). Then reply with just the saved file name.

An icon sheet for a retro fantasy dungeon-crawler RPG: "${sheet.title}". Every icon is TRUE LOW-RESOLUTION PIXEL ART on a ${n} by ${n} pixel grid, like an NES or SNES-era game icon: a hand-placed pixel sprite, a limited palette (at most 8 colours per icon), a 1-pixel dark outline, flat shading with at most one highlight and one shadow tone, NO anti-aliasing, NO gradients, NO soft glow, NO dithering, NO blur. Simple, bold, instantly readable shapes. ${refText}

Then the whole sheet is enlarged with nearest-neighbour scaling so that every art pixel is a perfectly square, crisp, hard-edged block of exactly ${block} by ${block} pixels, all the same size and aligned to a grid across the whole sheet. An icon is therefore ${n * block} by ${n * block} pixels.

Canvas 1536x1024. The whole background is one flat, solid, pure magenta (#FF00FF): no gradient, no texture, no shadow on the background, because it will be removed with a colour key. Never use magenta or hot pink inside an icon.

Layout: exactly 6 columns by 4 rows = 24 equal cells of 256x256 pixels. NO visible grid lines, borders or labels. Exactly one icon per cell, centred in its cell (it fills about ${n * block} of the 256 pixels), with clear magenta margin all round, so icons never touch each other or the edges. No text, numbers or letters.

The 24 icons, in reading order (row 1 left to right, then row 2, and so on):
${list}

Do not add anything else to the image.
`;
}

// ---------- keying magenta to alpha
const MAGENTA = [255, 0, 255], MAX_D = Math.hypot(255, 255, 255);
const dist = (r, g, b) => Math.hypot(r - MAGENTA[0], g - MAGENTA[1], b - MAGENTA[2]) / MAX_D;

function keyed(png) {
  const { width: W, height: H, data } = png, n = W * H;
  const bg = new Uint8Array(n), d = new Float32Array(n);
  for (let i = 0; i < n; i++) { d[i] = dist(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]); bg[i] = d[i] < 0.17 ? 1 : 0; }
  // fringe: pixels within 2px of the background that are still tinted get partial alpha and lose the tint
  const near = new Uint8Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!bg[y * W + x]) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) near[yy * W + xx] = 1;
    }
  }
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    let r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = 255;
    if (bg[i]) a = 0;
    else if (near[i] && d[i] < 0.42) {
      const t = Math.min(1, Math.max(0, (d[i] - 0.17) / 0.25));
      a = Math.round(255 * t);
      r = Math.round(g + (r - g) * t); b = Math.round(g + (b - g) * t);
    }
    out.set([r, g, b, a], i * 4);
  }
  return { width: W, height: H, data: out };
}

// ---------- finding each icon: connected pieces, assigned to the cell that holds most of them
function pieces(img) {
  const { width: W, height: H, data } = img, label = new Int32Array(W * H), list = [];
  for (let start = 0; start < W * H; start++) {
    if (label[start] || data[start * 4 + 3] < 40) continue;
    const id = list.length + 1, stack = [start], piece = { pixels: [], x0: W, y0: H, x1: 0, y1: 0 };
    label[start] = id;
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p / W) | 0;
      piece.pixels.push(p);
      piece.x0 = Math.min(piece.x0, x); piece.x1 = Math.max(piece.x1, x); piece.y0 = Math.min(piece.y0, y); piece.y1 = Math.max(piece.y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx;
        if (!label[q] && data[q * 4 + 3] >= 40) { label[q] = id; stack.push(q); }
      }
    }
    list.push(piece);
  }
  return list;
}

// ---------- resizing (box filter on premultiplied colour)
function resize(src, sw, sh, dw, dh) {
  const out = new Uint8Array(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) for (let dx = 0; dx < dw; dx++) {
    const x0 = dx * sw / dw, x1 = (dx + 1) * sw / dw, y0 = dy * sh / dh, y1 = (dy + 1) * sh / dh;
    let r = 0, g = 0, b = 0, a = 0, wsum = 0;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      const w = (Math.min(x + 1, x1) - Math.max(x, x0)) * (Math.min(y + 1, y1) - Math.max(y, y0));
      const i = (y * sw + x) * 4, al = src[i + 3] / 255;
      r += src[i] * al * w; g += src[i + 1] * al * w; b += src[i + 2] * al * w; a += al * w; wsum += w;
    }
    const o = (dy * dw + dx) * 4;
    if (a > 0) out.set([Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(255 * a / wsum)], o);
  }
  return out;
}

function slice(sheet, file) {
  if (HD) sheet = { ...sheet, native: undefined };
  const png = PNG.sync.read(fs.readFileSync(file));
  if (png.width !== COLS * CELL || png.height < ROWS * CELL) throw new Error(`expected a ${COLS * CELL}x${ROWS * CELL}+ image, got ${png.width}x${png.height}`);
  const img = keyed(png), W = img.width;
  const found = pieces(img).filter(p => p.pixels.length >= 40);
  const cells = Array.from({ length: COLS * ROWS }, () => []);
  for (const p of found) {
    const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2;
    const col = Math.min(COLS - 1, Math.max(0, Math.floor(cx / CELL))), row = Math.min(ROWS - 1, Math.max(0, Math.floor(cy / CELL)));
    cells[row * COLS + col].push(p);
  }
  fs.mkdirSync(path.join(DIR, `png${SUFFIX}`), { recursive: true });
  const problems = [], nativeTiles = [];
  sheet.icons.map(parse).forEach((icon, index) => {
    const mine = cells[index];
    if (!mine.length) { problems.push(`${icon.id}: nothing in cell ${index + 1}`); return; }
    let x0 = Infinity, y0 = Infinity, x1 = 0, y1 = 0;
    for (const p of mine) { x0 = Math.min(x0, p.x0); y0 = Math.min(y0, p.y0); x1 = Math.max(x1, p.x1); y1 = Math.max(y1, p.y1); }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, crop = new Uint8Array(bw * bh * 4);
    for (const p of mine) for (const px of p.pixels) {
      const x = px % W - x0, y = ((px / W) | 0) - y0;
      crop.set(img.data.subarray(px * 4, px * 4 + 4), (y * bw + x) * 4);
    }
    if (sheet.native) { nativeTiles.push({ icon, crop, bw, bh }); return; }
    const scale = INNER / Math.max(bw, bh), dw = Math.max(1, Math.round(bw * scale)), dh = Math.max(1, Math.round(bh * scale));
    const small = resize(crop, bw, bh, dw, dh), tile = new PNG({ width: TILE, height: TILE });
    const ox = (TILE - dw) >> 1, oy = (TILE - dh) >> 1;
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) tile.data.set(small.subarray((y * dw + x) * 4, (y * dw + x) * 4 + 4), ((y + oy) * TILE + x + ox) * 4);
    fs.writeFileSync(path.join(DIR, `png${SUFFIX}`, `${icon.id}.png`), PNG.sync.write(tile));
    if (mine.length > 3) problems.push(`${icon.id}: ${mine.length} separate pieces (check it)`);
  });
  if (sheet.native) writeNative(nativeTiles, sheet.native, problems);
  const extra = cells.slice(sheet.icons.length).reduce((s, c) => s + c.length, 0);
  if (extra) problems.push(`${extra} stray pieces outside the ${sheet.icons.length} cells`);
  console.log(`${sheet.id}: wrote ${sheet.icons.length - problems.filter(p => p.includes('nothing in cell')).length} icons`);
  for (const p of problems) console.log('  !', p);
}

// ---------- true pixel art: sample the painted blocks back to a real grid
function writeNative(list, grid, problems) {
  // How big is one painted pixel? The sheet's icons mostly span the whole grid in one direction.
  const spans = list.map(({ bw, bh }) => Math.max(bw, bh) / grid).sort((a, b) => a - b);
  const block = spans[Math.floor(spans.length * 0.6)];
  for (const { icon, crop, bw, bh } of list) {
    const nw = Math.min(grid, Math.max(1, Math.round(bw / block))), nh = Math.min(grid, Math.max(1, Math.round(bh / block)));
    const sx = bw / nw, sy = bh / nh, tile = new PNG({ width: grid, height: grid });
    const ox = (grid - nw) >> 1, oy = (grid - nh) >> 1;
    for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
      // the middle half of each painted block votes, so the soft edges between blocks do not
      const bins = new Map(); let opaque = 0, total = 0;
      for (let y = Math.floor((j + 0.25) * sy); y < Math.ceil((j + 0.75) * sy); y++) for (let x = Math.floor((i + 0.25) * sx); x < Math.ceil((i + 0.75) * sx); x++) {
        const p = (y * bw + x) * 4; total++;
        if (crop[p + 3] < 128) continue;
        opaque++;
        const key = (crop[p] >> 4) << 8 | (crop[p + 1] >> 4) << 4 | crop[p + 2] >> 4, bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
        bin.n++; bin.r += crop[p]; bin.g += crop[p + 1]; bin.b += crop[p + 2]; bins.set(key, bin);
      }
      if (opaque * 2 < total) continue;
      const best = [...bins.values()].sort((a, b) => b.n - a.n)[0];
      tile.data.set([Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n), 255], ((j + oy) * grid + i + ox) * 4);
    }
    // Edge pixels that are still tinted magenta (left over from the colour key) are dropped.
    const at = (x, y) => x < 0 || y < 0 || x >= grid || y >= grid ? 0 : tile.data[(y * grid + x) * 4 + 3];
    for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
      const o = (y * grid + x) * 4, [r, g, b] = [tile.data[o], tile.data[o + 1], tile.data[o + 2]];
      const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      if (tile.data[o + 3] && edge && r > 110 && b > 110 && g < Math.min(r, b) * 0.62 && Math.abs(r - b) < 70) tile.data[o + 3] = 0;
    }
    fs.writeFileSync(path.join(DIR, `png${SUFFIX}`, `${icon.id}.png`), PNG.sync.write(tile));
    if (nw < 6 || nh < 6) problems.push(`${icon.id}: only ${nw}x${nh} pixels (check it)`);
  }
  console.log(`  painted pixel is ${block.toFixed(1)} px; icons sampled to ${grid}x${grid}`);
}

// ---------- the atlas
function pack() {
  const all = sheets.flatMap(s => s.icons.map(parse));
  const rows = Math.ceil(all.length / ATLAS_COLS), atlas = new PNG({ width: ATLAS_COLS * TILE, height: rows * TILE });
  const icons = {}, native = {};
  all.forEach(({ id }, i) => {
    const file = path.join(DIR, `png${SUFFIX}`, `${id}.png`);
    if (!fs.existsSync(file)) { console.log(`  missing ${id}`); return; }
    const tile = PNG.sync.read(fs.readFileSync(file)), ox = (i % ATLAS_COLS) * TILE, oy = Math.floor(i / ATLAS_COLS) * TILE;
    // A native pixel-art icon is enlarged by a whole number with nearest neighbour and centred in its tile
    // (12 pixels become 60, with 2 pixels of margin; the game computes the same numbers, see icons.js).
    const k = tile.width < TILE ? Math.floor(TILE / tile.width) : 1, pad = k > 1 ? (TILE - tile.width * k) >> 1 : 0;
    if (k > 1) native[id] = tile.width;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const sx = Math.floor((x - pad) / k), sy = Math.floor((y - pad) / k);
      if (sx < 0 || sy < 0 || sx >= tile.width || sy >= tile.height) continue;
      atlas.data.set(tile.data.subarray((sy * tile.width + sx) * 4, (sy * tile.width + sx) * 4 + 4), ((oy + y) * atlas.width + ox + x) * 4);
    }
    icons[id] = i;
  });
  fs.writeFileSync(path.join(DIR, `atlas${SUFFIX}.png`), PNG.sync.write(atlas));
  fs.writeFileSync(path.join(DIR, `atlas${SUFFIX}.json`), JSON.stringify({ size: TILE, cols: ATLAS_COLS, icons, native }, null, 1) + '\n');
  console.log(`atlas: ${Object.keys(icons).length} of ${all.length} icons in ${atlas.width}x${atlas.height}`);
}

const [command, ...args] = process.argv.slice(2).filter(a => a !== '--hd');
if (command === 'list') for (const s of sheets) console.log(`${s.id} (${s.icons.length}): ${s.icons.map(l => parse(l).id).join(', ')}`);
else if (command === 'prompt') process.stdout.write(prompt(sheetNamed(args[0]), args.slice(1)));
else if (command === 'slice') slice(sheetNamed(args[0]), args[1]);
else if (command === 'pack') pack();
else { console.error('usage: node tools/icon-sheets.mjs list | prompt <sheet> [refs..] | slice <sheet> <file.png> | pack'); process.exit(1); }
