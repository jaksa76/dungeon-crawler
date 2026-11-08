// 2D art studio: everything the 2D compositor's art pipeline needs, run in a
// browser page by tools/studio2d.mjs.
//
//   bake(only) placeholder slot images rendered from the experiment-1 art, so the
//            demo runs before any painting exists. Also the content of the guides.
//            `only` limits it to some of 'walls', 'props', 'floor', 'backdrop' ('props:<art>': one prop).
//   guides() one guide image per sheet of the art plan (what to paint, laid out
//            exactly as the slots will be cut), a labelled key image, and plan.json.
//   slice()  cut a painted sheet back into slot images.
//
// `studio.html?px` works on the pixel slice instead (docs/pixel-slice.md; resolution and canvas factor are set
// in game-2/quarter-px.js): its own view, its own art under game-2/px/, one panel per sheet painted on a canvas
// `factor` times the view, and slicing that reads one pixel per factor x factor cell instead of resampling.

import * as THREE from 'three';
import { createView } from '../../engine2d/view.js';
import { loadSlotImages, createCompositor } from '../../engine2d/compositor.js';
import { loadAssets } from '../../engine/assets.js';
import { buildBackdrop } from '../../engine/backdrop.js';
import { manifest as game1Manifest, town } from '../../game-1/town.js';
import { tileTypes, props, quarter } from '../../game-2/quarter.js';
import { quarterPx, PX as PX_CONFIG } from '../../game-2/quarter-px.js';
import { makePlan, sceneRect, sceneCellAt, SHEET, sheetForPixelView } from './plan.js';

const PX = new URLSearchParams(location.search).has('px');
const GAME = '../../game-2';
const ASSETS = `${GAME}/${PX ? 'px/' : ''}assets`;
const CELL = PX ? PX_CONFIG.factor : 1; // painted pixels per art pixel (pixel slice)
const sheetSpec = PX ? sheetForPixelView(PX_CONFIG.width, PX_CONFIG.height, PX_CONFIG.factor) : SHEET;
const KEY_COLOR = [255, 0, 255]; // flat background the painter keeps, keyed out when slicing
const FOG = { color: '#1e1838', near: 1.5, far: 8 };

const view = createView((PX ? quarterPx : quarter).view);
const { W, H } = view.V;
const wallArts = [...new Set(Object.values(tileTypes).filter((t) => t.wall).map((t) => t.art))];
const propArts = Object.values(props);
const plan = makePlan(view, { wallArts, propArts, sheet: sheetSpec });

// Which experiment-1 art stands in for each 2D art name.
const SOURCE = {
  walls: {
    'house-a': 'textures/house-timber-a', 'house-b': 'textures/house-timber-b', 'house-door': 'textures/house-door',
    'shop-alchemist': 'textures/shop-alchemist', 'shop-smith': 'textures/shop-smith', 'stone-wall': 'textures/stone-wall',
  },
  props: {
    guard: 'sprites/npc-guard', villager: 'sprites/npc-villager', hooded: 'sprites/npc-hooded', stall: { front: 'art/sprites/stall/front.png', q: 'art/sprites/stall/q.png', side: 'art/sprites/stall/side.png',
      sideFlip: 'art/sprites/stall/side-flip.png' },
    well: 'sprites/prop-well', barrel: 'sprites/prop-barrel', crate: 'sprites/prop-crate', chest: 'sprites/prop-chest',
    lamppost: 'sprites/prop-lamppost',
  },
};
const ROOFLESS = new Set(['stone-wall']);

const canvas2d = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const png = (c) => c.toDataURL('image/png');
function clipTo(g, poly, dx = 0, dy = 0) {
  g.beginPath();
  poly.forEach(([x, y], i) => (i ? g.lineTo(x - dx, y - dy) : g.moveTo(x - dx, y - dy)));
  g.closePath(); g.clip();
}

// ---------------------------------------------------------------- bake

