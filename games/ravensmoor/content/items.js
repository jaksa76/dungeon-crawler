// Ravensmoor's own items, and its changes to the engine's (engine/content/items.js). Same format; `icon` may name an
// icon from the engine's atlas or from Ravensmoor's sheet (icons.js).
export const items = {
  'raven-amulet': { name: 'Raven amulet', type: 'armour', slot: 'amulet', bonus: { defence: 1 }, icon: 'raven-amulet',
    description: 'A black iron raven on a silver chain, its eye a chip of violet glass. Ravensmoor’s old sign of luck.' },
  torch: { description: 'A pitch-soaked torch. The Undercrypt is very dark.' }, // the engine's torch, with a hint
};
