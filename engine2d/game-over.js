// Keep the defeat screen open until the village has actually loaded. The button
// can skip the short pause; closing it with Escape cannot skip respawn.
export function createGameOver() {
  const dialog = document.createElement('dialog'); dialog.className = 'rpg-dialog rpg-game-over';
  dialog.setAttribute('role', 'alertdialog'); dialog.setAttribute('aria-labelledby', 'game-over-title');
  dialog.setAttribute('aria-describedby', 'game-over-description');
  const title = document.createElement('h2'); title.id = 'game-over-title'; title.textContent = 'GAME OVER';
  const description = document.createElement('p'); description.id = 'game-over-description';
  const button = document.createElement('button'); button.type = 'button';
  dialog.append(title, description, button); document.body.append(dialog);
  dialog.addEventListener('cancel', event => event.preventDefault());
  return {
    wait(retry = false) {
      description.textContent = retry ? 'The village could not be loaded. Try returning again.' : 'The creature caught you in the dark. You will awaken in the village.';
      button.disabled = false; button.textContent = 'Return to village';
      if (!dialog.open) dialog.showModal();
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
    close() { dialog.close(); },
  };
}
