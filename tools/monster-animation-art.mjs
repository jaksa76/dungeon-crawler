#!/usr/bin/env node
// Bake compact, nearest-neighbour animation atlases from the existing art.
// Snake combat key poses are painted; other motions preserve each base sprite.
// Run: node tools/monster-animation-art.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { bestiaryKinds } from '../game-2/monsters.js';
import { CLIPS, DIRECTIONS, FRAME_COLUMNS, FRAME_PADDING } from '../engine2d/monster-animation.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pngData = file => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
const sources = Object.fromEntries(bestiaryKinds.map(kind => [kind, DIRECTIONS.map(direction => [0, 1, 2, 3].map(d =>
  pngData(path.join(root, `game-2/dungeon/assets/monsters/${kind}/${direction}-d${d}.png`))))]));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const output = await page.evaluate(async ({ sources, keypose, clips, columns, pad }) => {
    const make = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
    const load = src => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
    const keys = await load(keypose), source = make(keys.width, keys.height), sg = source.getContext('2d');
    sg.drawImage(keys, 0, 0); const pixels = sg.getImageData(0, 0, keys.width, keys.height).data;
    const poses = [];
    for (let col = 0; col < 4; col++) {
      const left = Math.floor(col * keys.width / 4), right = Math.floor((col + 1) * keys.width / 4), bands = [];
      for (let y = 0; y < keys.height; y++) {
        let ink = false;
        for (let x = left; x < right; x++) if (pixels[(y * keys.width + x) * 4 + 3] > 16) { ink = true; break; }
        if (!ink) continue;
        const last = bands.at(-1);
        if (last && y - last.bottom < 20) last.bottom = y; else bands.push({ top: y, bottom: y });
      }
      if (bands.length !== 4) throw new Error(`Snake column ${col}: expected four key poses, found ${bands.length}`);
      poses[col] = bands.map(({ top, bottom }) => {
        let x0 = right, x1 = left;
        for (let y = top; y <= bottom; y++) for (let x = left; x < right; x++) if (pixels[(y * keys.width + x) * 4 + 3] > 16) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
        return { x: x0, y: top, w: x1 - x0 + 1, h: bottom - top + 1 };
      });
    }
    const out = {};
    for (const [kind, directions] of Object.entries(sources)) for (let depth = 0; depth < 4; depth++) {
      const images = await Promise.all(directions.map(views => load(views[depth])));
      const scale = Math.min(1, [96, 72, 48, 32][depth] / Math.max(images[0].width, images[0].height));
      const bw = Math.max(8, Math.round(images[0].width * scale)), bh = Math.max(8, Math.round(images[0].height * scale));
      const cw = bw + 2 * pad, ch = bh + 2 * pad, atlas = make(cw * columns, ch * 4), ag = atlas.getContext('2d');
      ag.imageSmoothingEnabled = false;
      for (let direction = 0; direction < 4; direction++) {
        let column = 0;
        for (const [state, clip] of Object.entries(clips)) for (let frame = 0; frame < clip.frames; frame++, column++) {
          const c = make(cw, ch), g = c.getContext('2d'); g.imageSmoothingEnabled = false;
          const base = images[direction], phase = frame * Math.PI / 2;
          const drawBase = (sx = 1, sy = 1, dx = 0, dy = 0) => g.drawImage(base, pad + (bw - bw * sx) / 2 + dx, ch - pad - bh * sy + dy, bw * sx, bh * sy);
          const drawPose = (index, heightScale = 1) => {
            const p = poses[direction][index], reference = Math.max(...poses[direction].slice(0, 3).map(r => r.h));
            const k = Math.min((cw - 2) / p.w, bh / reference);
            const w = Math.max(1, Math.round(p.w * k)), h = Math.max(1, Math.round(p.h * k * heightScale));
            g.drawImage(keys, p.x, p.y, p.w, p.h, Math.floor((cw - w) / 2), ch - pad - h, w, h);
          };
          if (kind === 'snake' && ['attack', 'hurt', 'dead'].includes(state)) {
            if (state === 'attack') frame === 3 ? drawBase() : drawPose(frame < 2 ? 0 : 1, frame === 0 ? .94 : 1);
            if (state === 'hurt') frame === 0 ? drawPose(2) : drawBase(.98, .98, 1);
            if (state === 'dead') frame === 0 ? drawPose(2) : frame === 1 ? drawPose(2, .55) : drawPose(3);
            // The original snake has distance-specific darkness and red eye points.
            const data = g.getImageData(0, 0, cw, ch), d = data.data, dim = [1, .8, .4, .15][depth];
            for (let i = 0; i < d.length; i += 4) {
              const eye = d[i] > 100 && d[i] > d[i + 1] * 1.8 && d[i] > d[i + 2] * 1.8;
              const fang = d[i] > 160 && d[i + 1] > 150 && d[i + 2] > 80;
              const k = eye ? 1 : fang && state !== 'dead' ? Math.max(.65, dim) : dim;
              d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
            }
            g.putImageData(data, 0, 0);
          } else if (state === 'idle') {
            drawBase(frame ? 1.015 : 1, frame ? 1.01 : 1);
          } else if (state === 'move') {
            // Row-wise pixel displacement gives the snake a travelling body wave
            // and the other bodies a readable alternate step without repainting them.
            for (let y = 0; y < bh; y++) {
              const offset = Math.round(Math.sin(y / bh * Math.PI * (kind === 'snake' ? 2 : 1) + phase) * (depth > 1 ? 1 : 2));
              g.drawImage(base, 0, y * base.height / bh, base.width, base.height / bh, pad + offset, pad + y - (frame % 2 ? 1 : 0), bw, 1);
            }
          } else if (state === 'attack') {
            const s = [ .95, .92, 1.06, 1 ][frame];
            drawBase(s, [1.02, 1.04, .97, 1][frame], direction > 1 ? (direction === 2 ? -1 : 1) * [0, -1, 3, 0][frame] : 0);
          } else if (state === 'hurt') {
            drawBase(1, 1, frame ? 1 : -1);
          } else {
            // Settle the existing body onto the floor, keeping the final corpse
            // present rather than fading an upright sprite immediately away.
            const angle = [0, .55, 1.15, Math.PI / 2][frame];
            const rw = Math.abs(bw * Math.cos(angle)) + Math.abs(bh * Math.sin(angle));
            const rh = Math.abs(bh * Math.cos(angle)) + Math.abs(bw * Math.sin(angle));
            const k = Math.min(1, (cw - 2) / rw);
            g.save(); g.translate(cw / 2, ch - pad - rh * k / 2); g.rotate(angle);
            g.drawImage(base, -bw * k / 2, -bh * k / 2, bw * k, bh * k); g.restore();
          }
          if (state === 'hurt') { g.globalCompositeOperation = 'source-atop'; g.fillStyle = frame ? '#ff6a5a40' : '#ff6a5a80'; g.fillRect(0, 0, cw, ch); }
          ag.drawImage(c, column * cw, direction * ch);
        }
      }
      out[`game-2/dungeon/assets/monsters/${kind}/animation-d${depth}.png`] = atlas.toDataURL();
    }
    return out;
  }, { sources, keypose: pngData(path.join(root, 'game-2/art/animations/snake-keyposes.png')), clips: CLIPS, columns: FRAME_COLUMNS, pad: FRAME_PADDING });
  for (const [file, data] of Object.entries(output)) fs.writeFileSync(path.join(root, file), Buffer.from(data.split(',')[1], 'base64'));
  console.log(`Baked ${Object.keys(output).length} animation atlases from the existing bestiary.`);
} finally { await browser.close(); }
