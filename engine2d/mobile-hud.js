import { drawText } from '../engine/bitmapfont.js';
import { font5x8 as FONT } from '../engine/font-5x8.js';
import { pixelSkin } from './pixel-skin.js';
import { reloadFresh } from './reload.js';

// Responsive, DOM-based mobile chrome. The scene and desktop HUD stay on canvas.
const STYLE_URL = new URL('./mobile-hud.css', import.meta.url);

export function createMobileHUD({ panel, portrait, world, hero, frame, debug, history = [] }) {
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
  const character = document.createElement('div'); character.className = 'rpg-character';
  const heroTitle = document.createElement('h2'); heroTitle.className = 'rpg-rail-title'; heroTitle.textContent = 'Adventurer'; left.append(heroTitle);
  const face = document.createElement('canvas'); face.className = 'rpg-portrait';
  face.width = face.height = 40; face.setAttribute('role', 'img'); face.setAttribute('aria-label', 'Your adventurer');
  face.getContext('2d').drawImage(portrait, 0, 0, 40, 40);
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

  const dialog = document.createElement('dialog'); dialog.className = 'rpg-dialog';
  const heading = document.createElement('h2'); heading.id = 'rpg-dialog-title';
  dialog.setAttribute('aria-labelledby', heading.id);
  const body = document.createElement('div'); body.className = 'rpg-dialog-body';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Return to the quarter';
  close.addEventListener('click', () => dialog.close()); dialog.append(heading, body, close); document.body.append(dialog);
  dialog.addEventListener('click', e => { if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  } });
  function open(title, text) {
    heading.textContent = title; body.replaceChildren();
    if (text) { const p = document.createElement('p'); p.textContent = text; body.append(p); }
    if (!dialog.open) dialog.showModal();
  }
  function iconButton(label, source, target, handler) {
    const button = document.createElement('button'); button.type = 'button';
    button.title = label; button.setAttribute('aria-label', label);
    const c = document.createElement('canvas'); c.width = c.height = 24; c.setAttribute('aria-hidden', 'true');
    c.getContext('2d').drawImage(panel, ...source, 0, 0, 24, 24);
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
  const map = document.createElement('canvas'); map.width = map.height = 56; map.className = 'rpg-map';
  map.setAttribute('role', 'img'); map.setAttribute('aria-label', 'Map of the Old Quarter');
  right.append(map);
  const menus = document.createElement('div'); menus.className = 'rpg-menus'; right.append(menus);
  function inventory() {
    open('Your satchel', 'Travel essentials for a visit to the Old Quarter.');
    const grid = document.createElement('div'); grid.className = 'rpg-inventory';
    for (const [label, text, i] of items) {
      const b = iconButton(label, [545 + i * 76, 130, 76, 76], grid, () => open(label, text));
      const span = document.createElement('span'); span.textContent = label; b.append(span);
    }
    body.append(grid);
  }
  iconButton('Inventory', [545 + 3 * 99, 20, 99, 92], menus, inventory);
  // The messages the game has said, newest first, over the scene only: the rails and panels stay in view.
  const logView = document.createElement('section'); logView.className = 'rpg-logview'; logView.hidden = true;
  logView.setAttribute('aria-label', 'Message log');
  const logHead = document.createElement('header');
  const logTitle = document.createElement('h2'); logTitle.textContent = 'Message log';
  const logClose = document.createElement('button'); logClose.type = 'button'; logClose.textContent = 'Close';
  const logList = document.createElement('ol'); logList.className = 'rpg-log'; logList.tabIndex = 0;
  logHead.append(logTitle, logClose); logView.append(logHead, logList); frame.append(logView);
  function closeLog() { logView.hidden = true; }
  logClose.addEventListener('click', closeLog);
  function openLog() {
    if (dialog.open) dialog.close();
    logList.replaceChildren();
    for (const text of history.slice(-40).reverse()) { const li = document.createElement('li'); li.textContent = text; logList.append(li); }
    if (!logList.children.length) { const li = document.createElement('li'); li.textContent = 'Nothing yet.'; logList.append(li); }
    logList.scrollTop = 0; logView.hidden = false; logClose.focus({ preventScroll: true });
  }
  function openJournal() {
    open('Field journal', world.journal);
    const more = document.createElement('button'); more.type = 'button'; more.textContent = 'Message log';
    more.addEventListener('click', openLog); body.append(more);
  }
  iconButton('Journal', [545 + 2 * 99, 20, 99, 92], menus, openJournal);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { open('Full screen', 'Full screen is not available in this browser.'); }
  }
  iconButton('Full screen', [545 + 4 * 99, 20, 99, 92], menus, toggleFullscreen);
  function openSettings() {
    open('Controls', 'Use the left pad to step and strafe, and the curved arrows to turn. Swipe the scene to move or turn. Step forward into a passage door to travel between levels. Use the Use button to examine what you face. Keyboard: W/S move, A/D strafe, Q/E turn, F or Space use, L message log.');
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
    if (document.fullscreenEnabled) {
      const fullscreen = document.createElement('button'); fullscreen.type = 'button';
      fullscreen.textContent = document.fullscreenElement ? 'Exit full screen' : 'Enter full screen';
      fullscreen.addEventListener('click', async () => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await document.documentElement.requestFullscreen();
          dialog.close();
        } catch { fullscreen.textContent = 'Full screen unavailable'; }
      });
      body.append(fullscreen);
    }
  }
  iconButton('Settings and controls', [545 + 5 * 99, 20, 99, 92], menus, openSettings);
  for (const button of menus.children) caption(button, button.title === 'Settings and controls' ? 'Settings' : button.title === 'Inventory' ? 'Bag' : button.title === 'Full screen' ? 'Screen' : button.title);
  const controls = document.createElement('div'); controls.className = 'rpg-controls'; root.append(controls);

  function draw(state) {
    for (const { key, meter, number } of vitalNodes) {
      meter.value = hero[key]; number.textContent = `${hero[key]}/${meter.max}`;
    }
    const g = map.getContext('2d'); g.fillStyle = '#100e10'; g.fillRect(0, 0, 56, 56);
    const cell = 5, cx = 28, cy = 28;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const t = world.typeAt(state.tileX + dx, state.tileZ + dz); if (!t) continue;
      g.fillStyle = t.wall ? '#3b3335' : '#95816a'; g.fillRect(cx + dx * cell - 2, cy + dz * cell - 2, 4, 4);
    }
    for (const b of world.billboards) {
      const x = cx + (b.entity.x - state.tileX) * cell, y = cy + (b.entity.z - state.tileZ) * cell;
      g.fillStyle = '#e9b65e'; g.fillRect(x - 1, y - 1, 2, 2);
    }
    g.save(); g.translate(cx, cy); g.rotate(-state.yaw);
    // Integer rectangles keep the facing marker as crisp as the map cells.
    g.fillStyle = '#ff6348'; g.fillRect(-1, -3, 2, 5); g.fillRect(-2, 0, 4, 2); g.restore();
    for (const [s, x, y] of [['N', 26, 1], ['S', 26, 47], ['W', 1, 24], ['E', 50, 24]]) {
      drawText(g, FONT, s, x, y, '#e5c48c');
    }
    map.setAttribute('aria-label', `${world.name} map, facing ${'NESW'[Math.round(-state.yaw / (Math.PI / 2)) % 4]}`);
  }
  // The desktop panel is a painted canvas; it calls these from its icons.
  const menu = { journal: openJournal, inventory, fullscreen: toggleFullscreen, settings: openSettings };
  return { left, right, controls, draw, open, openJournal, openLog, menu, items, closeLog, isLogOpen: () => !logView.hidden, ready,
    // The scene's height, and how many screen pixels one pixel of the UI font covers.
    setView(height, pixel) { frame.style.setProperty('--rpg-view-h', height); frame.style.setProperty('--rpg-px', pixel); },
    setLevel(level) { title.textContent = level.name; mapTitle.textContent = level.shortName ?? level.name; },
    notice(text) { notice.textContent = text; notice.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { notice.hidden = true; }, 6000); },
    isOpen: () => dialog.open || !logView.hidden,
    setLayout(mode, width) {
      const rail = Math.max(156, Math.min(176, Math.floor(width * .165)));
      document.documentElement.style.setProperty('--rpg-rail', `${rail}px`);
      return mode === 'landscape' ? left.getBoundingClientRect().width : 0;
    },
  };
}
