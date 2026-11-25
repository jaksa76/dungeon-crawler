// Settings, and the save and load screens it leads to, drawn in the 320x180 panel.
//
//   createSettingsScreens({ kit, saves, sound, debug, say, toast, go, fullscreen, reload, close, mainMenu, controls })
//     -> { settings, saves(mode) }  screens ({ kind, title, draw() })
//
// saves: { max, current(), list() -> [{ slot, savedAt, label }], save(slot) -> bool, load(slot) -> Promise<bool> }, or null to hide
// Save and Load. `go`: { settings(), help(), saves(mode) } opens another screen. `close()` closes the menu. `mainMenu()`
// leaves the game for the main menu (it saves first when the game is saving), or returns { ok: false, message } to stay;
// null hides the button. It takes two presses. `controls`: { big(), setBig(on), shown() } for Big controls (phone only), or null.

import { THEME, fitText } from './canvas.js';

const stamp = time => { const d = new Date(time); return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; };

export function createSettingsScreens({ kit, saves = null, sound = null, debug = null, say = () => {}, toast = () => {}, go, fullscreen, reload, close, mainMenu = null, controls = null }) {
  let reloading = false, confirm = null; // confirm: { id, until } while "Overwrite?" waits for a second press

  const leaving = () => confirm?.id === 'main-menu' && confirm.until > kit.state.now;
  const settings = {
    kind: 'settings', title: 'Settings',
    draw() {
      const items = [
        saves && ['Save', () => go.saves('save')], saves && ['Load', () => go.saves('load')],
        ['Help', () => go.help()],
        sound && [`Sound: ${sound.muted ? 'off' : 'on'}`, () => sound.setMuted(!sound.muted)],
        ['Full screen', () => fullscreen()],
        controls?.shown() && [`Big controls: ${controls.big() ? 'on' : 'off'}`, () => controls.setBig(!controls.big())],
        [reloading ? 'Refreshing game files...' : 'Reload without cache', async () => { if (reloading) return; reloading = true; await reload(); }],
        debug && [`Slot outlines: ${debug.get() ? 'on' : 'off'}`, () => debug.set(!debug.get())],
        mainMenu && [leaving() ? (saves ? 'Save and leave?' : 'Leave unsaved?') : 'Main menu', () => {
          if (!leaving()) { confirm = { id: 'main-menu', until: kit.state.now + 3000 }; return; }
          confirm = null;
          const left = mainMenu();
          if (left && !left.ok) toast(left.message); // the log is hidden while the menu is open
        }, leaving()],
      ].filter(Boolean);
      items.forEach(([label, tap, primary = false], i) => kit.button(10 + (i % 2) * 154, 26 + (i >> 1) * 22, 146, 18, label, { tap, primary }));
    },
  };

  // The save screen and the load screen: one row per slot. Saving over a slot takes two presses; loading returns to that
  // save and closes the screen.
  const screenFor = mode => ({
    kind: mode, title: mode === 'save' ? 'Save game' : 'Load game',
    draw() {
      const saving = mode === 'save', existing = new Map(saves.list().map(s => [s.slot, s]));
      let row = 0;
      for (let n = 1; n <= saves.max; n++) {
        const id = `slot-${n}`, entry = existing.get(id);
        if (!saving && !entry) continue; // nothing to load from an empty slot
        const y = 24 + row++ * 27, asking = confirm?.id === id && confirm.until > kit.state.now;
        kit.frame(10, y, 300, 24, { edge: id === saves.current() ? THEME.select : THEME.wellEdge });
        kit.text(fitText(entry ? `${n}. ${entry.label}` : `${n}. Empty`, 190), 15, y + 4, entry ? THEME.text : THEME.dim);
        if (entry) kit.text(stamp(entry.savedAt), 15, y + 13, THEME.dim);
        kit.button(244, y + 3, 62, 18, saving ? (asking ? 'Overwrite?' : 'Save') : 'Load', { primary: asking, tap: async () => {
          if (saving) {
            if (entry && !asking) { confirm = { id, until: kit.state.now + 3000 }; return; }
            confirm = null;
            const ok = saves.save(id), text = ok ? 'Game saved.' : 'Your progress could not be saved.';
            say(text); toast(text);
          } else { close(); if (await saves.load(id)) say('Game loaded.'); }
        } });
      }
      if (row === 0) kit.text('There are no saved games yet. Use Save to make one.', 15, 28, THEME.dim);
      kit.button(5, 158, 100, 17, 'Back to settings', { tap: () => go.settings() });
    },
  });
  return { settings, saves: screenFor };
}
