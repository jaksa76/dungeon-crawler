import { smithy } from '../content/merchants.js';

// Greybridge, a river market with streets circling a central well.
export const market = {
  name: 'Greybridge Market',
  shortName: 'Greybridge',
  journal: 'Explore Greybridge. The southern gate leads back to the roads of Ravensmoor.',
  environment: 'town',
  view: { maxDepth: 6 }, // see down the streets: rows beyond the painted three are made from them (engine/render/far-slots.js)
  sound: { track: new URL('../assets/music/greybridge.mp3', import.meta.url).href, music: [57, 64, 67, null, 69, 67, 64, null], windTone: 570, windVolume: .06, interval: 1.5 },
  backdrop: new URL('../assets/greybridge-backdrop.png', import.meta.url).href,
  legend: { '.': 'floor', H: 'house-a', J: 'house-b', D: 'house-door', B: 'shop-smith', '#': 'stone-wall' },
  tiles: [
    '#JHBHJ#',
    'H.....H',
    'J.....J',
    'H.....H',
    'D.....D',
    'J.....J',
    '#HHDHJ#',
  ],
  start: { x: 3, z: 5, dir: 0 },
  exits: [{ x: 3, z: 5, dir: 2, worldMap: true,
    message: 'The south gate opens onto the road. Step forward to view the world map.' }],
  entities: [
    { ...smithy, x: 3, z: 1, side: 'N' },
    { id: 'bridge-guard', npc: 'guard', name: 'the bridge guard', x: 4, z: 5, side: 'S',
      behavior: { type: 'examine', text: '“Welcome to Greybridge. Follow the lamps to the market square.”' } },
    { id: 'market-well', prop: 'well', name: 'the market well', x: 3, z: 3, side: 'N',
      behavior: { type: 'examine', text: 'Traders have left pennies in the well for a safe crossing.' } },
    { id: 'market-resident', npc: 'villager', name: 'a river trader', x: 4, z: 2, side: 'E',
      behavior: { type: 'examine', text: '“No boats down from the Old Quarter tonight. The river is too high.”' } },
    { prop: 'lamppost', name: 'a market lantern', x: 2, z: 4, side: 'W' },
  ],
};
