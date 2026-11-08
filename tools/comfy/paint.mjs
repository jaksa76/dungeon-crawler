// `studio2d paint`: repaint a guide sheet with the local ComfyUI (image-to-image, SDXL or Flux).
// What each sheet shows comes from its entry in docs/art-prompts-2d.md; the look is STYLE / FLUX_STYLE below.
import fs from 'node:fs';
import path from 'node:path';
import { generate } from './client.mjs';
import { img2img, fluxImg2img } from './workflows.mjs';
import { groundRamp } from './ramp.mjs';
import { cobbleGuide } from './cobbles.mjs';
import { DEFAULT_VIEW } from '../../engine2d/view.js';

// SDXL reads keywords, not the chat-style preamble in the doc.
export const STYLE = 'hi-bit pixel art, chunky visible pixels, detailed, rich limited palette, warm wood plaster and stone, '
  + 'moonlit night with deep purple-blue shadows, warm golden window light, first-person fantasy RPG, mature heroic medieval fantasy';
export const NEGATIVE = 'photo, 3d render, realistic, blurry, smooth gradient, text, letters, watermark, signature, border, frame, '
  + 'magenta, pink, purple roof, faces, eyes, creatures, characters, UI, extra buildings, different building, sky, ground, background scenery';
// Flux reads sentences and has no negative prompt. The key colour is deliberately not mentioned: it tints the scene.
export const FLUX_STYLE = 'A hand-painted hi-bit pixel art sheet for a first-person medieval fantasy RPG, with clearly visible chunky pixels '
  + 'and a rich but limited palette: warm wood, plaster and stone under a moonlit night with cool purple-blue shadows, and warm golden '
  + 'light glowing from the windows and lanterns. Every panel keeps the layout, outlines and perspective of the reference exactly, '
  + 'and the plain flat background around the painted objects stays plain.';

