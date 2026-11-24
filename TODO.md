# TODO

Scope: the engine (`engine/`) and the Ravensmoor campaign, the Old Quarter
and the Undercrypt (`games/ravensmoor/`). See docs/engine/content.md for what goes where.

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
- [x] Engine: character screen (P, or click the portrait) where skill points are spent, a help screen (H), and Save and Load screens reached from Settings
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
- [x] One serialisable game state, separate from rendering and input (`engine/core/persistence.js`, see `docs/engine/persistence.md`). Known locations join it with the world map (M9).
- [x] Versioned save format with per-section migrations, so old saves survive changes
- [x] Persistence registry: engine components register their own sections, a game adds its own (`persist`) or uses flags; engine and game ids are namespaced
- [x] Save slots, autosave policy set by the game, on-screen message when saving fails
- [x] Save/load to localStorage; autosave on level change, when the page is hidden and every 5 s; continue/new game on start
- [x] Load a save while playing (`loadState`), across levels
- [x] Stable entity ids (a container is saved by its `id`, not its position) and item `aliases` so renames do not lose items
- [x] Save what the player chose (name, points spent), never derived stats, so retuning the game reaches old saves
- [x] Character creation screen
- [x] Desktop parity: the painted panel's journal and satchel icons and the I, J, L and Esc keys open the same menus as the phone buttons. Dialogue has no screen yet; its desktop and mobile UI is in M10.
- Moved on: levels and XP (what is saved as progression) arrive with M8; a per-level state scope arrives with the first per-level state that needs it (monster respawn in M8, doors in M13).

**Game**
- [x] As a player, I want my progress saved so reloading the page doesn't reset the game.
- [x] As a player, I want death to return me to my last save or the village (revises the M3 rule).
- [x] As a player, I want to name my hero and pick a few starting attributes.

## M5 — Combat interaction and monster animation

*Needs M3 (combat). Replaces attacking with the Use button by pointing at what you want to hit.*

**Engine**
- [x] More sprites per monster: idle, walk, attack and dead frames, plus take-damage if the budget allows (the current sprites stay as the base)
- [x] Animation state machine per monster (idle, move, attack, hurt, dead) driven from monster data, with a frame count and timing per state
- [x] Attack by clicking/tapping a monster; hold the button down to keep attacking at the weapon's cooldown
- [x] Several monsters on one tile are laid out side by side (and by depth) so each can be targeted separately
- [x] Click/tap on an interactive object interacts with it instead (examine, open, talk); the target under the pointer decides which action happens
- [x] Hover/target feedback (cursor change, highlight, health bar on the targeted monster)
- [x] Corpses stay briefly (dead animation plays out) before they disappear

**Game**
- [x] As a player, I want to see the snake rear up, strike and collapse, so fights feel real.
- [x] As a player, I want to click the monster I want to hit when several are in front of me.

## M6 — Automated test player

*Needs M4 (serialisable state). Built before balancing, so loot, equipment and difficulty can be tuned against measurements rather than guesses.*

**Engine**
- [x] A headless-capable control API: issue the same actions a player can (move, turn, attack a target, interact, use/equip/drop an item, cast, talk, travel) and read back state, view and message log
- [x] Deterministic mode: seedable RNG and a fixed time step, so a run can be replayed exactly
- [x] Fast-forward simulation without rendering, for thousands of runs
- [x] Observation API: state snapshot and events (damage dealt/taken, kills, drops, deaths, XP, gold) as plain data
- [x] Scenario setup: start from a saved state, place the hero, spawn monsters, grant items
- [x] Run reports: win/lose, time to kill, damage taken, potions used, progress curve, written as JSON/CSV
- [x] Documented bot interface and example bots (random walker, fighter, explorer), so a coding agent can write its own player and run it from the command line

**Game**
- [x] As a designer, I want to run a bot through the Undercrypt hundreds of times and see how often it survives.
- [x] As a designer, I want a balance report (kills, damage, loot value per level) I can compare after every tuning change.

## M7 — Weapons, armour and equipment

*Needs M2.1 (slots), M3 (stats) and M6 (to check the numbers).*

