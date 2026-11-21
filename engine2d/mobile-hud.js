import { drawText } from '../engine/bitmapfont.js';
import { font5x8 as FONT } from '../engine/font-5x8.js';
import { pixelSkin } from './pixel-skin.js';
import { reloadFresh } from './reload.js';
import { takeStack, takeAll } from './inventory.js';

// Responsive, DOM-based mobile chrome. The scene and desktop HUD stay on canvas.
const STYLE_URL = new URL('./mobile-hud.css', import.meta.url);

// The painted background of the satchel screen (see docs/inventory.md); null draws plain frames instead.
const BAG_BACKGROUND = './assets/inventory-bg.png';

// inventory: the player's pack; itemDefs: item id -> definition; say: writes to the message log;
// drop(slot, qty): puts items from the pack on the floor where the player stands; onUse(slot) uses an item
// and returns { message } (or null).
export function createMobileHUD({ panel, portrait, world, hero, frame, debug, messages = [], inventory, inventoryColumns = 8, itemDefs = {}, say = () => {}, drop = () => {}, onUse = () => null }) {
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
  title.textContent = 'Ravensmoor · Old Quarter'; frame.append(title);
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
    const n = Math.max(8, Math.round((typeof size === 'function' ? size() : size) / px));
    canvas.width = canvas.height = n;
    canvas.style.width = canvas.style.height = `${n * px}px`;
    const g = canvas.getContext('2d'); g.imageSmoothingQuality = 'high';
    draw(g, n);
  }
  function addArt(canvas, size, draw) { const entry = { canvas, size, draw }; art.push(entry); renderArt(entry); }
  const character = document.createElement('div'); character.className = 'rpg-character';
  const heroTitle = document.createElement('h2'); heroTitle.className = 'rpg-rail-title'; heroTitle.textContent = 'Adventurer'; left.append(heroTitle);
  const face = document.createElement('canvas'); face.className = 'rpg-portrait';
  face.setAttribute('role', 'img'); face.setAttribute('aria-label', 'Your adventurer');
  const shortScreen = () => matchMedia('(max-height: 380px) and (orientation: landscape), (max-height: 680px) and (orientation: portrait)').matches;
  addArt(face, () => (document.documentElement.dataset.layout === 'portrait' ? (shortScreen() ? 48 : 88) : (shortScreen() ? 56 : 80)),
    (g, n) => g.drawImage(portrait, 0, 0, n, n));
  character.append(face);
  const vitals = document.createElement('div'); vitals.className = 'rpg-vitals';
  const vitalNodes = [];
  for (const [label, value, max] of [['HP', hero.hp, hero.maxHp], ['MP', hero.mp, hero.maxMp]]) {
    const row = document.createElement('div'); row.className = `rpg-vital ${label.toLowerCase()}`;
    const caption = document.createElement('span'); caption.textContent = label;
    const meter = document.createElement('meter'); meter.min = 0; meter.max = max; meter.value = value;
    meter.setAttribute('aria-label', label === 'HP' ? 'Health' : 'Mana');
    const number = document.createElement('b'); number.textContent = `${value}/${max}`;
    vitalNodes.push({ key: label.toLowerCase(), meter, number });
    row.append(caption, meter, number); vitals.append(row);
  }
  character.append(vitals); left.append(character);

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
  function iconButton(label, source, target, handler, size = 48) {
    const button = document.createElement('button'); button.type = 'button';
    button.title = label; button.setAttribute('aria-label', label);
    const c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
    addArt(c, size, (g, n) => g.drawImage(panel, ...source, 0, 0, n, n));
    button.append(c); button.addEventListener('click', handler); target.append(button);
    return button;
  }
  const items = [
    ['Sword', 'A trusty steel blade, ready for the road.', 0],
    ['Shield', 'A round shield with a worn wooden face.', 1],
    ['Health potion', 'A small vial of red tonic. Your health is already full.', 2],
    ['Mana potion', 'A small vial of blue tonic. Your mana is already full.', 3],
  ];
  const slots = document.createElement('div'); slots.className = 'rpg-slots';
  slots.setAttribute('aria-label', 'Quick items');
  function caption(button, text) {
    const label = document.createElement('span'); label.className = 'rpg-icon-label'; label.textContent = text; button.append(label);
  }
  for (const [label, text, i] of items) {
    const button = iconButton(label, [545 + i * 76, 130, 76, 76], slots, () => open(label, text));
    caption(button, label.replace(' potion', ''));
  }
  left.append(slots);
  const mapTitle = document.createElement('h2'); mapTitle.className = 'rpg-rail-title'; mapTitle.textContent = 'Old Quarter'; right.append(mapTitle);
  const map = document.createElement('canvas'); map.className = 'rpg-map';
  let lastState = null; // the minimap is redrawn from it whenever its resolution changes
  addArt(map, () => (shortScreen() ? (document.documentElement.dataset.layout === 'portrait' ? 72 : 88) : 112), () => {});
  map.setAttribute('role', 'img'); map.setAttribute('aria-label', 'Map of the Old Quarter');
  right.append(map);
  const menus = document.createElement('div'); menus.className = 'rpg-menus'; right.append(menus);
  // An item's picture: its crop of the panel's row of item icons, drawn through the art registry. The crop
  // leaves out the slot's hotkey number and edge bar, which belong to the panel.
  function itemIcon(id, size) { // size: CSS pixels, or a function that returns them
    const c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
    const i = itemDefs[id].icon;
    addArt(c, size, (g, n) => g.drawImage(panel, 545 + i * 76 + 17, 130 + 15, 47, 47, 0, 0, n, n));
    return c;
  }
  const stackLabel = ({ id, qty }) => `${itemDefs[id].name}${qty > 1 ? ` x${qty}` : ''}`;
  const paragraph = (text, className = '') => { const p = document.createElement('p'); p.className = className; p.textContent = text; return p; };
  const textButton = (label, handler) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', handler); return b; };
  if (BAG_BACKGROUND) { document.documentElement.style.setProperty('--rpg-bag-bg', `url(${new URL(BAG_BACKGROUND, import.meta.url).href})`); document.documentElement.dataset.bagArt = ''; }

  // The satchel. On the left the hero (a placeholder until there is equipment to place), on the right the pack
  // as a grid you rearrange by dragging, underneath whatever is selected and what can be done with it.
  let selected = null;
  const make = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text) e.textContent = text; return e; };
  function openInventory(note = '') {
    open('Your satchel', null, 'inventory');
    if (selected !== null && !inventory.slots[selected]) selected = null;
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
    const face = make('canvas', 'rpg-hero'); face.setAttribute('role', 'img'); face.setAttribute('aria-label', 'Your adventurer');
    addArt(face, () => niche.clientWidth * 0.85, (g, n) => g.drawImage(portrait, 0, 0, n, n));
    niche.append(face);
    for (const cell of grid.children) {
      const stack = inventory.slots[cell.dataset.slot];
      if (!stack) continue;
      const icon = itemIcon(stack.id, () => cell.clientWidth * 0.8);
      cell.prepend(icon);
    }
    dragToRearrange(grid);

    const stack = selected === null ? null : inventory.slots[selected], def = stack && itemDefs[stack.id];
    const text = make('div', 'rpg-detail-text');
    if (!stack) {
      text.append(make('h3', '', 'Nothing selected'), make('p', '', 'Select an item to read about it. Drag items to rearrange them.'));
    } else {
      text.append(make('h3', '', `${def.name}${stack.qty > 1 ? ` x${stack.qty}` : ''}`), make('p', '', def.description));
    }
    if (note) text.append(make('p', 'rpg-note', note));
    detail.append(text);
    if (stack) {
      const actions = make('div', 'rpg-actions');
      const use = textButton('Use', () => { const result = onUse(selected); openInventory(result?.message ?? ''); });
      use.disabled = !def.use;
      const dropIt = qty => { const name = stackLabel({ id: stack.id, qty }); drop(selected, qty); say(`You drop ${name}.`); openInventory(`You drop ${name}.`); };
      actions.append(use, textButton(stack.qty > 1 ? 'Drop one' : 'Drop', () => dropIt(1)));
      if (stack.qty > 1) actions.append(textButton('Drop all', () => dropIt(stack.qty)));
      detail.append(actions);
    }
  }

  // Select by tapping; rearrange by dragging a stack onto another slot (an empty one moves it, the same item
  // merges, anything else swaps). A drag shows the icon under the pointer and lights the slot it would land on.
  function dragToRearrange(grid) {
    const cellAt = (x, y) => document.elementFromPoint(x, y)?.closest('.rpg-cell[data-slot]');
    let drag = null, ignoreClick = false;
    grid.addEventListener('pointerdown', e => {
      const cell = e.target.closest('.rpg-cell[data-slot]');
      if (!cell || e.button > 0 || !inventory.slots[cell.dataset.slot]) return;
      drag = { from: +cell.dataset.slot, cell, id: e.pointerId, x: e.clientX, y: e.clientY, ghost: null, over: null };
      cell.setPointerCapture?.(e.pointerId);
    });
    grid.addEventListener('pointermove', e => {
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
    });
    const finish = (e, cancelled) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { from, ghost } = drag; drag = null;
      if (!ghost) return; // a tap: the click handler selects
      ghost.remove(); ignoreClick = true;
      const target = cancelled ? null : cellAt(e.clientX, e.clientY);
      if (target && inventory.move(from, +target.dataset.slot)) selected = +target.dataset.slot;
      openInventory();
    };
    grid.addEventListener('pointerup', e => finish(e, false));
    grid.addEventListener('pointercancel', e => finish(e, true));
    grid.addEventListener('click', e => {
      if (ignoreClick) { ignoreClick = false; return; }
      const cell = e.target.closest('.rpg-cell[data-slot]');
      if (!cell) return;
      selected = inventory.slots[cell.dataset.slot] ? +cell.dataset.slot : null;
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
  iconButton('Inventory', [545 + 3 * 99, 20, 99, 92], menus, toggle('inventory', openInventory));
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
  iconButton('Journal', [545 + 2 * 99, 20, 99, 92], menus, toggle('journal', openJournal));
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { open('Full screen', 'Full screen is not available in this browser.'); }
  }
  iconButton('Full screen', [545 + 4 * 99, 20, 99, 92], menus, toggleFullscreen);
  function openSettings() {
    open('Controls', 'Use the left pad to step and strafe, and the curved arrows to turn. Swipe the scene to move or turn. Step forward into a passage door to travel between levels. Use the Use button to examine what you face. Keyboard: W/S move, A/D strafe, Q/E turn, F or Space use, I inventory, L message log.', 'settings');
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
  }
  iconButton('Settings and controls', [545 + 5 * 99, 20, 99, 92], menus, toggle('settings', openSettings));
  for (const button of menus.children) caption(button, button.title === 'Settings and controls' ? 'Settings' : button.title === 'Inventory' ? 'Bag' : button.title === 'Full screen' ? 'Screen' : button.title);
  const controls = document.createElement('div'); controls.className = 'rpg-controls'; root.append(controls);

  function draw(state) {
    for (const { key, meter, number } of vitalNodes) {
      meter.value = hero[key]; number.textContent = `${hero[key]}/${meter.max}`;
    }
    lastState = state;
    // The minimap's resolution follows its on-screen size (see addArt): 56 logical pixels when large.
    const n = map.width, g = map.getContext('2d'); g.fillStyle = '#100e10'; g.fillRect(0, 0, n, n);
    const cell = Math.max(3, Math.floor(n / 11)), tile = cell - 1, cx = n / 2, cy = n / 2;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const t = world.typeAt(state.tileX + dx, state.tileZ + dz); if (!t) continue;
      g.fillStyle = t.wall ? '#3b3335' : '#95816a'; g.fillRect(cx + dx * cell - (tile >> 1), cy + dz * cell - (tile >> 1), tile, tile);
    }
    for (const b of world.billboards) {
      const x = cx + (b.entity.x - state.tileX) * cell, y = cy + (b.entity.z - state.tileZ) * cell;
      g.fillStyle = '#e9b65e'; g.fillRect(x - 1, y - 1, 2, 2);
    }
    g.save(); g.translate(cx, cy); g.rotate(-state.yaw);
    // Integer rectangles keep the facing marker as crisp as the map cells.
    g.fillStyle = '#ff6348'; g.fillRect(-1, -3, 2, 5); g.fillRect(-2, 0, 4, 2); g.restore();
    for (const [s, x, y] of [['N', n / 2 - 2, 1], ['S', n / 2 - 2, n - 9], ['W', 1, n / 2 - 4], ['E', n - 6, n / 2 - 4]]) {
      drawText(g, FONT, s, x, y, '#e5c48c');
    }
    map.setAttribute('aria-label', `${world.name} map, facing ${'NESW'[Math.round(-state.yaw / (Math.PI / 2)) % 4]}`);
  }
  // The desktop panel is a painted canvas; it calls these from its icons.
  const menu = { journal: toggle('journal', openJournal), inventory: toggle('inventory', openInventory), fullscreen: toggleFullscreen, settings: toggle('settings', openSettings) };
  return { left, right, controls, draw, open, openJournal, openLog, openContainer, menu, items, close: closePanel, isLogOpen: () => shown === 'log', ready,
    // The scene's height, and how many screen pixels one pixel of the UI font covers.
    setView(height, pixel) {
      frame.style.setProperty('--rpg-view-h', height);
      document.documentElement.style.setProperty('--rpg-px', pixel);
      menuPanel.classList.toggle('rpg-compact', parseFloat(height) < 400);
      px = pixel; art = art.filter(entry => entry.canvas.isConnected); art.forEach(renderArt);
      if (lastState) draw(lastState);
    },
    setLevel(level) { title.textContent = level.name; mapTitle.textContent = level.shortName ?? level.name; },
    notice(text) { notice.textContent = text; notice.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { notice.hidden = true; }, 6000); },
    isOpen: () => !menuPanel.hidden,
    setLayout(mode, width) {
      const rail = Math.max(156, Math.min(176, Math.floor(width * .165)));
      document.documentElement.style.setProperty('--rpg-rail', `${rail}px`);
      return mode === 'landscape' ? left.getBoundingClientRect().width : 0;
    },
  };
}