// Sheet name -> what it shows, read from the "**`name`**" + blockquote entries of the doc.
export function sheetPrompts(doc) {
  const out = {};
  for (const m of doc.matchAll(/^\*\*`([^`]+)`\*\*[ \t]*\r?\n((?:>.*(?:\r?\n|$))+)/gm)) {
    out[m[1]] = m[2].split(/\r?\n/).map((l) => l.replace(/^>\s?/, '')).join(' ').trim();
  }
  return out;
}

function subjectOf(sheet, doc) {
  const text = sheetPrompts(doc)[sheet];
  if (!text) throw new Error(`no prompt for "${sheet}" in docs/art-prompts-2d.md`);
  return text.replace(/\bPanels? [\d–, -]+:\s*/g, '').replace(/^Same style,?\s*/i, '').replace(/\bKeep the magenta[^.]*\.\s*/gi, '');
}

// The floor is painted as a picture of the ground, never as a repainted tile texture: the guide only
// says where the horizon is (it is blurred first), so nothing of its projected cobbles survives.
// Whatever is painted above the horizon is replaced by the key colour afterwards.
export const FLOOR = {
  sdxl: 'hand-painted hi-bit pixel art, chunky visible pixels, painterly brushwork, first-person fantasy RPG, the bare cobblestone ground '
    + 'of a medieval town square at night seen from eye height, one-point perspective, horizon across the middle, perfectly flat paved ground '
    + 'covered with large irregular rounded grey-purple flagstones with dark mossy gaps, the flagstones in the lower foreground are big and they '
    + 'get steadily smaller and more varied towards the horizon, warm golden lantern light pooling near the viewer, cool moonlit sheen on wet '
    + 'stones further away, a few small patches of green moss, empty ground, dark blue night sky above',
  negative: 'grid, regular pattern, repeating tiles, texture sample, brick wall, text, letters, watermark, signature, border, frame, buildings, houses, '
    + 'people, characters, creatures, furniture, barrel, well, lamp post, drain, manhole, stairs, steps, arc, circular pattern, path, road, hill, '
    + 'terrain, rubble, tiny pebbles, mosaic, photo, 3d render, smooth gradient, blurry',
  // Small rounded fieldstones in the buildings' warm palette (stones about 8-9 across the foreground, a lumpy fieldstone
  // look, no brick or grid wording: 'strict rows' made Flux paint a grid of slabs). Flux still paints a tree line along
  // the horizon; the game never shows that strip, so it is keyed out of the sheet (see docs/art-prompts-2d.md).
  flux: 'A hand-painted hi-bit pixel art illustration for a first-person medieval fantasy RPG: the bare cobblestone ground of ' +
    'an old town square, seen from standing eye height in strict one-point perspective, with the horizon across the middle ' +
    'of the picture. The ground is paved with many small, densely packed, irregular rounded fieldstone cobbles, each ' +
    'roughly the size of a loaf of bread, so that about eight or nine stones span the whole width of the picture along its ' +
    'bottom edge, and the stones shrink steadily with distance towards the horizon. The cobbles are lumpy, rounded polygons ' +
    'of many different shapes and sizes, tightly fitted together with narrow dark grout, never rectangular bricks and never ' +
    'laid in neat rows. Every stone is dusty warm plum-mauve, rose-grey or warm brown-grey, with lighter peach and pink ' +
    'highlights on the top edges and deeper aubergine-brown shadows in the gaps; the whole floor is lit evenly by soft warm ' +
    'lamplight, with no dark vignette and no single bright spot, and only a few small tufts of olive moss between stones. ' +
    'The palette matches terracotta roofs, orange-brown timber beams, cream plaster and glowing amber windows: warm purple, ' +
    'rose and brown only, no blue, no teal, no slate grey. Chunky visible pixels, painterly brushwork, a rich limited ' +
    'palette. Nothing stands on the ground: no objects, people or buildings. The cobbles continue all the way to the far ' +
    'horizon, where the tiny distant stones meet a plain flat band of dusky purple haze; there are no trees, buildings, ' +
    'hills or objects anywhere.',
  // For --cobbles (small cobbles, about twelve across the bottom edge, like the concept art's paving; the flux text above
  // gave about five). Count and size are enforced by the generated guide at denoise 0.70, not by this wording; the
  // 'one colour family' sentence keeps the stones from splitting into orange and grey halves.
  fluxCobbles: 'A hand-painted hi-bit pixel art illustration for a first-person medieval fantasy RPG: the bare cobblestone ground of ' +
    'an old town square, seen from standing eye height in strict one-point perspective, with the horizon across the middle of ' +
    'the picture. The ground is paved with a great many small, densely packed, irregular rounded fieldstone cobbles, each ' +
    'roughly the size of an apple or a fist, so that about twelve to fourteen stones span the whole width of the picture ' +
    'along its bottom edge, and the stones shrink steadily with distance towards the horizon. The cobbles are lumpy, rounded ' +
    'polygons of many different shapes and sizes, tightly fitted together with narrow dark grout, never rectangular bricks and ' +
    'never laid in neat rows. All the stones belong to one calm colour family of dusty warm rose-mauve and warm grey-brown, ' +
    'differing from each other only slightly in lightness, with soft peach highlights on the top edges and deep aubergine-brown ' +
    'shadows in the gaps; there are no orange stones, no red stones and no bright colours, and only a few small tufts of olive ' +
    'moss between the stones. The whole floor is lit evenly by soft warm lamplight, with no dark vignette and no single bright ' +
    'spot. The palette sits comfortably next to terracotta roofs, orange-brown timber beams, cream plaster and glowing amber ' +
    'windows: warm purple, rose and brown only, no blue, no teal, no slate grey. Chunky visible pixels, painterly brushwork, a ' +
    'rich limited palette. Nothing stands on the ground: no objects, people or buildings. The cobbles continue all the way to ' +
    'the far horizon, where the tiny distant stones meet a plain flat band of dusky purple haze; there are no trees, buildings, ' +
    'hills or objects anywhere.',
};

export const promptFor = (sheet, doc, model = 'sdxl') =>
  sheet === 'floor' ? FLOOR[model] : model === 'flux' ? `${FLUX_STYLE} ${subjectOf(sheet, doc)}` : `${STYLE}. ${subjectOf(sheet, doc)}`;

const pngSize = (b) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
const DEFAULTS = { sdxl: { denoise: 0.52, steps: 30 }, flux: { denoise: 0.62, steps: 20 } };
// With ControlNet / IP-Adapter on, the add-ons hold the layout and the look, so the denoise can be much higher.
const CONDITIONED = { denoise: 0.75, steps: 28 };
const DEFAULT_REF = 'game-2/art/ref/concept-houses.png';
// The floor starts from a heavily blurred guide at a very high denoise: a new picture, not a repaint.
const FLOOR_DEFAULTS = { denoise: 0.95, initBlur: 31 };
// --cobbles: the guide is a generated plane of many small cobbles (cobbles.mjs); Flux keeps its count and size
// only at a moderate denoise, and the guide must not be blurred.
const COBBLE_DEFAULTS = { denoise: 0.70, initBlur: 0 };
const FLOOR_REF = 'game-2/art/ref/concept-ground.png';

// argv: <sheet> [--model flux|sdxl] [--denoise N] [--seed N] [--steps N] [--cfg N (sdxl)] [--guidance N (flux)]
//       [--lora N|off (sdxl)] [--init-blur N] [--prompt text|@file] [--guide file] [--out file] [--slice]
//       floor + flux only: [--cobbles SEED [--cobble-size F]]  paint over a generated guide of many small cobbles
//                          (tools/comfy/cobbles.mjs, saved as game-2/art/guides/floor-cobbles.png), denoise 0.70, no blur: the
//                          cobbles stay small. F scales the guide's cells (default 1, which gives about 8 stones across the
//                          bottom row; at 0.78 Flux still painted the foreground stones the same size and only the far rows
//                          got denser). Then: python tools/comfy/grade-floor.py (colour + horizon cut), then slice.
//       sdxl only: [--controlnet STRENGTH [--canny-low N] [--canny-high N] [--blur N] [--cn-end N]
//                                         [--control image|ramp] [--cn-type TYPE]]
//                  [--ipadapter WEIGHT [--ref image] [--ip-type TYPE] [--ip-end N]]
// The floor sheet is painted as a picture (see FLOOR): blurred guide, denoise 0.95, and with --controlnet a
// depth ramp of a flat ground plane (--control ramp, the default there) that fixes the horizon.
export async function paintSheet(argv, root) {
  const flags = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) pos.push(argv[i]);
    else if (argv[i] === '--slice' || argv[i] === '--px') flags[argv[i].slice(2)] = true;
    else flags[argv[i].slice(2)] = argv[++i];
  }
  const [sheet] = pos;
  if (flags.px) return (await import('./paint-px.mjs')).paintPxSheet(flags, sheet, root); // the pixel slice (docs/pixel-slice.md)
  if (!sheet) throw new Error('usage: paint <sheet> [--model flux|sdxl] [--denoise N] [--seed N] [--steps N] [--cfg N] [--guidance N] [--lora N|off] [--controlnet N] [--ipadapter N] [--ref image] [--out file] [--slice]');
  const conditioned = flags.controlnet !== undefined || flags.ipadapter !== undefined;
  const model = flags.model ?? (conditioned ? 'sdxl' : 'flux');
  if (!DEFAULTS[model]) throw new Error(`unknown --model "${model}" (flux or sdxl)`);
  if (conditioned && model !== 'sdxl') throw new Error('--controlnet and --ipadapter work with --model sdxl only');
  if (flags.ref !== undefined && flags.ipadapter === undefined) throw new Error('--ref needs --ipadapter');
  const guideFile = flags.guide ? path.resolve(root, flags.guide) : path.join(root, 'game-2/art/guides', `${sheet}.png`);
  if (!fs.existsSync(guideFile)) throw new Error(`no guide ${path.relative(root, guideFile)}; run "guides" first`);
  const cobbles = flags.cobbles !== undefined;
  if (cobbles && (sheet !== 'floor' || model !== 'flux')) throw new Error('--cobbles is for "paint floor" with --model flux');
  const guide = cobbles ? cobbleGuide(pngSize(fs.readFileSync(guideFile)), { seed: Number(flags.cobbles), scale: Number(flags['cobble-size'] ?? 1) }) : fs.readFileSync(guideFile);
  if (cobbles) fs.writeFileSync(path.join(root, 'game-2/art/guides/floor-cobbles.png'), guide);
  const doc = fs.readFileSync(path.join(root, 'docs/art-prompts-2d.md'), 'utf8');

  const whole = sheet === 'floor'; // painted as a picture, not repainted over its guide
  const size = pngSize(guide);
  const def = { ...(conditioned ? CONDITIONED : DEFAULTS[model]), ...(whole && { denoise: (cobbles ? COBBLE_DEFAULTS : FLOOR_DEFAULTS).denoise }) };
  const opts = {
    denoise: Number(flags.denoise ?? def.denoise), seed: Number(flags.seed ?? 1), steps: Number(flags.steps ?? def.steps),
    ...(model === 'flux'
      ? { guidance: Number(flags.guidance ?? 3.5) }
      : { cfg: Number(flags.cfg ?? 6.5), lora: flags.lora === 'off' ? 0 : Number(flags.lora ?? 0) }),
  };
  if (whole || flags['init-blur'] !== undefined) opts.initBlur = Number(flags['init-blur'] ?? (cobbles ? COBBLE_DEFAULTS : FLOOR_DEFAULTS).initBlur);
  const files = { [`dc-${sheet}.png`]: guide };
  if (flags.controlnet !== undefined) {
    opts.controlnet = { strength: Number(flags.controlnet), low: Number(flags['canny-low'] ?? 0.3), high: Number(flags['canny-high'] ?? 0.6),
      blur: Number(flags.blur ?? 0), end: Number(flags['cn-end'] ?? 1) };
    const control = flags.control ?? (whole ? 'ramp' : null);
    if (control === 'ramp') {
      // the ground plane of the guide: horizon at the middle of the view, the bottom of the view at the bottom of the floor
      const k = size.w / DEFAULT_VIEW.W, top = (size.h - DEFAULT_VIEW.H * k) / 2;
      files[`dc-ramp-${sheet}.png`] = groundRamp(size.w, size.h, top + (DEFAULT_VIEW.H * k) / 2, top + DEFAULT_VIEW.H * k);
      opts.controlnet.image = `dc-ramp-${sheet}.png`;
      opts.controlnet.type = flags['cn-type'] ?? 'depth';
    } else if (control) {
      const name = `dc-control-${path.basename(control)}`;
      files[name] = fs.readFileSync(path.resolve(root, control));
      opts.controlnet.image = name;
    }
    if (flags['cn-type']) opts.controlnet.type = flags['cn-type'];
  }
  if (flags.ipadapter !== undefined) {
    const ref = path.resolve(root, flags.ref ?? (whole ? FLOOR_REF : DEFAULT_REF));
    if (!fs.existsSync(ref)) throw new Error(`no reference image ${ref}`);
    const name = `dc-ref-${path.basename(ref)}`;
    files[name] = fs.readFileSync(ref);
    opts.ipadapter = { ref: name, weight: Number(flags.ipadapter), weightType: flags['ip-type'] ?? 'style transfer', end: Number(flags['ip-end'] ?? 1) };
  }
  const prompt = flags.prompt ? (flags.prompt.startsWith('@') ? fs.readFileSync(path.resolve(root, flags.prompt.slice(1)), 'utf8').trim() : flags.prompt) : cobbles ? FLOOR.fluxCobbles : promptFor(sheet, doc, model);
  console.log(`${sheet} (${model}): ${JSON.stringify(opts)}\n  prompt: ${prompt}`);
  const common = { guide: `dc-${sheet}.png`, size, prompt, keep: sheet === 'backdrop' ? ['#202020'] : ['#ff00ff', '#202020'], ...opts };
  const t0 = Date.now();
  const painted = await generate(model === 'flux' ? fluxImg2img(common) : img2img({ ...common, negative: whole ? FLOOR.negative : NEGATIVE }), { files });
  const file = path.resolve(flags.out ?? path.join(root, 'game-2/art/painted', `${sheet}.png`));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, painted);
  console.log(`painted ${path.relative(root, file)} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { sheet, file, slice: !!flags.slice };
}
