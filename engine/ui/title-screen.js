// The screens before the game: the main menu, the list of saves to load, and character creation. They are drawn on the game's one
// canvas (ui/stage.js), on the same pixel grid as the game, in a 320 x 180 area in the middle of it (so the same screens fit the
// 320 x 240 desktop canvas and the 400 x 180 phone one). See docs/engine/ui.md.
//
//   const screen = createTitleScreen({ stage, title, logo?, background? })
//   await screen.main({ latest })        -> 'continue' | 'new' | 'load'   (latest: the newest save, or null)
//   await screen.saves({ slots, remove, replace? }) -> slot id, or null for Back
//   await screen.character({ base, points, derive, name }) -> { name, spent }, or null for Back
//   screen.loading() / screen.fail(message) / screen.close()
//
// `logo` and `background` are image URLs a campaign can give; without a logo the title is set in the pixel font. Keys: up and
// down choose, Enter does, Escape goes back; everything can also be tapped. Nothing is drawn until a screen is shown, so close()
// is safe to call either way.

import { THEME } from './canvas.js';
import { loadImage } from '../render/compositor.js';

const SPRITE_URL = new URL('../assets/ui/hero-sprite.png', import.meta.url);
const GOLD = '#e8c688', INK = '#ebd6ad', MUTED = '#a8916f';

const ATTRIBUTES = {
  strength: { label: 'Strength', about: 'Might of arm. Every blow lands harder.' },
  vitality: { label: 'Vitality', about: 'Toughness. You can take more punishment.' },
  intellect: { label: 'Intellect', about: 'Learning and will. A deeper well of mana.' },
  agility: { label: 'Agility', about: 'Speed and balance. Harder to hit, surer to strike.' },
};
const STATS = [['maxHp', 'Health'], ['maxMp', 'Mana'], ['attack', 'Attack'], ['defence', 'Defence'], ['accuracy', 'Accuracy'], ['evasion', 'Evasion']];

// "Today 14:03", "Yesterday 09:12", "3 Nov 18:40"
export function when(time, now = new Date()) {
  const d = new Date(time), day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const clock = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((day(now) - day(d)) / 864e5);
  if (days === 0) return `Today ${clock}`;
  if (days === 1) return `Yesterday ${clock}`;
  const date = d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
  return `${date} ${clock}`;
}

// A save's label is "Name · Place" (see game.js); split it into a headline and the rest.
function describe(save) {
  const [name, ...rest] = (save.label || 'Unnamed hero').split(' · ');
  return { name, detail: [rest.join(' · '), when(save.savedAt)].filter(Boolean).join(' · ') };
}