// A prop's art is either one of experiment 1's billboard sprites (a path in SOURCE.props, which
// every slot shows scaled), or sprites painted for the demo's camera, one per view, as an object
// { front, q, side } of paths relative to game-2/ (SOURCE.props.<art>):
//   front  seen straight on        q     turned 45 degrees: the front faces right, its left side shows
//   side   turned 90 degrees: the front faces right
//   sideFlip  optional: the side view turned the other way, used where `side` would be mirrored (right wall)
// Every sprite is trimmed to the object. Which one a slot shows depends on where the prop is seen from.
const loadImage = (src) => new Promise((resolve, reject) => {
  const im = new Image();
  im.onload = () => resolve(im);
  im.onerror = () => reject(new Error(`cannot load ${src}`));
  im.src = src;
});
const loadViews = async (views) => Object.fromEntries(await Promise.all(
  Object.entries(views).map(async ([name, src]) => [name, await loadImage(`${GAME}/${src}`)])));

function viewFor(slot) {
  const x = Math.abs((slot.full.x + slot.full.w / 2 - W / 2) * slot.s / view.f); // lateral distance of the prop, in tiles
  // Slots are stored for the right of the centre line; the compositor mirrors them for the left.
  if (slot.anchor === 'far') return { name: Math.atan2(x, slot.s) < 0.38 ? 'front' : 'q', flip: false };
  if (slot.anchor === 'near') return { name: 'front', flip: false }; // seen from behind: there is no back view yet
  if (slot.anchor === 'left') return { name: 'side', flip: false }; // its front faces away to the right: show the profile
  return { name: 'side', flip: true }; // right: against the right wall its front faces the centre line, so the profile is mirrored
}

// Draw the right view of a prop into a w x h canvas: as large as fits, standing on the bottom edge.
// A mirrored view uses its own sprite when the art has one (`sideFlip`: painted facing the other way, so details
// such as which side the chest is on need not be a mirror image), else the mirrored sprite.
function drawView(g, views, slot, w, h) {
  let { name, flip } = viewFor(slot);
  if (flip && views[`${name}Flip`]) { name = `${name}Flip`; flip = false; }
  const im = views[name] ?? views.front, k = Math.min(w / im.width, h / im.height);
  const dw = im.width * k, dh = im.height * k;
  g.save();
  if (flip) { g.translate(w, 0); g.scale(-1, 1); }
  g.drawImage(im, (w - dw) / 2, h - dh, dw, dh);
  g.restore();
}

// Pixel slice: placeholders have hard edges (every pixel fully opaque or fully transparent).
function hardAlpha(c) {
  const g = c.getContext('2d', { willReadFrequently: true }), data = g.getImageData(0, 0, c.width, c.height), d = data.data;
  for (let p = 3; p < d.length; p += 4) d[p] = d[p] >= 128 ? 255 : 0;
  g.putImageData(data, 0, 0);
  return c;
}
const emit = (c) => png(PX ? hardAlpha(c) : c);

