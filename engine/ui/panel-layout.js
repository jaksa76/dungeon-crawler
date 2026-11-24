// The painted desktop panel (engine/assets/ui/panel.png): the regions the engine draws over, in the image's own pixels.
export const uiLayout = {
  image: 'ui/panel',
  portrait: [42, 33, 163, 175],
  hp: [292, 56, 212, 25],
  mp: [292, 112, 212, 25],
  xp: [316, 166, 188, 14], // the experience bar under the mana bar, with `xpLabel` (the hero's level) on its left
  xpLabel: [272, 173],
  map: [1178, 22, 253, 191],
  letters: [[1290, 16, 30, 30], [1290, 192, 30, 21], [1180, 99, 30, 27], [1396, 95, 27, 31]], // N S W E
};
