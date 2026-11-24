// The painted bottom panel has six menu icons, each in a bronze-framed cell, and a strip for the quick bar (eight slots),
// with their pictures baked in. This returns a copy of the panel image with those cells and the strip painted over
// (frames and all, so the icons sit directly on the panel's stone), and `panelOverlay` draws the pixel-art icons
// and the quick bar on top, crisply, at the desktop panel's own resolution. (The phone buttons draw their icons from the atlas.)
import { drawText } from './bitmapfont.js';

// Icon ids, by position on the panel: attack, spell, journal, bag, full screen, settings.
export const MENU_ICONS = ['attack', 'spell', 'journal', 'bag', 'fullscreen', 'settings'];

// Where things are in the painting, in panel-image pixels, measured from it (the menu cells are not quite evenly
// spaced). Menu cells: [left, right] of each frame's outer rim; their frames run from y 27 to 101.
const MENU_CELLS = [[547, 631], [646, 730], [744, 830], [846, 931], [946, 1037], [1051, 1137]];
const MENU_TOP = 23, MENU_BOTTOM = 105, MENU_CENTRE_Y = 64;
// The quick row is a strip; its inside runs x 545 to 1149, y 126 to 209. It is repainted bare and the slots are drawn
// over it, eight to the strip.
const QUICK_LEFT = 545, QUICK_RIGHT = 1150, QUICK_TOP = 126, QUICK_BOTTOM = 210, QUICK_CENTRE_Y = 167.5;
const QUICK_COUNT = 8, QUICK_CELL = (QUICK_RIGHT - QUICK_LEFT) / QUICK_COUNT; // a slot's width in the panel image's pixels

// The quick slot under a point given in panel-image pixels, or -1.
export function quickSlotAt(x, y) {
  if (x < QUICK_LEFT || x >= QUICK_RIGHT || y < QUICK_TOP || y >= QUICK_BOTTOM) return -1;
  return Math.floor((x - QUICK_LEFT) / QUICK_CELL);
}
const STONE = [25, 18, 29]; // the panel's dark stone: its mean colour

const cellCentre = i => (MENU_CELLS[i][0] + MENU_CELLS[i][1]) / 2;

// Draws the pixel-art icons and the quick bar. Pass it to createUI as `overlay`; `s` is canvas pixels per panel-image pixel.
// `quick()` returns the bar as the session sees it (session.quickView(): null or { icon, count, usable, worn, cost, cooldown,
// enchant, magicType, kind } for each slot), `hot()` the slot a drag is over (or -1), `colourOf(type)` a magic type's colour,
// and `font` is the bitmap font for the numbers.
export function panelOverlay(icons, { quick = () => [], hot = () => -1, colourOf = () => '#ffffff', font = null } = {}) {
  return (g, s) => {
    MENU_ICONS.forEach((id, i) => {
      const n = icons.native(id);
      if (!n) return;
      icons.draw(g, id, Math.round(cellCentre(i) * s - n / 2), Math.round(MENU_CENTRE_Y * s - n / 2), n, n);
    });
    const slots = quick(), over = hot();
    const size = 16, top = Math.round(QUICK_CENTRE_Y * s - size / 2);
    for (let i = 0; i < QUICK_COUNT; i++) {
      const left = Math.round((QUICK_LEFT + (i + 0.5) * QUICK_CELL) * s - size / 2), v = slots[i] ?? null;
      g.fillStyle = '#120d12'; g.fillRect(left, top, size, size); // the slot's well
      g.fillStyle = over === i ? '#ffe0a0' : v?.worn ? '#d8a840' : '#43332b'; // its rim: lit while a drag is over it, gold for what is worn
      g.fillRect(left, top, size, 1); g.fillRect(left, top + size - 1, size, 1); g.fillRect(left, top, 1, size); g.fillRect(left + size - 1, top, 1, size);
      if (!v) continue;
      const outline = v.kind === 'spell' ? { colour: colourOf(v.magicType), tier: 2 } : v.enchant ? { colour: colourOf(v.enchant.type), tier: v.enchant.tier ?? 1 } : null;
      g.save();
      g.beginPath(); g.rect(left + 1, top + 1, size - 2, size - 2); g.clip();
      if (!v.usable && !v.worn) g.globalAlpha = 0.4;
      icons.draw(g, v.icon, left, top, size, size, outline);
      g.restore();
      if (v.cooldown > 0) { g.fillStyle = 'rgba(8,6,12,0.65)'; g.fillRect(left + 1, top + 1, size - 2, Math.ceil((size - 2) * v.cooldown)); } // a spell cooling down: the shade drains upwards
      if (!font) continue;
      const number = v.kind === 'spell' ? String(v.cost) : v.count > 1 || (v.count === 0 && !v.worn) ? String(v.count) : '';
      if (number) drawText(g, font, number, left + size - 1, top + size - font.h, v.kind === 'spell' ? (v.reason === 'mana' ? '#d86a6a' : '#7ab0ff') : v.count === 0 ? '#d86a6a' : '#fff3db', { outline: '#140c10', align: 'right' });
    }
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
  const stone = (x0, y0, x1, y1, tint = STONE) => {
    const patch = g.createImageData(x1 - x0, y1 - y0);
    for (let i = 0; i < patch.data.length; i += 4) {
      const grain = (random() - 0.5) * 14;
      patch.data[i] = tint[0] + grain; patch.data[i + 1] = tint[1] + grain * 0.8; patch.data[i + 2] = tint[2] + grain * 0.8; patch.data[i + 3] = 255;
    }
    g.putImageData(patch, x0, y0);
  };
  for (const [left, right] of MENU_CELLS) stone(left - 4, MENU_TOP, right + 5, MENU_BOTTOM);
  stone(QUICK_LEFT, QUICK_TOP, QUICK_RIGHT, QUICK_BOTTOM, [42, 29, 27]);
  const strip = QUICK_RIGHT - QUICK_LEFT, height = QUICK_BOTTOM - QUICK_TOP;
  g.fillStyle = '#755137'; g.fillRect(QUICK_LEFT, QUICK_TOP, strip, 4); g.fillRect(QUICK_LEFT, QUICK_TOP, 4, height);
  g.fillStyle = '#170e12'; g.fillRect(QUICK_LEFT, QUICK_BOTTOM - 4, strip, 4); g.fillRect(QUICK_RIGHT - 4, QUICK_TOP, 4, height);

  // Painted (not pixel-art) icons are drawn here, smoothly; pixel-art icons are drawn crisply by panelOverlay.
  MENU_ICONS.forEach((id, i) => { if (!icons.native(id)) icons.draw(g, id, cellCentre(i) - 29, MENU_CENTRE_Y - 29, 58, 58); });
  return c;
}
