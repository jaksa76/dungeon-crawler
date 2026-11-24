// A campaign level names things by id; the content books say what they are. A level:
//
//   name, shortName, journal     what the player reads
//   environment                  an environments id: the floor and sky (or darkness) around it
//   legend                       map character -> 'floor' or a buildings id
//   tiles                        rows of map characters; x grows east, z grows south, north is -z
//   start                        { x, z, dir } (dir: 0 N, 1 E, 2 S, 3 W)
//   entities                     [{ prop | npc, x, z, side, id?, name?, behavior?, state?, <methods> }]: things standing
//                                against one side of a tile (N, E, S or W), at most one per side. A behaviour or method
//                                here wins over the book's for that prop or NPC.
//   doors                        [{ door, x, z, id?, state?, <methods> }]: doors on floor tiles
//   monsters                     [{ monster, x, z, dir, id?, sight?, state?, <methods> }]: creatures from the bestiary
//   traps                        [{ x, z, name, damage, type?, hint?, message? }]: hidden hazards on floor tiles
//   exits                        [{ x, z, dir, to, spawn?, message? }]: stepping forward there leads to level `to`
//                                or { x, z, dir, worldMap: true, message? } opens the campaign's world map
//   backdrop                     optional URL for a single painted horizon around the level
//   atmosphere, exploration      override the environment's
//   monsterStepMs, monsterGraceMs, view
//   lootScale                    multiplies what its creatures may leave behind (default 1; docs/engine/progression.md)
//   triggers                     [{ on: 'enterTile' | 'faceSide' | 'flagSet', x?, z?, side?, flag?, when?, effect }]
//   onEnter(game), onExit(game)  called when the player arrives on the level or leaves it
//
// Each placement becomes an instance of its definition when the level is first needed (engine/core/world.js), with
// its own `state` that is saved. An `id` lets code find it (game.find(level, id)) and keeps its saved state when the
// level is edited; without one it is known by where it stands.
//
// resolveLevel checks a level and returns what the engine needs: the level, a tile type per map character, the art
// of everything placed on it, and its environment.
import { checkBehavior } from '../rules/interaction.js';

const SIDES = 'NESW';

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
  const floorAt = (x, z) => tileTypes[def.tiles[z]?.[x]]?.floor === true;
  for (const trigger of def.triggers ?? []) {
    if (!['enterTile', 'faceSide', 'flagSet'].includes(trigger.on) || typeof trigger.effect !== 'function' ||
        trigger.when !== undefined && typeof trigger.when !== 'function') throw new Error(`${label}: invalid trigger`);
    if (trigger.side !== undefined && (trigger.on !== 'faceSide' || !/^[NESW]$/.test(trigger.side))) throw new Error(`${label}: invalid trigger side`);
    if (trigger.flag !== undefined && (trigger.on !== 'flagSet' || typeof trigger.flag !== 'string' || !trigger.flag)) throw new Error(`${label}: invalid trigger flag`);
    if ([trigger.x, trigger.z].some(coordinate => coordinate !== undefined && (trigger.on === 'flagSet' || !Number.isInteger(coordinate)))) {
      throw new Error(`${label}: invalid trigger coordinates`);
    }
  }
  const ids = new Set(), sides = new Set(), doorTiles = new Set();
  const uniqueId = (what, placeId) => {
    if (placeId === undefined) return;
    if (ids.has(placeId)) throw new Error(`${label}: ${what}: the id "${placeId}" is used twice`);
    ids.add(placeId);
  };

  const props = {}; // the art of every prop and NPC placed here, by id
  const entities = (def.entities ?? []).map(entity => {
    const { prop, npc, ...rest } = entity, where = `${entity.x},${entity.z}`;
    const name = entity.name ?? prop ?? npc ?? 'an entity';
    if (!prop === !npc) throw new Error(`${label}: ${name} at (${where}) needs one of prop or npc`);
    const book = prop ? content.props : content.npcs, key = prop ?? npc;
    if (!book[key]) throw new Error(`${label}: unknown ${prop ? 'prop' : 'NPC'} "${key}"`);
    if (!SIDES.includes(entity.side) || entity.side?.length !== 1) throw new Error(`${label}: ${name} at (${where}) needs a side: N, E, S or W`);
    if (!floorAt(entity.x, entity.z)) throw new Error(`${label}: ${name} at (${where}) is not on a floor tile`);
    if (sides.has(`${where},${entity.side}`)) throw new Error(`${label}: two things on the ${entity.side} side of tile (${where})`);
    sides.add(`${where},${entity.side}`);
    checkBehavior(entity.behavior ?? book[key].behavior, name);
    uniqueId(name, entity.id);
    props[key] ??= { ...book[key], category: prop ? 'prop' : 'npc' };
    return { ...rest, prop: key, category: prop ? 'prop' : 'npc' };
  });

  const doors = (def.doors ?? []).map(placement => {
    const where = `${placement.x},${placement.z}`, kind = content.doors[placement.door];
    if (!kind) throw new Error(`${label}: unknown door "${placement.door}"`);
    if (!floorAt(placement.x, placement.z)) throw new Error(`${label}: the door at (${where}) is not on a floor tile`);
    if (doorTiles.has(where)) throw new Error(`${label}: two doors at (${where})`);
    if (placement.x === def.start.x && placement.z === def.start.z) throw new Error(`${label}: a door cannot stand on the player's entrance`);
    doorTiles.add(where); uniqueId(`the door at (${where})`, placement.id);
    return placement;
  });
  for (const building of new Set((def.doors ?? []).map(d => content.doors[d.door].building))) {
    tileTypes[`door:${building}`] = { wall: true, art: content.buildings[building].art, assets: content.buildings[building].assets, building, door: true };
  }

  const monsters = (def.monsters ?? []).map((placement, i) => {
    if (!content.monsters[placement.monster]) throw new Error(`${label}: unknown monster "${placement.monster}"`);
    if (!floorAt(placement.x, placement.z)) throw new Error(`${label}: monster ${placement.id ?? i} must start on a floor tile`);
    uniqueId(`monster ${placement.id ?? i}`, placement.id);
    return placement;
  });

  const trapTiles = new Set();
  for (const trap of def.traps ?? []) {
    const at = `${trap.x},${trap.z}`;
    if (trapTiles.has(at) || !floorAt(trap.x, trap.z) || !trap.name || !Number.isInteger(trap.damage) || trap.damage < 1) {
      throw new Error(`${label}: invalid or duplicate trap at (${at})`);
    }
    trapTiles.add(at);
  }

  const level = {
    ...def, entities, doors, monsters,
    atmosphere: def.atmosphere ?? environment.atmosphere,
    exploration: def.exploration ?? environment.exploration,
  };
  return { level, tileTypes, props, environment: { ...environment, backdrop: !level.atmosphere && (def.backdrop ?? !!environment.backdrop) } };
}
