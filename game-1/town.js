// Town square experiment — aims to recreate docs/concept-toonish.png.
// Coordinates: x grows east, z grows south. North is -z. One tile = 1 unit.

export const manifest = {
  // environment
  'textures/cobblestone': { gen: 'cobble', repeat: true },
  'textures/roof-tiles': { gen: 'roof', repeat: true },
  'textures/house-timber-a': { gen: 'facade:a', glow: true },
  'textures/house-timber-b': { gen: 'facade:b', glow: true },
  'textures/house-door': { gen: 'facade:door', glow: true },
  'textures/shop-alchemist': { gen: 'facade:alchemist', glow: true },
  'textures/shop-smith': { gen: 'facade:smith', glow: true },
  'textures/stone-wall': { gen: 'stoneWall' },
  'textures/parapet': { gen: 'parapet' },
  // backdrop
  'backdrop/sky': { gen: 'sky', repeat: true },
  'backdrop/hills': { gen: 'hills', repeat: true },
  'backdrop/treeline': { gen: 'treeline', repeat: true },
  'backdrop/moon': { gen: 'moon' },
  'backdrop/castle': { gen: 'castle' },
  'backdrop/waterfall': { gen: 'waterfall' },
  // sprites
  'sprites/npc-guard': { gen: 'guard' },
  'sprites/npc-guard-far': { from: 'sprites/npc-guard' },
  'sprites/npc-villager': { gen: 'villager' },
  'sprites/npc-villager-far': { from: 'sprites/npc-villager' },
  'sprites/npc-hooded': { gen: 'hooded' },
  'sprites/prop-stall': { gen: 'stall', glow: true },
  'sprites/prop-well': { gen: 'well' },
  'sprites/prop-barrel': { gen: 'barrel' },
  'sprites/prop-crate': { gen: 'crate' },
  'sprites/prop-chest': { gen: 'chest' },
  'sprites/prop-lamppost': { gen: 'lamppost', glow: true },
  'sprites/prop-banner': { gen: 'banner' },
  'sprites/decal-torch': { gen: 'torch', glow: true },
  // ui
  'ui/portrait-hero': { gen: 'portrait' },
  'ui/panel-stone': { gen: 'panelStone' },
  'ui/icons-actions': { gen: 'icons:actions' },
  'ui/icons-items': { gen: 'icons:items' },
};

// Wall types. `faces` are picked per face (deterministically) for variety.
export const tileTypes = {
  '.': { floor: true },
  H: { wall: true, faces: ['textures/house-timber-a', 'textures/house-timber-b'], roof: true },
  D: { wall: true, faces: ['textures/house-door'], roof: true },
  A: { wall: true, faces: ['textures/shop-alchemist'], roof: true },
  B: { wall: true, faces: ['textures/shop-smith'], roof: true },
  '#': { wall: true, faces: ['textures/stone-wall'] },
  '=': { wall: true, faces: ['textures/parapet'], low: true },
};

export const town = {
  name: 'Ravensmoor Square',
  tiles: [
    'HHHH===HHHH',
    'H.........A',
    'D.........H',
    'HH.......DH',
    '#.........B',
    '#.........H',
    '#.........H',
    '##.......HH',
    '###.....HHH',
    '###.....DHH',
    '###.....HHH',
    'HHHHHHHHHHH',
  ],
  start: { x: 5, z: 10, dir: 0 },

  // Billboards. `height` is in tiles; width comes from the image aspect.
  // `light` attaches a point light (y in tiles above floor).
  entities: [
    { sprite: 'sprites/prop-stall', name: 'Alchemist stall', x: 1.1, z: 5, height: 1.05, block: true,
      light: { color: '#ffb050', intensity: 1.6, y: 0.8, flicker: 0.1 } },
    { sprite: 'sprites/prop-chest', name: 'a chest', x: 1.2, z: 6.3, height: 0.26, block: true },
    { sprite: 'sprites/prop-crate', name: 'a crate', x: 2.0, z: 6.6, height: 0.28 },
    { sprite: 'sprites/npc-guard', far: 'sprites/npc-guard-far', name: 'Town guard', x: 3, z: 4, height: 0.88, block: true },
    { sprite: 'sprites/npc-hooded', name: 'Hooded stranger', x: 5, z: 1, height: 0.7, block: true },
    { sprite: 'sprites/npc-villager', far: 'sprites/npc-villager-far', name: 'Villager', x: 8, z: 7, height: 0.68, block: true },
    { sprite: 'sprites/prop-well', name: 'the well', x: 7, z: 5, height: 0.8, block: true },
    { sprite: 'sprites/prop-barrel', name: 'a barrel', x: 7.65, z: 5.9, height: 0.32 },
    { sprite: 'sprites/prop-barrel', name: 'a barrel', x: 9.2, z: 1.2, height: 0.32, block: true },
    { sprite: 'sprites/prop-crate', name: 'a crate', x: 1.2, z: 1.2, height: 0.28, block: true },
    { sprite: 'sprites/prop-banner', name: 'a banner', x: 2, z: 3, height: 1.4, block: true },
    { sprite: 'sprites/prop-banner', name: 'a banner', x: 8, z: 2, height: 1.4, block: true },
    { sprite: 'sprites/prop-lamppost', name: 'a lamp post', x: 1, z: 2, height: 1.35, block: true,
      light: { color: '#ffc060', intensity: 2.2, y: 1.1, flicker: 0.05 } },
    { sprite: 'sprites/prop-lamppost', name: 'a lamp post', x: 9, z: 4, height: 1.35, block: true,
      light: { color: '#ffc060', intensity: 2.2, y: 1.1, flicker: 0.05 } },
  ],

  // Decals stuck flat on a wall face: wall tile + which side faces the street.
  decals: [
    { sprite: 'sprites/decal-torch', wall: { x: 2, z: 9, face: 'E' }, y: 0.75, height: 0.3,
      light: { color: '#ff9a40', intensity: 2.0, flicker: 0.25 } },
    { sprite: 'sprites/decal-torch', wall: { x: 1, z: 7, face: 'E' }, y: 0.75, height: 0.3,
      light: { color: '#ff9a40', intensity: 1.8, flicker: 0.25 } },
    { sprite: 'sprites/decal-torch', wall: { x: 0, z: 4, face: 'E' }, y: 0.75, height: 0.3,
      light: { color: '#ff9a40', intensity: 1.8, flicker: 0.25 } },
  ],

  // Parallax backdrop. Layers wrap around the horizon; landmarks sit at a bearing
  // (degrees clockwise from north) and elevation (degrees above the horizon).
  backdrop: {
    ambient: { sky: '#6a5aa8', ground: '#2a2030', intensity: 0.55 },
    moonlight: { color: '#b8a8ff', intensity: 0.45, bearing: 20, elevation: 35 },
    fog: { color: '#1e1838', near: 8, far: 34 },
    layers: [
      { image: 'backdrop/sky', radius: 300, from: -8, to: 70, repeat: 2, follow: 1 },
      { image: 'backdrop/hills', radius: 160, from: -10, to: 26, repeat: 3, follow: 0.97 },
      { image: 'backdrop/treeline', radius: 90, from: -6, to: 14, repeat: 5, follow: 0.9 },
    ],
    landmarks: [
      { image: 'backdrop/moon', radius: 280, bearing: 22, elevation: 16, size: 12, follow: 1 },
      { image: 'backdrop/castle', radius: 140, bearing: 10, elevation: -3, size: 30, follow: 0.97 },
      { image: 'backdrop/waterfall', radius: 120, bearing: 38, elevation: -3, size: 18, follow: 0.95 },
    ],
  },
};
