// Paint views of the 3x3 courtyard with ComfyUI.
//
//   node generate.mjs --view 2,3,N             one view
//   node generate.mjs --all                    all 36 views (skips ones that already exist unless --force)
//   options: --seed n  --out dir  --work dir  --depth 0.5  --depth-end 0.55  --style 0.45  --tag name
//
// Output: <out>/x<X>z<Z>-<N|E|S|W>.png (default game-1/assets/views). Guides go to <work> (temporary).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { cells, DIRS } from './courtyard.mjs';
import { buildScene, png, VIEW } from './scene.mjs';
import { upload, run, viewWorkflow } from './comfy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i < 0 ? dflt : args[i + 1]; };
const flag = (name) => args.includes(`--${name}`);

const outDir = path.resolve(opt('out', path.join(root, 'game-1', 'assets', 'views')));
const workDir = path.resolve(opt('work', path.join(here, '.work')));
const tag = opt('tag', '');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(workDir, { recursive: true });

const PROMPT = 'pixel art, hi-bit pixel art, 16-bit fantasy RPG screenshot, first-person view down a medieval village courtyard at night, ' +
  'purple moonlit night, warm orange lantern glow, rich saturated colours, dark outlines, detailed, cosy and lived-in, ' +
  'half-timbered houses with dark timber frames and cream plaster, tiled roofs, glowing windows, hanging signs and lanterns, flower boxes, ivy, wet cobblestones';
const LEAN = 'pixel art, first-person view down a medieval village courtyard at night, moonlit';
const NEGATIVE = '3d render, photo, realistic, blurry, smooth gradients, text, watermark, ui, hud, frame, border, grey, desaturated, ' +
  'dull, flat lighting, perspective distortion, deformed, extra limbs, duplicate, brick wall, plain stone wall, grey bricks';

// style reference: the middle of the concept art's scene (the UI bar cut off), made square
async function styleRef() {
  const p = path.join(workDir, 'style-ref.png');
  if (!fs.existsSync(p)) {
    const src = PNG.sync.read(fs.readFileSync(path.join(root, 'docs', 'concept-toonish.png')));
    const h = 840, x0 = Math.floor((src.width - h) / 2);
    const out = new PNG({ width: h, height: h });
    PNG.bitblt(src, out, x0, 0, h, h, 0, 0);
    fs.writeFileSync(p, PNG.sync.write(out));
  }
  return upload('views-style-ref.png', fs.readFileSync(p));
}

const nameOf = (c, d) => `x${c.x}z${c.z}-${DIRS[d]}`;

async function paint(c, d, ref) {
  const name = nameOf(c, d) + (tag ? `-${tag}` : '');
  const scene = buildScene(c.x, c.z, d);
  fs.writeFileSync(path.join(workDir, `${name}.depth.png`), png(scene.depthPng));
  const depth = await upload(`views-${name}-depth.png`, png(scene.depthPng));
  const regions = [];
  for (const r of scene.regions) {
    fs.writeFileSync(path.join(workDir, `${name}.mask-${r.id}.png`), png(r.png));
    regions.push({ text: r.text, mask: await upload(`views-${name}-${r.id}.png`, png(r.png)) });
  }
  const wf = viewWorkflow({
    size: { w: VIEW.W, h: VIEW.H }, prompt: flag('lean') ? LEAN : PROMPT, negative: NEGATIVE, regions, depth, styleRef: Number(opt('style', 0.45)) > 0 ? ref : null,
    seed: Number(opt('seed', 1)), depthStrength: Number(opt('depth', 0.65)), depthEnd: Number(opt('depth-end', 0.6)),
    styleWeight: Number(opt('style', 0.45)), lora: Number(opt('lora', 1)), steps: Number(opt('steps', 30)),
  });
  const t0 = Date.now();
  let img;
  for (let attempt = 1; ; attempt++) { // another job on the same GPU can make a run fail: wait and retry
    try { img = await run(wf); break; } catch (e) {
      if (attempt >= 4) throw e;
      console.log(`${name}: attempt ${attempt} failed (${e.message.slice(0, 80)}), retrying in 60s`);
      await new Promise((r) => setTimeout(r, 60e3));
    }
  }
  fs.writeFileSync(path.join(outDir, `${name}.png`), img);
  console.log(`${name}.png  ${((Date.now() - t0) / 1000).toFixed(0)}s  sees: ${scene.describe.join('; ') || 'nothing'}`);
}

const ref = await styleRef();
if (flag('all')) {
  for (const c of cells) for (let d = 0; d < 4; d++) {
    if (!flag('force') && fs.existsSync(path.join(outDir, `${nameOf(c, d)}${tag ? '-' + tag : ''}.png`))) continue;
    await paint(c, d, ref);
  }
} else {
  const [x, z, dir] = opt('view', '2,3,N').split(',');
  await paint({ x: +x, z: +z }, DIRS.indexOf(dir), ref);
}
