// The rules of a fight, as plain numbers. No DOM, no clock: callers pass the random source.

import { resolveProgression, levelFor, progress } from './progression.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// What the hero fights with when no weapon is worn. A campaign may give the hero other fists (`unarmed`).
export const FISTS = { name: 'fists', damage: [1, 3], speed: 600, damageType: null };

// Attributes and what is worn -> what a fight uses. `gear` is what equipment.gear() adds up: { weapon, defence, resist,
// bonus }. A weapon is an item with `damage: [min, max]`, `speed` (ms between blows) and `damageType`; strength adds to
// both ends of the range. `resist` maps a damage type to a multiplier on the damage the hero takes (0.8: a fifth less).
// `attack` is the middle of the damage range, for screens that show one number.
export function deriveStats(attrs, { weapon = FISTS, defence = 0, resist = {}, bonus = {} } = {}) {
  const { strength, vitality, intellect, agility } = attrs;
  const might = strength - 2 + (bonus.attack ?? 0), [lo, hi] = weapon.damage ?? FISTS.damage;
  const damage = [Math.max(1, lo + might), Math.max(1, hi + might)];
  return {
    maxHp: 28 + vitality * 5,
    maxMp: 4 + intellect * 5,
    attack: Math.round((damage[0] + damage[1]) / 2),
    damage, damageType: weapon.damageType ?? null, attackMs: weapon.speed ?? FISTS.speed,
    defence: Math.floor(agility / 2) + defence + (bonus.defence ?? 0),
    resist: { ...resist },
    accuracy: agility,
    evasion: agility,
    luck: bonus.luck ?? 0,
    // Magic: how much a spell gains (intellect above 4); what an enchanted weapon adds ({ type, damage: [min, max] }) and the
    // status effect it puts on a creature it hits ({ effect, tier, chance }).
    spellPower: Math.max(0, intellect - 4),
    elemental: weapon.elemental ?? null,
    onHit: weapon.onHit ?? null,
  };
}

const HERO_STATS = ['maxHp', 'maxMp', 'attack', 'damage', 'damageType', 'attackMs', 'defence', 'resist', 'accuracy', 'evasion', 'luck', 'spellPower', 'elemental', 'onHit'];

