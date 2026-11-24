export const worldMap = {
  image: new URL('../assets/world-map.png', import.meta.url).href,
  locations: [
    { id: 'old-quarter', name: 'Old Quarter', level: 'village', x: 26, y: 59, known: true, spawn: { x: 1, z: 1, dir: 1 } },
    { id: 'undercrypt', name: 'Undercrypt', level: 'dungeon', x: 60, y: 30 },
    { id: 'greybridge', name: 'Greybridge', level: 'market', x: 77, y: 64, requires: 'ravensmoor:heard-of-market' },
  ],
};
