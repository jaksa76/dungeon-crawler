// 2D art studio: everything the 2D compositor's art pipeline needs, run in a
// browser page by tools/studio2d.mjs.
//
//   bake()   placeholder slot images rendered from the experiment-1 art, so the
//            demo runs before any painting exists. Also the content of the guides.
//   guides() one guide image per sheet of the art plan (what to paint, laid out
//            exactly as the slots will be cut), a labelled key image, and plan.json.
//   slice()  cut a painted sheet back into slot images.

import * as THREE from 'three';
import { createView } from '../../engine2d/view.js';
import { loadSlotImages, createCompositor } from '../../engine2d/compositor.js';
import { loadAssets } from '../../engine/assets.js';
import { buildBackdrop } from '../../engine/backdrop.js';
import { manifest as game1Manifest, town } from '../../game-1/town.js';
import { tileTypes, props, quarter } from '../../game-2/quarter.js';
import { makePlan, sceneRect, sceneCellAt, SHEET } from './plan.js';

const GAME = '../../game-2';
const KEY_COLOR = [255, 0, 255]; // flat background the painter keeps, keyed out when slicing
const FOG = { color: '#1e1838', near: 1.5, far: 8 };

const view = createView(quarter.view);
const { W, H } = view.V;
const wallArts = [...new Set(Object.values(tileTypes).filter((t) => t.wall).map((t) => t.art))];
const propArts = Object.values(props);
const plan = makePlan(view, { wallArts, propArts });

