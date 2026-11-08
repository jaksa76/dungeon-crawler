// `studio2d paint --px`: paint one panel of the pixel slice (docs/pixel-slice.md) natively.
//
// The pixel-art-xl LoRA draws one art pixel per cell of SDXL's 8x8 latent grid, so a 160x90 panel is painted
// on a 1280x720 canvas and comes back as a real pixel image scaled up by 8 (outlines one art pixel wide, flat
// colour in every 8x8 cell). Resolution and factor are set in game-2/quarter-px.js; the guide size comes from
// the plan written by `guides --px`, so nothing here is tied to 160x90. The guide is the placeholder panel
// enlarged by whole pixels; its edges steer the
// sampler through ControlNet so the layout survives. Settings are the ones that kept the lattice in the first
// pilot (LoRA 1.0, canny ControlNet 0.9, denoise 0.7-0.9, no IP-Adapter: the concept-art reference greyed it).
//
//   paint <sheet> --px [--denoise N] [--seed N] [--steps N] [--cfg N] [--lora N] [--controlnet STRENGTH]
//                     [--canny-low N] [--canny-high N] [--blur N] [--cn-end N] [--control image|ramp] [--cn-type TYPE]
//                     [--init-blur N] [--ipadapter WEIGHT [--ref image]] [--prompt text|@file] [--negative text] [--guide file] [--out file] [--slice]
//
// `floor` is painted as a picture of the ground: with --control <image> that picture's edges are the layout
// (e.g. the edges of a painted floor, see docs/pixel-slice.md), with --control ramp a depth ramp fixes the horizon.
import fs from 'node:fs';
import path from 'node:path';
import { generate } from './client.mjs';
import { img2img } from './workflows.mjs';
import { groundRamp } from './ramp.mjs';

const STYLE = 'pixel art, hi-bit pixel art, 16-bit fantasy RPG, flat shading, clean one-pixel dark outlines, limited palette, '
  + 'warm saturated colours, moonlit night with warm golden window light';
const NEGATIVE = '3d render, photo, realistic, blurry, smooth gradients, anti-aliasing, soft edges, text, watermark, dramatic lighting, '
  + 'magenta, pink, characters, faces, desaturated, monochrome, grey, blue cast';

// What each wall type / prop looks like, for the prompt. Panels of one sheet show different faces of the same thing.
const SUBJECT = {
  'house-a': 'half-timbered medieval house walls seen in one-point perspective, some straight on and some at an angle: dark brown timber '
    + 'framing with diagonal braces, cream plaster panels, a grey-mauve stone block ground floor, small glowing warm orange windows with '
    + 'mullions, green ivy, terracotta roof tiles',
  'house-b': 'half-timbered medieval house walls seen in one-point perspective, some straight on and some at an angle: dark timber framing, '
    + 'cream plaster, grey stone base, shuttered windows with warm light, a flower box, terracotta roof tiles',
  'house-door': 'a medieval house front with a wooden arched door, seen in one-point perspective: timber framing, cream plaster, grey stone, '
    + 'warm lantern light, terracotta roof tiles',
  'shop-alchemist': 'an alchemist shop front, seen in one-point perspective: timber framing, cream plaster, shelves of glowing potions in the window, a hanging sign, terracotta roof tiles',
  'shop-smith': 'a blacksmith shop front, seen in one-point perspective: timber framing, grey stone, an open forge glowing orange, a hanging anvil sign, terracotta roof tiles',
  'stone-wall': 'a plain grey-mauve stone block wall with moss, seen in one-point perspective, no roof',
  stall: 'a wooden market stall with a red-and-white striped awning, a counter with a red banner, potion bottles and a bearded old alchemist in a red hat behind it',
};
const FLOOR = 'the bare cobblestone ground of an old town square seen from standing eye height in one-point perspective, horizon across '
  + 'the middle, many small irregular rounded fieldstone cobbles, bigger in the foreground and steadily smaller towards the horizon, warm '
  + 'plum-mauve, rose-grey and warm brown-grey stones with dark brown grout lines, soft warm lamplight, a plain flat band of dusky haze at '
  + 'the horizon, empty ground, nothing standing on it';

const DEFAULTS = { denoise: 0.8, steps: 30, cfg: 7, lora: 1, cn: { strength: 0.9, low: 0.1, high: 0.3, blur: 2, end: 1 } };
const FLOOR_DEFAULTS = { denoise: 0.9, initBlur: 31 };

const pngSize = (b) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

// The art a sheet shows: "walls-house-a-2" is the house-a wall type; a prop sheet ("props-12") is named by
// number, so it is looked up in the plan (game-2/px/art/plan.json, written by `guides --px`).
export function artOf(sheet, root) {
  const planFile = path.join(root, 'game-2/px/art/plan.json');
  const entry = fs.existsSync(planFile) ? JSON.parse(fs.readFileSync(planFile, 'utf8')).sheets.find((s) => s.name === sheet) : null;
  return entry?.scenes[0]?.art ?? /^walls-(.+?)(?:-\d+)?$/.exec(sheet)?.[1] ?? sheet;
}

