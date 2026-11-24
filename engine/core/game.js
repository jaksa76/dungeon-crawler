import { arrangeActors } from '../render/actor-layout.js';
import { createSceneInput } from './scene-input.js';
import { createView } from '../render/view.js';
import { loadImage, loadSlotImages, createCompositor } from '../render/compositor.js';
import { createUI } from '../ui/panel.js';
import { uiLayout } from '../ui/panel-layout.js';
import { resolveLevel } from './levels.js';
import { engineContent } from '../content/index.js';
import { mergeContent } from '../content/catalog.js';
import { createTouch, viewportSize } from './touch.js';
import { createMobileHUD } from '../ui/mobile-hud.js';
import { createExploration, createExplorationStore } from './exploration.js';
import { createMonsters, actorDirection } from '../rules/monsters.js';
import { createGameOver } from '../ui/game-over.js';
import { interact, interactTarget } from '../rules/interaction.js';
import { createWorld, flat } from './world.js';
import { itemUse } from '../rules/behaviours.js';
import { withIcons, panelOverlay } from '../ui/panel-icons.js';
import { loadIcons, savedIconStyle, saveIconStyle } from '../ui/icons.js';
import { HEAD_X } from '../ui/head.js';
import { createEquipment } from '../rules/equipment.js';
import { createCharacter, deriveStats, strike, createCooldown } from '../rules/combat.js';
import { chooseCharacter } from '../ui/character-creation.js';
import { createInventory, addToStacks, checkItems, stacksPersistence } from '../rules/inventory.js';
import { resolveContents } from '../rules/loot.js';
import { PEEK, RELEASE_MS, motionFor, easeOut, drawTransition } from './transition.js';
import { createPersistence, createSaveStore, peek } from './persistence.js';
import { createFlags } from './flags.js';
import { startAutosave, defaultAutosave } from './autosave.js';
import { chooseStart } from '../ui/start-menu.js';
import { drawText } from '../ui/bitmapfont.js';
import { font5x8 as FONT } from '../ui/font-5x8.js';

// Grid crawler drawn by 2D compositing: every step and turn shows a new
// composite of pre-painted slot images (see view.js). Movement is instant, softened by a very short, subtle
// motion between the old and the new picture (transition.js); a swipe starts it before the finger lifts.

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
const DIR_KEYS = 'NESW';

// Props and NPCs stand against a side of their tile (`side: 'N'|'E'|'S'|'W'`), at
// most one per side, and never block the tile. Seen from a player facing `dir`, a
// side is the far, right, near or left side of the tile.
const ANCHOR_BY_TURN = ['far', 'right', 'near', 'left'];
const anchorOf = (side, dir) => ANCHOR_BY_TURN[(DIR_KEYS.indexOf(side) - dir + 4) % 4];

// A level's cells, as the renderer, movement, the map and the creatures see them: { wall, door? } | { entities?, door? }
// | {} | null. The map is fixed; what stands on it comes from the world, so doors and spawned things count at once.
export function cellLookup(world, id, { level, tileTypes }) {
  const rows = level.tiles;
  return (x, z) => {
    if (z < 0 || z >= rows.length || x < 0 || x >= rows[0].length) return null;
    const t = tileTypes[rows[z][x]];
    if (!t) return null;
    if (t.wall) return { wall: t.art };
    const things = world.at(id, x, z);
    const door = things.find(i => i.category === 'door') ?? null;
    if (door && !(door.isOpen?.() ?? door.state.open)) return { wall: door.art, door };
    const entities = things.filter(i => i.category === 'prop' || i.category === 'npc');
    return entities.length ? { entities, door } : door ? { door } : {};
  };
}

