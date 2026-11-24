// The creature book. Each creature is a D&D 5e stat block: cr, hp, ac and dmg (average damage per round). Its game
// stats follow from those numbers (engine/rules/stats.js), so how dangerous it is follows the tabletop game.
// `verb` is what it does when it hits. `h` and `w` are the sprite's world size in tiles (w comes from
// tools/monster-art.mjs slice), `speed` is steps per tick, `tempo` ('quick' or 'heavy') how fast it animates.
// Art: engine/assets/monsters/<id>/.
//
// Magic (content/magic.js): `resist` maps a kind of magic to a multiplier on the damage it does (under 1 resists, over 1 is
// weak, 0 is immune), `immune` lists kinds of magic and effects the creature cannot be touched by, and `onHit` is an effect
// its blows may put on the hero. The dead do not burn, freeze or sicken; the cold-blooded slow in the cold; a troll
// does not mend a burn.
export const monsters = {
  rat:      { name: 'giant rat', verb: 'gnaws', cr: 1 / 8, hp: 7,  ac: 12, dmg: 4,  h: .35, w: .39, speed: 1.4, attackMs: 1200, tempo: 'quick' },
  kobold:   { name: 'kobold',    verb: 'stabs', cr: 1 / 8, hp: 5,  ac: 12, dmg: 5,  h: .7,  w: .29, tempo: 'quick' },
  goblin:   { name: 'goblin',    verb: 'slashes', cr: 1 / 4, hp: 7,  ac: 15, dmg: 5,  h: .75, w: .42 },
  skeleton: { name: 'skeleton',  verb: 'cuts',  cr: 1 / 4, hp: 13, ac: 13, dmg: 5,  h: .95, w: .35, resist: { frost: 0.5, holy: 1.5 }, immune: ['poison'] },
  zombie:   { name: 'zombie',    verb: 'claws', cr: 1 / 4, hp: 22, ac: 8,  dmg: 5,  h: .95, w: .39, speed: .6, resist: { fire: 1.5, frost: 0.5, holy: 1.5 }, immune: ['poison'] },
  orc:      { name: 'orc',       verb: 'chops', cr: 1 / 2, hp: 15, ac: 13, dmg: 10, h: 1,   w: .42 },
  spider:   { name: 'giant spider', verb: 'bites', cr: 1, hp: 26, ac: 14, dmg: 9,  h: .6,  w: .93, tempo: 'quick', resist: { fire: 1.25 }, immune: ['poison'], onHit: { effect: 'poisoned', tier: 1, chance: 0.5 } },
  ghoul:    { name: 'ghoul',     verb: 'rakes', cr: 1,     hp: 22, ac: 12, dmg: 9,  h: .9,  w: .39, resist: { holy: 1.5 }, immune: ['poison'], onHit: { effect: 'stunned', tier: 1, chance: 0.15 } },
  ogre:     { name: 'ogre',      verb: 'clubs', cr: 2,     hp: 59, ac: 11, dmg: 13, h: 1.3, w: .54, tempo: 'heavy', resist: { shock: 0.75 } },
  owlbear:  { name: 'owlbear',   verb: 'mauls', cr: 3,     hp: 59, ac: 13, dmg: 21, h: 1.25, w: .51, tempo: 'heavy' },
  troll:    { name: 'troll',     verb: 'rends', cr: 5,     hp: 84, ac: 15, dmg: 24, h: 1.4, w: .63, tempo: 'heavy', resist: { fire: 1.5 } },
};
