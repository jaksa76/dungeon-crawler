// Ravensmoor's own creatures, in the same stat block format as the engine's bestiary (engine/content/bestiary.js).
// Art: games/ravensmoor/assets/monsters/<id>/. The snake's art is shaded by hand for distance, so the dungeon's fog
// is not added on top (`distanceShaded`). See docs/ravensmoor/snake.md.
//
// Every creature also gets the damage type of its blows and its resistances (arms.js): `resist` multiplies the damage
// it takes of that type. Bare bones shrug off cuts and stabs but shatter under a mace; the dead are hacked apart but a
// spear goes through them; a spider's body crushes.
export const monsters = {
  snake: { name: 'snake', verb: 'bites', cr: 1 / 4, hp: 11, ac: 14, dmg: 7.5, h: .9, w: .4, distanceShaded: true,
    damageType: 'pierce', resist: { blunt: 0.75 } },
  rat: { damageType: 'pierce' },
  kobold: { damageType: 'pierce' },
  goblin: { damageType: 'blade' },
  skeleton: { damageType: 'blade', resist: { blade: 0.5, pierce: 0.5, blunt: 1.5 } },
  zombie: { damageType: 'blunt', resist: { pierce: 0.5, blade: 1.25 } },
  orc: { damageType: 'blade' },
  spider: { damageType: 'pierce', resist: { blunt: 1.25 } },
  ghoul: { damageType: 'blade', resist: { pierce: 0.75 } },
  ogre: { damageType: 'blunt' },
  owlbear: { damageType: 'blade' },
  troll: { damageType: 'blade', resist: { blunt: 0.75 } },
};
