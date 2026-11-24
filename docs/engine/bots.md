# Bots: playing without a screen

The engine can play a campaign with no browser. A **bot** issues the same actions a player has (step, turn, attack,
use, open, take, equip, drink) and reads back what a player would see. Runs are fast (about 50 full Undercrypt runs a
second) and repeatable: the same seed, scenario and bot always play the same game. That lets loot, equipment and
difficulty be tuned against measurements instead of guesses.

```
node tools/play.mjs --bot fighter --scenario undercrypt --runs 200 --out reports/fighter.json --csv reports/fighter.csv
node tools/play.mjs compare reports/before.json reports/after.json
node tools/play.mjs --bot explorer --scenario undercrypt --seed 17 --runs 1 --trace     # one run, every event
```

Its options are listed at the top of `tools/play.mjs`. There is nothing to install: it only needs Node.

## How it fits together

| File | What it does |
| --- | --- |
| `engine/core/session.js` | The rules of a playthrough with no DOM: the hero, the pack, the world, fights, containers, saving. The browser game (`game.js`) draws a session; the simulation drives one. Time comes from a `clock()` and chance from a `random()`. |
| `engine/core/rng.js` | `createRng(seed)`: a seeded random. `?seed=17` in the game's URL uses it too, to replay in the browser what a bot found. |
| `engine/sim/simulation.js` | `createSimulation({ campaign, seed, scenario })`: a session on a virtual clock with fixed time steps (`tickMs`, 50 ms). Time passes only when the bot acts or waits. |
| `engine/sim/observe.js` | What a bot can see, as plain data. |
| `engine/sim/runner.js` | `runBot`, `runBots`: run a bot many times and measure it; `summarise`, `toCsv`, `compareReports`. |
| `tools/play.mjs` | The command line. |
| `tools/bots/` | Example bots: `random-walker`, `explorer`, `fighter`, and their shared `tactics.mjs`. |
| `games/<campaign>/scenarios.js` | A campaign's named starting points for bots (`--scenario undercrypt`). |

## Writing a bot

A bot is a module whose default export has an `act` method:

```js
// my-bot.mjs: run with node tools/play.mjs --bot ./my-bot.mjs --scenario undercrypt
export default {
  name: 'cautious',
  description: 'Retreats to drink, otherwise fights.',
  scenario: { level: 'dungeon' },          // optional: where it plays when no --scenario is given
  start(sim, memory) {},                   // optional: once per run
  act(sim, memory) {                       // called until the run is over
    const { hero } = sim.state();
    const foe = sim.monsters().find(m => m.adjacent);
    if (hero.hp < hero.maxHp / 3 && sim.quaff('hp').ok) return;
    if (foe) { sim.attack(foe.id); return; }
    sim.forward().ok || sim.turnRight();
  },
  done: (sim, memory) => sim.state({ omniscient: true }).monsters.length === 0, // optional: true ends the run as won
};
```

`act` should take at least one action per call; a call that lets no time pass is followed by a 100 ms wait. `memory`
is a fresh object per run for the bot's own notes, with `memory.options` (from `--option key=value`) and
`memory.random`, the bot's own seeded chance (separate from the game's, so a bot rolling dice does not change how the
fights go). `act` and `done` may be async.

A run ends when the hero dies (`dead`), when `done` or the scenario's `goal` says so (`won`), or at `--max-time`
(`timeout`).

## The control API

Every action takes game time, as it does for a player, and the creatures act meanwhile. Results are plain objects;
an action the rules forbid returns `{ ok: false, reason }` and never throws.

| Action | Time | Result |
| --- | --- | --- |
| `forward()`, `back()`, `strafeLeft()`, `strafeRight()`, `move(cmd)` | 180 ms (strafe 150) | `{ ok }`, `{ ok: false, reason: 'wall' \| 'creature' \| 'door' \| 'locked' }`, or `{ ok, travelled: levelId }` through a passage |
| `turnLeft()`, `turnRight()`, `face(dir)` | 160 ms a turn | `face` turns the short way to 0 N, 1 E, 2 S, 3 W |
| `walkTo({ x, z }, { until })` | per step | walks along explored floor; `{ ok }` or `{ ok: false, reason: 'no-path' \| 'blocked' \| 'until' }` |
| `attack(id?)` | waits for the cooldown | `{ ok, hit, damage, killed, target, hp }`, or `{ ok: false, reason: 'gone' \| 'far' \| 'empty' }`. Without an id: the creature faced |
| `interact()`, `talk()` | 250 ms | Use on what is faced; `{ ok, container }` when a container opened |
| `container()`, `take(i)`, `takeAll()` | 200 ms | the open container's stacks; take one stack or all |
| `use(itemOrSlot)`, `quaff('hp' \| 'mp')` | 400 ms | use an item; drink the first potion that restores hp or mp |
| `equip(itemOrSlot, slot?)`, `unequip(slot)` | 600 ms | |
| `drop(itemOrSlot, qty?)` | 200 ms | onto the floor here |
| `wait(ms)` | `ms` | |
| `cast()` | | `{ ok: false, reason: 'no-spells' }` until spells exist (M8) |
| `travel(level, spawn?)` | 0 | a scenario shortcut, as content's `game.travel` does; a player travels by stepping into a passage |
| `stop(outcome?)` | | end the run (`'won'` or `'stopped'`) |

The pace is the browser game's step and turn animations; `createSimulation({ pace: { step: 250 } })` changes it.

## Observation

