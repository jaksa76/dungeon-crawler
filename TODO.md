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

- [x] TODO-8 - M7 — Weapons, armour and equipment (docs/engine/equipment.md)
  - [x] Upgrade path: rusty sword → iron mace → steel (smithy, loot from level 3) → mithril (one sword at the smithy, mail in the Undercrypt's knight's strongbox). Mithril is never dropped, enchanted or not.
  - Deferred: rarity, ranged weapons and ammunition, equipment drawn on the hero figure.

- [x] TODO-10 - M8.1 — Magic and status effects (docs/engine/magic.md)
  - [x] Show status effects on the targeted monster (above its head: the creature pointed at, else the nearest within three tiles ahead)
  - Note: **Iteration note**
  - Note: The first screenshots only showed creatures that were not pointed at; the review found the labels drew over the hover name plate, which scene-targets.js places from the creature's topmost pixel, not its rect. A screenshot with the pointer on the creature would have caught it. The plate's position is now exposed (compositor `plate()`).
  - Note: _Posted by microfactory implement-next._

## Polish and content

- [x] TODO-21 - Regenerate the world map as pixel art
  - As a player, I want the world map drawn in the same pixel-art style as the rest of the canvas game. The map screen should be 320x180.
  - Note: **Iteration note**
  - Note: "The map screen should be 320x180" was read as: the picture is 320x180 and fills the whole menu panel, with the title bar and Close drawn over it (the old map sat in a 310x155 box below the title). That costs the top 18 rows of the picture (most of the compass rose).
  - Note: The old map was 3:2; the new one is 16:9, so the three markers moved a few percent. Codex followed "320x180 art pixels in the 16:9 band, magenta outside, at most 32 colours" closely on the first try; tools/pixelate.mjs reduces it exactly. Worth recording in the pixel-art skill (TODO-48).
  - Note: _Posted by microfactory implement-next._

- [x] TODO-22 - Title screen background
  - As a player, I want a painted background behind the title screen and main menu.

- [x] TODO-23 - Main menu button in the settings screen
  - As a player, I want to return to the main menu from Settings.
  - Note: **Iteration note**
  - Note: Chose "save, then leave" (two presses: "Save and leave?"). Autosave is off by design (persistence.md: death should cost something), so leaving overwrites the current slot without the Save screen's Overwrite? step, and there is no way to leave without saving to drop a bad run. If that matters, add a "Leave without saving" choice.
  - Note: The review caught that save() silently skips while travelling between levels, so leaving then would not have saved; leaving now waits until arrival. The log is hidden while a menu is open, so failures show as the panel's news line.
  - Note: _Posted by microfactory implement-next._

- [x] TODO-24 - Precisely align UI elements
  - As a player, I want HUD and screen elements aligned to the pixel grid on both layouts (320×240 desktop, 400×180 phone).
  - Note: **Iteration note**
  - Note: Expected off-grid drawing; an audit that hooked every canvas draw call on the main menu, character creation, the HUD and six menus found none (the canvas kit rounds every coordinate). So "aligned" was read as layout alignment: shared top lines, equal margins and gaps, one column per phone rail.
  - Note: The menu screens were checked by screenshot and already line up (frames at 5/20/310/155, bottoms at 175); only the empty spell list's text moved. The bigger misalignments were all in the HUD (hudRects).
  - Note: _Posted by microfactory implement-next._

- [x] TODO-25 - MP3 soundtrack and sound effects
  - As a player, I want recorded music and sound effects (mp3) instead of the synthesised sounds, per level and per event.
  - Note: Source the music and sound effects from CC0 assets on OpenGameArt.org and similar sites (e.g. Freesound, itch.io CC0 packs); record each file's source and licence in the credits.
  - Note: **Iteration note**
  - Note: The tracks and samples were picked from licences, titles and durations; nobody has listened to them in the game. Worth a listen, especially Greybridge's 65 s loop (mp3 loops have a short gap at the loop point).
  - Note: Credits live in CREDITS.md beside the files (engine/assets/sound/, games/ravensmoor/assets/music/) until the credits screen (TODO-39) can show them.
  - Note: The review found damage events were shared by blows, spells and status-effect ticks, so poison and burns would have played the sword sounds; `damage-taken` now carries `effect` for ticks, and the hit sound follows the `attack` event.
  - Note: _Posted by microfactory implement-next._

- [x] TODO-26 - Larger movement controls option on mobile
  - As a player on a phone, I want a setting that makes the movement controls slightly larger, overflowing their panel, so they are easier to hit.
  - Note: **Iteration note**
  - Note: The first version gave the big widgets rectangular press areas reaching 6 px into the scene over its whole height, so taps on bare scene beside the ring moved the hero; the browser test only pressed inside the drawn ring. The review caught it: the overflow press area is now a strip on the drawn shape, and the test taps beside it too.
  - Note: _Posted by microfactory implement-next._

