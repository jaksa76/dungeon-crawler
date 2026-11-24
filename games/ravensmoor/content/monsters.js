// Ravensmoor's own creatures, in the same stat block format as the engine's bestiary (engine/content/bestiary.js).
// Art: games/ravensmoor/assets/monsters/<id>/. The snake's art is shaded by hand for distance, so the dungeon's fog
// is not added on top (`distanceShaded`). See docs/ravensmoor/snake.md.
export const monsters = {
  snake: { name: 'snake', verb: 'bites', cr: 1 / 4, hp: 11, ac: 14, dmg: 7.5, h: .9, w: .4, distanceShaded: true },
};
