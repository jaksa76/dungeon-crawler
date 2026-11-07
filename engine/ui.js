// Bottom UI panel (layout B) in the style of docs/concept-toonish.png:
// dark stone blocks, raised bevelled stone frames, chunky bars and labels.
//
//   [portrait] [vitals] [ message log ] [hands / quick] [minimap]
//
// Drawn procedurally on a 640x120 canvas. Not interactive yet.

export const UI_W = 640, UI_H = 120;
const LABEL_FONT = '"Pixelify Sans"';
const LOG_FONT = 'VT323';

const C = {
  text: '#e8dcc0', mid: '#b8acc8', dim: '#8a7f96', gold: '#e8c060', label: '#d8d0e4',
  outline: '#141018', frame: '#6a6270', frameLight: '#a49cae', frameDark: '#3a3440',
  recess: '#0e0c12', recessShadow: '#050407', recessLight: '#26222c',
};

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Dark stone-block wall with a raised ledge along the top.
function background() {
  const c = document.createElement('canvas');
  c.width = UI_W; c.height = UI_H;
  const g = c.getContext('2d'), r = rng(17);
  g.fillStyle = '#17141c'; g.fillRect(0, 0, UI_W, UI_H);
  const rowH = 13;
  for (let y = 6, row = 0; y < UI_H; y += rowH, row++) {
    let x = -(row % 2) * 14 - Math.floor(r() * 8);
    while (x < UI_W) {
      const w = 22 + Math.floor(r() * 14);
      const base = ['#36323e', '#2f2b36', '#3b3743', '#332f3a'][Math.floor(r() * 4)];
      g.fillStyle = base; g.fillRect(x + 1, y + 1, w - 2, rowH - 2);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 1, y + 1, w - 2, 1);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 1, y + rowH - 2, w - 2, 1);
      for (let i = 0; i < w / 3; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.05)';
        g.fillRect(x + 2 + r() * (w - 4), y + 2 + r() * (rowH - 4), 1, 1);
      }
      x += w;
    }
  }
  // top ledge
  g.fillStyle = C.outline; g.fillRect(0, 0, UI_W, 7);
  g.fillStyle = C.frame; g.fillRect(0, 1, UI_W, 4);
  g.fillStyle = C.frameLight; g.fillRect(0, 1, UI_W, 1);
  g.fillStyle = C.frameDark; g.fillRect(0, 4, UI_W, 1);
  for (let x = 0; x < UI_W; x += 2 + Math.floor(r() * 5)) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, 2 + Math.floor(r() * 2), 1, 1); }
  // soft shade under the ledge
  const grd = g.createLinearGradient(0, 7, 0, 14);
  grd.addColorStop(0, 'rgba(0,0,0,0.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 7, UI_W, 7);
  return c;
}

function roundRect(g, x, y, w, h, r, color) {
  g.fillStyle = color;
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
}

// Raised bevelled stone frame around a dark recess. Returns the recess rectangle.
function stoneFrame(g, x, y, w, h, t, r) {
  const rad = Math.max(2, Math.round(t * 0.8));
  roundRect(g, x, y, w, h, rad + 1, C.outline);
  roundRect(g, x + 1, y + 1, w - 2, h - 2, rad, C.frame);
  g.fillStyle = C.frameLight;
  g.fillRect(x + rad, y + 1, w - 2 * rad, 1); g.fillRect(x + 1, y + rad, 1, h - 2 * rad);
  g.fillStyle = C.frameDark;
  g.fillRect(x + rad, y + h - 2, w - 2 * rad, 1); g.fillRect(x + w - 2, y + rad, 1, h - 2 * rad);
  for (let i = 0; i < (w + h) / 2; i++) {
    const px = x + 2 + Math.floor(r() * (w - 4)), py = y + 2 + Math.floor(r() * (h - 4));
    if (px > x + t && px < x + w - t && py > y + t && py < y + h - t) continue;
    g.fillStyle = r() < 0.6 ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.12)';
    g.fillRect(px, py, 1, 1);
  }
  const ix = x + t, iy = y + t, iw = w - 2 * t, ih = h - 2 * t;
  roundRect(g, ix - 1, iy - 1, iw + 2, ih + 2, 2, C.outline);
  g.fillStyle = C.recess; g.fillRect(ix, iy, iw, ih);
  g.fillStyle = C.recessShadow; g.fillRect(ix, iy, iw, 2); g.fillRect(ix, iy, 2, ih);
  g.fillStyle = C.recessLight; g.fillRect(ix + 2, iy + ih - 1, iw - 2, 1); g.fillRect(ix + iw - 1, iy + 2, 1, ih - 2);
  return [ix, iy, iw, ih];
}

