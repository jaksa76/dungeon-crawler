// The same courtyard as quarter.js, drawn at a low internal resolution and shown larger: the pixel slice
// (docs/pixel-slice.md). Its art lives in game-2/px/ and the page is px.html. Deleting this file, px.html
// and game-2/px/ removes the slice.
import { quarter, tileTypes, props } from './quarter.js';

export { tileTypes, props };

// THE configuration of the slice. To rebuild it at 320x180 painted on a 4x canvas (1280x720), change these
// two values, then `bake --px`, `guides --px` and paint again (docs/pixel-slice.md).
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

export const quarterPx = { ...quarter, name: `${quarter.name} (${PX.width}x${PX.height})`, view: { ...quarter.view, ...PX_VIEW } };
