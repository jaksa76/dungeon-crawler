// The quick bar on the screen. On a phone it is a block of buttons in the left rail (DOM); on the desktop it is drawn in
// the painted panel (ui/panel-icons.js) and this module only answers for it: what is under the pointer, which slot a
// drag is over, what pressing one does. Both share one gesture, so they behave the same:
//
//   tap or click      use the slot (an item is used or worn, a spell is cast)
//   press and hold    its name and what it does, in the message line
//   drag to a slot    move it there (swap with what was there)
//   drag away         take it off the bar
//
// Things from the satchel and the spell list are dragged onto a slot too (their screens call `slotAt` and `hover`).
// See docs/engine/quickbar.md.

export const SHOWN_SMALL = 6; // slots on a phone; the desktop panel shows them all

// A press on something draggable. Moving more than a few pixels lifts a ghost of it, which follows the pointer;
// `over(x, y)` says what is under it, `onHover(now, before)` hears when that changes, and `onDrop(target)` when it
// lets go (not when cancelled). Without a move: `onTap` at release, or `onHold` after `holdMs` of keeping still.
export function dragGesture(e, { makeGhost, over, onHover, onDrop, onTap, onHold, holdMs = 500, threshold = 6 }) {
  const id = e.pointerId, x0 = e.clientX, y0 = e.clientY;
  let ghost = null, target = null, held = false, done = false;
  const timer = onHold ? setTimeout(() => { if (!ghost && !done) { held = true; onHold(); } }, holdMs) : 0;
  const finish = (ev, cancelled) => {
    if (ev.pointerId !== id || done) return;
    done = true; clearTimeout(timer);
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
    if (ghost) {
      document.documentElement.style.userSelect = '';
      ghost.remove(); onHover?.(null, target);
      if (!cancelled) onDrop?.(over(ev.clientX, ev.clientY));
    } else if (!cancelled && !held) onTap?.();
  };
  const up = ev => finish(ev, false), cancel = ev => finish(ev, true);
  const move = ev => {
    if (ev.pointerId !== id || done) return;
    if (!ghost) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < threshold) return;
      clearTimeout(timer);
      ghost = makeGhost();
      if (!ghost) { done = true; cleanup(); return; }
      document.body.append(ghost);
      getSelection()?.removeAllRanges(); document.documentElement.style.userSelect = 'none'; // no text gets selected on the way
    }
    ghost.style.transform = `translate(${ev.clientX - ghost.clientWidth / 2}px, ${ev.clientY - ghost.clientHeight / 2}px)`;
    const now = over(ev.clientX, ev.clientY);
    if (now !== target) { onHover?.(now, target); target = now; }
  };
  const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
}

