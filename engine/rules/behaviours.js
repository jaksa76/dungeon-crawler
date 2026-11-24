// Behaviour factories: ready-made methods for content definitions and placements. A definition (an item, a prop,
// an NPC, a door, a creature) is a plain object; the engine calls methods on it when something happens, with `this`
// the instance it concerns and `game` the game API (docs/engine/behaviour.md lists it):
//
//   item       use(game, stack)          the player uses it from the pack. Return { consumed: true } to use one up,
//                                        and/or { message } to show in the satchel.
//   prop, NPC  interact(game)            the player uses the thing they face.
//   door       interact(game), open(game, { force }), close(game), isOpen()
//   creature   onDeath(game)             it has just been killed.
//   any placed onCreate(game)            once per playthrough, when it first comes into being.
//   level      onEnter(game), onExit(game)
//
// State that must survive a save goes in `this.state` (plain JSON), declared with its defaults as `state: {...}` on
// the definition. Everything else on an instance is rebuilt from the definitions on load.
//
// The factories below are the engine's defaults; a campaign uses them, wraps them, or writes its own functions.

// Say something.
export const examine = text => function interact(game) { game.say(text); };

// A container: fixed `contents` plus a `loot` table and/or generated `generate: { budget }`, worked out the first time it is opened (see loot.js).
export const container = ({ title, text, contents, loot, generate } = {}) => function interact(game) {
  game.openContainer(this, { title, text, contents, loot, generate });
};

// Restore health and mana. One is used up unless it would all be wasted. `restores` tells the quick slots what it is.
export function restore({ hp = 0, mp = 0 }) {
  return Object.assign(function use(game) {
    const { hero } = game, gainHp = Math.min(hp, hero.maxHp - hero.hp), gainMp = Math.min(mp, hero.maxMp - hero.mp);
    if (gainHp <= 0 && gainMp <= 0) return { message: hp ? 'Your health is already full.' : 'Your mana is already full.' };
    hero.hp += gainHp; hero.mp += gainMp;
    const message = `You use ${this.name.toLowerCase()}${gainHp ? ` and recover ${gainHp} health` : ''}${gainMp ? ` and recover ${gainMp} mana` : ''}.`;
    game.say(message);
    return { consumed: true, message };
  }, { restores: { hp, mp } });
}

// A door: shut it is a wall, open the tile is floor. `key` is an item id that unlocks it. Use opens or closes it;
// a locked one opens only for its key, or when something opens it with { force: true } (a lever, a spell, a horn).
export function door({ key = null, opens = 'The door swings open.', closes = 'The door closes.', locked = 'It is locked.' } = {}) {
  return {
    state: { open: false, locked: false },
    key,
    isOpen() { return this.state.open; },
    open(game, { force = false } = {}) {
      if (this.state.open) return true;
      if (this.state.locked && !force) {
        if (!this.key || !game.inventory.count(this.key)) { game.say(locked); return false; }
        game.say(`You unlock it with the ${game.items[this.key].name.toLowerCase()}.`);
      }
      this.state.locked = false; this.state.open = true; game.changed();
      if (game.isHere(this)) game.say(opens);
      return true;
    },
    close(game) {
      if (!this.state.open) return true;
      if (game.blocked(this)) { game.say('Something is in the way.'); return false; }
      this.state.open = false; game.changed();
      if (game.isHere(this)) game.say(closes);
      return true;
    },
    interact(game) { return this.state.open ? this.close(game) : this.open(game); },
  };
}

// A book or scroll: reading it teaches a spell (`teaches: 'firebolt'` on the item) and uses it up. The game's `learn(id)`
// says why it may not (too low a level, already known).
export const teach = spell => Object.assign(function use(game) {
  const result = game.learn(spell);
  return { consumed: result.ok, message: result.message };
}, { teaches: spell });

// An item's `use` as a method: its own function, or the data form { hp, mp } as restore(), or `teaches` as teach().
export function itemUse(def) {
  if (typeof def.use === 'function') return def.use;
  if (def.teaches && !def.use) return teach(def.teaches);
  return def.use ? restore(def.use) : null;
}

// The data form of a behaviour, { type, ... }, as a method: what levels and books wrote before methods existed.
export const behaviorTypes = {
  examine: b => examine(b.text),
  open: b => container(b),
};
export function behaviourFrom(data) {
  if (!data) return null;
  const make = behaviorTypes[data.type];
  if (!make) throw new Error(`unknown behavior "${data.type}"`);
  return make(data);
}
