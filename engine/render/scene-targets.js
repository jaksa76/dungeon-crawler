import { drawText } from '../ui/bitmapfont.js';
import { font5x8 as FONT } from '../ui/font-5x8.js';

// An opaque ID buffer follows the same draw order and alpha silhouettes as the
// scene. Walls overwrite IDs, so a hidden monster is never clickable.
// Silhouettes are scaled and thresholded first, then copied 1:1 at whole-pixel positions: a browser that blends a
// scaled or fractionally placed image at its edges would otherwise mix two IDs into a third object's ID. IDs are also
// spread over the colour space and matched exactly, so any blended pixel that remains reads as nothing.
const CODE_STEP = 0x9E3779; // odd, so codes are distinct for every index below 2^24
export function createSceneTargets(W, H) {
  const canvas = document.createElement('canvas'), overlay = document.createElement('canvas');
  let g, pixels, regions = [], visible = new Set(), sx = 1, sy = 1;
  const masks = new WeakMap(), colour = document.createElement('canvas'), codes = new Map();
  const codeOf = index => index ? (index * CODE_STEP) & 0xffffff || 1 : 0;
  function mask(image, source, w, h, flip) {
    const rect = source ?? [0, 0, image.width, image.height], key = `${rect.join(',')}:${w}x${h}${flip ? ':f' : ''}`;
    let cache = masks.get(image); if (!cache) masks.set(image, cache = new Map());
    if (!cache.has(key)) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const cg = c.getContext('2d', { willReadFrequently: true });
      if (flip) { cg.translate(w, 0); cg.scale(-1, 1); }
      cg.drawImage(image, ...rect, 0, 0, w, h);
      const data = cg.getImageData(0, 0, w, h);
      for (let i = 0; i < data.data.length; i += 4) {
        data.data[i] = data.data[i + 1] = data.data[i + 2] = 255;
        data.data[i + 3] = data.data[i + 3] >= 48 ? 255 : 0;
      }
      cg.setTransform(1, 0, 0, 1, 0, 0); cg.putImageData(data, 0, 0); cache.set(key, c);
    }
    return cache.get(key);
  }
  function begin(width, height) {
    canvas.width = width; canvas.height = height; sx = width / W; sy = height / H;
    g = canvas.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false;
    g.fillStyle = '#000'; g.fillRect(0, 0, width, height);
    regions = []; visible = new Set(); pixels = null; codes.clear();
  }
  function stamp(image, source, rect, target = null, flip = false, opacity = 1) {
    if (opacity < .2) return;
    const x = Math.round(rect.x * sx), y = Math.round(rect.y * sy);
    const w = Math.round((rect.x + rect.w) * sx) - x, h = Math.round((rect.y + rect.h) * sy) - y;
    if (w < 1 || h < 1) return;
    const index = target ? regions.push({ ...target, rect }) : 0, code = codeOf(index);
    if (index) codes.set(code, index);
    const m = mask(image, source, w, h, flip); colour.width = w; colour.height = h;
    const cg = colour.getContext('2d'); cg.drawImage(m, 0, 0); cg.globalCompositeOperation = 'source-in';
    cg.fillStyle = `rgb(${code & 255},${(code >> 8) & 255},${(code >> 16) & 255})`; cg.fillRect(0, 0, w, h);
    g.drawImage(colour, x, y);
  }
  function block(poly) {
    g.save(); g.setTransform(sx, 0, 0, sy, 0, 0);
    g.fillStyle = '#000'; g.beginPath(); poly.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill();
    g.restore();
  }
  function finish() {
    pixels = g.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixels.length; i += 4) {
      const index = codes.get(pixels[i] | pixels[i + 1] << 8 | pixels[i + 2] << 16); if (index) visible.add(index);
    }
  }
  const indexAt = (x, y) => {
    if (!pixels || x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return 0;
    const i = (y * canvas.width + x) * 4; return codes.get(pixels[i] | pixels[i + 1] << 8 | pixels[i + 2] << 16) ?? 0;
  };
  function feedback(targetId) {
    const index = regions.findIndex((r, i) => r.id === targetId && visible.has(i + 1)) + 1;
    if (!index) return null;
    const target = regions[index - 1]; overlay.width = canvas.width; overlay.height = canvas.height;
    const cg = overlay.getContext('2d'), data = cg.createImageData(canvas.width, canvas.height);
    let left = canvas.width, right = 0, top = canvas.height;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if (indexAt(x, y) === index) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y);
      // Edges against another clickable object are where that object stands in front: leave them unlined, or
      // the outline traces the occluder's shape and it looks highlighted too.
      if ([[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => indexAt(x + dx, y + dy) === 0)) {
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
