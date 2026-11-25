// The spells the hero knows, drawn in the 320x180 panel: a list on the left, what the chosen spell does on the right, and
// buttons to cast it, make it the ready one (the C key casts that) or put it on the quick bar. A spell's picture can be
// dragged onto a quick slot. See docs/engine/magic.md.
//
//   createSpellScreen({ kit, icons, hero, magic, quick, damageTypes, say, toast })   // { kind, title, draw() }
//
// `magic`: { spells() -> [{ id, name, icon, cost, magicType, ready, description, text }], cast(id), setReady(id), ready() }.

import { THEME } from './canvas.js';

export function createSpellScreen({ kit, icons, hero, magic, quick = null, damageTypes = {}, say = () => {}, toast = () => {} }) {
  let selected = null;
  const colourOf = spell => damageTypes[spell.magicType]?.colour ?? '#ffffff';
  const failure = r => (r?.ok ? '' : r?.reason === 'mana' ? 'Not enough mana.' : r?.reason === 'cooldown' ? 'Not ready yet.' : r?.reason === 'no-target' ? 'Nothing to strike in that direction.' : '');

  return {
    kind: 'spells', title: 'Spells',
    draw() {
      const known = magic.spells();
      if (!known.length) { kit.paragraph('You know no spells yet. Scrolls and books teach them: use one from the satchel.', 9, 23, 302, THEME.text); return; } // where the text screens start their text
      if (!known.some(s => s.id === selected)) selected = magic.ready() ?? known[0].id;
      const spell = known.find(s => s.id === selected);

      // The list: a picture, the name and the cost; a star marks the ready spell.
      kit.frame(5, 20, 150, 155);
      kit.scroll('spell-list', 6, 21, 148, 153, () => {
        known.forEach((s, i) => {
          const y = 1 + i * 20, colour = colourOf(s), outline = { colour, tier: 2 };
          const key = `spell:${s.id}`, hot = kit.state.drop === key;
          kit.fill(1, y, 144, 19, s.id === selected ? THEME.panelHi : THEME.well); kit.outline(1, y, 144, 19, s.id === selected ? THEME.select : hot ? '#ffe0a0' : THEME.wellEdge);
          kit.icon(icons, s.icon ?? 'spell', 3, y + 1, 16, { outline });
          kit.text(s.name, 23, y + 3, THEME.text);
          kit.text(`${s.cost} MP${s.id === magic.ready() ? ' *' : ''}`, 23, y + 11, hero.mp < s.cost ? THEME.bad : THEME.mana);
          kit.hit(1, y, 144, 19, { key, title: s.name, tap: () => { selected = s.id; },
            drag: () => (quick ? { ref: { kind: 'spell', id: s.id }, name: s.name, draw: (k, x, yy) => k.icon(icons, s.icon ?? 'spell', Math.round(x) - 8, Math.round(yy) - 8, 16, { outline }) } : null) });
        });
        return 2 + known.length * 20;
      });

      // The chosen spell.
      kit.frame(159, 20, 156, 155);
      kit.text(spell.name, 164, 24, THEME.select);
      kit.text(`${spell.cost} mana`, 310, 24, hero.mp < spell.cost ? THEME.bad : THEME.mana, { align: 'right' });
      kit.scroll('spell-text', 163, 36, 148, 84, w => kit.paragraph([spell.description, spell.text].filter(Boolean).join(' '), 1, 0, w, THEME.text));
      kit.button(164, 125, 70, 15, 'Cast', { disabled: hero.mp < spell.cost || !spell.ready, tap: () => { const t = failure(magic.cast(spell.id)); if (t) toast(t); } });
      kit.button(238, 125, 72, 15, spell.id === magic.ready() ? 'Ready' : 'Make ready', { disabled: spell.id === magic.ready(), tap: () => magic.setReady(spell.id) });
      if (quick) {
        const ref = { kind: 'spell', id: spell.id };
        kit.button(164, 145, 146, 15, quick.has(ref) ? 'Off quick bar' : 'Quick bar', { tap: () => { const line = quick.toggle(ref, spell.name); say(line); toast(line); } });
        kit.text('Drag it onto a quick slot', 164, 163, THEME.faint);
      }
    },
  };
}
