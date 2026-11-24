// Ravensmoor's Old Quarter drawn at a low internal resolution and shown larger: the pixel slice
// (docs/experiments/pixel-slice.md). Its art lives in experiments/pixel-slice/assets/, laid out like the engine's, and
// replaces the engine's art for everything the courtyard shows (pixelContent below).
import { defineContent } from '../../engine/index.js';
import { village } from '../../games/ravensmoor/levels/village.js';

// THE configuration of the slice. To rebuild it at 320x180 painted on a 4x canvas (1280x720), change these
// two values, then `bake --px`, `guides --px` and paint again (docs/experiments/pixel-slice.md).
//   width, height  internal resolution: the size of the view canvas and of every slot image
//   factor         generation canvas = internal resolution x factor; each art pixel is one factor x factor
//                  cell of the painting (8 for the pixel-art-xl LoRA, which draws one art pixel per latent cell)
export const PX = { width: 160, height: 90, factor: 8 };

// Everything else follows: shown at 640 px wide (pixel = 640 / width), and minArea (30 px² at 640x360) scales
// with the number of pixels.
export const PX_VIEW = {
  W: PX.width, H: PX.height, pixel: Math.max(1, Math.round(640 / PX.width)),
  minArea: Math.max(1, Math.round(30 * (PX.width / 640) ** 2)),
};

export const quarterPx = { ...village, name: `${village.name} (${PX.width}x${PX.height})`, exits: [], view: { ...village.view, ...PX_VIEW } };

// The slice's own art: the same ids as the engine's, each naming its `art` so that it comes from this folder.
const own = ids => Object.fromEntries(ids.map(id => [id, { art: id }]));
export const pixelContent = defineContent(new URL('./assets/', import.meta.url), {
  buildings: own([...new Set(Object.values(village.legend))].filter(id => id !== 'floor')),
  props: own([...new Set(village.entities.filter(e => e.prop).map(e => e.prop))]),
  npcs: own([...new Set(village.entities.filter(e => e.npc).map(e => e.npc))]),
  environments: { town: { art: 'town' } },
});