// `only`: any of 'walls', 'props', 'floor', 'backdrop' (default: all of them), or 'props:<art>'
// for one prop.
async function bake(only = []) {
  const want = (part) => !only.length || only.some((o) => o === part || o.startsWith(`${part}:`));
  const wantProp = (art) => !only.some((o) => o.startsWith('props:')) || only.includes('props') || only.includes(`props:${art}`);
  const assets = await loadAssets(game1Manifest, '../../game-1/assets');
  const SS = PX ? 6 : 3; // supersampling: render big, scale down smoothly, so far slots keep detail
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W * SS, H * SS, false);
  renderer.setClearColor(0x000000, 0);
  const camera = new THREE.PerspectiveCamera(view.V.fovY, W / H, 0.02, 2000);
  camera.position.set(0, view.V.eye, 0);
  const out = {};

  const quad = (pts, uvs, mat) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap(([x, y, s]) => [x, y, -s]), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return new THREE.Mesh(g, mat);
  };
  const basic = (tex, shade) => new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(shade, shade, shade), side: THREE.DoubleSide, alphaTest: 0.5 });
  const roofTex = assets['textures/roof-tiles'].texture;
  roofTex.wrapS = roofTex.wrapT = THREE.RepeatWrapping;

  function renderCrop(scene, rect, poly) {
    scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);
    renderer.render(scene, camera);
    const c = canvas2d(rect.w, rect.h), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    if (poly) clipTo(g, poly, rect.x, rect.y);
    g.drawImage(renderer.domElement, rect.x * SS, rect.y * SS, rect.w * SS, rect.h * SS, 0, 0, rect.w, rect.h);
    return c;
  }

  // walls: facade (+ a roof slope behind fronts), masked to the slot card
  const { wallH, ridgeH } = view.V;
  for (const art of want('walls') ? wallArts : []) {
    const fac = assets[SOURCE.walls[art]];
    const facH = Math.min(wallH, fac.aspect); // the texture is one tile wide
    for (const slot of view.wallSlots) {
      const scene = new THREE.Scene();
      const s0 = view.near(slot.d);
      if (slot.kind === 'front') {
        const x0 = slot.l - 0.5, x1 = slot.l + 0.5;
        scene.add(quad([[x0, 0, s0], [x1, 0, s0], [x1, facH, s0], [x0, facH, s0]], [[0, 0], [1, 0], [1, 1], [0, 1]], basic(fac.texture, 0.95)));
        if (!ROOFLESS.has(art)) {
          const e = 0.06; // eaves overhang
          scene.add(quad([[x0 - e, facH - e, s0 - e], [x1 + e, facH - e, s0 - e], [x1 + e, ridgeH, s0 + 0.5], [x0 - e, ridgeH, s0 + 0.5]],
            [[0, 0], [1, 0], [1, 1], [0, 1]], basic(roofTex, 0.8)));
        }
      } else {
        const x = slot.l - 0.5, s1 = s0 + 1;
        // Seen from the street, the facade's left edge is the far end.
        scene.add(quad([[x, 0, s1], [x, 0, s0], [x, facH, s0], [x, facH, s1]], [[0, 0], [1, 0], [1, 1], [0, 1]], basic(fac.texture, 0.8)));
      }
      out[`walls/${art}/${slot.id}.png`] = emit(renderCrop(scene, slot, slot.poly));
    }
  }

  // props: billboards face the screen, so each slot is the sprite scaled, with fog
  const fogCol = new THREE.Color(FOG.color);
  for (const p of want('props') ? propArts.filter((q) => wantProp(q.art)) : []) {
    const src = SOURCE.props[p.art];
    const views = typeof src === 'object' ? await loadViews(src) : null;
    const a = views ? null : assets[src];
    const t = a?.texture, img = a?.image;
    const sx = a ? t.offset.x * img.width : 0, sw = a ? t.repeat.x * img.width : 0;
    const sh = a ? t.repeat.y * img.height : 0, sy = a ? (1 - t.offset.y - t.repeat.y) * img.height : 0;
    for (const slot of view.propSlots(p.w, p.h, p.sideW).list) {
      if (slot.borrows) continue;
      const w = Math.max(1, Math.round(slot.full.w)), h = Math.max(1, Math.round(slot.full.h));
      const c = canvas2d(w, h), g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      if (views) drawView(g, views, slot, w, h);
      else g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      const k = Math.min(1, Math.max(0, (slot.s - FOG.near) / (FOG.far - FOG.near)));
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(${fogCol.r * 255},${fogCol.g * 255},${fogCol.b * 255},${k})`;
      g.fillRect(0, 0, w, h);
      out[`props/${p.art}/${slot.id}.png`] = emit(c);
    }
  }

  // floor: the whole ground plane, transparent above the horizon
  if (want('floor')) {
    const cob = assets['textures/cobblestone'].texture;
    cob.wrapS = cob.wrapT = THREE.RepeatWrapping;
    cob.repeat.set(8, 8);
    cob.anisotropy = 16;
    const scene = new THREE.Scene();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), basic(cob, 0.85));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -8.5); // near edge in front of the camera plane
    scene.add(floor);
    out['floor.png'] = emit(renderCrop(scene, { x: 0, y: 0, w: W, h: H }, null));
  }

  // backdrop: the experiment-1 sky, hills and landmarks, one view per facing
  if (want('backdrop')) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0820');
    const bd = buildBackdrop(scene, town.backdrop, assets, view.V.eye);
    camera.rotation.order = 'YXZ';
    ['N', 'E', 'S', 'W'].forEach((dir, i) => {
      camera.rotation.y = -i * Math.PI / 2;
      bd.update(camera);
      renderer.render(scene, camera);
      const c = canvas2d(W, H), g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(renderer.domElement, 0, 0, W, H);
      out[`backdrop-${dir}.png`] = emit(c);
    });
    camera.rotation.y = 0;
  }
  return out;
}

// ---------------------------------------------------------------- guides

async function guides() {
  const images = await loadSlotImages(view, { assetPath: ASSETS, wallArts, propArts });
  const comp = createCompositor(view, images);
  const out = { 'plan.json': 'data:application/json;base64,' + btoa(JSON.stringify(planSummary(), null, 2)) };
  const scenePic = (scene, { outlines = false } = {}) => {
    const c = canvas2d(W, H), g = c.getContext('2d');
    comp.draw(g, view.compose(sceneCellAt(scene)), { bare: true, shadows: false, outlines });
    return c;
  };
  Object.assign(out, await wholeGuides(images));
  for (const sheet of plan.sheets) {
    const guide = canvas2d(sheetSpec.w, sheetSpec.h), gg = guide.getContext('2d');
    const key = canvas2d(sheetSpec.w, sheetSpec.h), kg = key.getContext('2d');
    for (const g of [gg, kg]) { g.fillStyle = '#202020'; g.fillRect(0, 0, sheetSpec.w, sheetSpec.h); }
    sheet.scenes.forEach((scene, i) => {
      const r = sceneRect(i, view, sheetSpec);
      for (const [g, opts] of [[gg, {}], [kg, { outlines: true }]]) {
        g.fillStyle = `rgb(${KEY_COLOR})`;
        g.fillRect(r.x, r.y, r.w, r.h);
        g.imageSmoothingQuality = 'high';
        g.imageSmoothingEnabled = !PX; // pixel slice: enlarge by whole pixels
        g.drawImage(scenePic(scene, opts), r.x, r.y, r.w, r.h);
      }
      // labels on the key only
      kg.font = '16px monospace'; kg.textAlign = 'center';
      for (const h of scene.harvest) {
        const it = view.compose(sceneCellAt(scene)).find((x) => x.slot.id === h.id && x.l === h.l);
        const p = view.placed(it), b = it.slot.kind === 'prop' ? p.full : p;
        const cx = r.x + (b.x + b.w / 2) * r.scale, cy = r.y + (b.y + b.h / 2) * r.scale;
        // F21 = front, depth 2, lateral 1; Pf21 = prop against the far side; Pn/Pl/Pr = near/left/right side
        const label = h.id.replace(/^(front|side|prop)(?:-(far|near|left|right))?-d(\d)-l(\d)$/,
          (_, k, a, d, l) => `${a ? 'P' + a[0] : k[0].toUpperCase()}${d}${l}${h.l < 0 ? '<' : ''}`);
        kg.fillStyle = '#000'; kg.fillRect(cx - 22, cy - 11, 44, 20);
        kg.fillStyle = '#fff'; kg.fillText(label, cx, cy + 4);
      }
    });
    kg.font = '15px monospace'; kg.textAlign = 'left'; kg.fillStyle = '#ddd';
    kg.fillText(`${sheet.name}: labels are <kind><depth><lateral>, F=front S=side Pf/Pn/Pl/Pr=prop on far/near/left/right side of its cell, < = left of centre (stored mirrored)`, 8, 16);
    out[`guides/${sheet.name}.png`] = png(guide);
    out[`guides/${sheet.name}.key.png`] = png(key);
  }
  return out;
}

// The floor and the four backdrop views are painted whole, not cut into slots.
const floorRect = () => { const k = sheetSpec.w / W; return { x: 0, y: (sheetSpec.h - H * k) / 2, w: W * k, h: H * k }; };
const BACKDROP_DIRS = ['N', 'E', 'S', 'W'];

async function wholeGuides(images) {
  const out = {};
  const floor = canvas2d(sheetSpec.w, sheetSpec.h), fg = floor.getContext('2d');
  fg.fillStyle = '#202020'; fg.fillRect(0, 0, sheetSpec.w, sheetSpec.h);
  const fr = floorRect();
  fg.fillStyle = `rgb(${KEY_COLOR})`; fg.fillRect(fr.x, fr.y, fr.w, fr.h);
  if (images.get('floor')) { fg.imageSmoothingQuality = 'high'; fg.imageSmoothingEnabled = !PX; fg.drawImage(images.get('floor'), fr.x, fr.y, fr.w, fr.h); }
  out['guides/floor.png'] = png(floor);
  if (PX) return out; // the backdrop is not part of the pixel slice
  const bd = canvas2d(sheetSpec.w, sheetSpec.h), bg = bd.getContext('2d');
  bg.fillStyle = '#202020'; bg.fillRect(0, 0, sheetSpec.w, sheetSpec.h);
  BACKDROP_DIRS.forEach((dir, i) => {
    const r = sceneRect(i, view, sheetSpec), img = images.get(`backdrop:${dir}`);
    bg.imageSmoothingQuality = 'high';
    if (img) bg.drawImage(img, r.x, r.y, r.w, r.h);
  });
  out['guides/backdrop.png'] = png(bd);
  return out;
}

function planSummary() {
  return {
    view: view.V,
    sheet: sheetSpec,
    whole: { floor: floorRect(), backdrop: PX ? [] : BACKDROP_DIRS.map((dir, i) => ({ dir, rect: sceneRect(i, view, sheetSpec) })) },
    sheets: plan.sheets.map((s) => ({
      name: s.name,
      scenes: s.scenes.map((sc, i) => ({ art: sc.art, kind: sc.kind, rect: sceneRect(i, view, sheetSpec), cells: sc.cells.map(({ l, d }) => [l, d]), slots: sc.harvest.map((h) => h.id) })),
    })),
  };
}

// ---------------------------------------------------------------- slice

const loadData = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });

function keyOut(g, tolerance) {
  const data = g.getImageData(0, 0, W, H), d = data.data;
  for (let p = 0; p < d.length; p += 4) {
    const dist = Math.hypot(d[p] - KEY_COLOR[0], d[p + 1] - KEY_COLOR[1], d[p + 2] - KEY_COLOR[2]);
    if (dist < tolerance) d[p + 3] = 0;
    else if (dist < tolerance * 1.5) { // despill the fringe
      d[p + 3] = Math.round((255 * (dist - tolerance)) / (tolerance * 0.5));
      d[p] = Math.min(d[p], d[p + 1] + 40); d[p + 2] = Math.min(d[p + 2], d[p + 1] + 40);
    }
  }
  g.putImageData(data, 0, 0);
}

async function sliceWhole(name, dataURL, tolerance) {
  const img = await loadData(dataURL);
  const kx = img.width / sheetSpec.w, ky = img.height / sheetSpec.h;
  const cut = (r) => {
    const c = canvas2d(W, H), g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, r.x * kx, r.y * ky, r.w * kx, r.h * ky, 0, 0, W, H);
    return [c, g];
  };
  if (name === 'floor') { const [c, g] = cut(floorRect()); keyOut(g, tolerance); return { 'floor.png': png(c) }; }
  return Object.fromEntries(BACKDROP_DIRS.map((dir, i) => [`backdrop-${dir}.png`, png(cut(sceneRect(i, view, sheetSpec))[0])]));
}

// Cut a painted sheet (data URL) into slot images. Background: the flat key colour
// (or real transparency) becomes alpha. Left-side slots are flipped to canonical.
async function slice(sheetName, dataURL, { tolerance = 90 } = {}) {
  if (PX) return slicePx(sheetName, dataURL, tolerance);
  if (sheetName === 'floor' || sheetName === 'backdrop') return sliceWhole(sheetName, dataURL, tolerance);
  const sheet = plan.sheets.find((s) => s.name === sheetName);
  if (!sheet) throw new Error(`unknown sheet "${sheetName}"; known: ${plan.sheets.map((s) => s.name).join(', ')}`);
  const img = await loadData(dataURL);
  // Paintings come back at whatever size the model produced: map sheet coords onto it.
  const kx = img.width / sheetSpec.w, ky = img.height / sheetSpec.h;
  const out = {};
  sheet.scenes.forEach((scene, i) => {
    const r = sceneRect(i, view, sheetSpec);
    const c = canvas2d(W, H), g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, r.x * kx, r.y * ky, r.w * kx, r.h * ky, 0, 0, W, H);
    keyOut(g, tolerance);
    const items = view.compose(sceneCellAt(scene));
    for (const h of scene.harvest) {
      const it = items.find((x) => x.slot.id === h.id && x.l === h.l);
      const p = view.placed(it);
      const b = it.slot.kind === 'prop' ? p.full : p;
      const bw = Math.max(1, Math.round(b.w)), bh = Math.max(1, Math.round(b.h));
      const o = canvas2d(bw, bh), og = o.getContext('2d');
      if (it.mirror) { og.translate(bw, 0); og.scale(-1, 1); }
      if (it.slot.kind !== 'prop') clipTo(og, p.poly, b.x, b.y);
      og.drawImage(c, b.x, b.y, b.w, b.h, 0, 0, bw, bh);
      out[`${scene.kind}/${scene.art}/${h.id}.png`] = png(o);
    }
  });
  return out;
}

// ---------------------------------------------------------------- slice, pixel slice

// A painting made by the pixel-art LoRA on a canvas CELL times the view's size is a real pixel image
// scaled up: one art pixel per CELL x CELL cell (CELL is the slice's `factor`, 8 by default). It is read back by taking ONE colour per cell (the
// median of its pixels), never by resampling. Slot masks are hard (a pixel is in or out), the key
// colour is cut without a fringe, so the slot images stay pixel art.
function latticeStart(img, P) {
  const { data, width: w, height: h } = img;
  const px = new Float64Array(w - 1), py = new Float64Array(h - 1);
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = (y * w + x) * 4, r = i + 4, b = i + w * 4;
    px[x] += Math.abs(data[i] - data[r]) + Math.abs(data[i + 1] - data[r + 1]) + Math.abs(data[i + 2] - data[r + 2]);
    py[y] += Math.abs(data[i] - data[b]) + Math.abs(data[i + 1] - data[b + 1]) + Math.abs(data[i + 2] - data[b + 2]);
  }
  const best = (prof) => {
    let bp = 0, bs = -1, tot = 0;
    for (let ph = 0; ph < P; ph++) { let s = 0; for (let k = ph; k < prof.length; k += P) s += prof[k]; tot += s; if (s > bs) { bs = s; bp = ph; } }
    return { start: (bp + 1) % P, share: bs / (tot || 1) }; // colour changes after pixel `bp`: the cells start one later
  };
  return { x: best(px), y: best(py) };
}

const median = (a, n) => { const s = Array.from(a.subarray(0, n)).sort((p, q) => p - q); return s[n >> 1]; };

// The painting region `r` (sheet coordinates) as a W x H canvas, one pixel per cell.
function readNative(img, r, kx, ky) {
  const x0 = Math.round(r.x * kx), y0 = Math.round(r.y * ky), cw = Math.round(r.w * kx), ch = Math.round(r.h * ky);
  const src = canvas2d(cw, ch), sg = src.getContext('2d', { willReadFrequently: true });
  sg.imageSmoothingEnabled = false;
  sg.drawImage(img, x0, y0, cw, ch, 0, 0, cw, ch);
  const data = sg.getImageData(0, 0, cw, ch), s = data.data;
  const bw = cw / W, bh = ch / H, P = Math.round(bw);
  const lattice = Math.abs(bw - P) < 1e-6 && Math.abs(bh - P) < 1e-6 ? latticeStart(data, P)
    : { x: { start: 0, share: 0 }, y: { start: 0, share: 0 } };
  const out = canvas2d(W, H), og = out.getContext('2d', { willReadFrequently: true });
  const od = og.createImageData(W, H), d = od.data;
  const ch3 = [new Uint8Array(Math.ceil(bw * bh) + 8), new Uint8Array(Math.ceil(bw * bh) + 8), new Uint8Array(Math.ceil(bw * bh) + 8)];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const xa = Math.round(lattice.x.start + i * bw), xb = Math.max(xa + 1, Math.round(lattice.x.start + (i + 1) * bw));
    const ya = Math.round(lattice.y.start + j * bh), yb = Math.max(ya + 1, Math.round(lattice.y.start + (j + 1) * bh));
    let n = 0;
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
      const q = (Math.min(ch - 1, y) * cw + Math.min(cw - 1, x)) * 4;
      ch3[0][n] = s[q]; ch3[1][n] = s[q + 1]; ch3[2][n] = s[q + 2]; n++;
    }
    const o = (j * W + i) * 4;
    d[o] = median(ch3[0], n); d[o + 1] = median(ch3[1], n); d[o + 2] = median(ch3[2], n); d[o + 3] = 255;
  }
  og.putImageData(od, 0, 0);
  return { canvas: out, lattice };
}

// Hard key: a pixel near the key colour becomes transparent, every other pixel is fully opaque.
function hardKey(g, tolerance) {
  const data = g.getImageData(0, 0, W, H), d = data.data;
  for (let p = 0; p < d.length; p += 4) {
    d[p + 3] = Math.hypot(d[p] - KEY_COLOR[0], d[p + 1] - KEY_COLOR[1], d[p + 2] - KEY_COLOR[2]) < tolerance ? 0 : 255;
  }
  g.putImageData(data, 0, 0);
  return data;
}

function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const report = (name, i, lattice) => console.log(`px: ${name} panel ${i}: lattice starts at x=${lattice.x.start} y=${lattice.y.start}, `
  + `share ${lattice.x.share.toFixed(2)}/${lattice.y.share.toFixed(2)} (random ${(1 / CELL).toFixed(2)}, perfect 1.00)`);
async function slicePx(sheetName, dataURL, tolerance) {
  const img = await loadData(dataURL);
  const kx = img.width / sheetSpec.w, ky = img.height / sheetSpec.h;
  if (sheetName === 'floor') {
    const { canvas: c, lattice } = readNative(img, floorRect(), kx, ky);
    report(sheetName, 0, lattice);
    hardKey(c.getContext('2d', { willReadFrequently: true }), tolerance);
    return { 'floor.png': png(c) };
  }
  const sheet = plan.sheets.find((s) => s.name === sheetName);
  if (!sheet) throw new Error(`unknown sheet "${sheetName}"; known: floor, ${plan.sheets.map((s) => s.name).join(', ')}`);
  const out = {};
  sheet.scenes.forEach((scene, i) => {
    const { canvas: c, lattice } = readNative(img, sceneRect(i, view, sheetSpec), kx, ky);
    report(sheetName, i, lattice);
    const nat = hardKey(c.getContext('2d', { willReadFrequently: true }), tolerance).data;
    const items = view.compose(sceneCellAt(scene));
    for (const h of scene.harvest) {
      const it = items.find((x) => x.slot.id === h.id && x.l === h.l);
      const p = view.placed(it), prop = it.slot.kind === 'prop', b = prop ? p.full : p; // whole pixels in a pixel view
      const bw = Math.max(1, Math.round(b.w)), bh = Math.max(1, Math.round(b.h));
      const o = new ImageData(bw, bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const sx = b.x + x, sy = b.y + y;
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue; // off screen: transparent
        if (!prop && !inPoly(p.poly, sx + 0.5, sy + 0.5)) continue;
        const q = (sy * W + sx) * 4, t = (y * bw + (it.mirror ? bw - 1 - x : x)) * 4; // left-side slots are stored flipped
        o.data[t] = nat[q]; o.data[t + 1] = nat[q + 1]; o.data[t + 2] = nat[q + 2]; o.data[t + 3] = nat[q + 3];
      }
      const oc = canvas2d(bw, bh);
      oc.getContext('2d').putImageData(o, 0, 0);
      out[`${scene.kind}/${scene.art}/${h.id}.png`] = png(oc);
    }
  });
  return out;
}

window.studio = { bake, guides, slice, plan: planSummary };
