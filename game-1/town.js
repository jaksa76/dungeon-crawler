// Town square experiment — aims to recreate docs/concept-toonish.png.
// Coordinates: x grows east, z grows south. North is -z. One tile = 1 unit.
// Heights (`height`, `y`) are in metres; see `scale` on the level.

export const manifest = {
  // environment
  'textures/cobblestone': { gen: 'cobble', repeat: true, heightMap: true },
  'textures/roof-tiles': { gen: 'roof', repeat: true },
  // Facades: `storeys` = [top of ground storey, top of upper storey] as texture v
  // (0 = bottom); above the second value is the eave strip. `door` keeps clutter
  // away; `flowerBox: false` where the art already paints one.
  'textures/house-timber-a': { gen: 'facade:a', glow: true, storeys: [0.47, 0.9] },
  'textures/house-timber-b': { gen: 'facade:b', glow: true, storeys: [0.47, 0.9], flowerBox: false },
  'textures/house-door': { gen: 'facade:door', glow: true, storeys: [0.47, 0.9], door: true },
  'textures/shop-alchemist': { gen: 'facade:alchemist', glow: true, storeys: [0.47, 0.9], door: true, flowerBox: false },
  'textures/shop-smith': { gen: 'facade:smith', glow: true, storeys: [0.47, 0.9], door: true },
  'textures/stone-wall': { gen: 'stoneWall', repeat: true },
  'textures/parapet': { gen: 'parapet' },
  // backdrop
  'backdrop/sky': { gen: 'sky', repeat: true },
  'backdrop/hills': { gen: 'hills', repeat: true },
  'backdrop/treeline': { gen: 'treeline', repeat: true },
  'backdrop/moon': { gen: 'moon' },
  'backdrop/castle': { gen: 'castle' },
  'backdrop/waterfall': { gen: 'waterfall' },
  // sprites
  'sprites/npc-guard': { trim: true, gen: 'guard' },
  'sprites/npc-guard-far': { trim: true, from: 'sprites/npc-guard' },
  'sprites/npc-villager': { trim: true, gen: 'villager' },
  'sprites/npc-villager-far': { trim: true, from: 'sprites/npc-villager' },
  'sprites/npc-hooded': { trim: true, gen: 'hooded' },
  'sprites/prop-stall': { trim: true, gen: 'stall', glow: true },
  'sprites/prop-well': { trim: true, gen: 'well' },
  'sprites/prop-barrel': { trim: true, gen: 'barrel' },
  'sprites/prop-crate': { trim: true, gen: 'crate' },
  'sprites/prop-chest': { trim: true, gen: 'chest' },
  'sprites/prop-lamppost': { trim: true, gen: 'lamppost', glow: true },
  'sprites/prop-banner': { trim: true, gen: 'banner' },
  'sprites/decal-torch': { trim: true, gen: 'torch', glow: true },
  // dressing (placeholders only, for now)
  'sprites/prop-sack': { trim: true, gen: 'sack' },
  'sprites/prop-bucket': { trim: true, gen: 'bucket' },
  'sprites/prop-pot': { trim: true, gen: 'pot' },
  'sprites/prop-firewood': { trim: true, gen: 'firewood' },
  'sprites/prop-hay': { trim: true, gen: 'hay' },
  'sprites/prop-planter': { trim: true, gen: 'planter' },
  'sprites/prop-weeds': { trim: true, gen: 'weeds' },
  'sprites/prop-cart': { trim: true, gen: 'cart' },
  'sprites/prop-bench': { trim: true, gen: 'bench' },
  'sprites/prop-goods': { trim: true, gen: 'goods' },
  'sprites/decal-flowerbox': { trim: true, gen: 'flowerbox' },
  'sprites/decal-ivy': { trim: true, gen: 'ivy' },
  'sprites/decal-lantern': { trim: true, gen: 'wallLantern', glow: true },
  'sprites/decal-sign': { trim: true, gen: 'sign' },
  'sprites/floor-puddle': { gen: 'puddle' },
  // ui
  'ui/portrait-hero': { gen: 'portrait' },
  'ui/panel': { gen: 'panel' },
};

