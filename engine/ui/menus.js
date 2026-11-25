// The menus, drawn on the game's one canvas in the 320x180 panel over the scene (the HUD stays in view): the satchel, the
// character screen, the spells, the journal and message log, settings with saving and loading, help, shops, containers,
// dialogue, the world map and the end of the game. One menu is open at a time. Each is a screen: { kind, title, draw() }
// that draws itself every frame with the canvas kit (ui/canvas.js); this file is the frame around them (the window, the
// title bar, the Close button, a line of news in the bar) and the few small screens that need no file of their own.
// See docs/engine/ui.md.

import { THEME, fitText } from './canvas.js';
import { createSatchel } from './satchel.js';
import { createCharacterScreen } from './character-screen.js';
import { createSpellScreen } from './spell-screen.js';
import { createHelpScreen } from './help-screen.js';
import { createSettingsScreens } from './settings-screen.js';
import { createShopScreen } from './shop-screen.js';
import { createWorldMap } from './world-map.js';

export function createMenus({ kit, icons, sprite, world, hero, messages = [], inventory, equipment, inventoryColumns = 8, itemDefs = {}, say = () => {}, drop = () => {}, onUse = () => null, saves = null,
  // Wearing goes through these (the session's, so the message says what changes); `wouldChange(itemId)` lists what wearing a pack item would change.
  onEquip, onUnequip, wouldChange = () => null, damageTypes = {}, sound = null,
  // Put a skill point (from levelling up) into an attribute: session.spend, which returns { ok }.
  onSpend, wallet = null, onTake, onTakeAll,
  // Magic (null when the game has no spells): { spells(), cast(id), setReady(id), ready(), effectName(id) }.
  magic = null,
  // The quick bar adapter: { view(), has(ref), toggle(ref, name), ... } (see core/game.js).
  quick = null, help = [], debug = null, reload = async () => {}, onFullscreen = () => {} }) {
  let current = null, onClose = null, news = '', newsUntil = 0;
  const toast = text => { news = text; newsUntil = performance.now() + 4000; };
  const finish = () => { const done = onClose; onClose = null; done?.(); };
  function close() { if (!current) return; current = null; finish(); }
  function open(screen, closing = null) {
    if (current && current.kind !== screen.kind) { current.closed?.(); finish(); } else if (current) onClose = null;
    current = screen; onClose = closing; kit.resetScroll(); screen.opened?.();
    return screen;
  }
  const toggle = (kind, make) => () => { if (current?.kind === kind) close(); else open(make()); };

  // ---- the screens that live in their own files
  const satchel = createSatchel({ kit, icons, sprite, hero, inventory, equipment, inventoryColumns, itemDefs, damageTypes, say, toast, drop, onUse, onEquip, onUnequip, wouldChange, wallet, quick,
    effectName: id => magic?.effectName?.(id) ?? id, openCharacter: () => open(character) });
  const character = createCharacterScreen({ kit, sprite, hero, damageTypes, onSpend, toast });
  const spells = magic ? createSpellScreen({ kit, icons, hero, magic, quick, damageTypes, say, toast }) : null;
  const go = { settings: () => open(settings), help: () => open(helpScreen), saves: mode => open(saveScreens[mode]) };
  const { settings, saves: savesFor } = createSettingsScreens({ kit, saves, sound, debug, say, toast, go, fullscreen: () => toggleFullscreen(), reload, close });
  const saveScreens = saves ? { save: savesFor('save'), load: savesFor('load') } : {};
  const helpScreen = createHelpScreen({ kit, magic: !!magic, extra: help, back: () => open(settings) });

  // ---- small screens
  const text = (title, body, kind = 'text') => open({ kind, title, draw() { kit.scroll('text', 5, 20, 310, 155, w => kit.paragraph(body, 4, 3, w - 8, THEME.text) + 8); } });
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else { await document.documentElement.requestFullscreen(); onFullscreen(); }
    } catch { text('Full screen', 'Full screen is not available in this browser.'); }
  }

  function openLog() {
    open({ kind: 'log', title: 'Message log', draw() {
      kit.scroll('log', 5, 20, 310, 155, w => {
        const lines = messages.slice(-40).reverse();
        if (!lines.length) { kit.text('Nothing yet.', 4, 3, THEME.dim); return 14; }
        let y = 3;
        for (const line of lines) y += kit.paragraph(line, 4, y, w - 8, THEME.text) + 4;
        return y;
      });
    } });
  }
  function openJournal() {
    open({ kind: 'journal', title: 'Field journal', draw() {
      const quests = world.quests ?? [];
      kit.scroll('journal', 5, 20, 310, 134, w => {
        let y = 3;
        if (!quests.length) y += kit.paragraph(world.journal, 4, y, w - 8, THEME.text);
        for (const [status, label] of [['active', 'Active quests'], ['completed', 'Completed quests']]) {
          const entries = quests.filter(q => q.status === status);
          if (!entries.length) continue;
          kit.text(label, 4, y, THEME.select); y += 11;
          for (const entry of entries) { kit.text(entry.title, 8, y, THEME.white); y += 10; y += kit.paragraph(entry.objective, 8, y, w - 16, THEME.dim) + 4; }
          y += 4;
        }
        if (quests.length && world.journal) { kit.text('Field notes', 4, y, THEME.select); y += 11; y += kit.paragraph(world.journal, 4, y, w - 8, THEME.text); }
        return y + 4;
      });
      kit.button(5, 158, 100, 17, 'Message log', { tap: openLog });
    } });
  }

  function showDialogue(line, dismiss) {
    if (!line) { if (current?.kind === 'dialogue') close(); return; }
    open({ kind: 'dialogue', title: line.title, draw() {
      const n = line.choices.length, room = 155 - (n ? n * 18 + 2 : 0);
      kit.scroll('dialogue', 5, 20, 310, room, w => kit.paragraph(line.text, 4, 3, w - 8, THEME.text) + 6);
      line.choices.forEach((choice, i) => kit.button(10, 175 - (n - i) * 18 + 1, 300, 16, choice.label, { tap: choice.choose, key: `choice:${i}` }));
    } }, dismiss);
  }

  // A chest, a hidden stash or a pile on the floor: stacks to take one at a time, or all at once. `box` is { title, text, stacks };
  // taking removes from box.stacks.
  function openContainer(box, note = '') {
    const label = ({ id, qty }) => `${itemDefs[id].name}${qty > 1 ? ` x${qty}` : ''}`;
    let message = note;
    open({ kind: 'container', title: box.title, draw() {
      let top = 22;
      if (box.text) { top += kit.paragraph(box.text, 10, top, 300, THEME.dim, { max: 2 }) + 2; }
      if (!box.stacks.length) kit.text('Nothing left.', 10, top + 4, THEME.text);
      else kit.scroll('container', 5, top, 310, 154 - top, width => {
        box.stacks.forEach((stack, i) => {
          const y = 1 + i * 22;
          kit.button(1, y, width - 1, 20, '', { key: `take:${i}`, title: label(stack), tap: () => {
            const n = onTake(i), taken = label({ id: stack.id, qty: n });
            message = !n ? 'Your pack is full.' : `You take ${taken}.${box.stacks.includes(stack) ? ' Your pack is full.' : ''}`; say(message);
          } });
          kit.icon(icons, itemDefs[stack.id].icon, 4, y + 2, 16);
          kit.text(fitText(label(stack), 200), 24, y + 6, THEME.text); kit.text('Take', width - 6, y + 6, THEME.select, { align: 'right' });
        });
        return 2 + box.stacks.length * 22;
      });
      if (box.stacks.length) kit.button(5, 158, 70, 17, 'Take all', { tap: () => {
        const taken = onTakeAll();
        message = !taken.length ? 'Your pack is full.' : `You take ${taken.map(label).join(', ')}.${box.stacks.length ? ' Your pack is full.' : ''}`; say(message);
      } });
      if (message) kit.text(fitText(message, 230), 80, 162, THEME.select);
    } });
  }

  // ---- the defeat screen: it covers the scene until the way back has opened. The button can skip the short pause; nothing
  // else closes it, so Escape cannot skip respawn.
  let over = null; // { text, label, busy, finish }
  const gameOver = {
    get active() { return !!over; },
    wait(retry = false, place = 'safety') {
      return new Promise(resolve => {
        let timer;
        const done = () => { clearTimeout(timer); if (!over || over.busy) return; over.busy = true; over.label = 'Returning...'; resolve(); };
        over = { text: retry ? `The way back to ${place} could not be opened. Try returning again.` : `The creature overcame you in the dark. You will awaken in ${place}.`,
          label: `Return to ${place}`, busy: false, finish: done };
        if (!retry) timer = setTimeout(done, 3000);
      });
    },
    close() { over = null; },
  };

  return {
    get kind() { return current?.kind ?? null; },
    isOpen: () => !!current, isLogOpen: () => current?.kind === 'log', close, toast, gameOver,
    open: text, openJournal, openLog, openContainer, showDialogue,
    openWorldMap: (map, travel) => open(createWorldMap({ kit, map, travel, closeMenu: close })),
    openShop: shop => open(createShopScreen({ kit, icons, shop, items: itemDefs }), shop.close),
    openSpells: () => (spells ? open(spells) : undefined), openCharacter: () => open(character), openHelp: () => open(helpScreen),
    menu: {
      character: toggle('character', () => character), help: toggle('help', () => helpScreen), saves: () => (saves ? open(saveScreens.save) : open(settings)),
      spells: spells ? toggle('spells', () => spells) : () => {}, journal: () => (current?.kind === 'journal' ? close() : openJournal()),
      inventory: toggle('inventory', () => satchel), fullscreen: toggleFullscreen, settings: toggle('settings', () => settings),
    },
    // Draw whatever is open in the scene's area (`view`: { x, y }), over the scene.
    draw(view, now = performance.now()) {
      if (current) {
        kit.origin(view.x, view.y);
        kit.window(0, 0, 320, 180);
        kit.hit(0, 0, 320, 180, { key: 'menu:panel' }); // the panel is solid: a press on it does not reach the scene (and everything below sits above it)
        current.backdrop?.(); // a screen's picture under the title bar (the world map)
        kit.frame(5, 5, 310, 13, { fill: THEME.well, edge: THEME.frameLo });
        kit.text(fitText(current.title, 150), 9, 8, THEME.select);
        kit.button(277, 6, 36, 11, 'Close', { tap: close, key: 'menu:close' });
        if (now < newsUntil) kit.text(fitText(news, 118), 272, 8, THEME.text, { align: 'right' });
        current.draw();
      }
      if (over) {
        kit.origin(view.x, view.y);
        kit.fill(0, 0, 320, 180, 'rgba(8,4,8,0.82)');
        kit.frame(40, 42, 240, 96, { fill: THEME.panel, edge: THEME.frameHi });
        kit.text('GAME OVER', 160, 52, THEME.bad, { align: 'center' }); kit.text('GAME OVER', 161, 52, THEME.bad, { align: 'center' });
        kit.paragraph(over.text, 52, 70, 216, THEME.text, { max: 4 });
        kit.hit(0, 0, 320, 180, { key: 'over:panel' });
        kit.button(70, 112, 180, 17, over.label, { primary: true, disabled: over.busy, tap: over.finish, key: 'over:button' });
      }
      kit.origin(0, 0);
    },
  };
}
