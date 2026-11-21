# TODO

Scope: the 2D compositing engine (`engine2d/`) and game two, the Old Quarter
and the Undercrypt (`game-2/`).

One backlog, in build order. Each milestone lists the **engine** work first,
then the **game** stories it unlocks, so no story appears before the engine
feature it needs. Work top to bottom; items inside a milestone can go in any order.
`[x]` means it already exists.

## Done

- [x] Engine: grid movement with step, turn and strafe animations; swipe and keyboard input
- [x] Engine: level registry with exits/doors between levels and per-level assets
- [x] Engine: atmosphere (darkness, distance fog) and fog-of-war map discovery
- [x] Engine: real-time roaming monsters with sight and pursuit; directional, depth-based sprites
- [x] Engine: defeat screen and respawn
- [x] Game: village courtyard, 17×17 Undercrypt maze, one roaming snake

## M1 — Interaction

*Everything else hangs off "do something to what I'm facing".*

**Engine**
- [x] Interact action (Use button, F/Space) that triggers the entity on the faced tile side
- [x] Entity behaviours as data (`examine`, later `talk`, `open`, `shop`) instead of names only
- [x] Message log history viewable in a menu (Message log dialog, L)

**Game**
- [x] As a player, I want to examine the well, barrels and crates and read a line about each.

## M2 — Items and containers

**Engine**
- [ ] Item definitions as data (type, icon, stack size, effects, value)
- [ ] Inventory that changes: pick up, drop, stack (replaces the four hard-coded items)
- [ ] Containers and loot tables (chests, hidden stashes)
- [ ] Quick-item slots bound to inventory items

**Game**
- [ ] As a player, I want to open the chest by the dungeon door and find starting supplies.
- [ ] As a player, I want to sometimes find something hidden in the well, barrels and crates.

## M3 — Character stats and combat

*Needs M2 (potions, weapon) and the existing monster simulation.*

**Engine**
- [ ] Character model: attributes derived into HP/MP, attack and defence
- [ ] Consumables that really heal (health and mana potions)
- [ ] Equipment slots that change stats (weapon, shield, armour)
- [ ] Monster stats (HP, damage, defence, speed)
- [ ] Player melee attack with cooldown, hit and miss feedback
- [ ] Monster attack replaces instant death on contact; hurt and death animations
- [ ] Defeat rules: what death costs, where you wake up

**Game**
- [ ] As a player, I want to fight the snake instead of dying the moment it touches me.
- [ ] As a player, I want to drink a health potion mid-fight to survive.
- [ ] As a player, I want death to send me back to the village without losing everything.

## M4 — Loot, XP and progression

*Needs M2 (loot tables) and M3 (kills, stats).*

**Engine**
- [ ] Monster drops via loot tables
- [ ] XP, levelling and stat increases
- [ ] Spells that cost MP (at least one attack and one heal)
- [ ] Status effects (poison, regeneration, blessing) with durations
- [ ] Monster respawn rules

**Game**
- [ ] As a player, I want to gain experience from fights and grow stronger.
- [ ] As a player, I want the snake to drop something worth having.

## M5 — Flags and dialogue

**Engine**
- [ ] World flags/variables that dialogue, events and quests can read and set
- [ ] Dialogue trees as data: lines, choices, conditions, effects
- [ ] Dialogue UI on desktop and mobile
- [ ] `talk` entity behaviour (builds on M1)

**Game**
- [ ] As a player, I want to talk to the town guard so I learn what is wrong in Ravensmoor.
- [ ] As a player, I want villagers to say something different once things change (uses flags; final lines wait for M7).

## M6 — Quests

*Needs M5 (flags, dialogue) and M2 (a quest item).*

**Engine**
- [ ] Quest system: stages, objectives, completion, rewards
- [ ] Journal that lists active and completed quests (replaces the fixed sentence)
- [ ] Level events and triggers (on enter tile, on face side, on flag set)

**Game**
- [ ] As a player, I want the hooded stranger to give me a quest to retrieve something from the Undercrypt.
- [ ] As a player, I want my journal to show what I am supposed to do next.

## M7 — Economy

*Needs M2 (items), M3 (equipment), M5 (dialogue entry point).*

**Engine**
- [ ] Gold as a currency
- [ ] Merchants: buy/sell UI, prices, stock
- [ ] `shop` entity behaviour

**Game**
- [ ] As a player, I want to buy potions at the alchemist's stall so I can prepare for the dungeon.
- [ ] As a player, I want to buy or upgrade a weapon at the smith so I stand a chance against monsters.
- [ ] As a player, I want to find gold in the maze so exploring dead ends pays off (needs M4 loot).

## M8 — Dungeon mechanics

*Needs M2 (keys as items), M3 (trap damage), M6 (events and triggers).*

**Engine**
- [ ] Locked doors and keys; doors that open, close or are hidden
- [ ] Secret walls and pressure plates
- [ ] Traps (damage tiles, darts, pits) with detect/disarm hooks
- [ ] Stairs and multi-floor dungeons (only if the dungeon grows past one floor)
- [ ] Tougher monster types and behaviours (patrol, guard, flee); a boss

**Game**
- [ ] As a player, I want a locked door that needs a key found elsewhere in the maze.
- [ ] As a player, I want at least one trap and one secret passage to reward paying attention.
- [ ] As a player, I want a final room with the quest item, guarded by a tougher monster.

## M9 — Sound

*Independent of the rest, so it can slot in anywhere, but it lifts earlier milestones.*

**Engine**
- [ ] Ambient sound and music per level
- [ ] Sound effects for steps, doors, hits and pickups
- [ ] Positional cue for monsters (louder as they approach)

**Game**
- [ ] As a player, I want to hear the creature before I see it, so the darkness feels tense.

## M10 — Persistence and character creation

*Do this once the state to save is stable (inventory, flags, quests, stats).*

**Engine**
- [ ] Save/load to localStorage (position, level, map discovery, inventory, flags, quests, stats)
- [ ] Autosave on level change; continue/new game on start
- [ ] Character creation screen
- [ ] Desktop HUD equivalents for inventory, journal and dialogue (parity with mobile)

**Game**
- [ ] As a player, I want my progress saved so reloading the page doesn't reset the game.
- [ ] As a player, I want death to return me to my last save or the village (revises the M3 rule).
- [ ] As a player, I want to name my hero and pick a few starting attributes.

## M11 — Ending

**Game**
- [ ] As a player, I want to return the item to the stranger, get a reward and see a short ending that sets up the next episode.

## Later — art pipeline and toolkit

*Not required by any game story. Pick up when the game needs more art or other people start making levels.*

- [ ] Prop art pipeline for eye-level, per-side props (merge the stall/well work from `2d-demo-comfyui-experiments`)
- [ ] Experiment 3: full AI-generated screens per cell/direction, mixable per area
- [ ] Level data validation (unreachable cells, bad exits, missing art) as one command
- [ ] Visual level editor (tile map, entities, exits)
- [ ] Dialogue and quest editor
