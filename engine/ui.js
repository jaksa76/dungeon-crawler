// Bottom UI panel (layout B), drawn on its own low-res 2D canvas:
//
//   [portrait] [vitals] [ message log ] [hands / quick] [minimap]
//
// Not interactive yet: this is about layout and look.

export const UI_W = 640, UI_H = 120;
const FONT = 'VT323, monospace';

const C = {
  text: '#e8dcc0', dim: '#8a7f96', gold: '#d8b060',
  inset: '#0d0a12', insetLight: '#5a5068', insetDark: '#050308',
};

// A recessed box: dark fill, dark top-left edge, light bottom-right edge.
function inset(g, x, y, w, h) {
  g.fillStyle = C.insetDark; g.fillRect(x, y, w, h);
  g.fillStyle = C.insetLight; g.fillRect(x + 1, y + h - 1, w - 1, 1); g.fillRect(x + w - 1, y + 1, 1, h - 1);
  g.fillStyle = C.inset; g.fillRect(x + 1, y + 1, w - 2, h - 2);
}

function goldFrame(g, x, y, w, h) {
  g.fillStyle = '#3a2410'; g.fillRect(x, y, w, h);
  g.fillStyle = '#b08a4a'; g.fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle = '#e8c878'; g.fillRect(x + 1, y + 1, w - 2, 1); g.fillRect(x + 1, y + 1, 1, h - 2);
  g.fillStyle = '#6a4a20'; g.fillRect(x + 1, y + h - 2, w - 2, 1); g.fillRect(x + w - 2, y + 1, 1, h - 2);
  g.fillStyle = '#3a2410'; g.fillRect(x + 3, y + 3, w - 6, h - 6);
}

