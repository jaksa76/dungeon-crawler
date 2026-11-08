// 2D compositing demo — a small town courtyard: a 3×3 square of open cells inside a
// ring of buildings. The drawn depth is unchanged (view.maxDepth = 3): from the back
// row you look across two open cells and the far wall closes the view at depth 3.
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
  stall: { art: 'stall', w: 1.295, h: 1.05, sideW: 0.49 }, // sideW: its width seen from the side (the art's own proportions)
  well: { art: 'well', w: 0.619, h: 0.8 },
  barrel: { art: 'barrel', w: 0.231, h: 0.32 },
  crate: { art: 'crate', w: 0.265, h: 0.28 },
  chest: { art: 'chest', w: 0.289, h: 0.26 },
  lamppost: { art: 'lamppost', w: 0.62, h: 1.35 },
};

// Every entity stands against one side of its tile (`side`: N, E, S or W), at most one
// per side. Nothing blocks a tile: the player can walk onto a tile with an NPC and
// sees it only while facing its side. Named entities show up on the minimap.
export const quarter = {
  name: 'Ravensmoor, the Old Quarter',
  tiles: [
    '#AHB#',
    'J...H',
    'H...D',
    'D...J',
    '#J#H#',
  ],
  start: { x: 2, z: 3, dir: 0 },
  entities: [
    { prop: 'stall', name: "the alchemist's stall", x: 2, z: 1, side: 'N' },
    { prop: 'guard', name: 'a town guard', x: 1, z: 1, side: 'N' },
    { prop: 'chest', name: 'a chest', x: 3, z: 1, side: 'N' },
    { prop: 'hooded', name: 'a hooded stranger', x: 3, z: 2, side: 'E' },
    { prop: 'lamppost', name: 'a lamp post', x: 1, z: 2, side: 'W' },
    { prop: 'villager', name: 'a villager', x: 1, z: 3, side: 'W' },
    { prop: 'crate', x: 1, z: 3, side: 'S' },
    { prop: 'well', name: 'the well', x: 3, z: 3, side: 'E' },
    { prop: 'barrel', name: 'a barrel', x: 2, z: 3, side: 'S' },
    { prop: 'barrel', x: 2, z: 2, side: 'W' },
  ],
};
