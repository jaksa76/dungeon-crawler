import * as THREE from 'three';
import { loadAssets } from './assets.js';
import { buildWorld } from './world.js';
import { buildBackdrop } from './backdrop.js';
import { createUI, LAYOUTS } from './ui.js';

const EYE = 0.55;          // eye height in tiles
const CAM_BACK = 0.3;      // camera sits this far behind the tile centre
const MOVE_MS = 200, TURN_MS = 160;
// Display modes. 320x200 is shown at 4:3 like on a CRT, so pixels are 1.2x taller.
const MODES = [
  { name: '640×480', view: [640, 360], ui: 'hi', pixelAspect: 1 },
  { name: '320×200', view: [320, 144], ui: 'lo', pixelAspect: 1.2 },
];
const H_FOV = 2 * Math.atan(Math.tan((62 * Math.PI) / 360) * (16 / 9)); // kept constant across modes
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
const DIR_NAMES = ['north', 'east', 'south', 'west'];

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export async function startGame({ level, tileTypes, manifest, assetPath, viewCanvas, uiCanvas, frame, status }) {
  const assets = await loadAssets(manifest, assetPath);
  const realCount = Object.values(assets).filter((a) => a.real).length;

  const renderer = new THREE.WebGLRenderer({ canvas: viewCanvas, antialias: false });
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  const bd = level.backdrop;
  scene.background = new THREE.Color('#0a0820');
  const fog = new THREE.Fog(bd.fog.color, bd.fog.near, bd.fog.far);
  scene.fog = fog;
  scene.add(new THREE.HemisphereLight(bd.ambient.sky, bd.ambient.ground, bd.ambient.intensity));
  const moon = new THREE.DirectionalLight(bd.moonlight.color, bd.moonlight.intensity);
  const mb = (bd.moonlight.bearing * Math.PI) / 180, me = (bd.moonlight.elevation * Math.PI) / 180;
  moon.position.set(Math.sin(mb) * Math.cos(me), Math.sin(me), -Math.cos(mb) * Math.cos(me));
  scene.add(moon);

  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, 1000);
  camera.rotation.order = 'YXZ';

  const world = buildWorld(scene, level, tileTypes, assets);
  const backdrop = buildBackdrop(scene, bd, assets, EYE);
  await Promise.all(['16px VT323', '8px Silkscreen'].map((f) => document.fonts.load(f).catch(() => {})));
  const ui = createUI(uiCanvas, assets);
  window.__game = { scene, camera, renderer, assets, world };

  // --- options
  const opts = { smooth: true, fog: true, res: 0, farSwap: true, lightsOn: true, ink: true };

  // --- player state
  const p = { x: level.start.x, z: level.start.z, dir: level.start.dir };
  const view = { x: p.x, z: p.z, yaw: -p.dir * Math.PI / 2 };
  let anim = null;
  let queued = null;
  const log = [`Welcome to ${level.name}.`];
  const hero = { name: 'Aldren', title: 'Wanderer · Level 1', hp: 58, maxHp: 58, mp: 24, maxMp: 24, gold: 12 };

  function say(text) { if (log[log.length - 1] !== text) log.push(text); if (log.length > 50) log.shift(); }

  function describeAhead() {
    const [dx, dz] = DIRS[p.dir];
    const e = world.entityAt(p.x + dx, p.z + dz);
    return e ? `You see ${e.name}.` : '';
  }

  function act(cmd) {
    const from = { x: view.x, z: view.z, yaw: view.yaw };
    if (cmd === 'left' || cmd === 'right') {
      p.dir = (p.dir + (cmd === 'left' ? 3 : 1)) % 4;
      begin(from, { x: p.x, z: p.z, yaw: from.yaw + (cmd === 'left' ? 1 : -1) * Math.PI / 2 }, TURN_MS);
    } else {
      const off = { forward: 0, strafeRight: 1, back: 2, strafeLeft: 3 }[cmd];
      const [dx, dz] = DIRS[(p.dir + off) % 4];
      const nx = p.x + dx, nz = p.z + dz;
      if (world.isBlocked(nx, nz)) {
        const e = world.entityAt(nx, nz);
        say(e ? `${e.name[0].toUpperCase()}${e.name.slice(1)} blocks the way.` : 'You bump into a wall.');
        return;
      }
      p.x = nx; p.z = nz;
      begin(from, { x: nx, z: nz, yaw: from.yaw }, MOVE_MS);
    }
    const ahead = describeAhead();
    if (ahead) say(ahead);
  }

  function begin(from, to, ms) {
    if (!opts.smooth) { Object.assign(view, to); anim = null; return; }
    anim = { from, to, start: performance.now(), ms };
  }

  const keymap = {
    KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
    KeyA: 'strafeLeft', KeyD: 'strafeRight',
    KeyQ: 'left', ArrowLeft: 'left', KeyE: 'right', ArrowRight: 'right',
  };

  window.addEventListener('keydown', (ev) => {
    if (keymap[ev.code]) {
      ev.preventDefault();
      const cmd = keymap[ev.code];
      if (anim) queued = cmd; else act(cmd);
      return;
    }
    switch (ev.code) {
      case 'KeyT': opts.smooth = !opts.smooth; say(`Smooth movement: ${opts.smooth ? 'on' : 'off'}`); break;
      case 'KeyF': opts.fog = !opts.fog; scene.fog = opts.fog ? fog : null; say(`Fog: ${opts.fog ? 'on' : 'off'}`); break;
      case 'KeyR': opts.res = (opts.res + 1) % MODES.length; resize(); say(`Resolution: ${MODES[opts.res].name}`); break;
      case 'KeyV': opts.farSwap = !opts.farSwap; say(`Far sprite variants: ${opts.farSwap ? 'on' : 'off'}`); break;
      case 'KeyI':
        opts.ink = !opts.ink;
        if (world.ink) {
          world.ink.uInkStrength.value = opts.ink ? (level.ink?.strength ?? 0.95) : 0;
          world.ink.uInkGap.value = opts.ink ? (level.ink?.gap ?? 0.7) : 0;
        }
        say(`Ink outlines: ${opts.ink ? 'on' : 'off'}`);
        break;
      case 'KeyL': opts.lightsOn = !opts.lightsOn; say(`Point lights: ${opts.lightsOn ? 'on' : 'off'}`); break;
      default: return;
    }
    updateStatus();
  });

  function updateStatus() {
    status.textContent = `${level.name} · ${realCount}/${Object.keys(assets).length} real assets · `
      + `${MODES[opts.res].name} · smooth ${opts.smooth ? 'on' : 'off'} · fog ${opts.fog ? 'on' : 'off'} · `
      + `far variants ${opts.farSwap ? 'on' : 'off'} · lights ${opts.lightsOn ? 'on' : 'off'} · ink ${opts.ink ? 'on' : 'off'}`;
  }

  // --- sizing: render small, scale up crisp
  function resize() {
    const mode = MODES[opts.res];
    const [w, h] = mode.view, pa = mode.pixelAspect, uiH = LAYOUTS[mode.ui].h;
    renderer.setSize(w, h, false);
    ui.setLayout(mode.ui);
    // Same horizontal field of view in every mode.
    camera.aspect = w / (h * pa);
    camera.fov = (2 * Math.atan(Math.tan(H_FOV / 2) / camera.aspect) * 180) / Math.PI;
    camera.updateProjectionMatrix();
    // Ink lines are measured in render pixels; keep them proportionate.
    if (world.ink) world.ink.uInkWidth.value = Math.max(0.6, (level.ink?.width ?? 1.1) * (w / 640));
    // Scale up crisp: whole-pixel steps when there's room.
    const avail = Math.min(window.innerWidth / w, (window.innerHeight - 70) / ((h + uiH) * pa));
    const scale = avail >= 2 ? Math.floor(avail) : avail >= 1 ? Math.floor(avail * 4) / 4 : avail;
    viewCanvas.style.width = uiCanvas.style.width = `${w * scale}px`;
    viewCanvas.style.height = `${h * scale * pa}px`;
    uiCanvas.style.height = `${uiH * scale * pa}px`;
    frame.style.width = `${w * scale}px`;
  }
  window.addEventListener('resize', resize);
  resize();
  updateStatus();

  // --- main loop

  function loop(now) {
    if (anim) {
      const t = Math.min(1, (now - anim.start) / anim.ms);
      const k = ease(t);
      view.x = anim.from.x + (anim.to.x - anim.from.x) * k;
      view.z = anim.from.z + (anim.to.z - anim.from.z) * k;
      view.yaw = anim.from.yaw + (anim.to.yaw - anim.from.yaw) * k;
      if (t >= 1) {
        anim = null;
        if (queued) { const q = queued; queued = null; act(q); }
      }
    }
    camera.rotation.y = view.yaw;
    camera.position.set(
      view.x + Math.sin(view.yaw) * CAM_BACK,
      EYE,
      view.z + Math.cos(view.yaw) * CAM_BACK,
    );

    world.update(now / 1000, camera, opts);
    backdrop.update(camera);
    renderer.render(scene, camera);

    ui.draw({
      world, hero, log, tileX: p.x, tileZ: p.z, yaw: view.yaw, facing: DIR_NAMES[p.dir],
      hands: [0, 1], quick: [2, 3], // icon indices in ui/icons-items: sword, shield, red & blue potion
    });
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
