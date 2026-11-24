// The icon atlas: every item and interface icon, as 64x64 transparent tiles in one image.
// Built by `node tools/icon-sheets.mjs pack` from the painted sheets; see docs/engine/icons.md.
// A campaign's own icon spritesheets (content books' `icons`, see content/catalog.js) are added on top.
// An id `<icon>@<material>` is that icon with its grey metal repainted in the material's colours (recolour() below):
// the items of a family (content/catalog.js) share one picture.
import { loadImage } from '../render/compositor.js';

// style: 'pixel' (16x16 pixel art, atlas.png) or 'detailed' (painted, shrunk smoothly, atlas-hd.png).
export const ICON_STYLES = ['pixel', 'detailed'];
export function savedIconStyle(search = location.search) {
  const asked = new URLSearchParams(search).get('icons');
  if (asked) return asked === 'hd' || asked === 'detailed' ? 'detailed' : 'pixel';
  try { return localStorage.getItem('iconStyle') === 'detailed' ? 'detailed' : 'pixel'; } catch { return 'pixel'; }
}
export function saveIconStyle(style) { try { localStorage.setItem('iconStyle', style); } catch { /* private window: lasts until reload only */ } }

// The outline of an enchanted item (docs/engine/magic.md): the colour is the kind of magic, the strength is the tier.
// `width` is in canvas pixels, `alpha` how solid the line is, `glow` how far a soft halo of the same colour reaches. The
// icon is drawn that much smaller, to leave room for it.
export const TIER_NAMES = ['', 'faint', 'clear', 'strong', 'blazing'];
export const TIER_OUTLINE = [null,
  { width: 1, alpha: 0.5, glow: 0 },
  { width: 1, alpha: 1, glow: 2 },
  { width: 2, alpha: 1, glow: 4 },
  { width: 2, alpha: 1, glow: 8 }];

export async function loadIcons(path, style = 'pixel', sheets = [], materials = {}) {
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
  // Where icon `id` is: { image, x, y, tile, native } (the atlas's tile is `size` across; a native icon's n pixels
  // were enlarged k times and centred in it, see tools/icon-sheets.mjs pack).
  const source = id => {
    if (extra.has(id)) return extra.get(id);
    const i = icons[id];
    if (i === undefined) return null;
    return { image, x: (i % cols) * size, y: Math.floor(i / cols) * size, tile: size, native: native[id], atlas: true };
  };
  // Recoloured icons, made the first time they are drawn.
  const variants = new Map();
  const variant = id => {
    if (!variants.has(id)) {
      const [base, material] = id.split('@'), from = source(base), colours = materials[material]?.colours;
      if (!from) throw new Error(`unknown icon "${base}"`);
      if (!colours) throw new Error(`icon "${id}": unknown material "${material}"`);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = from.tile;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      g.drawImage(from.image, from.x, from.y, from.tile, from.tile, 0, 0, from.tile, from.tile);
      const pixels = g.getImageData(0, 0, from.tile, from.tile);
      recolour(pixels.data, colours);
      g.putImageData(pixels, 0, 0);
      variants.set(id, { ...from, image: canvas, x: 0, y: 0 });
    }
    return variants.get(id);
  };
  const find = id => id.includes('@') ? variant(id) : source(id);
  const baseOf = id => id.split('@')[0];
  return {
    image, size, style,
    has: id => !!source(baseOf(id)) && (!id.includes('@') || !!materials[id.split('@')[1]]),
    // Pixels across for a true pixel-art icon (such as 12), or undefined for a painted one. Draw it at a whole
    // multiple of that and it stays crisp.
    native: id => source(baseOf(id))?.native,
    // Draw icon `id` into the rectangle (dx, dy, dw, dh). `outline` ({ colour, tier }) rings it in a kind of magic's colour,
    // as strong as the tier says (TIER_OUTLINE).
    draw(g, id, dx, dy, dw, dh, outline = null) {
      const style = outline && TIER_OUTLINE[Math.min(4, Math.max(0, Math.round(outline.tier)))];
      if (!style) { paint(g, id, dx, dy, dw, dh); return; }
      // The icon, shrunk to leave room; its silhouette in the colour, stamped around it; a halo; then the icon on top.
      const m = style.width + Math.ceil(style.glow / 2), iw = dw - 2 * m, ih = dh - 2 * m;
      if (iw < 4 || ih < 4) { paint(g, id, dx, dy, dw, dh); return; }
      const shape = document.createElement('canvas'); shape.width = Math.max(1, Math.round(dw)); shape.height = Math.max(1, Math.round(dh));
      const s = shape.getContext('2d');
      s.imageSmoothingEnabled = g.imageSmoothingEnabled;
      paint(s, id, m, m, iw, ih);
      s.globalCompositeOperation = 'source-in'; s.fillStyle = outline.colour; s.fillRect(0, 0, shape.width, shape.height);
      g.save();
      if (style.glow) { g.shadowColor = outline.colour; g.shadowBlur = style.glow; g.globalAlpha = 0.9; g.drawImage(shape, dx, dy); g.shadowBlur = 0; }
      g.globalAlpha = style.alpha;
      for (let a = 0; a < 8; a++) { // eight directions, as wide as the line
        const ox = Math.round(Math.cos(a * Math.PI / 4) * style.width * 1.01), oy = Math.round(Math.sin(a * Math.PI / 4) * style.width * 1.01);
        g.drawImage(shape, dx + ox, dy + oy);
      }
      g.restore();
      paint(g, id, dx + m, dy + m, iw, ih);
    },
  };
  // The icon alone.
  function paint(g, id, dx, dy, dw, dh) {
    const from = find(id);
    if (!from) throw new Error(`unknown icon "${id}"`);
    const smooth = g.imageSmoothingEnabled, n = from.native;
    if (!n) { g.drawImage(from.image, from.x, from.y, from.tile, from.tile, dx, dy, dw, dh); return; }
    // A pixel-art icon: draw just its pixels, without smoothing, so each icon pixel stays a hard block.
    const k = from.atlas ? Math.floor(from.tile / n) : 1, span = n * k, pad = (from.tile - span) >> 1;
    g.imageSmoothingEnabled = false;
    g.drawImage(from.image, from.x + pad, from.y + pad, span, span, dx, dy, dw, dh);
    g.imageSmoothingEnabled = smooth;
  }
}

// Repaint the grey metal of an icon (RGBA bytes, changed in place) in `colours`: hex colours, dark to light. A pixel is
// metal when it is not an outline (brightness 40 or more) and grey: its channels within 28 of each other, or (the
// painted icons shade their metal lavender) a greyish violet, hue 240-345 degrees at no more than 55% saturation. Its
// brightness picks the place along the colours, so the shading stays. Wood, leather, gems and outlines are kept.
export function recolour(data, colours) {
  const stops = colours.map(c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)));
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (!metallic(r, g, b)) continue;
    const light = 0.299 * r + 0.587 * g + 0.114 * b;
    if (light < 40) continue;
    const t = Math.min(1, (light - 40) / 215) * (stops.length - 1), j = Math.min(stops.length - 2, Math.floor(t)), f = t - j;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(stops[j][c] + (stops[j + 1][c] - stops[j][c]) * f);
  }
  return data;
}
function metallic(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), span = max - min;
  if (span <= 28) return true;
  if (span / max > 0.55) return false;
  const hue = (max === r ? ((g - b) / span + 6) % 6 : max === g ? (b - r) / span + 2 : (r - g) / span + 4) * 60;
  return hue >= 240 && hue <= 345;
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
