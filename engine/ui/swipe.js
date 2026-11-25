// Swipes on the scene, for a phone: drag the world and it moves. Drag it down to step forward, up to step back, left to turn
// right and right to turn left; the finger shows the first part of the move while it is down, and a drag far enough counts
// when it lifts. The sticks in the rails (ui/hud.js) do the same with a finger on a widget; this is for a finger on the picture.
//
//   createSwipe(canvas, { toLogical, view, kit, enabled, onCommand, onSwipe }) -> { cancel() }
//
// `view()` is the scene's rectangle on the canvas (canvas pixels); a swipe starts only there, on a touch, where nothing else
// (a menu, a button) took the press. `onSwipe(phase, cmd, amount)` hears 'move' with the command the drag would be and 0..1 of
// the way to counting, or 'cancel' when it was let go of early; a drag that counts calls `onCommand(cmd)`.

const SWIPE_PX = 40, DEAD_PX = 8; // CSS pixels: how far a drag counts, and how far it must go to mean anything

export function createSwipe(canvas, { toLogical, view, kit, enabled = () => true, onCommand, onSwipe }) {
  let start = null;
  const cancel = () => { if (start) onSwipe?.('cancel'); start = null; };
  // The command a drag of (dx, dy) means, and how far along it is: 0 to 1, where 1 is far enough to count.
  const read = (dx, dy) => {
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    if (dist < DEAD_PX) return { cmd: null, amount: 0 };
    // The world follows the finger: drag it down to go forward, left to turn right.
    const cmd = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'right' : 'left') : (dy < 0 ? 'back' : 'forward');
    return { cmd, amount: Math.min(1, dist / SWIPE_PX) };
  };
  canvas.addEventListener('pointerdown', ev => {
    start = null;
    if (ev.pointerType !== 'touch' || !enabled()) return;
    const pt = toLogical(ev.clientX, ev.clientY), v = view();
    if (pt.x < v.x || pt.y < v.y || pt.x >= v.x + v.w || pt.y >= v.y + v.h || kit.at(pt.x, pt.y)) return;
    start = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
  });
  canvas.addEventListener('pointermove', ev => {
    if (!start || ev.pointerId !== start.id) return;
    if (!enabled()) { cancel(); return; }
    const { cmd, amount } = read(ev.clientX - start.x, ev.clientY - start.y);
    onSwipe?.(cmd ? 'move' : 'cancel', cmd, amount);
  });
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('pointerup', ev => {
    if (!start || ev.pointerId !== start.id) return;
    const { cmd, amount } = read(ev.clientX - start.x, ev.clientY - start.y);
    start = null;
    if (cmd && amount >= 1) onCommand(cmd); // the game sees the drag it had been showing end in this command
    else onSwipe?.('cancel');
  });
  return { cancel };
}
