// The game's one canvas and what goes with it: the screen (size, scale, rotate overlay), the drawing kit and the pointer
// controller. It is made first, by startGame, so the screens before the game (ui/title-screen.js) and the game itself draw on
// the same canvas, on the same pixel grid, with the same rotate overlay. `show(draw)` runs a frame loop for the pre-game
// screens; the game runs its own, and calls `show(null)` when it takes over.

import { createScreen } from './screen.js';
import { createCanvasKit } from './canvas.js';
import { createInput } from './input.js';

export function createStage(canvas) {
  const screen = createScreen(canvas);
  const ctx = canvas.getContext('2d');
  const kit = createCanvasKit(ctx);
  // The pointer's shape and hover text: what the menus and the HUD say, else what the scene says.
  const cursor = { ui: { shape: null, title: '' }, scene: { shape: '', title: '' },
    apply() { canvas.style.cursor = this.ui.shape ?? this.scene.shape; canvas.title = this.ui.shape ? this.ui.title : this.scene.title; } };
  const input = createInput(canvas, kit, { toLogical: screen.toLogical, enabled: () => !screen.rotate,
    cursor: (shape, title) => { cursor.ui = { shape, title }; cursor.apply(); } });

  let draw = null, frame = 0;
  const loop = now => {
    frame = draw ? requestAnimationFrame(loop) : 0;
    if (!draw || screen.rotate) return;
    kit.begin(); ctx.imageSmoothingEnabled = false;
    draw(now);
    kit.origin(0, 0);
  };

  return {
    canvas, screen, ctx, kit, input, cursor,
    // Draw `fn(now)` every frame, or stop with null.
    show(fn) { draw = fn; if (fn && !frame) frame = requestAnimationFrame(loop); },
    get showing() { return !!draw; },
    // A text field for the canvas to draw: a hidden input takes the typing (and brings up a phone's keyboard), the screen draws what
    // it holds. While it has the focus the canvas keeps its size, whatever the keyboard does to the window.
    edit({ value = '', maxLength = 20, label = 'Text', onEnter = () => {} } = {}) {
      const el = document.createElement('input');
      el.type = 'text'; el.value = value; el.maxLength = maxLength; el.spellcheck = false; el.autocomplete = 'off'; el.enterKeyHint = 'done';
      el.setAttribute('aria-label', label);
      Object.assign(el.style, { position: 'fixed', left: '0', top: '0', width: '1px', height: '1px', opacity: '0', border: '0', padding: '0', fontSize: '16px' });
      document.body.append(el);
      el.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); onEnter(); } });
      el.addEventListener('focus', () => { screen.frozen = true; });
      el.addEventListener('blur', () => { screen.frozen = false; });
      return {
        focus() { el.focus({ preventScroll: true }); }, selectAll() { el.select(); },
        get value() { return el.value; }, get focused() { return document.activeElement === el; },
        get selection() { return [el.selectionStart ?? 0, el.selectionEnd ?? 0]; },
        close() { el.remove(); screen.frozen = false; },
      };
    },
  };
}
