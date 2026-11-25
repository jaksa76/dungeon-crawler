import { arrangeActors } from '../render/actor-layout.js';
import { createSceneInput } from './scene-input.js';
import { createView } from '../render/view.js';
import { loadImage, loadSlotImages, createCompositor } from '../render/compositor.js';
import { THEME } from '../ui/canvas.js';
import { createStage } from '../ui/stage.js';
import { createSwipe } from '../ui/swipe.js';
import { VIEW_W, VIEW_H } from '../ui/screen.js';
import { createHud } from '../ui/hud.js';
import { createMenus } from '../ui/menus.js';
import { resolveLevel } from './levels.js';
import { engineContent } from '../content/index.js';
import { mergeContent } from '../content/catalog.js';
import { actorDirection } from '../rules/monsters.js';
import { interactTarget } from '../rules/interaction.js';
import { flat } from './world.js';
import { loadIcons, savedIconStyle, saveIconStyle } from '../ui/icons.js';
import { deriveStats, FISTS } from '../rules/combat.js';
import { PEEK, RELEASE_MS, motionFor, easeOut, drawTransition } from './transition.js';
import { createSaveStore, peek } from './persistence.js';
import { reloadFresh } from './reload.js';
import { createSession, DIR_KEYS } from './session.js';
import { createRng } from './rng.js';
import { startAutosave, defaultAutosave } from './autosave.js';
import { createTitleScreen } from '../ui/title-screen.js';
import { drawText } from '../ui/bitmapfont.js';
import { font5x8 as FONT } from '../ui/font-5x8.js';
import { createSound } from '../ui/sound.js';

// Grid crawler drawn by 2D compositing: every step and turn shows a new
// composite of pre-painted slot images (see view.js). Movement is instant, softened by a very short, subtle
// motion between the old and the new picture (transition.js); a swipe starts it before the finger lifts.
// The rules (the hero, the world, fights, items, saving) are a session (session.js); this file draws it, loads its
// art and turns input into session calls. Everything is drawn on one canvas (ui/screen.js, ui/hud.js, ui/menus.js). The simulation (engine/sim/) drives the same session without a screen.

// Start a campaign. `levels` maps level ids to level definitions (see levels.js) and `start` is the id of the first one;
// `content` is the campaign's own content book (or a list of them), added to the engine's (see content/catalog.js).
// `startingItems` is what the hero carries on a new game. Death returns the hero to `respawn` ({ level, spawn? },
// by default the start of the first level; `place` names it on the defeat screen, `message` is said on waking). The page supplies the one
// `canvas` and a `status` line for debugging.
export async function startGame(options) {
  // The menus before the game stay up (showing "Loading...") until the first level is on screen.
  // The canvas, its scale and its pointer come first: the menus before the game and the game itself draw on the same one.
  const stage = createStage(options.canvas);
  window.__stage = stage; // for tests: the regions of whatever is on the canvas before the game starts
  const screen = createTitleScreen({ stage, title: options.title ?? 'Dungeon', ...options.menu });
  try { const game = await runGame(options, screen, stage); screen.close(); return game; }
  catch (error) { screen.fail(error.message); throw error; }
}

