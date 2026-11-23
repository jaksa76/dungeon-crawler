// Keep the defeat screen open until the village has actually loaded. The button
// can skip the short pause; nothing else closes it, so Escape cannot skip respawn.
// It is the same panel as the menus (see mobile-hud.css): it covers the scene, not the page.
export function createGameOver(frame) {
  const panel = document.createElement('section'); panel.className = 'rpg-panel rpg-game-over'; panel.hidden = true;
  panel.setAttribute('role', 'alertdialog'); panel.setAttribute('aria-labelledby', 'game-over-title');
  panel.setAttribute('aria-describedby', 'game-over-description');
  const title = document.createElement('h2'); title.id = 'game-over-title'; title.textContent = 'GAME OVER';
  const description = document.createElement('p'); description.id = 'game-over-description';
  const button = document.createElement('button'); button.type = 'button';
  panel.append(title, description, button); frame.append(panel);
  return {
    // `toSave`: you will awaken at the last save rather than in the village.
    wait(retry = false, toSave = false) {
      const where = toSave ? 'at your last save' : 'in the village';
      description.textContent = retry ? 'The village could not be loaded. Try returning again.' : `The creature overcame you in the dark. You will awaken ${where}.`;
      button.disabled = false; button.textContent = toSave ? 'Return to last save' : 'Return to village';
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
