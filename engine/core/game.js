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
import { actorDirection } from '../rules/monsters.js';
import { createGameOver } from '../ui/game-over.js';
import { interactTarget } from '../rules/interaction.js';
import { flat } from './world.js';
import { withIcons, panelOverlay } from '../ui/panel-icons.js';
import { loadIcons, savedIconStyle, saveIconStyle } from '../ui/icons.js';
import { HEAD_X } from '../ui/head.js';
import { deriveStats } from '../rules/combat.js';
import { PEEK, RELEASE_MS, motionFor, easeOut, drawTransition } from './transition.js';
import { createSaveStore, peek } from './persistence.js';
import { createSession, DIR_KEYS } from './session.js';
import { createRng } from './rng.js';
import { startAutosave, defaultAutosave } from './autosave.js';
import { createTitleScreen } from '../ui/title-screen.js';
import { drawText } from '../ui/bitmapfont.js';
import { font5x8 as FONT } from '../ui/font-5x8.js';

// Grid crawler drawn by 2D compositing: every step and turn shows a new
// composite of pre-painted slot images (see view.js). Movement is instant, softened by a very short, subtle
// motion between the old and the new picture (transition.js); a swipe starts it before the finger lifts.
// The rules (the hero, the world, fights, items, saving) are a session (session.js); this file draws it, loads its
// art and turns input into session calls. The simulation (engine/sim/) drives the same session without a screen.

// Start a campaign. `levels` maps level ids to level definitions (see levels.js) and `start` is the id of the first one;
// `content` is the campaign's own content book (or a list of them), added to the engine's (see content/catalog.js).
// `startingItems` is what the hero carries on a new game. Death returns the hero to `respawn` ({ level, spawn? },
// by default the start of the first level; `place` names it on the defeat screen, `message` is said on waking). The page supplies the canvases: `viewCanvas`, `uiCanvas`, their `frame`, and
// a `status` line for debugging.
export async function startGame(options) {
  // The menus before the game stay up (showing "Loading...") until the first level is on screen.
  const screen = createTitleScreen({ title: options.title ?? 'Dungeon', ...options.menu });
  try { const game = await runGame(options, screen); screen.close(); return game; }
  catch (error) { screen.fail(error.message); throw error; }
}

