// Drawing and hit-testing on the game's one canvas. Everything on screen except the pre-game menus is drawn with this
// kit, in whole logical pixels, with the 5x8 bitmap font: the scene, the HUD and every menu share one pixel grid (see
// docs/engine/ui.md).
//
// It is immediate-mode: a screen draws itself every frame, and every button, slot or list it draws also registers a
// hit region. The input controller (ui/input.js) asks `kit.at(x, y)` which region is under a point and calls the
// handlers the region carries. Regions are rebuilt each frame, so there is no widget state to keep in step.
//
//   const kit = createCanvasKit(g)
//   kit.begin()                            // start a frame: forget last frame's regions
//   kit.origin(x, y)                       // coordinates below are relative to this point
//   kit.fill / outline / frame / text / paragraph / icon / bar / button / hit / clip / scroll
//
// A region's handlers: tap(pt), hold(pt), press(pt, ev) -> { move(pt), up(pt) } (takes the pointer over, for sticks),
// drag(pt) -> payload, drop(payload) -> bool, accepts(payload) -> bool, scroll (a scroll state, see kit.scroll),
// plus `title` (shown as the hover text) and `key` (what the kit's `state` refers to).

import { drawText, textWidth } from './bitmapfont.js';
import { font5x8 } from './font-5x8.js';

export const THEME = {
  bg: '#08060c', panel: '#1a1320', panelHi: '#2c2028', well: '#0e0b11', wellEdge: '#3c2c20',
  frame: '#715036', frameHi: '#a07850', frameLo: '#46301f',
  text: '#f0d696', dim: '#96806e', faint: '#5a4c46', white: '#ffffff', select: '#ffd264',
  bad: '#d86a6a', good: '#8fe08a', mana: '#7ab0ff', hp: '#c42424', hpHi: '#ff7a60', mp: '#2454d0', mpHi: '#7ab0ff', xp: '#b8892a', xpHi: '#f0d070',
  outline: '#140c10',
};

// The bitmap font has ASCII and a few more characters. Anything else is turned into something it can draw, so a text
// never shows a gap: accents are dropped, typographic dashes and quotes become plain ones, the rest becomes "?".
export function plain(str, font = font5x8) {
  let out = '';
  for (const ch of String(str).replace(/[–−]/g, '-').replace(/×/g, 'x').replace(/[‘‚]/g, "'").replace(/[“”]/g, '"')
    .replace(/•/g, '*').replace(/→/g, '>').replace(/←/g, '<').normalize('NFD').replace(/[̀-ͯ]/g, '')) {
    out += ch === '\n' || font.glyphs[ch.charCodeAt(0)] ? ch : '?';
  }
  return out;
}