*The engine provides the mechanism; the game decides every number (weapon kinds, materials, damage types, resistances).*

See docs/engine/equipment.md.

**Engine**
- [x] Damage types as an open set the game declares (Ravensmoor: blade, blunt, pierce; magic types later)
- [x] Weapon definitions: damage range, speed (attack cooldown) and damage type; bare fists when nothing is wielded
- [x] Combat uses them: weapon roll + strength bonus, × the target's resistance to the damage type, − defence
- [x] Resistances per damage type on monsters and on armour
- [x] Armour definitions: defence and optional resistances, per slot
- [x] Materials: weapon/armour kinds × materials (rusty, iron, steel, …) generate the items as plain definitions, so inventory and saves stay `{id, qty}`
- [x] Material colour swap: one icon per kind, its grey metal recoloured per material when first drawn (both icon styles)
- [x] What changed: equipping logs the difference (`damage 4–7 → 6–9, slower`); the satchel's item text shows stats and the difference to what is worn

**Game**
- [~] As a player, I want a rusty weapon at the start and a clear upgrade path to better gear. (Rusty sword → iron mace in the game; steel and mithril exist but are placed by loot, M8, and shops, M12.)
- [x] As a player, I want a better weapon in a chest in the dungeon.
- [x] As a player, I want a mace or a spear to be the better choice against some monsters.
- [x] As a player, I want armour to make the next fight noticeably safer.

Deferred: rarity (out of scope); outline for magic items and on-hit effects (M8.1, with magic and status effects);
ranged weapons and ammunition (own milestone); equipment drawn on the hero figure (Later). No attribute or level requirements.

## M8 — Loot, XP and progression

*Needs M2 (loot tables), M3 (kills, stats), M7 (what to drop) and M6 (to balance it).*

See docs/engine/progression.md.

**Engine**
- [x] Dynamic loot: drops computed from the monster, dungeon level and player level (and optionally luck), not fixed lists
- [x] Game can define specific loot or request generated loot
- [x] Loot budgets as the balancing lever: value per monster and per level is declared in data, and the generator spends it
- [x] Loot tables can be tuned from the bot reports (M6)
- [x] XP, levelling and stat increases (level on the HUD, points spent in the satchel)
- [x] levelling provides skill points and replenishes health and mana

**Game**
- [x] As a player, I want to gain experience from fights and grow stronger.
- [x] As a player, I want the monsters to drop something worth having. (Beasts, the rat, snake and spider, drop nothing on purpose.)
- [x] As a designer, I want the difficulty curve verified by bots before it ships. (tests/ravensmoor/balance.test.mjs)

Not done: monster respawn (needs a per-level state scope), loot on the hero's tile rather than where the creature fell, and
retuning the Undercrypt itself: a fighter bot still dies there (see the Balancing section of docs/engine/bots.md).

## M8.1 — Magic and status effects

See docs/engine/magic.md.

*Needs M3 (mana, combat), M7 (damage types, resistances, materials) and M8 (levels and skill points, to learn spells). The engine provides the mechanism; the game declares every magic type, spell, effect and number.*

