// The character screen: the hero's figure, level and experience, attributes with the skill points to spend, the stats those
// give and what the hero resists. It is where the points gained by levelling are allocated (engine/rules/progression.js).
//
// It is its own screen, apart from character creation (ui/title-screen.js), so each can change without the other: creation
// is the one-time choice of a name and a few starting points; this is the hero as they are now, for the whole game.
//
//   renderCharacter(body, { hero, damageTypes, onSpend, note })
//
// `body` is the element to fill (the menu panel's body). `hero` is the session's hero (rules/combat.js createCharacter). Points
// are chosen first and applied together: `onSpend(attribute)` is called once per point when the player presses Apply, and
// returns { ok }. Until then nothing is changed, so a change of mind costs nothing; closing the screen drops what is pending.

const SPRITE_URL = new URL('../assets/ui/hero-sprite.png', import.meta.url);

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
  ['attack', 'Damage', s => `${s.damage[0]}–${s.damage[1]}`],
  ['defence', 'Defence', s => s.defence],
  ['accuracy', 'Accuracy', s => s.accuracy],
  ['evasion', 'Evasion', s => s.evasion],
  ['spellPower', 'Spell power', s => s.spellPower],
  ['luck', 'Luck', s => s.luck],
];

const el = (tag, className = '', text = '') => { const e = document.createElement(tag); if (className) e.className = className; if (text !== '') e.textContent = text; return e; };
const button = (label, handler, className = '') => { const b = el('button', className, label); b.type = 'button'; b.addEventListener('click', handler); return b; };

export function renderCharacter(body, { hero, damageTypes = {}, onSpend = key => ({ ok: hero.spend(key) }), note = '' }) {
  const pending = Object.fromEntries(Object.keys(hero.attrs).map(k => [k, 0]));
  let message = note, focus = null;
  const used = () => Object.values(pending).reduce((a, b) => a + b, 0);
  const root = el('div', 'rpg-cs');
  body.append(root);

  function draw() {
    const free = hero.unspent - used();
    const now = hero.stats(), after = hero.statsWithPoints(pending);
    root.replaceChildren();

    // The figure, at a whole number of screen pixels per art pixel.
    const figure = el('figure', 'rpg-cs-figure');
    const sprite = el('img'); sprite.src = SPRITE_URL.href; sprite.alt = 'Your adventurer';
    figure.append(sprite, el('figcaption', '', hero.name));

    const main = el('div', 'rpg-cs-main');
    const { level, xp, from, to } = hero.progress;
    const bar = el('div', 'rpg-cs-xp');
    const meter = el('meter'); meter.min = 0; meter.max = to === null ? 1 : to - from; meter.value = to === null ? 1 : xp - from;
    meter.setAttribute('aria-label', 'Experience');
    bar.append(el('b', '', `Level ${level}`), meter, el('span', '', to === null ? `${xp} xp, the highest level` : `${xp} / ${to} xp`));
    main.append(bar);

    // The points to spend, as pips like the ones in character creation: one per point earned, lit while it is still free.
    const points = el('div', 'rpg-cs-points');
    const pips = el('span', 'rpg-cs-pips'); pips.setAttribute('aria-hidden', 'true');
    pips.append(...Array.from({ length: hero.unspent }, (_, i) => el('i', i < free ? 'is-free' : '')));
    const left = el('span', 'rpg-cs-left', `${free} left`); left.setAttribute('aria-live', 'polite');
    points.append(el('span', 'rpg-cs-caption', 'Points'), pips, left);
    main.append(points);
    const actionsSlot = el('div', 'rpg-cs-actions');
    main.append(actionsSlot);

    const list = el('ul', 'rpg-cs-attrs');
    for (const key of Object.keys(hero.attrs)) {
      const info = ATTRIBUTES[key] ?? { label: key[0].toUpperCase() + key.slice(1), about: '' };
      const li = el('li', 'rpg-cs-attr' + (pending[key] ? ' is-raised' : '') + (focus === key ? ' is-active' : ''));
      const minus = button('-', () => { pending[key]--; draw(); }, 'rpg-cs-step'); minus.disabled = pending[key] === 0;
      const plus = button('+', () => { pending[key]++; message = ''; draw(); }, 'rpg-cs-step'); plus.disabled = free <= 0;
      minus.setAttribute('aria-label', `Take back a point from ${info.label}`); plus.setAttribute('aria-label', `Raise ${info.label}`);
      const value = el('span', 'rpg-cs-value', hero.attrs[key] + pending[key]);
      li.append(el('span', 'rpg-cs-label', info.label), minus, value, plus);
      li.title = info.about;
      li.addEventListener('pointerenter', () => { focus = key; about.textContent = info.about; });
      li.addEventListener('focusin', () => { focus = key; about.textContent = info.about; });
      list.append(li);
    }
    main.append(list);
    const about = el('p', 'rpg-cs-about', focus ? ATTRIBUTES[focus]?.about ?? '' : ''); // what an attribute does shows when it is hovered or focused
    main.append(about);

    if (hero.unspent > 0) {
      const actions = actionsSlot;
      const apply = button('Apply', () => {
        let spent = 0;
        for (const key of Object.keys(pending)) for (let i = 0; i < pending[key]; i++) if (onSpend(key).ok) spent++;
        for (const key of Object.keys(pending)) pending[key] = 0;
        message = spent ? `${spent} point${spent === 1 ? '' : 's'} spent.` : '';
        draw();
      }, 'rpg-cs-primary');
      apply.disabled = used() === 0;
      const reset = button('Reset', () => { for (const key of Object.keys(pending)) pending[key] = 0; draw(); });
      reset.disabled = used() === 0;
      actions.append(apply, reset);
    }
    if (message) main.append(el('p', 'rpg-note', message));

    // What those give, with what the chosen points would change (a column of its own beside the attributes).
    const side = el('div', 'rpg-cs-side');
    side.append(el('h3', '', 'Stats'));
    const stats = el('dl', 'rpg-cs-stats');
    for (const [key, label, show] of STATS) {
      if (!(key in now)) continue;
      const cell = el('div'), dd = el('dd', '', String(show(now)));
      const was = key === 'attack' ? now.attack : now[key], then = key === 'attack' ? after.attack : after[key];
      if (typeof then === 'number' && then !== was) { dd.textContent = String(show(after)); dd.append(el('span', 'rpg-cs-delta', ` ${then > was ? '+' : ''}${then - was}`)); }
      cell.append(el('dt', '', label), dd); stats.append(cell);
    }
    side.append(stats);

    // What is resisted, from what is worn: "Fire ×0.7" (under 1 takes less damage, over 1 more).
    const resists = Object.entries(now.resist ?? {}).filter(([, v]) => Math.abs(v - 1) > 1e-9);
    if (resists.length) {
      side.append(el('p', 'rpg-cs-resist', `Damage taken: ${resists.map(([t, v]) => `${damageTypes[t]?.name ?? t} ×${+v.toFixed(2)}`).join(', ')}`));
    }
    root.append(figure, main, side);
  }
  draw();
  return { redraw: draw, pending: () => ({ ...pending }) };
}
