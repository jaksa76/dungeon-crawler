// The world map, drawn in the 320x180 panel: the painted map with a marker for every place the hero knows. Tap one to travel.
//
//   createWorldMap({ kit, map, travel })   // { kind, title, draw() }
//
// `map`: { image (a URL), locations: [{ id, name, x, y, here }] } with x and y in percent of the picture; `travel(id)` returns a
// promise of whether the hero arrived. The picture is painted, so it is drawn smoothed (the one place that is).

import { THEME } from './canvas.js';
import { loadImage } from '../render/compositor.js';

export function createWorldMap({ kit, map, travel, closeMenu }) {
  let image = null, failed = false, travelling = false, error = false;
  loadImage(map.image).then(img => { image = img; failed = !img; });
  const AREA = { x: 5, y: 20, w: 310, h: 155 };
  return {
    kind: 'world-map', title: 'World map',
    draw() {
      const { g } = kit;
      kit.frame(AREA.x, AREA.y, AREA.w, AREA.h);
      if (failed) { kit.text('The map could not be loaded.', 12, 28, THEME.bad); return; }
      if (!image) { kit.text('Loading...', 12, 28, THEME.dim); return; }
      // The picture, as large as fits, centred.
      const scale = Math.min((AREA.w - 2) / image.width, (AREA.h - 2) / image.height), w = Math.round(image.width * scale), h = Math.round(image.height * scale);
      const x = AREA.x + Math.floor((AREA.w - w) / 2), y = AREA.y + Math.floor((AREA.h - h) / 2);
      g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(image, kit.ox + x, kit.oy + y, w, h); g.restore();
      for (const { id, name, x: px, y: py, here } of map.locations) {
        const mx = x + Math.round(w * px / 100), my = y + Math.round(h * py / 100), label = name, lw = kit.width(label);
        const left = Math.min(mx + 6, AREA.x + AREA.w - lw - 3), key = `map:${id}`;
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
