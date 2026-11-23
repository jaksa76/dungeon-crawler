import { drawText } from '../engine/bitmapfont.js';
import { font5x8 as FONT } from '../engine/font-5x8.js';

// An opaque ID buffer follows the same draw order and alpha silhouettes as the
// scene. Walls overwrite IDs, so a hidden monster is never clickable.
export function createSceneTargets(W, H) {
  const canvas = document.createElement('canvas'), overlay = document.createElement('canvas');
  let g, pixels, regions = [], visible = new Set(), sx = 1, sy = 1;
  const masks = new WeakMap(), colour = document.createElement('canvas');
  function mask(image, source) {
    const rect = source ?? [0, 0, image.width, image.height], key = rect.join(',');
    let cache = masks.get(image); if (!cache) masks.set(image, cache = new Map());
    if (!cache.has(key)) {
      const c = document.createElement('canvas'); c.width = Math.max(1, rect[2]); c.height = Math.max(1, rect[3]);
      const cg = c.getContext('2d', { willReadFrequently: true }); cg.drawImage(image, ...rect, 0, 0, c.width, c.height);
      const data = cg.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < data.data.length; i += 4) {
        data.data[i] = data.data[i + 1] = data.data[i + 2] = 255;
        data.data[i + 3] = data.data[i + 3] >= 48 ? 255 : 0;
      }
      cg.putImageData(data, 0, 0); cache.set(key, c);
    }
    return cache.get(key);
  }
  function begin(width, height) {
    canvas.width = width; canvas.height = height; sx = width / W; sy = height / H;
    g = canvas.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false;
    g.setTransform(sx, 0, 0, sy, 0, 0); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    regions = []; visible = new Set(); pixels = null;
  }
  function stamp(image, source, rect, target = null, flip = false, opacity = 1) {
    if (opacity < .2) return;
    const index = target ? regions.push({ ...target, rect }) : 0;
    const m = mask(image, source); colour.width = m.width; colour.height = m.height;
    const cg = colour.getContext('2d'); cg.drawImage(m, 0, 0); cg.globalCompositeOperation = 'source-in';
    cg.fillStyle = `rgb(${index & 255},${(index >> 8) & 255},${(index >> 16) & 255})`; cg.fillRect(0, 0, colour.width, colour.height);
    g.save();
    if (flip) { g.translate(rect.x + rect.w, rect.y); g.scale(-1, 1); g.drawImage(colour, 0, 0, rect.w, rect.h); }
    else g.drawImage(colour, rect.x, rect.y, rect.w, rect.h);
    g.restore();
  }
  function block(poly) {
    g.fillStyle = '#000'; g.beginPath(); poly.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill();
  }
  function finish() {
    pixels = g.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixels.length; i += 4) {
      const id = pixels[i] | pixels[i + 1] << 8 | pixels[i + 2] << 16; if (id) visible.add(id);
    }
  }
  const indexAt = (x, y) => {
    if (!pixels || x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return 0;
    const i = (y * canvas.width + x) * 4; return pixels[i] | pixels[i + 1] << 8 | pixels[i + 2] << 16;
  };
  function feedback(targetId) {
    const index = regions.findIndex((r, i) => r.id === targetId && visible.has(i + 1)) + 1;
    if (!index) return null;
    const target = regions[index - 1]; overlay.width = canvas.width; overlay.height = canvas.height;
    const cg = overlay.getContext('2d'), data = cg.createImageData(canvas.width, canvas.height);
    let left = canvas.width, right = 0, top = canvas.height;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if (indexAt(x, y) === index) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y);
      if ([[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => indexAt(x + dx, y + dy) !== index)) {
        const i = (y * canvas.width + x) * 4; data.data.set([244, 210, 127, 255], i);
      }
    }
    cg.putImageData(data, 0, 0);
    if (target.kind === 'actor') {
      const label = `${target.actor.name} ${target.actor.hp}/${target.actor.maxHp}`;
      const width = Math.min(canvas.width - 8, 156, Math.max(46, label.length * FONT.w, right - left + 8));
      const x = Math.max(2, Math.min(canvas.width - width - 2, Math.round((left + right - width) / 2)));
      const y = Math.max(1, top - 15), actor = target.actor;
      cg.fillStyle = '#100c12e8'; cg.fillRect(x - 2, y, width + 4, 14);
      const name = label.slice(0, Math.floor(width / FONT.w));
      drawText(cg, FONT, name, x, y, '#ffe5ae');
      cg.fillStyle = '#43252b'; cg.fillRect(x, y + 10, width, 3);
      cg.fillStyle = '#df6554'; cg.fillRect(x, y + 10, Math.round(width * actor.hp / actor.maxHp), 3);
    }
    return overlay;
  }
  return { begin, stamp, block, finish, feedback,
    at: (x, y) => regions[indexAt(Math.floor(x * sx), Math.floor(y * sy)) - 1] ?? null,
    get: id => regions.find((r, i) => r.id === id && visible.has(i + 1)) ?? null,
    all: () => regions.filter((_, i) => visible.has(i + 1)),
  };
}