**Engine**
- [x] Magic types as damage types (fire, frost, shock, poison, holy), using the M7 resistance mechanism; predefined by the engine, with the engine's creatures already resisting them
- [x] Spell definitions as data: name, icon, magic type, mana cost, cooldown, target (self, faced monster, area in front), effect (damage, heal, status effect)
- [x] Casting action (same control API as M6), with mana cost, cooldown, cast feedback and messages in the log
- [x] Status effects as data: type, duration, strength tier, tick effects (damage or heal over time, slow, stun, buffs and debuffs to stats); stacking and refresh rules; apply to the hero and to monsters
- [~] Status effects shown on the hero (text with remaining time) and saved with the game (M4); not yet shown on the targeted monster
- [x] Monsters can have resistances (and weaknesses) to magic types, and immunity to status effects; magic damage uses the same formula as M7
- [x] Spells are learned: spell books or scrolls as items (skill points go to attributes); known spells saved as what the player chose (M4)
- [~] Spell list screen (the hero's known spells, with description, cost and cooldown, Cast and Make ready); not yet the resistance-adjusted effect on the targeted monster
- [x] Enchanted items: an item carries an enchantment (magic type and strength tier) as a plain definition, so inventory and saves stay `{id, qty}`; effects are an on-hit status or damage bonus on weapons and a resistance or buff on armour (builds on the M7 materials generator)
- [x] Enchantment shown as a coloured outline on the item's icon: the colour is the magic type, the intensity is the strength tier (none, faint, clear, strong, blazing); same rule in the satchel, equipment slots and containers, and for both icon styles
- [x] Item text lists the enchantment and its tier; the M7 "what changed" log includes it
- [x] Bot API (M6): cast, learn, read the status effects of hero and target

**Game**
- [x] As a player, I want to learn a first spell (a fire bolt) and cast it at a monster.
- [x] As a player, I want a spell that heals or protects me, and a status effect that wears off with time.
- [x] As a player, I want some monsters to resist or fear a type of magic, so I pick my spell to suit the monster.
- [x] As a player, I want to see at a glance that an item is enchanted, what type it is and how strong it is.
- [x] As a player, I want to find an enchanted weapon or ring in the dungeon.
- [x] As a designer, I want the bots to measure how much magic changes survival and kill times.

## M8.2 — Quick bar

*Needs M2 (items, consumables) and M8.1 (spells). A row of slots for what the player uses most, usable by key, click and tap.*

**Engine**
- [x] Quick bar of 8 slots on desktop and 6 on mobile, set per layout by the game. The saved bar always has 8 entries; mobile shows the first 6 and the last two keep working by key if a keyboard is attached, so a save moves between devices without losing anything. Slots 1–6 are the ones that matter most.
- [x] Slot contents are a reference to an item (a potion stack, or any usable item) or to a known spell (M8.1); slots hold no items themselves, so inventory and saves stay `{id, qty}`
- [x] Assigning, one model on both platforms (docs/engine/quickbar.md):
  - **Drag** an item (or worn item) from the satchel or a spell from the spell list onto a slot; drag between slots to swap; drag off the bar to remove. The bar stays visible while the satchel or spell list is open.
  - **Quick bar** button on an item or spell: first free slot; the button then reads "Off quick bar".
  - **Auto-fill**: the first potion picked up and the first spell learned go into the first free slot, once, unless the player cleared it by hand. A new game and a save from before the bar start filled from the pack and spells.
- [ ] Picker: tap an empty slot to choose from a list of what can go there (not built: drag and the button cover it for now)
- [x] Activating a slot: number keys 1–8, click or tap. An item is used; a spell is cast (on the faced target); a weapon or shield is equipped
- [x] Slot shows the icon, the stack count for items, the mana cost and a cooldown sweep for spells, and is greyed when unusable (empty stack, not enough mana, cooling down)
- [x] When a stack runs out the slot stays and refills if the same item is picked up again; if the item is gone for good the slot is emptied
- [x] Quick bar saved with the game (M4) as what the player chose, with a migration for old saves
- [x] Bot API (M6): read and set the quick bar, activate a slot
- [x] Mobile: the bar is part of the touch layout, 6 slots at least 44 px each, not covering the view or the movement controls, in portrait and landscape; a press-and-hold on a slot shows its name and description (and the picker, see above)
- [x] Desktop and mobile show the same bar and the same behaviour apart from the slot count (extends the parity rule of M4)

**Game**
- [x] As a player, I want to drink a health potion mid-fight with one key or one tap.
- [x] As a player, I want to put my fire bolt on the bar and cast it without opening a menu.
- [x] As a player, I want my first potion and my first spell to land on the bar by themselves.
- [x] As a player on a phone, I want the quick bar within thumb reach and never in the way of the view.

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

- [ ] Experiment 3: full AI-generated screens per cell/direction, mixable per area
- [ ] Level data validation (unreachable cells, bad exits, missing art) as one command
- [ ] Visual level editor (tile map, entities, exits)
- [ ] Dialogue and quest editor
