// Remember discovered cells per level. A ray stops at its first wall, including
// closed diagonal corners, so the map doesn't reveal corridors through masonry.
export function createExploration(level, cell) {
  const known = new Set();
  const radius = level.exploration?.radius;
  function reveal(p) {
    if (!radius) return;
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dz * dz > radius * radius) continue;
      let x = p.x, z = p.z;
      const tx = x + dx, tz = z + dz;
      const ax = Math.abs(dx), az = Math.abs(dz), sx = Math.sign(dx), sz = Math.sign(dz);
      let error = ax - az;
      while (true) {
        const c = cell(x, z); if (!c) break;
        known.add(`${x},${z}`);
        if ((x === tx && z === tz) || c.wall) break;
        const e = error * 2, stepX = e > -az, stepZ = e < ax;
        if (stepX && stepZ && (cell(x + sx, z)?.wall || cell(x, z + sz)?.wall)) break;
        if (stepX) { error -= az; x += sx; }
        if (stepZ) { error += ax; z += sz; }
      }
    }
  }
  return { reveal, known, isKnown: (x, z) => !radius || known.has(`${x},${z}`) };
}