export function createTitleScreen({ stage, title, logo = null, background = null }) {
  const { kit, canvas, ctx: g, screen } = stage;
  let onKey = null, field = null, hero = null;
  const images = { logo: null, background: null };
  // Pictures the campaign gave: drawn once they have loaded; the menu does not wait for them.
  if (logo) loadImage(new URL(logo, location.href).href).then(img => { images.logo = img; });
  if (background) loadImage(new URL(background, location.href).href).then(img => { images.background = img; });
  loadImage(SPRITE_URL.href).then(img => { hero = img; });

  const keys = handler => {
    if (onKey) removeEventListener('keydown', onKey, true);
    onKey = handler ? ev => { if (handler(ev)) ev.preventDefault(); } : null;
    if (onKey) addEventListener('keydown', onKey, true);
  };
  // The screen's own 320 x 180, in the middle of the canvas.
  const origin = () => [Math.floor((canvas.width - 320) / 2), Math.floor((canvas.height - 180) / 2)];

  function backdrop() {
    const W = canvas.width, H = canvas.height;
    if (images.background) { // cover-fitted (crisp when that is a whole-number scale, as 400 x 240 is), and darkened so the text reads
      const img = images.background, k = Math.max(W / img.width, H / img.height);
      g.save(); g.imageSmoothingEnabled = k !== Math.floor(k); g.imageSmoothingQuality = 'high';
      g.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k); g.restore();
      const shade = g.createLinearGradient(0, 0, 0, H); shade.addColorStop(0, 'rgba(8,6,12,0.3)'); shade.addColorStop(1, 'rgba(8,6,16,0.6)');
      g.fillStyle = shade; g.fillRect(0, 0, W, H);
    } else {
      const glow = g.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, Math.max(W, H) * 0.7);
      glow.addColorStop(0, '#231a26'); glow.addColorStop(0.55, '#100c12'); glow.addColorStop(1, '#060408');
      g.fillStyle = glow; g.fillRect(0, 0, W, H);
    }
  }
  // The game's name: the campaign's logo, or the title in big pixel letters (three times the font).
  function heading(y) {
    if (images.logo) {
      const img = images.logo, k = Math.min(240 / img.width, 56 / img.height, 4), w = Math.round(img.width * k), h = Math.round(img.height * k);
      g.save(); g.imageSmoothingEnabled = k !== Math.floor(k); g.drawImage(img, kit.ox + 160 - w / 2, kit.oy + y, w, h); g.restore();
    } else {
      kit.text(title.toUpperCase(), 160, y + 2, '#5a3a1e', { align: 'center', scale: 3 }); // a dark copy, one pixel down and right, is the shadow
      kit.text(title.toUpperCase(), 159, y + 1, GOLD, { align: 'center', scale: 3, shadow: true });
    }
  }
  const panel = (name) => {
    kit.fill(0, 0, 320, 180, 'rgba(16,13,11,0.93)');
    kit.window(0, 0, 320, 180, 'rgba(16,13,11,0.93)');
    kit.text(name.toUpperCase(), 160, 8, GOLD, { align: 'center' });
    kit.fill(8, 20, 304, 1, THEME.frameLo);
  };
  function run(draw, { back = null, keyboard = null } = {}) {
    keys(ev => {
      if (ev.key === 'Escape' && back) { back(); return true; }
      return keyboard ? keyboard(ev) : false;
    });
    stage.show(now => { backdrop(); const [x, y] = origin(); kit.origin(x, y); draw(now); });
  }

  // Up and down choose a button, Enter presses it.
  function chooser(count, isEnabled, press) {
    let at = 0;
    const move = step => { for (let n = 0; n < count; n++) { at = (at + step + count) % count; if (isEnabled(at)) return; } };
    return {
      get at() { return at; }, set(i) { if (isEnabled(i)) at = i; }, ensure() { if (!isEnabled(at)) move(1); },
      key(ev) {
        if (ev.key === 'ArrowDown') { move(1); return true; }
        if (ev.key === 'ArrowUp') { move(-1); return true; }
        if (ev.key === 'Enter' || ev.key === ' ') { press(at); return true; }
        return false;
      },
    };
  }

  // A button pressed twice within three seconds (deleting, replacing): the first press changes its words.
  const asked = new Map();
  const twice = (id, act) => () => { if ((asked.get(id) ?? 0) > performance.now()) { asked.delete(id); act(); } else asked.set(id, performance.now() + 3000); };
  const isAsked = id => (asked.get(id) ?? 0) > performance.now();

  return {
    main({ latest = null } = {}) {
      return new Promise(resolve => {
        const choices = [['Continue', 'continue', !!latest], ['New game', 'new', true], ['Load game', 'load', !!latest]];
        const pick = chooser(3, i => choices[i][2], i => resolve(choices[i][1]));
        pick.set(latest ? 0 : 1); pick.ensure();
        const sub = latest ? (({ name, detail }) => `${name} - ${detail}`)(describe(latest)) : '';
        run(() => {
          heading(22);
          choices.forEach(([label, answer, enabled], i) => {
            const y = 80 + i * 28;
            kit.button(70, y, 180, 24, i === 0 && sub ? '' : label, { disabled: !enabled, selected: pick.at === i && enabled, key: `main:${answer}`, title: label, tap: () => resolve(answer) });
            if (i === 0 && sub) { kit.text(label, 160, y + 4, THEME.text, { align: 'center' }); kit.text(kit.fitText(sub, 170), 160, y + 13, THEME.dim, { align: 'center' }); }
          });
        }, { keyboard: ev => pick.key(ev) });
      });
    },

    // The saves, newest first. Pick one to load (or, with `replace`, to overwrite: that asks twice). Each can be deleted, which also
    // asks twice.
    saves({ slots, remove, replace = false }) {
      return new Promise(resolve => {
        let list = [...slots];
        const rowHeight = 26;
        const pick = chooser(Math.max(1, list.length), () => list.length > 0, i => { const s = list[i]; if (s) choose(s)(); });
        const choose = s => (replace ? twice(`pick:${s.slot}`, () => resolve(s.slot)) : () => resolve(s.slot));
        run(() => {
          panel(replace ? 'Replace a save' : 'Load game');
          if (replace) kit.text('Every save slot is in use. Choose one to start over in.', 160, 26, THEME.dim, { align: 'center' });
          const top = replace ? 38 : 26;
          kit.scroll('title-saves', 8, top, 304, 150 - top, width => {
            if (!list.length) { kit.text('No saved games.', 4, 6, THEME.dim); return 16; }
            list.forEach((s, i) => {
              const { name, detail } = describe(s), y = 1 + i * rowHeight, id = `pick:${s.slot}`;
              kit.fill(1, y, width - 1, rowHeight - 2, THEME.panelHi); kit.outline(1, y, width - 1, rowHeight - 2, pick.at === i ? THEME.select : THEME.frameHi);
              kit.text(kit.fitText(isAsked(id) ? 'Press again to replace' : name, width - 82), 6, y + 4, isAsked(id) ? THEME.select : THEME.text);
              kit.text(kit.fitText(detail, width - 82), 6, y + 14, THEME.dim);
              kit.hit(1, y, width - 70, rowHeight - 2, { key: id, title: name, tap: () => { pick.set(i); choose(s)(); } });
              const delId = `del:${s.slot}`;
              kit.button(width - 66, y + 3, 62, rowHeight - 8, isAsked(delId) ? 'Sure?' : 'Delete', { key: delId, primary: isAsked(delId), title: `Delete ${name}`, tap: twice(delId, () => {
                remove(s.slot); list = list.filter(x => x !== s);
                if (replace && list.length < slots.length) resolve(s.slot); // a slot is free now: use it
              }) });
            });
            return 2 + list.length * rowHeight;
          });
          kit.button(8, 156, 70, 18, 'Back', { tap: () => resolve(null) });
        }, { back: () => resolve(null), keyboard: ev => pick.key(ev) });
      });
    },

    // Name the hero and spend `points` on the attributes (`base` cannot be lowered). `derive(attrs)` gives the stats.
    character({ base, points, derive, name = 'Hero' }) {
      return new Promise(resolve => {
        const attrKeys = Object.keys(base), spent = Object.fromEntries(attrKeys.map(k => [k, 0]));
        const used = () => attrKeys.reduce((n, k) => n + spent[k], 0);
        const attrs = () => Object.fromEntries(attrKeys.map(k => [k, base[k] + spent[k]]));
        const start = derive(base);
        let active = null;
        const done = value => { field?.close(); field = null; resolve(value); };
        const finishNow = () => done({ name: field.value.trim() || name, spent: { ...spent } });
        field = stage.edit({ value: name, maxLength: 20, label: 'Hero name', onEnter: finishNow });
        field.focus(); field.selectAll();
        const change = (key, delta) => { if (delta < 0 ? spent[key] > 0 : used() < points) spent[key] += delta; active = key; };
        run(now => {
          if (!field) return; // answered: the next screen takes over on the next frame
          panel('Create your hero');
          // the hero
          kit.frame(8, 24, 52, 100, { fill: '#0d0b10', edge: THEME.frame });
          if (hero) kit.image(hero, 10, 26);
          // the name
          kit.text('Name', 68, 27, THEME.dim);
          const text = field.value, [from, to] = field.selection, focused = field.focused;
          kit.fill(100, 23, 212, 14, '#050405'); kit.outline(100, 23, 212, 14, focused ? '#ffe0a0' : THEME.frame);
          kit.hit(100, 23, 212, 14, { key: 'name', title: 'Name your hero', tap: () => field.focus() });
          if (focused && text && from === 0 && to === text.length) kit.fill(103, 25, kit.width(text) + 2, 10, '#2a58c8'); // everything selected: the first key replaces it
          kit.text(text, 104, 27, THEME.white);
          if (focused && from === to && Math.floor(now / 500) % 2 === 0) kit.fill(104 + from * 5, 26, 1, 9, '#ffe0a0');
          // the points
          const rest = points - used(), now2 = attrs(), derived = derive(now2);
          if (points) {
            kit.text('Points', 68, 43, THEME.dim);
            for (let i = 0; i < points; i++) kit.fill(106 + i * 7, 44, 5, 5, i < rest ? GOLD : THEME.wellEdge);
            kit.text(`${rest} left`, 222, 43, rest ? GOLD : THEME.dim, { align: 'right' });
          }
          // the attributes
          attrKeys.forEach((key, i) => {
            const info = ATTRIBUTES[key] ?? { label: key, about: '' }, y = 56 + i * 16;
            kit.text(info.label, 68, y + 3, active === key ? THEME.select : INK);
            kit.button(140, y, 16, 14, '-', { disabled: spent[key] === 0, key: `less:${key}`, title: `Lower ${info.label}`, tap: () => change(key, -1) });
            kit.text(String(now2[key]), 170, y + 3, spent[key] > 0 ? THEME.good : THEME.white, { align: 'center' });
            kit.button(184, y, 16, 14, '+', { disabled: rest === 0, key: `more:${key}`, title: `Raise ${info.label}`, tap: () => change(key, 1) });
            kit.hit(68, y, 70, 14, { key: `attr:${key}`, title: info.about, tap: () => { active = key; } });
          });
          // what the chosen attribute is for, and the stats a point in it raises
          let about = 'Spend your points where your strength should lie.';
          if (active) {
            const more = derive({ ...now2, [active]: now2[active] + 2 }), raised = STATS.filter(([k]) => k in more && more[k] !== derived[k]).map(([, label]) => label);
            about = `${ATTRIBUTES[active]?.about ?? ''}${raised.length ? ` Raises ${raised.join(', ')}.` : ''}`;
          }
          kit.paragraph(about, 68, 124, 150, THEME.dim, { max: 4 });
          // the stats
          kit.frame(226, 40, 86, 96);
          kit.text('Stats', 231, 44, GOLD);
          STATS.filter(([k]) => k in start).forEach(([k, label], i) => {
            const y = 57 + i * 13, d = derived[k] - start[k];
            kit.text(label, 231, y, THEME.dim);
            if (d) { const t = `${d > 0 ? '+' : ''}${d}`; kit.text(t, 308, y, THEME.good, { align: 'right' }); kit.text(String(derived[k]), 304 - kit.width(t), y, THEME.white, { align: 'right' }); }
            else kit.text(String(derived[k]), 308, y, THEME.white, { align: 'right' });
          });
          // the buttons
          kit.button(8, 156, 60, 18, 'Back', { tap: () => done(null) });
          kit.button(72, 156, 60, 18, 'Reset', { disabled: used() === 0, tap: () => { attrKeys.forEach(k => { spent[k] = 0; }); } });
          kit.button(202, 156, 110, 18, rest ? 'Begin anyway' : 'Begin', { primary: true, tap: finishNow });
        }, { back: () => done(null) });
      });
    },

    // Shown while the first level loads, after a choice is made.
    loading(text = 'Loading...') {
      run(() => { heading(40); kit.text(text, 160, 110, MUTED, { align: 'center' }); });
    },
    fail(message) {
      run(() => {
        panel('Something went wrong');
        kit.paragraph(message, 14, 32, 292, THEME.text, { max: 8 });
        kit.button(110, 150, 100, 20, 'Reload', { primary: true, tap: () => location.reload() });
      });
    },
    close() {
      keys(null); stage.show(null);
      field?.close(); field = null;
    },
  };
}
