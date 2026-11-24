// A campaign level names things by id; the content books say what they are. A level:
//
//   name, shortName, journal     what the player reads
//   environment                  an environments id: the floor and sky (or darkness) around it
//   legend                       map character -> 'floor' or a buildings id
//   tiles                        rows of map characters; x grows east, z grows south, north is -z
//   start                        { x, z, dir } (dir: 0 N, 1 E, 2 S, 3 W)
//   entities                     [{ prop | npc, x, z, side, id?, name?, behavior? }]: things standing against one
//                                side of a tile (N, E, S or W), at most one per side. A behavior here wins over the
//                                book's default for that prop or NPC.
//   monsters                     [{ monster, x, z, dir, id?, sight? }]: creatures from the bestiary
//   exits                        [{ x, z, dir, to, spawn?, message? }]: stepping forward there leads to level `to`
//   atmosphere, exploration      override the environment's
//   monsterStepMs, monsterGraceMs, view
//
// resolveLevel turns it into what the engine draws and simulates: the level with creatures' stats worked out, a
// tile type per map character and the props (and NPCs) it uses, each with its art folder.
import { createMonster } from '../rules/stats.js';

export function resolveLevel(id, def, content) {
  const label = `level "${id}"`;
  const environment = content.environments[def.environment];
  if (!environment) throw new Error(`${label}: unknown environment "${def.environment}"`);
  const tileTypes = {};
  for (const [char, what] of Object.entries(def.legend ?? {})) {
    if (what === 'floor') { tileTypes[char] = { floor: true }; continue; }
    const building = content.buildings[what];
    if (!building) throw new Error(`${label}: legend "${char}" names an unknown building "${what}"`);
    tileTypes[char] = { wall: true, art: building.art, assets: building.assets, building: what };
  }
  for (const row of def.tiles) for (const char of row) if (!tileTypes[char]) throw new Error(`${label}: map character "${char}" is not in the legend`);
  const props = {};
  const entities = (def.entities ?? []).map(entity => {
    const { prop, npc, ...rest } = entity;
    if (!prop === !npc) throw new Error(`${label}: ${entity.name ?? 'an entity'} at (${entity.x},${entity.z}) needs one of prop or npc`);
    const book = prop ? content.props : content.npcs, key = prop ?? npc;
    if (!book[key]) throw new Error(`${label}: unknown ${prop ? 'prop' : 'NPC'} "${key}"`);
    props[key] ??= { ...book[key], category: prop ? 'prop' : 'npc' };
    return { ...rest, prop: key };
  });
  const monsters = (def.monsters ?? []).map(({ monster, ...at }) => createMonster(content.monsters, monster, at));
  const level = {
    ...def, entities, monsters,
    atmosphere: def.atmosphere ?? environment.atmosphere,
    exploration: def.exploration ?? environment.exploration,
  };
  return { level, tileTypes, props, environment: { ...environment, backdrop: !!environment.backdrop && !level.atmosphere } };
}
