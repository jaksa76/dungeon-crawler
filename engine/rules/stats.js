// From a creature book stat block (D&D 5e numbers) to the creature's game stats:
//   hp       = D&D hit points x 2.7      (a snake: 11 -> 30)
//   damage   = D&D damage per round x 1.6 (a snake: 7.5 -> 12)
//   evasion  = AC - 9                    (the hero's evasion is his agility, 5)
//   accuracy = 3 + 2 x sqrt(CR)
//   defence  = floor(AC / 8) - 1, at least 0
import { xpForCr } from './progression.js';

export const HP_SCALE = 2.7, DAMAGE_SCALE = 1.6;

export function monsterStats({ cr, hp, ac, dmg }) {
  return {
    cr, hp: Math.round(hp * HP_SCALE), damage: Math.round(dmg * DAMAGE_SCALE),
    evasion: Math.max(0, ac - 9), accuracy: Math.round(3 + 2 * Math.sqrt(cr)), defence: Math.max(0, Math.floor(ac / 8) - 1),
  };
}

// How fast a creature's combat clips play: the art is laid out the same for every creature (render/monster-animation.js),
// the timing follows its `tempo`.
export function animationTimings(tempo) {
  const heavy = tempo === 'heavy', quick = tempo === 'quick';
  return {
    idle: { frames: 2, frameMs: heavy ? 500 : 360, loop: true },
    move: { frames: 4, frameMs: heavy ? 150 : quick ? 85 : 110 },
    attack: { frames: 4, frameMs: heavy ? 180 : quick ? 100 : 140, impactFrame: 2 },
    hurt: { frames: 2, frameMs: 110 },
    dead: { frames: 4, frameMs: heavy ? 180 : 140, holdMs: heavy ? 1100 : 900 },
  };
}

// What a creature is worth in experience: its `xp` if the book says so, else by challenge rating (rules/progression.js).

// A creature of `kind` from the book, placed with `at` ({ id?, x, z, dir, sight? }).
export function createMonster(book, kind, at = {}) {
  const block = book[kind];
  if (!block) throw new Error(`Unknown monster "${kind}"`);
  const { cr, hp, ac, dmg, tempo, id: _id, ...rest } = block;
  return { sight: 4, attackMs: 1500, speed: 1, animations: animationTimings(tempo), ...rest, ...at, kind, ...monsterStats(block), xp: block.xp ?? xpForCr(cr) };
}