// quick: the game's adapter { size, view(), set(i, ref), clear(i), swap(a, b), activate(i), describe(i), canvasSlotAt(x, y), setHot(i) }.
// container: where the buttons go. iconCanvas(iconId, size, outline) makes an icon through the HUD's pixel-exact art
// registry. `say(text)` shows a line to the player. `colourOf(type)` is a magic type's colour.
export function createQuickHud({ quick, container, iconCanvas, say, colourOf }) {
  const count = Math.min(quick.size, SHOWN_SMALL);
  let shown = quick.size; // how many slots the layout shows: all on the desktop, fewer on a phone
  const buttons = [];
  const outlineOf = v => (v.kind === 'spell' ? { colour: colourOf(v.magicType), tier: 2 } : v.enchant ? { colour: colourOf(v.enchant.type), tier: v.enchant.tier ?? 1 } : null);
  const ghostFor = v => { const c = iconCanvas(v.icon, 48, outlineOf(v)); c.classList.add('rpg-ghost'); c.removeAttribute('aria-hidden'); return c; };

  const domSlotAt = (x, y) => { const el = document.elementFromPoint(x, y)?.closest('[data-quick]'); return el ? +el.dataset.quick : null; };
  // The slot under the pointer, or null.
  const slotAt = (x, y) => { const i = domSlotAt(x, y) ?? quick.canvasSlotAt?.(x, y) ?? -1; return i >= 0 && i < shown ? i : null; };
  // Light the slot a drag is over (null: none).
  const hover = i => {
    buttons.forEach((b, n) => b.classList.toggle('drop-target', n === i));
    quick.setHot?.(i ?? -1);
  };
  const tell = i => { const d = quick.describe(i); if (d) say(`${d.name}: ${d.text}`); };

  // Press slot `i` (on its button, or on the desktop panel): a tap uses it, a hold describes it, a drag moves it or takes it off.
  function press(e, i) {
    if (e.button > 0) return;
    const v = quick.view()[i];
    dragGesture(e, {
      makeGhost: () => (v ? ghostFor(v) : null),
      over: slotAt, onHover: now => hover(now),
      onTap: () => quick.activate(i),
      onHold: () => (v ? tell(i) : say('An empty slot. Drag an item or a spell here.')),
      onDrop: target => { if (target === null) quick.clear(i); else if (target !== i) quick.swap(i, target); },
    });
  }

  for (let i = 0; i < count; i++) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.quick = i;
    b.addEventListener('pointerdown', e => press(e, i));
    b.addEventListener('click', e => { if (e.detail === 0) quick.activate(i); }); // from the keyboard: a mouse or finger press is handled above
    b.addEventListener('contextmenu', e => { e.preventDefault(); tell(i); });
    container.append(b); buttons.push(b);
  }

  const state = buttons.map(() => ({ key: '', canvas: null, badge: null, shade: null }));
  // Bring the buttons up to date with the bar. Cheap when nothing changed.
  function refresh() {
    const view = quick.view();
    buttons.forEach((b, i) => {
      const v = view[i] ?? null, s = state[i];
      const identity = v ? `${v.kind}:${v.id}` : '';
      if (s.key !== identity) { // another thing in the slot: a new picture
        s.key = identity; s.canvas?.remove(); s.badge?.remove(); s.shade?.remove(); s.canvas = s.badge = s.shade = null;
        if (v) {
          s.canvas = iconCanvas(v.icon, 32, outlineOf(v)); b.prepend(s.canvas);
          s.shade = document.createElement('i'); s.shade.className = 'cd'; b.append(s.shade);
          s.badge = document.createElement('b'); b.append(s.badge);
        }
        b.title = v ? v.name : 'Empty quick slot';
      }
      const label = !v ? 'Empty quick slot' : v.kind === 'spell' ? `${v.name}, ${v.cost} mana` : `${v.name}${v.count > 1 ? ` x${v.count}` : v.count === 0 && !v.worn ? ', none left' : ''}`;
      if (b.getAttribute('aria-label') !== `${i + 1}: ${label}`) b.setAttribute('aria-label', `${i + 1}: ${label}`);
      b.classList.toggle('empty', !v); b.classList.toggle('unusable', !!v && !v.usable && !v.worn); b.classList.toggle('worn', !!v?.worn);
      if (!v) return;
      const text = v.kind === 'spell' ? String(v.cost) : v.count > 1 || (v.count === 0 && !v.worn) ? String(v.count) : '';
      if (s.badge.textContent !== text) s.badge.textContent = text;
      s.badge.className = v.kind === 'spell' ? (v.reason === 'mana' ? 'short' : 'mana') : v.count === 0 ? 'short' : '';
      const shade = `${Math.round(v.cooldown * 100)}%`;
      if (s.shade.style.height !== shade) s.shade.style.height = shade;
    });
  }

  // The first free slot the layout shows, or -1.
  const firstFree = () => { const view = quick.view(); for (let i = 0; i < shown; i++) if (!view[i]) return i; return -1; };
  // Put `ref` on the bar in the first free slot, or take it off when it is already there. Returns a line for the player.
  function toggle(ref, name) {
    const view = quick.view(), at = view.findIndex(v => v && v.kind === ref.kind && v.id === ref.id);
    if (at >= 0) { quick.clear(at); return `${name} is off the quick bar.`; }
    const free = firstFree();
    if (free < 0) return 'The quick bar is full. Drag it onto a slot to replace one.';
    return quick.set(free, ref) ? `${name} is on the quick bar, slot ${free + 1}.` : 'That cannot go on the quick bar.';
  }
  const has = ref => quick.view().some(v => v && v.kind === ref.kind && v.id === ref.id);

  return { slotAt, hover, press, refresh, toggle, has, ghostFor, setShown(n) { shown = Math.min(quick.size, n); } };
}