- [x] TODO-48 - Pixel art skill for Codex
  - As a campaign designer, I want a project skill (`.claude/skills/pixel-art/`) that tells an agent how to generate pixel art with Codex for this engine, so new art matches the existing style and fits the canvas without trial and error.
  - One main skill with the shared workflow: palette, canvas resolutions (320×240 desktop, 400×180 phone), view slots and sizes, prompting Codex, cleaning up and checking the result (tools/check-pixels.mjs and friends), and where the files go (art/ for sources, assets/ for runtime art, per docs/engine/content.md).
  - Sub-skills per asset type, each with its sizes, views, prompt templates and pitfalls: building facades, NPCs, monsters (directions and animation frames), items and icons. Add more (environments, portraits, story images) as they come up.
  - Self-improving: every art session ends by recording what worked and what failed (prompts, settings, fixes) in a "Lessons learned" section of the sub-skill it used, and promoting lessons that apply to all asset types into the main skill. The skill says this in its own instructions.
  - Start from what is already known: docs/art/ (art-prompts-2d.md, rebake.md, local-image-generation.md), docs/engine/icons.md, docs/ravensmoor/snake.md and the art tools in tools/.
  - Note: **Iteration note**
  - Note: The issue's list missed two asset kinds the repo already makes with Codex: monster animation key poses (portrait 1024 x 1536 transparent sheets the bake needs for every creature) and the hero sprite (portrait canvas, 12 px blocks). The first draft wrongly said key poses were not Codex's; the review caught it, and both now have sections (monsters.md, ui.md).
  - Note: The old art docs assumed a ChatGPT conversation (preamble, then sheets); with `codex exec` the preamble goes into every prompt. And painted sheets were not kept before; the skill now keeps the painting and the prompt under art/*/painted/.
  - Note: _Posted by microfactory implement-next._

- [x] TODO-27 - Strafe-only buttons with swipe movement on mobile
  - As a player on a phone, I want a setting that shows only the strafe buttons and leaves forward, back and turning to swipes.
  - Note: **Iteration note**
  - Note: The swipe code dropped a swipe in progress whenever any other finger touched the canvas; harmless with the sticks, but this mode is meant for two thumbs (strafe with one, swipe with the other). The review found it; a swipe now ignores other fingers.
  - Note: _Posted by microfactory implement-next._

- [x] TODO-28 - Full-screen story images with text
  - As a player, I want story moments shown as a full-screen image with text that I advance, triggered by events, dialogue or quests.
  - Note: **Iteration note**
  - Note: Ravensmoor has one story moment so far, its ending ("The Quiet Bell", a Codex picture). The engine call works from triggers, dialogue choices and quests alike; more moments are a content task, one picture each.
  - Note: The review found two stories asked for at once replaced each other, and a held Escape that skipped a story then closed the menu under it; both fixed (stories queue; a held Escape closes nothing). Pictures load when the story opens, so the first frame is text on black.
  - Note: _Posted by microfactory implement-next._

- [x] TODO-31 - Increase view distance
  - As a player, I want to see further down streets in villages. Not needed for dungeons.
  - Note: **Iteration note**
  - Note: Expected new art for the farther rows (every slot is a painted image); instead the rows beyond the painted three are made at load from the painted ones (one-point perspective: fronts scale, sides remap column by column, billboards scale), so no repaint was needed.
  - Note: The Old Quarter is a 3x3 square and never shows past row 3; only Greybridge (5x5) changes today. Both have maxDepth 6.
  - Note: The village level's view also drives the art studio's sheet plan, so raising its maxDepth silently re-planned the painted sheets; the review caught it and the studio is now pinned to the painted depth. That coupling was undocumented.
  - Note: _Posted by microfactory implement-next._

- [x] TODO-32 - Better shops
  - As a player, I want shops that have depth and show the NPC inside them.
  - Note: **Iteration note**
  - Note: Read as visual: the shop screen shows the shop's interior with its keeper behind the counter (a merchant's `image`, 120 x 150 pixel art; the smithy and the alchemist have one). Walk-in shops in the 3D scene would need new wall geometry and art.
  - Note: The reviewer thought "depth" may have meant gameplay depth (restocking, buyback, more varied stock, comparing items). If so, that is still open: worth a new story.
  - Note: _Posted by microfactory implement-next._

- [ ] TODO-33 - Portraits in dialogue
  - As a player, I want to see the portrait of the person I'm talking to in dialogue.
  
- [ ] TODO-34 - The sprite for the loot dropped by monsters is missing

- [ ] TODO-30 - Regenerate art at the correct resolution
  - As a player, I want facades, icons and other art made at the canvas resolution so they stay crisp instead of being scaled.
  - Note: Before generating new art, look for CC0 pixel art on OpenGameArt.org and similar sites (e.g. itch.io CC0 packs, Kenney) that fits the style and resolution; record each file's source and licence in the credits.

- [ ] TODO-29 - More NPCs
  - As a game designer, I want more predefined NPCs to choose from.

## Engine polish

- [ ] TODO-35 - Level transitions
  - As a player, I want a short fade (or similar) when I change level, open the world map or switch screens, so the game never jumps from one scene to the next.

- [ ] TODO-36 - Audio-visual feedback for game events
  - As a player, I want a sound and a visible cue when I level up, a quest starts, advances or completes, I gain gold and I take damage, so I notice them without reading the message log.

- [ ] TODO-37 - Music and sound effects volume
  - As a player, I want separate volume settings for music and sound effects, saved between sessions.

- [ ] TODO-38 - Key rebinding screen
  - As a player on desktop, I want a screen where I can see and change the key for every action, saved between sessions, with a reset to defaults.

- [ ] TODO-39 - Credits screen
  - As a player, I want a credits screen reached from the main menu and after the ending. The campaign supplies its own credits; the engine adds its own.

## Environments

*Each one is an engine environment (walls, floor, props, sky or ceiling) that any campaign can use, at the canvas resolution.*

- [ ] TODO-40 - Environment: Forest road
  - As a campaign designer, I want a forest road between villages, with trees, undergrowth and an open sky, so I can build levels there.

- [ ] TODO-41 - Environment: Cave
  - As a campaign designer, I want natural caves, with rough rock walls, stalagmites and water, so I can build levels there.

- [ ] TODO-42 - Environment: Catacomb
  - As a campaign designer, I want catacombs, with bone-lined niches, sarcophagi and candles, so I can build levels there.

- [ ] TODO-43 - Environment: Castle interior
  - As a campaign designer, I want a castle interior, with dressed stone, banners, tapestries and torches, so I can build levels there.

- [ ] TODO-44 - Environment: Sewer
  - As a campaign designer, I want sewers, with brick tunnels, water channels and grates, so I can build levels there.

## Campaign authoring

- [ ] TODO-47 - Campaign developer guide
  - As a campaign designer, I want one guide (docs/campaign-guide.md) that takes me from an empty folder to a playable campaign: the campaign file, levels, content books and art, NPCs and dialogue, quests and flags, shops, the world map, sound, saving and testing with bots. It links to the engine docs instead of repeating them.
  - Includes advice on validating a campaign (the engine leaves validation to the campaign): run checks on the loaded level and dialogue objects rather than the source files, so generated content is checked too; what to check (dialogue targets, flags set but never read, unknown ids, unreachable tiles, missing art); how to make the checks tests.

- [ ] TODO-51 - Map viewer
  - As a campaign designer, I want to see any level as a top-down map, drawn from its loaded definition: tiles, doors, entities, monsters, traps, triggers and exits, with their ids on hover, so I can check a level (hand-written or generated) without walking it.
  - Reads the level object the engine resolves, so it works for any level a campaign produces. Dev-only, in the browser.
  - Clicking a tile can start the game there (with TODO-50's scenario loading, once it exists).

- [ ] TODO-49 - Whole-campaign bot with checkpoint saves
  - As a campaign designer, I want a bot that plays the main quest from a new game to the ending in the test suite, so a change that breaks progression (a key behind its own door, a renamed flag) fails a test.
  - The campaign declares its milestones (e.g. "accepted the seal quest", "has the warden's key", "seal returned"); the bot writes a checkpoint save at each one. Checkpoints are reachable by construction and are rebuilt whenever content changes; a failure names the milestone the bot could not reach.
  - Builds on the M6 bot API (docs/engine/bots.md). Side quests and alternative routes get their own short scripts when they matter.

- [ ] TODO-50 - Scenario builder from checkpoints
  - As a campaign designer, I want to start a test or a play session from a checkpoint (TODO-49) with a few changes (level, gold, items, flags, position), so I can test a specific situation without replaying everything before it.
  - Generated states are checked against consistency rules a real state always obeys: quest stage matches its flags, a unique item is not in two places, a defeated boss's loot is not still in its container. The campaign supplies the rules.
  - Usable from tests, from bots and in the browser (e.g. a dev-only URL parameter or menu that loads a scenario). Replaces the hand-built setups in games/ravensmoor/scenarios.js where they overlap.
