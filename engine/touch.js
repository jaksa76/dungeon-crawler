// Layout mode and on-screen controls for phones and tablets, shared by all the demos.
//
//   viewportSize() { w, h } of the window, robust to content wider than the screen
//   layoutMode()  'desktop' | 'portrait' | 'landscape'
//                 Mobile = the main pointer is a finger, or the window is narrow.
//   createTouch() builds the controls and returns { layout, el }. layout() recomputes the mode,
//                 stamps it on <html data-layout="..."> (the pages' CSS keys off that) and
//                 returns it; call it from the page's resize handler before sizing anything.
//
// Controls: a move pad on the left (forward / back / strafe), turn buttons on the right,
// swipes that drag the world (down = forward, up = back, left = turn right), and optional toggle
// chips that fire the same keys the keyboard does. Holding a button repeats it.
// In portrait the controls sit in the page flow (below the view); in landscape they float
// over the view's bottom corners, or, given `sideBars`, sit inside two side bars the page provides
// (move pad in the left one, turn buttons in the right one).
// `fullscreen: true` adds a button that toggles fullscreen where the browser supports it (not iPhone Safari).

const COARSE = matchMedia('(pointer: coarse)');
const NARROW_PX = 700;
const HOLD_MS = 350, REPEAT_MS = 220, SWIPE_PX = 40;

// The size to lay the page out in. On a phone, content wider than the screen (a 640px canvas before it is
// sized) makes the browser widen the layout viewport, so innerWidth can read bigger than the screen;
// the visual viewport is the real window.
export function viewportSize() {
  const vv = window.visualViewport;
  return { w: Math.min(window.innerWidth, vv?.width ?? Infinity), h: Math.min(window.innerHeight, vv?.height ?? Infinity) };
}

export function layoutMode() {
  const { w, h } = viewportSize();
  if (!COARSE.matches && w > NARROW_PX) return 'desktop';
  return w < h ? 'portrait' : 'landscape';
}

const STYLE = `
.tp { display: none; box-sizing: border-box; -webkit-user-select: none; user-select: none;
  -webkit-touch-callout: none; touch-action: none; --b: clamp(48px, min(15vw, 17vh), 72px); }
.tp * { box-sizing: border-box; }
html[data-layout="portrait"] .tp, html[data-layout="landscape"] .tp { display: flex; }
html[data-layout="portrait"], html[data-layout="landscape"] { overscroll-behavior: none; }
.tp-main { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; width: 100%; }
.tp-move { display: grid; grid-template-columns: repeat(3, var(--b)); grid-template-rows: repeat(2, var(--b)); gap: 6px; }
.tp-move .fwd { grid-column: 2; grid-row: 1; }
.tp-move .sl { grid-column: 1; grid-row: 2; }
.tp-move .back { grid-column: 2; grid-row: 2; }
.tp-move .sr { grid-column: 3; grid-row: 2; }
.tp-turn { display: grid; grid-template-columns: repeat(2, var(--b)); grid-template-rows: calc(var(--b) * 2 + 6px); gap: 6px; }
.tp-extras { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; width: 100%; }
.tp button, .sb .tp-move button, .sb .tp-turn button, .tp-fs { appearance: none; margin: 0; padding: 0; display: grid; place-items: center; cursor: pointer;
  color: #f0e4c8; background: rgba(46, 36, 66, .88); border: 2px solid #6b5a8a; border-radius: 14px;
  -webkit-tap-highlight-color: transparent; touch-action: none; font: inherit; }
.tp button.down, .sb button.down, .tp-fs.down { background: #6b5a8a; border-color: #c9a45c; }
.tp button svg, .sb button svg, .tp-fs svg { width: 52%; height: 52%; fill: currentColor; pointer-events: none; }
.tp-extras button { height: 32px; padding: 0 12px; border-radius: 16px; font: 12px/1 system-ui, sans-serif; color: #b8aecb; background: rgba(46, 36, 66, .6); border-width: 1px; }
.tp-extras button.down { color: #fff; }

/* fullscreen toggle: a corner button, or the top row of the right side bar */
.tp-fs { display: none; position: fixed; z-index: 30; top: 8px; right: 8px; width: 40px; height: 40px; opacity: .75; }
html[data-layout="portrait"] .tp-fs, html[data-layout="landscape"] .tp-fs { display: grid; }
.tp-fs.in-bar { position: static; width: 100%; height: 32px; flex: none; opacity: 1; border-radius: 10px; }
.tp-fs.in-bar svg { width: 18px; height: 18px; }

/* controls inside the side bars: the pads fill the bar's width and sit at its bottom */
html[data-sidebars] .tp { display: none; }
.sb .tp-move, .sb .tp-turn { width: 100%; margin-top: auto; gap: 4px; flex: none; }
.sb .tp-move { grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 46px); }
.sb .tp-turn { grid-template-columns: repeat(2, 1fr); grid-template-rows: 96px; }
.sb .tp button { width: 100%; height: 100%; border-radius: 10px; }
.sb .tp-move button svg { width: 46%; height: 46%; }
.sb .tp-turn button svg { width: 46%; height: 46%; }

html[data-layout="portrait"] .tp { flex-direction: column; align-items: center; gap: 10px; width: 100%;
  margin-top: auto; padding: 8px 12px calc(12px + env(safe-area-inset-bottom)); }

html[data-layout="landscape"] .tp { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; pointer-events: none;
  padding: 0 calc(10px + env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) calc(10px + env(safe-area-inset-left)); }
html[data-layout="landscape"] .tp-main > * { pointer-events: auto; }
html[data-layout="landscape"] .tp-extras { display: none; }
html[data-layout="landscape"] .tp button { opacity: .6; background: rgba(20, 14, 32, .7); }
html[data-layout="landscape"] .tp button.down { opacity: 1; background: #6b5a8a; }
`;

