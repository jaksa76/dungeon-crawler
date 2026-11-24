// Ravensmoor's own items, and its changes to the engine's (engine/content/items.js). Same format; `icon` may name an
// icon from the engine's atlas or from Ravensmoor's sheet (icons.js). `use(game, stack)` is what using it does (see
// docs/engine/behaviour.md).
export const items = {
  'raven-amulet': { name: 'Raven amulet', type: 'armour', slot: 'amulet', bonus: { defence: 1, luck: 1 }, value: 60, drop: false, icon: 'raven-amulet',
    description: 'A black iron raven on a silver chain, its eye a chip of violet glass. Ravensmoor’s old sign of luck.' },
  // Opens the crypt gate in the Undercrypt, from wherever it is blown.
  'raven-horn': { name: 'Raven horn', type: 'tool', icon: 'raven-horn',
    description: 'A black horn banded with silver, its bell carved like a raven’s open beak. The stranger said the crypt gate answers to it.',
    use(game) {
      const gate = game.find('dungeon', 'crypt-gate');
      if (gate.isOpen()) { game.say('The horn’s call fades. Below, the crypt gate already stands open.'); return { message: 'The crypt gate already stands open.' }; }
      gate.open(game, { force: true });
      const message = game.isHere(gate) ? 'The horn’s cry echoes down the passages, and the crypt gate grinds open.' : 'You sound the horn. Far below, iron grinds on stone.';
      game.say(message);
      return { message };
    } },
  torch: { description: 'A pitch-soaked torch. The Undercrypt is very dark.' }, // the engine's torch, with a hint
};
