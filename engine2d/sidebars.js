// Phone-landscape HUD: the bottom panel split into a left and a right side bar around the view.
//
//   left   portrait, HP / MP, item slots        (then the move pad, put there by engine/touch.js)
//   right  fullscreen button, minimap, menu icons (then the turn buttons)
//
// The art is cut out of the same painted panel image as the bottom bar (engine/ui.js) and drawn onto small
// canvases, W pixels wide, that are shown at a whole-number multiple (see setScale) with crisp pixels.
// The bars are plain <aside class="sb"> elements, shown only in the landscape layout.

import { drawText, digitRows } from '../engine/bitmapfont.js';
import { extractLetters } from '../engine/ui.js';

const W = 62;               // internal width of both bars
const PAD = 4;              // CSS px around the bar's contents

// Where things are in the panel image, in its own pixels (see game-1/assets/ui/panel.png).
const SRC = {
  portrait: [0, 0, 232, 241],        // portrait window and its frame
  map: [1160, 0, 288, 241],          // minimap window and its frame
  icons: { x: 545, y: 20, w: 99, h: 92, n: 6 },
  slots: { x: 545, y: 130, w: 76, h: 76, pitch: 76, n: 8 },
};

const STYLE = `
.sb { display: none; position: fixed; top: 0; bottom: 0; z-index: 10; box-sizing: border-box; padding: ${PAD}px;
  flex-direction: column; align-items: center; gap: 4px; overflow: hidden; background: #130e15;
  -webkit-user-select: none; user-select: none; touch-action: none; }
.sb-left { left: 0; border-right: 2px solid #4a3b47; }
.sb-right { right: 0; border-left: 2px solid #4a3b47; }
html[data-layout="landscape"] .sb { display: flex; }
.sb canvas { display: block; flex: none; image-rendering: pixelated; }
@media (max-height: 379px) { .sb .sb-slots { display: none; } }
`;

function roundRect(g, x, y, w, h, r, color) {
  g.fillStyle = color;
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
}

function makeCanvas(h, className) {
  const c = document.createElement('canvas');
  c.width = W; c.height = h;
  if (className) c.className = className;
  return c;
}

