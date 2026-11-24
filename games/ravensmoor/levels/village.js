// Ravensmoor's Old Quarter: a 3×3 square of open cells inside a ring of buildings. From the back row you look across
// two open cells and the far wall closes the view at depth 3. See engine/core/levels.js for the format.
export const village = {
  name: 'Ravensmoor, the Old Quarter',
  shortName: 'Old Quarter',
  journal: 'Explore Ravensmoor’s Old Quarter. The arched door in the eastern wall, beside the chest, leads to the Undercrypt. Face it and step forward to enter.',
  environment: 'town',
  legend: { '.': 'floor', H: 'house-a', J: 'house-b', D: 'house-door', A: 'shop-alchemist', B: 'shop-smith', '#': 'stone-wall' },
  tiles: [
    '#AHB#',
    'J..DH',
    'H...D',
    'D...J',
    '#J#H#',
  ],
  start: { x: 2, z: 3, dir: 0 },
  exits: [{ x: 3, z: 2, dir: 1, to: 'dungeon',
    message: 'The eastern door leads to the Undercrypt. Step forward to enter.' }],
  // Nothing blocks a tile: the player can walk onto a tile with an NPC and sees it only while facing its side.
  // Named entities show up on the minimap.
  entities: [
    { prop: 'stall', name: "the alchemist's stall", x: 2, z: 1, side: 'N',
      behavior: { type: 'examine', text: 'Dried herbs and corked vials crowd the alchemist’s stall.' } },
    { npc: 'guard', name: 'a town guard', x: 1, z: 1, side: 'N' },
    { id: 'start-chest', prop: 'chest', name: 'a chest', x: 3, z: 2, side: 'N', behavior: { type: 'open', title: 'Chest',
      text: 'The iron-banded chest is unlocked. Inside, packed in oilcloth, are supplies for a descent.',
      contents: [{ item: 'sword' }, { item: 'health-potion', qty: 2 }, { item: 'mana-potion' }, { item: 'torch' }] } },
    { npc: 'hooded', name: 'a hooded stranger', x: 3, z: 2, side: 'S' },
    { prop: 'lamppost', name: 'a lamp post', x: 1, z: 2, side: 'W' },
    { npc: 'villager', name: 'a villager', x: 1, z: 3, side: 'W' },
    { prop: 'crate', x: 1, z: 3, side: 'S' },
    { prop: 'well', name: 'the well', x: 2, z: 2, side: 'N', behavior: { type: 'open', title: 'The well',
      text: 'Moss clings to the old stones. Something glints on a ledge just below the rim, within reach.',
      contents: [{ item: 'crystal' }, { item: 'raven-amulet' }] } },
    { prop: 'barrel', name: 'a barrel', x: 2, z: 3, side: 'S' },
    { prop: 'barrel', x: 3, z: 3, side: 'E', behavior: { type: 'open', title: 'Barrel', text: 'Nothing but brine and fish bones.', contents: [] } },
  ],
};