// Which experiment-1 art stands in for each 2D art name.
const SOURCE = {
  walls: {
    'house-a': 'textures/house-timber-a', 'house-b': 'textures/house-timber-b', 'house-door': 'textures/house-door',
    'shop-alchemist': 'textures/shop-alchemist', 'shop-smith': 'textures/shop-smith', 'stone-wall': 'textures/stone-wall',
  },
  props: {
    guard: 'sprites/npc-guard', villager: 'sprites/npc-villager', hooded: 'sprites/npc-hooded', stall: 'sprites/prop-stall',
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

async function bake() {
  const assets = await loadAssets(game1Manifest, '../../game-1/assets');
  const SS = 3; // supersampling: render big, scale down smoothly, so far slots keep detail
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
  for (const art of wallArts) {
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
      out[`walls/${art}/${slot.id}.png`] = png(renderCrop(scene, slot, slot.poly));
    }
  }

  // props: billboards face the screen, so each slot is the sprite scaled, with fog
  const fogCol = new THREE.Color(FOG.color);
  for (const p of propArts) {
    const a = assets[SOURCE.props[p.art]];
    const t = a.texture, img = a.image;
    const sx = t.offset.x * img.width, sw = t.repeat.x * img.width;
    const sh = t.repeat.y * img.height, sy = (1 - t.offset.y - t.repeat.y) * img.height;
    for (const slot of view.propSlots(p.w, p.h).list) {
      if (slot.partial) continue;
      const w = Math.max(1, Math.round(slot.full.w)), h = Math.max(1, Math.round(slot.full.h));
      const c = canvas2d(w, h), g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      const dist = slot.d + view.V.back;
      const k = Math.min(1, Math.max(0, (dist - FOG.near) / (FOG.far - FOG.near)));
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(${fogCol.r * 255},${fogCol.g * 255},${fogCol.b * 255},${k})`;
      g.fillRect(0, 0, w, h);
      out[`props/${p.art}/${slot.id}.png`] = png(c);
    }
  }

  // floor: the whole ground plane, transparent above the horizon
  {
    const cob = assets['textures/cobblestone'].texture;
    cob.wrapS = cob.wrapT = THREE.RepeatWrapping;
    cob.repeat.set(8, 8);
    cob.anisotropy = 16;
    const scene = new THREE.Scene();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), basic(cob, 0.85));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -8.5); // near edge in front of the camera plane
    scene.add(floor);
    out['floor.png'] = png(renderCrop(scene, { x: 0, y: 0, w: W, h: H }, null));
  }

  // backdrop: the experiment-1 sky, hills and landmarks, one view per facing
  {
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
      out[`backdrop-${dir}.png`] = png(c);
    });
    camera.rotation.y = 0;
  }
  return out;
}

// ---------------------------------------------------------------- guides

async function guides() {
  const images = await loadSlotImages(view, { assetPath: `${GAME}/assets`, wallArts, propArts });
  const comp = createCompositor(view, images);
  const out = { 'plan.json': 'data:application/json;base64,' + btoa(JSON.stringify(planSummary(), null, 2)) };
  const scenePic = (scene, { outlines = false } = {}) => {
    const c = canvas2d(W, H), g = c.getContext('2d');
    comp.draw(g, view.compose(sceneCellAt(scene)), { bare: true, shadows: false, outlines });
    return c;
  };
  Object.assign(out, await wholeGuides(images));
  for (const sheet of plan.sheets) {
    const guide = canvas2d(SHEET.w, SHEET.h), gg = guide.getContext('2d');
    const key = canvas2d(SHEET.w, SHEET.h), kg = key.getContext('2d');
    for (const g of [gg, kg]) { g.fillStyle = '#202020'; g.fillRect(0, 0, SHEET.w, SHEET.h); }
    sheet.scenes.forEach((scene, i) => {
      const r = sceneRect(i, view);
      for (const [g, opts] of [[gg, {}], [kg, { outlines: true }]]) {
        g.fillStyle = `rgb(${KEY_COLOR})`;
        g.fillRect(r.x, r.y, r.w, r.h);
        g.imageSmoothingQuality = 'high';
        g.drawImage(scenePic(scene, opts), r.x, r.y, r.w, r.h);
      }
      // labels on the key only
      kg.font = '16px monospace'; kg.textAlign = 'center';
      for (const h of scene.harvest) {
        const it = view.compose(sceneCellAt(scene)).find((x) => x.slot.id === h.id && x.l === h.l);
        const p = view.placed(it), b = it.slot.kind === 'prop' ? p.full : p;
        const cx = r.x + (b.x + b.w / 2) * r.scale, cy = r.y + (b.y + b.h / 2) * r.scale;
        const label = h.id.replace(/^(front|side|prop)-d(\d)-l(\d)$/, (_, k, d, l) => `${k[0].toUpperCase()}${d}${l}${h.l < 0 ? '<' : ''}`);
        kg.fillStyle = '#000'; kg.fillRect(cx - 22, cy - 11, 44, 20);
        kg.fillStyle = '#fff'; kg.fillText(label, cx, cy + 4);
      }
    });
    kg.font = '15px monospace'; kg.textAlign = 'left'; kg.fillStyle = '#ddd';
    kg.fillText(`${sheet.name}: labels are <kind><depth><lateral>, F=front S=side P=prop, < = left side (stored mirrored)`, 8, 16);
    out[`guides/${sheet.name}.png`] = png(guide);
    out[`guides/${sheet.name}.key.png`] = png(key);
  }
  return out;
}

// The floor and the four backdrop views are painted whole, not cut into slots.
const floorRect = () => { const k = SHEET.w / W; return { x: 0, y: (SHEET.h - H * k) / 2, w: W * k, h: H * k }; };
const BACKDROP_DIRS = ['N', 'E', 'S', 'W'];

async function wholeGuides(images) {
  const out = {};
  const floor = canvas2d(SHEET.w, SHEET.h), fg = floor.getContext('2d');
  fg.fillStyle = '#202020'; fg.fillRect(0, 0, SHEET.w, SHEET.h);
  const fr = floorRect();
  fg.fillStyle = `rgb(${KEY_COLOR})`; fg.fillRect(fr.x, fr.y, fr.w, fr.h);
  if (images.get('floor')) { fg.imageSmoothingQuality = 'high'; fg.drawImage(images.get('floor'), fr.x, fr.y, fr.w, fr.h); }
  out['guides/floor.png'] = png(floor);
  const bd = canvas2d(SHEET.w, SHEET.h), bg = bd.getContext('2d');
  bg.fillStyle = '#202020'; bg.fillRect(0, 0, SHEET.w, SHEET.h);
  BACKDROP_DIRS.forEach((dir, i) => {
    const r = sceneRect(i, view), img = images.get(`backdrop:${dir}`);
    bg.imageSmoothingQuality = 'high';
    if (img) bg.drawImage(img, r.x, r.y, r.w, r.h);
  });
  out['guides/backdrop.png'] = png(bd);
  return out;
}

function planSummary() {
  return {
    view: view.V,
    sheet: SHEET,
    whole: { floor: floorRect(), backdrop: BACKDROP_DIRS.map((dir, i) => ({ dir, rect: sceneRect(i, view) })) },
    sheets: plan.sheets.map((s) => ({
      name: s.name,
      scenes: s.scenes.map((sc, i) => ({ art: sc.art, kind: sc.kind, rect: sceneRect(i, view), cells: sc.cells.map(({ l, d }) => [l, d]), slots: sc.harvest.map((h) => h.id) })),
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
  const kx = img.width / SHEET.w, ky = img.height / SHEET.h;
  const cut = (r) => {
    const c = canvas2d(W, H), g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, r.x * kx, r.y * ky, r.w * kx, r.h * ky, 0, 0, W, H);
    return [c, g];
  };
  if (name === 'floor') { const [c, g] = cut(floorRect()); keyOut(g, tolerance); return { 'floor.png': png(c) }; }
  return Object.fromEntries(BACKDROP_DIRS.map((dir, i) => [`backdrop-${dir}.png`, png(cut(sceneRect(i, view))[0])]));
}

// Cut a painted sheet (data URL) into slot images. Background: the flat key colour
// (or real transparency) becomes alpha. Left-side slots are flipped to canonical.
async function slice(sheetName, dataURL, { tolerance = 90 } = {}) {
  if (sheetName === 'floor' || sheetName === 'backdrop') return sliceWhole(sheetName, dataURL, tolerance);
  const sheet = plan.sheets.find((s) => s.name === sheetName);
  if (!sheet) throw new Error(`unknown sheet "${sheetName}"; known: ${plan.sheets.map((s) => s.name).join(', ')}`);
  const img = await loadData(dataURL);
  // Paintings come back at whatever size the model produced: map sheet coords onto it.
  const kx = img.width / SHEET.w, ky = img.height / SHEET.h;
  const out = {};
  sheet.scenes.forEach((scene, i) => {
    const r = sceneRect(i, view);
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

window.studio = { bake, guides, slice, plan: planSummary };
