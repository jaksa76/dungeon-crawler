// The help screen: how to play, in short sections. The text is the engine's; a game adds its own sections with
// `help: [{ title, text }]` in its campaign (shown after these, and a section with the same title replaces the engine's).
//
//   helpSections({ magic, extra })                               the sections, as data (magic: the game has spells)
//   createHelpScreen({ kit, magic, extra, back })                the screen: a scrolling page in the 320x180 panel, with a button back to settings

import { THEME } from './canvas.js';

export function helpSections({ magic = false, extra = [] } = {}) {
  const sections = [
    { title: 'Moving', text: ['On a keyboard: W and S step forward and back, A and D step sideways, Q and E (or the left and right arrows) turn.',
      'On a phone (held sideways): drag on the round stick on the left to step and strafe, and on the slider on the right to turn; hold to keep going. Stepping forward into a doorway or passage takes you through it.'] },
    { title: 'Using things', text: ['Face a chest, a door or a person and press Space to use what is in front of you. You can also click or tap the thing itself.',
      'Containers open as a list: take one item, or Take all. Things you drop lie on the floor of your tile: use them again to pick them up.'] },
    { title: 'Fighting', text: ['Click or tap a creature to hit it, and hold to keep swinging. With the keyboard, face it and press X or Enter. How fast you swing depends on your weapon.',
      'Creatures resist some kinds of damage and are weak to others: a mace breaks bones, a spear goes through the dead. Read the message log to learn what works.',
      'The quick bar (under the picture, or the right rail on a phone) holds what you use most: potions, a weapon, a spell. Press its number key, or click or tap the slot. If you fall, you wake where the game last put you.'] },
    { title: 'The quick bar', text: ['Drag an item from the satchel, or a spell from the spell list, onto a slot, or use the Quick bar button on it. Drag a slot onto another to swap them, or away from the bar to empty it. Press and hold a slot, or right-click it, to read about it.',
      'A slot stands for the item, not for one potion: it goes grey when you have none left and works again when you find more. The first potions you pick up and the first spell you learn find a slot by themselves.'] },
    ...(magic ? [{ title: 'Magic', text: ['Scrolls and books teach spells: use one from your satchel. Press B (or the star button) to see your spells, and C to cast the ready one; a spell on the quick bar casts when you press its slot.',
      'A spell costs mana and needs a moment before it can be cast again. Bolts fly down the passage you face, up to a few tiles. Fire, frost, shock, poison and holy magic each work better on some creatures than others; the colour of an item\'s glowing outline tells you its kind of magic, and the strength of the glow its power.'] }] : []),
    { title: 'Your hero', text: ['Press P, or click your portrait, for the character screen: your level, your attributes and what they give you. Each level earns skill points; put them into strength, vitality, intellect or agility there and press Apply.',
      'Press I for the satchel. Drag items to move them, or onto the figure to wear them. A weapon\'s and armour\'s numbers are shown when you select it, with what wearing it would change.'] },
    { title: 'Loot and experience', text: ['Creatures you defeat give experience, and many leave something on the floor where they fell: step there and use it. Better things wait in chests and deeper in.'] },
    { title: 'Maps and notes', text: ['The map in the corner shows where you have been. Press J for the journal and L for the message log, which keeps what has been said.'] },
    { title: 'Saving', text: ['The game saves by itself when you change level, when you leave the page and every few seconds. Open Settings for Save and Load to keep several games and go back to any of them.'] },
    { title: 'All the keys', keys: [['W S A D', 'step'], ['Q E', 'turn'], ['Space', 'use'], ['X / Enter', 'attack'], ['1 – 8', 'quick bar'],
      ['I', 'satchel'], ['P', 'character'], ['J', 'journal'], ['L', 'message log'], ...(magic ? [['C', 'cast the ready spell'], ['B', 'spells']] : []), ['H', 'this help'], ['F', 'full screen'], ['Esc', 'close a menu']] },
    ...extra,
  ];
  const seen = new Map();
  for (const s of sections) seen.set(s.title, s);
  return [...seen.values()];
}

export function createHelpScreen({ kit, magic = false, extra = [], back = null }) {
  const sections = helpSections({ magic, extra });
  return {
    kind: 'help', title: 'Help',
    draw() {
      kit.scroll('help', 5, 20, 310, back ? 134 : 155, width => {
        let y = 2;
        for (const section of sections) {
          kit.text(section.title, 4, y, THEME.select); y += 11;
          for (const line of [].concat(section.text ?? [])) y += kit.paragraph(line, 4, y, width - 8, THEME.text) + 3;
          for (const [key, what] of section.keys ?? []) { kit.text(key, 6, y, THEME.select); kit.text(what, 70, y, THEME.text); y += 9; }
          y += 6;
        }
        return y;
      });
      if (back) kit.button(5, 158, 100, 17, 'Back to settings', { tap: back });
    },
  };
}
