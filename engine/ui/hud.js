// The HUD, drawn on the game's one canvas (see docs/engine/ui.md). On the desktop it is a 320x60 bar under the scene:
// the hero's head, health, mana and experience, six menu buttons, the quick bar, the minimap. On a phone held sideways the
// same things sit in two 40x180 rails on either side of the scene, and the d-pad is a pair of drag widgets: a stick that
// steps and strafes, and a pill that turns.
//
//   const hud = createHud({ kit, icons, portrait, hero, world, quick, menus, command, say, colourOf, wallet, magic })
//   hud.draw(state, layout)   // state: { tileX, tileZ, yaw } (the minimap's, which slides); layout: LAYOUTS.desktop | .mobile
//   hud.rects(layout)         // where everything is, in canvas pixels (for tests)

import { THEME } from './canvas.js';
import { HEAD_X } from './head.js';
import { VIEW_H } from './screen.js';

// The icons the HUD's menu buttons use (the second is the help's when the game has no spells).
export const MENU_ICONS = ['character', 'spell', 'search', 'journal', 'bag', 'fullscreen', 'settings'];

const HOLD_MS = 350, REPEAT_MS = 220, DEAD = 5; // a stick repeats like a held button: after a pause, then steadily

// Where everything is, in canvas pixels, for a layout.
export function hudRects(layout, slotCount = 8) {
  if (layout.name === 'mobile') {
    const left = i => ({ x: 1 + 19 * (i % 2), y: 63 + 19 * (i >> 1), w: 18, h: 18 }), right = i => ({ x: 362 + 19 * (i % 2), y: 40 + 19 * (i >> 1), w: 18, h: 18 });
    return {
      head: { x: 3, y: 3, w: 34, h: 30 }, hp: { x: 3, y: 36, w: 34, h: 9 }, mp: { x: 3, y: 46, w: 34, h: 9 }, xp: { x: 3, y: 56, w: 34, h: 4 },
      buttons: Array.from({ length: 6 }, (_, i) => left(i)), slots: Array.from({ length: slotCount }, (_, i) => right(i)),
      minimap: { x: 363, y: 3, w: 34, h: 34 },
      move: { x: 0, y: 122, w: 40, h: 58, cx: 20, cy: 150 }, turn: { x: 360, y: 122, w: 40, h: 58, cx: 380, cy: 150 },
      numbers: false,
    };
  }
  const y0 = VIEW_H;
  return {
    head: { x: 5, y: y0 + 6, w: 34, h: 30 }, hp: { x: 43, y: y0 + 6, w: 70, h: 11 }, mp: { x: 43, y: y0 + 19, w: 70, h: 11 }, xp: { x: 43, y: y0 + 32, w: 70, h: 11 },
    buttons: Array.from({ length: 6 }, (_, i) => ({ x: 117 + 25 * i, y: y0 + 7, w: 24, h: 18 })),
    slots: Array.from({ length: slotCount }, (_, i) => ({ x: 117 + 19 * i, y: y0 + 29, w: 18, h: 18 })),
    minimap: { x: 272, y: y0 + 8, w: 44, h: 44 },
    numbers: true,
  };
}

