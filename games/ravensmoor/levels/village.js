import { alchemist } from '../content/merchants.js';
import { guardDialogue, villagerDialogue } from '../content/dialogues.js';
import { talkToStranger } from '../content/quests.js';

// Ravensmoor's Old Quarter: a 3×3 square of open cells inside a ring of buildings. From the back row you look across
// two open cells and the far wall closes the view at depth 3. See engine/core/levels.js for the format.
export const village = {
  name: 'Ravensmoor, the Old Quarter',
  shortName: 'Old Quarter',
  journal: 'Explore Ravensmoor’s Old Quarter. The eastern door beside the chest leads to the Undercrypt. The west gate leads to the roads of Ravensmoor.',
  environment: 'town',
  view: { maxDepth: 6 }, // see down the streets: rows beyond the painted three are made from them (engine/render/far-slots.js)
  sound: { track: new URL('../assets/music/old-quarter.mp3', import.meta.url).href, music: [55, 62, 64, null, 62, 59, 57, null], windTone: 460, windVolume: .07, interval: 1.7 },
  legend: { '.': 'floor', H: 'house-a', J: 'house-b', D: 'house-door', A: 'shop-alchemist', B: 'shop-smith', '#': 'stone-wall' },
  tiles: [
    '#AHB#',
    'D..DH',
    'H...D',
    'D...J',
    '#J#H#',
  ],
  start: { x: 2, z: 3, dir: 0 },
  exits: [
    { x: 3, z: 2, dir: 1, to: 'dungeon', message: 'The eastern door leads to the Undercrypt. Step forward to enter.' },
    { x: 1, z: 1, dir: 3, worldMap: true, message: 'The west gate opens onto the road. Step forward to view the world map.' },
  ],
  // Nothing blocks a tile: the player can walk onto a tile with an NPC and sees it only while facing its side.
  // Named entities show up on the minimap.
  entities: [
    { ...alchemist, x: 2, z: 1, side: 'N' },
    { npc: 'guard', name: 'a town guard', x: 1, z: 1, side: 'N', behavior: { type: 'talk', dialogue: guardDialogue } },
    { id: 'start-chest', prop: 'chest', name: 'a chest', x: 3, z: 2, side: 'N', behavior: { type: 'open', title: 'Chest',
      text: 'The iron-banded chest is unlocked. Inside, packed in oilcloth, are supplies for a descent.',
      contents: [{ item: 'rusty-sword' }, { item: 'health-potion', qty: 2 }, { item: 'mana-potion' }, { item: 'torch' }, { item: 'scroll-firebolt' }] } },
    // A placement can have its own methods and saved state: the stranger hands over the Raven horn once.
    { npc: 'hooded', name: 'a hooded stranger', x: 3, z: 2, side: 'S', state: { gaveHorn: false }, interact: talkToStranger },
    { prop: 'lamppost', name: 'a lamp post with a road sign', x: 1, z: 2, side: 'W',
      interact(game) {
        game.flags.set('ravensmoor:heard-of-market', true);
        game.say('A road sign points west to Greybridge. You mark the market village on your world map.');
      } },
    { npc: 'villager', name: 'a villager', x: 1, z: 3, side: 'W', behavior: { type: 'talk', dialogue: villagerDialogue } },
    { prop: 'crate', x: 1, z: 3, side: 'S', behavior: { type: 'open', title: 'Crate',
      text: 'The nails are loose. Under the straw, wrapped in oiled cloth, is an old shirt of mail.', contents: [{ item: 'rusty-mail' }] } },
    { prop: 'well', name: 'the well', x: 2, z: 2, side: 'N', behavior: { type: 'open', title: 'The well',
      text: 'Moss clings to the old stones. Something glints on a ledge just below the rim, within reach.',
      contents: [{ item: 'crystal' }, { item: 'raven-amulet' }] } },
    { prop: 'barrel', name: 'a barrel', x: 2, z: 3, side: 'S' },
    { prop: 'barrel', x: 3, z: 3, side: 'E', behavior: { type: 'open', title: 'Barrel', text: 'Nothing but brine and fish bones.', contents: [] } },
  ],
};
