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

import { intersectConvex, area } from '../../engine2d/view.js';

export const SHEET = { w: 1536, h: 1024, cols: 2, rows: 2 };

const OVERLAP_PX = 1; // cards may touch, not overlap

export function sceneCellAt(scene) {
  const m = new Map(scene.cells.map((c) => [`${c.l},${c.d}`, c]));
  return (l, d) => {
    const c = m.get(`${l},${d}`);
    if (!c) return {};
    return c.wall ? { wall: c.wall } : { prop: c.prop };
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
    if (it.slot.kind === 'prop') { // props must be entirely on screen to be cut out whole
      const f = view.placed(it).full;
      if (f.x < 0 || f.y < 0 || f.x + f.w > view.V.W || f.y + f.h > view.V.H) return;
    }
    const hit = polys.some((q, j) => j !== i && Math.abs(area(intersectConvex(polys[i], q))) > OVERLAP_PX);
    if (!hit) clean.push(it);
  });
  return { items, clean };
}

export function pack(view, slots, cellFor) {
  // Nearest (largest) slots first: they are the hardest to fit.
  const remaining = new Map(slots.map((s) => [s.id, s]));
  const scenes = [];
  while (remaining.size) {
    const scene = { cells: [], harvest: [] };
    for (const s of [...remaining.values()]) {
      if (!remaining.has(s.id)) continue;
      for (const sgn of s.l ? [1, -1] : [1]) {
        const cell = cellFor(s.l * sgn, s.d);
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
export function makePlan(view, { wallArts, propArts }) {
  const per = SHEET.cols * SHEET.rows;
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
    const prop = { art: p.art, type: p.art, w: p.w, h: p.h };
    // Slots that are partly off screen can't be painted whole; the compositor
    // reuses the nearest slot of the same row for them (same size, similar angle).
    const slots = view.propSlots(p.w, p.h).list.filter((s) => !s.partial).sort(biggestFirst);
    propScenes.push(...pack(view, slots, (l, d) => ({ l, d, prop })).map((sc) => ({ ...sc, kind: 'props', art: p.art })));
  }
  chunk(propScenes, 'props');
  return { sheet: SHEET, sheets };
}

// Where scene i sits on a sheet: a cell of the grid, letterboxed to the view's aspect.
export function sceneRect(i, view) {
  const cw = SHEET.w / SHEET.cols, ch = SHEET.h / SHEET.rows;
  const col = i % SHEET.cols, row = Math.floor(i / SHEET.cols);
  const k = Math.min(cw / view.V.W, ch / view.V.H);
  const w = view.V.W * k, h = view.V.H * k;
  return { x: col * cw + (cw - w) / 2, y: row * ch + (ch - h) / 2, w, h, scale: k };
}