// The hero: attributes, current hp/mp, and stats that follow what is worn. `equipment` is optional.
// The returned object is what the HUD reads (hp, maxHp, mp, maxMp).
// `base` are the attributes the game starts a hero with; the player may spend points on top (build()), and
// only those points are saved, so retuning the base also reaches existing heroes.
export function createCharacter(base, equipment = null, { unarmed = FISTS, name = 'Hero', progression: rules, modifiers = () => ({}) } = {}) {
  const progression = resolveProgression(rules), attrs = { ...base }, spent = Object.fromEntries(Object.keys(base).map(k => [k, 0]));
  // Experience, and the points the hero put into attributes as they levelled (`grown`, apart from the `spent` at creation).
  let xp = 0;
  const grown = Object.fromEntries(Object.keys(base).map(k => [k, 0]));
  const grownTotal = () => Object.values(grown).reduce((a, b) => a + b, 0);
  const earned = () => (levelFor(xp, progression) - 1) * progression.pointsPerLevel;
  const raise = () => { for (const k of Object.keys(base)) attrs[k] = base[k] + spent[k] + grown[k]; };
  // The hero's stats with `gear` (equipment.gear(), possibly of a preview()); what is worn now by default.
  // `modifiers()` is what status effects add right now: { attack, defence, slow } (slow: a share off the swing speed).
  const statsWith = (gear = {}) => {
    const m = modifiers(), bonus = { ...gear.bonus, attack: (gear.bonus?.attack ?? 0) + (m.attack ?? 0), defence: (gear.bonus?.defence ?? 0) + (m.defence ?? 0) };
    const stats = deriveStats(attrs, { ...gear, bonus, weapon: gear.weapon ?? unarmed });
    if (m.slow) stats.attackMs = Math.round(stats.attackMs / (1 - m.slow));
    return stats;
  };
  const stats = () => statsWith(equipment?.gear());
  const hero = {
    attrs, name, base, spent, unarmed,
    // Set the points spent per attribute ({ strength: 2 }); anything that is not a whole number >= 0 counts as 0.
    build(points = {}) {
      for (const k of Object.keys(base)) { const n = points[k]; spent[k] = Number.isInteger(n) && n > 0 ? n : 0; }
      raise();
    },
    progression,
    get xp() { return xp; },
    get level() { return levelFor(xp, progression); },
    // Skill points not yet put into an attribute.
    get unspent() { return earned() - grownTotal(); },
    // Where the hero stands on the way to the next level: { level, xp, from, to, fraction }.
    get progress() { return progress(xp, progression); },
    // Experience gained. Returns the levels gained ({ levels, level, points }); each level that comes fills health and mana.
    gain(amount) {
      const before = levelFor(xp, progression);
      xp += Math.max(0, Math.round(amount) || 0);
      const level = levelFor(xp, progression), levels = level - before;
      if (levels > 0) hero.restore();
      return { levels, level, points: levels * progression.pointsPerLevel };
    },
    // Put one skill point into an attribute. Returns whether it was spent.
    spend(key) {
      if (!(key in grown) || hero.unspent <= 0) return false;
      grown[key]++; raise(); return true;
    },
    stats, statsWith,
    hp: 0, mp: 0,
    get alive() { return hero.hp > 0; },
    restore() { hero.hp = hero.maxHp; hero.mp = hero.maxMp; },
    // As a persistence section: the name, the points spent, and current hp and mp. Never the attributes or anything
    // derived from them, so retuning the game's numbers also reaches existing saves. Loads after the equipment,
    // because the limits depend on it.
    persistence: {
      id: 'hero', after: ['equipment'],
      save: () => ({ name: hero.name, spent: { ...spent }, xp, grown: { ...grown }, hp: hero.hp, mp: hero.mp }),
      load(data) {
        hero.name = typeof data?.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 24) : name;
        hero.build(data?.spent ?? {});
        xp = Number.isFinite(data?.xp) && data.xp > 0 ? Math.round(data.xp) : 0;
        // Points put into attributes while levelling, never more than the level has earned (the curve may have changed).
        let room = earned();
        for (const k of Object.keys(grown)) { const n = Number.isInteger(data?.grown?.[k]) && data.grown[k] > 0 ? Math.min(data.grown[k], room) : 0; grown[k] = n; room -= n; }
        raise();
        const clamp = (v, max) => Math.min(max, Math.max(0, Number.isFinite(v) ? Math.round(v) : max));
        hero.hp = clamp(data?.hp, hero.maxHp); hero.mp = clamp(data?.mp, hero.maxMp);
        if (hero.hp === 0) hero.hp = hero.maxHp; // a save is never a corpse
      },
      reset() { hero.name = name; xp = 0; for (const k of Object.keys(grown)) grown[k] = 0; hero.build(); hero.restore(); },
    },
  };
  for (const key of HERO_STATS) Object.defineProperty(hero, key, { get: () => stats()[key], enumerable: true });
  hero.restore();
  return hero;
}

// What changes between two sets of the hero's stats (deriveStats), in words: ['damage 4–7 → 6–9 blunt', 'slower',
// 'defence 2 → 4', 'blade damage taken ×0.8']. Empty when nothing a fight uses changes. `damageTypes` names the types.
export function compareStats(before, after, damageTypes = {}, effects = {}) {
  const typeName = t => (t && damageTypes[t]?.name) ?? t ?? '';
  const range = s => `${s.damage[0]}–${s.damage[1]}${s.damageType ? ` ${typeName(s.damageType)}` : ''}`;
  const changes = [];
  if (range(before) !== range(after)) changes.push(`damage ${range(before)} → ${range(after)}`);
  if (after.attackMs !== before.attackMs) changes.push(after.attackMs < before.attackMs ? 'faster' : 'slower');
  if (after.defence !== before.defence) changes.push(`defence ${before.defence} → ${after.defence}`);
  for (const type of new Set([...Object.keys(before.resist), ...Object.keys(after.resist)])) {
    const was = before.resist[type] ?? 1, now = after.resist[type] ?? 1;
    if (Math.abs(was - now) > 1e-9) changes.push(`${typeName(type)} damage taken ×${+was.toFixed(2)} → ×${+now.toFixed(2)}`);
  }
  changes.push(...enchantChanges(before, after, typeName, effects));
  return changes;
}

