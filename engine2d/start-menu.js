// Shown when the page opens and saves exist: continue one, delete one, or start a new game in a free slot. Same
// panel as the menus and the defeat screen (see mobile-hud.css). Deleting takes two presses, so no browser dialog.
//
//   chooseStart(frame, { title, slots, max, remove(slot), describe(slot) }) -> { slot, mode: 'continue' | 'new' }
//
// `slots` is the store's list: [{ slot, savedAt, label }]. A new game takes the first free slot name, slot-1...
export function chooseStart(frame, { title, slots, max, remove, describe = s => `${s.label}  ${new Date(s.savedAt).toLocaleString()}` }) {
  const panel = document.createElement('section'); panel.className = 'rpg-panel rpg-game-over';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'start-title');
  const heading = document.createElement('h2'); heading.id = 'start-title'; heading.textContent = title.toUpperCase();
  frame.append(panel);
  const button = (text, onclick) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onclick = onclick; return b; };
  const freeSlot = () => { for (let n = 1; ; n++) if (!slots.some(s => s.slot === `slot-${n}`)) return `slot-${n}`; };
  return new Promise(resolve => {
    const done = result => { panel.remove(); resolve(result); };
    function draw() {
      panel.replaceChildren(heading);
      slots.forEach((s, i) => {
        const row = document.createElement('div');
        const go = button(describe(s), () => done({ slot: s.slot, mode: 'continue' }));
        const del = button('Delete', () => {
          if (del.textContent === 'Delete') { del.textContent = 'Sure?'; setTimeout(() => { del.textContent = 'Delete'; }, 3000); return; }
          remove(s.slot); slots = slots.filter(x => x !== s);
          if (slots.length) draw(); else done({ slot: freeSlot(), mode: 'new' });
        });
        row.append(go, del); panel.append(row);
        if (i === 0) go.focus({ preventScroll: true });
      });
      const full = max && slots.length >= max;
      const fresh = button(full ? 'New game (delete a save first)' : 'New game', () => done({ slot: freeSlot(), mode: 'new' }));
      fresh.disabled = !!full; panel.append(fresh);
    }
    draw();
  });
}
