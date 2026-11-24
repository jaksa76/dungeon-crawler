#!/usr/bin/env node
// Bake compact animation atlases from authored poses for EVERY bestiary kind.
// Run: node tools/monster-animation-art.mjs (Playwright + Chromium required).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { bestiaryKinds } from '../game-2/monsters.js';
import { CLIPS, DIRECTIONS, FRAME_COLUMNS, FRAME_PADDING, FRAME_WIDTH_SCALE } from '../engine2d/monster-animation.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const posePath = kind => `game-2/art/animations/${kind}-keyposes.png`;
const pngData = file => `data:image/png;base64,${fs.readFileSync(path.join(root, file)).toString('base64')}`;
const poseRows = kind => kind === 'snake' ? ['windup', 'impact', 'hurt', 'corpse']
  : ['walk-a', 'walk-b', 'windup', 'impact', 'hurt', 'corpse'];
const sources = Object.fromEntries(bestiaryKinds.map(kind => [kind, {
  base: DIRECTIONS.map(direction => [0, 1, 2, 3].map(d => pngData(`game-2/dungeon/assets/monsters/${kind}/${direction}-d${d}.png`))),
  poses: pngData(posePath(kind)), rows: poseRows(kind),
}]));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const { atlases, metadata } = await page.evaluate(async ({ sources, clips, columns, pad, widthScale, directions }) => {
    const make = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
    const load = src => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
    function extract(keys, kind, rows) {
      const source = make(keys.width, keys.height), sg = source.getContext('2d'); sg.drawImage(keys, 0, 0);
      const pixels = sg.getImageData(0, 0, keys.width, keys.height).data, poses = [];
      // Find separated alpha bands per direction rather than relying on a model
      // placing every row at an exact grid coordinate. Never accept missing poses.
      for (let col = 0; col < 4; col++) {
        const left = Math.floor(col * keys.width / 4), right = Math.floor((col + 1) * keys.width / 4), bands = [];
        for (let y = 0; y < keys.height; y++) {
          let ink = false;
          for (let x = left; x < right; x++) if (pixels[(y * keys.width + x) * 4 + 3] > 32) { ink = true; break; }
          if (!ink) continue;
          const last = bands.at(-1);
          if (last && y - last.bottom < (kind === 'snake' ? 20 : 12)) last.bottom = y; else bands.push({ top: y, bottom: y });
        }
        if (bands.length !== rows.length) throw new Error(`${kind}, ${directions[col]}: expected ${rows.length} separated poses, found ${bands.length}`);
        poses[col] = bands.map(({ top, bottom }) => {
          let x0 = right, x1 = left;
          for (let y = top; y <= bottom; y++) for (let x = left; x < right; x++) if (pixels[(y * keys.width + x) * 4 + 3] > 32) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
          return { x: x0, y: top, w: x1 - x0 + 1, h: bottom - top + 1 };
        });
      }
      return poses;
    }
    const atlases = {}, metadata = {};
    for (const [kind, spec] of Object.entries(sources)) {
      const original = await load(spec.poses), keys = make(original.width, original.height), kg = keys.getContext('2d');
      kg.drawImage(original, 0, 0);
      // Generated alpha mattes can retain a faint background. Quantize them to
      // crisp pixel coverage before extracting bounds or sampling tiny frames.
      const alphaCutoff = kind === 'snake' ? 32 : 224;
      const clean = kg.getImageData(0, 0, keys.width, keys.height);
      for (let i = 3; i < clean.data.length; i += 4) clean.data[i] = clean.data[i] >= alphaCutoff ? 255 : 0;
      kg.putImageData(clean, 0, 0);
      const poses = extract(keys, kind, spec.rows);
      metadata[kind] = { sourceSize: [keys.width, keys.height], alphaCutoff, rows: spec.rows,
        bounds: Object.fromEntries(directions.map((dir, i) => [dir, poses[i]])), depths: [] };
      const index = name => spec.rows.indexOf(name);
      for (let depth = 0; depth < 4; depth++) {
        const images = await Promise.all(spec.base.map(views => load(views[depth])));
        const scale = Math.min(1, [96, 72, 48, 32][depth] / Math.max(images[0].width, images[0].height));
        const bw = Math.max(8, Math.round(images[0].width * scale)), bh = Math.max(8, Math.round(images[0].height * scale));
        const cw = bw * widthScale + 2 * pad, ch = bh + 2 * pad, atlas = make(cw * columns, ch * 4), ag = atlas.getContext('2d');
        ag.imageSmoothingEnabled = false;
        metadata[kind].depths.push({ cell: [cw, ch] });
        for (let direction = 0; direction < 4; direction++) {
          const reference = Math.max(...poses[direction].filter((_, i) => spec.rows[i] !== 'corpse').map(r => r.h));
          let column = 0;
          for (const [state, clip] of Object.entries(clips)) for (let frame = 0; frame < clip.frames; frame++, column++) {
            const c = make(cw, ch), g = c.getContext('2d'); g.imageSmoothingEnabled = false;
            const base = images[direction];
            const drawBase = (sx = 1, sy = 1, dx = 0) => g.drawImage(base, (cw - bw * sx) / 2 + dx, ch - pad - bh * sy, bw * sx, bh * sy);
            const drawPose = (name, heightScale = 1, dx = 0) => {
              const p = poses[direction][index(name)];
              const k = Math.min((cw - 2) / p.w, bh / reference);
              const w = Math.max(1, Math.round(p.w * k)), h = Math.max(1, Math.round(p.h * k * heightScale));
              g.drawImage(keys, p.x, p.y, p.w, p.h, Math.floor((cw - w) / 2) + dx, ch - pad - h, w, h);
            };
            // The base views (<direction>-d*.png) only size the cells, except for the snake: they are slimmer than
            // the authored poses, so standing, recovering and breathing all use the walk pose instead.
            const snake = kind === 'snake';
            const stand = (scale = 1, dx = 0) => snake ? drawBase(scale, scale, dx) : drawPose('walk-a', scale, dx);
            const authored = !snake || (state !== 'idle' && state !== 'move');
            if (state === 'idle') snake ? drawBase(frame ? 1.015 : 1, frame ? 1.01 : 1) : drawPose('walk-a', frame ? 1.01 : 1);
            else if (state === 'move' && kind === 'snake') {
              for (let y = 0; y < bh; y++) {
                const offset = Math.round(Math.sin(y / bh * Math.PI * 2 + frame * Math.PI / 2) * (depth > 1 ? 1 : 2));
                g.drawImage(base, 0, y * base.height / bh, base.width, base.height / bh, (cw - bw) / 2 + offset, pad + y - (frame % 2 ? 1 : 0), bw, 1);
              }
            } else if (state === 'move') drawPose(frame % 2 ? 'walk-b' : 'walk-a', frame < 2 ? 1 : .98);
            else if (state === 'attack') {
              if (frame === 3) stand(); else drawPose(frame < 2 ? 'windup' : 'impact', frame === 0 ? .96 : 1);
            } else if (state === 'hurt') {
              if (frame === 0) drawPose('hurt'); else stand(.98, 1);
            } else if (state === 'dead') {
              drawPose(frame < 2 ? 'hurt' : 'corpse', frame === 1 ? .55 : 1);
            }
            // Existing snake art is pre-shaded; shade ALL authored snake poses
            // exactly once. Other species receive the scene's runtime fog.
            if (kind === 'snake' && authored) {
              const data = g.getImageData(0, 0, cw, ch), d = data.data, dim = [1, .8, .4, .15][depth];
              // Recovery uses the already distance-shaded base frame.
              if (!((state === 'attack' && frame === 3) || (state === 'hurt' && frame === 1))) {
                for (let i = 0; i < d.length; i += 4) {
                  const eye = d[i] > 100 && d[i] > d[i + 1] * 1.8 && d[i] > d[i + 2] * 1.8;
                  const fang = d[i] > 160 && d[i + 1] > 150 && d[i + 2] > 80;
                  const k = eye ? 1 : fang && state !== 'dead' ? Math.max(.65, dim) : dim;
                  d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
                }
                g.putImageData(data, 0, 0);
              }
            }
            if (state === 'hurt') { g.globalCompositeOperation = 'source-atop'; g.fillStyle = frame ? '#ff6a5a40' : '#ff6a5a80'; g.fillRect(0, 0, cw, ch); }
            ag.drawImage(c, column * cw, direction * ch);
          }
        }
        atlases[`game-2/dungeon/assets/monsters/${kind}/animation-d${depth}.png`] = atlas.toDataURL();
      }
    }
    return { atlases, metadata };
  }, { sources, clips: CLIPS, columns: FRAME_COLUMNS, pad: FRAME_PADDING, widthScale: FRAME_WIDTH_SCALE, directions: DIRECTIONS });
  // Do not write any runtime images until every creature passes extraction.
  for (const [file, data] of Object.entries(atlases)) fs.writeFileSync(path.join(root, file), Buffer.from(data.split(',')[1], 'base64'));
  for (const kind of bestiaryKinds) Object.assign(metadata[kind], {
    source: posePath(kind), sha256: createHash('sha256').update(fs.readFileSync(path.join(root, posePath(kind)))).digest('hex'),
  });
  fs.writeFileSync(path.join(root, 'game-2/art/animations/keyposes.json'), JSON.stringify({ directions: DIRECTIONS, monsters: metadata }, null, 2) + '\n');
  console.log(`Baked ${Object.keys(atlases).length} atlases from authored poses for all ${bestiaryKinds.length} monsters.`);
} finally { await browser.close(); }
