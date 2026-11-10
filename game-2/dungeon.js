// A hand-editable labyrinth below Ravensmoor. E is the door back to the village.
export const dungeonTileTypes = {
  '.': { floor: true },
  '#': { wall: true, art: 'dungeon-stone' },
  E: { wall: true, art: 'dungeon-door' },
};

export const dungeon = {
  name: 'Ravensmoor · The Undercrypt',
  shortName: 'The Undercrypt',
  journal: 'Beneath the Old Quarter lies a labyrinth of stone corridors. Your light reaches only a few paces. The ironbound entrance door leads back to the village; your map records the passages you discover.',
  start: { x: 1, z: 1, dir: 2 },
  atmosphere: { color: '#08090e', near: 0.55, far: 3.2 },
  exploration: { radius: 3 },
  tiles: [
    '#################',
    'E.#.........#...#',
    '#.#######.###.#.#',
    '#.......#.....#.#',
    '#######.#######.#',
    '#.#.....#.......#',
    '#.#.#####.#####.#',
    '#.#.......#...#.#',
    '#.#########.#.#.#',
    '#...#.......#.#.#',
    '#.#.#.#######.#.#',
    '#.#...#.......#.#',
    '#.#####.#######.#',
    '#.#.......#.....#',
    '#.#########.#####',
    '#...............#',
    '#################',
  ],
  entities: [],
  exits: [{ x: 1, z: 1, dir: 3, to: 'village', spawn: { x: 3, z: 2, dir: 3 },
    message: 'The ironbound door leads back to the Old Quarter. Step forward to leave.' }],
};
