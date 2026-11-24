// The engine's default loot budget rules (see generate-loot.js). A campaign overrides any of them with `loot`.
export const DEFAULT_LOOT_BUDGET = {
  base: 6,           // value every creature may leave, whatever its rating
  perCr: 40,         // plus this much per point of challenge rating (a troll, 5, leaves about 200)
  spread: 0.5,       // the budget is rolled between 50% and 150%
  dropChance: 0.6,   // the chance a creature leaves anything at all
  maxItems: 3,       // most items from one creature
  perHeroLevel: 0.1, // 10% more per hero level above the first
  perLuck: 0.15,     // 15% more per point of luck
};
