// Spells, as plain numbers. A spell is data in the content book (`spells`); the session casts it (core/session.js).
//
//   firebolt: { name: 'Fire bolt', icon: 'spell', magicType: 'fire', cost: 6, cooldown: 1500,
//               target: 'foe', range: 3, damage: [8, 12], effect: { id: 'burning', tier: 1, chance: 0.5 },
//               requires: { level: 1 }, description: '...' }
//
//   magicType   a damage type the game declares (damageTypes, with `colour` and `magic: true`): creatures' and armour's
//               `resist` and `immune` for that type apply to the spell, as they do to a blow
//   cost        mana; cooldown ms before this spell may be cast again
//   target      'foe' the nearest creature in the line ahead (up to `range` tiles, never through a wall), 'area' every
//               creature in that line, 'self'
//   damage      [min, max] to a foe; `heal` [min, max] to the caster; both gain the caster's spell power (intellect above 4)
//   effect      { id, tier, chance? } a status effect (rules/effects.js) put on the foe, or on the caster for 'self'
//   requires    { level?, intellect? } the hero needs at least these to learn it
//
// Magic does not miss and ignores defence: what stops it is a resistance.

export const TARGETS = ['foe', 'area', 'self'];

export const spellRange = spell => ((spell.target ?? 'foe') === 'self' ? 0 : spell.range ?? 1);

const roll = ([lo, hi], random) => lo + Math.floor(random() * (hi - lo + 1));

// What a spell does to a creature `target` ({ resist?, immune? }): { damage, resisted, immune }. `power` is the caster's
// spell power. A resistance of 0 is immunity.
export function spellDamage(spell, target, power, random = Math.random) {
  if (!spell.damage) return { damage: 0, resisted: 1, immune: false };
  const resisted = target.resist?.[spell.magicType] ?? 1, immune = resisted === 0 || !!target.immune?.includes(spell.magicType);
  if (immune) return { damage: 0, resisted: 0, immune: true };
  return { damage: Math.max(1, Math.round((roll(spell.damage, random) + power) * resisted)), resisted, immune: false };
}

// Health a spell restores, with the caster's spell power.
export const spellHeal = (spell, power, random = Math.random) => (spell.heal ? roll(spell.heal, random) + power : 0);

// Can the hero learn it now? { ok, reason? } (reason in words).
export function canLearn(spell, hero) {
  const need = spell.requires ?? {};
  if (need.level && hero.level < need.level) return { ok: false, reason: `You must be level ${need.level} to learn ${spell.name}.` };
  if (need.intellect && hero.attrs.intellect < need.intellect) return { ok: false, reason: `You need ${need.intellect} intellect to learn ${spell.name}.` };
  return { ok: true };
}

// Can a creature or the hero shrug off an effect? Immune to the effect itself, or to its magic type.
export const isImmune = (target, effect, effectId) => !!target.immune?.includes(effectId)
  || (!!effect.magicType && (!!target.immune?.includes(effect.magicType) || target.resist?.[effect.magicType] === 0));

// The spell in words: "6 mana, fire, 8–12 damage, burning 50%, reaches 3 tiles".
export function describeSpell(spell, { damageTypes = {}, effects = {}, power = 0 } = {}) {
  const parts = [`${spell.cost} mana`];
  if (spell.magicType) parts.push(damageTypes[spell.magicType]?.name ?? spell.magicType);
  if (spell.damage) parts.push(`${spell.damage[0] + power}–${spell.damage[1] + power} damage`);
  if (spell.heal) parts.push(`heals ${spell.heal[0] + power}–${spell.heal[1] + power}`);
  if (spell.effect) {
    const chance = spell.effect.chance;
    parts.push(`${(effects[spell.effect.id]?.name ?? spell.effect.id).toLowerCase()}${chance !== undefined && chance < 1 ? ` ${Math.round(chance * 100)}%` : ''}`);
  }
  if ((spell.target ?? 'foe') === 'foe' && (spell.range ?? 1) > 1) parts.push(`reaches ${spell.range} tiles`);
  if (spell.target === 'area') parts.push(`everything within ${spell.range ?? 1}`);
  return parts.join(', ');
}