function rivet(g, x, y) {
  g.fillStyle = C.outline; g.fillRect(x - 2, y - 1, 4, 2); g.fillRect(x - 1, y - 2, 2, 4);
  g.fillStyle = '#9a8a70'; g.fillRect(x - 1, y - 1, 2, 2);
  g.fillStyle = '#e0d0a8'; g.fillRect(x - 1, y - 1, 1, 1);
}

// Static parts (background and all frames) are drawn once and cached.
function staticLayer(L) {
  const c = background(), g = c.getContext('2d'), r = rng(5);
  L.portraitInner = stoneFrame(g, ...L.portrait, 6, r);
  const [px, py, pw, ph] = L.portrait;
  for (const [x, y] of [[px + 3, py + 3], [px + pw - 4, py + 3], [px + 3, py + ph - 4], [px + pw - 4, py + ph - 4]]) rivet(g, x, y);
  L.logInner = stoneFrame(g, ...L.log, 5, r);
  L.slotInner = L.slots.map((s) => stoneFrame(g, ...s, 4, r));
  L.mapInner = stoneFrame(g, ...L.map, 9, r);
  return c;
}

const LAYOUT = {
  portrait: [8, 11, 102, 102],
  name: [120, 12], hp: [120, 37], mp: [120, 61], gold: [120, 88], barX: 150, barW: 86, barH: 16,
  log: [244, 11, 198, 102],
  slots: [[452, 12, 42, 42], [498, 12, 42, 42], [452, 66, 42, 42], [498, 66, 42, 42]],
  map: [546, 11, 88, 102],
};

