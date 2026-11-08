import { createView } from './view.js';
import { loadImage, loadSlotImages, createCompositor } from './compositor.js';
import { createUI } from '../engine/ui.js';

// Grid crawler drawn by 2D compositing: every step and turn shows a new
// composite of pre-painted slot images (see view.js). Movement is instant with a
// short crossfade, like the classics.

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
const DIR_KEYS = 'NESW';
const FADE_MS = 140;

// Map a level + tile types to the compositor's view-relative cell lookup.
export function cellLookup(level, tileTypes, props) {
  const rows = level.tiles;
  const entityAt = new Map(level.entities.map((e) => [`${e.x},${e.z}`, e]));
  return (x, z) => {
    if (z < 0 || z >= rows.length || x < 0 || x >= rows[0].length) return null;
    const t = tileTypes[rows[z][x]];
    if (!t) return null;
    if (t.wall) return { wall: t.art };
    const e = entityAt.get(`${x},${z}`);
    return e ? { prop: { ...props[e.prop], type: e.prop }, entity: e } : {};
  };
}

export async function startGame2d({ level, tileTypes, props, uiLayout, assetPath, uiAssetPath, viewCanvas, uiCanvas, frame, status }) {
  const view = createView(level.view);
  const { W, H } = view.V;
  const wallArts = [...new Set(Object.values(tileTypes).filter((t) => t.wall).map((t) => t.art))];
  const propArts = Object.values(props);
  const images = await loadSlotImages(view, { assetPath, wallArts, propArts });
  const comp = createCompositor(view, images);
  const cell = cellLookup(level, tileTypes, props);

  viewCanvas.width = W; viewCanvas.height = H;
  const g = viewCanvas.getContext('2d');
  const prev = document.createElement('canvas'); prev.width = W; prev.height = H;
  const next = document.createElement('canvas'); next.width = W; next.height = H;

  const ui = createUI(uiCanvas, {
    'ui/panel': { image: await loadImage(`${uiAssetPath}/ui/panel.png`) },
    'ui/portrait-hero': { image: await loadImage(`${uiAssetPath}/ui/portrait-hero.png`) },
  }, uiLayout);
  await Promise.all(['16px VT323', '700 16px "Pixelify Sans"'].map((f) => document.fonts.load(f).catch(() => {})));

  const p = { ...level.start, steps: 0 };
  const hero = { hp: 58, maxHp: 58, mp: 24, maxMp: 24 };
  const opts = { outlines: false };
  const world = {
    typeAt: (x, z) => { const c = cell(x, z); return c === null ? null : (c.wall ? { wall: true } : { floor: true }); },
    billboards: level.entities.filter((e) => e.name).map((e) => ({ entity: e })),
  };
  window.__game2d = { view, images, level, p };

  // Log: messages over the bottom-left of the view, fading out.
  const logEl = document.createElement('div');
  logEl.className = 'log';
  frame.appendChild(logEl);
  const log = [];
  function say(text) {
    log.push({ text, t: performance.now() });
    if (log.length > 4) log.shift();
  }

  const relCell = (l, d) => {
    const [fx, fz] = DIRS[p.dir], [rx, rz] = DIRS[(p.dir + 1) % 4];
    return cell(p.x + fx * d + rx * l, p.z + fz * d + rz * l);
  };

  function render(target) {
    const tg = target.getContext('2d');
    comp.draw(tg, view.compose(relCell), { facing: DIR_KEYS[p.dir], flipFloor: p.steps % 2 === 1, outlines: opts.outlines });
  }

  let fade = null;
  function show() {
    prev.getContext('2d').drawImage(next, 0, 0);
    render(next);
    fade = { start: performance.now() };
    ui.draw({ world, hero, tileX: p.x, tileZ: p.z, yaw: -p.dir * Math.PI / 2 });
    updateStatus();
  }

  function act(cmd) {
    if (cmd === 'left' || cmd === 'right') { p.dir = (p.dir + (cmd === 'left' ? 3 : 1)) % 4; show(); return; }
    const off = { forward: 0, strafeRight: 1, back: 2, strafeLeft: 3 }[cmd];
    const [dx, dz] = DIRS[(p.dir + off) % 4];
    const c = cell(p.x + dx, p.z + dz);
    if (!c || c.wall) { say('You bump into a wall.'); return; }
    if (c.entity?.block) { say(`${c.entity.name[0].toUpperCase()}${c.entity.name.slice(1)} blocks the way.`); return; }
    p.x += dx; p.z += dz; p.steps++;
    show();
    const ahead = relCell(0, 1);
    if (ahead?.entity?.name) say(`You see ${ahead.entity.name}.`);
  }

  const keymap = {
    KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'strafeLeft', KeyD: 'strafeRight',
    KeyQ: 'left', ArrowLeft: 'left', KeyE: 'right', ArrowRight: 'right',
  };
  window.addEventListener('keydown', (ev) => {
    if (keymap[ev.code]) { ev.preventDefault(); act(keymap[ev.code]); return; }
    if (ev.code === 'KeyO') { opts.outlines = !opts.outlines; say(`Slot outlines: ${opts.outlines ? 'on' : 'off'}`); show(); }
  });

  function updateStatus() {
    const missing = view.compose(relCell).filter((it) => !comp.imageFor(it));
    status.textContent = `${level.name} · (${p.x},${p.z}) facing ${'NESW'[p.dir]} · ${images.size} slot images loaded`
      + (missing.length ? ` · missing here: ${missing.map((m) => `${m.type}/${m.slot.id}`).join(', ')}` : '');
  }

  function resize() {
    const avail = Math.min(window.innerWidth / W, (window.innerHeight - 70) / (H + ui.height));
    const scale = avail >= 1 ? Math.floor(avail * 4) / 4 : avail;
    viewCanvas.style.width = uiCanvas.style.width = frame.style.width = `${W * scale}px`;
    viewCanvas.style.height = `${H * scale}px`;
    uiCanvas.style.height = `${ui.height * scale}px`;
    logEl.style.fontSize = `${16 * scale}px`;
    logEl.style.left = `${8 * scale}px`;
    logEl.style.bottom = `${(ui.height + 6) * scale}px`;
  }
  window.addEventListener('resize', resize);
  resize();

  say(`Welcome to ${level.name}.`);
  render(next);
  prev.getContext('2d').drawImage(next, 0, 0);
  show();

  function loop(now) {
    const k = fade ? Math.min(1, (now - fade.start) / FADE_MS) : 1;
    g.globalAlpha = 1; g.drawImage(prev, 0, 0);
    g.globalAlpha = k; g.drawImage(next, 0, 0);
    g.globalAlpha = 1;
    if (k >= 1) fade = null;
    const html = log.map((m) => `<div style="opacity:${now - m.t < 7000 ? 1 : 0}">${m.text}</div>`).join('');
    if (logEl._html !== html) { logEl.innerHTML = html; logEl._html = html; }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