// What a weapon's enchantment adds or takes away, in words: '+2–4 fire damage', 'burning on hit'.
function enchantChanges(before, after, typeName, effects) {
  const changes = [], range = s => (s.elemental ? `${s.elemental.damage[0]}–${s.elemental.damage[1]} ${typeName(s.elemental.type)}` : '');
  if (range(before) !== range(after)) changes.push(after.elemental ? `+${range(after)} damage` : `no more +${range(before)} damage`);
  const hit = s => s.onHit?.effect ?? '', name = id => (effects[id]?.name ?? id).toLowerCase();
  if (hit(before) !== hit(after)) changes.push(after.onHit ? `${name(after.onHit.effect)} on hit` : `no ${name(before.onHit.effect)} on hit`);
  return changes;
}

// The same, short, for a tight space: ['+3 damage', 'slower', '+2 defence', 'less blade damage taken'].
export function statDelta(before, after, damageTypes = {}, effects = {}) {
  const typeName = t => damageTypes[t]?.name ?? t, signed = n => `${n > 0 ? '+' : ''}${n}`;
  const changes = [];
  if (after.attack !== before.attack) changes.push(`${signed(after.attack - before.attack)} damage`);
  if (after.attackMs !== before.attackMs) changes.push(after.attackMs < before.attackMs ? 'faster' : 'slower');
  if (after.defence !== before.defence) changes.push(`${signed(after.defence - before.defence)} defence`);
  for (const type of new Set([...Object.keys(before.resist), ...Object.keys(after.resist)])) {
    const was = before.resist[type] ?? 1, now = after.resist[type] ?? 1;
    if (Math.abs(was - now) > 1e-9) changes.push(`${now < was ? 'less' : 'more'} ${typeName(type)} damage taken`);
  }
  changes.push(...enchantChanges(before, after, typeName, effects));
  return changes;
}

// Chance that a blow lands: 75% when level, 4 points per point of accuracy over evasion, never below 20% or above 95%.
export const hitChance = (accuracy, evasion) => clamp(0.75 + 0.04 * (accuracy - evasion), 0.2, 0.95);

// One blow from `attacker` at `defender` { defence, evasion, resist? }. Returns { hit, damage, resisted }.
// The hero (an attacker with `damage: [min, max]`) rolls a whole number in that range; a creature (with a number
// `attack`) does attack +-20%. The defender's `resist[attacker.damageType]` multiplies that (default 1), then its
// defence comes off; a hit always does at least 1. `resisted` is that multiplier.
export function strike(attacker, defender, random = Math.random) {
  if (random() >= hitChance(attacker.accuracy ?? 0, defender.evasion ?? 0)) return { hit: false, damage: 0, resisted: 1 };
  const raw = Array.isArray(attacker.damage)
    ? attacker.damage[0] + Math.floor(random() * (attacker.damage[1] - attacker.damage[0] + 1))
    : attacker.attack * (0.8 + 0.4 * random());
  const resisted = (attacker.damageType && defender.resist?.[attacker.damageType]) ?? 1;
  return { hit: true, damage: Math.max(1, Math.round(raw * resisted) - (defender.defence ?? 0)), resisted };
}

// A cooldown: ready() says whether the next action may start; use(now, ms?) starts the wait (`ms` by default).
export function createCooldown(ms) {
  let readyAt = 0;
  return { ready: now => now >= readyAt, use(now, wait = ms) { readyAt = now + wait; }, reset() { readyAt = 0; }, get ms() { return ms; } };
}
