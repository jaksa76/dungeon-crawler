// Building layout shared by the world builder and the dressing generator.
//
// Units: x/z positions are in tiles; heights given by level data are in metres
// and converted here using `level.scale.tile` (metres per tile). Everything this
// module returns is in tiles.
//
// Buildings are stacked from storeys. A facade texture is split vertically into
// a ground storey (v 0..split[0]), an upper storey (split[0]..split[1]) and an
// eave strip (split[1]..1) that only the top storey shows. Upper storeys can be
// jettied: each one overhangs the street by `scale.jetty` more than the one below.

export const FACE_DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export const sideOf = (dx, dz) => (dx ? (dx > 0 ? 'E' : 'W') : (dz > 0 ? 'S' : 'N'));

export function hash3(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
const rand3 = (a, b, c) => hash3(a, b, c) / 4294967296;

export const DEFAULT_SCALE = {
  tile: 3,       // metres per tile
  eye: 1.6,      // camera height
  ground: 2.5,   // ground storey height
  storey: 2.3,   // upper storey height
  jetty: 0.25,   // overhang added per jettied storey
};

export function planLayout(level, tileTypes, assets) {
  const S = { ...DEFAULT_SCALE, ...level.scale };
  const M = 1 / S.tile; // metres -> tiles
  const rows = level.tiles;
  const depth = rows.length, width = rows[0].length;
  const typeAt = (x, z) => (z < 0 || z >= depth || x < 0 || x >= width ? null : tileTypes[rows[z][x]]);
  const isFloor = (x, z) => !!typeAt(x, z)?.floor;
  const split = (key) => assets[key].spec.storeys || [0.5, 0.96];

  const G = S.ground * M, U = S.storey * M, J = S.jetty * M;
  const pick = (list, x, z, salt) => list[hash3(x, z, salt) % list.length];

  const buildings = new Map();
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    const t = typeAt(x, z);
    if (!t?.wall) continue;
    const over = level.buildings?.[`${x},${z}`] || {};
    const b = { x, z, t, levels: [], roof: !!t.roof };
    if (t.storeys) {
      const [lo, hi] = t.storeys;
      const n = over.storeys ?? lo + (hash3(x, z, 11) % (hi - lo + 1));
      b.storeys = n;
      b.jetty = over.jetty ?? rand3(x, z, 12) < (t.jetty ?? 0);
      // Eave strip adds height to the top storey, in proportion to the texture.
      const [g, u] = split(t.faces[0]);
      const eave = n > 1 ? (U * (1 - u)) / (u - g) : 0;
      let y = 0;
      for (let i = 0; i < n; i++) {
        const h = i === 0 ? G : U + (i === n - 1 ? eave : 0);
        b.levels.push({ y0: y, y1: y + h, out: b.jetty ? i * J : 0, top: i === n - 1 });
        y += h;
      }
      b.top = y;
    } else {
      const aspect = assets[t.faces[0]].aspect;
      b.top = t.height ? t.height * M : aspect;
      b.levels.push({ y0: 0, y1: b.top, out: 0, top: true });
    }
    b.outTop = b.levels[b.levels.length - 1].out;
    if (b.roof) {
      const [rlo, rhi] = t.roofHeight || [1.8, 1.8];
      b.roofH = (over.roofHeight ?? rlo + rand3(x, z, 13) * (rhi - rlo)) * M;
      const facesNS = isFloor(x, z - 1) || isFloor(x, z + 1);
      const facesEW = isFloor(x - 1, z) || isFloor(x + 1, z);
      b.alongX = facesNS || (!facesEW && (!!typeAt(x - 1, z)?.roof || !!typeAt(x + 1, z)?.roof));
      b.chimney = over.chimney ?? rand3(x, z, 14) < (t.chimney ?? 0);
    }
    buildings.set(`${x},${z}`, b);
  }
  const at = (x, z) => buildings.get(`${x},${z}`) || null;

  // Height from which the face of wall (x,z) towards (dx,dz) can be seen, or null.
  // 0 = a street face; > 0 = the part of a side wall above a lower neighbour.
  function visibleFrom(x, z, dx, dz) {
    const t = typeAt(x, z), n = typeAt(x + dx, z + dz);
    if (!t || !n) return null;
    if (n.floor || (n.low && !t.low)) return 0;
    if (n.wall && !t.low) {
      const a = at(x, z), b = at(x + dx, z + dz);
      if (b.top < a.top - 1e-4) return b.top;
    }
    return null;
  }

  // Texture for each storey of a face. Upper storeys pick from `t.upper` for variety.
  function faceKeys(x, z, dx, dz) {
    const t = typeAt(x, z), b = at(x, z);
    const side = sideOf(dx, dz).charCodeAt(0);
    return b.levels.map((_, i) => (i === 0 || !t.upper ? pick(t.faces, x, z, side) : pick(t.upper, x, z, side * 31 + i)));
  }

  // How far the face sticks out at height y (tiles).
  function outAt(x, z, dx, dz, y) {
    const b = at(x, z);
    if (!b || visibleFrom(x, z, dx, dz) !== 0) return 0;
    const lv = b.levels.find((l) => y < l.y1) || b.levels[b.levels.length - 1];
    return lv.out;
  }

  return { S, M, width, depth, typeAt, isFloor, at, buildings, visibleFrom, faceKeys, outAt, split };
}
