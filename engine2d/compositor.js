// Draws a view from slot images: backdrop, floor, then wall faces and props far
// to near. Missing images are drawn as flat polygons so gaps in the art are obvious.

export function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Image paths, relative to the asset folder:
//   backdrop-<N|E|S|W>.png, floor.png
//   walls/<art>/<slot id>.png, props/<art>/<slot id>.png
export async function loadSlotImages(view, { assetPath, wallArts, propArts }) {
  const images = new Map();
  const jobs = [];
  const want = (key, path) => jobs.push(loadImage(`${assetPath}/${path}`).then((img) => img && images.set(key, img)));
  for (const dir of 'NESW') want(`backdrop:${dir}`, `backdrop-${dir}.png`);
  want('floor', 'floor.png');
  for (const art of wallArts) for (const s of view.wallSlots) want(`walls:${art}:${s.id}`, `walls/${art}/${s.id}.png`);
  for (const p of propArts) for (const s of view.propSlots(p.w, p.h, p.sideW).list) {
    if (!s.borrows) want(`props:${p.art}:${s.id}`, `props/${p.art}/${s.id}.png`);
  }
  await Promise.all(jobs);
  return images;
}

const FALLBACK = { front: '#5a4a5e', side: '#463a4c', prop: '#a07a4a' };

export function createCompositor(view, images) {
  const { W, H } = view.V;

  function drawFlipped(g, img, x, y, w, h, flip) {
    if (!flip) { g.drawImage(img, x, y, w, h); return; }
    g.save(); g.translate(x + w, y); g.scale(-1, 1); g.drawImage(img, 0, 0, w, h); g.restore();
  }

  function shadow(g, r) {
    const cx = r.x + r.w / 2, cy = r.y + r.h;
    const rx = r.w * 0.42, ry = Math.max(2, r.w * 0.09);
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx); g.translate(-cx, -cy);
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, rx, 0, Math.PI * 2); g.fill(); g.restore();
  }

  // The image for a draw item, and whether it is drawn flipped. A prop slot without
  // its own image borrows the nearest one in the same row (see view.propChain).
  function lookup(it) {
    if (it.slot.kind !== 'prop') {
      const img = images.get(`walls:${it.type}:${it.slot.id}`);
      return img ? { img, flip: it.mirror } : null;
    }
    for (const c of view.propChain(it.slot)) {
      const img = images.get(`props:${it.prop.art}:${c.id}`);
      if (img) return { img, flip: it.mirror !== c.flip };
    }
    return null;
  }
  const imageFor = (it) => lookup(it)?.img ?? null;

  // items: from view.compose(). facing: 'N'|'E'|'S'|'W'. flipFloor: alternate per step.
  // bare: only walls and props on a transparent canvas (for art guides).
  // A pixel view (view.V.pixel) is drawn without smoothing and without the soft shadow.
  function draw(g, items, { facing = 'N', flipFloor = false, outlines = false, bare = false, shadows = !view.V.pixel } = {}) {
    if (view.V.pixel) g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);
    if (!bare) {
      const bd = images.get(`backdrop:${facing}`);
      if (bd) g.drawImage(bd, 0, 0, W, H); else { g.fillStyle = '#1a1430'; g.fillRect(0, 0, W, H); }
      const floor = images.get('floor');
      if (floor) drawFlipped(g, floor, 0, 0, W, H, flipFloor);
      else { g.fillStyle = '#3a3040'; g.fillRect(0, view.horizon, W, H - view.horizon); }
    }

    for (const it of items) {
      const kind = it.slot.kind;
      const r = view.placed(it);
      const found = lookup(it);
      if (kind === 'prop') {
        if (shadows && !bare) shadow(g, r.full);
        if (found) drawFlipped(g, found.img, r.full.x, r.full.y, r.full.w, r.full.h, found.flip);
        else polygon(g, r.poly, FALLBACK.prop);
      } else if (found) {
        drawFlipped(g, found.img, r.x, r.y, r.w, r.h, found.flip);
      } else {
        polygon(g, r.poly, FALLBACK[kind]);
      }
      if (outlines) polygon(g, r.poly, null, '#ff3af0');
    }
  }

  function polygon(g, poly, fill, stroke) {
    g.beginPath();
    poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  }

  return { draw, imageFor };
}
