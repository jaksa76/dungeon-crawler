// The screens before the game: the main menu, the list of saves to load, and character creation. They cover the whole
// page (the game's frame is not laid out yet) and bring their own stylesheet, title-screen.css.
//
//   const screen = createTitleScreen({ title, logo?, background? })
//   await screen.main({ latest })        -> 'continue' | 'new' | 'load'   (latest: the newest save, or null)
//   await screen.saves({ slots, remove, replace? }) -> slot id, or null for Back
//   await screen.character({ base, points, derive, name }) -> { name, spent }, or null for Back
//   screen.loading() / screen.fail(message) / screen.close()
//
// `logo` and `background` are image URLs a campaign can give; without a logo the title is set in the pixel font.
// Nothing is added to the page until a screen is shown, so close() is safe to call either way.
import { loadPanelFrame } from './pixel-skin.js';

const STYLE_URL = new URL('./title-screen.css', import.meta.url);
const SPRITE_URL = new URL('../assets/ui/hero-sprite.png', import.meta.url);

const ATTRIBUTES = {
  strength: { label: 'Strength', about: 'Might of arm. Every blow lands harder.' },
  vitality: { label: 'Vitality', about: 'Toughness. You can take more punishment.' },
  intellect: { label: 'Intellect', about: 'Learning and will. A deeper well of mana.' },
  agility: { label: 'Agility', about: 'Speed and balance. Harder to hit, surer to strike.' },
};
const STATS = [['maxHp', 'Health'], ['maxMp', 'Mana'], ['attack', 'Attack'], ['defence', 'Defence'], ['accuracy', 'Accuracy'], ['evasion', 'Evasion']];

const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};
const button = (text, onclick, className) => { const b = el('button', className, text); b.type = 'button'; b.onclick = onclick; return b; };

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

