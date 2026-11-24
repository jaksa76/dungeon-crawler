// A hand-editable labyrinth below Ravensmoor. E is the door back to the village.
export const undercrypt = {
  name: 'Ravensmoor · The Undercrypt',
  shortName: 'The Undercrypt',
  journal: 'The Undercrypt is full of creatures, from rats and kobolds near the door to an ogre, an owlbear and a troll deep inside: the stronger it looks, the stronger it is. They follow movement they spot down the corridors. Tap a creature to attack, hold to keep swinging (or face it and press X), and drink a potion (1) if the fight turns against you. Your light reaches only a few paces. The ironbound entrance door leads back to the village; your map records the passages you discover.',
  environment: 'dungeon',
  sound: { music: [38, null, 45, 40, null, 41, null, 36], windTone: 145, windVolume: .15, interval: 2.7 },
  legend: { '.': 'floor', '#': 'dungeon-stone', E: 'dungeon-door' },
  start: { x: 1, z: 1, dir: 2 },
  tiles: [
    '#################',
    'E.#.........#...#',
    '#.#######.###.#.#',
    '#.......#.....#.#',
    '#######.#######.#',
    '#.#.....#.......#',
    '#.#.#####.#####.#',
    '#.#.......#...#.#',
    '#.#########.#.#.#',
    '#...#.......#.#.#',
    '#.#.#.#######.#.#',
    '#.#...#.......#.#',
    '#.#####.#######.#',
    '#.#.......#.....#',
    '#.#########.#####',
    '#...............#',
    '###.###########.#',
    '##....######....#',
    '############....#',
    '############....#',
    '#################',
  ],
  doors: [
    { door: 'iron-door', id: 'crypt-gate', name: 'the crypt gate', x: 7, z: 12, key: null, state: { locked: true } },
    { door: 'iron-door', id: 'seal-gate', name: 'the warded gate', x: 15, z: 16, state: { locked: true } },
    { door: 'secret-door', id: 'secret-passage', x: 3, z: 16 },
    { door: 'iron-door', id: 'plate-gate', name: 'the cache grate', x: 4, z: 17, key: null, state: { locked: true } },
  ],
  traps: [{ x: 14, z: 15, type: 'dart', name: 'dart trap', damage: 9,
    hint: 'Small holes line the wall above a loose tile. Use the dart trap again to disarm it.',
    message: 'The loose tile sinks. A dart strikes you for 9 damage.' }],
  triggers: [
    { on: 'enterTile', x: 1, z: 1, effect(game) {
      if (game.quests.status('raven-seal') === 'accepted') game.quests.advance('raven-seal', 'search');
    } },
    { on: 'faceSide', x: 3, z: 15, side: 'S',
      when: game => !game.find('dungeon', 'secret-passage').state.revealed,
      effect: game => game.say('Thin scratches arc across the mortar at the foot of the wall.') },
    { on: 'enterTile', x: 2, z: 17, effect(game) {
      const grate = game.find('dungeon', 'plate-gate');
      if (!grate.isOpen()) {
        game.say('A pressure plate clicks underfoot.');
        grate.open(game, { force: true });
      }
    } },
  ],
  entities: [
    { id: 'crypt-hoard', prop: 'chest', name: 'an old chest', x: 3, z: 13, side: 'W', behavior: { type: 'open', title: 'Old chest',
      text: 'Dust and old bones, and beneath them a mace, a shield, a sword that glows faintly, a scroll and two corked vials.',
      contents: [{ item: 'iron-mace' }, { item: 'iron-shield' }, { item: 'iron-sword-flame' }, { item: 'scroll-mending' }, { item: 'health-potion', qty: 2 }] } },
    { id: 'warden-lockbox', prop: 'chest', name: 'a lockbox', x: 11, z: 1, side: 'E', behavior: { type: 'open', title: 'Warden’s lockbox',
      text: 'A tarnished iron key marked with the warden’s seal lies inside.', contents: [{ item: 'key' }] } },
    { id: 'hidden-pay', prop: 'chest', name: 'a small coffer', x: 5, z: 17, side: 'E', behavior: { type: 'open', title: 'Hidden coffer',
      text: 'A stack of old coins gleams beneath scraps of cloth.', contents: [{ item: 'gold', qty: 30 }] } },
    { id: 'seal-reliquary', prop: 'chest', name: 'a stone reliquary', x: 12, z: 19, side: 'W',
      interact(game) {
        if (!game.find('dungeon', 'seal-warden')?.state.dead) { game.say('The warden still binds the lid shut.'); return; }
        game.openContainer(this, { title: 'Stone reliquary', text: 'The Raven Seal rests on a bed of ash.', contents: [{ item: 'raven-seal' }] });
      } },
  ],
  monsterStepMs: 1100,
  monsterGraceMs: 3500,
  // Placed by danger: vermin near the door, the dangerous ones in the far dead ends. The snake is Ravensmoor's own
  // (content/monsters.js); the rest come from the engine's bestiary.
  monsters: [
    { monster: 'snake', id: 'prowler', x: 7, z: 3, dir: 3 },
    { monster: 'rat', id: 'rat-1', x: 5, z: 1, dir: 1 },
    { monster: 'rat', id: 'rat-2', x: 1, z: 9, dir: 2 },
    { monster: 'kobold', id: 'kobold-1', x: 11, z: 1, dir: 3 },
    { monster: 'kobold', id: 'kobold-2', x: 3, z: 5, dir: 1 },
    { monster: 'goblin', id: 'goblin-1', x: 1, z: 13, dir: 0 },
    { monster: 'goblin', id: 'goblin-2', x: 13, z: 3, dir: 3, tactics: { type: 'flee' } },
    { monster: 'skeleton', id: 'skeleton-1', x: 5, z: 7, dir: 1 },
    { monster: 'skeleton', id: 'skeleton-2', x: 9, z: 9, dir: 3 },
    { monster: 'zombie', id: 'zombie-1', x: 11, z: 5, dir: 1 },
    { monster: 'zombie', id: 'zombie-2', x: 5, z: 13, dir: 1 },
    { monster: 'orc', id: 'orc-1', x: 14, z: 1, dir: 2 },
    { monster: 'spider', id: 'spider-1', x: 9, z: 11, dir: 1 },
    { monster: 'ghoul', id: 'ghoul-1', x: 13, z: 13, dir: 3, tactics: { type: 'patrol', route: [{ x: 15, z: 13 }, { x: 11, z: 13 }] } },
    { monster: 'ogre', id: 'ogre-1', x: 13, z: 15, dir: 3 },
    { monster: 'owlbear', id: 'owlbear-1', x: 12, z: 7, dir: 3 },
    { monster: 'troll', id: 'troll-1', x: 4, z: 11, dir: 1 },
    { monster: 'ghoul', id: 'seal-warden', name: 'the Seal Warden', x: 14, z: 18, dir: 0, hp: 130, damage: 22,
      xp: 55, w: .53, h: 1.14, tactics: { type: 'guard', radius: 3 } },
  ],
  exits: [{ x: 1, z: 1, dir: 3, to: 'village', spawn: { x: 3, z: 2, dir: 3 },
    message: 'The ironbound door leads back to the Old Quarter. Step forward to leave.' }],
};
