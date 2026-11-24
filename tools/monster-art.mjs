#!/usr/bin/env node
// Monster sprite sheets for the engine's bestiary (and a campaign's own creatures), painted by Codex.
//
//   node tools/monster-art.mjs list
//   node tools/monster-art.mjs prompt <id>               the prompt for the image model (attach art/ravensmoor/painted/monsters-snake.png as style)
//   node tools/monster-art.mjs slice <id> <sheet.png> <heightTiles>
//                                                        key out the magenta, cut the four views, write the runtime PNGs
//
// A sheet is 1536x1024 on flat magenta: four equal columns, left to right front, back, left, right (left/right = facing
// that side of the screen). `slice` scales all four views by one factor so the tallest view fills the d0 card, stands
// them on a common baseline, and writes <direction>-d0..d3.png to the creature's art folder (engine/assets/monsters/<id>/, or the campaign's when
// the creature is the campaign's; see tools/content.mjs). The farther
// frames are the d0 frame shrunk (distance fog is applied at runtime, so monsters need no `distanceShaded`).
// It prints the world width `w` to use in the monster definition. Needs only pngjs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, books, artDir } from './content.mjs';
const { PNG } = createRequire(import.meta.url)('pngjs');
const { monsters } = JSON.parse(fs.readFileSync(path.join(ROOT, 'art/engine/monsters/roster.json'), 'utf8'));
const DIRECTIONS = ['front', 'back', 'left', 'right'];
const PX_PER_TILE = 250;              // d0 card pixels per world tile (the snake: 224px for 0.9)
const SCALES = [1, 72 / 104, 48 / 104, 28 / 104]; // d0..d3, as the snake's cards

const [mode, id, file, heightArg] = process.argv.slice(2);
const find = () => { const m = monsters.find(m => m.id === id); if (!m) throw new Error(`no monster "${id}"; try: ${monsters.map(m => m.id).join(', ')}`); return m; };

if (mode === 'list') console.log(monsters.map(m => `${m.id}: ${m.title}`).join('\n'));
else if (mode === 'prompt') {
  const m = find();
  console.log(`$imagegen Use your image generation tool to create ONE image, and save it in the current directory as sheet-${m.id}.png (copy the generated file there if the tool saves it elsewhere; do not overwrite other files). Then reply with just the saved file name.

A monster sprite sheet for a retro fantasy dungeon-crawler RPG (first-person, Dungeons & Dragons style). The monster: ${m.title} - ${m.look}.
Style: the attached image is a finished sprite sheet of another monster (a snake). Match it exactly: pixel-art look like an early-1990s CRPG, chunky visible pixel blocks, crisp dark outlines, rich limited palette, soft lighting from the top left, menacing. Do NOT copy its subject or its layout.

Canvas 1536x1024. The whole background is one flat, solid, pure magenta (#FF00FF): no gradient, no texture, no vignette, no ground shadow, no glow, because it will be removed with a colour key. Never use magenta or hot pink inside the monster.

Layout: exactly 4 columns, one monster per column, left to right, each column 384 pixels wide and the full height. It is the SAME single monster in all four columns, same size, same design, same colours, same pose, standing upright on an invisible ground line, feet at about the same height in every column, each fully inside its column with clear magenta margin and not touching the neighbours or the edges:
1. front view: facing the viewer, straight on.
2. back view: seen from behind, facing directly away (no face visible).
3. left view: profile, facing the LEFT side of the image.
4. right view: profile, facing the RIGHT side of the image.
Each fills about 85% of the column height. No text, no labels, no grid lines, no frames, no extra objects.
`);
} else if (mode === 'slice') {
  const m = find(), heightTiles = parseFloat(heightArg);
  if (!file || !(heightTiles > 0)) throw new Error('Usage: slice <id> <sheet.png> <heightTiles>');
  const sheet = PNG.sync.read(fs.readFileSync(file));
  const { width: W, height: H, data } = sheet;
  // magenta -> transparent, with the fringe softened
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const mag = Math.min(r, b) - g;
    if (mag > 110 && r > 150 && b > 150) data[i + 3] = 0;
    else if (mag > 60 && r > 120 && b > 120) { data[i + 3] = Math.round(255 * (110 - mag) / 50); data[i] = Math.min(r, g + 40); data[i + 2] = Math.min(b, g + 40); }
  }
  const views = DIRECTIONS.map((direction, c) => {
    const x0 = Math.floor(c * W / 4), x1 = Math.floor((c + 1) * W / 4);
    let left = x1, right = x0, top = H, bottom = 0, ink = 0;
    for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) if (data[(y * W + x) * 4 + 3] > 16) {
      ink++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (ink < 400) throw new Error(`The ${direction} view is empty.`);
    return { direction, x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  });
  const tallest = Math.max(...views.map(v => v.h)), widest = Math.max(...views.map(v => v.w));
  const cardH = Math.round(heightTiles * PX_PER_TILE), scale = (cardH - 4) / tallest;
  const cardW = Math.round(widest * scale) + 4;
  const resample = (src, sx, sy, sw, sh, dw, dh) => { // area average, premultiplied
    const out = new PNG({ width: dw, height: dh });
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const ax = sx + x * sw / dw, bx = sx + (x + 1) * sw / dw, ay = sy + y * sh / dh, by = sy + (y + 1) * sh / dh;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = Math.floor(ay); yy < Math.ceil(by); yy++) for (let xx = Math.floor(ax); xx < Math.ceil(bx); xx++) {
        const wgt = (Math.min(bx, xx + 1) - Math.max(ax, xx)) * (Math.min(by, yy + 1) - Math.max(ay, yy));
        if (wgt <= 0 || xx < 0 || yy < 0 || xx >= src.width || yy >= src.height) continue;
        const i = (yy * src.width + xx) * 4, al = src.data[i + 3] / 255 * wgt;
        r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al; a += al; n += wgt;
      }
      const o = (y * dw + x) * 4;
      if (a > 0) { out.data[o] = r / a; out.data[o + 1] = g / a; out.data[o + 2] = b / a; }
      out.data[o + 3] = n ? Math.round(255 * Math.min(1, a / n)) : 0;
    }
    return out;
  };
  const dir = books.monsters[m.id] ? artDir(books.monsters[m.id]) : path.join(ROOT, 'engine/assets/monsters', m.id); fs.mkdirSync(dir, { recursive: true });
  for (const v of views) {
    const w = Math.round(v.w * scale), h = Math.round(v.h * scale);
    const body = resample(sheet, v.x, v.y, v.w, v.h, w, h);
    SCALES.forEach((k, d) => {
      const cw = Math.max(1, Math.round(cardW * k)), ch = Math.max(1, Math.round(cardH * k));
      const card = new PNG({ width: cw, height: ch });
      const sw = Math.max(1, Math.round(w * k)), sh = Math.max(1, Math.round(h * k));
      const small = d ? resample(body, 0, 0, w, h, sw, sh) : body;
      PNG.bitblt(small, card, 0, 0, Math.min(sw, cw), Math.min(sh, ch), Math.max(0, Math.floor((cw - sw) / 2)), Math.max(0, ch - sh - Math.round(2 * k)));
      fs.writeFileSync(path.join(dir, `${v.direction}-d${d}.png`), PNG.sync.write(card));
    });
  }
  console.log(`${m.id}: 16 PNGs in ${path.relative(ROOT, dir)}; card ${cardW}x${cardH}; use h: ${heightTiles}, w: ${(cardW / PX_PER_TILE).toFixed(2)}`);
} else throw new Error('Usage: node tools/monster-art.mjs list | prompt <id> | slice <id> <sheet.png> <heightTiles>');