// Bottom panel: cut from docs/concept-toonish.png (tools/crop.mjs). Regions are
// in the panel image's own pixels: [x, y, w, h].
export const uiLayout = {
  image: 'ui/panel',
  portrait: [42, 33, 163, 175],
  hp: [292, 56, 212, 25],
  mp: [292, 112, 212, 25],
  map: [1178, 22, 253, 191],
  letters: [[1290, 16, 30, 30], [1290, 192, 30, 21], [1180, 99, 30, 27], [1396, 95, 27, 31]], // N S W E
};

// Wall types. `faces` are picked per face (deterministically) for variety; upper
// storeys pick from `upper`. Buildings get a storey count in `storeys` [min, max],
// jettied upper floors with probability `jetty`, a roof `roofHeight` [min, max] m
// and a chimney with probability `chimney`. Override per tile with `buildings`.
const UPPER = ['textures/house-timber-a', 'textures/house-timber-b', 'textures/house-door'];
const HOUSE = { wall: true, roof: true, upper: UPPER, jetty: 0.6, roofHeight: [1.8, 3.2], chimney: 0.45 };
export const tileTypes = {
  '.': { floor: true },
  H: { ...HOUSE, faces: ['textures/house-timber-a', 'textures/house-timber-b'], storeys: [2, 4] },
  D: { ...HOUSE, faces: ['textures/house-door'], storeys: [2, 3] },
  A: { ...HOUSE, faces: ['textures/shop-alchemist'], storeys: [3, 3] },
  B: { ...HOUSE, faces: ['textures/shop-smith'], storeys: [2, 3] },
  '#': { wall: true, faces: ['textures/stone-wall'], height: 7.5 },
  '=': { wall: true, faces: ['textures/parapet'], low: true },
};

