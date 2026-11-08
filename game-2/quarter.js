// 2D compositing demo — a small town quarter.
// Designed so lines of sight stay short: no straight open run is longer than four
// cells, so walls close every view within the drawn depth (view.maxDepth = 3).
// Coordinates: x grows east, z grows south. North is -z.

// Wall types: `art` names the folder of slot images under assets/walls/.
export const tileTypes = {
  '.': { floor: true },
  H: { wall: true, art: 'house-a' },
  J: { wall: true, art: 'house-b' },
  D: { wall: true, art: 'house-door' },
  A: { wall: true, art: 'shop-alchemist' },
  B: { wall: true, art: 'shop-smith' },
  '#': { wall: true, art: 'stone-wall' },
};

// Props and NPCs: size in tiles (w/h must match the art's proportions).
export const props = {
  guard: { art: 'guard', w: 0.416, h: 0.88 },
  villager: { art: 'villager', w: 0.266, h: 0.68 },
  hooded: { art: 'hooded', w: 0.326, h: 0.7 },
  stall: { art: 'stall', w: 1.295, h: 1.05 },
  well: { art: 'well', w: 0.619, h: 0.8 },
  barrel: { art: 'barrel', w: 0.231, h: 0.32 },
  crate: { art: 'crate', w: 0.265, h: 0.28 },
  chest: { art: 'chest', w: 0.289, h: 0.26 },
  lamppost: { art: 'lamppost', w: 0.62, h: 1.35 },
};

export const quarter = {
  name: 'Ravensmoor, the Old Quarter',
  tiles: [
    'HJHDHJHJH',
    'H....A#.H',
    'HJ.DB...H',
    'HD....J.H',
    'JHJ...H.J',
    'HHD....HH',
    'H...JH.JH',
    'H..#...BH',
    'HHJHHDHHH',
  ],
  start: { x: 4, z: 5, dir: 0 },
  entities: [
    { prop: 'well', name: 'the well', x: 5, z: 3, block: true },
    { prop: 'stall', name: "the alchemist's stall", x: 3, z: 3, block: true },
    { prop: 'guard', name: 'a town guard', x: 1, z: 1, block: true },
    { prop: 'villager', name: 'a villager', x: 4, z: 7, block: true },
    { prop: 'hooded', name: 'a hooded stranger', x: 7, z: 4, block: true },
    { prop: 'lamppost', name: 'a lamp post', x: 1, z: 6, block: true },
    { prop: 'barrel', name: 'a barrel', x: 4, z: 1 },
    { prop: 'barrel', x: 6, z: 7 },
    { prop: 'crate', x: 7, z: 3 },
    { prop: 'chest', name: 'a chest', x: 7, z: 1 },
  ],
};
