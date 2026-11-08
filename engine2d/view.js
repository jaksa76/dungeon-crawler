// View geometry for the 2D compositor.
//
// The player always stands in a cell looking straight down the grid (one-point
// perspective), so every wall face, prop and NPC can only ever appear in a fixed
// set of screen positions, called slots. Each slot gets its own painted image.
//
// View-relative cell coordinates: `d` = cells ahead (0 = the player's cell),
// `l` = cells to the right (negative = left). Images are only stored for l >= 0;
// the left side is drawn mirrored.
//
//   front(l, d): the face of wall cell (l, d) that looks at the player.
//                Visible when cell (l, d-1) is open. d >= 1.
//   side(l, d):  the face of wall cell (l, d) that looks towards the centre line.
//                Visible when cell (l-1, d) is open. l >= 1.
//   prop(anchor, l, d): a billboard standing in open cell (l, d), against one side
//                of the cell, `anchor`:
//                  far    the side away from the player (d >= 0)
//                  near   the side towards the player   (d >= 1)
//                  left / right  the side walls         (d >= 1)
//                Props never stand in the middle of a cell, so a cell with a prop
//                is still walkable. In the player's own cell (d = 0) only `far` is
//                drawn: the other sides are beside or behind the camera, so a prop
//                there shows only while the player faces its side.
//
// 3D convention used here: x = right, y = up, s = distance ahead of the camera
// (all in tiles). Each slot is a flat card standing where the face is, from the
// ground up to `top` (room for the roof and chimneys above the facade); its screen
// region is the projected card, clipped to the view. Cards of faces that are
// visible together never overlap unless one really hides the other, which is what
// lets painted scenes be cut back into slots (see tools/studio2d).

export const DEFAULT_VIEW = {
  W: 640, H: 360,     // view size in pixels
  fovY: 50,           // vertical field of view, degrees
  eye: 0.55,          // eye height, tiles
  back: 0.4,          // camera distance behind the cell centre, tiles
  wallH: 1.5,         // eave height
  ridgeH: 2.1,        // roof ridge height
  top: 2.4,           // top of a slot's card (room for roofs and chimneys)
  maxDepth: 3,        // furthest row of cells drawn; beyond it is the backdrop
  minArea: 30,        // slots smaller than this many pixels on screen are skipped
  edge: 0.12,         // gap between a prop and the cell side it stands against, tiles
  // Optional, off by default. `pixel: n` marks a low-resolution view (e.g. W: 160, H: 90) that is shown
  // n times larger without smoothing (see game-2/quarter-px.js): prop rectangles are then whole pixels
  // and slot masks grow by half a pixel, so every image lands on the pixel grid.
};

const NEAR = 0.05;

export const ANCHORS = ['far', 'near', 'left', 'right'];
export const swapAnchor = (a) => (a === 'left' ? 'right' : a === 'right' ? 'left' : a);

// Slot to use for a prop at lateral `l` with `anchor`. Slots are stored for l >= 0;
// the left side is drawn mirrored. At l = 0 a `left` prop is the mirror of a `right`
// one, so only `right` is stored.
export function canonicalProp(l, anchor) {
  let mirror = l < 0;
  if (mirror) anchor = swapAnchor(anchor);
  if (l === 0 && anchor === 'left') { anchor = 'right'; mirror = true; }
  return { anchor, l: Math.abs(l), mirror };
}

export const propSlotId = (anchor, d, l) => `prop-${anchor}-d${d}-l${l}`;

function clipNearBox(box) {
  const s0 = Math.max(box.s0, NEAR);
  return s0 > box.s1 ? null : { ...box, s0 };
}

