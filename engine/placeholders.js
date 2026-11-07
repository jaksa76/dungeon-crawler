// Procedural placeholder art, used whenever a real asset file is missing.
// Everything is drawn at low resolution so it reads as pixel art.

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `rgb(${r},${g},${b})`;
}

function px(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function speckle(g, r, x, y, w, h, colors, n) {
  for (let i = 0; i < n; i++) px(g, x + r() * w, y + r() * h, 1, 1, colors[Math.floor(r() * colors.length)]);
}

// Rows of irregular blocks that tile horizontally.
function blocks(g, r, x0, y0, w, h, rowH, minW, maxW, palette, mortar) {
  px(g, x0, y0, w, h, mortar);
  for (let y = y0; y < y0 + h; y += rowH) {
    let x = -Math.floor(r() * maxW);
    while (x < w) {
      const bw = minW + Math.floor(r() * (maxW - minW));
      const base = palette[Math.floor(r() * palette.length)];
      for (const ox of [0, w]) {
        const bx = x0 + x + 1 - ox, by = y + 1, bww = bw - 2, bh = Math.min(rowH, y0 + h - y) - 2;
        if (bx + bww < x0 || bx > x0 + w) continue;
        px(g, bx, by, bww, bh, base);
        px(g, bx, by, bww, 1, shade(base, 1.25));
        px(g, bx, by + bh - 1, bww, 1, shade(base, 0.7));
        px(g, bx, by, 1, 1, mortar);
        px(g, bx + bww - 1, by, 1, 1, mortar);
        speckle(g, r, bx, by, bww, bh, [shade(base, 0.85), shade(base, 1.1)], (bww * bh) / 12);
      }
      x += bw;
    }
  }
}

function glowWindow(g, x, y, w, h, panes = 2) {
  px(g, x - 2, y - 2, w + 4, h + 4, '#2a1a10');
  px(g, x, y, w, h, '#ffc84a');
  px(g, x + 2, y + 2, w - 4, h / 2, '#ffe9a0');
  const step = w / panes;
  for (let i = 1; i < panes; i++) px(g, x + i * step - 1, y, 2, h, '#3a2416');
  px(g, x, y + h / 2 - 1, w, 2, '#3a2416');
}

// ---------- environment ----------

function cobble() {
  const c = canvas(128, 128), g = c.getContext('2d'), r = rng(7);
  blocks(g, r, 0, 0, 128, 128, 16, 14, 26, ['#5d5470', '#544b66', '#675d7a', '#4c445c', '#5a5068'], '#1f1a29');
  speckle(g, r, 0, 0, 128, 128, ['#3f5a3a', '#4b6a40'], 40);
  return c;
}

function roof() {
  const c = canvas(64, 64), g = c.getContext('2d'), r = rng(3);
  px(g, 0, 0, 64, 64, '#3a1c16');
  for (let y = 0; y < 64; y += 8) {
    const off = (y / 8) % 2 ? 4 : 0;
    for (let x = -8; x < 64; x += 8) {
      const base = ['#7a3b2e', '#6e3428', '#84432f', '#5e3a2a'][Math.floor(r() * 4)];
      px(g, x + off, y, 7, 7, base);
      px(g, x + off, y + 6, 7, 1, shade(base, 0.6));
      px(g, x + off, y, 7, 1, shade(base, 1.2));
    }
  }
  speckle(g, r, 0, 0, 64, 64, ['#4b5a32'], 20);
  return c;
}

function facade(kind) {
  const c = canvas(128, 192), g = c.getContext('2d'), r = rng(hashString(kind));
  const beam = '#3a2416';
  px(g, 0, 0, 128, 192, '#c4ae88');
  speckle(g, r, 0, 0, 128, 150, ['#b39e7a', '#d1bd98'], 500);
  blocks(g, r, 0, 150, 128, 42, 14, 18, 30, ['#6a6170', '#5c5466', '#71687a'], '#2a2430');
  px(g, 0, 0, 6, 150, beam); px(g, 122, 0, 6, 150, beam);
  px(g, 0, 0, 128, 7, beam); px(g, 0, 86, 128, 8, beam); px(g, 0, 144, 128, 6, beam);

  if (kind === 'b') {
    g.strokeStyle = beam; g.lineWidth = 5;
    g.beginPath(); g.moveTo(6, 86); g.lineTo(36, 7); g.moveTo(122, 86); g.lineTo(92, 7); g.stroke();
  } else {
    px(g, 61, 7, 6, 79, beam);
  }

  if (kind === 'a') { glowWindow(g, 18, 26, 34, 40); glowWindow(g, 76, 26, 34, 40); glowWindow(g, 46, 104, 36, 30); }
  if (kind === 'b') {
    glowWindow(g, 44, 26, 40, 40, 3);
    px(g, 38, 68, 52, 8, '#5a3420');
    for (let i = 0; i < 18; i++) px(g, 40 + r() * 48, 62 + r() * 8, 3, 3, ['#ff6fae', '#e8508f', '#3f7a3a'][i % 3]);
    for (let i = 0; i < 160; i++) px(g, 6 + r() * 16 * (1 - (i % 40) / 60), 20 + r() * 128, 2, 2, ['#2f5a2a', '#3f7a35'][i % 2]);
    glowWindow(g, 50, 104, 28, 30);
  }
  if (kind === 'door') {
    glowWindow(g, 44, 26, 40, 40, 3);
    px(g, 40, 108, 48, 84, '#2a1a10');
    g.fillStyle = '#2a1a10'; g.beginPath(); g.arc(64, 110, 24, Math.PI, 0); g.fill();
    g.fillStyle = '#6b4226'; g.beginPath(); g.arc(64, 112, 20, Math.PI, 0); g.fill();
    px(g, 44, 112, 40, 80, '#6b4226');
    for (let x = 50; x < 84; x += 8) px(g, x, 96, 1, 96, '#4a2c18');
    for (const y of [124, 160]) for (let x = 48; x < 84; x += 8) px(g, x, y, 2, 2, '#9a9aa8');
    px(g, 76, 140, 3, 3, '#c9a24a');
  }
  if (kind === 'alchemist') {
    glowWindow(g, 44, 26, 40, 40, 3);
    px(g, 14, 98, 100, 44, '#2a1a10');
    px(g, 16, 100, 96, 40, '#ffcf6a');
    for (let s = 0; s < 3; s++) {
      px(g, 16, 110 + s * 12, 96, 2, '#5a3420');
      for (let x = 20; x < 108; x += 7) px(g, x, 104 + s * 12, 4, 6, ['#d0303a', '#3a6ad8', '#3ab060', '#a040d0'][Math.floor(r() * 4)]);
    }
    px(g, 8, 70, 30, 4, '#2a1a10'); px(g, 10, 74, 26, 20, '#6b4226'); px(g, 21, 78, 4, 4, '#c8c8d8'); px(g, 18, 82, 10, 9, '#d0303a');
  }
  if (kind === 'smith') {
    glowWindow(g, 44, 26, 40, 40, 3);
    px(g, 24, 100, 80, 50, '#1a0e0a');
    const grd = g.createRadialGradient(64, 145, 2, 64, 145, 40);
    grd.addColorStop(0, '#ff9a2a'); grd.addColorStop(1, 'rgba(60,20,10,0)');
    g.fillStyle = grd; g.fillRect(24, 100, 80, 50);
    px(g, 50, 132, 28, 6, '#1a1a1e'); px(g, 58, 138, 12, 10, '#1a1a1e');
    px(g, 16, 100, 8, 50, '#6b4226'); px(g, 104, 100, 8, 50, '#6b4226');
    px(g, 88, 66, 32, 4, '#2a1a10'); px(g, 90, 70, 28, 22, '#6b4226');
    g.strokeStyle = '#d8c070'; g.lineWidth = 2; g.beginPath(); g.moveTo(94, 74); g.lineTo(114, 88); g.moveTo(114, 74); g.lineTo(94, 88); g.stroke();
  }
  return c;
}

function stoneWall() {
  const c = canvas(128, 192), g = c.getContext('2d'), r = rng(11);
  blocks(g, r, 0, 0, 128, 192, 24, 28, 48, ['#5b5266', '#514a5c', '#655b70', '#4a4355'], '#231e2b');
  speckle(g, r, 0, 0, 128, 192, ['#3f5a3a', '#4b6a40'], 120);
  return c;
}

function parapet() {
  const c = canvas(192, 128), g = c.getContext('2d'), r = rng(5);
  blocks(g, r, 0, 74, 192, 54, 18, 24, 40, ['#5b5266', '#514a5c', '#655b70'], '#231e2b');
  px(g, 0, 64, 192, 10, '#7a7088'); px(g, 0, 64, 192, 2, '#958aa5'); px(g, 0, 72, 192, 2, '#463f52');
  return c;
}

// ---------- backdrop ----------

function sky() {
  const c = canvas(256, 128), g = c.getContext('2d'), r = rng(21);
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#0a0820'); grd.addColorStop(0.6, '#2a1f52'); grd.addColorStop(1, '#4a3478');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
  speckle(g, r, 0, 0, 256, 80, ['#ffffff', '#cbbcff', '#8f80c8'], 140);
  for (let i = 0; i < 9; i++) {
    const x = r() * 256, y = 50 + r() * 40, w = 30 + r() * 50;
    for (const ox of [0, -256, 256]) {
      g.fillStyle = 'rgba(110,90,170,0.35)';
      g.beginPath(); g.ellipse(x + ox, y, w, 4 + r() * 4, 0, 0, Math.PI * 2); g.fill();
    }
  }
  return c;
}

function ridge(g, r, base, amp, color, periods) {
  const phases = periods.map(() => r() * Math.PI * 2);
  g.fillStyle = color;
  for (let x = 0; x < 256; x++) {
    let y = base;
    periods.forEach((p, i) => (y -= Math.sin((x / 256) * Math.PI * 2 * p + phases[i]) * amp / (i + 1)));
    g.fillRect(x, Math.round(y), 1, 128 - Math.round(y));
  }
}

function hills() {
  const c = canvas(256, 128), g = c.getContext('2d'), r = rng(31);
  ridge(g, r, 84, 10, '#2e2650', [2, 5, 11]);
  for (let i = 0; i < 40; i++) {
    const x = r() * 256, y = 84 + r() * 30;
    g.fillStyle = '#231d40'; g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x - 3, y); g.lineTo(x + 3, y); g.fill();
  }
  return c;
}

