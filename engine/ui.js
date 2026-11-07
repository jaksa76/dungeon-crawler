// Bottom UI panel (layout B), drawn on its own low-res 2D canvas:
//
//   [portrait] [vitals] [ message log ] [hands / quick] [minimap]
//
// Two layouts share the same building blocks: HI for the 640-wide display and
// LO for 320x200, which uses a pixel font made for 8px sizes.
// Not interactive yet: this is about layout and look.

export const LAYOUTS = {
  hi: {
    w: 640, h: 120, font: 'VT323', stoneTile: 64,
    portrait: [8, 9, 104],
    name: [120, 9, 20], title: [120, 27, 14], gold: [120, 92, 14],
    hp: [120, 50, 112, 12, 16], mp: [120, 70, 112, 12, 16],
    log: { box: [240, 9, 206, 104], size: 16, line: 16, pad: 6 },
    slots: { x: 454, y: 19, s: 38, gap: 4, rowGap: 6, label: 12, captions: true },
    map: { box: [542, 9, 92, 92], cell: 8, view: 6, label: 14, footer: 12, facing: (f) => `Facing ${f}` },
  },
  lo: {
    w: 320, h: 56, font: 'Silkscreen', stoneTile: 32,
    portrait: [3, 4, 48],
    name: [55, 3, 8], title: null, gold: [55, 43, 8],
    hp: [55, 17, 54, 6, 8], mp: [55, 29, 54, 6, 8],
    log: { box: [112, 4, 122, 48], size: 8, line: 9, pad: 3 },
    slots: { x: 238, y: 5, s: 21, gap: 1, rowGap: 2, label: 8, captions: false },
    map: { box: [284, 4, 33, 33], cell: 3, view: 5, label: 8, footer: 11, facing: (f) => f.toUpperCase() },
  },
};

const C = {
  text: '#e8dcc0', mid: '#b8acc8', dim: '#8a7f96', gold: '#d8b060',
  inset: '#0d0a12', insetLight: '#5a5068', insetDark: '#050308',
};

// A recessed box: dark fill, dark top-left edge, light bottom-right edge.
function inset(g, x, y, w, h) {
  g.fillStyle = C.insetDark; g.fillRect(x, y, w, h);
  g.fillStyle = C.insetLight; g.fillRect(x + 1, y + h - 1, w - 1, 1); g.fillRect(x + w - 1, y + 1, 1, h - 1);
  g.fillStyle = C.inset; g.fillRect(x + 1, y + 1, w - 2, h - 2);
}

function goldFrame(g, x, y, s) {
  const b = s > 60 ? 3 : 2;
  g.fillStyle = '#3a2410'; g.fillRect(x, y, s, s);
  g.fillStyle = '#b08a4a'; g.fillRect(x + 1, y + 1, s - 2, s - 2);
  g.fillStyle = '#e8c878'; g.fillRect(x + 1, y + 1, s - 2, 1); g.fillRect(x + 1, y + 1, 1, s - 2);
  g.fillStyle = '#6a4a20'; g.fillRect(x + 1, y + s - 2, s - 2, 1); g.fillRect(x + s - 2, y + 1, 1, s - 2);
  g.fillStyle = '#3a2410'; g.fillRect(x + b, y + b, s - 2 * b, s - 2 * b);
  return b + 1;
}

