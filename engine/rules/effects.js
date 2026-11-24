// Status effects: a burn, a chill, a stun, a regeneration, a ward. Plain data and plain numbers: no DOM, no clock of their
// own. The game declares them in its content book (`effects`):
//
//   burning: { name: 'Burning', magicType: 'fire', harmful: true, duration: [3000, 4000, 5000, 6000],
//              tickMs: 1000, damage: [2, 3, 5, 8] }
//
// A number that may differ by strength is a number or a list by tier (tier 1 is the first entry; a tier past the end uses
// the last). The fields:
//
//   duration    ms the effect lasts
//   tickMs      every this many ms the effect ticks (default: it does not tick)
//   damage      damage done at each tick, and heal the health restored (damage is of `magicType`, so resistances apply)
//   slow        a share (0.3: 30%) off the speed of whoever has it: creatures step and strike slower, the hero swings slower
//   stun        true: no stepping, striking, swinging or casting for as long as it lasts
//   attack, defence   added to (or, negative, taken from) the hero's attack and defence while it lasts
//   harmful     whether it is bad for whoever has it (shown in red); default true when it does damage, slows or stuns
//
// Applying an effect that is already there: the stronger tier wins and the time starts over; the same or a weaker tier
// only renews the time. One effect of each kind at a time.

export const tierValue = (value, tier) => (Array.isArray(value) ? value[Math.min(Math.max(1, tier), value.length) - 1] ?? 0 : value ?? 0);

export const isHarmful = def => def.harmful ?? !!(def.damage || def.slow || def.stun || [def.attack, def.defence].some(v => (Array.isArray(v) ? v[0] : v) < 0));

// The effects on one creature (the hero, or a monster). Time is passed in by the caller and kept as time left, so a set
// is saved as it is and pauses cleanly.
export function createEffects(defs) {
  const list = []; // { id, tier, left, until tick: wait }
  let lastNow = null, frozen = false;
  const def = id => { const d = defs[id]; if (!d) throw new Error(`unknown effect "${id}"`); return d; };
  const find = id => list.find(e => e.id === id);
  const sum = (key) => list.reduce((n, e) => n + tierValue(defs[e.id][key], e.tier), 0);
  return {
    list,
    has: id => !!find(id),
    get: id => find(id) ?? null,
    // Put an effect on. Returns 'new', 'stronger', 'renewed' or 'weaker' (nothing but the time changed).
    apply(id, tier = 1, { duration } = {}) {
      const d = def(id), time = duration ?? tierValue(d.duration, tier), old = find(id);
      if (!old) { list.push({ id, tier, left: time, wait: d.tickMs ?? Infinity }); return 'new'; }
      const result = tier > old.tier ? 'stronger' : tier === old.tier ? 'renewed' : 'weaker';
      if (tier > old.tier) old.tier = tier;
      old.left = Math.max(old.left, time);
      return result;
    },
    remove(id) { const i = list.findIndex(e => e.id === id); if (i >= 0) list.splice(i, 1); return i >= 0; },
    clear() { list.length = 0; },
    // The hero or creature is paused (a menu, loading): the clock does not run for effects.
    freeze() { frozen = true; },
    // Let time pass up to `now`. Returns { ticks: [{ id, tier, damage, heal }], ended: [id, ...] }.
    tick(now) {
      const dt = lastNow === null || frozen ? 0 : Math.max(0, now - lastNow);
      lastNow = now; frozen = false;
      const ticks = [], ended = [];
      for (const e of [...list]) {
        const d = defs[e.id];
        let rest = Math.min(dt, e.left); // the time that really passes for this effect
        while (rest > 0) { // one or more ticks may fall inside it
          const part = Math.min(rest, e.wait);
          rest -= part; e.left -= part; e.wait -= part;
          if (e.wait <= 0) { e.wait = d.tickMs ?? Infinity; ticks.push({ id: e.id, tier: e.tier, damage: tierValue(d.damage, e.tier), heal: tierValue(d.heal, e.tier) }); }
        }
        if (e.left <= 0) { list.splice(list.indexOf(e), 1); ended.push(e.id); }
      }
      return { ticks, ended };
    },
    // What the effects add up to: the share off speed (at most 90%), whether stunned, and the hero's stat changes.
    slow: () => Math.min(0.9, Math.max(0, sum('slow'))),
    stunned: () => list.some(e => defs[e.id].stun),
    mods: () => ({ attack: sum('attack'), defence: sum('defence') }),
    // As a list of what is on: [{ id, name, tier, left, harmful }], for screens.
    view: () => list.map(e => ({ id: e.id, name: defs[e.id].name ?? e.id, tier: e.tier, left: Math.max(0, Math.round(e.left)), harmful: isHarmful(defs[e.id]), magicType: defs[e.id].magicType ?? null })),
    // For saving: what is on and for how long.
    save: () => list.map(e => ({ id: e.id, tier: e.tier, left: Math.round(e.left), wait: Number.isFinite(e.wait) ? Math.round(e.wait) : null })),
    load(saved) {
      list.length = 0; lastNow = null;
      for (const s of Array.isArray(saved) ? saved : []) {
        if (!defs[s?.id] || !(s.left > 0) || !(s.tier >= 1)) continue; // an effect the game no longer has, or junk
        list.push({ id: s.id, tier: Math.round(s.tier), left: s.left, wait: Number.isFinite(s.wait) ? Math.max(1, s.wait) : defs[s.id].tickMs ?? Infinity });
      }
    },
  };
}