export function createUI(canvas, assets) {
  const g = canvas.getContext('2d');
  canvas.width = UI_W; canvas.height = UI_H;
  const portrait = assets['ui/portrait-hero'].image;
  const items = assets['ui/icons-items'].image;
  const L = LAYOUT;
  const base = staticLayer(L);

  // Text with a 1px dark outline all round, like the concept's labels.
  function text(s, x, y, size, color, { font = LABEL_FONT, weight = 700, align = 'left', outline = true } = {}) {
    g.font = `${weight} ${size}px ${font}`; g.textAlign = align; g.textBaseline = 'top';
    if (outline) {
      g.fillStyle = C.outline;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) g.fillText(s, x + dx, y + dy);
    }
    g.fillStyle = color; g.fillText(s, x, y);
  }

  function bar(y, label, value, max, fill, light) {
    text(label, L.hp[0], y, 16, C.label);
    const x = L.barX, w = L.barW, h = L.barH;
    roundRect(g, x, y, w, h, 4, C.outline);
    roundRect(g, x + 1, y + 1, w - 2, h - 2, 3, '#1c1016');
    const fw = Math.round((w - 4) * (value / max));
    if (fw > 0) {
      roundRect(g, x + 2, y + 2, fw, h - 4, 2, fill);
      g.fillStyle = light; g.fillRect(x + 4, y + 3, fw - 4, 2);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 3, y + h - 5, fw - 2, 2);
    }
    text(`${value} / ${max}`, x + w / 2, y, 16, '#ffffff', { font: LOG_FONT, weight: 400, align: 'center' });
  }

  function slot(i, icon, label) {
    const [x, y, w, h] = L.slotInner[i];
    if (icon !== null) {
      const cw = items.width / 4, ch = items.height / 2;
      g.drawImage(items, (icon % 4) * cw, Math.floor(icon / 4) * ch, cw, ch, x + 2, y + 2, w - 4, h - 4);
    }
    if (label) text(label, x + 2, y - 2, 16, C.label, { font: LOG_FONT, weight: 400 });
  }

  function log(state) {
    const [x, y, w, h] = L.logInner, size = 16, line = 16, pad = 5;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.font = `${size}px ${LOG_FONT}`;
    const rows = [], maxRows = Math.floor((h - 2 * pad) / line);
    state.log.slice(-maxRows).forEach((entry, i, all) => {
      const color = i === all.length - 1 ? C.text : i >= all.length - 3 ? C.mid : C.dim;
      let row = '';
      for (const word of entry.split(' ')) {
        const next = row ? `${row} ${word}` : word;
        if (g.measureText(next).width > w - 2 * pad && row) { rows.push({ s: row, color }); row = word; } else row = next;
      }
      rows.push({ s: row, color });
    });
    rows.slice(-maxRows).reverse().forEach((r, age) =>
      text(r.s, x + pad, y + h - pad - line - age * line + 2, size, r.color, { font: LOG_FONT, weight: 400, outline: false }));
    g.restore();
  }

  function minimap(state) {
    const [x, y, w, h] = L.mapInner, cell = 7, view = 7;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
    for (let dz = -view; dz <= view; dz++) {
      for (let dx = -view; dx <= view; dx++) {
        const t = state.world.typeAt(state.tileX + dx, state.tileZ + dz);
        if (!t) continue;
        g.fillStyle = t.wall ? (t.low ? '#4a4256' : '#2c2834') : '#6e6678';
        g.fillRect(cx + dx * cell - 3, cy + dz * cell - 3, cell - 1, cell - 1);
      }
    }
    for (const b of state.world.billboards) {
      const dx = b.entity.x - state.tileX, dz = b.entity.z - state.tileZ;
      g.fillStyle = b.entity.light ? '#ffcf5a' : '#c8a060';
      g.fillRect(Math.round(cx + dx * cell - 1), Math.round(cy + dz * cell - 1), 3, 3);
    }
    g.restore();
    g.save(); g.translate(cx, cy); g.rotate(-state.yaw);
    g.fillStyle = C.outline; g.beginPath(); g.moveTo(0, -7); g.lineTo(6, 6); g.lineTo(-6, 6); g.fill();
    g.fillStyle = '#ff3a20'; g.beginPath(); g.moveTo(0, -5); g.lineTo(4, 4); g.lineTo(-4, 4); g.fill();
    g.restore();
    // compass letters set into the frame
    const [fx, fy, fw, fh] = L.map;
    text('N', fx + fw / 2, fy, 10, C.gold, { align: 'center' });
    text('S', fx + fw / 2, fy + fh - 10, 10, C.gold, { align: 'center' });
    text('W', fx + 5, fy + fh / 2 - 5, 10, C.gold, { align: 'center' });
    text('E', fx + fw - 5, fy + fh / 2 - 5, 10, C.gold, { align: 'center' });
  }

  function draw(state) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(base, 0, 0);

    const [px, py, pw, ph] = L.portraitInner;
    g.drawImage(portrait, px, py, pw, ph);

    const h = state.hero;
    text(h.name, L.name[0], L.name[1], 14, C.gold);
    bar(L.hp[1], 'HP', h.hp, h.maxHp, '#c42424', '#ff6a50');
    bar(L.mp[1], 'MP', h.mp, h.maxMp, '#2454d0', '#6aa8ff');
    // gold: a little coin and the amount
    const [gx, gy] = L.gold;
    g.fillStyle = C.outline; g.beginPath(); g.arc(gx + 6, gy + 7, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d8a830'; g.beginPath(); g.arc(gx + 6, gy + 7, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffe080'; g.fillRect(gx + 4, gy + 4, 2, 2);
    text(`${h.gold}`, gx + 16, gy - 1, 16, C.gold, { font: LOG_FONT, weight: 400 });

    log(state);
    slot(0, state.hands[0], null);
    slot(1, state.hands[1], null);
    slot(2, state.quick[0], '1');
    slot(3, state.quick[1], '2');
    minimap(state);
  }

  return { draw };
}
