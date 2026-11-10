import { quarter, tileTypes, props } from './quarter.js';
import { dungeon, dungeonTileTypes } from './dungeon.js';

export const levels = {
  village: { level: quarter, tileTypes, props, assetPath: './assets' },
  dungeon: { level: dungeon, tileTypes: dungeonTileTypes, props: {}, assetPath: './dungeon/assets' },
};