function treeline() {
  const c = canvas(256, 128), g = c.getContext('2d'), r = rng(41);
  ridge(g, r, 104, 3, '#161126', [3, 7]);
  for (let i = 0; i < 60; i++) {
    const x = r() * 256, h = 10 + r() * 22, y = 104;
    g.fillStyle = '#161126';
    if (r() < 0.6) { g.beginPath(); g.moveTo(x, y - h); g.lineTo(x - h / 3, y); g.lineTo(x + h / 3, y); g.fill(); }
    else { g.beginPath(); g.arc(x, y - h / 2, h / 2.5, 0, Math.PI * 2); g.fill(); }
    px(g, x, y - h, 1, 1, '#3a3160');
  }
  for (const x of [40, 150, 210]) {
    px(g, x, 92, 20, 14, '#161126');
    g.beginPath(); g.moveTo(x - 3, 92); g.lineTo(x + 10, 82); g.lineTo(x + 23, 92); g.fill();
    px(g, x + 15, 80, 3, 8, '#161126');
    px(g, x + 6, 96, 2, 2, '#ffc84a');
  }
  return c;
}

function moon() {
  const c = canvas(64, 64), g = c.getContext('2d'), r = rng(51);
  const grd = g.createRadialGradient(32, 32, 10, 32, 32, 32);
  grd.addColorStop(0, 'rgba(200,180,255,0.6)'); grd.addColorStop(1, 'rgba(120,90,200,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#e6dcff'; g.beginPath(); g.arc(32, 32, 14, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 8; i++) px(g, 22 + r() * 18, 22 + r() * 18, 2 + r() * 3, 2 + r() * 2, '#c6b8ef');
  return c;
}

function castle() {
  const c = canvas(128, 96), g = c.getContext('2d'), r = rng(61);
  g.fillStyle = '#1e1733';
  g.beginPath(); g.moveTo(0, 96); g.quadraticCurveTo(30, 58, 64, 56); g.quadraticCurveTo(100, 58, 128, 96); g.fill();
  const body = '#2a1f45';
  px(g, 40, 36, 48, 24, body);
  for (const [x, w, h] of [[36, 8, 40], [56, 12, 52], [84, 8, 36], [70, 6, 44], [48, 6, 34]]) {
    px(g, x, 60 - h, w, h, body);
    g.fillStyle = body; g.beginPath(); g.moveTo(x - 1, 60 - h); g.lineTo(x + w / 2, 60 - h - w * 1.6); g.lineTo(x + w + 1, 60 - h); g.fill();
  }
  speckle(g, r, 40, 16, 48, 40, ['#b46cff', '#d79bff'], 14);
  return c;
}

function waterfall() {
  const c = canvas(128, 96), g = c.getContext('2d'), r = rng(71);
  px(g, 0, 20, 128, 76, 'rgba(0,0,0,0)');
  g.fillStyle = '#1c1630'; g.beginPath(); g.moveTo(60, 96); g.lineTo(66, 20); g.lineTo(128, 10); g.lineTo(128, 96); g.fill();
  for (let i = 0; i < 300; i++) px(g, 74 + r() * 26, 20 + r() * 76, 1, 3 + r() * 6, ['#cfe0ff', '#8fb0e8', '#ffffff'][i % 3]);
  px(g, 0, 40, 64, 8, '#2c2442');
  for (let x = 2; x < 64; x += 14) { px(g, x, 48, 4, 48, '#2c2442'); }
  return c;
}

// ---------- sprites ----------

function guard() {
  const c = canvas(64, 112), g = c.getContext('2d');
  px(g, 16, 2, 2, 110, '#6b4226'); px(g, 14, 0, 6, 8, '#c8c8d8');
  px(g, 24, 92, 7, 20, '#3a2c20'); px(g, 34, 92, 7, 20, '#3a2c20');
  px(g, 22, 44, 22, 50, '#7f8496'); px(g, 24, 46, 18, 22, '#b8bccb');
  px(g, 18, 46, 6, 24, '#7f8496'); px(g, 15, 60, 6, 6, '#e0b090');
  px(g, 27, 30, 12, 13, '#e0b090'); px(g, 30, 35, 2, 2, '#2a1a10'); px(g, 35, 35, 2, 2, '#2a1a10');
  px(g, 25, 24, 16, 9, '#a0a5b5'); px(g, 25, 31, 16, 2, '#6a6e7c');
  px(g, 30, 12, 8, 13, '#c8202a'); px(g, 36, 10, 5, 8, '#e03040');
  px(g, 36, 52, 18, 28, '#a3222b'); px(g, 38, 76, 14, 6, '#a3222b'); px(g, 41, 82, 8, 4, '#a3222b');
  px(g, 44, 56, 3, 22, '#e2b648'); px(g, 39, 62, 13, 3, '#e2b648');
  return c;
}

function villager() {
  const c = canvas(48, 104), g = c.getContext('2d');
  g.fillStyle = '#7a4a32'; g.beginPath(); g.moveTo(14, 36); g.lineTo(34, 36); g.lineTo(42, 100); g.lineTo(6, 100); g.fill();
  px(g, 17, 46, 14, 50, '#e8dcc0');
  px(g, 12, 38, 6, 20, '#7a4a32'); px(g, 30, 38, 6, 20, '#7a4a32'); px(g, 19, 56, 10, 5, '#e0b090');
  px(g, 18, 18, 12, 16, '#e0b090'); px(g, 21, 24, 2, 2, '#2a1a10'); px(g, 26, 24, 2, 2, '#2a1a10');
  px(g, 15, 12, 18, 9, '#f2eee6'); px(g, 15, 20, 4, 12, '#f2eee6'); px(g, 29, 20, 4, 12, '#f2eee6');
  px(g, 14, 100, 8, 4, '#2a1a10'); px(g, 26, 100, 8, 4, '#2a1a10');
  return c;
}

function hooded() {
  const c = canvas(48, 104), g = c.getContext('2d');
  g.fillStyle = '#3f5a35'; g.beginPath(); g.moveTo(24, 6); g.lineTo(36, 22); g.lineTo(44, 96); g.lineTo(4, 96); g.lineTo(12, 22); g.fill();
  px(g, 22, 22, 4, 70, '#34492c');
  px(g, 14, 96, 8, 8, '#2a1a10'); px(g, 27, 96, 8, 8, '#2a1a10');
  return c;
}

function stall() {
  const c = canvas(128, 88), g = c.getContext('2d'), r = rng(81);
  px(g, 8, 18, 5, 70, '#5a3420'); px(g, 115, 18, 5, 70, '#5a3420');
  for (let x = 0; x < 128; x += 12) px(g, x, 4, 12, 16, (x / 12) % 2 ? '#e8dcc0' : '#b02a2a');
  for (let x = 0; x < 128; x += 12) { g.fillStyle = (x / 12) % 2 ? '#e8dcc0' : '#b02a2a'; g.beginPath(); g.arc(x + 6, 20, 6, 0, Math.PI); g.fill(); }
  px(g, 14, 30, 8, 12, '#2a1a10'); px(g, 15, 32, 6, 8, '#ffc84a');
  px(g, 52, 32, 24, 26, '#8a2a2a'); px(g, 56, 40, 16, 18, '#e0b090');
  px(g, 54, 28, 20, 8, '#a02a2a'); px(g, 58, 50, 12, 12, '#e8e8e8');
  px(g, 10, 56, 108, 32, '#6b4226'); px(g, 10, 56, 108, 3, '#8a5a36');
  px(g, 40, 59, 48, 26, '#9a2030'); px(g, 62, 62, 4, 18, '#e2b648'); px(g, 56, 68, 16, 4, '#e2b648');
  for (let i = 0; i < 5; i++) px(g, 22 + i * 4 + (i > 2 ? 60 : 0), 46, 3, 10, ['#d0303a', '#3a6ad8', '#3ab060'][i % 3]);
  return c;
}

function well() {
  const c = canvas(72, 80), g = c.getContext('2d'), r = rng(91);
  px(g, 10, 22, 4, 36, '#5a3420'); px(g, 58, 22, 4, 36, '#5a3420');
  g.fillStyle = '#6a3a28'; g.beginPath(); g.moveTo(0, 26); g.lineTo(36, 4); g.lineTo(72, 26); g.fill();
  px(g, 35, 24, 2, 16, '#c8b080'); px(g, 30, 40, 12, 10, '#6b4226');
  blocks(g, r, 4, 48, 64, 32, 10, 10, 18, ['#6a6170', '#5c5466', '#71687a'], '#2a2430');
  return c;
}

function barrel() {
  const c = canvas(32, 36), g = c.getContext('2d');
  px(g, 5, 2, 22, 34, '#6b4226'); px(g, 3, 6, 26, 26, '#6b4226');
  for (const x of [9, 15, 21]) px(g, x, 2, 1, 34, '#4a2c18');
  for (const y of [6, 18, 30]) px(g, 3, y, 26, 3, '#4a4a55');
  return c;
}

function crate() {
  const c = canvas(32, 30), g = c.getContext('2d');
  px(g, 0, 0, 32, 30, '#7a5230'); px(g, 2, 2, 28, 26, '#8a6238');
  g.strokeStyle = '#5a3a20'; g.lineWidth = 3; g.beginPath(); g.moveTo(3, 3); g.lineTo(29, 27); g.stroke();
  return c;
}

function chest() {
  const c = canvas(40, 28), g = c.getContext('2d');
  px(g, 2, 10, 36, 18, '#6b4226'); px(g, 2, 2, 36, 10, '#7a4a2a'); px(g, 4, 0, 32, 4, '#7a4a2a');
  for (const x of [6, 32]) px(g, x, 0, 3, 28, '#4a4a55');
  px(g, 2, 11, 36, 2, '#4a4a55'); px(g, 18, 12, 5, 7, '#d8b048');
  return c;
}

function lamppost() {
  const c = canvas(40, 120), g = c.getContext('2d');
  px(g, 8, 10, 5, 110, '#4a2c18'); px(g, 5, 112, 11, 8, '#3a2416');
  px(g, 8, 12, 24, 3, '#2a2a30'); px(g, 28, 15, 1, 6, '#2a2a30');
  px(g, 22, 21, 13, 16, '#2a2a30'); px(g, 24, 23, 9, 12, '#ffd060'); px(g, 26, 25, 5, 6, '#fff0b0');
  return c;
}

function banner() {
  const c = canvas(40, 120), g = c.getContext('2d');
  px(g, 3, 0, 4, 120, '#5a3420'); px(g, 3, 6, 34, 3, '#5a3420');
  g.fillStyle = '#7a1f3a'; g.beginPath(); g.moveTo(9, 9); g.lineTo(35, 9); g.lineTo(35, 66); g.lineTo(22, 56); g.lineTo(9, 66); g.fill();
  px(g, 20, 16, 4, 32, '#e2b648'); px(g, 13, 24, 18, 4, '#e2b648');
  return c;
}

function torch() {
  const c = canvas(24, 36), g = c.getContext('2d');
  px(g, 8, 26, 8, 4, '#2a2a30'); px(g, 10, 14, 4, 18, '#5a3420'); px(g, 7, 12, 10, 4, '#2a2a30');
  px(g, 8, 4, 8, 9, '#ff8a20'); px(g, 9, 1, 6, 6, '#ffc84a'); px(g, 10, 6, 4, 6, '#fff0b0');
  return c;
}

// ---------- UI ----------

function portrait() {
  const c = canvas(64, 64), g = c.getContext('2d');
  px(g, 0, 0, 64, 64, '#1a1424');
  px(g, 8, 44, 48, 20, '#8a2020'); px(g, 4, 50, 56, 14, '#a02a2a');
  px(g, 20, 18, 24, 28, '#e0b090'); px(g, 26, 30, 4, 3, '#2a4a9a'); px(g, 36, 30, 4, 3, '#2a4a9a');
  px(g, 30, 38, 6, 2, '#a0705a');
  px(g, 16, 8, 32, 12, '#6a3a1e'); px(g, 14, 14, 8, 18, '#6a3a1e'); px(g, 42, 14, 8, 16, '#6a3a1e'); px(g, 22, 16, 10, 6, '#7a4a2a');
  return c;
}

function panelStone() {
  const c = canvas(64, 64), g = c.getContext('2d'), r = rng(101);
  blocks(g, r, 0, 0, 64, 64, 16, 16, 30, ['#2e2834', '#28232e', '#332c3a'], '#141118');
  return c;
}

function panel() {
  const c = canvas(1448, 241), g = c.getContext('2d');
  px(g, 0, 0, 1448, 241, '#2e2834'); px(g, 0, 0, 1448, 8, '#6a6270');
  return c;
}

function iconSheet(glyphs) {
  const c = canvas(256, 128), g = c.getContext('2d');
  g.font = '44px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  glyphs.forEach((s, i) => g.fillText(s, (i % 4) * 64 + 32, Math.floor(i / 4) * 64 + 34));
  return c;
}

export function pixelate(source, width = 32) {
  const h = Math.max(1, Math.round((source.height / source.width) * width));
  const c = canvas(width, h), g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(source, 0, 0, width, h);
  return c;
}

const generators = {
  cobble, roof, stoneWall, parapet, sky, hills, treeline, moon, castle, waterfall,
  guard, villager, hooded, stall, well, barrel, crate, chest, lamppost, banner, torch,
  portrait, panelStone, panel,
  'facade:a': () => facade('a'), 'facade:b': () => facade('b'), 'facade:door': () => facade('door'),
  'facade:alchemist': () => facade('alchemist'), 'facade:smith': () => facade('smith'),
  'icons:actions': () => iconSheet(['⚔️', '✨', '📖', '🎒', '📜', '⚙️', '💬', '✋']),
  'icons:items': () => iconSheet(['🗡️', '🛡️', '🧪', '💧', '🔥', '📜', '💎', '🔑']),
};

export function generatePlaceholder(name) {
  const gen = generators[name];
  if (!gen) throw new Error(`No placeholder generator "${name}"`);
  return gen();
}
