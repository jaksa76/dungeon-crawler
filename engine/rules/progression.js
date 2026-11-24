// Experience and levels, as plain numbers. The engine gives a default curve; a campaign retunes it with `progression`:
//
//   progression: { xpToLevel(n) -> total xp needed to be level n, pointsPerLevel, maxLevel, xpPerCr(cr) }
//
// Level 1 needs no experience. The hero's level is always worked out from the experience they have, so the only thing a
// save holds is the experience and the points spent (rules/combat.js): change the curve and old heroes follow it.
// What a creature is worth: its own `xp` if its stat block says so, else a tenth of the tabletop's experience for its
// challenge rating (a giant rat 3, a goblin 5, an orc 10, an ogre 45, a troll 180).

// The tabletop's experience by challenge rating, 1/8 up to 30.
const TABLETOP_XP = [[0, 10], [1 / 8, 25], [1 / 4, 50], [1 / 2, 100], [1, 200], [2, 450], [3, 700], [4, 1100], [5, 1800], [6, 2300],
  [7, 2900], [8, 3900], [9, 5000], [10, 5900], [13, 10000], [17, 18000], [20, 25000], [30, 155000]];

export function xpForCr(cr) {
  let value = TABLETOP_XP[0][1];
  for (const [at, xp] of TABLETOP_XP) if (cr >= at) value = xp;
  return Math.max(1, Math.round(value / 10));
}

// The default curve: level n needs 10 x n x (n - 1) in all (20, 60, 120, 200, 300, ...).
export const DEFAULT_PROGRESSION = {
  xpToLevel: n => 10 * n * (n - 1),
  pointsPerLevel: 2,
  maxLevel: 20,
};

export function resolveProgression(options = {}) {
  const progression = { ...DEFAULT_PROGRESSION, ...options };
  if (!(progression.maxLevel >= 1)) throw new Error('progression: maxLevel must be at least 1');
  if (!(progression.pointsPerLevel >= 0)) throw new Error('progression: pointsPerLevel cannot be negative');
  for (let n = 2; n <= progression.maxLevel; n++) {
    if (!(progression.xpToLevel(n) > progression.xpToLevel(n - 1))) throw new Error(`progression: level ${n} must need more experience than level ${n - 1}`);
  }
  return progression;
}

// The level an amount of experience makes.
export function levelFor(xp, progression = DEFAULT_PROGRESSION) {
  let level = 1;
  while (level < progression.maxLevel && xp >= progression.xpToLevel(level + 1)) level++;
  return level;
}

// How far through the current level: { level, xp, from, to, fraction }. At the top level `to` is null.
export function progress(xp, progression = DEFAULT_PROGRESSION) {
  const level = levelFor(xp, progression), from = progression.xpToLevel(level);
  if (level >= progression.maxLevel) return { level, xp, from, to: null, fraction: 1 };
  const to = progression.xpToLevel(level + 1);
  return { level, xp, from, to, fraction: (xp - from) / (to - from) };
}
