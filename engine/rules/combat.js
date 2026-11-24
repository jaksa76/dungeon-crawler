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
// `base` are the attributes the game starts a hero with; the player may spend points on top (build()), and
// only those points are saved, so retuning the base also reaches existing heroes.
export function createCharacter(base, equipment = null, { attackMs = 700, name = 'Hero' } = {}) {
  const attrs = { ...base }, spent = Object.fromEntries(Object.keys(base).map(k => [k, 0]));
  const stats = () => deriveStats(attrs, equipment?.bonuses() ?? {});
  const hero = {
    attrs, attackMs, name, base, spent,
    // Set the points spent per attribute ({ strength: 2 }); anything that is not a whole number >= 0 counts as 0.
    build(points = {}) {
      for (const k of Object.keys(base)) { const n = points[k]; spent[k] = Number.isInteger(n) && n > 0 ? n : 0; attrs[k] = base[k] + spent[k]; }
    },
    get maxHp() { return stats().maxHp; }, get maxMp() { return stats().maxMp; },
    get attack() { return stats().attack; }, get defence() { return stats().defence; },
    get accuracy() { return stats().accuracy; }, get evasion() { return stats().evasion; },
    hp: 0, mp: 0,
    get alive() { return hero.hp > 0; },
    restore() { hero.hp = hero.maxHp; hero.mp = hero.maxMp; },
    // As a persistence section: the name, the points spent, and current hp and mp. Never the attributes or anything
    // derived from them, so retuning the game's numbers also reaches existing saves. Loads after the equipment,
    // because the limits depend on it.
    persistence: {
      id: 'hero', after: ['equipment'],
      save: () => ({ name: hero.name, spent: { ...spent }, hp: hero.hp, mp: hero.mp }),
      load(data) {
        hero.name = typeof data?.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 24) : name;
        hero.build(data?.spent ?? {});
        const clamp = (v, max) => Math.min(max, Math.max(0, Number.isFinite(v) ? Math.round(v) : max));
        hero.hp = clamp(data?.hp, hero.maxHp); hero.mp = clamp(data?.mp, hero.maxMp);
        if (hero.hp === 0) hero.hp = hero.maxHp; // a save is never a corpse
      },
      reset() { hero.name = name; hero.build(); hero.restore(); },
    },
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
