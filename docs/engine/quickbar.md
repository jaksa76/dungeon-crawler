# The quick bar

A row of slots for what the hero uses most: a potion, a weapon, a spell. Eight slots on the desktop panel, six on a
phone. Pressing a slot does what using that thing does, without opening a menu, so it works in the middle of a fight.

## What a slot is

A slot **names** something; it holds nothing. It is `null`, `{ kind: 'item', id }` or `{ kind: 'spell', id }`, so the
pack and the saves stay `{ id, qty }`.

- An item slot shows the stack count (all the stacks of that item added up). With none left the slot stays, grey, and
  works again when the item is picked up. Pressing it: an item with a `use` is used; a weapon or armour is worn (a worn
  one is lit gold, pressing it says it is already in use).
- A spell slot shows its mana cost (red when there is not enough) and a shade that drains while the spell cools down.
  Pressing it casts the spell at what is ahead, as the Cast button does, with the same floating numbers.
- Only things that do something can go on the bar: an item with `use` or `slot`, or a known spell. A key cannot.
- The same thing is on the bar once. Putting it in a second slot moves it (swapping with what was there).

The bar always has 8 entries (`quickSlots` in `createSession`, default `QUICK_SLOTS`). A phone shows the first six
(`SHOWN_SMALL` in `ui/quickbar-hud.js`), so a save moves between devices without losing a slot; put the important
things in slots 1–6.

## Putting things on it

| How | |
|---|---|
| **Drag** an item from the satchel (or a worn item from the figure) or a spell's picture from the spell list onto a slot | the same on the desktop panel and on a phone |
| **Quick bar** button in the satchel's item text and on a spell | first free slot; the button then reads *Off quick bar* |
| Drag a slot onto another slot | swap |
| Drag a slot away from the bar | empty it |
| Press and hold a slot (a phone), or right-click it (desktop) | its name and what it does, in the message line |
| **Auto-fill** | the first potion picked up (anything whose `use` restores health or mana) and the first spell learned go in the first free slot, once. A slot emptied by hand is not refilled |

A new game starts with the bar filled from the starting items (health potions first, so keys 1 and 2 are the two
potions of Ravensmoor) and the starting spells. A save from before the bar existed gets the same from the pack and the
known spells.

Keys 1–8 press a slot (on the desktop, while no menu is open). A tap, a click, or Enter/Space on a focused slot button
does the same.

## In the code

- `rules/quickbar.js`: `createQuickBar({ size, itemDefs, spells, canonical })`: `set`, `clear`, `swap`, `autoFill`,
  `get`, `slots`, and its saved section `engine.quickbar` (`{ slots: [{ item } | { spell } | null], offered }`; item
  ids go through `aliases` on load). Pure data, no session.
- `core/session.js`: `session.quickView()` (what each slot stands for now: name, icon, `count`, `usable`, `reason`,
  `cooldown` 0–1, `cost`, `worn`, `enchant`), `quickDescribe(i)`, `quickSet(i, ref)`, `quickClear(i)`,
  `quickSwap(a, b)`, `quickActivate(i, cast?)`. Every change is a `quickbar` event. Auto-fill happens when a pack
  stack is taken from a container or pile, and when a spell is learned. `quickUse('hp' | 'mp')` is still there for bots.
- `ui/panel-icons.js`: the desktop slots are drawn over the repainted strip of the painted panel (`panelOverlay`);
  `quickSlotAt(x, y)` finds one from panel pixels. `core/game.js` redraws the panel when the bar's picture changes
  (counts, mana, cooldowns), and owns the keys.
- `ui/quickbar-hud.js`: the phone buttons, and `dragGesture`, the one press / hold / drag gesture the bar, the satchel
  and the spell list share. The slot buttons are art canvases like every other icon (see [mobile-ui.md](mobile-ui.md)).

## Bots

`sim.quickbar()` (the slots as `quickView()`), `sim.setQuick(slot, { kind, id })`, `sim.clearQuick(slot)` and
`sim.quick(slot)` (press: 400 ms, result as `useItem`, `equip` or `cast`, or `{ ok: false, reason: 'empty' | 'none' |
'dead' | ... }`). See [bots.md](bots.md).

## Not yet

A picker that opens on an empty slot, to choose from what can go in it; showing a key number on each slot; a second row.