async function runGame({ levels, start, content = [], startingItems = [], respawn = { level: start },
  viewCanvas, uiCanvas, frame, status, inventorySize = 48, inventoryColumns = 8,
  heroAttributes = { strength: 6, vitality: 6, intellect: 4, agility: 5 }, heroAttackMs = 700,
  // Persistence. `title` names the game (window title, start screen); `saveKey` keeps its saves apart from other games on the
  // same origin; `storage` is any Storage-like object (default localStorage); `maxSlots` limits save slots; `autosave` sets
  // when to save (see autosave.js); `persist` adds the game's own sections: a list, or a function that gets the engine's
  // components ({ flags, hero, inventory, equipment, itemDefs }) and returns the list. See docs/engine/persistence.md.
  title = 'Dungeon', saveKey = 'dungeon-crawler', storage, maxSlots = 3, autosave = {}, persist = [],
  // Character creation on a new game: the player names the hero and adds `points` to the attributes. `false` skips it.
  // `menu` dresses the main menu: { logo, background } image URLs (without a logo the title is written out).
  characterCreation = { points: 4 } }, screen) {
  // Keep the complete asset list for a fresh reload; the browser's default
  // timing buffer holds only 250 entries, fewer than a full scene's images.
  performance.setResourceTimingBufferSize(4096);
  const books = mergeContent(engineContent, ...[content].flat());
  const itemDefs = books.items;
  if (!Object.hasOwn(levels, start)) throw new Error(`The start level "${start}" is not one of the levels`);
  if (!Object.hasOwn(levels, respawn.level)) throw new Error(`The respawn level "${respawn.level}" is not one of the levels`);
  const definitions = Object.fromEntries(Object.entries(levels).map(([id, def]) => [id, resolveLevel(id, def, books)]));
  // Saves. The URL can ask for a fresh start in a slot (?new, ?slot=name) or a particular level (?level=, which plays
  // without saving so a debugging jump never overwrites a real save). ?seed=<n> makes chance repeatable (combat, loot,
  // creatures' wandering), for reproducing what a bot found.
  const params = new URLSearchParams(location.search);
  const policy = { ...defaultAutosave, ...autosave };
  let store = storage;
  if (store === undefined) { try { store = window.localStorage; } catch { store = null; } }
  const saves = createSaveStore(store, saveKey);
  const persistent = !params.has('level');
  let slot = params.get('slot') ?? 'slot-1', saved = null, creation = null;
  const newHero = () => (characterCreation
    ? screen.character({ base: heroAttributes, points: characterCreation.points ?? 4, derive: attrs => deriveStats(attrs) })
    : Promise.resolve({}));
  if (persistent && params.has('new')) {
    saves.clear(slot);
    if (characterCreation) creation = await newHero();
  } else if (persistent) {
    // The main menu: continue the newest save, start a new game, or pick a save to load. Back returns here.
    const freeSlot = () => { for (let n = 1; ; n++) if (!saves.list().some(s => s.slot === `slot-${n}`)) return `slot-${n}`; };
    for (;;) {
      const slots = saves.list();
      const choice = await screen.main({ latest: slots[0] ?? null });
      if (choice === 'continue') { slot = slots[0].slot; saved = saves.load(slot); break; }
      if (choice === 'load') {
        const picked = await screen.saves({ slots, remove: id => saves.clear(id) });
        if (picked) { slot = picked; saved = saves.load(slot); break; }
        continue;
      }
      const target = maxSlots && slots.length >= maxSlots
        ? await screen.saves({ slots, remove: id => saves.clear(id), replace: true }) : freeSlot();
      if (!target) continue;
      const hero = await newHero();
      if (!hero) continue;
      saves.clear(target); // replacing a save: the old one goes now, not at the first save
      slot = target; creation = characterCreation ? hero : null;
      break;
    }
  }
  if (persistent) screen.loading();
  const savedLevel = peek(saved, 'engine.player')?.levelId;
  if (saved && !Object.hasOwn(definitions, savedLevel)) saved = null; // that level no longer exists: start over in this slot
  const asked = params.get('level');
  const firstLevel = saved ? savedLevel : asked && Object.hasOwn(definitions, asked) ? asked : start;
  const random = params.has('seed') ? createRng(params.get('seed')) : () => Math.random();
  // The rules. Its hooks are where the screen takes part: a level's art loads before the player arrives there.
  const session = createSession({ levels: definitions, start, books, startingItems, respawn, inventorySize, heroAttributes,
    heroAttackMs, creation, persist, level: firstLevel, random, clock: () => performance.now(),
    hooks: {
      travel: (exit, options) => travel(exit, options),
      ensureArt: async id => { const context = cache.has(id) ? await cache.get(id).catch(() => null) : null; if (context) await ensureArt(context); },
      openContainer: box => bars.openContainer(box),
      canTarget: target => !!comp.target(target.id),
    } });
  const { world, hero, inventory, equipment, flags, persistence, messages, api, player: p } = session;
  let levelId = session.levelId;
  const say = text => session.say(text);
  const cache = new Map();
  async function prepare(id) {
    if (!Object.hasOwn(definitions, id)) throw new Error(`Unknown level: ${id}`);
    if (!cache.has(id)) {
      const job = (async () => {
        const def = definitions[id], view = createView(def.level.view);
        const rules = session.contextOf(id);
        const art = artOf(id), loaded = new Set();
        const images = await loadSlotImages(view, { environment: def.environment, ...art });
        for (const thing of [...art.walls, ...art.props, ...art.actors]) loaded.add(thing.art);
        // Required dungeon art must be complete before replacing the active scene.
        if (def.level.atmosphere && (!images.has('floor') || art.walls.some(({ art }) =>
          view.wallSlots.some(slot => !images.has(`walls:${art}:${slot.id}`))))) {
          throw new Error('The dungeon artwork could not be loaded. Please try again.');
        }
        return { ...rules, view, images, loaded, comp: createCompositor(view, images) };
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
  let transitioning = false, loading = false;
  const isDead = () => session.dead;

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

  let sceneInput = null;
  const opts = { outlines: false };
  const heldKeys = new Set(), blockedKeys = new Set();

  for (const [id, def] of Object.entries(itemDefs)) if (!icons.has(def.icon)) throw new Error(`item "${id}" has no icon "${def.icon}" in the icon atlas or the campaign's icon sheets`);
  const { useItem: use, quickUse: quick, drop } = session;
  const useItem = index => { const result = use(index); drawHud(); return result; };
  const quickUse = kind => { quick(kind); drawHud(); };
  if (saved) {
    const { issues } = await session.load(saved); // the level's things, as saved
    for (const issue of issues) console.warn(`save: ${issue.section}: ${issue.message}`);
  }
  let lastSaved = saved ? persistence.digest(persistence.snapshot()) : '', saveWarned = false;
  function save() {
    if (!persistent || isDead() || transitioning || loading) return true;
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
  const bars = createMobileHUD({ icons, setIconStyle: style => { saveIconStyle(style); location.reload(); }, portrait: portraitImage, world: mapView, hero, frame, messages, inventory, equipment, inventoryColumns, itemDefs, say, drop, onUse: useItem, onQuick: quickUse, saves: saveMenu,
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
  uiCanvas.addEventListener('click', ev => { if (!isDead() && !transitioning) hotspotAt(ev)?.run(); });
  uiCanvas.addEventListener('mousemove', ev => { const h = hotspotAt(ev); uiCanvas.style.cursor = h ? 'pointer' : ''; uiCanvas.title = h?.label ?? ''; });
  const gameOver = createGameOver(frame, { place: respawn.place });

  window.__game2d = { view, images, level, levelId, p, world: mapView, things: world, game: api, monsters, hero, inventory, equipment, flags, persistence, save, loadState: loadGame, session,
    get targets() { return comp.targets(); },
    get phase() { return isDead() ? 'game-over' : (transitioning || loading) ? 'loading' : 'playing'; } };
  document.addEventListener('visibilitychange', () => session.delayMonsters(monsters.stepMs));

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
  session.on('message', ({ text }) => {
    bars.notice(text);
    const t = performance.now();
    for (const line of wrap(text)) log.push({ text: line, t });
    while (log.length > LOG_LINES) log.shift();
  });
  const look = () => session.look();

  // The cell `d` ahead and `l` to the right of the player as view.compose expects it: the session's, with its creatures
  // laid out to be drawn.
  const relCell = (l, d) => {
    const c = session.relCell(l, d);
    if (!c || c.wall) return c;
    return {
      props: c.props,
      actors: arrangeActors(c.monsters.map(actor => ({ ...flat(actor), direction: actorDirection(actor.dir, p.dir),
        animation: monsters.animation(actor, performance.now()) }))),
    };
  };

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

  const plan = cmd => session.plan(cmd);

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
    if (phase !== 'move' || bars.isOpen() || transitioning || loading || isDead()) { settleDrag(); return; }
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
      // The session moves the player; the 'level' event (below) switches what is drawn before the arrival is said.
      arriving = destination;
      session.enter(exit.to, spawn, { respawn });
      transitioning = false;
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

  // The player is on another level: draw it.
  let arriving = null;
  session.on('level', () => {
    active = arriving ?? active; arriving = null; levelId = session.levelId;
    ({ level, props, view, images, cell, comp, exploration, monsters } = active);
    Object.assign(window.__game2d, { levelId, level, view, images, monsters });
    peeks.clear(); peekKey = '';
    bars.setLevel(level);
    document.title = `${level.shortName ?? level.name} · ${title}`;
    log.length = 0; logKey = '';
    show();
  });

  // Load a snapshot while playing: the saved level opens, every component is restored, creatures start over.
  // `respawn` also heals the hero (coming back from death). Returns false, and plays on, when it cannot.
  async function loadGame(snapshot, { respawn = false } = {}) {
    const target = peek(snapshot, 'engine.player')?.levelId;
    if (!Object.hasOwn(definitions, target)) { say('That save is from a level that no longer exists.'); return false; }
    loading = true;
    sceneInput?.cancel(); touch.cancel();
    anim = drag = release = null;
    try {
      const { issues } = await session.load(snapshot, { respawn });
      for (const issue of issues) console.warn(`save: ${issue.section}: ${issue.message}`);
      if (issues.some(issue => issue.section === 'engine.player' && issue.problem === 'failed')) return false;
      peeks.clear(); peekKey = ''; log.length = 0; logKey = '';
      bars.setLevel(level); show(); look();
      return true;
    } catch (error) { say(error.message); return false; }
    finally { loading = false; }
  }

  // Death (the session says when): the defeat screen, then the hero wakes, healed, at the respawn point (by default the
  // start of the first level); the creatures start over. Nothing is saved.
  async function die() {
    anim = drag = release = null;
    sceneInput?.cancel(); touch.cancel();
    for (const code of heldKeys) blockedKeys.add(code);
    peeks.clear(); peekKey = ''; show();
    let retry = false;
    while (session.dead) {
      await gameOver.wait(retry);
      if (await session.revive()) { gameOver.close(); return; }
      retry = true;
    }
  }
  session.on('death', () => { void die(); });

  // Fighting (the rules are the session's). Hits and misses show as floating text; creatures play data-driven combat
  // clips (see monsters.js).
  const floaters = [];
  let hurtFlash = 0;
  const float = (text, color, x = cw / 2, y = ch * .42) => floaters.push({ text, color, x, y, t0: performance.now() });
  function attack(targetId = null) {
    if (isDead() || transitioning || loading || bars.isOpen() || document.hidden) return false;
    const result = session.attack(targetId);
    if (result.waiting) return true;
    if (!result.ok) return false;
    const { target } = result, rect = comp.target(target.id)?.rect;
    const fx = rect ? (rect.x + rect.w / 2) * INTERNAL : cw / 2;
    const fy = rect ? (rect.y + rect.h * .35) * INTERNAL : ch * .42;
    if (!result.hit) float('Miss', '#d8d0c0', fx, fy); else float(`-${result.damage}`, '#ffe08a', fx, fy);
    peeks.clear(); peekKey = ''; render(next);
    return target.hp > 0;
  }
  // A creature's blow, as the session dealt it.
  function struckBy({ hit, damage }, now) {
    if (!hit) { float('Miss', '#d8d0c0', cw / 2, ch * .8); return; }
    hurtFlash = now + 300; float(`-${damage}`, '#ff6a5a', cw / 2, ch * .8);
    drawHud();
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
    if (bars.isOpen() || transitioning || loading || isDead()) return;
    if (cmd === 'attack') { attack(); return; }
    if (cmd === 'interact') { session.interact(); return; }
    sceneInput?.cancel();
    // The session moves the player and says what they see; the picture is shown before that is said.
    const result = session.move(cmd, { before: () => show(cmd) });
    if (result.exit) { void travel(result.exit); return; }
    if (result.blocked) settleDrag();
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
    blocked: () => isDead() || transitioning || loading || bars.isOpen() || document.hidden || !!(anim || drag || release),
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
    if (ev.code === 'KeyJ' && !ev.repeat && !isDead() && !transitioning && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) { ev.preventDefault(); bars.menu.journal(); return; } // the journal, like I for the satchel
    if (ev.code === 'KeyI' && !ev.repeat && !isDead() && !transitioning && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) { ev.preventDefault(); bars.menu.inventory(); return; } // opens, or closes when already open
    if (isDead() || transitioning || loading || bars.isOpen() || /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
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
  session.begin({ loaded: !!saved }); // instances made so far get their onCreate (a new game's first level), the level its onEnter
  if (!saved && (policy.intervalMs || policy.onHidden || policy.onLevelChange)) save(); // with autosave on, a new game is written at once
  show();
  look();

  function updateMonsters(now) {
    const paused = isDead() || transitioning || loading || bars.isOpen() || document.hidden;
    const { changed, struck } = session.update(now, { paused });
    for (const blow of struck) struckBy(blow, now);
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
