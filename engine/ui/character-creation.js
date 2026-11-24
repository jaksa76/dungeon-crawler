// The character creation screen: a name and a few points to spend on the attributes. Same panel as the other
// menus (see mobile-hud.css). Resolves to { name, spent } where `spent` is the points added per attribute.
//
//   chooseCharacter(frame, { title, base, points, derive(attrs) -> { maxHp, ... }, name })
//
// `base` are the starting attributes (they cannot be lowered), `points` how many may be added on top.
const LABELS = { strength: 'Strength', vitality: 'Vitality', intellect: 'Intellect', agility: 'Agility' };
const SHOWN = [['maxHp', 'Health'], ['maxMp', 'Mana'], ['attack', 'Attack'], ['defence', 'Defence']];

export function chooseCharacter(frame, { title, base, points, derive, name = 'Hero' }) {
  const panel = document.createElement('section'); panel.className = 'rpg-panel rpg-game-over rpg-creation';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'creation-title');
  const heading = document.createElement('h2'); heading.id = 'creation-title'; heading.textContent = title.toUpperCase();
  const field = document.createElement('input'); field.type = 'text'; field.maxLength = 24; field.value = name; field.setAttribute('aria-label', 'Name');
  const left = document.createElement('p'), preview = document.createElement('p');
  const spent = Object.fromEntries(Object.keys(base).map(k => [k, 0]));
  const used = () => Object.values(spent).reduce((a, b) => a + b, 0);
  const rows = Object.keys(base).map(key => {
    const row = document.createElement('div'), label = document.createElement('span'), minus = document.createElement('button'), plus = document.createElement('button');
    for (const [b, text, delta] of [[minus, '-', -1], [plus, '+', 1]]) {
      b.type = 'button'; b.textContent = text; b.setAttribute('aria-label', `${delta < 0 ? 'Less' : 'More'} ${LABELS[key] ?? key}`);
      b.onclick = () => { if (delta < 0 ? spent[key] > 0 : used() < points) { spent[key] += delta; update(); } };
    }
    row.append(label, minus, plus);
    return { key, label, minus, plus };
  });
  const begin = document.createElement('button'); begin.type = 'button'; begin.textContent = 'Begin';
  function update() {
    const attrs = Object.fromEntries(Object.keys(base).map(k => [k, base[k] + spent[k]]));
    for (const r of rows) { r.label.textContent = `${LABELS[r.key] ?? r.key}  ${attrs[r.key]}  `; r.minus.disabled = spent[r.key] === 0; r.plus.disabled = used() >= points; }
    left.textContent = points ? `Points to spend: ${points - used()}` : '';
    const stats = derive(attrs);
    preview.textContent = SHOWN.map(([k, text]) => `${text} ${stats[k]}`).join('  ·  ');
  }
  panel.append(heading, field, ...(points ? [left] : []), ...rows.map(r => r.label.parentElement), preview, begin);
  update(); frame.append(panel); field.focus({ preventScroll: true }); field.select();
  return new Promise(resolve => {
    const done = () => { panel.remove(); resolve({ name: field.value.trim() || name, spent: { ...spent } }); };
    begin.onclick = done;
    field.addEventListener('keydown', ev => { if (ev.key === 'Enter') done(); ev.stopPropagation(); }); // typing must not move the hero
  });
}
