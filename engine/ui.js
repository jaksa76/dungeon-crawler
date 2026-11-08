// Bottom UI panel: a painted panel image with the variable parts drawn on top.
//
// The game supplies the image and the regions to overwrite (measured in the
// image's own pixels): portrait window, HP/MP bars, minimap window, and the
// compass letters to keep on top of the map. Everything is drawn on a canvas
// `width` px wide (640 unless asked otherwise); its height follows the image's aspect
// ratio. `height` is what the canvas would measure at UI_W, i.e. its height when shown
// at the same size as a UI_W-wide canvas, whatever its own resolution.

import { drawText, digitRows } from './bitmapfont.js';

export const UI_W = 640;
const FONT = 'VT323';

function roundRect(g, x, y, w, h, r, color) {
  g.fillStyle = color;
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
}

// Copy only the letters (gold pixels and their dark outline) out of the panel,
// so they can be stamped back over the live minimap.
function extractLetters(panel, rects) {
  const c = document.createElement('canvas');
  c.width = panel.width; c.height = panel.height;
  const g = c.getContext('2d');
  g.drawImage(panel, 0, 0);
  const out = g.createImageData(panel.width, panel.height);
  for (const [x0, y0, w, h] of rects) {
    const d = g.getImageData(x0, y0, w, h).data;
    const gold = (i) => d[i] > 170 && d[i + 1] > 130 && d[i + 2] < 130;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let keep = gold(i);
      if (!keep && d[i] + d[i + 1] + d[i + 2] < 150) {
        for (let dy = -2; dy <= 2 && !keep; dy++) for (let dx = -2; dx <= 2 && !keep; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && gold((ny * w + nx) * 4)) keep = true;
        }
      }
      if (!keep) continue;
      const o = ((y0 + y) * panel.width + x0 + x) * 4;
      out.data.set([d[i], d[i + 1], d[i + 2], 255], o);
    }
  }
  g.clearRect(0, 0, c.width, c.height);
  g.putImageData(out, 0, 0);
  return c;
}

// `font`: an optional bitmap font (engine/bitmapfont.js) for the numbers, instead of the VT323 web font. Use
// it for a small canvas, where a scalable font is too blurry to read.
export function createUI(canvas, assets, layout, { width = UI_W, font } = {}) {
  const g = canvas.getContext('2d');
  const panel = assets[layout.image].image;
  const s = width / panel.width;                     // panel pixels -> canvas pixels
  const k = width / UI_W;                            // sizes written for a UI_W-wide canvas -> this canvas
  const H = Math.round(panel.height * s);
  canvas.width = width; canvas.height = H;
  const R = (r) => r.map((v) => v * s);               // scale a region
  const portrait = assets['ui/portrait-hero'].image;
  const letters = extractLetters(panel, layout.letters);

  function text(str, x, y, size, color, align = 'left') {
    if (font) { // x, y: the middle of the text
      const [r0, r1] = digitRows(font);
      drawText(g, font, str, x, y - (r0 + r1) / 2, color, { outline: '#140c10', align });
      return;
    }
    g.font = `${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle';
    g.fillStyle = '#140c10';
    const o = Math.max(1, Math.round(k)); // outline thickness, whole pixels
    for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) g.fillText(str, x + dx, y + dy);
    g.fillStyle = color; g.fillText(str, x, y);
  }

  function bar(region, value, max, fill, light) {
    const [x, y, w, h] = font ? R(region).map(Math.round) : R(region); // pixel-aligned on a small canvas
    const b = Math.max(1, Math.round(k)); // border thickness
    roundRect(g, x - b, y - b, w + 2 * b, h + 2 * b, h / 2 + b, '#140c10');
    roundRect(g, x, y, w, h, h / 2, '#2a1418');
    const fw = Math.max(h, w * (value / max));
    roundRect(g, x, y, fw, h, h / 2, fill);
    roundRect(g, x + h / 3, y + b, fw - h * 2 / 3, h / 3, h / 6, light);
    text(`${value} / ${max}`, x + w / 2, y + h / 2 + (font ? 0 : 1), Math.round(h * 1.3), '#ffffff', 'center');
  }

  function minimap(state) {
    const [x, y, w, h] = R(layout.map);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = '#0d0b10'; g.fillRect(x, y, w, h);
    const cell = Math.max(2, Math.round(7 * k)), view = 9, half = Math.floor(cell / 2);
    const cx = Math.round(x + w / 2), cy = Math.round(y + h / 2);
    for (let dz = -view; dz <= view; dz++) {
      for (let dx = -view; dx <= view; dx++) {
        const t = state.world.typeAt(state.tileX + dx, state.tileZ + dz);
        if (!t) continue;
        g.fillStyle = t.wall ? (t.low ? '#5a4e5e' : '#2e2632') : '#7a6a72';
        g.fillRect(cx + dx * cell - half, cy + dz * cell - half, cell - 1, cell - 1);
      }
    }
    for (const b of state.world.billboards) {
      if (!b.entity.name) continue; // scenery
      const dx = b.entity.x - state.tileX, dz = b.entity.z - state.tileZ;
      g.fillStyle = b.entity.light ? '#ffcf5a' : '#e0b040';
      const m = Math.max(2, Math.round(3 * k));
      g.fillRect(Math.round(cx + dx * cell - m / 2), Math.round(cy + dz * cell - m / 2), m, m);
    }
    g.translate(cx, cy); g.rotate(-state.yaw); g.scale(k, k);
    g.fillStyle = '#140c10'; g.beginPath(); g.moveTo(0, -7); g.lineTo(6, 6); g.lineTo(-6, 6); g.fill();
    g.fillStyle = '#ff3a20'; g.beginPath(); g.moveTo(0, -5); g.lineTo(4, 4); g.lineTo(-4, 4); g.fill();
    g.restore();
  }

  function draw(state) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(panel, 0, 0, width, H);

    // portrait: cover-fit into the window
    const [px, py, pw, ph] = R(layout.portrait);
    const crop = portrait.height * (pw / ph);
    g.drawImage(portrait, (portrait.width - crop) / 2, 0, crop, portrait.height, px, py, pw, ph);

    bar(layout.hp, state.hero.hp, state.hero.maxHp, '#c42424', '#ff7a60');
    bar(layout.mp, state.hero.mp, state.hero.maxMp, '#2454d0', '#7ab0ff');
    minimap(state);
    g.drawImage(letters, 0, 0, width, H);
  }

  return { draw, height: Math.round(panel.height * UI_W / panel.width) };
}
