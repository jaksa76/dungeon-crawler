// The icon atlas: every item and interface icon, as 64x64 transparent tiles in one image.
// Built by `node tools/icon-sheets.mjs pack` from the painted sheets; see docs/icons.md.
import { loadImage } from './compositor.js';

// style: 'pixel' (16x16 pixel art, atlas.png) or 'detailed' (painted, shrunk smoothly, atlas-hd.png).
export const ICON_STYLES = ['pixel', 'detailed'];
export function savedIconStyle(search = location.search) {
  const asked = new URLSearchParams(search).get('icons');
  if (asked) return asked === 'hd' || asked === 'detailed' ? 'detailed' : 'pixel';
  try { return localStorage.getItem('iconStyle') === 'detailed' ? 'detailed' : 'pixel'; } catch { return 'pixel'; }
}
export function saveIconStyle(style) { try { localStorage.setItem('iconStyle', style); } catch { /* private window: lasts until reload only */ } }

export async function loadIcons(path, style = 'pixel') {
  const suffix = style === 'detailed' ? '-hd' : '';
  const [manifest, image] = await Promise.all([
    fetch(`${path}/atlas${suffix}.json`).then(response => {
      if (!response.ok) throw new Error(`Could not load the icon atlas (${response.status}).`);
      return response.json();
    }),
    loadImage(`${path}/atlas${suffix}.png`),
  ]);
  const { size, cols, icons, native = {} } = manifest; // native: id -> pixels across, for true pixel-art icons
  return {
    image, size, style,
    has: id => Object.hasOwn(icons, id),
    // Pixels across for a true pixel-art icon (such as 12), or undefined for a painted one. Draw it at a whole
    // multiple of that and it stays crisp.
    native: id => native[id],
    // Draw icon `id` into the rectangle (dx, dy, dw, dh).
    draw(g, id, dx, dy, dw, dh) {
      const i = icons[id];
      if (i === undefined) throw new Error(`unknown icon "${id}"`);
      const tx = (i % cols) * size, ty = Math.floor(i / cols) * size, n = native[id];
      if (!n) { g.drawImage(image, tx, ty, size, size, dx, dy, dw, dh); return; }
      // A pixel-art icon: its n pixels were enlarged k times and centred in the tile (see tools/icon-sheets.mjs pack);
      // draw just that part, without smoothing, so each icon pixel stays a hard block.
      const k = Math.floor(size / n), span = n * k, pad = (size - span) >> 1, smooth = g.imageSmoothingEnabled;
      g.imageSmoothingEnabled = false;
      g.drawImage(image, tx + pad, ty + pad, span, span, dx, dy, dw, dh);
      g.imageSmoothingEnabled = smooth;
    },
  };
}
