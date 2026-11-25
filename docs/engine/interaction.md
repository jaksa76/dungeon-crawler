# Using what you face

Click or tap an object to use that exact object. Walls and transparent pixels do not select objects behind them. Reach follows the table below. Click/tap a creature to attack instead (hold to repeat).

Press **Space** to act on whatever you
are facing (on a phone, tap the thing itself: there is no Use button). Nothing blocks a tile, so "facing" follows the rule used by the
"You see…" messages:

| What | Result |
| --- | --- |
| Against the far side of your own tile | used |
| Against the near side of the tile ahead | used |
| Against the far side of the tile ahead | "Step closer to use …" |
| A passage door ahead, nothing else in reach | the door's message |
| Nothing | "There is nothing to use here." |

## Behaviours are data, or methods

A thing's behaviour is its `interact(game)` method (see [behaviour.md](behaviour.md)); the data form below is turned into one
by the engine's factories.

An entity, or the prop it is built from, carries a `behavior`:

```js
// engine/content/props.js, on a prop: every barrel inherits it
barrel: { w: .231, h: .32,
  behavior: { type: 'examine', text: 'A sealed barrel that smells faintly of pickled fish.' } },

// on one entity in a level: replaces the prop's default
{ prop: 'barrel', x: 3, z: 3, side: 'E', behavior: { type: 'examine', text: 'Empty.' } },
```

`engine/rules/interaction.js` maps each `type` to a handler. `examine` and `open` are registered;
future `talk` and `shop` handlers use the same path for pointing and Use. An unknown type throws when the
level loads. A named entity with no behaviour answers "You study …, but there is
nothing to do yet."

## Messages

Every message goes to the on-screen log, which now wraps long lines, and to a
history of the last 100. **L**, or the **Message log** button in the Field
journal, opens them newest first in a panel that covers only the scene, so the bar or
rails stay visible. It is the same panel every menu uses
(journal, bag, settings, item descriptions) and the game-over screen too. The
content scrolls; **Close**, **L** (for the log) or Escape closes it. Movement and monsters pause while it is open. Its text is the 5 × 8 bitmap font on the same pixel grid as the rest of the screen (see [ui.md](ui.md)).

## Checks

`node --test tests/interaction.test.mjs` covers reach, behaviour
precedence and validation. In a browser (`tests/browser/m5.browser.mjs`), check taps and holds on a creature and an object on desktop and on a phone held sideways,
and that the message log scrolls.
