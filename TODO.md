# TODO

Scope: the engine (`engine/`) and the Ravensmoor campaign, the Old Quarter
and the Undercrypt (`games/ravensmoor/`). See docs/engine/content.md for what goes where.

Work through the milestone stories in build order. Each story's description keeps the engine
work ahead of the game work it unlocks. Task markers in descriptions show progress
(`[x]` complete, `[~]` partly done, `[ ]` open).

## Done

- `[x]` Engine: grid movement, levels and exits, atmosphere and fog of war, roaming monsters, defeat and respawn
- `[x]` Engine: character, help, save and load screens; 144-icon atlas
- [x] TODO-1 - M1 — Interaction (Use action, entity behaviours as data, message log)
- [x] TODO-2 - M2 — Items, containers and inventory
- [x] TODO-3 - M2.1 — Equipping items
- [x] TODO-4 - M3 — Character stats and combat
- [x] TODO-5 - M4 — Persistence and game state (docs/engine/persistence.md)
- [x] TODO-6 - M5 — Combat interaction and monster animation
- [x] TODO-7 - M6 — Automated test player (docs/engine/bots.md)
- [x] TODO-12 - M9 — World map and travel
- [x] TODO-13 - M10 — Flags and dialogue
- [x] TODO-14 - M11 — Quests
- [x] TODO-15 - M12 — Economy
- [x] TODO-16 - M13 — Dungeon mechanics (stairs and multi-floor dungeons deferred until a dungeon needs them)
- [x] TODO-17 - M14 — Sound (synthesised in engine/ui/sound.js)
- [x] TODO-18 - M15 — Ending
- [x] TODO-19 - Set the quick bar background
- [x] TODO-20 - Show a plus sign on the hero profile when skill points are available

## Open in finished milestones

- [ ] TODO-8 - M7 — Weapons, armour and equipment (docs/engine/equipment.md)
  - `[~]` Upgrade path: rusty sword → iron mace is in the game; steel and mithril still need placing by loot and shops.
  - Deferred: rarity, ranged weapons and ammunition, equipment drawn on the hero figure.

- [ ] TODO-9 - M8 — Loot, XP and progression (docs/engine/progression.md)
  - `[ ]` Monster respawn (needs a per-level state scope)
  - `[ ]` Retune the Undercrypt: a fighter bot still dies there (Balancing in docs/engine/bots.md)

- [ ] TODO-10 - M8.1 — Magic and status effects (docs/engine/magic.md)
  - `[ ]` Show status effects on the targeted monster

## Polish and content

- [ ] TODO-21 - Regenerate the world map as pixel art
  - As a player, I want the world map drawn in the same pixel-art style as the rest of the canvas game. The map screen should be 320x180.

- [ ] TODO-22 - Title screen background
  - As a player, I want a painted background behind the title screen and main menu.

- [ ] TODO-23 - Main menu button in the settings screen
  - As a player, I want to return to the main menu from Settings.

- [ ] TODO-24 - Precisely align UI elements
  - As a player, I want HUD and screen elements aligned to the pixel grid on both layouts (320×240 desktop, 400×180 phone).

- [ ] TODO-25 - MP3 soundtrack and sound effects
  - As a player, I want recorded music and sound effects (mp3) instead of the synthesised sounds, per level and per event.

- [ ] TODO-26 - Larger movement controls option on mobile
  - As a player on a phone, I want a setting that makes the movement controls slightly larger, overflowing their panel, so they are easier to hit.

- [ ] TODO-27 - Strafe-only buttons with swipe movement on mobile
  - As a player on a phone, I want a setting that shows only the strafe buttons and leaves forward, back and turning to swipes.

- [ ] TODO-28 - Full-screen story images with text
  - As a player, I want story moments shown as a full-screen image with text that I advance, triggered by events, dialogue or quests.

- [ ] TODO-29 - More NPCs
  - As a game designer, I want more predefined NPCs to choose from.

- [ ] TODO-30 - Regenerate art at the correct resolution
  - As a player, I want facades, icons and other art made at the canvas resolution so they stay crisp instead of being scaled.

- [ ] TODO-31 - Increase view distance
  - As a player, I want to see further down streets in villages. Not needed for dungeons.

- [ ] TODO-32 - Better shops
  - As a player, I want shops that have depth and show the NPC inside them.

- [ ] TODO-33 - Portraits in dialogue
  - As a player, I want to see the portrait of the person I'm talking to in dialogue.
  
- [ ] TODO-34 - The sprite for the loot dropped by monsters is missing

## Later — art pipeline and toolkit

*Not required by any game story. Pick up when the game needs more art or other people start making levels.*

- `[ ]` Experiment 3: full AI-generated screens per cell/direction, mixable per area
- `[ ]` Level data validation (unreachable cells, bad exits, missing art) as one command
- `[ ]` Visual level editor (tile map, entities, exits)
- `[ ]` Dialogue and quest editor
