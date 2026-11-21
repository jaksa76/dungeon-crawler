// The Undercrypt's bestiary. Each creature is a D&D 5e stat block (cr, hp, ac, dmg = average damage per round),
// and its game stats are derived from those numbers, so how dangerous it is follows the tabletop game:
//   hp       = D&D hit points x 2.7      (the snake: 11 -> 30)
//   damage   = D&D damage per round x 1.6 (the snake: 7.5 -> 12)
//   evasion  = AC - 9                    (the hero's evasion is his agility, 5)
//   accuracy = 3 + 2 x sqrt(CR)
// `h` and `w` are the sprite's world size in tiles (w comes from tools/monster-art.mjs slice), `speed` is steps per tick.
const HP_SCALE = 2.7, DAMAGE_SCALE = 1.6;

const bestiary = {
  rat:      { name: 'giant rat', verb: 'gnaws', cr: 1 / 8, hp: 7,  ac: 12, dmg: 4,  h: .35, w: .39, speed: 1.4, attackMs: 1200 },
  kobold:   { name: 'kobold',    verb: 'stabs', cr: 1 / 8, hp: 5,  ac: 12, dmg: 5,  h: .7,  w: .29 },
  goblin:   { name: 'goblin',    verb: 'slashes', cr: 1 / 4, hp: 7,  ac: 15, dmg: 5,  h: .75, w: .42 },
  skeleton: { name: 'skeleton',  verb: 'cuts',  cr: 1 / 4, hp: 13, ac: 13, dmg: 5,  h: .95, w: .35 },
  zombie:   { name: 'zombie',    verb: 'claws', cr: 1 / 4, hp: 22, ac: 8,  dmg: 5,  h: .95, w: .39, speed: .6 },
  snake:    { name: 'snake',     verb: 'bites', cr: 1 / 4, hp: 11, ac: 14, dmg: 7.5, h: .9, w: .4, art: 'snake', distanceShaded: true },
  orc:      { name: 'orc',       verb: 'chops', cr: 1 / 2, hp: 15, ac: 13, dmg: 10, h: 1,   w: .42 },
  spider:   { name: 'giant spider', verb: 'bites', cr: 1, hp: 26, ac: 14, dmg: 9,  h: .6,  w: .93 },
  ghoul:    { name: 'ghoul',     verb: 'rakes', cr: 1,     hp: 22, ac: 12, dmg: 9,  h: .9,  w: .39 },
  ogre:     { name: 'ogre',      verb: 'clubs', cr: 2,     hp: 59, ac: 11, dmg: 13, h: 1.3, w: .54 },
  owlbear:  { name: 'owlbear',   verb: 'mauls', cr: 3,     hp: 59, ac: 13, dmg: 21, h: 1.25, w: .51 },
  troll:    { name: 'troll',     verb: 'rends', cr: 5,     hp: 84, ac: 15, dmg: 24, h: 1.4, w: .63 },
};

// The monster definition for `kind`, placed with `at` ({ id?, x, z, dir, sight? }).
export function monster(kind, at) {
  const b = bestiary[kind];
  if (!b) throw new Error(`Unknown monster "${kind}"`);
  const { cr, hp, ac, dmg, ...rest } = b;
  return {
    art: kind, sight: 4, attackMs: 1500, speed: 1, ...rest, ...at, kind, cr,
    hp: Math.round(hp * HP_SCALE), damage: Math.round(dmg * DAMAGE_SCALE),
    evasion: Math.max(0, ac - 9), accuracy: Math.round(3 + 2 * Math.sqrt(cr)), defence: Math.floor(ac / 8) - 1 > 0 ? Math.floor(ac / 8) - 1 : 0,
  };
}
export const bestiaryKinds = Object.keys(bestiary);
