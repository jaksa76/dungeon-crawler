// The rules of a fight, as plain numbers. No DOM, no clock: callers pass the random source.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Attributes -> what a fight uses. `bonus` is the total of the worn items' bonuses ({ attack, defence }).
export function deriveStats(attrs, bonus = {}) {
  const { strength, vitality, intellect, agility } = attrs;
  return {
    maxHp: 28 + vitality * 5,
    maxMp: 4 + intellect * 5,
    attack: 2 + strength + (bonus.attack ?? 0),
    defence: Math.floor(agility / 2) + (bonus.defence ?? 0),
    accuracy: agility,
    evasion: agility,
  };
}

// The hero: attributes, current hp/mp, and stats that follow what is worn. `equipment` is optional.
// The returned object is what the HUD reads (hp, maxHp, mp, maxMp).
export function createCharacter(attrs, equipment = null, { attackMs = 700 } = {}) {
  const stats = () => deriveStats(attrs, equipment?.bonuses() ?? {});
  const hero = {
    attrs, attackMs,
    get maxHp() { return stats().maxHp; }, get maxMp() { return stats().maxMp; },
    get attack() { return stats().attack; }, get defence() { return stats().defence; },
    get accuracy() { return stats().accuracy; }, get evasion() { return stats().evasion; },
    hp: 0, mp: 0,
    get alive() { return hero.hp > 0; },
    restore() { hero.hp = hero.maxHp; hero.mp = hero.maxMp; },
  };
  hero.restore();
  return hero;
}

// Chance that a blow lands: 75% when level, 4 points per point of accuracy over evasion, never below 20% or above 95%.
export const hitChance = (accuracy, evasion) => clamp(0.75 + 0.04 * (accuracy - evasion), 0.2, 0.95);

// One blow from `attacker` { attack, accuracy } at `defender` { defence, evasion }.
// Returns { hit, damage }. A hit does attack +-20%, less the defence, and always at least 1.
export function strike(attacker, defender, random = Math.random) {
  if (random() >= hitChance(attacker.accuracy ?? 0, defender.evasion ?? 0)) return { hit: false, damage: 0 };
  const damage = Math.max(1, Math.round(attacker.attack * (0.8 + 0.4 * random())) - (defender.defence ?? 0));
  return { hit: true, damage };
}

// A cooldown: ready() says whether the next action may start; use(now) starts the wait.
export function createCooldown(ms) {
  let readyAt = 0;
  return { ready: now => now >= readyAt, use(now) { readyAt = now + ms; }, reset() { readyAt = 0; }, get ms() { return ms; } };
}
