// When to save: the policy a game can set (`autosave` in the game options). `save` does the work and decides
// whether anything changed. Level changes are saved by the caller (`onLevelChange`), because only it knows when
// a change is complete. Returns a function that stops it.
export const defaultAutosave = { intervalMs: 5000, onHidden: true, onLevelChange: true };

export function startAutosave(save, { intervalMs, onHidden }) {
  const timer = intervalMs ? setInterval(save, intervalMs) : null;
  const hidden = () => { if (document.hidden) save(); };
  if (onHidden) { document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', save); }
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', save);
  };
}
