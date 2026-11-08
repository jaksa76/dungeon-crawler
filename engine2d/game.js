import { createView } from './view.js';
import { loadImage, loadSlotImages, createCompositor } from './compositor.js';
import { createUI } from '../engine/ui.js';

// Grid crawler drawn by 2D compositing: every step and turn shows a new
// composite of pre-painted slot images (see view.js). Movement is instant with a
// short crossfade, like the classics.

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
const DIR_KEYS = 'NESW';
const FADE_MS = 140;

// Props and NPCs stand against a side of their tile (`side: 'N'|'E'|'S'|'W'`), at
// most one per side, and never block the tile. Seen from a player facing `dir`, a
// side is the far, right, near or left side of the tile.
const ANCHOR_BY_TURN = ['far', 'right', 'near', 'left'];
const anchorOf = (side, dir) => ANCHOR_BY_TURN[(DIR_KEYS.indexOf(side) - dir + 4) % 4];

// Map a level + tile types to a world cell lookup: { wall } | { entities } | {} | null.
export function cellLookup(level, tileTypes, props) {
  const rows = level.tiles;
  const entitiesAt = new Map();
  for (const e of level.entities) {
    const where = `${e.x},${e.z}`, label = e.name ?? e.prop;
    if (!props[e.prop]) throw new Error(`${label}: unknown prop "${e.prop}"`);
    if (!DIR_KEYS.includes(e.side) || e.side.length !== 1) throw new Error(`${label} at (${where}) needs a side: N, E, S or W`);
    if (tileTypes[rows[e.z]?.[e.x]]?.floor !== true) throw new Error(`${label} at (${where}) is not on a floor tile`);
    const list = entitiesAt.get(where) ?? [];
    if (list.some((o) => o.side === e.side)) throw new Error(`two things on the ${e.side} side of tile (${where})`);
    entitiesAt.set(where, [...list, e]);
  }
  return (x, z) => {
    if (z < 0 || z >= rows.length || x < 0 || x >= rows[0].length) return null;
    const t = tileTypes[rows[z][x]];
    if (!t) return null;
    if (t.wall) return { wall: t.art };
    const entities = entitiesAt.get(`${x},${z}`);
    return entities ? { entities } : {};
  };
}