export function createUI(canvas, assets) {
  const g = canvas.getContext('2d');
  const portrait = assets['ui/portrait-hero'].image;
  const items = assets['ui/icons-items'].image;
  let L, stone, font;

  function text(s, x, y, size, color = C.text, align = 'left') {
    g.font = `${size}px ${font}`; g.textAlign = align; g.textBaseline = 'top';
    g.fillStyle = '#000'; g.fillText(s, x + 1, y + 1);
    g.fillStyle = color; g.fillText(s, x, y);
  }

  function bar([x, y, w, h, size], label, value, max, color) {
    text(label, x, y - Math.round((size - h) / 2) - 1, size, C.gold);
    g.font = `${size}px ${font}`;
    const lw = Math.ceil(g.measureText(label).width) + 3, bx = x + lw, bw = w - lw;
    inset(g, bx, y, bw, h);
    const fill = Math.round((bw - 2) * (value / max));
    g.fillStyle = color; g.fillRect(bx + 1, y + 1, fill, h - 2);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(bx + 1, y + 1, fill, Math.max(1, (h - 2) >> 2));
    if (size >= 12) text(`${value}/${max}`, bx + bw / 2, y - 1, size - 2, C.text, 'center');
  }

  function slot(x, y, s, icon, label) {
    inset(g, x, y, s, s);
    const m = s > 24 ? 3 : 2;
    if (icon !== null) {
      const cw = items.width / 4, ch = items.height / 2;
      g.drawImage(items, (icon % 4) * cw, Math.floor(icon / 4) * ch, cw, ch, x + m, y + m, s - 2 * m, s - 2 * m);
    }
    if (label) text(label, x + 2, y + 1, L.slots.label, C.dim);
  }

  function log(state) {
    const { box: [x, y, w, h], size, line, pad } = L.log;
    inset(g, x, y, w, h);
    g.save(); g.beginPath(); g.rect(x + 2, y + 2, w - 4, h - 4); g.clip();
    g.font = `${size}px ${font}`;
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
    rows.slice(-maxRows).reverse().forEach((r, age) => text(r.s, x + pad, y + h - pad - line - age * line + 1, size, r.color));
    g.restore();
  }

  function minimap(state) {
    const { box: [x, y, w, h], cell, view, label, footer, facing } = L.map;
    inset(g, x, y, w, h + footer);
    g.save(); g.beginPath(); g.rect(x + 1, y + 1, w - 2, h - 2); g.clip();
    const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
    for (let dz = -view; dz <= view; dz++) {
      for (let dx = -view; dx <= view; dx++) {
        const t = state.world.typeAt(state.tileX + dx, state.tileZ + dz);
        if (!t) continue;
        g.fillStyle = t.wall ? (t.low ? '#4a4256' : '#2a2434') : '#7a7088';
        g.fillRect(cx + dx * cell - (cell >> 1), cy + dz * cell - (cell >> 1), cell - (cell > 4 ? 1 : 0), cell - (cell > 4 ? 1 : 0));
      }
    }
    const dot = cell > 4 ? 3 : 1;
    for (const b of state.world.billboards) {
      const dx = b.entity.x - state.tileX, dz = b.entity.z - state.tileZ;
      g.fillStyle = b.entity.light ? '#ffcf5a' : '#c8a060';
      g.fillRect(Math.round(cx + dx * cell - dot / 2), Math.round(cy + dz * cell - dot / 2), dot, dot);
    }
    g.restore();
    const a = cell * 0.6 + 1;
    g.save(); g.translate(cx, cy); g.rotate(-state.yaw);
    g.fillStyle = '#ff4a2a'; g.beginPath(); g.moveTo(0, -a); g.lineTo(a * 0.8, a * 0.8); g.lineTo(-a * 0.8, a * 0.8); g.fill();
    g.restore();
    text(facing(state.facing), x + w / 2, y + h + Math.round((footer - label) / 2), label, C.gold, 'center');
  }

  function draw(state) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';

    // panel
    g.fillStyle = stone; g.fillRect(0, 0, L.w, L.h);
    g.fillStyle = 'rgba(10,6,14,0.45)'; g.fillRect(0, 0, L.w, L.h);
    g.fillStyle = '#8a7a60'; g.fillRect(0, 0, L.w, 1);
    g.fillStyle = '#2a2230'; g.fillRect(0, 1, L.w, 1);

    // portrait
    const [px, py, ps] = L.portrait;
    const b = goldFrame(g, px, py, ps);
    g.drawImage(portrait, px + b, py + b, ps - 2 * b, ps - 2 * b);

    // vitals
    const h = state.hero;
    text(h.name, L.name[0], L.name[1], L.name[2], C.gold);
    if (L.title) text(h.title, L.title[0], L.title[1], L.title[2], C.dim);
    bar(L.hp, 'HP', h.hp, h.maxHp, '#c02a2a');
    bar(L.mp, 'MP', h.mp, h.maxMp, '#2a5ac8');
    text(`Gold ${h.gold}`, L.gold[0], L.gold[1], L.gold[2], C.dim);

    log(state);

    // hands (top row) and quick slots (bottom row)
    const { x: sx, y: sy, s, gap, rowGap, captions } = L.slots;
    if (captions) {
      text('HANDS', sx + s + gap / 2, sy - 12, 12, C.dim, 'center');
      text('QUICK', sx + s + gap / 2, sy + 2 * s + rowGap + 2, 12, C.dim, 'center');
    }
    slot(sx, sy, s, state.hands[0], null);
    slot(sx + s + gap, sy, s, state.hands[1], null);
    slot(sx, sy + s + rowGap, s, state.quick[0], '1');
    slot(sx + s + gap, sy + s + rowGap, s, state.quick[1], '2');

    minimap(state);
  }

  function setLayout(name) {
    L = LAYOUTS[name];
    font = L.font;
    canvas.width = L.w; canvas.height = L.h;
    // Pre-scale the stone so its block size suits the panel resolution.
    const src = assets['ui/panel-stone'].image, t = document.createElement('canvas');
    t.width = t.height = L.stoneTile;
    const tg = t.getContext('2d');
    tg.imageSmoothingQuality = 'high';
    tg.drawImage(src, 0, 0, L.stoneTile, L.stoneTile);
    stone = g.createPattern(t, 'repeat');
  }

  setLayout('hi');
  return { draw, setLayout };
}
