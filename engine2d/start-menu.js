// Shown when the page opens and a save exists: continue it or start again. Same panel as the menus and the
// defeat screen (see mobile-hud.css). Resolves to 'continue' or 'new'.
export function chooseStart(frame, state, describe = () => '') {
  const panel = document.createElement('section'); panel.className = 'rpg-panel rpg-game-over';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'start-title');
  const title = document.createElement('h2'); title.id = 'start-title'; title.textContent = 'RAVENSMOOR';
  const text = document.createElement('p'); text.textContent = describe(state);
  const go = document.createElement('button'); go.type = 'button'; go.textContent = 'Continue';
  const fresh = document.createElement('button'); fresh.type = 'button'; fresh.textContent = 'New game';
  panel.append(title, text, go, fresh); frame.append(panel);
  go.focus({ preventScroll: true });
  return new Promise(resolve => {
    const done = choice => { panel.remove(); resolve(choice); };
    go.onclick = () => done('continue');
    fresh.onclick = () => { if (confirm('Delete your saved game and start again?')) done('new'); };
  });
}
