// The painted bottom panel has six menu icons. This returns a copy of the panel image in which the
// parchment-scroll icon (the old Map button) is replaced by a full-screen glyph, so the desktop panel
// and the phone buttons, which both crop their icons from the panel, show the same thing.

const MAP_ICON = [545 + 4 * 99, 20, 99, 92]; // menu icon i is at x = 545 + i * 99

export function withFullscreenIcon(image) {
  const [x, y, w, h] = MAP_ICON;
  const c = document.createElement('canvas');
  c.width = image.width; c.height = image.height;
  const g = c.getContext('2d');
  g.drawImage(image, 0, 0);
  // Clear the scroll down to the cell's dark stone, inside its bronze frame.
  const ix = x + 12, iy = y + 15, iw = w - 20, ih = h - 32;
  g.fillStyle = '#251a28'; g.fillRect(ix, iy, iw, ih);
  // Four corner brackets pointing outwards, in the gear icon's pale metal with a dark drop shadow.
  const cx = ix + iw / 2, cy = iy + ih / 2, T = 5, ARM = 16;
  for (const [fill, dx, dy, grow] of [['#140c10', 2, 2, 1], ['#d4bfb0', 0, 0, 0]]) {
    g.fillStyle = fill;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const px = cx + sx * 26 + dx, py = cy + sy * 20 + dy;
      g.fillRect(sx > 0 ? px - ARM - grow : px - grow, sy > 0 ? py - T - grow : py - grow, ARM + 2 * grow, T + 2 * grow); // horizontal arm
      g.fillRect(sx > 0 ? px - T - grow : px - grow, sy > 0 ? py - ARM - grow : py - grow, T + 2 * grow, ARM + 2 * grow); // vertical arm
    }
  }
  return c;
}