// `scalingButton` and `resolutionButton` are optional elements that show and toggle the two display settings
// (keys P and R). Returns { toggleScaling, cycleResolution }.
export async function startGame2d({ level, tileTypes, props, uiLayout, assetPath, uiAssetPath, viewCanvas, uiCanvas, frame, status, scalingButton, resolutionButton }) {
  const view = createView(level.view);
  const { W, H } = view.V;
  const SHOWN = view.V.pixel ?? 1; // a pixel view is shown this many times larger (see view.js)
  const wallArts = [...new Set(Object.values(tileTypes).filter((t) => t.wall).map((t) => t.art))];
  const propArts = Object.values(props);
  const images = await loadSlotImages(view, { assetPath, wallArts, propArts });
  const comp = createCompositor(view, images);
  const cell = cellLookup(level, tileTypes, props);

  const stored = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable: not remembered */ } };

  // Internal resolution: the view is always composed in its own W x H coordinates, but drawn into a canvas of
  // `res` times that size (R cycles through them), so lower ones show the same picture with fewer, bigger
  // pixels. A pixel view is built for one size (its art is baked at it), so it has only that.
  const RESOLUTIONS = SHOWN > 1 ? [1] : [1, 0.5, 0.25];
  let resIndex = Math.max(0, RESOLUTIONS.indexOf(Number(stored('view-res'))));
  const size = () => [Math.round(W * RESOLUTIONS[resIndex]), Math.round(H * RESOLUTIONS[resIndex])];

  const g = viewCanvas.getContext('2d');
  const prev = document.createElement('canvas');
  const next = document.createElement('canvas');
  function sizeCanvases() {
    const [w, h] = size();
    for (const c of [viewCanvas, prev, next]) { c.width = w; c.height = h; }
  }
  sizeCanvases();

  // How the canvas is scaled up to the screen: 'sampling' = nearest neighbour (crisp pixels, the default),
  // 'smooth' = bilinear (P toggles).
  let smooth = stored('view-scaling') === 'smooth';

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

  // The cell `d` ahead and `l` to the right of the player, with its props placed
  // relative to the player's facing (what view.compose expects).
  const relCell = (l, d) => {
    const [fx, fz] = DIRS[p.dir], [rx, rz] = DIRS[(p.dir + 1) % 4];
    const c = cell(p.x + fx * d + rx * l, p.z + fz * d + rz * l);
    if (!c?.entities) return c;
    return { props: c.entities.map((e) => ({ ...props[e.prop], type: e.prop, anchor: anchorOf(e.side, p.dir), entity: e })) };
  };

  // Say what the player is looking at: whatever stands against the far side of this
  // tile, or against the near or far side of the tile ahead.
  function look() {
    for (const d of [0, 1]) for (const pr of relCell(0, d)?.props ?? []) {
      const name = pr.entity.name;
      if (!name) continue;
      if (d === 0 && pr.anchor === 'far') say(`You stand before ${name}.`);
      if (d === 1 && (pr.anchor === 'far' || pr.anchor === 'near')) say(`You see ${name}.`);
    }
  }

  function render(target) {
    const tg = target.getContext('2d');
    tg.setTransform(target.width / W, 0, 0, target.height / H, 0, 0);
    tg.imageSmoothingQuality = 'high'; // shrinking painted slot images to a lower resolution
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
    if (cmd === 'left' || cmd === 'right') { p.dir = (p.dir + (cmd === 'left' ? 3 : 1)) % 4; show(); look(); return; }
    const off = { forward: 0, strafeRight: 1, back: 2, strafeLeft: 3 }[cmd];
    const [dx, dz] = DIRS[(p.dir + off) % 4];
    const c = cell(p.x + dx, p.z + dz);
    if (!c || c.wall) { say('You bump into a wall.'); return; }
    p.x += dx; p.z += dz; p.steps++;
    show();
    look();
  }

  const scalingLabel = () => `Scaling: ${smooth ? 'smooth (bilinear)' : 'sampling (nearest neighbour)'} — press P`;
  const resolutionLabel = () => `Resolution: ${size().join('x')}${RESOLUTIONS.length > 1 ? '' : ' (fixed)'} — press R`;
  function applyDisplay() {
    viewCanvas.style.imageRendering = smooth ? 'auto' : 'pixelated';
    if (scalingButton) scalingButton.textContent = scalingLabel();
    if (resolutionButton) resolutionButton.textContent = resolutionLabel();
  }
  function toggleScaling() {
    smooth = !smooth;
    store('view-scaling', smooth ? 'smooth' : 'sampling');
    applyDisplay();
    say(scalingLabel().replace(' — press P', ''));
  }
  function cycleResolution() {
    resIndex = (resIndex + 1) % RESOLUTIONS.length;
    if (RESOLUTIONS.length > 1) store('view-res', RESOLUTIONS[resIndex]);
    sizeCanvases(); // resizing clears the canvases and resets their state: draw the current view again, no fade
    render(next);
    prev.getContext('2d').drawImage(next, 0, 0);
    fade = null;
    applyDisplay();
    say(RESOLUTIONS.length > 1 ? resolutionLabel().replace(' — press R', '') : `Resolution is fixed at ${size().join('x')} in this view.`);
  }
  scalingButton?.addEventListener('click', () => { toggleScaling(); scalingButton.blur(); });
  resolutionButton?.addEventListener('click', () => { cycleResolution(); resolutionButton.blur(); });
  applyDisplay();

  const keymap = {
    KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'strafeLeft', KeyD: 'strafeRight',
    KeyQ: 'left', ArrowLeft: 'left', KeyE: 'right', ArrowRight: 'right',
  };
  window.addEventListener('keydown', (ev) => {
    if (keymap[ev.code]) { ev.preventDefault(); act(keymap[ev.code]); return; }
    if (ev.repeat) return;
    if (ev.code === 'KeyP') toggleScaling();
    if (ev.code === 'KeyR') cycleResolution();
    if (ev.code === 'KeyO') { opts.outlines = !opts.outlines; say(`Slot outlines: ${opts.outlines ? 'on' : 'off'}`); show(); }
  });

  function updateStatus() {
    const missing = view.compose(relCell).filter((it) => !comp.imageFor(it));
    status.textContent = `${level.name} · (${p.x},${p.z}) facing ${'NESW'[p.dir]} · ${images.size} slot images loaded`
      + (missing.length ? ` · missing here: ${missing.map((m) => `${m.type}/${m.slot.id}`).join(', ')}` : '');
  }

  function resize() {
    const DW = W * SHOWN, DH = H * SHOWN;
    const avail = Math.min(window.innerWidth / DW, (window.innerHeight - 70) / (DH + ui.height));
    const scale = avail >= 1 ? Math.floor(avail * 4) / 4 : avail;
    viewCanvas.style.width = uiCanvas.style.width = frame.style.width = `${DW * scale}px`;
    viewCanvas.style.height = `${DH * scale}px`;
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
  look();

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
  return { toggleScaling, cycleResolution };
}
