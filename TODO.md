# TODO

Scope: the 2D compositing engine (`engine2d/`) and game two, the Old Quarter
and the Undercrypt (`game-2/`).

One backlog, in build order. Each milestone lists the **engine** work first,
then the **game** stories it unlocks, so no story appears before the engine
feature it needs. Work top to bottom; items inside a milestone can go in any order.
`[x]` means it already exists; `[~]` is partly done.

## Done

- [x] Engine: grid movement with step, turn and strafe animations; swipe and keyboard input
- [x] Engine: level registry with exits/doors between levels and per-level assets
- [x] Engine: atmosphere (darkness, distance fog) and fog-of-war map discovery
- [x] Engine: real-time roaming monsters with sight and pursuit; directional, depth-based sprites
- [x] Engine: defeat screen and respawn
- [x] Game: village courtyard, 17×17 Undercrypt maze, one roaming snake
- [x] Art: 144 icons (120 items, 24 interface) painted with Codex, in one atlas; used in the HUD, the painted panel and the satchel

## M1 — Interaction

*Everything else hangs off "do something to what I'm facing".*

**Engine**
- [x] Interact action (Use button, F/Space) that triggers the entity on the faced tile side
- [x] Entity behaviours as data (`examine`, later `talk`, `open`, `shop`) instead of names only
- [x] Message log history viewable in a menu (Message log panel, L)

**Game**
- [x] As a player, I want to examine the well, barrels and crates and read a line about each.

## M2 — Items, containers and inventory

**Engine**
- [x] Item definitions as data (type, icon, name, description)
- [x] Inventory screen: painted background (Codex), tall hero niche, 8×4 grid with drag to move/merge/swap, item description with Use / Drop / Drop all, **I** key
- [x] Hero view: a full-body picture in the niche with equipment slots
- [x] Inventory that changes: pick up, drop, stack
- [x] Containers and loot tables (chests, hidden stashes)
- [x] Take all button when container is open

**Game**
- [x] As a player, I want to open the chest by the dungeon door and find starting supplies.
- [x] As a player, I want to find something hidden in the well, barrels and crates.

## M2.1 - Equipping items

**Engine**
- [x] Inventory screen to display the full body of the character on the left side, not just the portrait. (generated with Codex)
- [x] Inventory screen should have slots on the left side for equipment (weapon, shield, armour, head, rings, amulet, etc.)
- [x] Player should be able to place items in compatible slots. No change in portrait.
- [x] Equipped items do not appear in inventory.

**Game**
- [x] As a player I want to start with zero equipment an once I find a sword I want to be able to equip it.

## M3 — Character stats and combat

*Needs M2 (potions, weapon) and the existing monster simulation.*

**Engine**
- [x] Character model: attributes derived into HP/MP, attack and defence
- [x] Consumables that really heal (health and mana potions): done early, via Use in the satchel
- [x] Equipment slots that change stats (weapon, shield, armour)
- [x] Monster stats (HP, damage, defence, speed)
- [x] Player melee attack with cooldown, hit and miss feedback
- [x] Monster attack replaces instant death on contact; hurt and death animations

**Game**
- [x] As a player, I want to fight the snake instead of dying the moment it touches me.
- [x] As a player, I want to drink a health potion mid-fight to survive.

## M4 — Persistence and game state

*Moved up so the shape of the game state is designed early, while it is still small. Everything added later (stats, flags, quests, loot, map knowledge) plugs into this one serialisable state.*

**Engine**
- [ ] One serialisable game state (position, level, map discovery, inventory, equipment, stats, flags, known locations) separate from rendering and input
- [ ] Versioned save format with migrations, so old saves survive changes
- [ ] Save/load to localStorage; autosave on level change; continue/new game on start
- [ ] Character creation screen
- [ ] Desktop HUD equivalents for inventory, journal and dialogue (parity with mobile)

**Game**
- [ ] As a player, I want my progress saved so reloading the page doesn't reset the game.
- [ ] As a player, I want death to return me to my last save or the village (revises the M3 rule).
- [ ] As a player, I want to name my hero and pick a few starting attributes.

## M5 — Combat interaction and monster animation

