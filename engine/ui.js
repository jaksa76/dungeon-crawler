// Classic bottom UI panel, drawn on its own low-res 2D canvas.

export const UI_W = 640, UI_H = 120;

function bevel(g, x, y, w, h, light = '#6a5f78', dark = '#0c0a10') {
  g.fillStyle = dark; g.fillRect(x, y, w, h);
  g.fillStyle = light; g.fillRect(x, y, w - 1, 1); g.fillRect(x, y, 1, h - 1);
  g.fillStyle = '#000'; g.fillRect(x + 2, y + 2, w - 4, h - 4);
}

function bar(g, x, y, w, label, value, max, color) {
  g.fillStyle = '#d8d0e8'; g.font = 'bold 12px monospace'; g.textBaseline = 'middle';
  g.fillText(label, x, y + 7);
  bevel(g, x + 26, y, w, 14);
  g.fillStyle = color; g.fillRect(x + 28, y + 2, (w - 4) * (value / max), 10);
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 28, y + 2, (w - 4) * (value / max), 3);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(`${value} / ${max}`, x + 26 + w / 2, y + 8); g.textAlign = 'left';
}

function sheetIcon(g, sheet, index, x, y, size) {
  const cw = sheet.width / 4, ch = sheet.height / 2;
  g.drawImage(sheet, (index % 4) * cw, Math.floor(index / 4) * ch, cw, ch, x, y, size, size);
}

export function createUI(canvas, assets) {
  const g = canvas.getContext('2d');
  canvas.width = UI_W; canvas.height = UI_H;
  const stone = g.createPattern(assets['ui/panel-stone'].image, 'repeat');

  return function draw(state) {
    g.imageSmoothingEnabled = true;
    g.fillStyle = stone; g.fillRect(0, 0, UI_W, UI_H);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, UI_W, UI_H);
    g.fillStyle = '#7a6f88'; g.fillRect(0, 0, UI_W, 2);

    // portrait
    bevel(g, 8, 10, 100, 100, '#b08a4a', '#3a2a18');
    g.drawImage(assets['ui/portrait-hero'].image, 12, 14, 92, 92);

    bar(g, 116, 28, 120, 'HP', 58, 58, '#c02a2a');
    bar(g, 116, 64, 120, 'MP', 24, 24, '#2a5ac8');

    // actions (top row) and quick-items (bottom row)
    const actions = assets['ui/icons-actions'].image, items = assets['ui/icons-items'].image;
    for (let i = 0; i < 6; i++) { bevel(g, 278 + i * 41, 10, 38, 38); sheetIcon(g, actions, i, 281 + i * 41, 13, 32); }
    g.font = 'bold 9px monospace'; g.fillStyle = '#d8d0e8';
    for (let i = 0; i < 8; i++) {
      const x = 270 + i * 31;
      bevel(g, x, 58, 29, 50); sheetIcon(g, items, i, x + 2, 68, 25);
      g.fillStyle = '#d8d0e8'; g.fillText(String(i + 1), x + 4, 65);
    }

    // minimap
    const mx = 528, my = 8, ms = 104;
    bevel(g, mx, my, ms, ms);
    const cell = 7, view = 7;
    g.save(); g.beginPath(); g.rect(mx + 3, my + 3, ms - 6, ms - 6); g.clip();
    for (let dz = -view; dz <= view; dz++) {
      for (let dx = -view; dx <= view; dx++) {
        const tx = state.tileX + dx, tz = state.tileZ + dz;
        const t = state.world.typeAt(tx, tz);
        if (!t) continue;
        g.fillStyle = t.wall ? '#3a3344' : '#8a8098';
        g.fillRect(mx + ms / 2 + dx * cell - cell / 2, my + ms / 2 + dz * cell - cell / 2, cell - 1, cell - 1);
      }
    }
    for (const e of state.world.billboards) {
      const dx = e.entity.x - state.tileX, dz = e.entity.z - state.tileZ;
      g.fillStyle = e.entity.light ? '#ffcf5a' : '#c8a060';
      g.fillRect(mx + ms / 2 + dx * cell - 1, my + ms / 2 + dz * cell - 1, 3, 3);
    }
    g.restore();
    // player arrow
    g.save(); g.translate(mx + ms / 2, my + ms / 2); g.rotate(-state.yaw);
    g.fillStyle = '#ff3a2a'; g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(-4, 4); g.fill();
    g.restore();
    g.font = 'bold 10px monospace'; g.fillStyle = '#f0d890'; g.textAlign = 'center';
    g.fillText('N', mx + ms / 2, my + 9); g.fillText('S', mx + ms / 2, my + ms - 7);
    g.fillText('W', mx + 8, my + ms / 2); g.fillText('E', mx + ms - 8, my + ms / 2);
    g.textAlign = 'left';
  };
}
