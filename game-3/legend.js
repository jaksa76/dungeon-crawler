// The colour legend of the proxy images: which flat colour stands for what, for this map, and how much of a given
// image each colour covers. Pure logic (works on RGBA pixel data), so it runs in the browser and in Node.
import { COLOURS } from '../tools/views/colours.mjs';

const SCENERY = {
  stairs: {
    hill: ['Wooded hill', 'a hill with dark pine trees'],
    castle: ['Castle', 'a dark castle with towers and a few glowing windows'],
    moon: ['Moon', 'the big full moon'],
  },
  river: {
    hill: ['Wooded cliff and hills', 'a wooded cliff and hills with dark pine trees'],
    shore: ['Houses across the river', 'half-timbered houses on the opposite shore, glowing windows'],
    'wall-M': ['Water mill', 'a timber water mill'],
    wheel: ['Water wheel', 'a big wooden water wheel turning in the river'],
    waterfall: ['Waterfalls', 'waterfalls tumbling down the cliff into the river, mist'],
  },
};
const first = (text) => (text ?? '').split(',')[0].replace(/^an? /, '').replace(/^./, (c) => c.toUpperCase());

// One entry per distinct colour: { key, rgb, label, text }. Colours shared by two things are merged into one entry.
export function legendEntries(map) {
  const out = [];
  const add = (key, label, text) => {
    const rgb = COLOURS[key];
    if (!rgb) return;
    const same = out.find((e) => e.rgb.join() === rgb.join());
    if (same) { if (!same.label.includes(label)) same.label += ` / ${label}`; return; }
    out.push({ key, rgb, label, text });
  };
  add('sky', 'Sky', 'night sky, purple clouds, stars');
  add('floor', 'Floor', 'wet cobblestones: the dark lines are tile edges, paint irregular stones, not a grid');
  const chars = new Set([...map.tiles.join('')].filter((c) => c !== '.'));
  for (const ch of chars) {
    const w = map.wallInfo?.[ch] ?? {};
    const text = map.wallTypes?.[ch];
    add(w.colour ?? (ch === '#' ? 'wall-stone' : `wall-${ch}`), first(text) || `Wall ${ch}`, text ?? `wall type ${ch}`);
    if (w.people) add('onlooker', 'Onlookers', 'a few townsfolk leaning on the terrace balustrade, looking down at the lane');
  }
  for (const kind of new Set([...chars].map((c) => map.wallInfo?.[c]?.scenery).filter(Boolean))) for (const [k, [label, text]] of Object.entries(SCENERY[kind] ?? {})) add(k, label, text);
  for (const name of new Set((map.entities ?? []).map((e) => e.prop))) add(name, name[0].toUpperCase() + name.slice(1), map.props[name].look);
  return out;
}

// Share of an image (RGBA data, width x height) covered by each legend entry: Map(key -> 0..1).
// A pixel counts for the nearest legend colour if it is close enough; edge lines and anti-aliasing are ignored.
export function coverage(data, width, height, entries, step = 1, tolerance = 30) {
  const counts = new Map(entries.map((e) => [e.key, 0]));
  let total = 0;
  for (let i = 0; i < width * height; i += step) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    total++;
    let best = null, bd = tolerance * tolerance;
    for (const e of entries) { const d = (e.rgb[0] - r) ** 2 + (e.rgb[1] - g) ** 2 + (e.rgb[2] - b) ** 2; if (d < bd) { bd = d; best = e; } }
    if (best) counts.set(best.key, counts.get(best.key) + 1);
  }
  for (const [k, n] of counts) counts.set(k, n / total);
  return counts;
}