*Needs M3 (combat). Replaces attacking with the Use button by pointing at what you want to hit.*

**Engine**
- [ ] More sprites per monster: idle, walk, attack and dead frames, plus take-damage if the budget allows (the current sprites stay as the base)
- [ ] Animation state machine per monster (idle, move, attack, hurt, dead) driven from monster data, with a frame count and timing per state
- [ ] Attack by clicking/tapping a monster; hold the button down to keep attacking at the weapon's cooldown
- [ ] Several monsters on one tile are laid out side by side (and by depth) so each can be targeted separately
- [ ] Click/tap on an interactive object interacts with it instead (examine, open, talk); the target under the pointer decides which action happens
- [ ] Hover/target feedback (cursor change, highlight, health bar on the targeted monster)
- [ ] Corpses stay briefly (dead animation plays out) before they disappear

**Game**
- [ ] As a player, I want to see the snake rear up, strike and collapse, so fights feel real.
- [ ] As a player, I want to click the monster I want to hit when several are in front of me.

## M6 — Automated test player

*Needs M4 (serialisable state). Built before balancing, so loot, equipment and difficulty can be tuned against measurements rather than guesses.*

**Engine**
- [ ] A headless-capable control API: issue the same actions a player can (move, turn, attack a target, interact, use/equip/drop an item, cast, talk, travel) and read back state, view and message log
- [ ] Deterministic mode: seedable RNG and a fixed time step, so a run can be replayed exactly
- [ ] Fast-forward simulation without rendering, for thousands of runs
- [ ] Observation API: state snapshot and events (damage dealt/taken, kills, drops, deaths, XP, gold) as plain data
- [ ] Scenario setup: start from a saved state, place the hero, spawn monsters, grant items
- [ ] Run reports: win/lose, time to kill, damage taken, potions used, progress curve, written as JSON/CSV
- [ ] Documented bot interface and example bots (random walker, fighter, explorer), so a coding agent can write its own player and run it from the command line

**Game**
- [ ] As a designer, I want to run a bot through the Undercrypt hundreds of times and see how often it survives.
- [ ] As a designer, I want a balance report (kills, damage, loot value per level) I can compare after every tuning change.

## M7 — Weapons, armour and equipment

*Needs M2.1 (slots), M3 (stats) and M6 (to check the numbers).*

**Engine**
- [ ] Weapon definitions: damage range, speed, reach, weapon types (blade, blunt, ranged) with different behaviour
- [ ] Armour definitions: defence, resistances, weight/penalties, per slot (head, body, shield, rings, amulet)
- [ ] Item tiers and rarity, with requirements (level, attributes)
- [ ] Equipment modifiers (bonuses to stats, damage types, on-hit effects)
- [ ] Item comparison in the satchel (what changes if I equip this?)
- [ ] Equipment shown on the hero figure in the inventory

**Game**
- [ ] As a player, I want a rusty weapon at the start and a clear upgrade path to better gear.
- [ ] As a player, I want armour to make the next fight noticeably safer.

## M8 — Loot, XP and progression

*Needs M2 (loot tables), M3 (kills, stats), M7 (what to drop) and M6 (to balance it).*

**Engine**
- [ ] Dynamic loot: drops computed from the monster, dungeon level and player level (and optionally luck), not fixed lists
- [ ] Loot budgets as the balancing lever: value per monster and per level is declared in data, and the generator spends it
- [ ] Loot tables can be tuned from the bot reports (M6) without code changes
- [ ] XP, levelling and stat increases
- [ ] Spells that cost MP (at least one attack and one heal)
- [ ] Status effects (poison, regeneration, blessing) with durations
- [ ] Monster respawn rules

**Game**
- [ ] As a player, I want to gain experience from fights and grow stronger.
- [ ] As a player, I want the snake to drop something worth having.
- [ ] As a designer, I want the difficulty curve verified by bots before it ships.

## M9 — World map and travel

*Needs M4 (state to remember known locations). The map and its locations belong to the game; the engine only provides the mechanism.*

