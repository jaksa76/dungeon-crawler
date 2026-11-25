// Pointer input for the one canvas. It turns pointer events into the gestures the regions of a canvas kit
// (ui/canvas.js) ask for, so a screen only says what a tap on a button does:
//
//   tap       press and release without moving
//   hold      press and keep still for `HOLD_MS` (the quick bar describes a slot)
//   press     the region takes the pointer over: `press(pt, ev)` returns { move(pt), up(pt) } (the sticks)
//   drag      press, move, and `drag(pt)` returns a payload: it is carried, drawn by `payload.draw(kit, x, y)`, and dropped
//             on the topmost region that `accepts(payload)` and handles `drop(payload)`; let go over nothing,
//             `payload.dropAway?.()` runs (taking a slot off the quick bar)
//   scroll    press, move on a scroll region (and no drag payload): the content follows the finger; the wheel scrolls too
//
// Each pointer is its own gesture, so two thumbs can work two sticks at once. Points are logical canvas pixels.

const HOLD_MS = 500, THRESHOLD = 3;

export function createInput(canvas, kit, { toLogical, enabled = () => true, cursor = () => {} } = {}) {
  const gestures = new Map();
  let drag = null; // { payload, x, y } while something is carried

  const point = ev => toLogical(ev.clientX, ev.clientY);
  const clearPressed = () => { kit.state.pressed = null; kit.state.drop = null; };

  function begin(ev) {
    if (!enabled() || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    const pt = point(ev), region = kit.at(pt.x, pt.y);
    if (!region) return;
    ev.preventDefault();
    canvas.setPointerCapture?.(ev.pointerId);
    const gesture = { id: ev.pointerId, start: pt, pt, region, moved: false, held: false, capture: null, timer: 0,
      scroller: kit.at(pt.x, pt.y, r => r.scroll) };
    if (region.press) { // takes the pointer over
      gesture.capture = region.press(pt, ev) ?? null;
      kit.state.pressed = region.key;
    } else {
      if (region.tap || region.hold || region.drag) kit.state.pressed = region.key;
      if (region.hold) gesture.timer = setTimeout(() => { if (!gesture.moved && gestures.get(gesture.id) === gesture) { gesture.held = true; clearPressed(); region.hold(gesture.pt); } }, HOLD_MS);
    }
    gestures.set(ev.pointerId, gesture);
  }

  function move(ev) {
    const gesture = gestures.get(ev.pointerId), pt = point(ev);
    if (!gesture) { hover(pt, ev); return; }
    const last = gesture.pt; gesture.pt = pt;
    if (gesture.capture) { gesture.capture.move?.(pt); return; }
    if (!gesture.moved && Math.hypot(pt.x - gesture.start.x, pt.y - gesture.start.y) < THRESHOLD) return;
    if (!gesture.moved) {
      gesture.moved = true; clearTimeout(gesture.timer);
      const payload = gesture.region.drag?.(gesture.start);
      if (payload) { gesture.payload = payload; drag = { payload, x: pt.x, y: pt.y }; clearPressed(); }
      else if (gesture.scroller) clearPressed(); // scrolling, not pressing
      else { clearPressed(); return; }
    }
    if (gesture.payload) {
      drag.x = pt.x; drag.y = pt.y;
      const over = kit.at(pt.x, pt.y, r => r.drop && (!r.accepts || r.accepts(gesture.payload)));
      kit.state.drop = over?.key ?? null;
    } else if (gesture.scroller) {
      const s = gesture.scroller.scroll;
      s.y = Math.max(0, Math.min(s.max, s.y - (pt.y - last.y)));
    }
  }

  function end(ev, cancelled = false) {
    const gesture = gestures.get(ev.pointerId);
    if (!gesture) return;
    gestures.delete(ev.pointerId); clearTimeout(gesture.timer);
    const pt = point(ev);
    clearPressed();
    if (gesture.capture) { gesture.capture.up?.(pt, cancelled); return; }
    if (gesture.payload) {
      drag = null;
      if (cancelled) return;
      const target = kit.at(pt.x, pt.y, r => r.drop && (!r.accepts || r.accepts(gesture.payload)));
      if (target) target.drop(gesture.payload); else gesture.payload.dropAway?.(pt);
      return;
    }
    if (!cancelled && !gesture.moved && !gesture.held) gesture.region.tap?.(pt);
  }

  function hover(pt, ev) {
    if (ev.pointerType !== 'mouse' || !enabled()) { cursor(null, ''); return; }
    const r = kit.at(pt.x, pt.y);
    kit.state.over = r?.key ?? null;
    cursor(r && !r.disabled && (r.tap || r.press || r.drag) ? 'pointer' : null, r?.title ?? '');
  }

  canvas.addEventListener('pointerdown', begin);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', ev => end(ev));
  canvas.addEventListener('pointercancel', ev => end(ev, true));
  canvas.addEventListener('lostpointercapture', ev => end(ev, true));
  canvas.addEventListener('pointerleave', () => { kit.state.over = null; cursor(null, ''); });
  canvas.addEventListener('contextmenu', ev => {
    if (!enabled()) return;
    const pt = point(ev), r = kit.at(pt.x, pt.y);
    if (r?.hold) { ev.preventDefault(); r.hold(pt); }
  });
  canvas.addEventListener('wheel', ev => {
    if (!enabled()) return;
    const pt = point(ev), r = kit.at(pt.x, pt.y, x => x.scroll);
    if (!r) return;
    ev.preventDefault();
    const s = r.scroll; s.y = Math.max(0, Math.min(s.max, s.y + Math.sign(ev.deltaY) * 18));
  }, { passive: false });

  return {
    // Draw what is being carried, over everything.
    drawDrag() { if (drag) { kit.origin(0, 0); drag.payload.draw?.(kit, drag.x, drag.y); } },
    get dragging() { return !!drag; },
    cancel() { for (const [id, gesture] of gestures) { clearTimeout(gesture.timer); gesture.capture?.up?.(gesture.pt, true); gestures.delete(id); } drag = null; clearPressed(); },
  };
}
