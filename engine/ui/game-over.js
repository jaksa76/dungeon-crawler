// Keep the defeat screen open until the respawn level has actually loaded (`place` names it: 'the village'). The button
// can skip the short pause; nothing else closes it, so Escape cannot skip respawn.
// It is the same panel as the menus (see mobile-hud.css): it covers the scene, not the page.
export function createGameOver(frame, { place = 'safety' } = {}) {
  const panel = document.createElement('section'); panel.className = 'rpg-panel rpg-game-over'; panel.hidden = true;
  panel.setAttribute('role', 'alertdialog'); panel.setAttribute('aria-labelledby', 'game-over-title');
  panel.setAttribute('aria-describedby', 'game-over-description');
  const title = document.createElement('h2'); title.id = 'game-over-title'; title.textContent = 'GAME OVER';
  const description = document.createElement('p'); description.id = 'game-over-description';
  const button = document.createElement('button'); button.type = 'button';
  panel.append(title, description, button); frame.append(panel);
  return {
    wait(retry = false) {
      description.textContent = retry ? `The way back to ${place} could not be opened. Try returning again.` : `The creature overcame you in the dark. You will awaken in ${place}.`;
      button.disabled = false; button.textContent = `Return to ${place}`;
      panel.hidden = false; button.focus({ preventScroll: true });
      return new Promise(resolve => {
        let timer;
        const finish = () => {
          clearTimeout(timer); button.onclick = null;
          button.disabled = true; button.textContent = 'Returning...'; resolve();
        };
        button.onclick = finish;
        if (!retry) timer = setTimeout(finish, 3000);
      });
    },
    close() { panel.hidden = true; },
  };
}