function hull(points) { // Andrew's monotone chain; points are [x, y]
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Sutherland–Hodgman: clip polygon by the half-plane where inside(p) holds.
function clipEdge(poly, inside, cut) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) out.push(cut(a, b));
  }
  return out;
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export function clipRect(poly, x0, y0, x1, y1) {
  let p = poly;
  p = clipEdge(p, (q) => q[0] >= x0, (a, b) => lerp(a, b, (x0 - a[0]) / (b[0] - a[0])));
  p = clipEdge(p, (q) => q[0] <= x1, (a, b) => lerp(a, b, (x1 - a[0]) / (b[0] - a[0])));
  p = clipEdge(p, (q) => q[1] >= y0, (a, b) => lerp(a, b, (y0 - a[1]) / (b[1] - a[1])));
  p = clipEdge(p, (q) => q[1] <= y1, (a, b) => lerp(a, b, (y1 - a[1]) / (b[1] - a[1])));
  return p;
}
// Intersection of two convex polygons (clip a by each edge of b).
export function intersectConvex(a, b) {
  let p = a;
  const o = area(b) > 0 ? 1 : -1;
  for (let i = 0; i < b.length && p.length; i++) {
    const e0 = b[i], e1 = b[(i + 1) % b.length];
    const side = (q) => o * ((e1[0] - e0[0]) * (q[1] - e0[1]) - (e1[1] - e0[1]) * (q[0] - e0[0])) >= 0;
    p = clipEdge(p, side, (s, t) => {
      const dx = t[0] - s[0], dy = t[1] - s[1];
      const ex = e1[0] - e0[0], ey = e1[1] - e0[1];
      const k = (ex * (s[1] - e0[1]) - ey * (s[0] - e0[0])) / (ey * dx - ex * dy);
      return [s[0] + dx * k, s[1] + dy * k];
    });
  }
  return p;
}
export function area(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
export const mirrorPoly = (poly, W) => poly.map(([x, y]) => [W - x, y]).reverse();

// Push every edge of a convex polygon outwards by `px`, so neighbouring slot
// images overlap a little instead of leaving antialiased seams.
export function grow(poly, px) {
  const o = area(poly) > 0 ? 1 : -1, n = poly.length;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (o * (b[1] - a[1])) / len, ny = (-o * (b[0] - a[0])) / len; // outward normal
    return { a: [a[0] + nx * px, a[1] + ny * px], d: [b[0] - a[0], b[1] - a[1]] };
  });
  return lines.map((L1, i) => {
    const L0 = lines[(i - 1 + n) % n];
    const den = L0.d[0] * L1.d[1] - L0.d[1] * L1.d[0];
    if (Math.abs(den) < 1e-9) return L1.a;
    const t = ((L1.a[0] - L0.a[0]) * L1.d[1] - (L1.a[1] - L0.a[1]) * L1.d[0]) / den;
    return [L0.a[0] + L0.d[0] * t, L0.a[1] + L0.d[1] * t];
  });
}