async function runGame({ levels, start, worldMap, content = [], startingItems = [], respawn = { level: start },
  status, inventorySize = 48, inventoryColumns = 8,
  heroAttributes = { strength: 6, vitality: 6, intellect: 4, agility: 5 },
  // What the hero fights with bare-handed: { name, damage: [min, max], speed, damageType } (rules/combat.js FISTS).
  unarmed = FISTS,
  // Experience and levels (rules/progression.js) and the loot budget rules (rules/generate-loot.js): both optional, the engine has defaults.
  progression, loot, startingSpells = [], quests = {},
  // The game's own sections of the help screen: [{ title, text }] (ui/help-screen.js).
  help = [],
  // Persistence. `title` names the game (window title, start screen); `saveKey` keeps its saves apart from other games on the
  // same origin; `storage` is any Storage-like object (default localStorage); `maxSlots` limits save slots; `autosave` sets
  // when to save (see autosave.js); `persist` adds the game's own sections: a list, or a function that gets the engine's
  // components ({ flags, hero, inventory, equipment, itemDefs }) and returns the list. See docs/engine/persistence.md.
  title = 'Dungeon', saveKey = 'dungeon-crawler', storage, maxSlots = 3, autosave = {}, persist = [],
  // Character creation on a new game: the player names the hero and adds `points` to the attributes. `false` skips it.
  // `menu` dresses the main menu: { logo, background } image URLs (without a logo the title is written out).
  characterCreation = { points: 4 } }, screen, stage) {
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
  const soundKey = `${saveKey}.muted`;
  let initiallyMuted = false;
  try { initiallyMuted = store?.getItem(soundKey) === 'true'; } catch { /* Sound still works without storage. */ }
  const sound = Object.values(levels).some(level => level.sound) ? createSound({ initiallyMuted, saveMuted(muted) {
    try { store?.setItem(soundKey, String(muted)); } catch { /* The setting still applies to this playthrough. */ }
  } }) : null;
  if (sound) {
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => sound.setPresent(!document.hidden));
  }
  const saves = createSaveStore(store, saveKey);
  const persistent = !params.has('level');
  let slot = params.get('slot') ?? 'slot-1', saved = null, creation = null;
  const newHero = () => (characterCreation
    ? screen.character({ base: heroAttributes, points: characterCreation.points ?? 4, derive: attrs => deriveStats(attrs, { weapon: unarmed }) })
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
    unarmed, creation, persist, progression, loot, startingSpells, quests, worldMap, level: firstLevel, random, clock: () => performance.now(),
    hooks: {
      travel: (exit, options) => travel(exit, options),
      ensureArt: async id => { const context = cache.has(id) ? await cache.get(id).catch(() => null) : null; if (context) await ensureArt(context); },
      openContainer: box => menus.openContainer(box),
      openWorldMap: map => {
        settleDrag();
        menus.openWorldMap(map, session.travelToLocation);
      },
      openShop: shop => menus.openShop(shop),
      showDialogue: line => menus.showDialogue(line, () => session.dialogue.close()),
      showEnding: ending => { menus.open(ending.title, ending.text, 'ending'); save(); },
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
  sound?.setLevel(level.sound);
  const { W, H } = view.V;
  const SHOWN = view.V.pixel ?? 1;
  let transitioning = false, loading = false;
  const isDead = () => session.dead;

  // The scene is composed in its own W x H coordinates but drawn into a surface of INTERNAL times that size (320x180 for the
  // default 640x360 view, and for a view built at 320x180) and copied onto the game's one canvas, at 1:1 (or enlarged without smoothing for a pixel view, which
  // is built for one size: its art is baked at it). Everything else (the HUD, the menus, the log) is drawn straight onto the
  // canvas, on the same pixel grid (see docs/engine/ui.md).
  const INTERNAL = SHOWN > 1 ? 1 : VIEW_W / W; // 0.5 for the default 640 x 360 view, 1 once the art is baked at 320 x 180
  const cw = Math.round(W * INTERNAL), ch = Math.round(H * INTERNAL);
  const viewCanvas = document.createElement('canvas'); viewCanvas.width = cw; viewCanvas.height = ch;
  const g = viewCanvas.getContext('2d');
  const prev = document.createElement('canvas'); prev.width = cw; prev.height = ch;
  const next = document.createElement('canvas'); next.width = cw; next.height = ch;
  const { screen: screen2d, ctx: main, kit, input, canvas } = stage;
  const icons = await loadIcons(new URL('../assets/icons/', import.meta.url).href, savedIconStyle(), Object.values(books.icons), books.materials);
  // The hero's full-body pixel sprite (48 x 96): the satchel and the character screen show it whole, the HUD the head.
  const portraitImage = await loadImage(new URL('../assets/ui/hero-sprite.png', import.meta.url).href);

  let sceneInput = null;
  const opts = { outlines: false };
  const heldKeys = new Set(), blockedKeys = new Set();

  for (const [id, def] of Object.entries(itemDefs)) if (!icons.has(def.icon)) throw new Error(`item "${id}" has no icon "${def.icon}" in the icon atlas or the campaign's icon sheets`);
  const { useItem: use, drop } = session;
  const useItem = index => use(index);
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
    get quests() { return session.quests.journal(); },
    get name() { return level.shortName ?? level.name; },
    get journal() { return level.journal ?? 'Explore the surrounding streets and passages.'; },
    typeAt: (x, z) => { if (!exploration.isKnown(x, z)) return null; const c = cell(x, z); return c === null ? null : (c.wall ? { wall: true } : { floor: true }); },
    get billboards() { return world.all(levelId).filter(e => e.name && e.category !== 'monster' && exploration.isKnown(e.x, e.z)).map(entity => ({ entity })); },
  };
  const debugMode = new URLSearchParams(location.search).has('debug');
  document.documentElement.toggleAttribute('data-debug', debugMode);
  // The quick bar as the HUD and the menus use it. Pressing a spell casts it the way the Cast button does.
  const quickBar = {
    size: session.quickbar.size, view: () => session.quickView(),
    set: (i, ref) => session.quickSet(i, ref),
    clear: i => session.quickClear(i),
    swap: (a, b) => session.quickSwap(a, b),
    activate(i) {
      if (isDead() || transitioning || loading || menus.isOpen() || document.hidden) return null;
      const result = session.quickActivate(i, id => castSpell(id));
      if (!result.ok && result.reason === 'empty') say('An empty slot. Drag an item or a spell here.');
      return result;
    },
    describe: i => session.quickDescribe(i),
    has: ref => session.quickView().some(v => v && v.kind === ref.kind && v.id === ref.id),
    // Put `ref` on the bar in the first free slot, or take it off when it is already there. Returns a line for the player.
    toggle(ref, name) {
      const view = session.quickView(), at = view.findIndex(v => v && v.kind === ref.kind && v.id === ref.id);
      if (at >= 0) { session.quickClear(at); return `${name} is off the quick bar.`; }
      const free = view.findIndex(v => !v);
      if (free < 0) return 'The quick bar is full. Drag it onto a slot to replace one.';
      return session.quickSet(free, ref) ? `${name} is on the quick bar, slot ${free + 1}.` : 'That cannot go on the quick bar.';
    },
  };
  const colourOf = type => books.damageTypes[type]?.colour ?? '#ffffff';
  const hasMagic = Object.keys(books.spells).length > 0;
  const menus = createMenus({ kit, icons, sprite: portraitImage, world: mapView, hero, messages, inventory, equipment, inventoryColumns, itemDefs, say, drop, onUse: useItem, saves: saveMenu, quick: quickBar,
    onEquip: session.equip, onUnequip: session.unequip, wouldChange: session.wouldChange, onSpend: session.spend, help, sound,
    wallet: Object.values(itemDefs).some(item => item.currency) ? session.wallet : null, onTake: session.take, onTakeAll: session.takeAll,
    magic: hasMagic ? {
      spells: () => session.spells().map(s => ({ ...s, text: s.cooldown ? `Recovers in ${+(s.cooldown / 1000).toFixed(1)} s.` : '' })),
      cast: id => castSpell(id), setReady: id => session.setReadySpell(id), ready: () => session.readySpell,
      effectName: id => books.effects[id]?.name ?? id,
    } : null, damageTypes: books.damageTypes,
    debug: { get: () => opts.outlines, set: value => { opts.outlines = value; show(); } },
    reload: reloadFresh, onFullscreen: () => screen2d.lockLandscape() });
  const hud = createHud({ kit, icons, portrait: portraitImage, hero, world: mapView, quick: quickBar, menus, command: cmd => act(cmd), say, colourOf,
    wallet: Object.values(itemDefs).some(item => item.currency) ? session.wallet : null, magic: hasMagic });
  const gameOver = menus.gameOver;

  window.__game2d = { ui: { get layout() { return screen2d.name; }, get spec() { return screen2d.spec; }, get scale() { return screen2d.scale; }, rects: () => hud.rects(screen2d.spec, quickBar.size), regions: () => kit.regions(), menus, canvas,
      // A point on the canvas, in logical pixels, as a point on the page.
      client: (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + x * r.width / canvas.width, y: r.top + y * r.height / canvas.height }; } },
    view, images, level, levelId, p, world: mapView, things: world, game: api, monsters, hero, inventory, equipment, flags, persistence, save, loadState: loadGame, session,
    get targets() { return comp.targets(); },
    get phase() { return isDead() ? 'game-over' : (transitioning || loading) ? 'loading' : 'playing'; } };
  document.addEventListener('visibilitychange', () => session.delayMonsters(monsters.stepMs));

  // Log: messages over the bottom-left of the view, fading out.
  const LOG_LINES = 4, LOG_PITCH = FONT.h + 1, LOG_PAD = 2;
  const maxChars = Math.floor((VIEW_W - 2 * LOG_PAD) / FONT.w);
  const log = [];
  // The on-screen log wraps a long message over several lines; the history keeps it whole.
  function wrap(text) {
    const lines = [];
    let line = '';
    for (const word of kit.plain(text).split(' ')) {
      if (line && line.length + 1 + word.length > maxChars) { lines.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    return line ? [...lines, line] : lines;
  }
  session.on('message', ({ text }) => {
    menus.toast(text);
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

  // Messages stay for 7 s, then fade out over 1 s. They sit over the bottom of the scene, as text you can read on any picture.
  function drawLog(now, view) {
    if (menus.isOpen() || gameOver.active) return;
    log.forEach((m, i) => {
      const alpha = Math.min(1, Math.max(0, 1 - (now - m.t - 7000) / 1000));
      if (alpha <= 0) return;
      main.globalAlpha = alpha;
      kit.origin(view.x, view.y);
      kit.text(m.text.slice(0, maxChars), LOG_PAD, VIEW_H - LOG_PAD - 1 - (log.length - i) * LOG_PITCH, '#f0e4c8', { shadow: true });
    });
    main.globalAlpha = 1; kit.origin(0, 0);
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
    if (phase !== 'move' || menus.isOpen() || transitioning || loading || isDead()) { settleDrag(); return; }
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
  const MAP_MS = 220;
  let mapShown = { x: p.x, z: p.z, yaw: -p.dir * Math.PI / 2 }, mapFrom = null, mapStart = 0;
  function mapAt(now) {
    const to = { x: p.x, z: p.z, yaw: -p.dir * Math.PI / 2 };
    if (mapFrom) {
      const k = Math.min(1, (now - mapStart) / MAP_MS), e = 1 - (1 - k) * (1 - k);
      let turn = to.yaw - mapFrom.yaw; turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI; // the short way round
      mapShown = { x: mapFrom.x + (to.x - mapFrom.x) * e, z: mapFrom.z + (to.z - mapFrom.z) * e, yaw: mapFrom.yaw + turn * e };
      if (k >= 1) { mapFrom = null; mapShown = to; }
    } else mapShown = to;
    return { tileX: mapShown.x, tileZ: mapShown.z, yaw: mapShown.yaw };
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
    updateStatus();
  }

  async function travel(exit, { respawn = false } = {}) {
    sceneInput?.cancel();
    transitioning = true;
    anim = drag = release = null;
    canvas.setAttribute('aria-busy', 'true');
    say('Opening the passage...');
    try {
      const journey = exit.travelTime ? new Promise(resolve => window.setTimeout(resolve, exit.travelTime)) : null;
      const destination = await prepare(exit.to);
      const spawn = exit.spawn ?? destination.level.start;
      if (destination.view.V.W !== W || destination.view.V.H !== H ||
          (destination.view.V.pixel ?? 1) !== SHOWN) throw new Error('Level view sizes must match.');
      const landing = destination.cell(spawn.x, spawn.z);
      if (!landing || landing.wall) throw new Error('The destination has no safe landing.');
      await ensureArt(destination);
      if (journey) await journey;
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
      canvas.removeAttribute('aria-busy');
    }
  }

  // The player is on another level: draw it.
  let arriving = null;
  session.on('level', () => {
    active = arriving ?? active; arriving = null; levelId = session.levelId;
    ({ level, props, view, images, cell, comp, exploration, monsters } = active);
    sound?.setLevel(level.sound);
    sound?.effect('door');
    Object.assign(window.__game2d, { levelId, level, view, images, monsters });
    peeks.clear(); peekKey = '';
    document.title = `${level.shortName ?? level.name} · ${title}`;
    log.length = 0;
    show();
  });
  if (sound) {
    session.on('move', ({ cmd }) => { if (cmd !== 'left' && cmd !== 'right') sound.effect('step'); });
    session.on('door', () => sound.effect('door'));
    session.on('damage-dealt', () => sound.effect('hit'));
    session.on('damage-taken', () => sound.effect('hit'));
    session.on('pickup', () => sound.effect('pickup'));
  }

  // Load a snapshot while playing: the saved level opens, every component is restored, creatures start over.
  // `respawn` also heals the hero (coming back from death). Returns false, and plays on, when it cannot.
  async function loadGame(snapshot, { respawn = false } = {}) {
    const target = peek(snapshot, 'engine.player')?.levelId;
    if (!Object.hasOwn(definitions, target)) { say('That save is from a level that no longer exists.'); return false; }
    loading = true;
    sceneInput?.cancel(); input.cancel(); swipe.cancel();
    anim = drag = release = null;
    try {
      const { issues } = await session.load(snapshot, { respawn });
      for (const issue of issues) console.warn(`save: ${issue.section}: ${issue.message}`);
      if (issues.some(issue => issue.section === 'engine.player' && issue.problem === 'failed')) return false;
      peeks.clear(); peekKey = ''; log.length = 0;
      show(); look();
      return true;
    } catch (error) { say(error.message); return false; }
    finally { loading = false; }
  }

  // Death (the session says when): the defeat screen, then the hero wakes, healed, at the respawn point (by default the
  // start of the first level); the creatures start over. Nothing is saved.
  async function die() {
    anim = drag = release = null;
    sceneInput?.cancel(); input.cancel(); swipe.cancel();
    for (const code of heldKeys) blockedKeys.add(code);
    peeks.clear(); peekKey = ''; show();
    let retry = false;
    while (session.dead) {
      await gameOver.wait(retry, respawn.place);
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
    if (isDead() || transitioning || loading || menus.isOpen() || document.hidden) return false;
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
  // Cast the ready spell (or `id`): the session does it; floating numbers show what it did, in the colour of its magic.
  function castSpell(id = undefined) {
    if (isDead() || transitioning || loading || document.hidden) return null;
    const result = session.cast(id), colour = books.damageTypes[books.spells[result.spell ?? id ?? session.readySpell]?.magicType]?.colour ?? '#ffe08a';
    if (!result.ok) return result;
    for (const t of result.targets) {
      if (t.target === 'hero') { if (t.healed) float(`+${t.healed}`, '#8fe08a', cw / 2, ch * .8); continue; }
      const rect = comp.target(t.target.id)?.rect;
      float(t.immune ? 'Immune' : `-${t.damage}`, colour, rect ? (rect.x + rect.w / 2) * INTERNAL : cw / 2, rect ? (rect.y + rect.h * .35) * INTERNAL : ch * .42);
    }
    peeks.clear(); peekKey = ''; render(next);
    return result;
  }
  // A creature's blow, as the session dealt it.
  function struckBy({ hit, damage }, now) {
    if (!hit) { float('Miss', '#d8d0c0', cw / 2, ch * .8); return; }
    hurtFlash = now + 300; float(`-${damage}`, '#ff6a5a', cw / 2, ch * .8);
  }
  // A status effect as the view shows it, in the colour of its magic: "BURNING 3" (seconds left).
  const effectLabel = e => ({ text: `${e.name.toUpperCase()} ${Math.ceil(e.left / 1000)}`, colour: books.damageTypes[e.magicType]?.colour ?? '#ffffff' });
  // Status effects on the creature in the hero's sights (session.targeted: the one pointed at, else the nearest ahead),
  // stacked above its head, or just under its name plate when it is pointed at (scene-targets.js draws the plate). Not
  // while the view slides, nor when the creature is not drawn.
  function drawTargetEffects() {
    if (anim || drag || release) return;
    const foe = session.targeted(sceneInput?.targetId), list = foe?.fx?.view() ?? [];
    const rect = list.length && comp.target(foe.id)?.rect;
    if (!rect) return;
    const pitch = FONT.h + 2, plate = comp.plate();
    const y = plate?.id === foe.id ? plate.y + plate.h + 1 : Math.max(2, Math.round(rect.y * INTERNAL) - 1 - list.length * pitch);
    const cx = (rect.x + rect.w / 2) * INTERNAL;
    list.forEach((e, i) => {
      const { text, colour } = effectLabel(e), w = text.length * FONT.w;
      drawText(g, FONT, text, Math.round(Math.min(cw - w - 2, Math.max(2, cx - w / 2))), y + i * pitch, colour, { outline: '#000' });
    });
  }
  function drawEffects(now) {
    session.heroEffects.view().forEach((e, i) => { // status effects on the hero, top left
      const { text, colour } = effectLabel(e);
      drawText(g, FONT, text, 3, 3 + i * (FONT.h + 2), colour, { outline: '#000' });
    });
    drawTargetEffects();
    if (hurtFlash > now) { g.fillStyle = `rgba(190,20,20,${.4 * (hurtFlash - now) / 300})`; g.fillRect(0, 0, cw, ch); }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i], k = (now - f.t0) / 800;
      if (k >= 1) { floaters.splice(i, 1); continue; }
      drawText(g, FONT, f.text, Math.round(f.x - f.text.length * FONT.w / 2), Math.round(f.y - k * 14), f.color, { outline: '#000' });
    }
  }

  function act(cmd) {
    if (menus.isOpen() || transitioning || loading || isDead() || screen2d.rotate) return;
    if (cmd === 'attack') { attack(); return; }
    if (cmd === 'cast') { castSpell(); return; }
    if (cmd === 'interact') { session.interact(); return; }
    sceneInput?.cancel();
    // The session moves the player and says what they see; the picture is shown before that is said.
    const result = session.move(cmd, { before: () => show(cmd) });
    if (result.exit) { void session.travel(result.exit); return; }
    if (result.blocked) settleDrag();
  }

  const keymap = {
    KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'strafeLeft', KeyD: 'strafeRight',
    KeyQ: 'left', ArrowLeft: 'left', KeyE: 'right', ArrowRight: 'right',
  };
  sceneInput = createSceneInput(canvas, {
    // A pointer position (client pixels) in the scene's own coordinates, or null when it is not over the scene.
    hit: (clientX, clientY) => {
      const q = screen2d.toLogical(clientX, clientY), v = screen2d.spec.view;
      if (q.x < v.x || q.y < v.y || q.x >= v.x + VIEW_W || q.y >= v.y + VIEW_H) return null;
      return comp.hitAt((q.x - v.x) * W / VIEW_W, (q.y - v.y) * H / VIEW_H);
    },
    getTarget: id => comp.target(id),
    blocked: () => isDead() || transitioning || loading || menus.isOpen() || document.hidden || screen2d.rotate || !!(anim || drag || release),
    attack, interact: target => interactTarget(target, { say, game: api }),
    changed: () => render(next), cancelGesture: () => swipe.cancel(),
    cursor: (shape, title) => { stage.cursor.scene = { shape, title }; stage.cursor.apply(); },
  });
  // A finger dragged across the scene moves the hero; a stick in a rail does the same (ui/hud.js).
  const swipe = createSwipe(canvas, { toLogical: screen2d.toLogical, view: () => screen2d.spec.view, kit, enabled: () => screen2d.name === 'mobile' && !screen2d.rotate,
    onCommand: act, onSwipe });
  window.addEventListener('keydown', (ev) => {
    if (keymap[ev.code]) {
      heldKeys.add(ev.code);
      if (blockedKeys.has(ev.code)) { ev.preventDefault(); return; }
    }
    if (menus.isOpen() && (ev.code === 'Escape' || (ev.code === 'KeyL' && menus.isLogOpen()))) { ev.preventDefault(); menus.close(); return; }
    if (ev.code === 'KeyF' && !ev.repeat && !ev.ctrlKey && !ev.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) { ev.preventDefault(); void menus.menu.fullscreen(); return; }
    if (ev.code === 'KeyJ' && !ev.repeat && !isDead() && !transitioning && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) { ev.preventDefault(); menus.menu.journal(); return; } // the journal, like I for the satchel
    if (ev.code === 'KeyI' && !ev.repeat && !isDead() && !transitioning && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) { ev.preventDefault(); menus.menu.inventory(); return; } // opens, or closes when already open
    if (isDead() || transitioning || loading || menus.isOpen() || /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    if (keymap[ev.code]) { ev.preventDefault(); act(keymap[ev.code]); return; }
    if (ev.code === 'KeyP' && !ev.repeat && !isDead() && !transitioning && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) { ev.preventDefault(); menus.menu.character(); return; } // the character screen
    if ((ev.code === 'KeyH' || ev.code === 'F1') && !ev.repeat && !isDead() && !transitioning && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) { ev.preventDefault(); menus.menu.help(); return; } // help
    if (ev.code === 'KeyC' && !ev.repeat && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) { ev.preventDefault(); act('cast'); return; } // the ready spell
    if (ev.code === 'KeyB' && !ev.repeat && !isDead() && !transitioning && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) && Object.keys(books.spells).length) { ev.preventDefault(); menus.menu.spells(); return; } // the spell book
    if (ev.code === 'KeyX' || ev.code === 'Enter') { ev.preventDefault(); if (!ev.repeat) act('attack'); return; }
    if (/^Digit[1-9]$/.test(ev.code) && +ev.code.slice(5) <= quickBar.size) { ev.preventDefault(); if (!ev.repeat) quickBar.activate(+ev.code.slice(5) - 1); return; } // the quick bar
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) act('interact'); return; }
    if (ev.code === 'KeyL') { ev.preventDefault(); menus.openLog(); return; }
    if (ev.code === 'KeyO') { opts.outlines = !opts.outlines; say(`Slot outlines: ${opts.outlines ? 'on' : 'off'}`); show(); }
  });
  window.addEventListener('keyup', ev => { heldKeys.delete(ev.code); blockedKeys.delete(ev.code); });
  window.addEventListener('blur', () => { heldKeys.clear(); blockedKeys.clear(); sceneInput.cancel(); input.cancel(); swipe.cancel(); });

  function updateStatus() {
    const missing = view.compose(relCell).filter(it => !(it.actor && !it.actor.art) && !comp.imageFor(it));
    status.hidden = !debugMode;
    status.textContent = `${level.name} · (${p.x},${p.z}) facing ${'NESW'[p.dir]} · ${images.size} slot images loaded`
      + (missing.length ? ` · missing here: ${missing.map((m) => `${m.type}/${m.slot.id}`).join(', ')}` : '');
  }

  // The canvas keeps its logical size (320x240 on a desktop, 400x180 on a phone held sideways) and is shown at a whole number of
  // device pixels per pixel (ui/screen.js); a change of layout drops whatever the fingers were doing.
  screen2d.onChange(() => input.cancel());
  screen2d.resize();

  document.title = `${level.shortName ?? level.name} · ${title}`;
  session.begin({ loaded: !!saved }); // instances made so far get their onCreate (a new game's first level), the level its onEnter
  if (!saved && (policy.intervalMs || policy.onHidden || policy.onLevelChange)) save(); // with autosave on, a new game is written at once
  show();
  look();

  function updateMonsters(now) {
    const paused = isDead() || transitioning || loading || menus.isOpen() || document.hidden || screen2d.rotate;
    const { changed, struck } = session.update(now, { paused });
    sound?.update(p, monsters.actors, paused);
    for (const blow of struck) struckBy(blow, now);
    if (changed) {
      // Update moving creatures without interrupting a player's current motion.
      peeks.clear(); peekKey = ''; render(next);
      if (drag) drag.peek = peekFor(drag.cmd);
      if (release) release.peek = peekFor(release.cmd);
    }
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (screen2d.rotate) { updateMonsters(now); return; } // held upright: the overlay says rotate, the game waits
    const layout = screen2d.spec, view = layout.view;
    updateMonsters(now);
    sceneInput.update(now);
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
    // Everything else is drawn straight onto the one canvas, over the scene.
    kit.begin();
    main.imageSmoothingEnabled = false;
    main.fillStyle = THEME.bg; main.fillRect(0, 0, canvas.width, canvas.height);
    main.drawImage(viewCanvas, view.x, view.y, VIEW_W, VIEW_H);
    drawLog(now, view);
    hud.draw(mapAt(now), layout);
    menus.draw(view, now);
    input.drawDrag();
  }
  screen.close(); // the menus before the game give the canvas up to the game
  requestAnimationFrame(loop);
  return { persistence, flags, save, getState: label => persistence.snapshot({ label }), loadState: loadGame };
}
