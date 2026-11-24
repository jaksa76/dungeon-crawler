// Loot that is worked out when a creature dies or a container is first opened, instead of read from a fixed list.
//
// Every item has a `value` (what it is worth); every dying creature has a *budget* (how much value it may leave behind),
// and the generator spends it on items from a pool. The budget is the balancing lever: value per creature and per level is
// declared in data, and the bot reports (docs/engine/bots.md) say how much loot a run really found.
//
//   budget = base + perCr x cr          (a creature's `loot.budget` replaces this)
//          x the level's `lootScale`    (the dungeon level: deeper levels pay more)
//          x (1 + perHeroLevel x (hero level - 1))
//          x (1 + perLuck x luck)       (the hero's luck: rings and amulets with `bonus: { luck }`)
//          x a roll between 1 - spread and 1 + spread
//
// The pool is every item with a `value` and no `drop: false`. An item's `drop` may be a number (its weight, default 1) or
// { weight?, minLevel?, maxLevel? }: the hero's level must be within them (so steel waits for level 3). Anything that costs
// more than what is left is out. Stackable items drop one at a time. `dropChance` is the chance a creature leaves anything.
import { DEFAULT_LOOT_BUDGET } from './loot-defaults.js';

const clamp01 = n => Math.min(1, Math.max(0, n));

export function resolveLootRules(options = {}) { return { ...DEFAULT_LOOT_BUDGET, ...options }; }

// What the creature or container may leave. `source`: { cr?, loot? } (a creature's stat block, with its own `loot.budget`
// when it has one) or { budget }. `ctx`: { rules, lootScale, heroLevel, luck, random }.
export function lootBudget(source, { rules = DEFAULT_LOOT_BUDGET, lootScale = 1, heroLevel = 1, luck = 0, random = Math.random } = {}) {
  const base = source.budget ?? source.loot?.budget ?? source.generate?.budget ?? rules.base + rules.perCr * (source.cr ?? 0);
  const roll = 1 - rules.spread + 2 * rules.spread * random();
  return base * lootScale * (1 + rules.perHeroLevel * (heroLevel - 1)) * (1 + rules.perLuck * luck) * roll;
}

// The items that may drop for a hero of this level: [{ id, value, weight }].
export function lootPool(items, heroLevel = 1, filter = null) {
  const pool = [];
  for (const [id, def] of Object.entries(items)) {
    if (!(def.value > 0) || def.drop === false) continue;
    const drop = typeof def.drop === 'number' ? { weight: def.drop } : def.drop ?? {};
    if (heroLevel < (drop.minLevel ?? 1) || heroLevel > (drop.maxLevel ?? Infinity)) continue;
    if (filter && !filter(id, def)) continue;
    pool.push({ id, value: def.value, weight: drop.weight ?? 1 });
  }
  return pool;
}

// Spend `budget` on the pool: each pick is by weight x value among what is still affordable. Returns [{ item, qty }] (merged).
// `maxItems` and `chance` (`dropChance`) come from the rules.
export function generateLoot(budget, pool, { rules = DEFAULT_LOOT_BUDGET, random = Math.random, chance = rules.dropChance } = {}) {
  if (random() >= clamp01(chance)) return [];
  const found = new Map();
  let left = budget, count = 0;
  while (count < rules.maxItems) {
    const affordable = pool.filter(entry => entry.value <= left);
    if (!affordable.length) break;
    // Worth counts: of what fits, the dearer item is likelier, so a budget buys something worth having, not scraps.
    const chance = entry => entry.weight * entry.value;
    let pick = random() * affordable.reduce((sum, entry) => sum + chance(entry), 0), chosen = affordable[affordable.length - 1];
    for (const entry of affordable) { pick -= chance(entry); if (pick < 0) { chosen = entry; break; } }
    found.set(chosen.id, (found.get(chosen.id) ?? 0) + 1);
    left -= chosen.value; count++;
  }
  return [...found].map(([item, qty]) => ({ item, qty }));
}