export async function paintPxSheet(flags, sheet, root) {
  if (!sheet) throw new Error('usage: paint <sheet> --px [--denoise N] [--seed N] [--lora N] [--controlnet N] [--control image|ramp] [--prompt text|@file] [--slice]  (see tools/comfy/paint-px.mjs)');
  const guideFile = flags.guide ? path.resolve(root, flags.guide) : path.join(root, 'game-2/px/art/guides', `${sheet}.png`);
  if (!fs.existsSync(guideFile)) throw new Error(`no guide ${path.relative(root, guideFile)}; run "guides --px" first`);
  const guide = fs.readFileSync(guideFile);
  const size = pngSize(guide);
  const planFile = path.join(root, 'game-2/px/art/plan.json');
  const want = fs.existsSync(planFile) ? JSON.parse(fs.readFileSync(planFile, 'utf8')).sheet : null;
  if (want && (size.w !== want.w || size.h !== want.h)) console.warn(`warning: the pixel-slice canvas is ${want.w}x${want.h} (view x factor), this guide is ${size.w}x${size.h}`);

  const whole = sheet === 'floor';
  const subject = flags.prompt ? null : whole ? FLOOR : SUBJECT[artOf(sheet, root)];
  if (!flags.prompt && !subject) throw new Error(`no subject for "${sheet}" (art ${artOf(sheet, root)}) in tools/comfy/paint-px.mjs (or pass --prompt)`);
  const prompt = flags.prompt ? (flags.prompt.startsWith('@') ? fs.readFileSync(path.resolve(root, flags.prompt.slice(1)), 'utf8').trim() : flags.prompt) : `${STYLE}, ${subject}`;

  const files = { [`px-${sheet}.png`]: guide };
  const opts = {
    denoise: Number(flags.denoise ?? (whole ? FLOOR_DEFAULTS.denoise : DEFAULTS.denoise)), seed: Number(flags.seed ?? 1),
    steps: Number(flags.steps ?? DEFAULTS.steps), cfg: Number(flags.cfg ?? DEFAULTS.cfg), lora: Number(flags.lora ?? DEFAULTS.lora),
    sampler: 'euler', scheduler: 'normal', tiled: false, // pilot: the plain VAE fits 1280x720 in 8 GB and keeps the lattice
  };
  if (whole || flags['init-blur'] !== undefined) opts.initBlur = Number(flags['init-blur'] ?? FLOOR_DEFAULTS.initBlur);
  const cn = {
    ...DEFAULTS.cn, strength: Number(flags.controlnet ?? DEFAULTS.cn.strength), low: Number(flags['canny-low'] ?? DEFAULTS.cn.low),
    high: Number(flags['canny-high'] ?? DEFAULTS.cn.high), blur: Number(flags.blur ?? DEFAULTS.cn.blur), end: Number(flags['cn-end'] ?? DEFAULTS.cn.end),
  };
  const control = flags.control ?? (whole ? 'ramp' : undefined); // the ground plane's depth ramp fixes the horizon
  if (control === 'ramp') {
    files[`px-ramp.png`] = groundRamp(size.w, size.h, size.h / 2, size.h);
    cn.image = 'px-ramp.png'; cn.type = flags['cn-type'] ?? 'depth';
  } else if (control) {
    const name = `px-control-${path.basename(control)}`;
    files[name] = fs.readFileSync(path.resolve(root, control));
    cn.image = name;
    if (flags['cn-type']) cn.type = flags['cn-type'];
  } else if (flags['cn-type']) cn.type = flags['cn-type'];
  opts.controlnet = cn;
  if (flags.ipadapter !== undefined) {
    const ref = path.resolve(root, flags.ref ?? 'game-2/art/ref/concept-houses.png');
    files[`px-ref-${path.basename(ref)}`] = fs.readFileSync(ref);
    opts.ipadapter = { ref: `px-ref-${path.basename(ref)}`, weight: Number(flags.ipadapter), weightType: flags['ip-type'] ?? 'style transfer', end: Number(flags['ip-end'] ?? 1) };
  }
  console.log(`${sheet} (px, sdxl+LoRA): ${JSON.stringify(opts)}\n  prompt: ${prompt}`);
  const t0 = Date.now();
  const painted = await generate(img2img({ guide: `px-${sheet}.png`, size, prompt, negative: flags.negative ?? NEGATIVE, keep: ['#ff00ff'], ...opts }), { files });
  const file = path.resolve(flags.out ?? path.join(root, 'game-2/px/art/painted', `${sheet}.png`));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, painted);
  console.log(`painted ${path.relative(root, file)} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { sheet, file, slice: !!flags.slice };
}