function text(g, s, x, y, { size = 16, color = C.text, align = 'left' } = {}) {
  g.font = `${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'top';
  g.fillStyle = '#000'; g.fillText(s, x + 1, y + 1);
  g.fillStyle = color; g.fillText(s, x, y);
}

function bar(g, x, y, w, label, value, max, color) {
  text(g, label, x, y - 1, { size: 16, color: C.gold });
  const bx = x + 22, bw = w - 22;
  inset(g, bx, y, bw, 12);
  const fill = Math.round((bw - 4) * (value / max));
  g.fillStyle = color; g.fillRect(bx + 2, y + 2, fill, 8);
  g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(bx + 2, y + 2, fill, 2);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(bx + 2, y + 8, fill, 2);
  text(g, `${value}/${max}`, bx + bw / 2, y - 1, { size: 14, align: 'center' });
}

function sheetIcon(g, sheet, index, x, y, size) {
  const cw = sheet.width / 4, ch = sheet.height / 2;
  g.drawImage(sheet, (index % 4) * cw, Math.floor(index / 4) * ch, cw, ch, x, y, size, size);
}

function slot(g, x, y, s, sheet, icon, label) {
  inset(g, x, y, s, s);
  if (icon !== null) sheetIcon(g, sheet, icon, x + 3, y + 3, s - 6);
  if (label) text(g, label, x + 3, y + 1, { size: 12, color: C.dim });
}

export function createUI(canvas, assets) {
  const g = canvas.getContext('2d');
  canvas.width = UI_W; canvas.height = UI_H;
  const stone = g.createPattern(assets['ui/panel-stone'].image, 'repeat');
  const portrait = assets['ui/portrait-hero'].image;
  const items = assets['ui/icons-items'].image;

  return function draw(state) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';

    // panel
    g.fillStyle = stone; g.fillRect(0, 0, UI_W, UI_H);
    g.fillStyle = 'rgba(10,6,14,0.45)'; g.fillRect(0, 0, UI_W, UI_H);
    g.fillStyle = '#8a7a60'; g.fillRect(0, 0, UI_W, 1);
    g.fillStyle = '#2a2230'; g.fillRect(0, 1, UI_W, 2);

    // portrait
    goldFrame(g, 8, 9, 104, 104);
    g.drawImage(portrait, 12, 13, 96, 96);

    // vitals
    text(g, state.hero.name, 120, 9, { size: 20, color: C.gold });
    text(g, state.hero.title, 120, 27, { size: 14, color: C.dim });
    bar(g, 120, 50, 112, 'HP', state.hero.hp, state.hero.maxHp, '#c02a2a');
    bar(g, 120, 70, 112, 'MP', state.hero.mp, state.hero.maxMp, '#2a5ac8');
    text(g, `Gold ${state.hero.gold}`, 120, 92, { size: 14, color: C.dim });

    // message log: newest at the bottom, older lines fade
    const lx = 240, ly = 9, lw = 206, lh = 104;
    inset(g, lx, ly, lw, lh);
    g.save(); g.beginPath(); g.rect(lx + 2, ly + 2, lw - 4, lh - 4); g.clip();
    // word-wrap each entry; the newest entry is bright, older ones dim
    g.font = `16px ${FONT}`;
    const rows = [];
    state.log.slice(-6).forEach((entry, i, all) => {
      const color = i === all.length - 1 ? C.text : i >= all.length - 3 ? '#b8acc8' : C.dim;
      let row = '';
      for (const word of entry.split(' ')) {
        const next = row ? `${row} ${word}` : word;
        if (g.measureText(next).width > lw - 12 && row) { rows.push({ s: row, color }); row = word; } else row = next;
      }
      rows.push({ s: row, color });
    });
    rows.slice(-6).reverse().forEach((r, age) => text(g, r.s, lx + 6, ly + lh - 18 - age * 16, { size: 16, color: r.color }));
    g.restore();

    // hands (top) and quick slots (bottom)
    const hx = 454;
    text(g, 'HANDS', hx + 40, 7, { size: 12, color: C.dim, align: 'center' });
    slot(g, hx, 19, 38, items, state.hands[0], null);
    slot(g, hx + 42, 19, 38, items, state.hands[1], null);
    slot(g, hx, 63, 38, items, state.quick[0], '1');
    slot(g, hx + 42, 63, 38, items, state.quick[1], '2');
    text(g, 'QUICK', hx + 40, 103, { size: 12, color: C.dim, align: 'center' });

    // minimap, centred on the player, north up
    const mx = 542, my = 9, ms = 92;
    inset(g, mx, my, ms, ms + 12);
    const cell = 8, view = 6;
    g.save(); g.beginPath(); g.rect(mx + 2, my + 2, ms - 4, ms - 4); g.clip();
    const cx = mx + ms / 2, cy = my + ms / 2;
    for (let dz = -view; dz <= view; dz++) {
      for (let dx = -view; dx <= view; dx++) {
        const t = state.world.typeAt(state.tileX + dx, state.tileZ + dz);
        if (!t) continue;
        g.fillStyle = t.wall ? (t.low ? '#4a4256' : '#2a2434') : '#7a7088';
        g.fillRect(cx + dx * cell - cell / 2, cy + dz * cell - cell / 2, cell - 1, cell - 1);
      }
    }
    for (const b of state.world.billboards) {
      const dx = b.entity.x - state.tileX, dz = b.entity.z - state.tileZ;
      g.fillStyle = b.entity.light ? '#ffcf5a' : '#c8a060';
      g.fillRect(cx + dx * cell - 1, cy + dz * cell - 1, 3, 3);
    }
    g.restore();
    g.save(); g.translate(cx, cy); g.rotate(-state.yaw);
    g.fillStyle = '#ff4a2a'; g.beginPath(); g.moveTo(0, -5); g.lineTo(4, 4); g.lineTo(-4, 4); g.fill();
    g.restore();
    text(g, `Facing ${state.facing}`, mx + ms / 2, my + ms - 2, { size: 14, color: C.gold, align: 'center' });
  };
}
