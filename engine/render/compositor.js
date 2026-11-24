import { FRAME_LAYOUT, FRAME_COLUMNS, FRAME_PADDING, FRAME_WIDTH_SCALE, DIRECTIONS } from './monster-animation.js';
import { createSceneTargets } from './scene-targets.js';
// Draws a view from slot images: backdrop, floor, then wall faces and props far
// to near. Missing images are drawn as flat polygons so gaps in the art are obvious.

export function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Every piece of art comes from its own folder (`assets`, a URL ending in /; see engine/content/catalog.js):
//   environment:  floor.png, backdrop-<N|E|S|W>.png (when `backdrop` is true) or one URL for all directions
//   walls, props: <slot id>.png, one per slot of the view
//   actors:       <front|back|left|right>-d<depth>.png, and animation-d<depth>.png when `animated`
export async function loadSlotImages(view, { environment, walls = [], props = [], actors = [] }) {
  const images = new Map();
  const jobs = [];
  const want = (key, folder, file) => jobs.push(loadImage(new URL(file, folder).href).then((img) => img && images.set(key, img)));
  if (typeof environment?.backdrop === 'string') {
    jobs.push(loadImage(environment.backdrop).then(img => {
      if (img) for (const dir of 'NESW') images.set(`backdrop:${dir}`, img);
    }));
  } else if (environment?.backdrop) {
    for (const dir of 'NESW') want(`backdrop:${dir}`, environment.assets, `backdrop-${dir}.png`);
  }
  if (environment) want('floor', environment.assets, 'floor.png');
  for (const w of walls) for (const s of view.wallSlots) want(`walls:${w.art}:${s.id}`, w.assets, `${s.id}.png`);
  for (const p of props) for (const s of view.propSlots(p.w, p.h, p.sideW).list) {
    if (!s.borrows) want(`props:${p.art}:${s.id}`, p.assets, `${s.id}.png`);
  }
  for (const a of actors) for (let d = 0; d <= view.V.maxDepth; d++) {
    for (const direction of ['front', 'back', 'left', 'right']) want(`monsters:${a.art}:${direction}:d${d}`, a.assets, `${direction}-d${d}.png`);
    if (a.animated) want(`animation:${a.art}:d${d}`, a.assets, `animation-d${d}.png`);
  }
  await Promise.all(jobs);
  return images;
}

const FALLBACK = { front: '#5a4a5e', side: '#463a4c', prop: '#a07a4a' };