export function createHud({ kit, icons, portrait, hero, world, quick, menus, command, say, colourOf = () => THEME.white, wallet = null, magic = false }) {
  const g = kit.g;
  // The six menu buttons, in order. Without spells the second shows the help instead.
  const buttons = [
    { kind: 'character', icon: 'character', label: 'Character', run: () => menus.menu.character() },
    magic ? { kind: 'spells', icon: 'spell', label: 'Spells', run: () => menus.menu.spells() } : { kind: 'help', icon: 'search', label: 'Help', run: () => menus.menu.help() },
    { kind: 'journal', icon: 'journal', label: 'Journal', run: () => menus.menu.journal() },
    { kind: 'inventory', icon: 'bag', label: 'Satchel', run: () => menus.menu.inventory() },
    { kind: 'fullscreen', icon: 'fullscreen', label: 'Full screen', run: () => menus.menu.fullscreen() },
    { kind: 'settings', icon: 'settings', label: 'Settings', run: () => menus.menu.settings() },
  ];
  const outlineOf = v => (v.kind === 'spell' ? { colour: colourOf(v.magicType), tier: 2 } : v.enchant ? { colour: colourOf(v.enchant.type), tier: v.enchant.tier ?? 1 } : null);

  // ---- the quick bar
  function drawSlot(r, i, v) {
    const hot = kit.state.drop === `quick:${i}`;
    kit.fill(r.x, r.y, r.w, r.h, '#120d12');
    kit.outline(r.x, r.y, r.w, r.h, hot ? '#ffe0a0' : v?.worn ? '#d8a840' : kit.state.pressed === `quick:${i}` ? THEME.frameHi : '#43332b');
    if (!v) return;
    kit.clip(r.x + 1, r.y + 1, r.w - 2, r.h - 2, () => kit.icon(icons, v.icon, r.x + 1, r.y + 1, 16, { outline: outlineOf(v), alpha: !v.usable && !v.worn ? 0.4 : 1 }));
    if (v.cooldown > 0) kit.fill(r.x + 1, r.y + 1, r.w - 2, Math.ceil((r.h - 2) * v.cooldown), 'rgba(8,6,12,0.65)'); // a spell cooling down: the shade drains upwards
    const number = v.kind === 'spell' ? String(v.cost) : v.count > 1 || (v.count === 0 && !v.worn) ? String(v.count) : '';
    if (number) kit.text(number, r.x + r.w - 1, r.y + r.h - kit.font.h, v.kind === 'spell' ? (v.reason === 'mana' ? THEME.bad : THEME.mana) : v.count === 0 ? THEME.bad : '#fff3db', { align: 'right', shadow: true });
  }
  function slotRegion(r, i, v) {
    kit.hit(r.x, r.y, r.w, r.h, {
      key: `quick:${i}`, title: v ? `${i + 1}: ${v.name}` : `${i + 1}: empty slot`,
      tap: () => quick.activate(i),
      hold: () => { const d = quick.describe(i); say(d ? `${d.name}: ${d.text}` : 'An empty slot. Drag an item or a spell here.'); },
      drag: () => (v ? { quickSlot: i, ref: { kind: v.kind, id: v.id }, name: v.name, draw: (k, x, y) => k.icon(icons, v.icon, Math.round(x) - 8, Math.round(y) - 8, 16, { outline: outlineOf(v) }),
        dropAway: () => quick.clear(i) } : null),
      accepts: p => p.quickSlot !== undefined ? p.quickSlot !== i : !!p.ref,
      drop: p => {
        if (p.quickSlot !== undefined) { quick.swap(p.quickSlot, i); return true; }
        const ok = quick.set(i, p.ref);
        say(ok ? `${p.name} is on the quick bar, slot ${i + 1}.` : `${p.name} cannot go on the quick bar.`);
        return ok;
      },
    });
  }

  // ---- the sticks: the move stick steps and strafes, the pill turns. Pressing one takes the pointer over until it lifts.
  // The direction is where the finger is from the widget's centre; it repeats like a held button.
  const stickState = { move: null, turn: null }; // { dx, dy } while pressed
  function makeStick(name, rect, commandFor) {
    return kit.hit(rect.x, rect.y, rect.w, rect.h, {
      key: `stick:${name}`, title: name === 'move' ? 'Step and strafe' : 'Turn',
      press: pt => {
        let current = null, hold = 0, repeat = 0;
        const stop = () => { clearTimeout(hold); clearInterval(repeat); hold = repeat = 0; };
        const update = p => {
          const dx = p.x - rect.cx, dy = p.y - rect.cy;
          stickState[name] = { dx, dy };
          const next = commandFor(dx, dy);
          if (next === current) return;
          stop(); current = next;
          if (!next) return;
          command(next);
          hold = setTimeout(() => { repeat = setInterval(() => command(next), REPEAT_MS); }, HOLD_MS);
        };
        update(pt);
        return { move: update, up: () => { stop(); stickState[name] = null; } };
      },
    });
  }
  const moveCommand = (dx, dy) => (Math.hypot(dx, dy) < DEAD ? null : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'strafeLeft' : 'strafeRight') : (dy < 0 ? 'forward' : 'back'));
  const turnCommand = dx => (Math.abs(dx) < 4 ? null : dx < 0 ? 'left' : 'right');
  function drawSticks(r) {
    const knob = (s, limit) => { // where the knob is drawn: where the finger is, held inside the widget
      if (!s) return { x: 0, y: 0 };
      const d = Math.hypot(s.dx, s.dy), k = d > limit ? limit / d : 1;
      return { x: Math.round(s.dx * k), y: Math.round(s.dy * k) };
    };
    const m = r.move, k1 = knob(stickState.move, 9), tri = (cx, cy, d, c) => {
      kit.fill(cx - (d === 'l' ? 1 : d === 'r' ? 0 : 2), cy - (d === 'u' ? 1 : d === 'd' ? 0 : 2), d === 'l' || d === 'r' ? 2 : 5, d === 'u' || d === 'd' ? 2 : 5, c); // a small chevron: two pixels thick
    };
    kit.ring(m.cx, m.cy, 17, '#120d16', THEME.frame);
    for (const [dx, dy, d] of [[0, -13, 'u'], [0, 13, 'd'], [-13, 0, 'l'], [13, 0, 'r']]) tri(m.cx + dx, m.cy + dy, d, THEME.frameHi);
    kit.ring(m.cx + k1.x, m.cy + k1.y, 7, '#46342c', THEME.frameHi); kit.disc(m.cx + k1.x, m.cy + k1.y, 3, '#7a5c48');
    const t = r.turn, k2 = knob(stickState.turn && { dx: stickState.turn.dx, dy: 0 }, 9);
    kit.capsule(t.cx - 18, t.cy - 12, 36, 24, '#120d16', THEME.frame);
    kit.fill(t.cx - 15, t.cy - 1, 3, 2, THEME.frameHi); kit.fill(t.cx + 12, t.cy - 1, 3, 2, THEME.frameHi);
    kit.ring(t.cx + k2.x, t.cy, 7, '#46342c', THEME.frameHi); kit.disc(t.cx + k2.x, t.cy, 3, '#7a5c48');
    makeStick('move', m, moveCommand); makeStick('turn', t, turnCommand);
  }

  // ---- the minimap: the level around the player, sliding as they move. tileX and tileZ may be fractional.
  function drawMinimap(r, state) {
    kit.frame(r.x, r.y, r.w, r.h, { fill: '#100e10', edge: THEME.frame });
    const cell = r.w >= 44 ? 5 : 4, tile = cell - 1, cx = r.x + Math.floor(r.w / 2), cy = r.y + Math.floor(r.h / 2), reach = Math.ceil(r.w / cell / 2) + 1;
    const ux = Math.round(state.tileX), uz = Math.round(state.tileZ);
    kit.clip(r.x + 1, r.y + 1, r.w - 2, r.h - 2, () => {
      for (let tz = uz - reach; tz <= uz + reach; tz++) for (let tx = ux - reach; tx <= ux + reach; tx++) {
        const t = world.typeAt(tx, tz); if (!t) continue;
        kit.fill(Math.round(cx + (tx - state.tileX) * cell - tile / 2), Math.round(cy + (tz - state.tileZ) * cell - tile / 2), tile, tile, t.wall ? '#3b3335' : '#95816a');
      }
      const dot = Math.max(2, cell >> 1), o = Math.round((tile - dot) / 2);
      for (const b of world.billboards) kit.fill(Math.round(cx + (b.entity.x - state.tileX) * cell - tile / 2) + o, Math.round(cy + (b.entity.z - state.tileZ) * cell - tile / 2) + o, dot, dot, '#e9b65e');
      // The player: an arrow turning with them.
      g.save(); g.translate(cx, cy); g.rotate(-state.yaw); g.fillStyle = '#ff6348'; g.fillRect(-1, -3, 2, 5); g.fillRect(-2, 0, 4, 2); g.restore();
    });
  }

  // ---- the hero
  function drawHero(rects) {
    const h = rects.head, p = hero.progress;
    kit.frame(h.x, h.y, h.w, h.h, { fill: '#0d0b10', edge: THEME.frame });
    g.imageSmoothingEnabled = false;
    g.drawImage(portrait, HEAD_X - 16, 0, 32, 28, h.x + 1, h.y + 1, 32, 28);
    kit.hit(h.x, h.y, h.w, h.h, { key: 'head', title: 'Character', tap: () => menus.menu.character() });
    if (hero.unspent > 0) { // skill points to spend: a gold plus
      const x = h.x + h.w - 9, y = h.y + 2;
      kit.fill(x, y, 7, 7, THEME.select); kit.fill(x + 1, y + 1, 5, 5, '#241711'); kit.fill(x + 2, y + 3, 3, 1, '#ffe2a0'); kit.fill(x + 3, y + 2, 1, 3, '#ffe2a0');
    }
    if (rects.numbers) { // the bars carry numbers, and the level sits under the head
      kit.bar(rects.hp.x, rects.hp.y, rects.hp.w, rects.hp.h, hero.hp, hero.maxHp, { fill: THEME.hp, hi: THEME.hpHi, label: `${hero.hp}/${hero.maxHp}` });
      kit.bar(rects.mp.x, rects.mp.y, rects.mp.w, rects.mp.h, hero.mp, hero.maxMp, { fill: THEME.mp, hi: THEME.mpHi, label: `${hero.mp}/${hero.maxMp}` });
      if (p) kit.bar(rects.xp.x, rects.xp.y, rects.xp.w, rects.xp.h, p.to === null ? 1 : p.xp - p.from, p.to === null ? 1 : p.to - p.from, { fill: THEME.xp, hi: THEME.xpHi, label: p.to === null ? 'MAX' : `${p.xp}/${p.to}` });
      if (p) kit.text(`LV ${p.level}`, h.x + h.w / 2, h.y + h.h + 4, THEME.xpHi, { align: 'center' });
      if (wallet) kit.text(`Gold ${wallet.amount}`, rects.hp.x, rects.xp.y + rects.xp.h + 4, THEME.dim);
    } else {
      kit.bar(rects.hp.x, rects.hp.y, rects.hp.w, rects.hp.h, hero.hp, hero.maxHp, { fill: THEME.hp, hi: THEME.hpHi, label: String(hero.hp) });
      kit.bar(rects.mp.x, rects.mp.y, rects.mp.w, rects.mp.h, hero.mp, hero.maxMp, { fill: THEME.mp, hi: THEME.mpHi, label: String(hero.mp) });
      if (p) { kit.bar(rects.xp.x, rects.xp.y, rects.xp.w, rects.xp.h, p.to === null ? 1 : p.xp - p.from, p.to === null ? 1 : p.to - p.from, { fill: THEME.xp, hi: THEME.xpHi }); kit.text(`L${p.level}`, h.x + 2, h.y + h.h - 9, THEME.xpHi, { shadow: true }); }
    }
    kit.hit(rects.hp.x, rects.hp.y, rects.hp.w, rects.xp.y + rects.xp.h - rects.hp.y, { key: 'vitals', title: `Health ${hero.hp}/${hero.maxHp}, mana ${hero.mp}/${hero.maxMp}` });
  }

  return {
    rects: hudRects,
    draw(state, layout) {
      const rects = hudRects(layout, quick.size);
      kit.origin(0, 0);
      if (layout.name === 'mobile') {
        for (const x of [0, 360]) { kit.fill(x, 0, 40, 180, THEME.panel); }
        kit.fill(39, 0, 1, 180, THEME.frameHi); kit.fill(38, 0, 1, 180, THEME.frame); kit.fill(360, 0, 1, 180, THEME.frameHi); kit.fill(361, 0, 1, 180, THEME.frame);
      } else {
        kit.window(0, VIEW_H, 320, 60);
      }
      drawHero(rects);
      buttons.forEach((b, i) => {
        const r = rects.buttons[i];
        kit.button(r.x, r.y, r.w, r.h, '', { icon: b.icon, icons, title: b.label, key: `menu:${b.kind}`, selected: menus.kind === b.kind, tap: b.run });
      });
      const view = quick.view();
      rects.slots.forEach((r, i) => { drawSlot(r, i, view[i] ?? null); slotRegion(r, i, view[i] ?? null); });
      if (rects.numbers) rects.slots.forEach((r, i) => kit.text(String(i + 1), r.x + r.w / 2, r.y + r.h + 2, THEME.dim, { align: 'center' }));
      drawMinimap(rects.minimap, state);
      if (layout.name === 'mobile') drawSticks(rects);
    },
  };
}
