// Pixel-level validation of all authored runtime frames. No web server needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { bestiaryKinds } from '../../game-2/monsters.js';
import { FRAME_LAYOUT, FRAME_COLUMNS, DIRECTIONS } from '../../engine2d/monster-animation.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const files = bestiaryKinds.flatMap(kind => [0, 1, 2, 3].map(depth => ({ kind, depth,
    data: `data:image/png;base64,${fs.readFileSync(new URL(`../../game-2/dungeon/assets/monsters/${kind}/animation-d${depth}.png`, import.meta.url)).toString('base64')}`,
  })));
  const metrics = await page.evaluate(async ({ files, layout, columns, directions }) => {
    const result = [];
    for (const file of files) {
      const img = await new Promise(resolve => { const i = new Image(); i.onload = () => resolve(i); i.src = file.data; });
      const w = img.width / columns, h = img.height / directions.length;
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      for (let row = 0; row < directions.length; row++) {
        const frames = {};
        for (const [state, spec] of Object.entries(layout)) {
          frames[state] = [];
          for (let frame = 0; frame < spec.frames; frame++) {
            g.clearRect(0, 0, w, h); g.drawImage(img, (spec.column + frame) * w, row * h, w, h, 0, 0, w, h);
            const pixels = g.getImageData(0, 0, w, h).data;
            let count = 0, top = h, bottom = -1, hash = 2166136261;
            for (let i = 0; i < pixels.length; i += 4) {
              if (pixels[i + 3] >= 128) {
                count++; top = Math.min(top, Math.floor(i / 4 / w)); bottom = Math.max(bottom, Math.floor(i / 4 / w));
              }
              for (let j = 0; j < 4; j++) hash = Math.imul(hash ^ pixels[i + j], 16777619) >>> 0;
            }
            frames[state].push({ count, height: bottom - top + 1, hash });
          }
        }
        result.push({ kind: file.kind, depth: file.depth, direction: directions[row], frames });
      }
    }
    return result;
  }, { files, layout: FRAME_LAYOUT, columns: FRAME_COLUMNS, directions: DIRECTIONS });
  for (const { kind, depth, direction, frames } of metrics) {
    const label = `${kind}/${direction}/d${depth}`;
    for (const [state, list] of Object.entries(frames)) for (const frame of list)
      assert.ok(frame.count > 3, `${label}/${state} must not be blank`);
    assert.notEqual(frames.move[0].hash, frames.move[1].hash, `${label}: walking strides must differ`);
    assert.notEqual(frames.attack[1].hash, frames.attack[2].hash, `${label}: anticipation and impact must differ`);
    assert.notEqual(frames.dead[3].hash, frames.idle[0].hash, `${label}: corpse must be an extra pose`);
    assert.ok(frames.dead[3].height < frames.idle[0].height * .85, `${label}: corpse must have a collapsed silhouette`);
  }
  console.log(`Verified all animation frames for ${bestiaryKinds.length} monsters × 4 directions × 4 distances.`);
} finally { await browser.close(); }
