import { planLayout, FACE_DIRS } from './layout.js';

// Rule-based set dressing. Fills a location with the small things that make it
// feel lived in: flower boxes, ivy, door lanterns, hanging signs, clutter along
// wall bases and in corners, weeds and puddles.
//
// It is seeded, so the result is stable between runs; change `seed` to reroll,
// tune the probabilities, or keep tiles clear with `exclude: ['x,z', ...]`.
// Hand-placed entities are kept and the generator places around them.
//
// Returns a copy of the level with generated `entities`, `decals` and `floorDecals`
// appended (generated entities are unnamed, so they are scenery).

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Props, heights in metres.
const KIT = {
  barrel: { sprite: 'sprites/prop-barrel', height: 0.95 },
  crate: { sprite: 'sprites/prop-crate', height: 0.7 },
  sack: { sprite: 'sprites/prop-sack', height: 0.6 },
  bucket: { sprite: 'sprites/prop-bucket', height: 0.38 },
  pot: { sprite: 'sprites/prop-pot', height: 0.75 },
  firewood: { sprite: 'sprites/prop-firewood', height: 0.65 },
  hay: { sprite: 'sprites/prop-hay', height: 0.8 },
  planter: { sprite: 'sprites/prop-planter', height: 0.7 },
  weeds: { sprite: 'sprites/prop-weeds', height: 0.22, shadow: false },
};

// Groups placed against a wall: items laid out along it. `^` = stacked on the previous one.
const WALL_GROUPS = [
  ['barrel'], ['barrel', 'barrel'], ['crate', 'crate^'], ['crate', 'sack'], ['sack', 'sack'],
  ['firewood'], ['pot'], ['bucket', 'barrel'], ['planter'], ['hay'], ['barrel', 'crate', 'crate^'],
];
const CORNER_GROUPS = [
  ['barrel', 'barrel', 'crate'], ['crate', 'crate^', 'sack', 'barrel'], ['hay', 'sack'],
  ['firewood', 'bucket'], ['planter', 'pot'], ['barrel', 'crate', 'crate^', 'bucket'],
];

const DEFAULTS = {
  seed: 1,
  flowerBoxes: 0.35, // per upper-storey window
  ivy: 0.25,         // per street face
  doorLanterns: 0.8, // per door
  signs: 0.5,        // hanging sign per door
  wallClutter: 0.45, // per floor tile side against a wall
  cornerClutter: 0.85,
  weeds: 0.7,        // per floor tile side against a wall
  looseWeeds: 0.15,  // per open floor tile
  puddles: 0.3,      // per floor tile
  exclude: [],
};

