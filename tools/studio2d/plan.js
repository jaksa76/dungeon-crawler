// Art plan for the 2D compositor: which scenes to paint so that every slot
// image of every wall type and prop can be cut out of a painting.
//
// A scene is a handful of cells around the viewer (everything else open) drawn
// with the real view geometry. A slot can be harvested from a scene when its card
// overlaps no other card in that scene, so the painter's version of it is
// complete and uncontaminated. Scenes are packed greedily, one art per scene, and
// scenes are grouped into sheets (one image generation each).
//
// Pure data: runs in the browser (studio) and in node (reports).

import { intersectConvex, area, swapAnchor } from '../../engine2d/view.js';

export const SHEET = { w: 1536, h: 1024, cols: 2, rows: 2 };
// The pixel slice (docs/pixel-slice.md) paints one low-resolution panel per generation, on a canvas `factor`
// times as large (8 for the pixel-art LoRA, which draws one art pixel per 8 px latent cell).
export const sheetForPixelView = (width, height, factor) => ({ w: width * factor, h: height * factor, cols: 1, rows: 1 });

const OVERLAP_PX = 1; // cards may touch, not overlap

// A scene cell is { l, d, wall } or { l, d, props: [{ ..., anchor }] }.
export function sceneCellAt(scene) {
  const m = new Map(scene.cells.map((c) => [`${c.l},${c.d}`, c]));
  return (l, d) => {
    const c = m.get(`${l},${d}`);
    if (!c) return {};
    return c.wall ? { wall: c.wall } : { props: c.props };
  };
}

// Items of a scene whose cards overlap nothing else.
export function cleanItems(view, scene) {
  const items = view.compose(sceneCellAt(scene));
  const polys = items.map((it) => {
    const r = view.placed(it);
    if (it.slot.kind !== 'prop') return r.card;
    const f = r.full;
    return [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.h], [f.x, f.y + f.h]];
  });
  const clean = [];
  items.forEach((it, i) => {
    // Slots that borrow another's image are never cut out. (A partly off-screen prop
    // with nothing to borrow is cut out as far as it shows.)
    if (it.slot.kind === 'prop' && it.slot.borrows) return;
    const hit = polys.some((q, j) => j !== i && Math.abs(area(intersectConvex(polys[i], q))) > OVERLAP_PX);
    if (!hit) clean.push(it);
  });
  return { items, clean };
}

// cellFor(l, d, anchor) builds the scene cell that shows slot `s` at lateral l; on the
// left side a prop's anchor is mirrored (the slot is the mirror image of the right).
export function pack(view, slots, cellFor) {
  // Nearest (largest) slots first: they are the hardest to fit.
  const remaining = new Map(slots.map((s) => [s.id, s]));
  const scenes = [];
  while (remaining.size) {
    const scene = { cells: [], harvest: [] };
    for (const s of [...remaining.values()]) {
      if (!remaining.has(s.id)) continue;
      for (const sgn of s.l ? [1, -1] : [1]) {
        const cell = cellFor(s.l * sgn, s.d, sgn > 0 ? s.anchor : swapAnchor(s.anchor));
        if (scene.cells.some((c) => c.l === cell.l && c.d === cell.d)) continue;
        const trial = { cells: [...scene.cells, cell] };
        const { clean } = cleanItems(view, trial);
        const ids = new Set(clean.map((it) => `${it.slot.id}:${it.l}`));
        if (!ids.has(`${s.id}:${s.l * sgn}`)) continue;
        if (!scene.harvest.every((h) => ids.has(`${h.id}:${h.l}`))) continue;
        scene.cells = trial.cells;
        for (const it of clean) {
          if (!remaining.has(it.slot.id) || scene.harvest.some((h) => h.id === it.slot.id)) continue;
          scene.harvest.push({ id: it.slot.id, kind: it.slot.kind, l: it.l, d: it.d, mirror: it.mirror });
          remaining.delete(it.slot.id);
        }
        break;
      }
    }
    if (!scene.harvest.length) throw new Error(`cannot place slots: ${[...remaining.keys()].join(', ')}`);
    scenes.push(scene);
  }
  return scenes;
}

// wallArts: ['house-a', ...]; propArts: [{ art, w, h }, ...]
// Walls get one sheet per art (all of a house's slots painted together); prop
// scenes are packed one art per scene and then fill sheets in order.
export function makePlan(view, { wallArts, propArts, sheet = SHEET }) {
  const per = sheet.cols * sheet.rows;
  const sheets = [];
  const size = (s) => (s.full ? s.full.w * s.full.h : Math.abs(area(s.card)));
  const biggestFirst = (a, b) => size(b) - size(a); // packs tightest
  const chunk = (scenes, name) => {
    for (let i = 0; i < scenes.length; i += per) {
      const n = Math.floor(i / per) + 1, total = Math.ceil(scenes.length / per);
      sheets.push({ name: total > 1 ? `${name}-${n}` : name, scenes: scenes.slice(i, i + per) });
    }
  };
  for (const art of wallArts) {
    const scenes = pack(view, [...view.wallSlots].sort(biggestFirst), (l, d) => ({ l, d, wall: art }));
    chunk(scenes.map((sc) => ({ ...sc, kind: 'walls', art })), `walls-${art}`);
  }
  const propScenes = [];
  for (const p of propArts) {
    const prop = { art: p.art, type: p.art, w: p.w, h: p.h, sideW: p.sideW };
    // Slots that are partly off screen and have a whole slot in the same row to
    // borrow from are not painted (same size, similar angle).
    const slots = view.propSlots(p.w, p.h, p.sideW).list.filter((s) => !s.borrows).sort(biggestFirst);
    propScenes.push(...pack(view, slots, (l, d, anchor) => ({ l, d, props: [{ ...prop, anchor }] })).map((sc) => ({ ...sc, kind: 'props', art: p.art })));
  }
  chunk(propScenes, 'props');
  return { sheet, sheets };
}

// Where scene i sits on a sheet: a cell of the grid, letterboxed to the view's aspect.
export function sceneRect(i, view, sheet = SHEET) {
  const cw = sheet.w / sheet.cols, ch = sheet.h / sheet.rows;
  const col = i % sheet.cols, row = Math.floor(i / sheet.cols);
  const k = Math.min(cw / view.V.W, ch / view.V.H);
  const w = view.V.W * k, h = view.V.H * k;
  return { x: col * cw + (cw - w) / 2, y: row * ch + (ch - h) / 2, w, h, scale: k };
}