export function createCompositor(view, images) {
  const { W, H } = view.V;
  const targets = createSceneTargets(W, H);
  const tinted = new WeakMap();
  const placeholders = new Map();
  function placeholder(direction) {
    if (!placeholders.has(direction)) {
      const c = document.createElement('canvas'); c.width = 16; c.height = 32;
      const g = c.getContext('2d');
      g.fillStyle = '#49262e'; g.fillRect(0, 0, 16, 32);
      g.fillStyle = { front: '#c06052', back: '#87414a', left: '#a54d4d', right: '#a54d4d' }[direction];
      g.fillRect(1, 1, 14, 30); placeholders.set(direction, c);
    }
    return placeholders.get(direction);
  }
  const darkness = (distance, fog) => Math.min(1, Math.max(0, (distance - fog.near) / (fog.far - fog.near)));
  function shade(image, distance, fog) {
    if (!fog) return image;
    const alpha = Math.round(darkness(distance, fog) * 8) / 8;
    if (!alpha) return image;
    let variants = tinted.get(image);
    if (!variants) tinted.set(image, variants = new Map());
    const key = `${fog.color}:${alpha}`;
    if (!variants.has(key)) {
      const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
      const g = c.getContext('2d'); g.drawImage(image, 0, 0);
      g.globalCompositeOperation = 'source-atop'; g.globalAlpha = alpha;
      g.fillStyle = fog.color; g.fillRect(0, 0, c.width, c.height);
      variants.set(key, c);
    }
    return variants.get(key);
  }

  function drawFlipped(g, img, x, y, w, h, flip, source = null) {
    g.save(); if (flip) { g.translate(x + w, y); g.scale(-1, 1); x = y = 0; }
    if (source) g.drawImage(img, ...source, x, y, w, h);
    else g.drawImage(img, x, y, w, h);
    g.restore();
  }

  function shadow(g, r) {
    const cx = r.x + r.w / 2, cy = r.y + r.h;
    const rx = r.w * 0.42, ry = Math.max(2, r.w * 0.09);
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx); g.translate(-cx, -cy);
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, rx, 0, Math.PI * 2); g.fill(); g.restore();
  }

  // The image for a draw item, and whether it is drawn flipped. A prop slot without
  // its own image borrows the nearest one in the same row (see view.propChain).
  function lookup(it) {
    if (it.slot.kind === 'actor') {
      const atlas = images.get(`animation:${it.actor.art}:d${it.d}`), sample = it.actor.animation;
      if (atlas && sample) {
        const layout = FRAME_LAYOUT[sample.state], w = atlas.width / FRAME_COLUMNS, h = atlas.height / DIRECTIONS.length;
        return { img: atlas, flip: false, source: [(layout.column + Math.min(layout.frames - 1, sample.frame)) * w,
          Math.max(0, DIRECTIONS.indexOf(it.actor.direction)) * h, w, h] };
      }
      const img = images.get(`monsters:${it.actor.art}:${it.actor.direction}:d${it.d}`);
      return img ? { img, flip: false } : null;
    }
    if (it.slot.kind !== 'prop') {
      const img = images.get(`walls:${it.type}:${it.slot.id}`);
      return img ? { img, flip: it.mirror } : null;
    }
    for (const c of view.propChain(it.slot)) {
      const img = images.get(`props:${it.prop.art}:${c.id}`);
      if (img) return { img, flip: it.mirror !== c.flip };
    }
    return null;
  }
  const imageFor = (it) => lookup(it)?.img ?? null;

  // items: from view.compose(). facing: 'N'|'E'|'S'|'W'. flipFloor: alternate per step.
  // bare: only walls and props on a transparent canvas (for art guides).
  // A pixel view (view.V.pixel) is drawn without smoothing and without the soft shadow.
  function draw(g, items, { facing = 'N', flipFloor = false, outlines = false, bare = false, shadows = !view.V.pixel, atmosphere = null, picking = false, targetId = null } = {}) {
    if (picking) targets.begin(g.canvas.width, g.canvas.height);
    g.imageSmoothingEnabled = !(view.V.pixel || atmosphere);
    g.clearRect(0, 0, W, H);
    if (!bare) {
      const bd = !atmosphere && images.get(`backdrop:${facing}`);
      if (bd) g.drawImage(bd, 0, 0, W, H); else { g.fillStyle = atmosphere?.color ?? '#1a1430'; g.fillRect(0, 0, W, H); }
      const floor = images.get('floor');
      if (floor) drawFlipped(g, floor, 0, 0, W, H, flipFloor);
      else { g.fillStyle = '#3a3040'; g.fillRect(0, view.horizon, W, H - view.horizon); }
      if (atmosphere) {
        // Ground distance comes from the same camera projection as the walls.
        // Two-pixel strips match the demo's 320x180 internal rendering grid.
        g.save(); g.fillStyle = atmosphere.color;
        for (let y = view.horizon; y < H; y += 2) {
          const distance = view.f * view.V.eye / Math.max(1, y - view.horizon);
          g.globalAlpha = darkness(distance, atmosphere);
          g.fillRect(0, y, W, 2);
        }
        g.restore();
      }
    }

    for (const it of items) {
      const kind = it.slot.kind;
      const r = view.placed(it);
      const found = lookup(it);
      if (kind === 'actor') {
        const image = found?.img ?? placeholder(it.actor.direction);
        const fog = found && it.actor.distanceShaded ? null : atmosphere;
        const rect = { ...r.full }, source = found?.source;
        if (source) {
          const bodyW = (source[2] - FRAME_PADDING * 2) / FRAME_WIDTH_SCALE;
          const width = rect.w * source[2] / bodyW;
          const ph = rect.h * FRAME_PADDING / (source[3] - FRAME_PADDING * 2);
          rect.x -= (width - rect.w) / 2; rect.w = width;
          rect.y -= ph; rect.h += ph * 2;
        }
        const opacity = it.actor.animation?.opacity ?? 1;
        g.save(); g.globalAlpha = opacity;
        drawFlipped(g, shade(image, it.d + .35, fog), rect.x, rect.y, rect.w, rect.h, false, source);
        g.restore();
        if (picking) targets.stamp(image, source, rect, it.actor.hp > 0 && !it.actor.dyingUntil
          ? { kind: 'actor', id: it.actor.id, actor: it.actor } : null, false, opacity);
      } else if (kind === 'prop') {
        if (shadows && !bare) shadow(g, r.full);
        if (found) {
          drawFlipped(g, shade(found.img, it.d + .35, atmosphere), r.full.x, r.full.y, r.full.w, r.full.h, found.flip);
          if (picking) targets.stamp(found.img, null, r.full, { kind: 'prop',
            id: `prop:${it.prop.entity.x},${it.prop.entity.z}:${it.prop.entity.side}`,
            entity: it.prop.entity, prop: it.prop,
            tooFar: !(it.l === 0 && ((it.d === 0 && it.prop.anchor === 'far') || (it.d === 1 && it.prop.anchor === 'near'))),
          }, found.flip);
        } else { polygon(g, r.poly, FALLBACK.prop); if (picking) targets.block(r.poly); }
      } else if (found) {
        drawFlipped(g, shade(found.img, it.d + .35, atmosphere), r.x, r.y, r.w, r.h, found.flip);
        if (picking) targets.stamp(found.img, null, r, null, found.flip);
      } else {
        polygon(g, r.poly, FALLBACK[kind]); if (picking) targets.block(r.poly);
      }
      if (outlines) polygon(g, r.poly, null, '#ff3af0');
    }
    if (picking) {
      targets.finish();
      const overlay = targets.feedback(targetId); if (overlay) g.drawImage(overlay, 0, 0, W, H);
    }
  }

  function polygon(g, poly, fill, stroke) {
    g.beginPath();
    poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  }

  return { draw, imageFor, hitAt: targets.at, target: targets.get, targets: targets.all };
}