export function dressLevel(level, tileTypes, assets) {
  if (!level.dressing) return level;
  const D = { ...DEFAULTS, ...level.dressing };
  const L = planLayout(level, tileTypes, assets);
  const r = rng(D.seed * 9973 + 17);
  const T = L.S.tile; // tiles -> metres
  const entities = [], decals = [], floorDecals = [];
  const exclude = new Set(D.exclude);
  const spec = (key) => assets[key]?.spec || {};

  // Footprints, to keep things from piling into each other.
  const taken = level.entities.map((e) => ({ x: e.x, z: e.z, r: e.block ? 0.45 : 0.18 }));
  const free = (x, z, rad) => taken.every((t) => Math.hypot(t.x - x, t.z - z) > t.r + rad);
  const take = (x, z, rad) => taken.push({ x, z, r: rad });

  const sides = Object.entries(FACE_DIRS);
  const floors = [];
  for (let z = 0; z < L.depth; z++) for (let x = 0; x < L.width; x++) {
    if (L.isFloor(x, z) && !exclude.has(`${x},${z}`)) floors.push([x, z]);
  }

  // ---------- wall dressing (on each street face of each building)
  for (const b of L.buildings.values()) {
    for (const [face, [dx, dz]] of sides) {
      if (L.visibleFrom(b.x, b.z, dx, dz) !== 0) continue;
      if (b.t.low) continue;
      const keys = L.faceKeys(b.x, b.z, dx, dz);
      const wall = { x: b.x, z: b.z, face };
      const door = !!spec(keys[0]).door;

      // Flower boxes under upper-storey windows.
      b.levels.forEach((lv, i) => {
        if (i === 0 || spec(keys[i]).flowerBox === false || r() >= D.flowerBoxes) return;
        const h = lv.y1 - lv.y0;
        decals.push({ sprite: 'sprites/decal-flowerbox', wall, y: (lv.y0 + h * 0.24) * T, height: 0.42, depth: 0.03 });
      });

      // Ivy climbing the ground storey at one edge.
      if (b.storeys && r() < D.ivy) {
        const g = b.levels[0].y1 * T;
        const h = g * (0.7 + r() * 0.25);
        decals.push({ sprite: 'sprites/decal-ivy', wall, u: (r() < 0.5 ? -1 : 1) * 0.4, y: h / 2, height: h, depth: 0.015 });
      }

      if (door) {
        const side = r() < 0.5 ? -1 : 1;
        if (r() < D.doorLanterns) {
          decals.push({ sprite: 'sprites/decal-lantern', wall, u: side * 0.33, y: 2.1, height: 0.55, depth: 0.02,
            light: { color: '#ffb84a', intensity: 1.3, flicker: 0.08, range: 3 } });
        }
        if (r() < D.signs) {
          decals.push({ sprite: 'sprites/decal-sign', wall, u: -side * 0.42, y: b.levels[0].y1 * T + 0.2, height: 0.9,
            blade: true, depth: 0 });
        }
      }
    }
  }

  // ---------- clutter at wall bases and in corners
  const wallAt = (x, z) => { const t = L.typeAt(x, z); return !t || (t.wall && !t.low); };
  const doorFace = (x, z, dx, dz) => {
    // The wall at (x+dx, z+dz) seen from the floor tile (x, z): is it a doorway/shopfront?
    const b = L.at(x + dx, z + dz);
    if (!b) return false;
    return !!spec(L.faceKeys(b.x, b.z, -dx, -dz)[0]).door;
  };

  function place(item, x, z, y = 0) {
    const k = KIT[item];
    const scale = 0.9 + r() * 0.2;
    entities.push({ sprite: k.sprite, x, z, height: k.height * scale, ...(y ? { y } : {}), ...(k.shadow === false ? { shadow: false } : {}) });
    return k.height * scale;
  }
  function placeGroup(group, x0, z0, ax, az, nx, nz, spacing) {
    // Items in a row along (ax, az), each nudged off the wall (nx, nz) a little.
    let lastTop = 0, lastPos = null, i = 0;
    for (const raw of group) {
      const stacked = raw.endsWith('^');
      const item = stacked ? raw.slice(0, -1) : raw;
      if (stacked && lastPos) {
        place(item, lastPos.x + (r() - 0.5) * 0.03, lastPos.z + 0.002, lastTop * 0.92);
        continue;
      }
      const off = (i - (group.filter((g) => !g.endsWith('^')).length - 1) / 2) * spacing;
      const jitter = r() * 0.08;
      const x = x0 + ax * off + nx * jitter, z = z0 + az * off + nz * jitter;
      if (!free(x, z, 0.12)) { lastPos = null; i++; continue; }
      take(x, z, 0.12);
      lastTop = place(item, x, z);
      lastPos = { x, z };
      i++;
    }
  }

  for (const [x, z] of floors) {
    const walls = sides.filter(([, [dx, dz]]) => wallAt(x + dx, z + dz));
    // Corners: two walls at right angles.
    let cornered = false;
    for (let i = 0; i < walls.length && !cornered; i++) for (let j = i + 1; j < walls.length; j++) {
      const [, a] = walls[i], [, b] = walls[j];
      if (a[0] * b[0] + a[1] * b[1] !== 0) continue;
      if (doorFace(x, z, ...a) && doorFace(x, z, ...b)) continue;
      if (r() >= D.cornerClutter) break;
      // Lay the group along whichever wall isn't a doorway, starting at the corner.
      const [along, other] = doorFace(x, z, ...a) ? [b, a] : [a, b];
      const group = CORNER_GROUPS[Math.floor(r() * CORNER_GROUPS.length)];
      const half = ((group.filter((g) => !g.endsWith('^')).length - 1) / 2) * 0.2;
      const cx = x + (a[0] + b[0]) * 0.34 - other[0] * half, cz = z + (a[1] + b[1]) * 0.34 - other[1] * half;
      placeGroup(group, cx, cz, -other[0], -other[1], -along[0], -along[1], 0.2);
      cornered = true;
      break;
    }
    for (const [, [dx, dz]] of walls) {
      const ax = dz, az = -dx; // along the wall
      if (!cornered && !doorFace(x, z, dx, dz) && r() < D.wallClutter) {
        const shift = (r() - 0.5) * 0.4;
        placeGroup(WALL_GROUPS[Math.floor(r() * WALL_GROUPS.length)],
          x + dx * 0.36 + ax * shift, z + dz * 0.36 + az * shift, ax, az, -dx, -dz, 0.24);
      }
      // Weeds where the wall meets the street.
      const n = r() < D.weeds ? 1 + Math.floor(r() * 3) : 0;
      for (let k = 0; k < n; k++) {
        const s = (r() - 0.5) * 0.9;
        const wx = x + dx * 0.47 + ax * s, wz = z + dz * 0.47 + az * s;
        if (free(wx, wz, 0.02)) place('weeds', wx, wz);
      }
    }
    if (walls.length === 0 && r() < D.looseWeeds) {
      const wx = x + (r() - 0.5) * 0.9, wz = z + (r() - 0.5) * 0.9;
      if (free(wx, wz, 0.05)) place('weeds', wx, wz);
    }
    if (r() < D.puddles) {
      floorDecals.push({ sprite: 'sprites/floor-puddle', x: x + (r() - 0.5) * 0.6, z: z + (r() - 0.5) * 0.6,
        width: 0.8 + r() * 1.4, rotation: r() * Math.PI });
    }
  }

  return {
    ...level,
    entities: [...level.entities, ...entities],
    decals: [...(level.decals || []), ...decals],
    floorDecals: [...(level.floorDecals || []), ...floorDecals],
  };
}
