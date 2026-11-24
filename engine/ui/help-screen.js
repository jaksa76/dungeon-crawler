// The help screen: how to play, in short sections. The text is the engine's; a game adds its own sections with
// `help: [{ title, text }]` in its campaign (shown after these, and a section with the same title replaces the engine's).
//
//   renderHelp(body, { magic, extra })    magic: whether the game has spells (adds the spell keys); extra: the game's sections

const el = (tag, className = '', text = '') => { const e = document.createElement(tag); if (className) e.className = className; if (text !== '') e.textContent = text; return e; };

export function helpSections({ magic = false, extra = [] } = {}) {
  const sections = [
    { title: 'Moving', text: ['On a keyboard: W and S step forward and back, A and D step sideways, Q and E (or the left and right arrows) turn.',
      'On a phone: use the pad on the left to step and strafe and the curved arrows to turn, or swipe the scene. Stepping forward into a doorway or passage takes you through it.'] },
    { title: 'Using things', text: ['Face a chest, a door or a person and press Space (or the Use button) to use what is in front of you. You can also click or tap the thing itself.',
      'Containers open as a list: take one item, or Take all. Things you drop lie on the floor of your tile: use them again to pick them up.'] },
    { title: 'Fighting', text: ['Click or tap a creature to hit it, and hold to keep swinging. With the keyboard, face it and press X or Enter. How fast you swing depends on your weapon.',
      'Creatures resist some kinds of damage and are weak to others: a mace breaks bones, a spear goes through the dead. Read the message log to learn what works.',
      'Press 1 to drink a health potion and 2 a mana potion without opening a menu. If you fall, you wake where the game last put you.'] },
    ...(magic ? [{ title: 'Magic', text: ['Scrolls and books teach spells: use one from your satchel. Press B (or the star in the panel) to see your spells, and C (or the Cast button) to cast the ready one.',
      'A spell costs mana and needs a moment before it can be cast again. Bolts fly down the passage you face, up to a few tiles. Fire, frost, shock, poison and holy magic each work better on some creatures than others; the colour of an item\'s glowing outline tells you its kind of magic, and the strength of the glow its power.'] }] : []),
    { title: 'Your hero', text: ['Press P, or click your portrait, for the character screen: your level, your attributes and what they give you. Each level earns skill points; put them into strength, vitality, intellect or agility there and press Apply.',
      'Press I for the satchel. Drag items to move them, or onto the figure to wear them. A weapon\'s and armour\'s numbers are shown when you select it, with what wearing it would change.'] },
    { title: 'Loot and experience', text: ['Creatures you defeat give experience, and many leave something on the floor where they fell: step there and use it. Better things wait in chests and deeper in.'] },
    { title: 'Maps and notes', text: ['The map in the corner shows where you have been. Press J for the journal and L for the message log, which keeps what has been said.'] },
    { title: 'Saving', text: ['The game saves by itself when you change level, when you leave the page and every few seconds. Open Settings for Save and Load to keep several games and go back to any of them.'] },
    { title: 'All the keys', keys: [['W S A D', 'step'], ['Q E', 'turn'], ['Space', 'use'], ['X / Enter', 'attack'], ['1 / 2', 'health / mana potion'],
      ['I', 'satchel'], ['P', 'character'], ['J', 'journal'], ['L', 'message log'], ...(magic ? [['C', 'cast the ready spell'], ['B', 'spells']] : []), ['H', 'this help'], ['F', 'full screen'], ['Esc', 'close a menu']] },
    ...extra,
  ];
  const seen = new Map();
  for (const s of sections) seen.set(s.title, s);
  return [...seen.values()];
}

export function renderHelp(body, options = {}) {
  const root = el('div', 'rpg-help');
  for (const section of helpSections(options)) {
    const part = el('section', 'rpg-help-part');
    part.append(el('h3', '', section.title));
    for (const line of [].concat(section.text ?? [])) part.append(el('p', '', line));
    if (section.keys) {
      const list = el('dl', 'rpg-help-keys');
      for (const [key, what] of section.keys) { const row = el('div'); row.append(el('dt', '', key), el('dd', '', what)); list.append(row); }
      part.append(list);
    }
    root.append(part);
  }
  body.append(root);
  return root;
}
