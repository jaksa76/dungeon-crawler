// The engine's public API. A campaign imports from here and nowhere else in engine/. Everything but startGame also
// works outside a browser (tests, art tools), so the game loop is loaded only when a game starts.
export { defineContent, mergeContent } from './content/catalog.js';
export { engineContent } from './content/index.js';
export { resolveLevel } from './core/levels.js';

export async function startGame(options) {
  const { startGame: start } = await import('./core/game.js');
  return start(options);
}
