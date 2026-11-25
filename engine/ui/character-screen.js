// The character screen, drawn in the 320x180 panel: the hero's figure, level and experience, attributes with the skill points to
// spend, the stats those give and what the hero resists. It is where the points gained by levelling are allocated
// (engine/rules/progression.js).
//
// It is its own screen, apart from character creation (ui/title-screen.js), so each can change without the other: creation
// is the one-time choice of a name and a few starting points; this is the hero as they are now, for the whole game.
//
//   const screen = createCharacterScreen({ kit, sprite, hero, damageTypes, onSpend })   // { kind, title, draw(), reset() }
//
// Points are chosen first and applied together: `onSpend(attribute)` is called once per point when the player presses
// Apply, and returns { ok }. Until then nothing is changed, so a change of mind costs nothing; closing the screen drops
// what is pending.

import { THEME } from './canvas.js';

// What each attribute is for, and the stats it raises. (Creation has its own copy of the descriptions.)
const ATTRIBUTES = {
  strength: { label: 'Strength', about: 'Might of arm. Every blow lands harder.' },
  vitality: { label: 'Vitality', about: 'Toughness. You can take more punishment.' },
  intellect: { label: 'Intellect', about: 'Learning and will. A deeper well of mana and stronger spells.' },
  agility: { label: 'Agility', about: 'Speed and balance. Harder to hit, surer to strike.' },
};

// The stats shown, in order: [key, label, how to write it from a stats object].
const STATS = [
  ['maxHp', 'Health', s => s.maxHp],
  ['maxMp', 'Mana', s => s.maxMp],
  ['attack', 'Damage', s => `${s.damage[0]}-${s.damage[1]}`],
  ['defence', 'Defence', s => s.defence],
  ['accuracy', 'Accuracy', s => s.accuracy],
  ['evasion', 'Evasion', s => s.evasion],
  ['spellPower', 'Spell power', s => s.spellPower],
  ['luck', 'Luck', s => s.luck],
];

export function createCharacterScreen({ kit, sprite, hero, damageTypes = {}, onSpend = key => ({ ok: hero.spend(key) }), toast = () => {} }) {
  let pending = {}, focus = null;
  const reset = () => { pending = Object.fromEntries(Object.keys(hero.attrs).map(k => [k, 0])); focus = null; };
  reset();
  const used = () => Object.values(pending).reduce((a, b) => a + b, 0);

  return {
    kind: 'character', get title() { return hero.name; }, reset, opened: reset,
    pending: () => ({ ...pending }),
    draw() {
      const free = hero.unspent - used(), now = hero.stats(), after = hero.statsWithPoints(pending);
      // The figure, at its own size.
      kit.frame(5, 20, 56, 155);
      kit.image(sprite, 9, 26);
      kit.text(hero.name, 33, 126, THEME.text, { align: 'center' });

      // Level and experience, and the points to spend: one pip per point earned, lit while it is still free.
      const { level, xp, from, to } = hero.progress;
      kit.text(`Level ${level}`, 66, 22, THEME.select);
      kit.bar(66, 32, 134, 9, to === null ? 1 : xp - from, to === null ? 1 : to - from, { fill: THEME.xp, hi: THEME.xpHi, label: to === null ? `${xp} xp, the highest level` : `${xp} / ${to} xp` });
      kit.text('Points', 66, 46, THEME.dim);
      for (let i = 0; i < Math.min(hero.unspent, 16); i++) kit.fill(106 + i * 7, 47, 5, 5, i < free ? THEME.select : THEME.wellEdge);
      kit.text(`${free} left`, 200, 46, free > 0 ? THEME.select : THEME.dim, { align: 'right' });

      // The attributes.
      Object.keys(hero.attrs).forEach((key, i) => {
        const info = ATTRIBUTES[key] ?? { label: key[0].toUpperCase() + key.slice(1), about: '' }, y = 58 + i * 16, raised = pending[key] > 0;
        kit.text(info.label, 66, y + 3, focus === key ? THEME.select : THEME.text);
        kit.button(122, y, 16, 14, '-', { disabled: pending[key] === 0, tap: () => { pending[key]--; focus = key; }, key: `minus:${key}`, title: `Take back a point from ${info.label}` });
        kit.text(String(hero.attrs[key] + pending[key]), 148, y + 3, raised ? THEME.good : THEME.white, { align: 'center' });
        kit.button(158, y, 16, 14, '+', { disabled: free <= 0, tap: () => { pending[key]++; focus = key; }, key: `plus:${key}`, title: `Raise ${info.label}` });
        kit.hit(66, y, 54, 14, { key: `attr:${key}`, title: info.about, tap: () => { focus = key; } });
      });
      kit.paragraph(focus ? ATTRIBUTES[focus]?.about ?? '' : 'Tap an attribute to read about it.', 66, 124, 134, THEME.dim, { max: 3 });
      if (hero.unspent > 0) {
        kit.button(66, 155, 62, 16, 'Apply', { primary: true, disabled: used() === 0, tap: () => {
          let spent = 0;
          for (const key of Object.keys(pending)) for (let i = 0; i < pending[key]; i++) if (onSpend(key).ok) spent++;
          for (const key of Object.keys(pending)) pending[key] = 0;
          if (spent) toast(`${spent} point${spent === 1 ? '' : 's'} spent.`);
        } });
        kit.button(132, 155, 50, 16, 'Reset', { disabled: used() === 0, tap: reset });
      }

      // What those give, with what the chosen points would change.
      kit.frame(205, 20, 110, 155);
      kit.text('Stats', 210, 24, THEME.select);
      let y = 36;
      for (const [key, label, show] of STATS) {
        if (!(key in now)) continue;
        kit.text(label, 210, y, THEME.dim);
        const was = now[key], then = after[key], delta = typeof then === 'number' && typeof was === 'number' ? then - was : 0;
        const value = delta ? show(after) : show(now);
        if (delta) { const d = `${delta > 0 ? '+' : ''}${delta}`; kit.text(d, 310, y, THEME.good, { align: 'right' }); kit.text(String(value), 310 - kit.width(d) - 4, y, THEME.white, { align: 'right' }); }
        else kit.text(String(value), 310, y, THEME.white, { align: 'right' });
        y += 11;
      }
      // What is resisted, from what is worn: "Fire x0.7" (under 1 takes less damage, over 1 more).
      const resists = Object.entries(now.resist ?? {}).filter(([, v]) => Math.abs(v - 1) > 1e-9);
      if (resists.length) kit.paragraph(`Damage taken: ${resists.map(([t, v]) => `${damageTypes[t]?.name ?? t} x${+v.toFixed(2)}`).join(', ')}`, 210, y + 4, 100, THEME.dim, { max: 6 });
    },
  };
}