// Start a campaign. `levels` maps level ids to level definitions (see levels.js) and `start` is the id of the first one;
// `content` is the campaign's own content book (or a list of them), added to the engine's (see content/catalog.js).
// `startingItems` is what the hero carries on a new game. Death returns the hero to `respawn` ({ level, spawn? },
// by default the start of the first level; `place` names it on the defeat screen, `message` is said on waking). The page supplies the canvases: `viewCanvas`, `uiCanvas`, their `frame`, and
// a `status` line for debugging.
export async function startGame({ levels, start, content = [], startingItems = [], respawn = { level: start },
  viewCanvas, uiCanvas, frame, status, inventorySize = 48, inventoryColumns = 8,
  heroAttributes = { strength: 6, vitality: 6, intellect: 4, agility: 5 }, heroAttackMs = 700,
  // Persistence. `title` names the game (window title, start screen); `saveKey` keeps its saves apart from other games on the
  // same origin; `storage` is any Storage-like object (default localStorage); `maxSlots` limits save slots; `autosave` sets
  // when to save (see autosave.js); `persist` adds the game's own sections: a list, or a function that gets the engine's
  // components ({ flags, hero, inventory, equipment, itemDefs }) and returns the list. See docs/engine/persistence.md.
  title = 'Dungeon', saveKey = 'dungeon-crawler', storage, maxSlots = 3, autosave = {}, persist = [],
  // Character creation on a new game: the player names the hero and adds `points` to the attributes. `false` skips it.
  characterCreation = { points: 4 } }) {
  // Keep the complete asset list for a fresh reload; the browser's default
  // timing buffer holds only 250 entries, fewer than a full scene's images.
  performance.setResourceTimingBufferSize(4096);
  const books = mergeContent(engineContent, ...[content].flat());
  const itemDefs = books.items;
  if (!Object.hasOwn(levels, start)) throw new Error(`The start level "${start}" is not one of the levels`);
  if (!Object.hasOwn(levels, respawn.level)) throw new Error(`The respawn level "${respawn.level}" is not one of the levels`);
  const definitions = Object.fromEntries(Object.entries(levels).map(([id, def]) => [id, resolveLevel(id, def, books)]));
  // Every placed and spawned thing, as instances with saved state (world.js). Levels are created when first needed.
  const world = createWorld({ levels: definitions, books });
  for (const def of Object.values(itemDefs)) { const use = itemUse(def); if (use) def.use = use; } // data { hp, mp } -> restore()
  // Saves. The URL can ask for a fresh start in a slot (?new, ?slot=name) or a particular level (?level=, which plays
  // without saving so a debugging jump never overwrites a real save).
  const params = new URLSearchParams(location.search);
  const policy = { ...defaultAutosave, ...autosave };
  let store = storage;
  if (store === undefined) { try { store = window.localStorage; } catch { store = null; } }
  const saves = createSaveStore(store, saveKey);
  const persistent = !params.has('level');
  let slot = params.get('slot') ?? 'slot-1', saved = null;
  if (persistent && params.has('new')) saves.clear(slot);
  else if (persistent) {
    const slots = saves.list();
    if (slots.length) {
      const choice = await chooseStart(frame, { title, slots, max: maxSlots, remove: id => saves.clear(id) });
      slot = choice.slot;
      if (choice.mode === 'continue') saved = saves.load(slot);
    }
  }
  const savedLevel = peek(saved, 'engine.player')?.levelId;
  if (saved && !Object.hasOwn(definitions, savedLevel)) saved = null; // that level no longer exists: start over in this slot
  // A new game starts with the character creation screen (not when debugging with ?level=).
  const creation = persistent && !saved && characterCreation
    ? await chooseCharacter(frame, { title, base: heroAttributes, points: characterCreation.points ?? 4, derive: attrs => deriveStats(attrs) }) : null;
  const asked = params.get('level');
  let levelId = saved ? savedLevel : asked && Object.hasOwn(definitions, asked) ? asked : start;
  const explorations = createExplorationStore();
  const cache = new Map();
  async function prepare(id) {
    if (!Object.hasOwn(definitions, id)) throw new Error(`Unknown level: ${id}`);
    if (!cache.has(id)) {
      const job = (async () => {
        const def = definitions[id], view = createView(def.level.view);
        world.level(id);
        const art = artOf(id), loaded = new Set();
        const images = await loadSlotImages(view, { environment: def.environment, ...art });
        for (const thing of [...art.walls, ...art.props, ...art.actors]) loaded.add(thing.art);
        // Required dungeon art must be complete before replacing the active scene.
        if (def.level.atmosphere && (!images.has('floor') || art.walls.some(({ art }) =>
          view.wallSlots.some(slot => !images.has(`walls:${art}:${slot.id}`))))) {
          throw new Error('The dungeon artwork could not be loaded. Please try again.');
        }
        const cell = cellLookup(world, id, def);
        const exploration = createExploration(def.level, cell);
        explorations.attach(id, exploration);
        const sim = createMonsters(def.level, cell, Math.random, { list: () => world.all(id, 'monster'), move: world.move });
        return { ...def, id, view, images, loaded, cell, comp: createCompositor(view, images), exploration, monsters: sim };
      })();
      cache.set(id, job);
      job.catch(() => cache.delete(id));
    }
    return cache.get(id);
  }
  // The art a level's things need: its walls and doors, and the props, NPCs and creatures in it now.
  function artOf(id) {
    const unique = list => [...new Map(list.map(thing => [thing.art, thing])).values()];
    const things = world.all(id);
    return {
      walls: unique([...Object.values(definitions[id].tileTypes).filter(t => t.wall), ...things.filter(i => i.category === 'door')]),
      props: unique(things.filter(i => i.category === 'prop' || i.category === 'npc').map(flat)),
      actors: unique(things.filter(i => i.category === 'monster' && i.art)).map(i => ({ art: i.art, assets: i.assets, animated: !!i.animations })),
    };
  }
  // Load what a prepared level's things need and it does not have yet (something was spawned there).
  async function ensureArt(context) {
    const art = artOf(context.id), missing = list => list.filter(thing => !context.loaded.has(thing.art));
    const want = { walls: missing(art.walls), props: missing(art.props), actors: missing(art.actors) };
    if (!want.walls.length && !want.props.length && !want.actors.length) return;
    const images = await loadSlotImages(context.view, want);
    for (const [key, image] of images) context.images.set(key, image);
    for (const thing of [...want.walls, ...want.props, ...want.actors]) context.loaded.add(thing.art);
  }
  let active = await prepare(levelId);
  let { level, props } = active;
  let { view, images, cell, comp, exploration, monsters } = active;
  const { W, H } = view.V;
  const SHOWN = view.V.pixel ?? 1;
  let transitioning = false, dead = false, loading = false, drawnVersion = world.version;
  let monsterDue = performance.now() + monsters.graceMs;

  // The view is composed in its own W x H coordinates but drawn into a canvas of INTERNAL times that size
  // (320x180 for the default 640x360 view), and shown scaled up with nearest-neighbour sampling (the canvas
  // CSS sets image-rendering: pixelated). A pixel view is built for one size (its art is baked at it), so it
  // is drawn at that.
  const INTERNAL = SHOWN > 1 ? 1 : 0.5;
  const cw = Math.round(W * INTERNAL), ch = Math.round(H * INTERNAL);
  viewCanvas.width = cw; viewCanvas.height = ch;
  const g = viewCanvas.getContext('2d');
  const prev = document.createElement('canvas'); prev.width = cw; prev.height = ch;
  const next = document.createElement('canvas'); next.width = cw; next.height = ch;

  // Overlays (the UI panel and the message log) are drawn at the view's pixel size, at least 320 wide, and
  // use a bitmap font: a scalable one is too blurry at this size.
  const PW = Math.max(cw, 320);
  const icons = await loadIcons(new URL('../assets/icons/', import.meta.url).href, savedIconStyle(), Object.values(books.icons));
  const panelImage = withIcons(await loadImage(new URL('../assets/ui/panel.png', import.meta.url).href), icons);
  // The portrait is the head of the full-body pixel sprite, cropped to its frame and never scaled: one art pixel is one
  // UI pixel. (The painted desktop panel draws its portrait cover-fitted, so it is given a picture that is exactly the
  // window's size.)
  const portraitImage = await loadImage(new URL('../assets/ui/hero-sprite.png', import.meta.url).href);
  const portraitWindow = layout => {
    const k = PW / panelImage.width, [, , w, h] = layout.portrait.map(v => Math.round(v * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#0d0b10'; g.fillRect(0, 0, w, h); // solid: the panel painting has its own portrait underneath
    g.drawImage(portraitImage, Math.round(HEAD_X - w / 2), 0, w, h, 0, 0, w, h); // the head is at the top, centred on its column
    return c;
  };
  const ui = createUI(uiCanvas, {
    'ui/panel': { image: panelImage },
    'ui/portrait-hero': { image: portraitWindow(uiLayout) },
  }, uiLayout, { width: PW, font: FONT, overlay: panelOverlay(icons) });

  const p = { ...level.start, steps: 0 };
  let sceneInput = null;
  const opts = { outlines: false };
  const heldKeys = new Set(), blockedKeys = new Set();
  const messages = []; // every message said, kept for the journal's message log

  // Items: the pack, containers (made the first time they are opened, so what is in them is rolled once) and
  // piles of things the player dropped, keyed by level and tile.
  checkItems(itemDefs);
  for (const [id, def] of Object.entries(itemDefs)) if (!icons.has(def.icon)) throw new Error(`item "${id}" has no icon "${def.icon}" in the icon atlas or the campaign's icon sheets`);
  const inventory = createInventory(itemDefs, { size: inventorySize, start: startingItems });
  const equipment = createEquipment(itemDefs);
  const hero = createCharacter(heroAttributes, equipment, { attackMs: heroAttackMs, name: creation?.name });
  if (creation) { hero.build(creation.spent); hero.restore(); }
  const containers = new Map(); // `level:x,z,side` -> stacks of opened containers
  const piles = new Map(); // `level:x,z` -> stacks the player dropped
  const flags = createFlags(); // the game's own facts (dialogue, quests): saved with the game
  // A container is named in saves by its `id` (stable when the level is edited), or else by where it stands.
  const containerKey = entity => `${levelId}:${entity.id ?? `${entity.x},${entity.z},${entity.side}`}`;
  const pileKey = () => `${levelId}:${p.x},${p.z}`;
  function openContainer(entity, behavior = {}) {
    const key = containerKey(entity);
    if (!containers.has(key)) containers.set(key, resolveContents(behavior, (list, id, qty) => addToStacks(itemDefs, list, id, qty)));
    bars.openContainer({ title: behavior.title ?? entity.name ?? 'Container', text: behavior.text, stacks: containers.get(key) });
  }
  function openPile() {
    const stacks = piles.get(pileKey());
    if (!stacks?.length) return false;
    bars.openContainer({ title: 'On the floor', text: 'Things lie here where they were dropped.', stacks });
    return true;
  }
  // Using an item from the pack: its definition's use(game, stack) (see rules/behaviours.js). It returns
  // { consumed, message }: a consumed item is used up, the message is shown in the satchel.
  function useItem(index) {
    const stack = inventory.slots[index], def = stack && itemDefs[stack.id];
    if (!def?.use) return { message: 'Nothing happens.' };
    const result = def.use.call(def, api, stack) ?? {};
    if (result.consumed && inventory.slots[index]?.id === stack.id) inventory.remove(index, 1);
    drawHud();
    return { message: result.message ?? '' };
  }
  // Drink the first potion in the pack that restores `kind` ('hp' or 'mp'), without opening the satchel.
  function quickUse(kind) {
    const index = inventory.slots.findIndex(stack => stack && itemDefs[stack.id].use?.restores?.[kind]);
    if (index < 0) { say(`You have no ${kind === 'hp' ? 'health' : 'mana'} potion.`); return; }
    useItem(index);
  }
  function drop(index, qty) {
    const gone = inventory.remove(index, qty);
    if (!gone) return;
    const pile = piles.get(pileKey()) ?? [];
    piles.set(pileKey(), pile);
    addToStacks(itemDefs, pile, gone.id, gone.qty);
  }
  // Saving. Every component that has state to keep registers a section with the persistence registry (persistence.js);
  // the game adds its own. The player saves from the settings panel; a game may also set an `autosave` policy. Never while dead or between levels.
  const persistence = createPersistence();
  persistence.engine.register(world.persistence); // first: the player's level opens with its things already restored
  persistence.engine.register({
    id: 'player', // where the hero stands. The level itself was chosen above, from this same data.
    save: () => ({ levelId, x: p.x, z: p.z, dir: p.dir }),
    async load(at, ctx) {
      // Loading while playing may mean another level: go there first (the same way an exit does).
      if (at && at.levelId !== levelId && Object.hasOwn(definitions, at.levelId) && !(await travel({ to: at.levelId, spawn: { x: at.x, z: at.z, dir: at.dir } }))) throw new Error('the saved level could not be opened');
      const floor = at && at.levelId === levelId && cell(at.x, at.z);
      if (floor && !floor.wall && Number.isInteger(at.dir)) Object.assign(p, { x: at.x, z: at.z, dir: ((at.dir % 4) + 4) % 4 });
      else ctx.issue('the saved position is not on this level');
    },
  });
  for (const part of [inventory, equipment, hero, explorations]) persistence.engine.register(part.persistence);
  persistence.engine.register(stacksPersistence('containers', itemDefs, containers));
  persistence.engine.register(stacksPersistence('piles', itemDefs, piles));
  persistence.game.register(flags.persistence);
  for (const section of typeof persist === 'function' ? persist({ flags, hero, inventory, equipment, itemDefs, say: text => say(text) }) : persist) persistence.game.register(section);
  if (saved) {
    const { issues } = await persistence.restore(saved);
    for (const issue of issues) console.warn(`save: ${issue.section}: ${issue.message}`);
    await ensureArt(active); monsters.reset(); // the level's things, as saved
  }
  let lastSaved = saved ? persistence.digest(persistence.snapshot()) : '', saveWarned = false;
  function save() {
    if (!persistent || dead || transitioning || loading) return true;
    try {
      const snapshot = persistence.snapshot({ label: `${hero.name} · ${level.shortName ?? level.name}` });
      if (persistence.digest(snapshot) === lastSaved) return true;
      if (saves.save(slot, snapshot)) { lastSaved = persistence.digest(snapshot); return true; }
    } catch (error) { console.error('save failed', error); }
    if (!saveWarned) { saveWarned = true; say('Your progress could not be saved.'); }
    return false;
  }
  if (persistent && (policy.intervalMs || policy.onHidden)) startAutosave(save, policy);
  // Saving by hand (the settings panel) into any slot, and loading one while playing.
  const saveMenu = persistent ? {
    max: maxSlots, current: () => slot, list: () => saves.list(),
    save(id) { const previous = slot; slot = id; lastSaved = ''; if (save()) return true; slot = previous; return false; },
    async load(id) {
      const snapshot = saves.load(id);
      if (!snapshot || !(await loadGame(snapshot))) return false;
      slot = id; lastSaved = persistence.digest(persistence.snapshot()); return true;
    },
  } : null;
  const mapView = { // what the HUD shows of the level: its name, journal, known tiles and named things
    get name() { return level.shortName ?? level.name; },
    get journal() { return level.journal ?? 'Explore the surrounding streets and passages.'; },
    typeAt: (x, z) => { if (!exploration.isKnown(x, z)) return null; const c = cell(x, z); return c === null ? null : (c.wall ? { wall: true } : { floor: true }); },
    get billboards() { return world.all(levelId).filter(e => e.name && e.category !== 'monster' && exploration.isKnown(e.x, e.z)).map(entity => ({ entity })); },
  };
  const debugMode = new URLSearchParams(location.search).has('debug');
  document.documentElement.toggleAttribute('data-debug', debugMode);
  const bars = createMobileHUD({ icons, setIconStyle: style => { saveIconStyle(style); location.reload(); }, portrait: portraitImage, world: mapView, hero, frame, messages, inventory, equipment, inventoryColumns, itemDefs, say: text => say(text), drop, onUse: useItem, onQuick: quickUse, saves: saveMenu,
    debug: { get: () => opts.outlines, set: value => { opts.outlines = value; show(); } },
  });
  await bars.ready;
  bars.setLevel(level);
  // Desktop: the painted panel's icons (regions in the panel image's pixels) open the same menus as the phone buttons.
  const hotspots = [
    ...[['Journal', 2, 'journal'], ['Inventory', 3, 'inventory'], ['Full screen', 4, 'fullscreen'], ['Settings', 5, 'settings']]
      .map(([label, i, name]) => ({ label, rect: [545 + i * 99, 20, 99, 92], run: () => bars.menu[name]() })),
    ...bars.items.map(([label, text, , use], i) => ({ label, rect: [545 + i * 76, 130, 76, 76], run: () => (use ? quickUse(use) : bars.open(label, text)) })),
  ];
  const hotspotAt = ev => {
    const r = uiCanvas.getBoundingClientRect();
    const x = (ev.clientX - r.left) * panelImage.width / r.width, y = (ev.clientY - r.top) * panelImage.height / r.height;
    return hotspots.find(({ rect: [rx, ry, rw, rh] }) => x >= rx && x < rx + rw && y >= ry && y < ry + rh);
  };
  uiCanvas.addEventListener('click', ev => { if (!dead && !transitioning) hotspotAt(ev)?.run(); });
  uiCanvas.addEventListener('mousemove', ev => { const h = hotspotAt(ev); uiCanvas.style.cursor = h ? 'pointer' : ''; uiCanvas.title = h?.label ?? ''; });
  const gameOver = createGameOver(frame, { place: respawn.place });

  // The game API: what content methods get as `game` (see rules/behaviours.js and docs/engine/behaviour.md). Instances
  // are found by level and key; spawn and respawn resolve once the thing's art is loaded, if its level is being played.
  const liveMonster = inst => inst.category === 'monster' && !inst.state.dead;
  async function arrive(inst) {
    world.changed();
    const context = cache.has(inst.level) ? await cache.get(inst.level).catch(() => null) : null;
    if (context) await ensureArt(context);
    if (inst.level === levelId && liveMonster(inst)) monsters.add(inst);
    world.changed();
  }
  const api = {
    say: text => say(text), flags, hero, inventory, equipment, items: itemDefs,
    get level() { return levelId; },
    get player() { return { x: p.x, z: p.z, dir: p.dir }; },
    find: (level, key) => world.find(level, key),
    all: (level = levelId, category) => world.all(level, category),
    at: (level, x, z) => world.at(level, x, z),
    async spawn(kind, at) { const inst = world.spawn(kind, { level: levelId, ...at }); await arrive(inst); return inst; },
    remove(inst) {
      if (inst.category === 'monster' && inst.level === levelId) monsters.drop(inst);
      return world.remove(inst);
    },
    async respawn(inst, key) { const it = world.respawn(inst, key); if (it) await arrive(it); return it; },
    openContainer: (entity, spec) => openContainer(entity, spec),
    changed: () => world.changed(),
    isHere: inst => inst.level === levelId,
    // Is the player or a living creature on this instance's tile (a door must not shut on them)?
    blocked: inst => (inst.level === levelId && p.x === inst.x && p.z === inst.z) || world.at(inst.level, inst.x, inst.z).some(liveMonster),
    travel: (to, spawn) => travel({ to, spawn }),
  };
  window.__game2d = { view, images, level, levelId, p, world: mapView, things: world, game: api, monsters, hero, inventory, equipment, flags, persistence, save, loadState: loadGame,
    get targets() { return comp.targets(); },
    get phase() { return dead ? 'game-over' : (transitioning || loading) ? 'loading' : 'playing'; } };
  document.addEventListener('visibilitychange', () => { monsterDue = performance.now() + monsters.stepMs; });

  // Log: messages over the bottom-left of the view, fading out.
  const LOG_LINES = 4, LOG_PITCH = FONT.h + 1, LOG_PAD = 2;
  const logCanvas = document.createElement('canvas');
  logCanvas.className = 'log';
  logCanvas.width = PW; logCanvas.height = LOG_LINES * LOG_PITCH + LOG_PAD;
  frame.appendChild(logCanvas);
  const lg = logCanvas.getContext('2d');
  const maxChars = Math.floor((PW - 2 * LOG_PAD) / FONT.w);
  const log = [];
  // The on-screen log wraps a long message over several lines; the notice and the history keep it whole.
  function wrap(text) {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      if (line && line.length + 1 + word.length > maxChars) { lines.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    return line ? [...lines, line] : lines;
  }
  function say(text) {
    bars.notice(text);
    messages.push(text);
    if (messages.length > 100) messages.shift();
    const t = performance.now();
    for (const line of wrap(text)) log.push({ text: line, t });
    while (log.length > LOG_LINES) log.shift();
  }

  // The cell `d` ahead and `l` to the right of the player, with its props placed
  // relative to the player's facing (what view.compose expects).
  const relCell = (l, d) => {
    const [fx, fz] = DIRS[p.dir], [rx, rz] = DIRS[(p.dir + 1) % 4];
    const c = cell(p.x + fx * d + rx * l, p.z + fz * d + rz * l);
    if (!c || c.wall) return c;
    const x = p.x + fx * d + rx * l, z = p.z + fz * d + rz * l;
    return {
      props: (c.entities ?? []).map(e => ({ ...flat(e), type: e.prop, anchor: anchorOf(e.side, p.dir), entity: e })),
      actors: arrangeActors(monsters.at(x, z).map(actor => ({ ...flat(actor), direction: actorDirection(actor.dir, p.dir),
        animation: monsters.animation(actor, performance.now()) }))),
    };
  };

  // Say what the player is looking at: whatever stands against the far side of this
  // tile, or against the near or far side of the tile ahead.
  const exitAhead = () => levels && level.exits?.find(exit => exit.x === p.x && exit.z === p.z && exit.dir === p.dir);

  function look() {
    const exit = exitAhead();
    if (exit?.message) { say(exit.message); return; }
    if (piles.get(pileKey())?.length) say('Something lies on the floor here.');
    for (const d of [0, 1]) for (const pr of relCell(0, d)?.props ?? []) {
      const name = pr.entity.name;
      if (!name) continue;
      if (d === 0 && pr.anchor === 'far') say(`You stand before ${name}.`);
      if (d === 1 && (pr.anchor === 'far' || pr.anchor === 'near')) say(`You see ${name}.`);
    }
  }

  function render(target) {
    const tg = target.getContext('2d');
    tg.setTransform(target.width / W, 0, 0, target.height / H, 0, 0);
    tg.imageSmoothingQuality = 'high'; // shrinking the painted slot images to the internal resolution
    comp.draw(tg, view.compose(relCell), { facing: DIR_KEYS[p.dir], flipFloor: p.steps % 2 === 1, outlines: opts.outlines, atmosphere: level.atmosphere,
      picking: target === next, targetId: sceneInput?.targetId });
  }

  // Messages stay for 7 s, then fade out over 1 s. Redrawn only when something changed.
  let logKey = '';
  function drawLog(now) {
    const alphas = log.map((m) => Math.min(1, Math.max(0, 1 - (now - m.t - 7000) / 1000)));
    const key = log.map((m, i) => `${m.text}@${alphas[i].toFixed(2)}`).join('|');
    if (key === logKey) return;
    logKey = key;
    lg.clearRect(0, 0, logCanvas.width, logCanvas.height);
    log.forEach((m, i) => {
      if (alphas[i] <= 0) return;
      lg.globalAlpha = alphas[i];
      const y = logCanvas.height - LOG_PAD - (log.length - i) * LOG_PITCH;
      drawText(lg, FONT, m.text.slice(0, maxChars), LOG_PAD, y, '#f0e4c8', { outline: '#000' });
    });
    lg.globalAlpha = 1;
  }

  // What is on screen. Idle: the settled picture in `next`. After a move: `anim` carries the picture it came
  // from to the one in `next`. While a swipe is going: `drag` shows the first part of the move it would make.
  // A swipe let go of early settles back in `release`. At most one of the three is set.
  let anim = null, drag = null, release = null;

  // The state a command would lead to, or null when a wall is in the way.
  function plan(cmd) {
    if (cmd === 'left' || cmd === 'right') return { ...p, dir: (p.dir + (cmd === 'left' ? 3 : 1)) % 4 };
    const off = { forward: 0, strafeRight: 1, back: 2, strafeLeft: 3 }[cmd];
    const [dx, dz] = DIRS[(p.dir + off) % 4];
    const c = cell(p.x + dx, p.z + dz);
    if (!c || c.wall || monsters.occupied(p.x + dx, p.z + dz)) return null;
    return { ...p, x: p.x + dx, z: p.z + dz, steps: p.steps + 1 };
  }

  // The view the player would see in `st`, drawn without moving them. Kept per command while a swipe lasts.
  const peeks = new Map();
  let peekKey = '';
  function peekFor(cmd) {
    const st = plan(cmd);
    if (!st) return null;
    const key = `${levelId}:${monsters.version}:${p.x},${p.z},${p.dir},${p.steps},${opts.outlines}`;
    if (key !== peekKey) { peeks.clear(); peekKey = key; }
    if (!peeks.has(cmd)) {
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const here = { ...p };
      Object.assign(p, st); // render() reads where the player is
      try { render(c); } finally { Object.assign(p, here); }
      peeks.set(cmd, c);
    }
    return peeks.get(cmd);
  }

  function onSwipe(phase, cmd, amount) {
    if (phase !== 'move' || bars.isOpen() || transitioning || loading || dead) { settleDrag(); return; }
    anim = null; release = null; // the picture in `next` is the settled one; start from it
    if (!drag || drag.cmd !== cmd) drag = { cmd, motion: motionFor(cmd), peek: peekFor(cmd), amount };
    else drag.amount = amount;
  }

  // Let go of a swipe that did not count: the half-made move eases back.
  function settleDrag() {
    if (!drag) return;
    release = { ...drag, from: drag.amount, t0: performance.now() };
    drag = null;
  }

  // The minimap slides and turns to the player's new position over MAP_MS instead of jumping.
  const MAP_MS = 220, MAP_ZOOM = 1.7;
  let mapShown = { x: p.x, z: p.z, yaw: -p.dir * Math.PI / 2 }, mapFrom = null, mapStart = 0;
  function drawHud(now = performance.now()) {
    const to = { x: p.x, z: p.z, yaw: -p.dir * Math.PI / 2 };
    if (mapFrom) {
      const k = Math.min(1, (now - mapStart) / MAP_MS), e = 1 - (1 - k) * (1 - k);
      let turn = to.yaw - mapFrom.yaw; turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI; // the short way round
      mapShown = { x: mapFrom.x + (to.x - mapFrom.x) * e, z: mapFrom.z + (to.z - mapFrom.z) * e, yaw: mapFrom.yaw + turn * e };
      if (k >= 1) { mapFrom = null; mapShown = to; }
    } else mapShown = to;
    const hud = { world: mapView, hero, tileX: mapShown.x, tileZ: mapShown.z, yaw: mapShown.yaw, zoom: MAP_ZOOM };
    ui.draw(hud);
    bars.draw(hud);
  }
  // Start sliding from wherever the map is now (the player moved or turned, or changed level: then jump).
  function moveMap(jump) {
    if (jump) { mapFrom = null; return; }
    mapFrom = { ...mapShown }; mapStart = performance.now();
  }

  // Show the player's new state. `cmd` is the command that led here, when one did.
  function show(cmd) {
    exploration.reveal(p);
    const motion = cmd ? motionFor(cmd) : null;
    const continuing = !!drag && drag.cmd === cmd; // the swipe that made this move already showed its first part
    // The picture to move away from: what is on screen right now, unless a swipe was already showing the
    // settled one transformed, in which case the clean picture in `next`.
    prev.getContext('2d').drawImage(continuing || !(anim || drag || release) ? next : viewCanvas, 0, 0);
    render(next);
    const u0 = continuing ? drag.amount * PEEK : 0;
    drag = release = null;
    anim = motion ? { motion, u0, t0: performance.now(), ms: motion.ms * (1 - u0) } : null;
    moveMap(!cmd); // a step or turn slides the minimap; anything else (start, new level, respawn) jumps
    drawHud();
    updateStatus();
  }

  async function travel(exit, { respawn = false } = {}) {
    sceneInput?.cancel();
    transitioning = true;
    anim = drag = release = null;
    frame.setAttribute('aria-busy', 'true');
    say('Opening the passage...');
    try {
      const destination = await prepare(exit.to);
      const spawn = exit.spawn ?? destination.level.start;
      if (destination.view.V.W !== W || destination.view.V.H !== H ||
          (destination.view.V.pixel ?? 1) !== SHOWN) throw new Error('Level view sizes must match.');
      const landing = destination.cell(spawn.x, spawn.z);
      if (!landing || landing.wall) throw new Error('The destination has no safe landing.');
      await ensureArt(destination);
      level.onExit?.(api);
      active = destination; levelId = exit.to;
      ({ level, props, view, images, cell, comp, exploration, monsters } = active);
      // The living creatures go back to their places, whole; the dead stay dead.
      if (respawn) {
        await Promise.all([...cache.values()].map(job => job.then(context => context.monsters.reset()).catch(() => {})));
        hero.restore();
      } else monsters.reset();
      monsterDue = performance.now() + monsters.graceMs;
      Object.assign(p, spawn, { steps: 0 });
      Object.assign(window.__game2d, { levelId, level, view, images, monsters });
      peeks.clear(); peekKey = '';
      bars.setLevel(level);
      document.title = `${level.shortName ?? level.name} · ${title}`;
      log.length = 0; logKey = '';
      show(); say(`You enter ${level.shortName ?? level.name}.`); look();
      transitioning = false;
      level.onEnter?.(api);
      if (policy.onLevelChange) save();
      return true;
    } catch (error) {
      say(error.message);
      return false;
    } finally {
      transitioning = false;
      frame.removeAttribute('aria-busy');
    }
  }

  // Load a snapshot while playing: the saved level opens, every component is restored, creatures start over.
  // `respawn` also heals the hero (coming back from death). Returns false, and plays on, when it cannot.
  async function loadGame(snapshot, { respawn = false } = {}) {
    const target = peek(snapshot, 'engine.player')?.levelId;
    if (!Object.hasOwn(definitions, target)) { say('That save is from a level that no longer exists.'); return false; }
    loading = true;
    sceneInput?.cancel(); touch.cancel();
    anim = drag = release = null;
    try {
      const { issues } = await persistence.restore(snapshot);
      for (const issue of issues) console.warn(`save: ${issue.section}: ${issue.message}`);
      if (issues.some(issue => issue.section === 'engine.player' && issue.problem === 'failed')) return false;
      await ensureArt(active);
      await Promise.all([...cache.values()].map(job => job.then(context => context.monsters.reset()).catch(() => {})));
      if (respawn) hero.restore();
      monsterDue = performance.now() + monsters.graceMs; swing.reset();
      peeks.clear(); peekKey = ''; log.length = 0; logKey = '';
      bars.setLevel(level); show(); look();
      return true;
    } catch (error) { say(error.message); return false; }
    finally { loading = false; }
  }

  async function die() {
    if (dead || transitioning) return;
    dead = true; anim = drag = release = null;
    sceneInput?.cancel(); touch.cancel();
    for (const code of heldKeys) blockedKeys.add(code);
    hero.hp = 0; swing.reset(); peeks.clear(); peekKey = ''; show();
    // Death returns the hero, healed, to the respawn point (by default the start of the first level); the creatures start over. Nothing is saved.
    let retry = false;
    while (dead) {
      await gameOver.wait(retry);
      if (await travel({ to: respawn.level, spawn: respawn.spawn ?? definitions[respawn.level].level.start }, { respawn: true })) {
        dead = false; gameOver.close(); say(respawn.message ?? 'You awaken, safe once more.');
        return;
      }
      retry = true;
    }
  }

  // Fighting. The hero swings at the creature on the tile they face (or share), then waits out a cooldown. Hits and
  // misses show as floating text; creatures play data-driven combat clips (see monsters.js).
  const swing = createCooldown(hero.attackMs), floaters = [];
  let hurtFlash = 0;
  const float = (text, color, x = cw / 2, y = ch * .42) => floaters.push({ text, color, x, y, t0: performance.now() });
  function attack(targetId = null) {
    if (dead || transitioning || loading || bars.isOpen() || document.hidden) return false;
    const now = performance.now(), [dx, dz] = DIRS[p.dir];
    const target = targetId ? monsters.actors.find(a => a.id === targetId && a.hp > 0 && !a.dyingUntil)
      : monsters.adjacent(p).find(a => (a.x === p.x && a.z === p.z) || (a.x === p.x + dx && a.z === p.z + dz));
    if (targetId && (!target || !comp.target(targetId))) return false;
    if (targetId && Math.abs(target.x - p.x) + Math.abs(target.z - p.z) > 1) { say('Step closer to attack.'); return false; }
    if (!swing.ready(now)) return true;
    swing.use(now);
    if (!target) { say('You swing at the empty air.'); return false; }
    const rect = comp.target(target.id)?.rect;
    const fx = rect ? (rect.x + rect.w / 2) * INTERNAL : cw / 2;
    const fy = rect ? (rect.y + rect.h * .35) * INTERNAL : ch * .42;
    monsters.face(target, p);
    const result = strike(hero, target);
    if (!result.hit) { say(`You miss the ${target.name}.`); float('Miss', '#d8d0c0', fx, fy); }
    else {
      say(`You hit the ${target.name} for ${result.damage}.`); float(`-${result.damage}`, '#ffe08a', fx, fy);
      if (monsters.damage(target, result.damage, now)) { say(`The ${target.name} dies.`); target.onDeath?.(api); }
    }
    peeks.clear(); peekKey = ''; render(next);
    return target.hp > 0;
  }

  function struckBy(actor, now) {
    const result = strike(actor, hero);
    if (!result.hit) { say(`The ${actor.name} misses you.`); float('Miss', '#d8d0c0', cw / 2, ch * .8); return; }
    hero.hp = Math.max(0, hero.hp - result.damage); hurtFlash = now + 300;
    say(`The ${actor.name} ${actor.verb ?? 'hits'} you for ${result.damage}.`); float(`-${result.damage}`, '#ff6a5a', cw / 2, ch * .8);
    drawHud();
    if (hero.hp <= 0) void die();
  }
  function drawEffects(now) {
    if (hurtFlash > now) { g.fillStyle = `rgba(190,20,20,${.4 * (hurtFlash - now) / 300})`; g.fillRect(0, 0, cw, ch); }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i], k = (now - f.t0) / 800;
      if (k >= 1) { floaters.splice(i, 1); continue; }
      drawText(g, FONT, f.text, Math.round(f.x - f.text.length * FONT.w / 2), Math.round(f.y - k * 14), f.color, { outline: '#000' });
    }
  }

  function act(cmd) {
    if (bars.isOpen() || transitioning || loading || dead) return;
    if (cmd === 'attack') { attack(); return; }
    if (cmd === 'interact') {
      const [dx, dz] = DIRS[p.dir];
      interact(relCell, { say, game: api, exit: exitAhead(), door: cell(p.x + dx, p.z + dz)?.door ?? null, pile: openPile });
      return;
    }
    sceneInput?.cancel();
    const exit = cmd === 'forward' && exitAhead();
    if (exit) { void travel(exit); return; }
    const st = plan(cmd);
    if (!st) {
      const [dx, dz] = DIRS[(p.dir + { forward: 0, strafeRight: 1, back: 2, strafeLeft: 3 }[cmd]) % 4];
      const door = cell(p.x + dx, p.z + dz)?.door;
      say(monsters.occupied(p.x + dx, p.z + dz) ? 'A creature blocks your way.' : door ? (door.state.locked ? 'The door is locked.' : 'The door is shut.') : 'You bump into a wall.');
      settleDrag(); return;
    }
    Object.assign(p, st);
    show(cmd);
    look();
  }

  const keymap = {
    KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'strafeLeft', KeyD: 'strafeRight',
    KeyQ: 'left', ArrowLeft: 'left', KeyE: 'right', ArrowRight: 'right',
  };
  const touch = createTouch({
    onCommand: act, onSwipe, swipeEl: viewCanvas, mount: bars.controls,
    action: [{ label: 'Attack', cmd: 'attack' }, { label: 'Use', cmd: 'interact' }],
    extras: debugMode ? [{ label: 'Slot outlines', code: 'KeyO' }] : [],
    sideBars: { left: bars.left, right: bars.right },
  });
  sceneInput = createSceneInput(viewCanvas, {
    hit: (x, y) => { const r = viewCanvas.getBoundingClientRect(); return comp.hitAt((x - r.left) * W / r.width, (y - r.top) * H / r.height); },
    getTarget: id => comp.target(id),
    blocked: () => dead || transitioning || loading || bars.isOpen() || document.hidden || !!(anim || drag || release),
    attack, interact: target => interactTarget(target, { say, game: api }),
    changed: () => render(next), cancelGesture: () => touch.cancel(),
  });
  window.addEventListener('keydown', (ev) => {
    if (keymap[ev.code]) {
      heldKeys.add(ev.code);
      if (blockedKeys.has(ev.code)) { ev.preventDefault(); return; }
    }
    if (bars.isOpen() && (ev.code === 'Escape' || (ev.code === 'KeyL' && bars.isLogOpen()))) { ev.preventDefault(); bars.close(); return; }
    if (ev.code === 'KeyF' && !ev.repeat && !ev.ctrlKey && !ev.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) { ev.preventDefault(); void bars.menu.fullscreen(); return; }
    if (ev.code === 'KeyJ' && !ev.repeat && !dead && !transitioning && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) { ev.preventDefault(); bars.menu.journal(); return; } // the journal, like I for the satchel
    if (ev.code === 'KeyI' && !ev.repeat && !dead && !transitioning && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) { ev.preventDefault(); bars.menu.inventory(); return; } // opens, or closes when already open
    if (dead || transitioning || loading || bars.isOpen() || /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    if (keymap[ev.code]) { ev.preventDefault(); act(keymap[ev.code]); return; }
    if (ev.code === 'KeyX' || ev.code === 'Enter') { ev.preventDefault(); if (!ev.repeat) act('attack'); return; }
    if (ev.code === 'Digit1') { ev.preventDefault(); if (!ev.repeat) quickUse('hp'); return; }
    if (ev.code === 'Digit2') { ev.preventDefault(); if (!ev.repeat) quickUse('mp'); return; }
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) act('interact'); return; }
    if (ev.code === 'KeyL') { ev.preventDefault(); bars.openLog(); return; }
    if (ev.code === 'KeyO') { opts.outlines = !opts.outlines; say(`Slot outlines: ${opts.outlines ? 'on' : 'off'}`); show(); }
  });
  window.addEventListener('keyup', ev => { heldKeys.delete(ev.code); blockedKeys.delete(ev.code); });
  window.addEventListener('blur', () => { heldKeys.clear(); blockedKeys.clear(); sceneInput.cancel(); touch.cancel(); });

  function updateStatus() {
    const missing = view.compose(relCell).filter(it => !(it.actor && !it.actor.art) && !comp.imageFor(it));
    status.hidden = !debugMode;
    status.textContent = `${level.name} · (${p.x},${p.z}) facing ${'NESW'[p.dir]} · ${images.size} slot images loaded`
      + (missing.length ? ` · missing here: ${missing.map((m) => `${m.type}/${m.slot.id}`).join(', ')}` : '');
  }

  // Desktop keeps the original canvas panel. Mobile uses a separate DOM dashboard
  // in portrait and thumb-friendly rails in landscape, preserving the scene's aspect ratio.
  function resize() {
    const mode = touch.layout();
    const vp = viewportSize();
    // Full screen (the API, or the browser's own F11): drop the shortcut line and frame, and fill the screen.
    const full = !!document.fullscreenElement || matchMedia('(display-mode: fullscreen)').matches;
    document.documentElement.toggleAttribute('data-fullscreen', full);
    const DW = W * SHOWN, DH = H * SHOWN;
    // Reserve room for the landscape rails before fitting the scene.
    const barW = bars.setLayout(mode, vp.w);
    const avail = mode === 'portrait' ? vp.w / DW
      : mode === 'landscape' ? Math.min((vp.w - 2 * barW) / DW, vp.h / DH)
      : Math.min(vp.w / DW, (vp.h - (full ? 0 : 70)) / (DH + ui.height));
    const scale = mode === 'desktop' && avail >= 1 && !full ? Math.floor(avail * 4) / 4 : avail;
    // Compare with the actual internal canvas, not the nominal 640px view.
    // A 532px phone view enlarges 320px art and should keep its pixel edges.
    viewCanvas.style.imageRendering = DW * scale < cw ? 'auto' : 'pixelated';
    uiCanvas.style.imageRendering = DW * scale < uiCanvas.width ? 'auto' : 'pixelated';
    viewCanvas.style.width = uiCanvas.style.width = frame.style.width = `${DW * scale}px`;
    viewCanvas.style.height = `${DH * scale}px`;
    uiCanvas.style.height = `${ui.height * scale}px`;
    // The font is 8 pixels tall: the canvas panel shows each UI pixel this many screen pixels wide (3 at 960px); phones use 2.
    bars.setView(`${DH * scale}px`, mode === 'desktop' ? Math.max(2, Math.round(DW * scale / PW)) : 2);
    logCanvas.style.width = `${DW * scale}px`;
    logCanvas.style.height = `${logCanvas.height * DW * scale / PW}px`;
    if (mode !== 'desktop') {
      logCanvas.style.top = '32px'; logCanvas.style.bottom = 'auto';
    } else { logCanvas.style.top = 'auto'; logCanvas.style.bottom = `${ui.height * scale}px`; }
  }
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
  matchMedia('(display-mode: fullscreen)').addEventListener('change', resize);
  resize();

  document.title = `${level.shortName ?? level.name} · ${title}`;
  monsterDue = performance.now() + monsters.graceMs;
  say(saved ? `Welcome back, ${hero.name}.` : `Welcome to ${level.name}, ${hero.name}.`);
  world.setApi(api); // instances made so far get their onCreate (a new game's first level)
  level.onEnter?.(api);
  if (!saved && (policy.intervalMs || policy.onHidden || policy.onLevelChange)) save(); // with autosave on, a new game is written at once
  show();
  look();

  function updateMonsters(now) {
    if (dead || transitioning || loading || bars.isOpen() || document.hidden) {
      monsterDue = now + monsters.stepMs; monsters.freeze(now); return;
    }
    monsters.resume(now);
    const gone = monsters.reap(now);
    for (const actor of gone) if (actor.spawned) world.remove(actor); // a spawned creature that died is gone for good
    let changed = gone.length > 0 || world.version !== drawnVersion;
    drawnVersion = world.version;
    if (monsters.actors.length && now >= monsterDue) {
      monsterDue = now + monsters.stepMs;
      const version = monsters.version;
      monsters.step(p, now);
      changed ||= version !== monsters.version;
    }
    if (monsters.actors.length && now >= monsterDue - monsters.stepMs) {
      const version = monsters.version;
      for (const actor of monsters.engage(p, now)) struckBy(actor, now);
      changed ||= version !== monsters.version;
    }
    changed = monsters.updateAnimations(now) || changed;
    if (changed) {
      // Update moving creatures without interrupting a player's current motion.
      peeks.clear(); peekKey = ''; render(next);
      if (drag) drag.peek = peekFor(drag.cmd);
      if (release) release.peek = peekFor(release.cmd);
    }
  }

  function loop(now) {
    updateMonsters(now);
    sceneInput.update(now);
    if (mapFrom) drawHud(now);
    if (drag) {
      drawTransition(g, next, drag.peek, drag.motion, drag.amount * PEEK);
    } else if (release) {
      const k = Math.min(1, (now - release.t0) / RELEASE_MS);
      drawTransition(g, next, release.peek, release.motion, release.from * PEEK * (1 - easeOut(k)));
      if (k >= 1) release = null;
    } else if (anim) {
      const k = Math.min(1, (now - anim.t0) / anim.ms);
      drawTransition(g, prev, next, anim.motion, anim.u0 + (1 - anim.u0) * easeOut(k));
      if (k >= 1) anim = null;
    } else {
      g.drawImage(next, 0, 0);
    }
    drawEffects(now);
    drawLog(now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  return { persistence, flags, save, getState: label => persistence.snapshot({ label }), loadState: loadGame };
}
