// The game's one canvas: how big it is and how it is shown. There are two logical sizes, both built round the same
// 320x180 scene:
//
//   desktop  320x240   the scene above a 320x60 bar
//   mobile   400x180   the scene between two 40x180 rails (a phone held sideways)
//
// and a phone held upright shows a "rotate your device" overlay instead. The canvas is shown at a whole number of
// device pixels per logical pixel, so every logical pixel is the same size on screen (see docs/engine/ui.md).
// `?layout=desktop` or `?layout=mobile` forces one, for trying a layout on the other kind of device.

export const VIEW_W = 320, VIEW_H = 180;
export const LAYOUTS = {
  desktop: { name: 'desktop', w: 320, h: 240, view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, bar: { x: 0, y: VIEW_H, w: 320, h: 60 } },
  mobile: { name: 'mobile', w: 400, h: 180, view: { x: 40, y: 0, w: VIEW_W, h: VIEW_H }, rails: [{ x: 0, y: 0, w: 40, h: 180 }, { x: 360, y: 0, w: 40, h: 180 }] },
};

// 'desktop', 'mobile', or 'rotate' (a phone held upright). `coarse`: the main pointer is a finger.
export function chooseLayout({ coarse, width, height, force = null }) {
  const mobile = force === 'mobile' || force === 'desktop' ? force === 'mobile' : coarse;
  if (!mobile) return 'desktop';
  return height > width ? 'rotate' : 'mobile';
}

// How to show a `layout` in `width` x `height` CSS pixels on a screen with `dpr` device pixels per CSS pixel:
// k device pixels per logical pixel, a whole number when it can be (a little slack: a viewport is rounded to CSS
// pixels, which can lose a few device pixels, and a canvas that is two device pixels too big does no harm).
export function fitScale(layout, width, height, dpr = 1) {
  const fit = Math.min(width * dpr / layout.w, height * dpr / layout.h);
  const crisp = fit >= 1, k = crisp ? Math.max(1, Math.floor(fit + 0.008)) : Math.max(0.1, fit);
  return { k, crisp, cssW: layout.w * k / dpr, cssH: layout.h * k / dpr };
}

const viewport = () => {
  const vv = window.visualViewport;
  return { w: Math.min(window.innerWidth, vv?.width ?? Infinity), h: Math.min(window.innerHeight, vv?.height ?? Infinity) };
};

const OVERLAY_CSS = `
.rpg-rotate { position: fixed; inset: 0; z-index: 1000; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 20px;
  background: #08060c; color: #f0d696; font: 16px/1.4 monospace; text-align: center; padding: 24px; touch-action: none; }
html[data-layout="rotate"] .rpg-rotate { display: flex; }
html[data-layout="rotate"] body > :not(.rpg-rotate) { visibility: hidden; }
.rpg-rotate svg { width: 96px; height: 96px; animation: rpg-turn 2.4s ease-in-out infinite; }
.rpg-rotate small { color: #96806e; font-size: 13px; }
@keyframes rpg-turn { 0%, 15% { transform: rotate(0deg); } 55%, 100% { transform: rotate(-90deg); } }
@media (prefers-reduced-motion: reduce) { .rpg-rotate svg { animation: none; transform: rotate(-90deg); } }
`;

// canvas: the game's canvas. Returns the current layout and how to map the pointer onto it.
export function createScreen(canvas, { reserve = 70, force = new URLSearchParams(location.search).get('layout') } = {}) {
  const style = document.createElement('style'); style.textContent = OVERLAY_CSS; document.head.append(style);
  const overlay = document.createElement('div'); overlay.className = 'rpg-rotate'; overlay.setAttribute('role', 'alert');
  overlay.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="19" y="6" width="26" height="52" rx="4" fill="none" stroke="currentColor" stroke-width="3"/>'
    + '<rect x="25" y="12" width="14" height="34" fill="currentColor" opacity=".25"/><circle cx="32" cy="52" r="2" fill="currentColor"/></svg>'
    + '<div>Rotate your device</div><small>The game is played in landscape.</small>';
  document.body.append(overlay);
  canvas.style.imageRendering = 'pixelated'; canvas.style.display = 'block'; canvas.style.touchAction = 'none';

  const coarse = matchMedia('(pointer: coarse)');
  const listeners = new Set();
  let name = null, scale = null;
  const info = { get name() { return name; }, get spec() { return LAYOUTS[name === 'rotate' ? 'mobile' : name]; }, get scale() { return scale; }, get rotate() { return name === 'rotate'; } };

  function resize() {
    const { w, h } = viewport();
    const full = !!document.fullscreenElement || matchMedia('(display-mode: fullscreen)').matches;
    document.documentElement.toggleAttribute('data-fullscreen', full);
    const next = chooseLayout({ coarse: coarse.matches, width: w, height: h, force });
    const spec = LAYOUTS[next === 'rotate' ? 'mobile' : next];
    const changed = next !== name;
    name = next; document.documentElement.dataset.layout = name;
    if (canvas.width !== spec.w || canvas.height !== spec.h) { canvas.width = spec.w; canvas.height = spec.h; }
    scale = fitScale(spec, w, name === 'desktop' && !full ? Math.max(1, h - reserve) : h, window.devicePixelRatio || 1);
    canvas.style.width = `${scale.cssW}px`; canvas.style.height = `${scale.cssH}px`;
    canvas.style.imageRendering = scale.crisp ? 'pixelated' : 'auto';
    if (changed) for (const fn of listeners) fn(name);
  }
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
  matchMedia('(display-mode: fullscreen)').addEventListener('change', resize);
  matchMedia('(orientation: portrait)').addEventListener('change', resize);
  resize();

  // The pointer's place on the canvas, in logical pixels.
  info.toLogical = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left) * canvas.width / r.width, y: (clientY - r.top) * canvas.height / r.height };
  };
  info.resize = resize;
  info.onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  // A phone held sideways in full screen can be locked there (Android Chrome; other browsers say no, and the overlay does the job).
  info.lockLandscape = async () => { try { await screen.orientation?.lock?.('landscape'); } catch { /* not allowed here */ } };
  return info;
}