// Up and down move between the buttons of a menu, as on a console.
function arrowNavigation(container, selector = 'button:not(:disabled)') {
  container.addEventListener('keydown', ev => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    const items = [...container.querySelectorAll(selector)];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    items[(i + (ev.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    ev.preventDefault();
  });
}

export function createTitleScreen({ title, logo = null, background = null }) {
  let root = null, ready = null, onKey = null;
  const fit = () => {
    // One pixel size for the screens: whole screen pixels per font pixel, so the 8-pixel font stays sharp.
    const px = Math.max(2, Math.min(4, Math.floor(Math.min(innerWidth / 480, innerHeight / 300))));
    root?.style.setProperty('--tpx', px);
  };

  function mount() {
    if (root) return ready;
    const sheet = el('link'); sheet.rel = 'stylesheet'; sheet.href = STYLE_URL.href;
    const styled = new Promise(resolve => { sheet.onload = sheet.onerror = resolve; });
    document.head.append(sheet);
    root = el('div', 'rpg-title'); root.hidden = true;
    if (background) { root.style.setProperty('--title-bg', `url("${new URL(background, location.href).href}")`); root.classList.add('has-bg'); }
    document.body.append(root);
    document.documentElement.classList.add('rpg-title-open');
    fit(); addEventListener('resize', fit);
    ready = Promise.all([styled, loadPanelFrame().catch(() => {})])
      .then(() => document.fonts?.load(`16px "RPG Pixel"`).catch(() => {}))
      .then(() => { root.hidden = false; });
    return ready;
  }

  // Swap in one screen's content. Escape runs `back`, if the screen has one.
  async function show(content, { back = null } = {}) {
    await mount();
    root.replaceChildren(content);
    if (onKey) removeEventListener('keydown', onKey, true);
    onKey = ev => { if (ev.key === 'Escape' && back) { ev.preventDefault(); back(); } };
    addEventListener('keydown', onKey, true);
  }

  function heading() {
    const h = el('h1', 'rpg-title-name');
    if (logo) { const img = el('img'); img.src = new URL(logo, location.href).href; img.alt = title; h.append(img); }
    else h.textContent = title.toUpperCase();
    return h;
  }

  function panel(headingText, className = '') {
    const box = el('section', `rpg-title-panel ${className}`);
    box.setAttribute('role', 'dialog');
    const h = el('h2', '', headingText.toUpperCase()); h.id = `rpg-title-${Math.random().toString(36).slice(2)}`;
    box.setAttribute('aria-labelledby', h.id); box.append(h);
    return box;
  }

  return {
    main({ latest = null } = {}) {
      return new Promise(resolve => {
        const view = el('div', 'rpg-title-main');
        const nav = el('nav', 'rpg-title-menu'); nav.setAttribute('aria-label', 'Main menu');
        const cont = button('Continue', () => resolve('continue'));
        if (latest) { const { name, detail } = describe(latest); cont.append(el('small', '', `${name} · ${detail}`)); }
        cont.disabled = !latest;
        const fresh = button('New game', () => resolve('new'));
        const load = button('Load game', () => resolve('load')); load.disabled = !latest;
        nav.append(cont, fresh, load); arrowNavigation(nav);
        view.append(heading(), nav);
        show(view).then(() => (latest ? cont : fresh).focus({ preventScroll: true }));
      });
    },

    // The saves, newest first. Pick one to load (or, with `replace`, to overwrite: that asks twice). Each can be
    // deleted, which also asks twice.
    saves({ slots, remove, replace = false }) {
      return new Promise(resolve => {
        let list = [...slots];
        const box = panel(replace ? 'Replace a save' : 'Load game', 'rpg-title-saves');
        const note = el('p', 'rpg-title-note', replace ? 'Every save slot is in use. Choose one to start over in.' : '');
        const rows = el('ul', 'rpg-title-slots');
        const back = button('Back', () => resolve(null));
        const footer = el('footer'); footer.append(back);
        box.append(...(replace ? [note] : []), rows, footer);
        const twice = (b, sure, act) => () => {
          if (b.dataset.sure) return act();
          b.dataset.sure = '1'; const old = [...b.childNodes];
          b.replaceChildren(sure);
          setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.replaceChildren(...old); } }, 3000);
        };
        function draw() {
          rows.replaceChildren();
          if (!list.length) rows.append(el('li', 'rpg-title-empty', 'No saved games.'));
          for (const s of list) {
            const { name, detail } = describe(s);
            const li = el('li'), pick = el('button', 'rpg-title-slot'); pick.type = 'button';
            pick.append(el('span', '', name), el('small', '', detail));
            pick.onclick = replace ? twice(pick, 'Press again to replace', () => resolve(s.slot)) : () => resolve(s.slot);
            const del = button('Delete', null, 'rpg-title-delete');
            del.setAttribute('aria-label', `Delete ${name}`);
            del.onclick = twice(del, 'Sure?', () => {
              remove(s.slot); list = list.filter(x => x !== s);
              if (replace && list.length < slots.length) return resolve(s.slot); // a slot is free now: use it
              draw(); (rows.querySelector('button') ?? back).focus();
            });
            li.append(pick, del); rows.append(li);
          }
        }
        draw(); arrowNavigation(rows, '.rpg-title-slot');
        show(box, { back: () => resolve(null) }).then(() => (rows.querySelector('button') ?? back).focus({ preventScroll: true }));
      });
    },

    // Name the hero and spend `points` on the attributes (`base` cannot be lowered). `derive(attrs)` gives the stats.
    character({ base, points, derive, name = 'Hero' }) {
      return new Promise(resolve => {
        const keys = Object.keys(base);
        const spent = Object.fromEntries(keys.map(k => [k, 0]));
        const used = () => keys.reduce((n, k) => n + spent[k], 0);
        const attrs = () => Object.fromEntries(keys.map(k => [k, base[k] + spent[k]]));
        const start = derive(base);

        const box = panel('Create your hero', 'rpg-creation-panel');
        const body = el('div', 'rpg-cc-body');
        // The hero, at a whole number of screen pixels per art pixel.
        const figure = el('figure', 'rpg-cc-figure');
        const sprite = el('img'); sprite.src = SPRITE_URL.href; sprite.alt = '';
        figure.append(sprite);

        const main = el('div', 'rpg-cc-main');
        const nameRow = el('label', 'rpg-cc-name');
        const field = el('input'); field.type = 'text'; field.maxLength = 20; field.value = name; field.spellcheck = false; field.autocomplete = 'off';
        nameRow.append(el('span', 'rpg-cc-caption', 'Name'), field);

        const pointsRow = el('div', 'rpg-cc-points');
        const pips = el('span', 'rpg-cc-pips'); pips.setAttribute('aria-hidden', 'true');
        const left = el('span', 'rpg-cc-left'); left.setAttribute('aria-live', 'polite');
        pointsRow.append(el('span', 'rpg-cc-caption', 'Points'), pips, left);

        const list = el('ul', 'rpg-cc-attrs');
        const about = el('p', 'rpg-cc-about'), aboutText = el('span'), aboutRaises = el('span', 'rpg-cc-raises');
        about.append(aboutText, aboutRaises);
        let active = null;
        // The attribute in focus (or under the pointer): what it is, and which stats a point in it raises.
        function describeActive() {
          const r = rows.find(x => x.key === active);
          if (!r) { aboutText.textContent = 'Spend your points where your strength should lie.'; aboutRaises.textContent = ''; return; }
          const now = attrs(), derived = derive(now), more = derive({ ...now, [r.key]: now[r.key] + 2 });
          const raised = STATS.filter(([k]) => k in more && more[k] !== derived[k]).map(([, label]) => label);
          aboutText.textContent = r.info.about;
          aboutRaises.textContent = raised.length ? `Raises ${raised.join(', ')}.` : '';
        }
        const rows = keys.map(key => {
          const info = ATTRIBUTES[key] ?? { label: key, about: '' };
          const li = el('li', 'rpg-cc-attr'); li.dataset.key = key;
          const minus = button('-', () => change(key, -1), 'rpg-cc-step');
          const plus = button('+', () => change(key, 1), 'rpg-cc-step');
          minus.setAttribute('aria-label', `Lower ${info.label}`); plus.setAttribute('aria-label', `Raise ${info.label}`);
          const value = el('span', 'rpg-cc-value');
          li.append(el('span', 'rpg-cc-label', info.label), minus, value, plus);
          const explain = () => { active = key; describeActive(); list.querySelectorAll('.rpg-cc-attr').forEach(r => r.classList.toggle('is-active', r === li)); };
          li.addEventListener('focusin', explain); li.addEventListener('pointerenter', explain);
          return { key, li, minus, plus, value, info };
        });
        list.append(...rows.map(r => r.li));
        // Left and right change the focused attribute; up and down move between them.
        list.addEventListener('keydown', ev => {
          const i = rows.findIndex(r => r.li.contains(document.activeElement));
          if (i < 0) return;
          if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { change(rows[i].key, ev.key === 'ArrowLeft' ? -1 : 1); ev.preventDefault(); }
          if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
            const r = rows[(i + (ev.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length];
            (r.plus.disabled ? r.minus.disabled ? r.li.querySelector('button') : r.minus : r.plus).focus(); ev.preventDefault();
          }
        });
        main.append(nameRow, pointsRow, list, about);
        body.append(figure, main);

        const stats = el('dl', 'rpg-cc-stats');
        const statCells = STATS.filter(([k]) => k in start).map(([k, label]) => {
          const cell = el('div'), dd = el('dd'), value = el('span'), delta = el('span', 'rpg-cc-delta');
          dd.append(value, delta); cell.append(el('dt', '', label), dd); stats.append(cell);
          return { k, value, delta };
        });

        const footer = el('footer');
        const backBtn = button('Back', () => resolve(null));
        const reset = button('Reset', () => { keys.forEach(k => { spent[k] = 0; }); update(); });
        const begin = button('Begin', () => finish(), 'rpg-title-primary');
        footer.append(backBtn, reset, begin);
        box.append(body, stats, footer);

        function change(key, delta) {
          if (delta < 0 ? spent[key] > 0 : used() < points) { spent[key] += delta; update(); }
        }
        function update() {
          const now = attrs(), derived = derive(now), rest = points - used();
          for (const r of rows) {
            r.value.textContent = now[r.key];
            r.li.classList.toggle('is-raised', spent[r.key] > 0);
            r.minus.disabled = spent[r.key] === 0; r.plus.disabled = rest === 0;
          }
          pips.replaceChildren(...Array.from({ length: points }, (_, i) => el('i', i < rest ? 'is-free' : '')));
          left.textContent = `${rest} left`;
          describeActive();
          for (const c of statCells) {
            c.value.textContent = derived[c.k];
            const d = derived[c.k] - start[c.k];
            c.delta.textContent = d ? `${d > 0 ? '+' : ''}${d}` : '';
          }
          begin.textContent = rest ? 'Begin anyway' : 'Begin';
          reset.disabled = used() === 0;
        }
        function finish() { resolve({ name: field.value.trim() || name, spent: { ...spent } }); }
        field.addEventListener('keydown', ev => { if (ev.key === 'Enter') finish(); });
        if (!points) pointsRow.hidden = true;
        update();
        show(box, { back: () => resolve(null) }).then(() => { field.focus({ preventScroll: true }); field.select(); });
      });
    },

    // Shown while the first level loads, after a choice is made.
    loading(text = 'Loading...') {
      if (!root) return;
      const view = el('div', 'rpg-title-main'); view.append(heading(), el('p', 'rpg-title-loading', text));
      show(view);
    },
    fail(message) {
      if (!root) return;
      const box = panel('Something went wrong'); box.append(el('p', 'rpg-title-note', message));
      const footer = el('footer'); footer.append(button('Reload', () => location.reload())); box.append(footer);
      show(box);
    },
    close() {
      if (!root) return;
      removeEventListener('resize', fit); if (onKey) removeEventListener('keydown', onKey, true);
      root.remove(); root = null; ready = null;
      document.documentElement.classList.remove('rpg-title-open');
    },
  };
}