// Break a text into lines of at most `width` pixels. A newline starts a new line; a word longer than a line is cut.
export function wrapText(str, width, font = font5x8) {
  const max = Math.max(1, Math.floor(width / font.w)), lines = [];
  for (const paragraph of plain(str, font).split('\n')) {
    let line = '';
    for (let word of paragraph.split(' ')) {
      while (word.length > max) { // a word that cannot fit on any line
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, max)); word = word.slice(max);
      }
      if (line && line.length + 1 + word.length > max) { lines.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines;
}

// Cut a text to fit `width` pixels, with "..." at the end when it was cut.
export function fitText(str, width, font = font5x8) {
  const text = plain(str, font), max = Math.floor(width / font.w);
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3))}...`;
}

const inside = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
const intersect = (a, b) => {
  if (!a) return b; if (!b) return a;
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  return { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
};

export function createCanvasKit(g, { font = font5x8 } = {}) {
  let ox = 0, oy = 0, clipRect = null, regions = [];
  const scrolls = new Map();
  const R = Math.round;
  // What the input controller tells the drawing: the key of the region being pressed, hovered, or a drop is over.
  const state = { pressed: null, over: null, drop: null, now: 0 };

  const kit = {
    g, font, state, LINE: font.h + 1, plain, wrapText, fitText,
    width: str => textWidth(font, plain(str, font)),

    // --- frames
    begin() { regions = []; ox = oy = 0; clipRect = null; state.now = performance.now(); },
    origin(x, y) { ox = x; oy = y; },
    get ox() { return ox; }, get oy() { return oy; },
    withOrigin(x, y, fn) { const px = ox, py = oy; ox += x; oy += y; try { return fn(); } finally { ox = px; oy = py; } },

    // --- drawing (whole pixels, relative to the origin)
    fill(x, y, w, h, colour) { g.fillStyle = colour; g.fillRect(R(ox + x), R(oy + y), R(w), R(h)); },
    outline(x, y, w, h, colour) {
      g.fillStyle = colour; x = R(ox + x); y = R(oy + y); w = R(w); h = R(h);
      g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1); g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h);
    },
    // A panel: filled, with a one-pixel rim.
    frame(x, y, w, h, { fill = THEME.well, edge = THEME.wellEdge } = {}) { kit.fill(x, y, w, h, fill); kit.outline(x, y, w, h, edge); },
    // A raised bevel round a window: three rims, light to dark.
    window(x, y, w, h, fill = THEME.panel) {
      kit.fill(x, y, w, h, fill);
      kit.outline(x, y, w, h, THEME.frameHi); kit.outline(x + 1, y + 1, w - 2, h - 2, THEME.frame); kit.outline(x + 2, y + 2, w - 4, h - 4, THEME.frameLo);
    },
    // A filled circle of whole pixels (an arc would be smoothed): centre (cx, cy), radius r.
    disc(cx, cy, r, colour) {
      g.fillStyle = colour;
      for (let dy = -r; dy <= r; dy++) { const dx = Math.round(Math.sqrt(r * r + 0.5 - dy * dy)); g.fillRect(R(ox + cx) - dx, R(oy + cy) + dy, 2 * dx + 1, 1); }
    },
    // A circle with a rim.
    ring(cx, cy, r, fill, edge) { kit.disc(cx, cy, r, edge); kit.disc(cx, cy, r - 1, fill); },
    // A pill: a rectangle with half-circles at both ends (h is the diameter).
    capsule(x, y, w, h, fill, edge) {
      const r = Math.floor(h / 2), cy = y + r;
      for (const [c, k] of [[edge, 0], [fill, 1]]) {
        kit.fill(x + r, y + k, w - 2 * r, h - 2 * k, c);
        kit.disc(x + r, cy, r - k, c); kit.disc(x + w - r - 1, cy, r - k, c);
      }
    },
    // Text with its top-left at (x, y); returns its width. `shadow` draws it with a dark outline (over the picture).
    text(str, x, y, colour = THEME.text, { align = 'left', shadow = false } = {}) {
      const s = plain(str, font);
      drawText(g, font, s, R(ox + x), R(oy + y), colour, { align, outline: shadow ? THEME.outline : undefined });
      return textWidth(font, s);
    },
    // Wrapped text in a column `w` wide; returns the height it took. `from` skips lines, `max` limits how many are drawn.
    paragraph(str, x, y, w, colour = THEME.text, { max = Infinity, from = 0, lineHeight = font.h + 1, shadow = false } = {}) {
      const lines = wrapText(str, w, font);
      lines.slice(from, from + max).forEach((line, i) => kit.text(line, x, y + i * lineHeight, colour, { shadow }));
      return lines.length * lineHeight;
    },
    lineCount: (str, w) => wrapText(str, w, font).length,
    // An icon from the icon atlas (ui/icons.js) at `size` (a whole multiple of the pixel icon's own size looks best).
    icon(icons, id, x, y, size = 16, { outline, alpha = 1 } = {}) {
      g.save();
      if (alpha !== 1) g.globalAlpha = alpha;
      g.imageSmoothingEnabled = false;
      icons.draw(g, id, R(ox + x), R(oy + y), size, size, outline);
      g.restore();
    },
    // A picture (or part of one: `crop` is [sx, sy, sw, sh]) at (x, y), at its own size, never smoothed.
    image(img, x, y, crop = null) {
      g.save(); g.imageSmoothingEnabled = false;
      if (crop) g.drawImage(img, crop[0], crop[1], crop[2], crop[3], R(ox + x), R(oy + y), crop[2], crop[3]);
      else g.drawImage(img, R(ox + x), R(oy + y));
      g.restore();
    },
    // A bar (health, mana, experience): a dark well, the fill from the left, a highlight along its top, a label on it.
    bar(x, y, w, h, value, max, { fill = THEME.hp, hi = THEME.hpHi, label = null } = {}) {
      kit.fill(x, y, w, h, THEME.outline); kit.fill(x + 1, y + 1, w - 2, h - 2, '#2a1418');
      const inner = Math.max(0, Math.round((w - 2) * Math.min(1, max > 0 ? value / max : 0)));
      if (inner > 0) { kit.fill(x + 1, y + 1, inner, h - 2, fill); if (h >= 7) kit.fill(x + 1, y + 2, inner, 1, hi); }
      if (label !== null && h >= font.h) kit.text(label, x + w / 2, y + Math.round((h - font.h) / 2) + 1, THEME.white, { align: 'center', shadow: true });
    },

    // --- regions
    // Register a region (relative to the origin, clipped to the current clip). Handlers go in `handlers`.
    hit(x, y, w, h, handlers = {}) {
      const region = { x: R(ox + x), y: R(oy + y), w: R(w), h: R(h), clip: clipRect, key: handlers.key ?? `${R(ox + x)},${R(oy + y)}`, ...handlers };
      regions.push(region);
      return region;
    },
    // The topmost region under a point (that satisfies `want`, if given).
    at(x, y, want = null) {
      for (let i = regions.length - 1; i >= 0; i--) {
        const r = regions[i];
        if (!inside(r, x, y) || (r.clip && !inside(r.clip, x, y)) || (want && !want(r))) continue;
        return r;
      }
      return null;
    },
    // The regions of the frame just drawn, for tests: { key, x, y, w, h, title, disabled }.
    regions: () => regions.map(r => ({ key: r.key, x: r.x, y: r.y, w: r.w, h: r.h, title: r.title ?? '', disabled: !!r.disabled })),
    // Everything drawn by `fn` is cut to the rectangle, and so are the regions it registers.
    clip(x, y, w, h, fn) {
      const previous = clipRect, rect = { x: R(ox + x), y: R(oy + y), w: R(w), h: R(h) };
      clipRect = intersect(previous, rect);
      g.save(); g.beginPath(); g.rect(rect.x, rect.y, rect.w, rect.h); g.clip();
      try { return fn(); } finally { g.restore(); clipRect = previous; }
    },
    // A button: a labelled (or icon-only) rectangle. `tap` runs on release; `selected` rims it gold, `disabled` greys it.
    button(x, y, w, h, label, { tap, hold, disabled = false, selected = false, primary = false, key, title, icon, icons, align = 'center' } = {}) {
      const id = key ?? `${R(ox + x)},${R(oy + y)}`, down = state.pressed === id && !disabled;
      kit.fill(x, y, w, h, disabled ? THEME.well : down ? '#4a3a44' : primary ? '#3a2a30' : THEME.panelHi);
      kit.outline(x, y, w, h, selected ? THEME.select : disabled ? THEME.frameLo : primary ? THEME.select : THEME.frameHi);
      if (icon && icons) kit.icon(icons, icon, x + Math.floor((w - 16) / 2), y + Math.floor((h - 16) / 2), 16, { alpha: disabled ? 0.4 : 1 });
      if (label) kit.text(label, align === 'center' ? x + w / 2 : x + 3, y + Math.floor((h - font.h) / 2) + 1 + (down ? 1 : 0), disabled ? THEME.faint : THEME.text, { align });
      return kit.hit(x, y, w, h, { key: id, tap: disabled ? undefined : tap, hold: disabled ? undefined : hold, title: title ?? label, disabled });
    },
    // A scrolling area. `draw(width)` draws its content with the origin at the area's top-left, shifted by the scroll,
    // and returns the content's height (used on the next frame to limit the scroll). Wheel and drag scroll it.
    scroll(key, x, y, w, h, draw) {
      let s = scrolls.get(key);
      if (!s) scrolls.set(key, s = { y: 0, max: 0, height: h });
      s.y = Math.max(0, Math.min(s.max, s.y)); s.height = h;
      kit.hit(x, y, w, h, { key: `scroll:${key}`, scroll: s });
      let used = 0;
      kit.clip(x, y, w, h, () => kit.withOrigin(x, y - s.y, () => { used = draw(w - 4) ?? 0; }));
      s.max = Math.max(0, used - h);
      if (s.max > 0) { // a slim bar at the right edge
        const track = h - 2, thumb = Math.max(6, Math.round(track * h / used)), top = Math.round((track - thumb) * (s.y / s.max));
        kit.fill(x + w - 2, y + 1, 1, track, THEME.frameLo); kit.fill(x + w - 2, y + 1 + top, 1, thumb, THEME.frameHi);
      }
      return s;
    },
    scrollState: key => scrolls.get(key),
    resetScroll(key) { if (key === undefined) { for (const s of scrolls.values()) s.y = 0; return; } const s = scrolls.get(key); if (s) s.y = 0; },
  };
  return kit;
}
