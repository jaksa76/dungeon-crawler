// Rows beyond the painted art. Slot images are painted for rows up to ART_DEPTH (see tools/studio2d); a level may see
// further (`view: { maxDepth }`, a village street). The wall faces of the farther rows are made here, once, from the
// painted ones: the view is one-point perspective, so
//   - a wall's front face is the same picture at every depth, only smaller: the nearest painted front, scaled;
//   - a side face is the same wall seen more obliquely: each column of the far face is the column of a painted side face
//     at the same distance into its cell, stretched to that column's height (perspective-correct, like a raycaster).
// Props and creatures are billboards facing the viewer: the compositor draws the deepest painted image, scaled.

export const ART_DEPTH = 3; // the furthest row painted art exists for

// The screen extent of a face's card (unclipped): fronts span x across, sides span depth.
function frontCard(view, l, d) {
  const { V, f, near } = view, s = near(d);
  return { x0: V.W / 2 + f * (l - 0.5) / s, x1: V.W / 2 + f * (l + 0.5) / s, ...rows(view, s) };
}
function rows(view, s) {
  const { V, f } = view;
  return { top: V.H / 2 - f * (V.top - V.eye) / s, bottom: V.H / 2 + f * V.eye / s };
}

// A canvas for slot `slot`, clipped to its polygon, drawn by `paint(g)` in screen coordinates.
function slotCanvas(slot, paint) {
  const c = document.createElement('canvas'); c.width = Math.max(1, slot.w); c.height = Math.max(1, slot.h);
  const g = c.getContext('2d'); g.translate(-slot.x, -slot.y); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  paint(g);
  g.globalCompositeOperation = 'destination-in'; g.beginPath();
  slot.poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
  return c;
}

// Copy the part of screen rectangle `a` that the painted slot `src` holds (its image covers src.x, src.y, src.w, src.h)
// onto rectangle `b`, scaled. The painted near rows are cut off at the top of the screen, so a far face drawn from them
// loses the top of its card (chimney tops, a roof's ridge): what is missing stays transparent and the backdrop shows.
// (Fronts copy the whole painted slot the same way, so this is for the side faces' columns.)
function blit(g, img, src, a, b) {
  const kx = b.w / a.w, ky = b.h / a.h;
  const x0 = Math.max(a.x, src.x), y0 = Math.max(a.y, src.y), x1 = Math.min(a.x + a.w, src.x + src.w), y1 = Math.min(a.y + a.h, src.y + src.h);
  if (x1 <= x0 || y1 <= y0) return;
  g.drawImage(img, x0 - src.x, y0 - src.y, x1 - x0, y1 - y0, b.x + (x0 - a.x) * kx, b.y + (y0 - a.y) * ky, (x1 - x0) * kx, (y1 - y0) * ky);
}
const rect = card => ({ x: card.x0, y: card.top, w: card.x1 - card.x0, h: card.bottom - card.top });

// The front of wall slot (l, d) from the deepest painted front that is on screen across its whole width (the facade is
// the same on every face).
function farFront(view, slot, source) {
  const src = view.wallSlots.filter(s => s.kind === 'front' && s.d <= ART_DEPTH && source(s))
    .filter(s => { const c = frontCard(view, s.l, s.d); return c.x0 >= 0 && c.x1 <= view.V.W; })
    .sort((p, q) => q.d - p.d || p.l - q.l)[0];
  if (!src) return null;
  // The whole painted slot (its card and the margin painted round it, so neighbouring faces meet without a seam), placed
  // by the same scale and offset that take its card onto this one.
  const img = source(src), a = rect(frontCard(view, src.l, src.d)), b = rect(frontCard(view, slot.l, slot.d));
  const kx = b.w / a.w, ky = b.h / a.h;
  return slotCanvas(slot, g => g.drawImage(img, b.x + (src.x - a.x) * kx, b.y + (src.y - a.y) * ky, src.w * kx, src.h * ky));
}

// The side of wall slot (l, d), column by column, from the deepest painted side face that is wholly on screen,
// preferring the same lateral position (the nearest viewing angle).
function farSide(view, slot, source) {
  const { V, f, near } = view;
  const usable = s => s.kind === 'side' && s.d >= 1 && s.d <= ART_DEPTH && source(s) && V.W / 2 + f * (s.l - 0.5) / near(s.d) <= V.W;
  const candidates = view.wallSlots.filter(usable).sort((p, q) => Math.abs(p.l - slot.l) - Math.abs(q.l - slot.l) || q.d - p.d);
  const src = candidates[0];
  if (!src) return null;
  const img = source(src);
  return slotCanvas(slot, g => {
    for (let x = slot.x; x < slot.x + slot.w; x++) {
      const s = f * (slot.l - 0.5) / (x + 0.5 - V.W / 2), u = s - near(slot.d); // how far into the cell this column is
      if (!(u >= 0 && u <= 1)) continue;
      const ss = near(src.d) + u, sx = V.W / 2 + f * (src.l - 0.5) / ss;
      if (sx < src.x || sx >= src.x + src.w) continue;
      const a = rows(view, ss), b = rows(view, s);
      blit(g, img, src, { x: Math.floor(sx), y: a.top, w: 1, h: a.bottom - a.top }, { x, y: b.top, w: 1, h: b.bottom - b.top });
    }
  });
}

// Images for every wall slot of `view` beyond ART_DEPTH, from the painted ones: { [slot id]: canvas }.
// `source(slot)` is the painted image of a slot, or undefined.
export function farWallImages(view, source) {
  const out = {};
  for (const slot of view.wallSlots) {
    if (slot.d <= ART_DEPTH) continue;
    const img = slot.kind === 'front' ? farFront(view, slot, source) : farSide(view, slot, source);
    if (img) out[slot.id] = img;
  }
  return out;
}