export function createSideBars({ panel, portrait, layout, font, world, hero, mount = document.body }) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const left = document.createElement('aside'); left.className = 'sb sb-left';
  const right = document.createElement('aside'); right.className = 'sb sb-right';

  const sPortrait = W / SRC.portrait[2], hPortrait = Math.round(SRC.portrait[3] * sPortrait);
  const BAR_H = 9;
  const hud = makeCanvas(hPortrait + 2 + 2 * BAR_H + 1);
  const slots = makeCanvas(31, 'sb-slots');
  const sMap = W / SRC.map[2], hMap = Math.round(SRC.map[3] * sMap);
  const map = makeCanvas(hMap);
  const icons = makeCanvas(39);
  left.append(hud, slots);
  right.append(map, icons);
  mount.append(left, right);

  const letters = extractLetters(panel, layout.letters);
  const [dr0, dr1] = digitRows(font);
  const textY = (mid) => mid - (dr0 + dr1) / 2; // top of a glyph cell so its digits are centred on `mid`

  // A grid of cells cut from a row of the panel, drawn once.
  function grid(canvas, { x, y, w, h, pitch = w, n }, cols, cw, ch, gap) {
    const g = canvas.getContext('2d');
    g.imageSmoothingQuality = 'high';
    for (let i = 0; i < n; i++) {
      const dx = 1 + (i % cols) * cw, dy = Math.floor(i / cols) * (ch + gap);
      g.drawImage(panel, x + pitch * i, y, w, h, dx, dy, cw, ch);
    }
  }
  grid(slots, SRC.slots, 4, 15, 15, 1);
  grid(icons, SRC.icons, 3, 20, 19, 1);

  function bar(g, y, label, value, max, fill, light) {
    const x = 13, w = W - 14, mid = y + BAR_H / 2;
    drawText(g, font, label, 1, textY(mid), '#d9b36a', { outline: '#140c10' });
    roundRect(g, x - 1, y - 1, w + 2, BAR_H + 2, BAR_H / 2 + 1, '#140c10');
    roundRect(g, x, y, w, BAR_H, BAR_H / 2, '#2a1418');
    const fw = Math.max(BAR_H, w * (value / max));
    roundRect(g, x, y, fw, BAR_H, BAR_H / 2, fill);
    roundRect(g, x + BAR_H / 3, y + 1, fw - BAR_H * 2 / 3, BAR_H / 3, BAR_H / 6, light);
    drawText(g, font, `${value}/${max}`, x + w / 2, textY(mid), '#ffffff', { outline: '#140c10', align: 'center' });
  }

  function drawHud() {
    const g = hud.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.clearRect(0, 0, hud.width, hud.height);
    g.drawImage(panel, ...SRC.portrait, 0, 0, W, hPortrait);
    const [px, py, pw, ph] = layout.portrait.map((v) => v * sPortrait);
    const crop = portrait.height * (pw / ph); // cover-fit into the window, as in the bottom bar
    g.drawImage(portrait, (portrait.width - crop) / 2, 0, crop, portrait.height, px, py, pw, ph);
    bar(g, hPortrait + 2, 'HP', hero.hp, hero.maxHp, '#c42424', '#ff7a60');
    bar(g, hPortrait + 2 + BAR_H + 1, 'MP', hero.mp, hero.maxMp, '#2454d0', '#7ab0ff');
  }

  function drawMap(state) {
    const g = map.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.clearRect(0, 0, map.width, map.height);
    g.drawImage(panel, ...SRC.map, 0, 0, W, hMap);
    const [x, y, w, h] = [layout.map[0] - SRC.map[0], layout.map[1] - SRC.map[1], layout.map[2], layout.map[3]].map((v) => Math.round(v * sMap));
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = '#0d0b10'; g.fillRect(x, y, w, h);
    const cell = 4, view = 7, half = Math.floor(cell / 2);
    const cx = Math.round(x + w / 2), cy = Math.round(y + h / 2);
    for (let dz = -view; dz <= view; dz++) {
      for (let dx = -view; dx <= view; dx++) {
        const t = world.typeAt(state.tileX + dx, state.tileZ + dz);
        if (!t) continue;
        g.fillStyle = t.wall ? '#2e2632' : '#7a6a72';
        g.fillRect(cx + dx * cell - half, cy + dz * cell - half, cell - 1, cell - 1);
      }
    }
    for (const b of world.billboards) {
      g.fillStyle = '#e0b040';
      g.fillRect(cx + (b.entity.x - state.tileX) * cell - 1, cy + (b.entity.z - state.tileZ) * cell - 1, 2, 2);
    }
    g.translate(cx, cy); g.rotate(-state.yaw); g.scale(0.5, 0.5);
    g.fillStyle = '#140c10'; g.beginPath(); g.moveTo(0, -7); g.lineTo(6, 6); g.lineTo(-6, 6); g.fill();
    g.fillStyle = '#ff3a20'; g.beginPath(); g.moveTo(0, -5); g.lineTo(4, 4); g.lineTo(-4, 4); g.fill();
    g.restore();
    g.drawImage(letters, ...SRC.map, 0, 0, W, hMap); // the compass letters stay on top of the map
  }

  // Show the bars at `m` CSS pixels per canvas pixel; returns each bar's width in CSS px.
  function setScale(m) {
    for (const c of [hud, slots, map, icons]) { c.style.width = `${W * m}px`; c.style.height = `${c.height * m}px`; }
    const width = W * m + 2 * PAD + 2; // + the border
    left.style.width = right.style.width = `${width}px`;
    return width;
  }

  return { left, right, setScale, draw(state) { drawHud(); drawMap(state); } };
}
