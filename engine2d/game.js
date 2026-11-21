import { createView } from './view.js';
import { loadImage, loadSlotImages, createCompositor } from './compositor.js';
import { createUI } from '../engine/ui.js';
import { createTouch, viewportSize } from '../engine/touch.js';
import { createMobileHUD } from './mobile-hud.js';
import { createExploration } from './exploration.js';
import { createMonsters, actorDirection } from './monsters.js';
import { createGameOver } from './game-over.js';
import { interact, checkBehavior } from './interaction.js';
import { withIcons, panelOverlay } from './panel-icons.js';
import { loadIcons, savedIconStyle, saveIconStyle } from './icons.js';
import { HEAD_X } from './head.js';
import { createEquipment } from './equipment.js';
import { createCharacter, strike, createCooldown } from './combat.js';
import { createInventory, addToStacks, checkItems } from './inventory.js';
import { resolveContents } from './loot.js';
import { PEEK, RELEASE_MS, motionFor, easeOut, drawTransition } from './transition.js';
import { drawText } from '../engine/bitmapfont.js';
import { font5x8 as FONT } from '../engine/font-5x8.js';

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

// Map a level + tile types to a world cell lookup: { wall } | { entities } | {} | null.
export function cellLookup(level, tileTypes, props) {
  const rows = level.tiles;
  const entitiesAt = new Map();
  for (const e of level.entities) {
    const where = `${e.x},${e.z}`, label = e.name ?? e.prop;
    if (!props[e.prop]) throw new Error(`${label}: unknown prop "${e.prop}"`);
    if (!DIR_KEYS.includes(e.side) || e.side.length !== 1) throw new Error(`${label} at (${where}) needs a side: N, E, S or W`);
    if (tileTypes[rows[e.z]?.[e.x]]?.floor !== true) throw new Error(`${label} at (${where}) is not on a floor tile`);
    checkBehavior(e.behavior ?? props[e.prop].behavior, label);
    const list = entitiesAt.get(where) ?? [];
    if (list.some((o) => o.side === e.side)) throw new Error(`two things on the ${e.side} side of tile (${where})`);
    entitiesAt.set(where, [...list, e]);
  }
  return (x, z) => {
    if (z < 0 || z >= rows.length || x < 0 || x >= rows[0].length) return null;
    const t = tileTypes[rows[z][x]];
    if (!t) return null;
    if (t.wall) return { wall: t.art };
    const entities = entitiesAt.get(`${x},${z}`);
    return entities ? { entities } : {};
  };
}

