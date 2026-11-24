import { drawText } from './bitmapfont.js';
import { font5x8 as FONT } from './font-5x8.js';
import { pixelSkin } from './pixel-skin.js';
import { reloadFresh } from '../core/reload.js';
import { takeStack, takeAll } from '../rules/inventory.js';
import { HEAD_X } from './head.js';
import { createQuickHud, dragGesture, SHOWN_SMALL } from './quickbar-hud.js';
import { TIER_NAMES } from './icons.js';
import { renderCharacter } from './character-screen.js';
import { renderHelp } from './help-screen.js';

// Responsive, DOM-based mobile chrome. The scene and desktop HUD stay on canvas.
const STYLE_URL = new URL('./mobile-hud.css', import.meta.url);

// The painted background of the satchel screen (see docs/engine/inventory.md); null draws plain frames instead.
const BAG_BACKGROUND = '../assets/ui/inventory-bg.png';

// icons: the icon atlas (see icons.js); inventory: the player's pack; itemDefs: item id -> definition; say: writes to the message log;
// drop(slot, qty): puts items from the pack on the floor where the player stands; onUse(slot) uses an item
// and returns { message } (or null). saves: the settings panel's save and load (null hides them):
// { max, current(), list() -> [{ slot, savedAt, label }], save(slot) -> bool, load(slot) -> Promise<bool> }.
export function createMobileHUD({ icons, setIconStyle = () => {}, portrait, world, hero, frame, debug, messages = [], inventory, equipment, inventoryColumns = 8, itemDefs = {}, say = () => {}, drop = () => {}, onUse = () => null, saves = null,
  // Wearing goes through these (the session's, so the message says what changes); `wouldChange(itemId)` lists what wearing
  // a pack item would change (session.wouldChange), and `damageTypes` names the damage types.
  onEquip = (index, slot) => equipment.equip(inventory, index, slot), onUnequip = (slot, toIndex) => equipment.unequip(inventory, slot, toIndex),
  wouldChange = () => null, damageTypes = {},
  // Put a skill point (from levelling up) into an attribute: session.spend, which returns { ok }.
  onSpend = attribute => ({ ok: hero.spend?.(attribute) ?? false }),
  // Magic (null when the game has no spells): { spells() -> [{ id, name, icon, cost, magicType, ready, description }], cast(id), setReady(id),
  // ready() -> id, effects() -> [{ id, name, tier, left, harmful, magicType }] }.
  magic = null,
  // The quick bar (null: none): { size, view(), set(i, ref), clear(i), swap(a, b), activate(i), describe(i), canvasSlotAt(x, y), setHot(i) }
  // (see ui/quickbar-hud.js). `canvasSlotAt` and `setHot` are for the desktop panel, which draws its own slots.
  quick = null,
  // The game's own sections of the help screen: [{ title, text }] (ui/help-screen.js).
  help = [] }) {
  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet'; sheet.href = STYLE_URL.href;
  const styleReady = new Promise((resolve, reject) => {
    sheet.onload = resolve;
    sheet.onerror = () => reject(new Error('Could not load the mobile HUD stylesheet.'));
  });
  document.head.append(sheet);
  document.documentElement.classList.add('rpg-ui');
  const root = document.createElement('section'); root.className = 'rpg-hud';
  root.setAttribute('aria-label', 'Adventurer dashboard');
  const left = document.createElement('aside'); left.className = 'rpg-rail rpg-left';
  const right = document.createElement('aside'); right.className = 'rpg-rail rpg-right';
  root.append(left, right); document.body.append(root);
  const ready = Promise.all([styleReady, pixelSkin(root)]);
  const title = document.createElement('div'); title.className = 'rpg-location';
  title.textContent = ''; frame.append(title);
  const notice = document.createElement('div'); notice.className = 'rpg-notice';
  notice.setAttribute('role', 'status'); frame.append(notice);
  let noticeTimer;
  // One pixel size for the whole UI: `px` screen pixels per UI pixel (the same --rpg-px the CSS reads).
  // Art canvases (icons, portrait) are drawn at size / px logical pixels and shown at exactly that many
  // times px, so their pixels are always px screen pixels wide, never a fraction. `size` is the on-screen
  // size to aim for, in CSS pixels (a number, or a function when the layout changes it).
  let px = 2, art = [];
  function renderArt(entry) {
    const { canvas, size, draw } = entry;
    if (entry.tall) { // 48 x 96 art at a whole number of screen pixels per art pixel: `size()` returns that number
      const k = size();
      canvas.width = 48; canvas.height = 96; canvas.style.width = `${48 * k}px`; canvas.style.height = `${96 * k}px`;
      canvas.parentElement.style.height = `${96 * k}px`; draw(canvas.getContext('2d'), 96); return;
    }
    const n = Math.max(8, Math.round((typeof size === 'function' ? size() : size) / px));
    canvas.height = n; canvas.width = entry.tall ? n / 2 : n; // a tall one is twice as high as it is wide
    canvas.style.width = `${canvas.width * px}px`; canvas.style.height = `${n * px}px`;
    const g = canvas.getContext('2d'); g.imageSmoothingQuality = 'high';
    draw(g, n);
  }
  function addArt(canvas, size, draw, tall = false) { const entry = { canvas, size, draw, tall }; art.push(entry); renderArt(entry); }
  const character = document.createElement('div'); character.className = 'rpg-character';
  const heroTitle = document.createElement('h2'); heroTitle.className = 'rpg-rail-title'; heroTitle.textContent = 'Adventurer'; left.append(heroTitle);
  const face = document.createElement('canvas'); face.className = 'rpg-portrait';
  face.setAttribute('role', 'img'); face.setAttribute('aria-label', 'Your adventurer');
  const shortScreen = () => matchMedia('(max-height: 380px) and (orientation: landscape), (max-height: 680px) and (orientation: portrait)').matches;
  // The portrait is the top of the 48 x 96 hero sprite, cropped to the frame (never scaled): one art pixel is one UI pixel.
  const faceTarget = () => (document.documentElement.dataset.layout === 'portrait' ? (shortScreen() ? 48 : 88) : (shortScreen() ? 56 : 80));
  addArt(face, faceTarget, (g, n) => { g.imageSmoothingEnabled = false; g.fillStyle = '#0d0b10'; g.fillRect(0, 0, n, n); g.drawImage(portrait, Math.round(HEAD_X - n / 2), 0, n, n, 0, 0, n, n); });
  character.append(face);
  face.tabIndex = 0; face.setAttribute('role', 'button'); face.setAttribute('aria-label', 'Your adventurer: open the character screen'); face.title = 'Character';
  face.style.cursor = 'pointer';
  face.addEventListener('click', () => toggle('character', openCharacter)());
  face.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle('character', openCharacter)(); } });
  const vitals = document.createElement('div'); vitals.className = 'rpg-vitals';
  const vitalNodes = [];
  for (const [label, value, max] of [['HP', hero.hp, hero.maxHp], ['MP', hero.mp, hero.maxMp], ...(hero.progress ? [['XP', hero.progress.xp - hero.progress.from, 1]] : [])]) {
    const row = document.createElement('div'); row.className = `rpg-vital ${label.toLowerCase()}`;
    const caption = document.createElement('span'); caption.textContent = label;
    const meter = document.createElement('meter'); meter.min = 0; meter.max = max; meter.value = value;
    meter.setAttribute('aria-label', label === 'HP' ? 'Health' : label === 'MP' ? 'Mana' : 'Experience');
    const number = document.createElement('b'); number.textContent = `${value}/${max}`;
    vitalNodes.push({ key: label.toLowerCase(), meter, number });
    row.append(caption, meter, number); vitals.append(row);
  }
  character.append(vitals); left.append(character);
  const effectsRow = document.createElement('ul'); effectsRow.className = 'rpg-effects'; effectsRow.setAttribute('aria-label', 'Status effects'); character.append(effectsRow);

  // One panel for every menu and for the message log. It covers the scene (the view canvas) and nothing
  // else, so the rails and controls stay in view. `shown` is 'log' while it holds the message log.
  const menuPanel = document.createElement('section'); menuPanel.className = 'rpg-panel'; menuPanel.hidden = true;
  menuPanel.setAttribute('role', 'dialog');
  const header = document.createElement('header');
  const heading = document.createElement('h2'); heading.id = 'rpg-dialog-title';
  menuPanel.setAttribute('aria-labelledby', heading.id);
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close';
  const body = document.createElement('div'); body.className = 'rpg-dialog-body';
  const footer = document.createElement('footer');
  header.append(heading); footer.append(close); menuPanel.append(header, body, footer); frame.append(menuPanel);
  let shown = null;
  function closePanel() { menuPanel.hidden = true; shown = null; }
  close.addEventListener('click', closePanel);
  function open(title, text, kind = null) {
    heading.textContent = title; body.replaceChildren(); shown = kind; menuPanel.classList.toggle('rpg-bag-panel', kind === 'inventory');
    if (text) { const p = document.createElement('p'); p.textContent = text; body.append(p); }
    menuPanel.hidden = false; body.scrollTop = 0; close.focus({ preventScroll: true });
  }
  function iconButton(label, iconId, target, handler, size = 48) {
    const button = document.createElement('button'); button.type = 'button';
    button.title = label; button.setAttribute('aria-label', label);
    const c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
    const native = icons.native(iconId); // a pixel-art icon is shown at its own size, so every pixel stays whole
    addArt(c, native ? () => native * px : size, (g, n) => icons.draw(g, iconId, 0, 0, n, n));
    button.append(c); button.addEventListener('click', handler); target.append(button);
    return button;
  }
  const slots = document.createElement('div'); slots.className = 'rpg-slots';
  slots.setAttribute('aria-label', 'Quick bar');
  function caption(button, text) {
    const label = document.createElement('span'); label.className = 'rpg-icon-label'; label.textContent = text; button.append(label);
  }
  if (quick) left.append(slots);
  const mapTitle = document.createElement('h2'); mapTitle.className = 'rpg-rail-title'; mapTitle.textContent = ''; right.append(mapTitle);
  const map = document.createElement('canvas'); map.className = 'rpg-map';
  let lastState = null; // the minimap is redrawn from it whenever its resolution changes
  addArt(map, () => (shortScreen() ? (document.documentElement.dataset.layout === 'portrait' ? 72 : 88) : 112), () => {});
  map.setAttribute('role', 'img'); map.setAttribute('aria-label', 'Map');
  right.append(map);
  const menus = document.createElement('div'); menus.className = 'rpg-menus'; right.append(menus);
  // An item's picture, from the icon atlas, drawn through the art registry.
  // The outline an enchanted item's icon wears: the colour of its kind of magic, as strong as its tier.
  const outlineOf = def => (def?.enchant ? { colour: damageTypes[def.enchant.type]?.colour ?? '#ffffff', tier: def.enchant.tier ?? 1 } : null);
  function itemIconCanvas(iconId, size, outline = null) {
    const c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
    // A pixel-art icon is shown at a whole multiple of its own size (the largest that fits), so every pixel stays whole.
    const native = icons.native(iconId);
    const fitted = () => { const wanted = typeof size === 'function' ? size() : size, unit = native * px; return unit * Math.max(1, Math.floor(wanted / unit)); };
    addArt(c, native ? fitted : size, (g, n) => icons.draw(g, iconId, 0, 0, n, n, outline));
    return c;
  }
  const itemIcon = (id, size) => itemIconCanvas(itemDefs[id].icon, size, outlineOf(itemDefs[id]));
  // The quick bar's buttons (on a phone; the desktop panel draws its own, in game.js).
  const quickHud = quick ? createQuickHud({ quick, container: slots, iconCanvas: itemIconCanvas, say, colourOf: type => damageTypes[type]?.colour ?? '#ffffff' }) : null;
  const stackLabel = ({ id, qty }) => `${itemDefs[id].name}${qty > 1 ? ` x${qty}` : ''}`;
  const paragraph = (text, className = '') => { const p = document.createElement('p'); p.className = className; p.textContent = text; return p; };
  const textButton = (label, handler) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', handler); return b; };
  if (BAG_BACKGROUND) { document.documentElement.style.setProperty('--rpg-bag-bg', `url(${new URL(BAG_BACKGROUND, import.meta.url).href})`); document.documentElement.dataset.bagArt = ''; }

  // What an item does in a fight, in one line: "Blunt 10–14, a blow every 0.85 s." / "Defence 2, blade damage ×0.8."
  // A weapon's damage is what the hero would deal with it, strength included.
  const typeName = t => damageTypes[t]?.name ?? t;
  function itemStats(def) {
    const parts = [];
    if (def.enchant) parts.push(`${typeName(def.enchant.type)} enchantment, ${TIER_NAMES[def.enchant.tier] ?? ''} (tier ${def.enchant.tier})`);
    if (def.elemental) parts.push(`+${def.elemental.damage[0]}–${def.elemental.damage[1]} ${typeName(def.elemental.type)} damage`);
    if (def.onHit) parts.push(`${Math.round((def.onHit.chance ?? 1) * 100)}% ${(magic?.effectName?.(def.onHit.effect) ?? def.onHit.effect).toLowerCase()} on hit`);
    if (Array.isArray(def.damage)) {
      const [lo, hi] = hero.statsWith ? hero.statsWith({ ...equipment.gear(), weapon: def }).damage : def.damage, type = def.damageType ? typeName(def.damageType) : 'damage';
      parts.push(`${type[0].toUpperCase()}${type.slice(1)} ${lo}–${hi}`, `a blow every ${+(def.speed / 1000).toFixed(2)} s`);
    }
    if (def.defence) parts.push(`Defence ${def.defence}`);
    for (const [k, v] of Object.entries(def.resist ?? {})) parts.push(`${typeName(k)} damage ×${v}`);
    for (const [k, v] of Object.entries(def.bonus ?? {})) parts.push(`${v > 0 ? '+' : ''}${v} ${k}`);
    return parts.length ? `${parts.join(', ')}.` : '';
  }

  // An empty equipment slot shows a faint picture of what goes in it.
  function ghostIcon(iconId, size) {
    const c = itemIconCanvas(iconId, size); c.classList.add('ghost'); return c;
  }
  // The hero's full figure: true 48 x 96 pixel art (engine/assets/ui/hero-sprite.png, painted by Codex from the
  // portrait; see docs/engine/inventory.md), shown at the largest whole number of screen pixels per art pixel that fits the panel.
  // It never shows equipment: the slots lie over it, at the places on the body where each item is worn.
  const sprite = new Image(); sprite.src = new URL('../assets/ui/hero-sprite.png', import.meta.url).href;
  sprite.onload = () => art.forEach(renderArt);
  // Two even columns down the figure's sides, boots between them at the feet: percent of the niche's width and the figure's height.
  const SLOT_SPOTS = { head: [17, 12], amulet: [17, 34], weapon: [17, 56], ring1: [17, 78],
    armour: [83, 12], gloves: [83, 34], shield: [83, 56], ring2: [83, 78], boots: [50, 108] };

  // The satchel. On the left the hero's full figure with the equipment slots beneath it, on the right the pack
  // as a grid you rearrange by dragging, underneath whatever is selected and what can be done with it.
  // `selected` is a pack slot, or `selectedGear` a worn slot's id; never both.
  let selected = null, selectedGear = null;
  const make = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text) e.textContent = text; return e; };
  // The satchel's line about the hero: the level, and the way to the character screen (where skill points are spent).
  function characterSheet() {
    const { level, xp, to } = hero.progress, nodes = [];
    nodes.push(make('p', 'rpg-stats', `Level ${level} · ${to === null ? `${xp} xp (highest level)` : `${xp} / ${to} xp`}`));
    if (hero.unspent) nodes.push(make('p', 'rpg-note', `${hero.unspent} skill point${hero.unspent === 1 ? '' : 's'} to spend.`));
    nodes.push(textButton('Character', () => openCharacter()));
    return nodes;
  }
  function openInventory(note = '') {
    open('Your satchel', null, 'inventory');
    if (selected !== null && !inventory.slots[selected]) selected = null;
    if (selectedGear !== null && !equipment.worn[selectedGear]) selectedGear = null;
    const bag = make('div', 'rpg-bag'), niche = make('div', 'rpg-niche'), slab = make('div', 'rpg-slab'), grid = make('div', 'rpg-grid'), detail = make('div', 'rpg-detail');
    grid.style.setProperty('--cols', inventoryColumns); grid.style.setProperty('--rows', Math.ceil(inventory.size / inventoryColumns));
    inventory.slots.forEach((stack, i) => {
      const cell = make(stack ? 'button' : 'div', 'rpg-cell' + (i === selected ? ' selected' : ''));
      cell.dataset.slot = i;
      if (stack) {
        cell.type = 'button'; cell.title = itemDefs[stack.id].name; cell.setAttribute('aria-label', stackLabel(stack));
        if (stack.qty > 1) cell.append(make('b', '', stack.qty));
      }
      grid.append(cell);
    });
    slab.append(grid); bag.append(niche, slab, detail); body.append(bag); // in the page now, so the art below can measure its cells
    const figure = make('div', 'rpg-figure'), face = make('canvas', 'rpg-hero');
    face.setAttribute('role', 'img'); face.setAttribute('aria-label', 'Your adventurer');
    const gear = make('div', 'rpg-gear');
    for (const slot of equipment.slots) {
      const id = equipment.worn[slot.id];
      const cell = make(id ? 'button' : 'div', 'rpg-cell rpg-gearcell' + (slot.id === selectedGear ? ' selected' : ''));
      cell.dataset.equip = slot.id; cell.title = id ? `${slot.label}: ${itemDefs[id].name}` : slot.label;
      cell.setAttribute('aria-label', cell.title);
      [cell.style.left, cell.style.top] = SLOT_SPOTS[slot.id]?.map(v => `${v}%`) ?? ['50%', '50%'];
      if (id) cell.type = 'button';
      gear.append(cell);
    }
    figure.append(face, gear); niche.append(figure);
    addArt(face, () => px, g => { if (sprite.complete && sprite.naturalWidth) g.drawImage(sprite, 0, 0); }, true);
    for (const cell of gear.children) {
      const slot = equipment.slots.find(s => s.id === cell.dataset.equip), id = equipment.worn[slot.id];
      const icon = id ? itemIcon(id, () => cell.clientWidth * 0.95) : ghostIcon(slot.ghost, () => cell.clientWidth * 0.95);
      cell.prepend(icon);
    }
    for (const cell of grid.children) {
      const stack = inventory.slots[cell.dataset.slot];
      if (!stack) continue;
      const icon = itemIcon(stack.id, () => cell.clientWidth * 0.95); // the atlas tiles carry a little padding of their own
      cell.prepend(icon);
    }
    dragToRearrange(bag);

    const stack = selected === null ? null : inventory.slots[selected], worn = selectedGear === null ? null : equipment.worn[selectedGear];
    const def = stack ? itemDefs[stack.id] : worn ? itemDefs[worn] : null;
    const text = make('div', 'rpg-detail-text');
    if (!def) {
      text.append(make('h3', '', 'Nothing selected'), make('p', '', 'Select an item to read about it. Drag items to rearrange them, onto the figure to wear them, or onto the quick bar.'),
        make('p', '', `Damage ${hero.damage[0]}–${hero.damage[1]}${hero.damageType ? ` ${typeName(hero.damageType)}` : ''}, defence ${hero.defence}.`));
      if (hero.progress) text.append(...characterSheet());
    } else {
      // The numbers first: the flavour text may need scrolling, they should not.
      text.append(make('h3', '', `${def.name}${stack?.qty > 1 ? ` x${stack.qty}` : ''}`));
      const stats = itemStats(def);
      if (stats) text.append(make('p', 'rpg-stats', stats));
      const changes = stack ? wouldChange(stack.id) : null;
      if (changes) text.append(make('p', 'rpg-stats', changes.length ? `If worn: ${changes.join(', ')}.` : 'If worn: no change.'));
      text.append(make('p', '', def.description));
    }
    if (note) text.append(make('p', 'rpg-note', note));
    detail.append(text);
    // A button to put the item on the quick bar (or take it off): only for what is used or worn.
    const quickButton = () => {
      if (!quickHud || !def || !(def.use || def.slot)) return null;
      const ref = { kind: 'item', id: stack?.id ?? worn };
      return textButton(quickHud.has(ref) ? 'Off quick bar' : 'Quick bar', () => { const line = quickHud.toggle(ref, def.name); say(line); openInventory(line); });
    };
    if (worn) {
      const actions = make('div', 'rpg-actions');
      actions.append(textButton('Take off', () => { const r = onUnequip(selectedGear); if (r.ok) { selectedGear = null; say(r.message); } openInventory(r.message); }));
      const qb = quickButton(); if (qb) actions.append(qb);
      detail.append(actions);
    } else if (stack) {
      const actions = make('div', 'rpg-actions');
      if (def.slot) actions.append(textButton('Equip', () => {
        const r = onEquip(selected); if (r.ok) { selected = null; say(r.message); } openInventory(r.message);
      }));
      const use = textButton('Use', () => { const result = onUse(selected); openInventory(result?.message ?? ''); });
      use.disabled = !def.use;
      const dropIt = qty => { const name = stackLabel({ id: stack.id, qty }); drop(selected, qty); say(`You drop ${name}.`); openInventory(`You drop ${name}.`); };
      if (def.use || !def.slot) actions.append(use);
      actions.append(textButton(stack.qty > 1 ? 'Drop one' : 'Drop', () => dropIt(1)));
      if (stack.qty > 1) actions.append(textButton('Drop all', () => dropIt(stack.qty)));
      const qb = quickButton(); if (qb) actions.append(qb);
      detail.append(actions);
    }
  }

  // Select by tapping; rearrange by dragging a stack onto another slot (an empty one moves it, the same item
  // merges, anything else swaps). A pack item dropped on a matching equipment slot is worn; a worn item dropped
  // on a pack slot is taken off into it. A drag shows the icon under the pointer and lights the slot it would land on.
  function dragToRearrange(bag) {
    const SEL = '.rpg-cell[data-slot], .rpg-cell[data-equip]';
    const cellAt = (x, y) => document.elementFromPoint(x, y)?.closest(SEL);
    const held = cell => cell.dataset.equip ? equipment.worn[cell.dataset.equip] : inventory.slots[cell.dataset.slot];
    let drag = null, ignoreClick = false;
    bag.addEventListener('pointerdown', e => {
      const cell = e.target.closest(SEL);
      if (!cell || e.button > 0 || !held(cell)) return;
      drag = { cell, id: e.pointerId, x: e.clientX, y: e.clientY, ghost: null, over: null };
      cell.setPointerCapture?.(e.pointerId);
    });
    bag.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.ghost) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
        const source = drag.cell.querySelector('canvas'), ghost = make('canvas', 'rpg-ghost');
        ghost.width = source.width; ghost.height = source.height; ghost.style.width = source.style.width; ghost.style.height = source.style.height;
        ghost.getContext('2d').drawImage(source, 0, 0);
        document.body.append(ghost); drag.ghost = ghost; drag.cell.classList.add('dragging');
      }
      drag.ghost.style.transform = `translate(${e.clientX - drag.ghost.clientWidth / 2}px, ${e.clientY - drag.ghost.clientHeight / 2}px)`;
      const over = cellAt(e.clientX, e.clientY);
      if (over !== drag.over) { drag.over?.classList.remove('drop-target'); over?.classList.add('drop-target'); drag.over = over; }
      quickHud?.hover(quickHud.slotAt(e.clientX, e.clientY)); // the quick bar takes items that can be used or worn
    });
    const finish = (e, cancelled) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { cell, ghost } = drag; drag = null;
      if (!ghost) return; // a tap: the click handler selects
      ghost.remove(); ignoreClick = true;
      const target = cancelled ? null : cellAt(e.clientX, e.clientY);
      let note = '';
      const quickSlot = cancelled || !quickHud ? null : quickHud.slotAt(e.clientX, e.clientY);
      quickHud?.hover(null);
      if (quickSlot !== null) { // dropped on a quick slot: it stands for the item; nothing moves
        const id = held(cell)?.id ?? held(cell), name = itemDefs[id]?.name ?? 'That';
        note = quick.set(quickSlot, { kind: 'item', id }) ? `${name} is on the quick bar, slot ${quickSlot + 1}.` : `${name} cannot go on the quick bar.`;
        say(note);
      } else if (target && target !== cell) {
        if (cell.dataset.slot && target.dataset.slot) { if (inventory.move(+cell.dataset.slot, +target.dataset.slot)) { selected = +target.dataset.slot; selectedGear = null; } }
        else if (cell.dataset.slot) { // pack -> equipment slot
          const r = onEquip(+cell.dataset.slot, target.dataset.equip);
          note = r.message; if (r.ok) { selected = null; selectedGear = target.dataset.equip; say(r.message); }
        } else if (target.dataset.slot) { // equipment slot -> pack
          const r = onUnequip(cell.dataset.equip, +target.dataset.slot);
          note = r.message; if (r.ok) { selectedGear = null; selected = inventory.slots[+target.dataset.slot] ? +target.dataset.slot : null; say(r.message); }
        }
      }
      openInventory(note);
    };
    bag.addEventListener('pointerup', e => finish(e, false));
    bag.addEventListener('pointercancel', e => finish(e, true));
    bag.addEventListener('click', e => {
      if (ignoreClick) { ignoreClick = false; return; }
      const cell = e.target.closest(SEL);
      if (!cell) return;
      if (cell.dataset.equip) { selectedGear = equipment.worn[cell.dataset.equip] ? cell.dataset.equip : null; selected = null; }
      else { selected = inventory.slots[cell.dataset.slot] ? +cell.dataset.slot : null; selectedGear = null; }
      openInventory();
    });
  }

  // A chest, a hidden stash or a pile on the floor: stacks to take one at a time, or all at once.
  // box is { title, text, stacks }; taking removes from box.stacks.
  function openContainer(box, note) {
    open(box.title, box.text, 'container');
    if (note) body.append(paragraph(note, 'rpg-note'));
    if (!box.stacks.length) { body.append(paragraph('Nothing left.')); return; }
    const list = document.createElement('div'); list.className = 'rpg-loot';
    box.stacks.forEach((stack, i) => {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'rpg-row';
      const name = document.createElement('span'); name.textContent = stackLabel(stack);
      const take = document.createElement('span'); take.className = 'rpg-take'; take.textContent = 'Take';
      row.append(itemIcon(stack.id, 48), name, take);
      row.addEventListener('click', () => {
        const n = takeStack(inventory, box.stacks, i), label = stackLabel({ id: stack.id, qty: n });
        const note = !n ? 'Your pack is full.' : `You take ${label}.${box.stacks.includes(stack) ? ' Your pack is full.' : ''}`;
        say(note); openContainer(box, note);
      });
      list.append(row);
    });
    body.append(list, textButton('Take all', () => {
      const taken = takeAll(inventory, box.stacks);
      const note = !taken.length ? 'Your pack is full.' : `You take ${taken.map(stackLabel).join(', ')}.${box.stacks.length ? ' Your pack is full.' : ''}`;
      say(note); openContainer(box, note);
    }));
  }
  // A menu button opens its panel, or closes it when that panel is already showing.
  const toggle = (kind, openIt) => () => { if (shown === kind) closePanel(); else openIt(); };
  iconButton('Inventory', 'bag', menus, toggle('inventory', openInventory));
  // The messages the game has said, newest first.
  function openLog() {
    open('Message log', null, 'log');
    const list = document.createElement('ol'); list.className = 'rpg-log'; list.setAttribute('aria-label', 'Recent messages');
    for (const text of messages.slice(-40).reverse()) { const li = document.createElement('li'); li.textContent = text; list.append(li); }
    if (!list.children.length) { const li = document.createElement('li'); li.textContent = 'Nothing yet.'; list.append(li); }
    body.append(list);
  }
  function openJournal() {
    open('Field journal', world.journal, 'journal');
    const more = document.createElement('button'); more.type = 'button'; more.textContent = 'Message log';
    more.addEventListener('click', openLog); body.append(more);
  }
  iconButton('Journal', 'journal', menus, toggle('journal', openJournal));
  // The spells the hero knows: what each does, and a button to cast it or make it the ready one (the C key casts that).
  function openSpells(note = '') {
    open('Spells', null, 'spells');
    const list = make('ul', 'rpg-spells'), known = magic.spells();
    if (!known.length) body.append(make('p', '', 'You know no spells yet. Scrolls and books teach them: use one from the satchel.'));
    for (const spell of known) {
      const li = make('li', 'rpg-spell' + (spell.id === magic.ready() ? ' ready' : ''));
      const colour = damageTypes[spell.magicType]?.colour ?? '#ffffff';
      li.style.setProperty('--magic', colour);
      const icon = itemIconCanvas(spell.icon ?? 'spell', 40, { colour, tier: 2 });
      const text = make('div', 'rpg-spell-text');
      text.append(make('b', '', spell.name), make('span', 'rpg-stats', spell.description), make('span', '', spell.text ?? ''));
      const actions = make('div', 'rpg-actions');
      const castIt = textButton('Cast', () => { const r = magic.cast(spell.id); openSpells(r?.ok ? '' : r?.reason === 'mana' ? 'Not enough mana.' : r?.reason === 'cooldown' ? 'Not ready yet.' : r?.reason === 'no-target' ? 'Nothing to strike in that direction.' : ''); });
      castIt.disabled = hero.mp < spell.cost || !spell.ready;
      const readyIt = textButton(spell.id === magic.ready() ? 'Ready' : 'Make ready', () => { magic.setReady(spell.id); openSpells(); });
      readyIt.disabled = spell.id === magic.ready();
      actions.append(castIt, readyIt);
      if (quickHud) {
        const ref = { kind: 'spell', id: spell.id };
        actions.append(textButton(quickHud.has(ref) ? 'Off quick bar' : 'Quick bar', () => { const line = quickHud.toggle(ref, spell.name); say(line); openSpells(line); }));
        // The picture can be dragged onto a quick slot.
        icon.style.touchAction = 'none'; icon.style.cursor = 'grab';
        icon.addEventListener('pointerdown', e => {
          if (e.button > 0) return;
          dragGesture(e, {
            makeGhost: () => quickHud.ghostFor({ kind: 'spell', icon: spell.icon ?? 'spell', magicType: spell.magicType }),
            over: quickHud.slotAt, onHover: now => quickHud.hover(now),
            onDrop: slot => { if (slot === null) return; const line = quick.set(slot, ref) ? `${spell.name} is on the quick bar, slot ${slot + 1}.` : `${spell.name} cannot go on the quick bar.`; say(line); openSpells(line); },
          });
        });
      }
      li.append(icon, text, actions); list.append(li);
    }
    body.append(list);
    if (note) body.append(make('p', 'rpg-note', note));
  }
  if (magic?.available) iconButton('Spells', 'spell', menus, toggle('spells', openSpells));
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { open('Full screen', 'Full screen is not available in this browser.'); }
  }
  iconButton('Full screen', 'fullscreen', menus, toggleFullscreen);
  // The character screen (ui/character-screen.js): the figure, the attributes and where skill points are spent.
  function openCharacter(note = '') {
    open(hero.name, null, 'character');
    renderCharacter(body, { hero, damageTypes, onSpend, note });
  }
  function openHelp() {
    open('Help', null, 'help');
    renderHelp(body, { magic: !!magic?.available, extra: help });
    body.append(textButton('Back to settings', openSettings));
  }
  function openSettings() {
    open('Settings', null, 'settings');
    const row = document.createElement('div'); row.className = 'rpg-settings-row';
    if (saves) row.append(textButton('Save', () => openSaves('save')), textButton('Load', () => openSaves('load')));
    row.append(textButton('Help', openHelp));
    body.append(row);
    const reload = document.createElement('button'); reload.type = 'button';
    reload.className = 'rpg-reload'; reload.textContent = 'Reload without cache';
    reload.addEventListener('click', async () => {
      reload.disabled = true; reload.textContent = 'Refreshing game files...';
      await reloadFresh();
    });
    body.append(reload);
    const label = document.createElement('label'); label.className = 'rpg-debug';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = debug.get();
    checkbox.addEventListener('change', () => debug.set(checkbox.checked));
    label.append(checkbox, 'Developer: show slot outlines'); body.append(label);
    // Icon style: 16x16 pixel art, or the detailed painted set. The panel and every icon are drawn once at startup, so
    // switching saves the choice and reloads (the game returns to where the page URL says: the same level, its entrance).
    const detailed = icons.style === 'detailed';
    body.append(textButton(`Icons: ${detailed ? 'detailed' : 'pixel 16x16'} (tap to switch)`, () => setIconStyle(detailed ? 'pixel' : 'detailed')));
  }
  // The save screen and the load screen (from Settings): one row per slot. Saving over a slot takes two presses; loading
  // returns to that save and closes the screen.
  function openSaves(mode, note = '') {
    const saving = mode === 'save';
    open(saving ? 'Save game' : 'Load game', null, mode);
    if (note) body.append(paragraph(note, 'rpg-note'));
    const list = document.createElement('div'); list.className = 'rpg-saves';
    const existing = new Map(saves.list().map(s => [s.slot, s]));
    let any = false;
    for (let n = 1; n <= saves.max; n++) {
      const id = `slot-${n}`, entry = existing.get(id);
      if (!saving && !entry) continue; // nothing to load from an empty slot
      any = true;
      const row = document.createElement('div'); row.className = 'rpg-save-row';
      const name = document.createElement('span');
      name.textContent = entry ? `${n}. ${entry.label}  ${new Date(entry.savedAt).toLocaleString()}` : `${n}. Empty`;
      const act = saving
        ? textButton('Save', () => {
          if (entry && act.textContent === 'Save') { act.textContent = 'Overwrite?'; setTimeout(() => { act.textContent = 'Save'; }, 3000); return; }
          const ok = saves.save(id), text = ok ? 'Game saved.' : 'Your progress could not be saved.';
          say(text); openSaves('save', text);
        })
        : textButton('Load', async () => {
          act.disabled = true; act.textContent = 'Loading...';
          closePanel();
          if (await saves.load(id)) say('Game loaded.');
        });
      if (id === saves.current()) row.classList.add('current');
      row.append(name, act); list.append(row);
    }
    if (!any) body.append(paragraph('There are no saved games yet. Use Save to make one.'));
    body.append(list, textButton('Back to settings', openSettings));
  }
  iconButton('Help', 'search', menus, toggle('help', openHelp));
  iconButton('Settings and controls', 'settings', menus, toggle('settings', openSettings));
  for (const button of menus.children) caption(button, button.title === 'Settings and controls' ? 'Settings' : button.title === 'Inventory' ? 'Bag' : button.title === 'Full screen' ? 'Screen' : button.title);
  const controls = document.createElement('div'); controls.className = 'rpg-controls'; root.append(controls);

  function draw(state) {
    for (const { key, meter, number } of vitalNodes) {
      if (key === 'xp') { // level and the way to the next
        const { level, xp, from, to } = hero.progress;
        meter.max = to === null ? 1 : to - from; meter.value = to === null ? 1 : xp - from;
        number.textContent = `Lv ${level}${hero.unspent > 0 ? ` +${hero.unspent}` : ''}`;
        continue;
      }
      meter.value = hero[key]; number.textContent = `${hero[key]}/${meter.max}`;
    }
    if (magic) { // status effects on the hero, with the time they have left
      const shown = magic.effects(), key = shown.map(e => `${e.id}${e.tier}${Math.ceil(e.left / 1000)}`).join();
      if (effectsRow.dataset.key !== key) {
        effectsRow.dataset.key = key; effectsRow.replaceChildren();
        for (const e of shown) {
          const li = make('li', e.harmful ? 'bad' : 'good', `${e.name} ${Math.ceil(e.left / 1000)}s`);
          li.style.setProperty('--magic', damageTypes[e.magicType]?.colour ?? '#ffffff'); li.title = `${e.name}, tier ${e.tier}`; effectsRow.append(li);
        }
      }
    }
    lastState = state;
    quickHud?.refresh();
    // The minimap's resolution follows its on-screen size (see addArt): 56 logical pixels when large.
    const n = map.width, g = map.getContext('2d'); g.fillStyle = '#100e10'; g.fillRect(0, 0, n, n);
    // Zoomed in: about 6 cells across. tileX/tileZ may be fractional while the map slides to a new position.
    const cell = Math.max(4, Math.floor(n / 6.5)), tile = cell - 1, cx = n / 2, cy = n / 2, ux = Math.round(state.tileX), uz = Math.round(state.tileZ);
    for (let tz = uz - 4; tz <= uz + 4; tz++) for (let tx = ux - 4; tx <= ux + 4; tx++) {
      const t = world.typeAt(tx, tz); if (!t) continue;
      g.fillStyle = t.wall ? '#3b3335' : '#95816a';
      g.fillRect(Math.round(cx + (tx - state.tileX) * cell - tile / 2), Math.round(cy + (tz - state.tileZ) * cell - tile / 2), tile, tile);
    }
    const dot = Math.max(2, cell >> 1);
    for (const b of world.billboards) {
      g.fillStyle = '#e9b65e';
      const o = Math.round((tile - dot) / 2); // centred on the tile as drawn above
      g.fillRect(Math.round(cx + (b.entity.x - state.tileX) * cell - tile / 2) + o, Math.round(cy + (b.entity.z - state.tileZ) * cell - tile / 2) + o, dot, dot);
    }
    // The player: an arrow built from integer rectangles so it is as crisp as the cells, turning with the player.
    const u = Math.max(1, cell / 6 | 0);
    g.save(); g.translate(cx, cy); g.rotate(-state.yaw);
    g.fillStyle = '#ff6348'; g.fillRect(-u, -3 * u, 2 * u, 5 * u); g.fillRect(-2 * u, 0, 4 * u, 2 * u); g.restore();
    for (const [s, x, y] of [['N', n / 2 - 2, 1], ['S', n / 2 - 2, n - 9], ['W', 1, n / 2 - 4], ['E', n - 6, n / 2 - 4]]) {
      drawText(g, FONT, s, x, y, '#e5c48c');
    }
    map.setAttribute('aria-label', `${world.name} map, facing ${'NESW'[Math.round(-state.yaw / (Math.PI / 2)) % 4]}`);
  }
  // The desktop panel is a painted canvas; it calls these from its icons.
  const menu = { character: toggle('character', openCharacter), help: toggle('help', openHelp), saves: () => openSaves('save'), spells: magic ? toggle('spells', openSpells) : () => {}, journal: toggle('journal', openJournal), inventory: toggle('inventory', openInventory), fullscreen: toggleFullscreen, settings: toggle('settings', openSettings) };
  return { left, right, controls, draw, open, openJournal, openLog, openContainer, menu, quick: quickHud, close: closePanel, isLogOpen: () => shown === 'log', ready,
    // The scene's height, and how many screen pixels one pixel of the UI font covers.
    setView(height, pixel) {
      frame.style.setProperty('--rpg-view-h', height);
      document.documentElement.style.setProperty('--rpg-px', pixel);
      menuPanel.classList.toggle('rpg-compact', parseFloat(height) < 400);
      px = pixel; art = art.filter(entry => entry.canvas.isConnected); art.forEach(renderArt);
      if (lastState) draw(lastState);
    },
    setLevel(level) { title.textContent = level.name; mapTitle.textContent = level.shortName ?? level.name; },
    openSpells, openCharacter, openHelp, notice(text) { notice.textContent = text; notice.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { notice.hidden = true; }, 6000); },
    isOpen: () => !menuPanel.hidden,
    setLayout(mode, width) {
      quickHud?.setShown(mode === 'desktop' ? Infinity : SHOWN_SMALL);
      const rail = Math.max(156, Math.min(176, Math.floor(width * .165)));
      document.documentElement.style.setProperty('--rpg-rail', `${rail}px`);
      return mode === 'landscape' ? left.getBoundingClientRect().width : 0;
    },
  };
}
