// The 3x3 courtyard of experiment 2 (game-2/quarter.js on the 2d-demo-comfyui-experiments branch),
// plus the words the image model needs for each wall type and prop.
// Coordinates: x grows east, z grows south. North is -z. Cell (x, z) spans x-0.5..x+0.5.

// A, B shops flank a stair lane (V) that climbs to the castle; W is the waterfall and mill race east of the square.
export const tiles = [
  '#AVB#',
  'J...H',
  'H...W',
  'D...J',
  '#H#H#',
];

// Per wall type: h = height of the eave in tiles (houses run out of the top of the frame), run = how far
// the roof climbs back, far = the cell is open scenery that many tiles further away, not a wall.
export const wallInfo = {
  H: { h: 2.6, run: 0.9 }, J: { h: 2.3, run: 0.9 }, D: { h: 2.6, run: 0.9 }, A: { h: 2.6, run: 0.9 }, B: { h: 2.6, run: 0.9 },
  '#': { h: 1.5, run: 0 },
  V: { h: 1.7, run: 0, far: 6 },
  W: { h: 1.9, run: 0, far: 5 },
};

export const wallTypes = {
  V: 'a wide stone staircase climbing between old timber houses with lanterns up to a gate, a dark castle with glowing windows on a hill above in the distance',
  W: 'a waterfall tumbling into a stream beside a wooden water wheel and a stone bridge, mist, pine trees',
  H: 'half-timbered medieval house, dark timber beams, cream plaster, warm glowing windows, flower boxes, jettied upper floor, tiled roof, ivy',
  J: 'old stone and timber house, shuttered lit windows, dormer, chimney, hanging lantern, mossy tiled roof',
  D: 'half-timbered house with a wooden front door, stone steps and an iron lantern, glowing windows, tiled roof',
  A: "alchemist's shop with a hanging potion-bottle banner sign, red awning, glowing windows, crates and flowers, tiled roof",
  B: "blacksmith's shop with a hanging crossed-hammers sign, glowing forge windows, stone base, tiled roof",
  '#': 'rough grey stone wall with a burning wall torch, big stone blocks, moss',
};

// size in tiles (w, h); `look` is what the image model is told.
export const props = {
  stall: { w: 1.295, sideW: 0.475, h: 1.05, look: 'a market stall with a red striped awning, a hanging lantern and a bearded alchemist selling red and blue potions' },
  guard: { w: 0.416, h: 0.88, look: 'a town guard in a plumed helmet with a spear and a crimson cross shield' },
  chest: { w: 0.289, h: 0.26, look: 'a wooden treasure chest with iron bands' },
  hooded: { w: 0.326, h: 0.7, look: 'a stranger in a green hooded cloak' },
  lamppost: { w: 0.62, h: 1.35, look: 'an iron lamp post with a glowing lantern and a banner' },
  villager: { w: 0.266, h: 0.68, look: 'a woman villager in a white bonnet and brown dress' },
  crate: { w: 0.265, h: 0.28, look: 'a wooden crate' },
  well: { w: 0.619, h: 0.8, look: 'a round stone well with a wooden tiled roof, a hanging bucket and a lantern' },
  barrel: { w: 0.231, h: 0.32, look: 'a wooden barrel' },
};

export const entities = [
  { prop: 'stall', name: "the alchemist's stall", x: 1, z: 2, side: 'W' },
  { prop: 'guard', name: 'a town guard', x: 1, z: 1, side: 'N' },
  { prop: 'hooded', name: 'a hooded stranger', x: 2, z: 1, side: 'N' },
  { prop: 'chest', name: 'a chest', x: 1, z: 3, side: 'W' },
  { prop: 'lamppost', name: 'a lamp post', x: 3, z: 1, side: 'E' },
  { prop: 'well', name: 'the well', x: 3, z: 2, side: 'E' },
  { prop: 'villager', name: 'a villager', x: 3, z: 3, side: 'E' },
  { prop: 'barrel', x: 3, z: 2, side: 'S' },
  { prop: 'barrel', x: 3, z: 3, side: 'N' },
  { prop: 'crate', x: 1, z: 2, side: 'S' },
];

export const cells = []; // every open cell
tiles.forEach((row, z) => [...row].forEach((c, x) => { if (c === '.') cells.push({ x, z }); }));

export const DIRS = ['N', 'E', 'S', 'W'];
export const FWD = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const RIGHT = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const SIDE_VEC = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

// What lies beyond the roofs, by facing (the backdrop of experiment 1: castle at north, moon and waterfall just east of it).
export const skyLook = {
  N: 'a purple night sky with a big full moon and clouds, pine trees',
  E: 'a purple night sky with clouds and stars, dark pine trees and distant hills',
  S: 'a purple night sky with clouds and stars, dark pine trees and distant hills',
  W: 'a purple night sky with clouds and stars, dark pine trees and distant hills',
};
