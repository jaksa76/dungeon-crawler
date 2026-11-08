// Movement over the tile grid. Pure logic, no DOM: the same on every view of every map.
// A state is { x, z, dir } with dir 0 = N, 1 = E, 2 = S, 3 = W. Props never block; only walls and scenery do.
import { DIRS, FWD, RIGHT } from '../tools/views/dirs.mjs';

export const viewName = (s) => `x${s.x}z${s.z}-${DIRS[s.dir]}`;

export function createWorld(map) {
  const walkable = (x, z) => map.tiles[z]?.[x] === '.';
  const cells = [];
  map.tiles.forEach((row, z) => [...row].forEach((ch, x) => { if (ch === '.') cells.push({ x, z }); }));

  const shift = (s, v) => ({ x: s.x + v[0], z: s.z + v[1], dir: s.dir });
  const moves = {
    forward: (s) => shift(s, FWD[s.dir]),
    back: (s) => shift(s, FWD[(s.dir + 2) % 4]),
    left: (s) => shift(s, RIGHT[(s.dir + 2) % 4]),
    right: (s) => shift(s, RIGHT[s.dir]),
    turnLeft: (s) => ({ ...s, dir: (s.dir + 3) % 4 }),
    turnRight: (s) => ({ ...s, dir: (s.dir + 1) % 4 }),
  };

  // Returns { state, moved, blocked } for a command (forward, back, left, right, turnLeft, turnRight).
  function act(state, cmd) {
    const next = moves[cmd](state);
    if (!walkable(next.x, next.z)) return { state, moved: false, blocked: true };
    return { state: next, moved: next.x !== state.x || next.z !== state.z || next.dir !== state.dir, blocked: false };
  }

  // every (cell, facing) of the map: the full list of views to paint
  const views = cells.flatMap((c) => [0, 1, 2, 3].map((dir) => ({ ...c, dir })));
  return { map, walkable, act, cells, views };
}
