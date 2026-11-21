// The painted bottom panel has six menu icons, each in a bronze-framed cell, and a row of eight quick-item slots,
// with their pictures baked in. This returns a copy of the panel image with those cells and slots painted over
// (frames and all, so the icons sit directly on the panel's stone), and `panelOverlay` draws the pixel-art icons
// on top, crisply, at the desktop panel's own resolution. (The phone buttons draw their icons from the atlas.)

// Icon ids, by position on the panel: attack, spell, journal, bag, full screen, settings.
export const MENU_ICONS = ['attack', 'spell', 'journal', 'bag', 'fullscreen', 'settings'];
// The quick-item row: sword, shield, red potion, blue potion, torch, scroll, crystal, key.
export const QUICK_ICONS = ['short-sword', 'round-shield', 'health-potion', 'mana-potion', 'torch', 'scroll', 'violet-crystal', 'iron-key'];

// Where things are in the painting, in panel-image pixels, measured from it (the menu cells are not quite evenly
// spaced). Menu cells: [left, right] of each frame's outer rim; their frames run from y 27 to 101.
const MENU_CELLS = [[547, 631], [646, 730], [744, 830], [846, 931], [946, 1037], [1051, 1137]];
const MENU_TOP = 23, MENU_BOTTOM = 105, MENU_CENTRE_Y = 64;
// The quick row is a strip with slot dividers; its inside runs x 545 to 1149, y 126 to 209, centred on x 847.
const QUICK_LEFT = 545, QUICK_RIGHT = 1150, QUICK_TOP = 126, QUICK_BOTTOM = 210, QUICK_CENTRE = [847, 167.5];
const QUICK_PITCH = 17; // canvas pixels between icons: eight 16-pixel icons with a 1-pixel gap fit the strip
const STONE = [25, 18, 29]; // the panel's dark stone: its mean colour

const cellCentre = i => (MENU_CELLS[i][0] + MENU_CELLS[i][1]) / 2;

// Draws the pixel-art icons. Pass it to createUI as `overlay`; `s` is canvas pixels per panel-image pixel.
export function panelOverlay(icons) {
  return (g, s) => {
    MENU_ICONS.forEach((id, i) => {
      const n = icons.native(id);
      if (!n) return;
      icons.draw(g, id, Math.round(cellCentre(i) * s - n / 2), Math.round(MENU_CENTRE_Y * s - n / 2), n, n);
    });
    const first = Math.round(QUICK_CENTRE[0] * s - (QUICK_ICONS.length * QUICK_PITCH - 1) / 2), top = Math.round(QUICK_CENTRE[1] * s - 8);
    QUICK_ICONS.forEach((id, i) => { if (icons.native(id)) icons.draw(g, id, first + i * QUICK_PITCH, top, icons.native(id), icons.native(id)); });
  };
}

export function withIcons(image, icons) {
  const c = document.createElement('canvas');
  c.width = image.width; c.height = image.height;
  const g = c.getContext('2d');
  g.drawImage(image, 0, 0);
  g.imageSmoothingQuality = 'high';

  // Paint over a rectangle with stone of the same colour and grain as the panel around it. The grain is a fixed
  // pseudo-random pattern, so it is the same every time.
  let seed = 12345;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const stone = (x0, y0, x1, y1) => {
    const patch = g.createImageData(x1 - x0, y1 - y0);
    for (let i = 0; i < patch.data.length; i += 4) {
      const grain = (random() - 0.5) * 14;
      patch.data[i] = STONE[0] + grain; patch.data[i + 1] = STONE[1] + grain * 0.8; patch.data[i + 2] = STONE[2] + grain * 0.8; patch.data[i + 3] = 255;
    }
    g.putImageData(patch, x0, y0);
  };
  for (const [left, right] of MENU_CELLS) stone(left - 4, MENU_TOP, right + 5, MENU_BOTTOM);
  stone(QUICK_LEFT, QUICK_TOP, QUICK_RIGHT, QUICK_BOTTOM);

  // Painted (not pixel-art) icons are drawn here, smoothly; pixel-art icons are drawn crisply by panelOverlay.
  MENU_ICONS.forEach((id, i) => { if (!icons.native(id)) icons.draw(g, id, cellCentre(i) - 29, MENU_CENTRE_Y - 29, 58, 58); });
  QUICK_ICONS.forEach((id, i) => { if (!icons.native(id)) icons.draw(g, id, QUICK_LEFT + 8 + i * 76, QUICK_CENTRE[1] - 30, 60, 60); });
  return c;
}
