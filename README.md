# Dungeon Crawler

A first-person, grid-based fantasy RPG engine and its first campaign. See [docs/concept.md](docs/concept.md) for the
idea and [docs/engine/content.md](docs/engine/content.md) for how the engine and a campaign divide the work.

```
engine/         the rule books: mechanics, UI, rendering, and the content books (items, bestiary, NPCs, props,
                buildings, environments) with their art. Public API: engine/index.js
games/          campaigns: maps, levels, story and their own content
  ravensmoor/   the first one (open games/ravensmoor/)
art/            source art, not loaded by the game: art/engine/ for the engine's content, art/ravensmoor/ for the campaign's
tools/          art pipeline and checks (cd tools && npm install); play.mjs and bots/ for headless runs
tests/          tests/engine/ (rules, engine content, boundaries), tests/ravensmoor/ (the campaign is valid),
                tests/browser/ (Playwright)
experiments/    concepts that are not the engine: game-1 (3D renderer), game-3 (painted views), the pixel slice
docs/           engine/, ravensmoor/, art/, experiments/
```

Serve the repository root with any static server (`python3 -m http.server 8000`) and open `/`, or
`/games/ravensmoor/`. `?level=dungeon` jumps to a level without saving; `?new` starts over; `?seed=7` makes chance
repeatable.

Bots play the game without a screen, for balancing: `node tools/play.mjs --bot fighter --scenario undercrypt --runs 200`
(see [docs/engine/bots.md](docs/engine/bots.md)).

Everything on screen is drawn on one canvas on one pixel grid: 320×240 on a desktop, 400×180 on a phone held sideways (see [docs/engine/ui.md](docs/engine/ui.md); the art still to be rebaked for it is in [docs/art/rebake.md](docs/art/rebake.md)). New art is painted with Codex following the project skill [.claude/skills/pixel-art](.claude/skills/pixel-art/SKILL.md), which records what each art session learns.

Tests: `node --test tests/engine/*.test.mjs tests/ravensmoor/*.test.mjs`. The browser tests need Playwright and a
running server: `node tests/browser/m5.browser.mjs` (TEST_URL, CHROMIUM_PATH) and `node tests/browser/monster-art.browser.mjs`.
