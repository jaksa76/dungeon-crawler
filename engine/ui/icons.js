// The icon atlas: every item and interface icon, as 64x64 transparent tiles in one image.
// Built by `node tools/icon-sheets.mjs pack` from the painted sheets; see docs/engine/icons.md.
// A campaign's own icon spritesheets (content books' `icons`, see content/catalog.js) are added on top.
import { loadImage } from '../render/compositor.js';

// style: 'pixel' (16x16 pixel art, atlas.png) or 'detailed' (painted, shrunk smoothly, atlas-hd.png).
export const ICON_STYLES = ['pixel', 'detailed'];
export function savedIconStyle(search = location.search) {
  const asked = new URLSearchParams(search).get('icons');
  if (asked) return asked === 'hd' || asked === 'detailed' ? 'detailed' : 'pixel';
  try { return localStorage.getItem('iconStyle') === 'detailed' ? 'detailed' : 'pixel'; } catch { return 'pixel'; }
}
export function saveIconStyle(style) { try { localStorage.setItem('iconStyle', style); } catch { /* private window: lasts until reload only */ } }

export async function loadIcons(path, style = 'pixel', sheets = []) {
  const suffix = style === 'detailed' ? '-hd' : '';
  const [manifest, image] = await Promise.all([
    fetch(`${path}/atlas${suffix}.json`).then(response => {
      if (!response.ok) throw new Error(`Could not load the icon atlas (${response.status}).`);
      return response.json();
    }),
    loadImage(`${path}/atlas${suffix}.png`),
  ]);
  const { size, cols, icons, native = {} } = manifest; // native: id -> pixels across, for true pixel-art icons
  const extra = await loadSheets(sheets, style);
  return {
    image, size, style,
    has: id => extra.has(id) || Object.hasOwn(icons, id),
    // Pixels across for a true pixel-art icon (such as 12), or undefined for a painted one. Draw it at a whole
    // multiple of that and it stays crisp.
    native: id => extra.has(id) ? extra.get(id).native : native[id],
    // Draw icon `id` into the rectangle (dx, dy, dw, dh).
    draw(g, id, dx, dy, dw, dh) {
      const own = extra.get(id);
      if (own) {
        const smooth = g.imageSmoothingEnabled;
        if (own.native) g.imageSmoothingEnabled = false;
        g.drawImage(own.image, own.x, own.y, own.tile, own.tile, dx, dy, dw, dh);
        g.imageSmoothingEnabled = smooth;
        return;
      }
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

// id -> { image, x, y, tile, native } for every icon of the campaign's sheets, in the player's style: a sheet's
// `detailed` version when the style is 'detailed' and it has one. Later sheets win over earlier ones.
async function loadSheets(sheets, style) {
  const found = new Map();
  for (const sheet of sheets) {
    const { url, tile } = style === 'detailed' && sheet.detailed ? sheet.detailed : sheet;
    const image = await loadImage(url);
    if (!image) throw new Error(`Could not load the icon sheet "${sheet.id}" (${url}).`);
    const cols = Math.floor(image.width / tile), rows = Math.floor(image.height / tile);
    if (sheet.icons.length > cols * rows) throw new Error(`The icon sheet "${sheet.id}" lists ${sheet.icons.length} icons but holds only ${cols * rows} tiles of ${tile} pixels.`);
    sheet.icons.forEach((id, i) => found.set(id, { image, tile, x: (i % cols) * tile, y: Math.floor(i / cols) * tile, native: tile <= 32 ? tile : undefined }));
  }
  return found;
}