**Engine**
- [ ] World map screen: a painted map with location markers, shown when the player leaves through a gate
- [ ] Locations as game data (id, name, position on the map, entry level, requirements); the engine has no built-in map
- [ ] Known/unknown locations: only discovered ones are shown, discovery set by flags, dialogue, quests or finding the place
- [ ] Travel between locations (select a marker, then arrive at that location's entry point), with optional travel time or random encounters
- [ ] Exit type that leads to the world map instead of a fixed level
- [ ] Map state saved with the game (M4)

**Game**
- [ ] A gate in the village that leads out; leaving through it opens the world map.
- [ ] A second, larger village as another location, with its own levels, entities and art.
- [ ] As a player, I want to learn about a new place and see it appear on my map.
- [ ] As a player, I want to travel between the two villages and the Undercrypt.

## M10 — Flags and dialogue

**Engine**
- [ ] World flags/variables that dialogue, events and quests can read and set (part of the saved state, M4)
- [ ] Dialogue trees as data: lines, choices, conditions, effects
- [ ] Dialogue UI on desktop and mobile
- [ ] `talk` entity behaviour (builds on M1)

**Game**
- [ ] As a player, I want to talk to the town guard so I learn what is wrong in Ravensmoor.
- [ ] As a player, I want villagers to say something different once things change (uses flags; final lines wait for the ending).

## M11 — Quests

*Needs M10 (flags, dialogue) and M2 (a quest item).*

**Engine**
- [ ] Quest system: stages, objectives, completion, rewards
- [ ] Journal that lists active and completed quests (replaces the fixed sentence)
- [ ] Level events and triggers (on enter tile, on face side, on flag set)

**Game**
- [ ] As a player, I want the hooded stranger to give me a quest to retrieve something from the Undercrypt.
- [ ] As a player, I want my journal to show what I am supposed to do next.

## M12 — Economy

*Needs M2 (items), M7 (equipment), M10 (dialogue entry point). The second village (M9) is a natural home for a bigger market.*

**Engine**
- [ ] Gold as a currency
- [ ] Merchants: buy/sell UI, prices, stock
- [ ] `shop` entity behaviour

**Game**
- [ ] As a player, I want to buy potions at the alchemist's stall so I can prepare for the dungeon.
- [ ] As a player, I want to buy or upgrade a weapon at the smith so I stand a chance against monsters.
- [ ] As a player, I want to find gold in the maze so exploring dead ends pays off (needs M8 loot).

## M13 — Dungeon mechanics

*Needs M2 (keys as items), M3 (trap damage), M11 (events and triggers).*

**Engine**
- [ ] Locked doors and keys; doors that open, close or are hidden
- [ ] Secret walls and pressure plates
- [ ] Traps (damage tiles, darts, pits) with detect/disarm hooks
- [ ] Stairs and multi-floor dungeons (only if the dungeon grows past one floor)
- [ ] Tougher monster types and behaviours (patrol, guard, flee); a boss, using the M5 animation set

**Game**
- [ ] As a player, I want a locked door that needs a key found elsewhere in the maze.
- [ ] As a player, I want at least one trap and one secret passage to reward paying attention.
- [ ] As a player, I want a final room with the quest item, guarded by a tougher monster.

## M14 — Sound

*Independent of the rest, so it can slot in anywhere, but it lifts earlier milestones.*

**Engine**
- [ ] Ambient sound and music per level
- [ ] Sound effects for steps, doors, hits and pickups
- [ ] Positional cue for monsters (louder as they approach)

**Game**
- [ ] As a player, I want to hear the creature before I see it, so the darkness feels tense.

## M15 — Ending

**Game**
- [ ] As a player, I want to return the item to the stranger, get a reward and see a short ending that sets up the next episode.

## Later — art pipeline and toolkit

*Not required by any game story. Pick up when the game needs more art or other people start making levels.*

- [ ] Prop art pipeline for eye-level, per-side props (merge the stall/well work from `2d-demo-comfyui-experiments`)
- [ ] Experiment 3: full AI-generated screens per cell/direction, mixable per area
- [ ] Level data validation (unreachable cells, bad exits, missing art) as one command
- [ ] Visual level editor (tile map, entities, exits)
- [ ] Dialogue and quest editor
