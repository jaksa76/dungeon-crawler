// Mouse: press a monster to attack immediately, hold to repeat. Touch: tap once
// or hold briefly to repeat; a drag remains a movement gesture and never attacks.
export function createSceneInput(canvas, { hit, getTarget, blocked, attack, interact, changed, cancelGesture,
  // Where the pointer's shape and hover text go (the default is the canvas itself); the game has more than the scene on it.
  cursor = (shape, title) => { canvas.style.cursor = shape; canvas.title = title; } }) {
  let press = null, point = null, hover = null, selection = null;
  const updateHover = () => {
    const target = blocked() ? null : press?.held ? getTarget(press.held) : selection ? getTarget(selection) : point ? hit(point.x, point.y) : null;
    const id = target?.id ?? null;
    if (hover !== id) { hover = id; changed(); }
    cursor(target?.kind === 'actor' ? 'crosshair' : target ? 'pointer' : '', target ? target.kind === 'actor' ? `Attack ${target.actor.name}` : `Use ${target.entity.name ?? 'object'}` : '');
  };
  function startAttack() {
    if (!press || blocked()) return;
    press.started = true; selection = press.touch ? press.target.id : null;
    cancelGesture(); press.held = press.target.id;
    if (attack(press.held) === false && press) press.held = null;
    updateHover();
  }
  canvas.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 || blocked()) return;
    point = { x: ev.clientX, y: ev.clientY }; selection = null;
    const target = hit(ev.clientX, ev.clientY); if (!target) { updateHover(); return; }
    press = { pointer: ev.pointerId, x: ev.clientX, y: ev.clientY, target, touch: ev.pointerType === 'touch', at: performance.now(), started: false, held: null };
    canvas.setPointerCapture?.(ev.pointerId);
    if (!press.touch) {
      ev.preventDefault(); ev.stopImmediatePropagation(); canvas.focus({ preventScroll: true });
      if (target.kind === 'actor') startAttack();
    }
    updateHover();
  }, true);
  canvas.addEventListener('pointermove', ev => {
    point = { x: ev.clientX, y: ev.clientY };
    if (press?.pointer === ev.pointerId && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > 8) {
      if (press.touch || press.target.kind !== 'actor') { press = null; selection = null; }
    }
    updateHover();
  }, true);
  canvas.addEventListener('pointerup', ev => {
    if (press?.pointer !== ev.pointerId) return;
    const completed = press;
    if (!blocked() && !completed.started) {
      cancelGesture();
      if (completed.target.kind === 'actor') { selection = completed.target.id; attack(completed.target.id); }
      else interact(completed.target);
    }
    press = null; ev.stopImmediatePropagation(); updateHover();
  }, true);
  const cancel = () => { press = null; selection = null; point = null; if (hover !== null) { hover = null; changed(); } cursor('', ''); };
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('lostpointercapture', () => { if (press) cancel(); });
  canvas.addEventListener('pointerleave', () => { if (!press) { point = null; updateHover(); } });
  canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Game view. Tap a creature to attack, or an object to use it.');
  return { cancel, get targetId() { return hover; },
    update(now) {
      if (blocked()) { if (press || hover) cancel(); return; }
      if (press?.touch && !press.started && press.target.kind === 'actor' && now - press.at >= 180) startAttack();
      if (press?.held && (!getTarget(press.held) || attack(press.held) === false)) { press.held = null; }
      updateHover();
    },
  };
}
