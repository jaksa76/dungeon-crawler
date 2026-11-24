// The courtyard of experiment 3: a plus-shaped square of 5 open cells (20 views), plus the words the image model
// needs for each wall type and prop. Coordinates: x grows east, z grows south. North is -z.
//
//   z0  # T V T R     V branching stairs up to the castle gate (scenery), T stone wall with a terrace and onlookers,
//                     the two terraces joined by a footbridge over the foot of the stairs
//   z1  # Z . R R     Z wizard's shop, R river (a cove and the river itself, with the far shore beyond)
//   z2  I . . . R     I inn
//   z3  # B . D R     B smith, D house with a door
//   z4  # # G # #     G gatehouse: an arched passage out of the quarter
export const tiles = [
  '#TVTR',
  '#Z.RR',
  'I...R',
  '#B.DR',
  '##G##',
];

// Per wall type: h = height of the eave in tiles (houses run out of the top of the frame), run = how far
// the roof climbs back, far = the cell is open scenery that many tiles further away, not a wall,
// scenery = what is built there (see proxy.mjs: stairs | river), water = open water, people = onlookers on top.
export const wallInfo = {
  D: { h: 2.6, run: 0.9 }, B: { h: 2.6, run: 0.9 },
  Z: { h: 2.8, run: 1.1 }, I: { h: 2.8, run: 0.9 }, G: { h: 2.1, run: 0 },
  T: { h: 1.5, run: 0, people: 3 },
  '#': { h: 1.5, run: 0 },
  V: { h: 1.7, run: 0, far: 6, scenery: 'stairs' },
  R: { h: 0, run: 0, water: true, scenery: 'river', colour: 'stream' },
};

export const wallTypes = {
  V: 'a modest, narrow, weathered stone staircase in deep shadow, a stone footbridge arching over its foot; it climbs to a small landing, then splits into two narrow flights left and right up to a gate, understated and dark so it recedes into the dusk; a dark castle with glowing windows on a hill above in the distance',
  R: 'a wide dark river with soft ripples reflecting lantern light, a stone quay with iron mooring rings, mist on the water',
  D: 'half-timbered house with a wooden front door, stone steps and an iron lantern, glowing windows, tiled roof',
  I: 'a big half-timbered inn with a hanging painted sign, a warm glowing doorway and windows, a lantern, barrels by the door, a steep tiled roof with a chimney, smoke',
  Z: "a wizard's shop in a crooked narrow tower, a hanging moon-and-star sign, blue-violet glowing windows, a telescope on the balcony, shelves of books and bottles in the window, a conical tiled roof",
  B: "blacksmith's shop with a hanging crossed-hammers sign, glowing forge windows, stone base, tiled roof",
  G: 'a stone gatehouse with an open arched passage leading into darkness, an iron lantern in the arch, a raised portcullis, mossy stones',
  T: 'a rough grey stone wall topped by a terrace with a stone balustrade, flower pots and a hanging lantern, joined to the matching terrace across the stair lane by a stone footbridge',
  '#': 'rough grey stone wall with a burning wall torch, big stone blocks, moss',
};

// Seen across the river from the cells on its bank (see proxy.mjs): houses and a mill on the far shore, waterfalls down a wooded cliff.
export const farShore = {
  houses: 'a few small, scattered half-timbered houses on the opposite shore of the river, warm glowing windows, tiled roofs, pine trees between them',
  mill: 'a timber water mill with a big wooden water wheel turning in the river',
  waterfalls: 'two waterfalls tumbling down a wooded cliff into the river, mist',
};

// size in tiles (w, h); `edge` = gap to the wall it stands against (default 0.12; small clutter hugs the wall); `look` is what the image model is told.
export const props = {
  guard: { w: 0.416, h: 0.88, look: 'a town guard in a plumed helmet with a spear and a crimson cross shield' },
  chest: { w: 0.289, h: 0.26, edge: 0.03, look: 'a wooden treasure chest with iron bands' },
  hooded: { w: 0.326, h: 0.7, look: 'a stranger in a green hooded cloak' },
  lamppost: { w: 0.62, h: 1.35, look: 'an iron lamp post with a glowing lantern and a banner' },
  villager: { w: 0.266, h: 0.68, look: 'a woman villager in a white bonnet and brown dress' },
  crate: { w: 0.265, h: 0.28, edge: 0.03, look: 'a wooden crate' },
  well: { w: 0.619, h: 0.8, look: 'a round stone well with a wooden tiled roof, a hanging bucket and a lantern' },
  barrel: { w: 0.231, h: 0.32, edge: 0.03, look: 'a wooden barrel' },
  boat: { w: 0.5, sideW: 0.24, h: 0.18, edge: 0.03, look: 'a small wooden rowing boat tied to the quay with a rope, an oar across it' },
};

export const start = { x: 2, z: 3, dir: 0 };

// Static scenery only: anything that moves or changes (the hooded stranger, items, doors) is drawn on top by the engine.
// Props stand against a tile side (at most one per side); the sides that face the centre are left free so the lanes stay open.
export const entities = [
  { prop: 'guard', name: 'a town guard', x: 2, z: 1, side: 'N' }, // at the foot of the stairs, guarding them
  { prop: 'crate', x: 2, z: 1, side: 'E' },
  { prop: 'well', name: 'the well', x: 3, z: 2, side: 'N' },
  { prop: 'boat', name: 'a rowing boat', x: 3, z: 2, side: 'E' },
  { prop: 'villager', name: 'a villager', x: 3, z: 2, side: 'S' },
  { prop: 'lamppost', name: 'a lamp post', x: 1, z: 2, side: 'S' },
  { prop: 'barrel', x: 1, z: 2, side: 'N' },
  { prop: 'chest', name: 'a chest', x: 2, z: 3, side: 'W' },
  { prop: 'barrel', x: 2, z: 3, side: 'E' },
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
