import { createView } from './view.js';
import { loadImage, loadSlotImages, createCompositor } from './compositor.js';
import { createUI } from '../engine/ui.js';
import { createTouch, viewportSize } from '../engine/touch.js';
import { createMobileHUD } from './mobile-hud.js';
import { PEEK, RELEASE_MS, motionFor, easeOut, drawTransition } from './transition.js';
import { drawText } from '../engine/bitmapfont.js';
import { font5x8 as FONT } from '../engine/font-5x8.js';

// Grid crawler drawn by 2D compositing: every step and turn shows a new
// composite of pre-painted slot images (see view.js). Movement is instant, softened by a very short, subtle
// motion between the old and the new picture (transition.js); a swipe starts it before the finger lifts.

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
const DIR_KEYS = 'NESW';

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

export async function startGame2d({ level, tileTypes, props, uiLayout, assetPath, uiAssetPath, viewCanvas, uiCanvas, frame, status }) {
  // Keep the complete asset list for a fresh reload; the browser's default
  // timing buffer holds only 250 entries, fewer than a full scene's images.
  performance.setResourceTimingBufferSize(4096);
  const view = createView(level.view);
  const { W, H } = view.V;
  const SHOWN = view.V.pixel ?? 1; // a pixel view is shown this many times larger (see view.js)
  const wallArts = [...new Set(Object.values(tileTypes).filter((t) => t.wall).map((t) => t.art))];
  const propArts = Object.values(props);
  const images = await loadSlotImages(view, { assetPath, wallArts, propArts });
  const comp = createCompositor(view, images);
  const cell = cellLookup(level, tileTypes, props);

  // The view is composed in its own W x H coordinates but drawn into a canvas of INTERNAL times that size
  // (320x180 for the default 640x360 view), and shown scaled up with nearest-neighbour sampling (the canvas
  // CSS sets image-rendering: pixelated). A pixel view is built for one size (its art is baked at it), so it
  // is drawn at that.
  const INTERNAL = SHOWN > 1 ? 1 : 0.5;
  const cw = Math.round(W * INTERNAL), ch = Math.round(H * INTERNAL);
  viewCanvas.width = cw; viewCanvas.height = ch;
  const g = viewCanvas.getContext('2d');
  const prev = document.createElement('canvas'); prev.width = cw; prev.height = ch;
  const next = document.createElement('canvas'); next.width = cw; next.height = ch;

  // Overlays (the UI panel and the message log) are drawn at the view's pixel size, at least 320 wide, and
  // use a bitmap font: a scalable one is too blurry at this size.
  const PW = Math.max(cw, 320);
  const panelImage = await loadImage(`${uiAssetPath}/ui/panel.png`);
  const portraitImage = await loadImage(`${uiAssetPath}/ui/portrait-hero.png`);
  const ui = createUI(uiCanvas, {
    'ui/panel': { image: panelImage },
    'ui/portrait-hero': { image: portraitImage },
  }, uiLayout, { width: PW, font: FONT });

  const p = { ...level.start, steps: 0 };
  const hero = { hp: 58, maxHp: 58, mp: 24, maxMp: 24 };
  const opts = { outlines: false };
  const world = {
    typeAt: (x, z) => { const c = cell(x, z); return c === null ? null : (c.wall ? { wall: true } : { floor: true }); },
    billboards: level.entities.filter((e) => e.name).map((e) => ({ entity: e })),
  };
  const debugMode = new URLSearchParams(location.search).has('debug');
  document.documentElement.toggleAttribute('data-debug', debugMode);
  const bars = createMobileHUD({ panel: panelImage, portrait: portraitImage, world, hero, frame,
    debug: { get: () => opts.outlines, set: value => { opts.outlines = value; show(); } },
  });
  await bars.ready;
  window.__game2d = { view, images, level, p };

  // Log: messages over the bottom-left of the view, fading out.
  const LOG_LINES = 4, LOG_PITCH = FONT.h + 1, LOG_PAD = 2;
  const logCanvas = document.createElement('canvas');
  logCanvas.className = 'log';
  logCanvas.width = PW; logCanvas.height = LOG_LINES * LOG_PITCH + LOG_PAD;
  frame.appendChild(logCanvas);
  const lg = logCanvas.getContext('2d');
  const maxChars = Math.floor((PW - 2 * LOG_PAD) / FONT.w);
  const log = [];
  function say(text) {
    bars.notice(text);
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
    tg.imageSmoothingQuality = 'high'; // shrinking the painted slot images to the internal resolution
    comp.draw(tg, view.compose(relCell), { facing: DIR_KEYS[p.dir], flipFloor: p.steps % 2 === 1, outlines: opts.outlines });
  }

  // Messages stay for 7 s, then fade out over 1 s. Redrawn only when something changed.
  let logKey = '';
  function drawLog(now) {
    const alphas = log.map((m) => Math.min(1, Math.max(0, 1 - (now - m.t - 7000) / 1000)));
    const key = log.map((m, i) => `${m.text}@${alphas[i].toFixed(2)}`).join('|');
    if (key === logKey) return;
    logKey = key;
    lg.clearRect(0, 0, logCanvas.width, logCanvas.height);
    log.forEach((m, i) => {
      if (alphas[i] <= 0) return;
      lg.globalAlpha = alphas[i];
      const y = logCanvas.height - LOG_PAD - (log.length - i) * LOG_PITCH;
      drawText(lg, FONT, m.text.slice(0, maxChars), LOG_PAD, y, '#f0e4c8', { outline: '#000' });
    });
    lg.globalAlpha = 1;
  }

  // What is on screen. Idle: the settled picture in `next`. After a move: `anim` carries the picture it came
  // from to the one in `next`. While a swipe is going: `drag` shows the first part of the move it would make.
  // A swipe let go of early settles back in `release`. At most one of the three is set.
  let anim = null, drag = null, release = null;

  // The state a command would lead to, or null when a wall is in the way.
  function plan(cmd) {
    if (cmd === 'left' || cmd === 'right') return { ...p, dir: (p.dir + (cmd === 'left' ? 3 : 1)) % 4 };
    const off = { forward: 0, strafeRight: 1, back: 2, strafeLeft: 3 }[cmd];
    const [dx, dz] = DIRS[(p.dir + off) % 4];
    const c = cell(p.x + dx, p.z + dz);
    if (!c || c.wall) return null;
    return { ...p, x: p.x + dx, z: p.z + dz, steps: p.steps + 1 };
  }

  // The view the player would see in `st`, drawn without moving them. Kept per command while a swipe lasts.
  const peeks = new Map();
  let peekKey = '';
  function peekFor(cmd) {
    const st = plan(cmd);
    if (!st) return null;
    const key = `${p.x},${p.z},${p.dir},${p.steps},${opts.outlines}`;
    if (key !== peekKey) { peeks.clear(); peekKey = key; }
    if (!peeks.has(cmd)) {
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const here = { ...p };
      Object.assign(p, st); // render() reads where the player is
      try { render(c); } finally { Object.assign(p, here); }
      peeks.set(cmd, c);
    }
    return peeks.get(cmd);
  }

  function onSwipe(phase, cmd, amount) {
    if (phase !== 'move' || bars.isOpen()) { settleDrag(); return; }
    anim = null; release = null; // the picture in `next` is the settled one; start from it
    if (!drag || drag.cmd !== cmd) drag = { cmd, motion: motionFor(cmd), peek: peekFor(cmd), amount };
    else drag.amount = amount;
  }

  // Let go of a swipe that did not count: the half-made move eases back.
  function settleDrag() {
    if (!drag) return;
    release = { ...drag, from: drag.amount, t0: performance.now() };
    drag = null;
  }

  // Show the player's new state. `cmd` is the command that led here, when one did.
  function show(cmd) {
    const motion = cmd ? motionFor(cmd) : null;
    const continuing = !!drag && drag.cmd === cmd; // the swipe that made this move already showed its first part
    // The picture to move away from: what is on screen right now, unless a swipe was already showing the
    // settled one transformed, in which case the clean picture in `next`.
    prev.getContext('2d').drawImage(continuing || !(anim || drag || release) ? next : viewCanvas, 0, 0);
    render(next);
    const u0 = continuing ? drag.amount * PEEK : 0;
    drag = release = null;
    anim = motion ? { motion, u0, t0: performance.now(), ms: motion.ms * (1 - u0) } : null;
    const hud = { world, hero, tileX: p.x, tileZ: p.z, yaw: -p.dir * Math.PI / 2 };
    ui.draw(hud);
    bars.draw(hud);
    updateStatus();
  }

  function act(cmd) {
    if (bars.isOpen()) return;
    const st = plan(cmd);
    if (!st) { say('You bump into a wall.'); settleDrag(); return; }
    Object.assign(p, st);
    show(cmd);
    look();
  }

  const keymap = {
    KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'strafeLeft', KeyD: 'strafeRight',
    KeyQ: 'left', ArrowLeft: 'left', KeyE: 'right', ArrowRight: 'right',
  };
  const touch = createTouch({
    onCommand: act, onSwipe, swipeEl: viewCanvas, mount: bars.controls,
    extras: debugMode ? [{ label: 'Slot outlines', code: 'KeyO' }] : [],
    fullscreen: true, sideBars: { left: bars.left, right: bars.right },
  });
  window.addEventListener('keydown', (ev) => {
    if (bars.isOpen() || /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    if (keymap[ev.code]) { ev.preventDefault(); act(keymap[ev.code]); return; }
    if (ev.code === 'KeyO') { opts.outlines = !opts.outlines; say(`Slot outlines: ${opts.outlines ? 'on' : 'off'}`); show(); }
  });

  function updateStatus() {
    const missing = view.compose(relCell).filter((it) => !comp.imageFor(it));
    status.hidden = !debugMode;
    status.textContent = `${level.name} · (${p.x},${p.z}) facing ${'NESW'[p.dir]} · ${images.size} slot images loaded`
      + (missing.length ? ` · missing here: ${missing.map((m) => `${m.type}/${m.slot.id}`).join(', ')}` : '');
  }

  // Desktop keeps the original canvas panel. Mobile uses a separate DOM dashboard
  // in portrait and thumb-friendly rails in landscape, preserving the scene's aspect ratio.
  function resize() {
    const mode = touch.layout();
    const vp = viewportSize();
    const DW = W * SHOWN, DH = H * SHOWN;
    // Reserve room for the landscape rails before fitting the scene.
    const barW = bars.setLayout(mode, vp.w);
    const avail = mode === 'portrait' ? vp.w / DW
      : mode === 'landscape' ? Math.min((vp.w - 2 * barW) / DW, vp.h / DH)
      : Math.min(vp.w / DW, (vp.h - 70) / (DH + ui.height));
    const scale = mode === 'desktop' && avail >= 1 ? Math.floor(avail * 4) / 4 : avail;
    viewCanvas.style.imageRendering = uiCanvas.style.imageRendering = mode !== 'desktop' && scale < 1 ? 'auto' : '';
    viewCanvas.style.width = uiCanvas.style.width = frame.style.width = `${DW * scale}px`;
    viewCanvas.style.height = `${DH * scale}px`;
    uiCanvas.style.height = `${ui.height * scale}px`;
    logCanvas.style.width = `${DW * scale}px`;
    logCanvas.style.height = `${logCanvas.height * DW * scale / PW}px`;
    if (mode !== 'desktop') {
      logCanvas.style.top = '32px'; logCanvas.style.bottom = 'auto';
    } else { logCanvas.style.top = 'auto'; logCanvas.style.bottom = `${ui.height * scale}px`; }
  }
  window.addEventListener('resize', resize);
  resize();

  say(`Welcome to ${level.name}.`);
  show();
  look();

  function loop(now) {
    if (drag) {
      drawTransition(g, next, drag.peek, drag.motion, drag.amount * PEEK);
    } else if (release) {
      const k = Math.min(1, (now - release.t0) / RELEASE_MS);
      drawTransition(g, next, release.peek, release.motion, release.from * PEEK * (1 - easeOut(k)));
      if (k >= 1) release = null;
    } else if (anim) {
      const k = Math.min(1, (now - anim.t0) / anim.ms);
      drawTransition(g, prev, next, anim.motion, anim.u0 + (1 - anim.u0) * easeOut(k));
      if (k >= 1) anim = null;
    } else {
      g.drawImage(next, 0, 0);
    }
    drawLog(now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
