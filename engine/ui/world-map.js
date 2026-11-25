// The world map: the campaign's picture across the whole 320x180 panel, under the title bar, with a marker for every place
// the hero knows. Tap one to travel.
//
//   createWorldMap({ kit, map, travel })   // { kind, title, backdrop(), draw() }
//
// `map`: { image (a URL), locations: [{ id, name, x, y, here }] } with x and y in percent of the picture; `travel(id)` returns a
// promise of whether the hero arrived. A 320x180 picture is pixel art and is drawn crisp, pixel for pixel; a picture of
// any other size is fitted inside the panel and drawn smoothed.

import { THEME } from './canvas.js';
import { loadImage } from '../render/compositor.js';

export function createWorldMap({ kit, map, travel, closeMenu }) {
  let image = null, failed = false, travelling = false, error = false;
  loadImage(map.image).then(img => { image = img; failed = !img; });
  const AREA = { x: 5, y: 20, w: 310, h: 155 }; // where the loading and error text go
  const PANEL = { w: 320, h: 180 }, SAFE_TOP = 27; // the title bar ends at 18; a marker's tap box reaches 7 above it
  // Where the picture goes: the whole panel at 320x180, else as large as fits, centred.
  const place = () => {
    if (image.width === PANEL.w && image.height === PANEL.h) return { x: 0, y: 0, w: PANEL.w, h: PANEL.h, crisp: true };
    const scale = Math.min(PANEL.w / image.width, PANEL.h / image.height), w = Math.round(image.width * scale), h = Math.round(image.height * scale);
    return { x: Math.floor((PANEL.w - w) / 2), y: Math.floor((PANEL.h - h) / 2), w, h, crisp: false };
  };
  return {
    kind: 'world-map', title: 'World map',
    // Drawn before the title bar and the Close button, so they sit on the map.
    backdrop() {
      if (!image) return;
      const { g } = kit, { x, y, w, h, crisp } = place();
      g.save(); g.imageSmoothingEnabled = !crisp; g.imageSmoothingQuality = 'high';
      g.drawImage(image, kit.ox + x, kit.oy + y, w, h); g.restore();
      kit.outline(0, 0, PANEL.w, PANEL.h, THEME.frameHi);
    },
    draw() {
      if (failed) { kit.frame(AREA.x, AREA.y, AREA.w, AREA.h); kit.text('The map could not be loaded.', 12, 28, THEME.bad); return; }
      if (!image) { kit.frame(AREA.x, AREA.y, AREA.w, AREA.h); kit.text('Loading...', 12, 28, THEME.dim); return; }
      const { x, y, w, h } = place();
      for (const { id, name, x: px, y: py, here } of map.locations) {
        // Kept clear of the title bar (and its Close button) and inside the panel's frame, wherever the campaign put it.
        const mx = Math.min(PANEL.w - 8, Math.max(8, x + Math.round(w * px / 100)));
        const my = Math.min(PANEL.h - 9, Math.max(SAFE_TOP, y + Math.round(h * py / 100))), label = name, lw = kit.width(label);
        const left = Math.max(3, Math.min(mx + 6, PANEL.w - lw - 4)), key = `map:${id}`;
        kit.disc(mx, my, 4, THEME.outline); kit.disc(mx, my, 3, here ? THEME.good : kit.state.pressed === key ? '#ffffff' : THEME.select);
        kit.text(label, left, my - 4, here ? THEME.good : THEME.white, { shadow: true });
        const box = { x: Math.min(mx - 5, left) - 1, y: my - 7, w: Math.max(mx + 5, left + lw) - Math.min(mx - 5, left) + 2, h: 14 };
        kit.hit(box.x, box.y, box.w, box.h, { key, title: here ? `${name} (you are here)` : name, disabled: here || travelling,
          tap: here || travelling ? undefined : async () => {
            travelling = true; error = false;
            try { const arrived = await travel(id); error = !arrived; if (arrived) closeMenu(); } finally { travelling = false; }
          } });
      }
      if (error) kit.text('The route could not be opened. Try again.', AREA.x + 6, AREA.y + AREA.h - 11, THEME.bad, { shadow: true });
    },
  };
}