export const town = {
  name: 'Ravensmoor Square',
  tiles: [
    'HHH===HHH',
    'H.......A',
    'D.......H',
    '#.......B',
    '#.......H',
    '##.....DH',
    '###...HHH',
    '###...DHH',
    'HHHHHHHHH',
  ],
  start: { x: 4, z: 7, dir: 0 },

  // Real-world scale: a tile is 3 m; people are ~1.75 m, storeys ~2.4 m.
  scale: { tile: 3, eye: 1.6, ground: 2.5, storey: 2.35, jetty: 0.25 },
  floorScale: 1.5,
  lightRange: 4.5,
  // Per-tile building overrides, to compose the start view.
  buildings: {
    '6,6': { storeys: 4, jetty: true }, '7,5': { storeys: 3, jetty: true }, '8,4': { storeys: 4 },
    '2,0': { storeys: 3 }, '6,0': { storeys: 4, jetty: true },
  },
  // Rule-based set dressing (engine/dressing.js); hand-placed entities are kept.
  dressing: { seed: 3, exclude: ['4,7', '4,6'] },

  // Billboards. `height` (metres) is the visible figure; width comes from the image.
  // `light` attaches a point light (y in metres). Unnamed entities are scenery.
  entities: [
    { sprite: 'sprites/prop-stall', name: "the alchemist's stall", x: 1.1, z: 3, height: 2.8, block: true,
      light: { color: '#ffb050', intensity: 1.8, y: 2.2, flicker: 0.1 } },
    { sprite: 'sprites/prop-chest', name: 'a chest', x: 1.2, z: 4.3, height: 0.6, block: true },
    { sprite: 'sprites/prop-crate', x: 1.75, z: 4.55, height: 0.7 },
    { sprite: 'sprites/prop-goods', name: 'a fruit stand', x: 2.05, z: 2.75, height: 1.0, block: true },
    { sprite: 'sprites/npc-guard', far: 'sprites/npc-guard-far', name: 'a town guard', x: 3, z: 2, height: 2.2, block: true },
    { sprite: 'sprites/npc-hooded', name: 'a hooded stranger', x: 5, z: 1, height: 1.75, block: true },
    { sprite: 'sprites/npc-villager', far: 'sprites/npc-villager-far', name: 'a villager', x: 6, z: 4, height: 1.7, block: true },
    { sprite: 'sprites/prop-well', name: 'the well', x: 6, z: 2, height: 2.6, block: true },
    { sprite: 'sprites/prop-barrel', x: 6.6, z: 2.85, height: 0.95 },
    { sprite: 'sprites/prop-bucket', x: 5.55, z: 2.55, height: 0.38 },
    { sprite: 'sprites/prop-cart', name: 'a handcart', x: 6.15, z: 5.05, height: 1.5, block: true },
    // a hay wagon stop west of the square's centre line
    { sprite: 'sprites/prop-hay', name: 'hay bales', x: 2.85, z: 4.0, height: 0.85, block: true },
    { sprite: 'sprites/prop-hay', x: 3.1, z: 4.2, height: 0.8 },
    { sprite: 'sprites/prop-sack', x: 2.55, z: 4.3, height: 0.6 },
    { sprite: 'sprites/prop-sack', x: 3.35, z: 3.85, height: 0.55 },
    // goods around the alchemist's stall
    { sprite: 'sprites/prop-crate', x: 1.55, z: 3.55, height: 0.7 },
    { sprite: 'sprites/prop-crate', x: 1.57, z: 3.56, y: 0.65, height: 0.6, shadow: false },
    { sprite: 'sprites/prop-pot', x: 0.75, z: 3.6, height: 0.7 },
    // crates waiting by the well
    { sprite: 'sprites/prop-crate', x: 5.45, z: 3.45, height: 0.7 },
    { sprite: 'sprites/prop-barrel', x: 5.2, z: 3.25, height: 0.95 },
    { sprite: 'sprites/prop-sack', x: 5.7, z: 3.6, height: 0.6 },
    { sprite: 'sprites/prop-bench', name: 'a bench', x: 4.0, z: 0.72, height: 0.9 },
    { sprite: 'sprites/prop-planter', x: 3.35, z: 0.7, height: 0.7 },
    { sprite: 'sprites/prop-planter', x: 4.65, z: 0.7, height: 0.7 },
    { sprite: 'sprites/prop-banner', name: 'a banner', x: 2, z: 1, height: 3.6, block: true, shadowWidth: 0.9 },
    { sprite: 'sprites/prop-lamppost', name: 'a lamp post', x: 1, z: 2, height: 3.5, block: true, shadowWidth: 0.9,
      light: { color: '#ffc060', intensity: 2.6, y: 2.9, flicker: 0.05 } },
    { sprite: 'sprites/prop-lamppost', name: 'a lamp post', x: 7, z: 4, height: 3.5, block: true, shadowWidth: 0.9,
      light: { color: '#ffc060', intensity: 2.6, y: 2.9, flicker: 0.05 } },
  ],

  // Decals stuck flat on a wall face: wall tile + which side faces the street.
  decals: [
    { sprite: 'sprites/decal-torch', wall: { x: 2, z: 6, face: 'E' }, y: 2.2, height: 0.8,
      light: { color: '#ff9a40', intensity: 2.4, flicker: 0.25 } },
    { sprite: 'sprites/decal-torch', wall: { x: 1, z: 5, face: 'E' }, y: 2.2, height: 0.8,
      light: { color: '#ff9a40', intensity: 2.0, flicker: 0.25 } },
    { sprite: 'sprites/decal-torch', wall: { x: 0, z: 4, face: 'E' }, y: 2.2, height: 0.8,
      light: { color: '#ff9a40', intensity: 2.0, flicker: 0.25 } },
  ],

  // Parallax backdrop. Layers wrap around the horizon; landmarks sit at a bearing
  // (degrees clockwise from north) and elevation (degrees above the horizon).
  backdrop: {
    ambient: { sky: '#6a5aa8', ground: '#2a2030', intensity: 0.45 },
    moonlight: { color: '#b8a8ff', intensity: 0.45, bearing: 20, elevation: 35 },
    fog: { color: '#1e1838', near: 8, far: 34 },
    layers: [
      { image: 'backdrop/sky', radius: 300, from: -6, to: 42, follow: 1 },
      { image: 'backdrop/hills', radius: 160, from: -6, peak: 9, follow: 0.97 },
      { image: 'backdrop/treeline', radius: 90, from: -6, peak: 5, follow: 0.9 },
    ],
    landmarks: [
      { image: 'backdrop/moon', radius: 280, bearing: 22, elevation: 21, size: 12, follow: 1 },
      { image: 'backdrop/castle', radius: 140, bearing: -5, elevation: -3, size: 30, follow: 0.97 },
      { image: 'backdrop/waterfall', radius: 70, bearing: 11, elevation: -4, size: 14, follow: 0.88 },
    ],
  },
};
