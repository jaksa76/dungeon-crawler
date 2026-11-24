# Using what you face

Click or tap an object to use that exact object. Walls and transparent pixels do not select objects behind them. Reach follows the table below. Click/tap a creature to attack instead (hold to repeat).

Press **Space**, or tap **Use** on a phone, to act on whatever you
are facing. Nothing blocks a tile, so "facing" follows the rule used by the
"You see…" messages:

| What | Result |
| --- | --- |
| Against the far side of your own tile | used |
| Against the near side of the tile ahead | used |
| Against the far side of the tile ahead | "Step closer to use …" |
| A passage door ahead, nothing else in reach | the door's message |
| Nothing | "There is nothing to use here." |

## Behaviours are data

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
journal, opens them newest first in a panel that covers only the scene, so the side
rails, meters and controls stay visible. It is the same panel every menu uses
(journal, bag, settings, item descriptions) and the game-over screen too. The
content scrolls; **Close**, **L** (for the log) or Escape closes it. Movement and monsters pause while it is open. Its text is set
at a whole multiple of the 8-pixel font, matching the pixel size of the UI around
it (3× on a 960px desktop view, 2× on phones).

## Checks

`node --test tests/interaction.test.mjs` covers reach, behaviour
precedence and validation. In a browser, check Use on desktop, mobile
landscape (button in the right rail) and portrait (above the turn buttons),
that a held Use button does not repeat, and that the full-screen message log scrolls.