export function createView(options = {}) {
  const V = { ...DEFAULT_VIEW, ...options };
  const f = V.H / 2 / Math.tan((V.fovY * Math.PI) / 360); // focal length, px
  const near = (d) => d - 0.5 + V.back;                     // distance to the near edge of row d
  const project = (x, y, s) => [V.W / 2 + (f * x) / s, V.H / 2 - (f * (y - V.eye)) / s];

  function boxRegion(box) {
    const b = clipNearBox(box);
    if (!b) return null;
    const pts = [];
    for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const s of [b.s0, b.s1]) pts.push(project(x, y, s));
    const h = hull(pts);
    const card = clipRect(h, 0, 0, V.W, V.H);
    if (card.length < 3 || Math.abs(area(card)) < V.minArea) return null;
    // `card`: exact screen region (for overlap tests); `poly`: grown a little (for masks).
    const poly = clipRect(grow(h, V.pixel ? 0.5 : 0.75), 0, 0, V.W, V.H);
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const x = Math.floor(Math.min(...xs)), y = Math.floor(Math.min(...ys));
    return { card, poly, x, y, w: Math.ceil(Math.max(...xs)) - x, h: Math.ceil(Math.max(...ys)) - y };
  }

  // 3D boxes of each slot kind (right-hand side; l >= 0).
  const boxes = {
    front: (l, d) => ({ x0: l - 0.5, x1: l + 0.5, y0: 0, y1: V.top, s0: near(d), s1: near(d) }),
    side: (l, d) => ({ x0: l - 0.5, x1: l - 0.5, y0: 0, y1: V.top, s0: near(d), s1: near(d) + 1 }),
    // A prop's card is a flat rectangle facing the camera, centred on `spot`.
    prop: (spot, w, h) => ({ x0: spot.x - w / 2, x1: spot.x + w / 2, y0: 0, y1: h, s0: spot.s, s1: spot.s }),
  };

  // Where a prop of width `w` stands: x = lateral position of its centre, s = distance
  // ahead of the camera. It stays `edge` inside the cell side it is placed against.
  function propSpot(anchor, l, d, w) {
    let x = l, s = d + V.back;
    if (anchor === 'far') s += 0.5 - V.edge;
    else if (anchor === 'near') s -= 0.5 - V.edge;
    else x += (anchor === 'right' ? 1 : -1) * Math.max(0, 0.5 - V.edge - w / 2);
    return { x, s };
  }

  // Slot ids to try for a prop slot, best first: its own image, then (for slots that
  // are partly off screen) the same row's slots nearer the centre line. Props at the
  // same depth have the same size, only the viewing angle differs slightly.
  function propChain(slot) {
    const chain = [];
    for (let l = slot.l; l >= (slot.anchor === 'left' ? 1 : 0); l--) chain.push({ id: propSlotId(slot.anchor, slot.d, l), flip: false });
    if (slot.anchor === 'left') chain.push({ id: propSlotId('right', slot.d, 0), flip: true });
    return chain;
  }

  // Every wall slot that can appear on screen.
  const wallSlots = [];
  const maxL = Math.ceil(((V.W / 2) * (V.maxDepth + 1)) / f) + 1;
  for (let d = 1; d <= V.maxDepth; d++) for (let l = 0; l <= maxL; l++) {
    const r = boxRegion(boxes.front(l, d));
    if (r) wallSlots.push({ kind: 'front', l, d, id: `front-d${d}-l${l}`, ...r });
  }
  for (let d = 0; d <= V.maxDepth; d++) for (let l = 1; l <= maxL; l++) {
    const r = boxRegion(boxes.side(l, d));
    if (r) wallSlots.push({ kind: 'side', l, d, id: `side-d${d}-l${l}`, ...r });
  }
  const wallSlot = new Map(wallSlots.map((s) => [`${s.kind}:${s.l}:${s.d}`, s]));

  // Prop slots depend on the prop's size (tiles): `w` x `h` seen from the front or back,
  // `sideW` (default `w`) wide seen from the side. A prop whose `sideW` is wider than the
  // gap between the side walls of a cell can only stand against its far or near side.
  // `partial`: the prop is not entirely on screen. `borrows`: it is partial and a
  // whole slot in the same row can stand in for it, so it needs no image of its own.
  // A partial slot with nothing to borrow (the prop in the player's own cell, whose
  // feet are below the screen) is painted as the visible part only.
  const propCache = new Map();
  function propSlots(w, h, sideW = w) {
    const key = `${w}x${h}x${sideW}`;
    if (propCache.has(key)) return propCache.get(key);
    const list = [];
    const anchors = sideW <= 1 - 2 * V.edge ? ANCHORS : ['far', 'near'];
    for (const anchor of anchors) {
      for (let d = anchor === 'far' ? 0 : 1; d <= V.maxDepth; d++) for (let l = anchor === 'left' ? 1 : 0; l <= maxL; l++) {
        const aw = anchor === 'left' || anchor === 'right' ? sideW : w; // seen from the side, a prop is as wide as it is deep
        const spot = propSpot(anchor, l, d, aw);
        const r = boxRegion(boxes.prop(spot, aw, h));
        if (!r) continue;
        // Props keep their full, unclipped rectangle so the image keeps its proportions.
        const [cx, by] = project(spot.x, 0, spot.s);
        const pw = (f * aw) / spot.s, ph = (f * h) / spot.s;
        const full = V.pixel
          ? { x: Math.round(cx - pw / 2), y: Math.round(by - ph), w: Math.max(1, Math.round(pw)), h: Math.max(1, Math.round(ph)) }
          : { x: cx - pw / 2, y: by - ph, w: pw, h: ph };
        const partial = full.x < 0 || full.y < 0 || full.x + full.w > V.W || full.y + full.h > V.H;
        list.push({ kind: 'prop', anchor, l, d, id: propSlotId(anchor, d, l), s: spot.s, ...r, full, partial });
      }
    }
    const map = new Map(list.map((s) => [s.id, s]));
    for (const s of list) {
      s.borrows = s.partial && propChain(s).slice(1).some((c) => map.has(c.id) && !map.get(c.id).partial);
    }
    const res = { list, get: (anchor, l, d) => map.get(propSlotId(anchor, d, l)) };
    propCache.set(key, res);
    return res;
  }

  // Ordered list of what to draw, far to near. `cellAt(l, d)` returns
  //   { wall: typeKey }                                    a wall,
  //   { props: [{ type, w, h, anchor }, ...] } or {}       an open cell and what stands
  //                                                        against its sides (anchor as above),
  //   null                                                 outside the map.
  function compose(cellAt) {
    const list = [];
    const isWall = (l, d) => { const c = cellAt(l, d); return !c || !!c.wall; };
    const wallAt = (l, d) => cellAt(l, d)?.wall;
    // Props of one row, far to near. The painted slots of one row never overlap in
    // depth with another row's (see `edge`), so rows can be drawn one after another.
    const propsOfRow = (d) => {
      const row = [];
      for (let a = maxL; a >= 0; a--) for (const sgn of a ? [-1, 1] : [1]) {
        const l = a * sgn;
        for (const prop of cellAt(l, d)?.props ?? []) {
          const k = canonicalProp(l, prop.anchor);
          const slot = propSlots(prop.w, prop.h, prop.sideW).get(k.anchor, k.l, d);
          if (slot) row.push({ slot, type: prop.type, prop, l, d, mirror: k.mirror });
        }
      }
      return row.sort((p, q) => q.slot.s - p.slot.s); // stable: ties stay outermost first
    };
    for (let d = V.maxDepth; d >= 0; d--) {
      for (let a = maxL; a >= 1; a--) for (const sgn of [-1, 1]) {
        const l = a * sgn, t = wallAt(l, d);
        if (t && !isWall(l - sgn, d)) {
          const slot = wallSlot.get(`side:${a}:${d}`);
          if (slot) list.push({ slot, type: t, l, d, mirror: sgn < 0 });
        }
      }
      list.push(...propsOfRow(d));
      if (d >= 1) {
        for (let a = maxL; a >= 0; a--) for (const sgn of a ? [-1, 1] : [1]) {
          const l = a * sgn, t = wallAt(l, d);
          if (t && !isWall(l, d - 1)) {
            const slot = wallSlot.get(`front:${a}:${d}`);
            if (slot) list.push({ slot, type: t, l, d, mirror: sgn < 0 });
          }
        }
      }
    }
    return list;
  }

  // Screen polygon / rectangle of a draw item (mirrored for the left side).
  function placed(item) {
    const s = item.slot;
    if (!item.mirror) return { card: s.card, poly: s.poly, x: s.x, y: s.y, w: s.w, h: s.h, full: s.full };
    const full = s.full && { ...s.full, x: V.W - s.full.x - s.full.w };
    return { card: mirrorPoly(s.card, V.W), poly: mirrorPoly(s.poly, V.W), x: V.W - s.x - s.w, y: s.y, w: s.w, h: s.h, full };
  }

  return { V, f, near, project, boxes, wallSlots, propSlots, propChain, compose, placed, horizon: V.H / 2 };
}
