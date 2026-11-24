// When to save: the policy a game can set (`autosave` in the game options). `save` does the work and decides
// whether anything changed. Level changes are saved by the caller (`onLevelChange`), because only it knows when
// a change is complete. Returns a function that stops it.
// Off by default: saving is by hand from the settings panel (autosaving made death cost nothing). A game can turn it on.
export const defaultAutosave = { intervalMs: 0, onHidden: false, onLevelChange: false };

export function startAutosave(save, { intervalMs, onHidden }) {
  const timer = intervalMs ? setInterval(save, intervalMs) : null;
  const hidden = () => { if (document.hidden) save(); };
  if (onHidden) { document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', save); }
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', save);
  };
}
