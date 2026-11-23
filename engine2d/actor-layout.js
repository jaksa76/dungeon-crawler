// Stable formations inside one grid cell. Multiple ranks use small depth
// offsets; members of a rank share the corridor width without fully overlapping.
export function arrangeActors(actors) {
  const ordered = [...actors].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (ordered.length < 2) return ordered.map(actor => ({ ...actor, offsetX: 0, offsetDepth: 0 }));
  const ranks = Math.ceil(ordered.length / 2), result = [];
  for (let row = 0; row < ranks; row++) {
    const members = ordered.slice(row * 2, row * 2 + 2);
    const total = members.reduce((sum, actor) => sum + actor.w, 0) + .05 * (members.length - 1);
    const scale = Math.min(1, .86 / total);
    let x = -total * scale / 2;
    for (const actor of members) {
      const w = actor.w * scale;
      result.push({ ...actor, w, h: actor.h * scale, offsetX: x + w / 2,
        offsetDepth: ((ranks - 1) / 2 - row) * .18 });
      x += w + .05 * scale;
    }
  }
  return result;
}