const ICON = {
  arrow: '<svg viewBox="0 0 24 24"><path d="M12 4l8 9h-5v7H9v-7H4z"/></svg>',
  turn: '<svg viewBox="0 0 24 24"><path d="M9 4L3 10l6 6v-4h5a2 2 0 010 4h-3v4h3a6 6 0 000-12H9z"/></svg>',
  fsEnter: '<svg viewBox="0 0 24 24"><path d="M3 3h7v2.5H5.5V10H3zm11 0h7v7h-2.5V5.5H14zM3 14h2.5v4.5H10V21H3zm15.5 0H21v7h-7v-2.5h4.5z"/></svg>',
  fsExit: '<svg viewBox="0 0 24 24"><path d="M7.5 3H10v7H3V7.5h4.5zM14 3h2.5v4.5H21V10h-7zM3 14h7v7H7.5v-4.5H3zm11 0h7v2.5h-4.5V21H14z"/></svg>',
};

// opts: onCommand(cmd) with cmd in forward|back|strafeLeft|strafeRight|left|right;
//       extras: [{ label, code }] toggle chips that dispatch that keyboard code;
//       swipeEl: element that takes swipe gestures; mount: where the controls go (default <body>);
//       sideBars: { left, right } elements that hold the pads in landscape; fullscreen: add the toggle button.
export function createTouch({ onCommand, extras = [], swipeEl, mount = document.body, sideBars, fullscreen = false }) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'tp';
  const chips = extras.map((x, i) => `<button type="button" data-extra="${i}">${x.label}</button>`).join('');
  const btn = (cls, cmd, label, icon, rot = '') =>
    `<button type="button" class="${cls}" data-cmd="${cmd}" aria-label="${label}" title="${label}">`
    + `${ICON[icon]}</button>`.replace('<svg', `<svg style="transform:${rot}"`);
  root.innerHTML = `
    ${extras.length ? `<div class="tp-extras">${chips}</div>` : ''}
    <div class="tp-main">
      <div class="tp-move">
        ${btn('fwd', 'forward', 'Move forward', 'arrow')}
        ${btn('sl', 'strafeLeft', 'Step left', 'arrow', 'rotate(-90deg)')}
        ${btn('back', 'back', 'Step back', 'arrow', 'rotate(180deg)')}
        ${btn('sr', 'strafeRight', 'Step right', 'arrow', 'rotate(90deg)')}
      </div>
      <div class="tp-turn">
        ${btn('tl', 'left', 'Turn left', 'turn')}
        ${btn('tr', 'right', 'Turn right', 'turn', 'scaleX(-1)')}
      </div>
    </div>`;
  mount.appendChild(root);
  const main = root.querySelector('.tp-main'), move = root.querySelector('.tp-move'), turn = root.querySelector('.tp-turn');

  // A finger held on a button repeats it.
  function bind(el, fire) {
    let hold = 0, rep = 0;
    const stop = () => { clearTimeout(hold); clearInterval(rep); el.classList.remove('down'); };
    el.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      el.setPointerCapture?.(ev.pointerId);
      el.classList.add('down');
      fire();
      clearTimeout(hold); clearInterval(rep);
      hold = setTimeout(() => { rep = setInterval(fire, REPEAT_MS); }, HOLD_MS);
    });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, stop);
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }
  for (const el of root.querySelectorAll('[data-cmd]')) bind(el, () => onCommand(el.dataset.cmd));
  for (const el of root.querySelectorAll('[data-extra]')) {
    const { code } = extras[+el.dataset.extra];
    el.addEventListener('pointerdown', () => el.classList.add('down'));
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, () => el.classList.remove('down'));
    el.addEventListener('click', () => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.replace(/^Key/, '').toLowerCase() })));
  }

  if (swipeEl) {
    swipeEl.style.touchAction = 'none';
    let start = null;
    swipeEl.addEventListener('pointerdown', (ev) => {
      start = ev.pointerType === 'touch' ? { id: ev.pointerId, x: ev.clientX, y: ev.clientY } : null;
    });
    swipeEl.addEventListener('pointercancel', () => { start = null; });
    swipeEl.addEventListener('pointerup', (ev) => {
      if (!start || ev.pointerId !== start.id || layoutMode() === 'desktop') return;
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      start = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
      onCommand(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'right' : 'left') : (dy < 0 ? 'back' : 'forward'));
    });
  }

  // Fullscreen toggle. iPhone Safari has no fullscreen API for pages, so there the button is left out.
  let fsBtn = null;
  if (fullscreen) {
    const el = document.documentElement;
    const request = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
    const exit = (document.exitFullscreen ?? document.webkitExitFullscreen)?.bind(document);
    const allowed = document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? true;
    if (request && exit && allowed) {
      fsBtn = document.createElement('button');
      fsBtn.type = 'button'; fsBtn.className = 'tp-fs';
      const isFs = () => !!(document.fullscreenElement ?? document.webkitFullscreenElement);
      const sync = () => {
        fsBtn.innerHTML = isFs() ? ICON.fsExit : ICON.fsEnter;
        fsBtn.setAttribute('aria-label', isFs() ? 'Exit full screen' : 'Full screen');
        fsBtn.title = fsBtn.getAttribute('aria-label');
      };
      fsBtn.addEventListener('click', () => { Promise.resolve(isFs() ? exit() : request()).catch(() => {}); });
      document.addEventListener('fullscreenchange', sync);
      document.addEventListener('webkitfullscreenchange', sync);
      sync();
      document.body.appendChild(fsBtn);
    }
  }

  function layout() {
    const mode = layoutMode();
    const side = !!sideBars && mode === 'landscape';
    document.documentElement.dataset.layout = mode;
    document.documentElement.toggleAttribute('data-sidebars', side);
    if (side) {
      if (move.parentNode !== sideBars.left) sideBars.left.appendChild(move);
      if (turn.parentNode !== sideBars.right) sideBars.right.appendChild(turn);
      if (fsBtn && fsBtn.parentNode !== sideBars.right) { sideBars.right.prepend(fsBtn); fsBtn.classList.add('in-bar'); }
    } else {
      if (move.parentNode !== main) main.prepend(move);
      if (turn.parentNode !== main) main.append(turn);
      if (fsBtn && fsBtn.parentNode !== document.body) { document.body.appendChild(fsBtn); fsBtn.classList.remove('in-bar'); }
    }
    return mode;
  }
  layout();
  return { layout, el: root };
}