export async function startGame2d({ level, tileTypes, props, uiLayout, assetPath, uiAssetPath, viewCanvas, uiCanvas, frame, status, levels = null, initialLevel = 'village', itemDefs = {}, startingItems = [], inventorySize = 32, inventoryColumns = 8, iconsPath,
  heroAttributes = { strength: 6, vitality: 6, intellect: 4, agility: 5 }, heroAttackMs = 700 }) {
  // Keep the complete asset list for a fresh reload; the browser's default
  // timing buffer holds only 250 entries, fewer than a full scene's images.
  performance.setResourceTimingBufferSize(4096);
  const definitions = levels ?? { village: { level, tileTypes, props, assetPath } };
  let levelId = Object.hasOwn(definitions, initialLevel) ? initialLevel : 'village';
  const cache = new Map();
  async function prepare(id) {
    if (!Object.hasOwn(definitions, id)) throw new Error(`Unknown level: ${id}`);
    if (!cache.has(id)) {
      const job = (async () => {
        const def = definitions[id], view = createView(def.level.view);
        const wallArts = [...new Set(Object.values(def.tileTypes).filter(t => t.wall).map(t => t.art))];
        const images = await loadSlotImages(view, { assetPath: def.assetPath, wallArts,
          propArts: Object.values(def.props), backdrop: !def.level.atmosphere,
          actorArts: [...new Set((def.level.monsters ?? []).map(actor => actor.art).filter(Boolean))] });
        // Required dungeon art must be complete before replacing the active scene.
        if (def.level.atmosphere && (!images.has('floor') || wallArts.some(art =>
          view.wallSlots.some(slot => !images.has(`walls:${art}:${slot.id}`))))) {
          throw new Error('The dungeon artwork could not be loaded. Please try again.');
        }
        const cell = cellLookup(def.level, def.tileTypes, def.props);
        return { ...def, view, images, cell, comp: createCompositor(view, images),
          exploration: createExploration(def.level, cell), monsters: createMonsters(def.level, cell) };
      })();
      cache.set(id, job);
      job.catch(() => cache.delete(id));
    }
    return cache.get(id);
  }
  let active = await prepare(levelId);
  ({ level, tileTypes, props, assetPath } = active);
  let { view, images, cell, comp, exploration, monsters } = active;
  const { W, H } = view.V;
  const SHOWN = view.V.pixel ?? 1;
  let transitioning = false, dead = false;
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
  const icons = await loadIcons(iconsPath, savedIconStyle());
  const panelImage = withIcons(await loadImage(`${uiAssetPath}/ui/panel.png`), icons);
  // The portrait is the head of the full-body pixel sprite, cropped to its frame and never scaled: one art pixel is one
  // UI pixel. (The painted desktop panel draws its portrait cover-fitted, so it is given a picture that is exactly the
  // window's size.)
  const portraitImage = await loadImage(new URL('./assets/hero-sprite.png', import.meta.url).href);
  const portraitWindow = layout => {
    const k = PW / panelImage.width, [, , w, h] = layout.portrait.map(v => Math.round(v * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(portraitImage, Math.round(HEAD_X - w / 2), 0, w, h, 0, 0, w, h); // the head is at the top, centred on its column
    return c;
  };
  const ui = createUI(uiCanvas, {
    'ui/panel': { image: panelImage },
    'ui/portrait-hero': { image: portraitWindow(uiLayout) },
  }, uiLayout, { width: PW, font: FONT, overlay: panelOverlay(icons) });

  const p = { ...level.start, steps: 0 };
  const opts = { outlines: false };
  const heldKeys = new Set(), blockedKeys = new Set();
  const messages = []; // every message said, kept for the journal's message log

  // Items: the pack, containers (made the first time they are opened, so what is in them is rolled once) and
  // piles of things the player dropped, keyed by level and tile.
  checkItems(itemDefs);
  for (const [id, def] of Object.entries(itemDefs)) if (!icons.has(def.icon)) throw new Error(`item "${id}" has no icon "${def.icon}" in the atlas`);
  const inventory = createInventory(itemDefs, { size: inventorySize, start: startingItems });
  const equipment = createEquipment(itemDefs);
  const hero = createCharacter(heroAttributes, equipment, { attackMs: heroAttackMs });
  const containers = new Map();
  const piles = new Map();
  const pileKey = () => `${levelId}:${p.x},${p.z}`;
  function openContainer(entity, behavior) {
    let box = containers.get(entity);
    if (!box) {
      const stacks = resolveContents(behavior, (list, id, qty) => addToStacks(itemDefs, list, id, qty));
      box = { title: behavior.title ?? entity.name ?? 'Container', text: behavior.text, stacks };
      containers.set(entity, box);
    }
    bars.openContainer(box);
  }
  function openPile() {
    const stacks = piles.get(pileKey());
    if (!stacks?.length) return false;
    bars.openContainer({ title: 'On the floor', text: 'Things lie here where they were dropped.', stacks });
    return true;
  }
  // Potions and the like: def.use is { hp, mp } to restore. One is used up unless it would be wasted.
  function useItem(index) {
    const stack = inventory.slots[index], use = stack && itemDefs[stack.id].use;
    if (!use) return { message: 'Nothing happens.' };
    const hp = Math.min(use.hp ?? 0, hero.maxHp - hero.hp), mp = Math.min(use.mp ?? 0, hero.maxMp - hero.mp);
    if (hp <= 0 && mp <= 0) return { message: use.hp ? 'Your health is already full.' : 'Your mana is already full.' };
    hero.hp += hp; hero.mp += mp; inventory.remove(index, 1);
    const message = `You use ${itemDefs[stack.id].name.toLowerCase()}${hp ? ` and recover ${hp} health` : ''}${mp ? ` and recover ${mp} mana` : ''}.`;
    say(message); drawHud();
    return { message };
  }
  // Drink the first potion in the pack that restores `kind` ('hp' or 'mp'), without opening the satchel.
  function quickUse(kind) {
    const index = inventory.slots.findIndex(stack => stack && itemDefs[stack.id].use?.[kind]);
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
  const world = {
    get name() { return level.shortName ?? level.name; },
    get journal() { return level.journal ?? 'Explore the surrounding streets and passages.'; },
    typeAt: (x, z) => { if (!exploration.isKnown(x, z)) return null; const c = cell(x, z); return c === null ? null : (c.wall ? { wall: true } : { floor: true }); },
    get billboards() { return level.entities.filter(e => e.name && exploration.isKnown(e.x, e.z)).map(entity => ({ entity })); },
  };
  const debugMode = new URLSearchParams(location.search).has('debug');
  document.documentElement.toggleAttribute('data-debug', debugMode);
  const bars = createMobileHUD({ icons, setIconStyle: style => { saveIconStyle(style); location.reload(); }, portrait: portraitImage, world, hero, frame, messages, inventory, equipment, inventoryColumns, itemDefs, say: text => say(text), drop, onUse: useItem, onQuick: quickUse,
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
  const gameOver = createGameOver(frame);
  window.__game2d = { view, images, level, levelId, p, world, monsters, hero, inventory, equipment,
    get phase() { return dead ? 'game-over' : transitioning ? 'loading' : 'playing'; } };
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
      props: (c.entities ?? []).map(e => ({ ...props[e.prop], type: e.prop, anchor: anchorOf(e.side, p.dir), entity: e })),
      actors: monsters.at(x, z).map(actor => ({ ...actor, direction: actorDirection(actor.dir, p.dir) })),
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
    comp.draw(tg, view.compose(relCell), { facing: DIR_KEYS[p.dir], flipFloor: p.steps % 2 === 1, outlines: opts.outlines, atmosphere: level.atmosphere });
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
    if (phase !== 'move' || bars.isOpen() || transitioning || dead) { settleDrag(); return; }
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
    const hud = { world, hero, tileX: mapShown.x, tileZ: mapShown.z, yaw: mapShown.yaw, zoom: MAP_ZOOM };
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
      active = destination; levelId = exit.to;
      ({ level, tileTypes, props, assetPath, view, images, cell, comp, exploration, monsters } = active);
      if (respawn) {
        await Promise.all([...cache.values()].map(job => job.then(context => context.monsters.reset()).catch(() => {})));
        hero.restore();
      } else monsters.reset();
      monsterDue = performance.now() + monsters.graceMs;
      Object.assign(p, spawn, { steps: 0 });
      Object.assign(window.__game2d, { levelId, level, view, images, monsters });
      peeks.clear(); peekKey = '';
      bars.setLevel(level);
      document.title = `${level.shortName ?? level.name} · Ravensmoor`;
      log.length = 0; logKey = '';
      show(); say(`You enter ${level.shortName ?? level.name}.`); look();
      const url = new URL(location.href);
      if (levelId === 'village') url.searchParams.delete('level');
      else url.searchParams.set('level', levelId);
      history.replaceState(null, '', url);
      return true;
    } catch (error) {
      say(error.message);
      return false;
    } finally {
      transitioning = false;
      frame.removeAttribute('aria-busy');
    }
  }

  async function die() {
    if (dead || transitioning) return;
    dead = true; anim = drag = release = null;
    touch.cancel();
    for (const code of heldKeys) blockedKeys.add(code);
    hero.hp = 0; swing.reset(); peeks.clear(); peekKey = ''; show();
    let retry = false;
    while (dead) {
      await gameOver.wait(retry);
      const returned = await travel({ to: 'village', spawn: definitions.village.level.start }, { respawn: true });
      if (returned) {
        dead = false; gameOver.close(); say('You awaken safely in the village.');
        return;
      }
      retry = true;
    }
  }

  // Fighting. The hero swings at the creature on the tile they face (or share), then waits out a cooldown. Hits and
  // misses show as floating text; a creature flashes when hurt and fades when it dies (see monsters.js).
  const swing = createCooldown(hero.attackMs), floaters = [];
  let hurtFlash = 0;
  const float = (text, color, x = cw / 2, y = ch * .42) => floaters.push({ text, color, x, y, t0: performance.now() });
  function attack() {
    const now = performance.now();
    if (!swing.ready(now)) return;
    swing.use(now);
    const [dx, dz] = DIRS[p.dir];
    const target = monsters.adjacent(p).find(a => (a.x === p.x && a.z === p.z) || (a.x === p.x + dx && a.z === p.z + dz));
    if (!target) { say('You swing at the empty air.'); return; }
    const result = strike(hero, target);
    if (!result.hit) { say(`You miss the ${target.name}.`); float('Miss', '#d8d0c0'); }
    else {
      say(`You hit the ${target.name} for ${result.damage}.`); float(`-${result.damage}`, '#ffe08a');
      if (monsters.damage(target, result.damage, now)) say(`The ${target.name} dies.`);
    }
    peeks.clear(); peekKey = ''; render(next);
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
    if (bars.isOpen() || transitioning || dead) return;
    if (cmd === 'attack') { attack(); return; }
    if (cmd === 'interact') { interact(relCell, { say, exit: exitAhead(), openContainer, pile: openPile }); return; }
    const exit = cmd === 'forward' && exitAhead();
    if (exit) { void travel(exit); return; }
    const st = plan(cmd);
    if (!st) {
      const [dx, dz] = DIRS[(p.dir + { forward: 0, strafeRight: 1, back: 2, strafeLeft: 3 }[cmd]) % 4];
      say(monsters.occupied(p.x + dx, p.z + dz) ? 'A creature blocks your way.' : 'You bump into a wall.'); settleDrag(); return;
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
  window.addEventListener('keydown', (ev) => {
    if (keymap[ev.code]) {
      heldKeys.add(ev.code);
      if (blockedKeys.has(ev.code)) { ev.preventDefault(); return; }
    }
    if (bars.isOpen() && (ev.code === 'Escape' || (ev.code === 'KeyL' && bars.isLogOpen()))) { ev.preventDefault(); bars.close(); return; }
    if (ev.code === 'KeyF' && !ev.repeat && !ev.ctrlKey && !ev.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) { ev.preventDefault(); void bars.menu.fullscreen(); return; }
    if (ev.code === 'KeyI' && !ev.repeat && !dead && !transitioning && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) { ev.preventDefault(); bars.menu.inventory(); return; } // opens, or closes when already open
    if (dead || transitioning || bars.isOpen() || /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    if (keymap[ev.code]) { ev.preventDefault(); act(keymap[ev.code]); return; }
    if (ev.code === 'KeyX' || ev.code === 'Enter') { ev.preventDefault(); if (!ev.repeat) act('attack'); return; }
    if (ev.code === 'Digit1') { ev.preventDefault(); if (!ev.repeat) quickUse('hp'); return; }
    if (ev.code === 'Digit2') { ev.preventDefault(); if (!ev.repeat) quickUse('mp'); return; }
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) act('interact'); return; }
    if (ev.code === 'KeyL') { ev.preventDefault(); bars.openLog(); return; }
    if (ev.code === 'KeyO') { opts.outlines = !opts.outlines; say(`Slot outlines: ${opts.outlines ? 'on' : 'off'}`); show(); }
  });
  window.addEventListener('keyup', ev => { heldKeys.delete(ev.code); blockedKeys.delete(ev.code); });
  window.addEventListener('blur', () => { heldKeys.clear(); blockedKeys.clear(); touch.cancel(); });

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

  document.title = `${level.shortName ?? level.name} · Ravensmoor`;
  monsterDue = performance.now() + monsters.graceMs;
  say(`Welcome to ${level.name}.`);
  show();
  look();

  function updateMonsters(now) {
    if (dead || transitioning || bars.isOpen() || document.hidden) {
      monsterDue = now + monsters.stepMs; monsters.freeze(); return;
    }
    let changed = monsters.reap(now).length > 0;
    if (monsters.actors.length && now >= monsterDue) {
      monsterDue = now + monsters.stepMs;
      const version = monsters.version;
      monsters.step(p);
      changed ||= version !== monsters.version;
    }
    if (monsters.actors.length && now >= monsterDue - monsters.stepMs) for (const actor of monsters.engage(p, now)) struckBy(actor, now);
    if (changed) {
      // Update moving creatures without interrupting a player's current motion.
      peeks.clear(); peekKey = ''; render(next);
      if (drag) drag.peek = peekFor(drag.cmd);
      if (release) release.peek = peekFor(release.cmd);
    }
  }

  let wasAnimating = false;
  function loop(now) {
    updateMonsters(now);
    const animating = monsters.animating(now); // a creature flashing or fading: redraw the scene every frame
    if (animating || wasAnimating) { render(next); if (drag) drag.peek = peekFor(drag.cmd); }
    wasAnimating = animating;
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
}