| Call | Returns |
| --- | --- |
| `state()` | `{ t, level, position: { x, z, dir, facing }, dead, hero: { hp, maxHp, mp, maxMp, attack, defence, accuracy, evasion, attrs, attackReady }, inventory: [{ slot, id, qty, name, type, restores?, wear? }], equipment, monsters, ahead, here, container, explored }` |
| `monsters()` | creatures in sight: `[{ id, kind, name, x, z, dir, hp, maxHp, mode, distance, adjacent }]`, nearest first |
| `view(depth)` | the tiles straight ahead: `[{ d, x, z, wall?, door?, exit?, things, monsters }]` |
| `map()` | the explored level: `{ rows, known(x, z), open(x, z), explored }`; rows use `#` wall, `.` floor, `+` shut door, space unknown |
| `path({ x, z }, { known })` | the shortest walk as directions, over explored floor (or any floor with `known: false`) |
| `exits()` | the level's passages: `[{ x, z, dir, to }]` |
| `drain()`, `on(type, fn)` | the events so far (and forget them), or a listener |
| `time`, `over`, `outcome`, `level`, `position`, `dead`, `messages` | |

A bot sees what a player sees: creatures on its tile, beside it, or down the three columns ahead as far as the view
goes (3 tiles), stopping at a wall. `state({ omniscient: true })` lists every creature on the level instead, for a
`done` check or a test. `sim.session` is the whole session, for anything else; using it is cheating, which is fine in a
test.

### Events

Each is `{ type, t, level, ... }`. The list is `EVENTS` in `engine/core/session.js`:

`message { text }`, `move { cmd, x, z, dir }`, `blocked { cmd, reason }`, `attack { target, hit, damage }`,
`damage-dealt { target, amount, hp }`, `kill { target }`, `damage-taken { source, amount, hp }`, `evade { source }`,
`death { source }`, `respawn { to }`, `container { title, stacks }`, `pickup { item, qty, from }`, `drop { item, qty }`,
`use { item, consumed, message }`, `equip { item, slot }`, `unequip { item, slot }`, `level { from, to }`.

XP and gold events arrive with XP (M8) and gold (M12).

## Scenarios

Where and how a run starts. All fields are optional:

```js
{
  save,                         // a snapshot (sim.snapshot(), or a game save) to start from; the rest applies on top
  level: 'dungeon', at: { x: 1, z: 1, dir: 2 },
  hero: { name, spent: { strength: 2 }, hp, mp },  // points spent at character creation; current hp and mp
  items: [{ item: 'health-potion', qty: 2 }],      // added to the pack
  equip: ['iron-sword'],        // worn (taken from the pack, or given)
  clear: true,                  // remove the level's own creatures first
  spawn: [{ kind: 'snake', id: 'duel', x: 1, z: 3, dir: 0 }],
  flags: { 'quests.horn': 'given' },
  grace: 0,                     // ms before the creatures first move (default: the level's monsterGraceMs)
  goal: sim => ...,             // true ends the run as won
}
```

A campaign keeps its named ones in `games/<campaign>/scenarios.js` (`export const scenarios = { ... }`). Ravensmoor
has `start`, `undercrypt` (the crypt as a player first enters it, with the village chest's rusty sword and potions),
`undercrypt-geared` (the same with the mace, shield, mail and helmet Ravensmoor hides), `undercrypt-unarmed` and `snake-duel`. `--scenario` also takes a `.json` or `.mjs` file.

## Reports

`--out` writes `{ bot, campaign, seed, scenario, runs: [...], summary }`; `--csv` one row per run.

A run: `seed`, `outcome`, `survived`, `time`, `level`, `kills`, `killsByKind`, `attacks`, `hits`, `misses`,
`damageDealt`, `damageTaken`, `blowsTaken`, `evaded`, `potionsUsed`, `itemsUsed`, `loot` (item → count), `lootItems`,
`lootValue`, `hpEnd`, `hpMin`, `timeToKill` (ms from the first swing at a creature to its death, per kill),
`meanTimeToKill`, `explored`, `deaths`, `deathBy`, `levels` (per level: time, kills, damage dealt and taken, loot,
explored tiles) and `curve` (every `--sample` seconds: hp, kills, damage taken, loot, explored, alive). With
`--trace`, every event too.

The summary: outcomes, `survivalRate`, `winRate`, the mean, median, min and max of every measure, kills and loot per
run by kind, what killed the hero, per-level means, and the progress curve averaged over the runs (a run that ended
counts as it ended).

`lootValue` adds up the items' `value`. No item has one yet; it will matter once gold does (M12).

## Balancing

Make a report, change the numbers, make it again with the same seeds and compare:

```
node tools/play.mjs --bot fighter --scenario undercrypt --runs 200 --out reports/before.json --quiet
# ... retune engine/content/bestiary.js, a level, an item ...
node tools/play.mjs --bot fighter --scenario undercrypt --runs 200 --out reports/after.json --quiet
node tools/play.mjs compare reports/before.json reports/after.json
```

Because the seeds are the same, a difference comes from the change, not from luck. To see a run in the browser, open
the game with `?seed=<n>`: the dice are the same, although a human's timing will not be.

The first measurement (November 2026): an armed hero with the village chest's potions does not survive the
Undercrypt. Over 200 runs each, the fighter and the explorer bots die every time, after about 9 kills, mostly to the
owlbear and the ogre. A lone snake is no danger to an armed hero (200 wins out of 200, 10 damage taken on average).

After weapons and armour (M7), the fighter over 200 runs each: with the rusty sword the village chest now gives,
7.5 kills per run (it was 9.5 with the old, stronger sword); bare-handed 5.8; with the gear Ravensmoor hides
(`undercrypt-geared`: iron mace and shield, rusty mail, iron helmet) 9.7, and only the ogre, owlbear, troll, spider
and ghoul still kill it. The snake duel with the rusty sword: 200 wins, 13 damage taken on average.
