// Draws text from a bitmap font (see engine/font-5x8.js, made by tools/bdf2js.mjs) one pixel at a time, so
// it stays crisp on a low-resolution canvas where a scalable font would be anti-aliased into mush.
// All coordinates are whole canvas pixels; a text is a Path2D of 1x1 squares, filled once per colour.

const paths = new WeakMap(); // font -> Map(string -> Path2D)

function pathFor(font, str) {
  let cache = paths.get(font);
  if (!cache) paths.set(font, cache = new Map());
  let p = cache.get(str);
  if (p) return p;
  p = new Path2D();
  for (let i = 0; i < str.length; i++) {
    const rows = font.glyphs[str.charCodeAt(i)];
    if (!rows) continue; // not in the font: leave a gap
    rows.forEach((bits, y) => {
      for (let x = 0; x < font.w; x++) if (bits & (0x80 >> x)) p.rect(i * font.w + x, y, 1, 1);
    });
  }
  if (cache.size > 200) cache.clear();
  cache.set(str, p);
  return p;
}

export const textWidth = (font, str) => str.length * font.w;

// Cell rows between which digits are drawn; used to centre a number vertically on a bar.
export function digitRows(font) {
  const rows = font.glyphs[48];
  const ink = rows.map((b, y) => (b ? y : -1)).filter((y) => y >= 0);
  return [ink[0], ink.at(-1) + 1]; // [first row, row after the last]
}

// (x, y) is the top-left corner of the first character's cell. `outline` is an optional colour for a
// one-pixel border on the four sides.
export function drawText(g, font, str, x, y, color, { outline, align = 'left' } = {}) {
  const w = textWidth(font, str);
  x = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  y = Math.round(y);
  const p = pathFor(font, str);
  g.save();
  g.imageSmoothingEnabled = false;
  g.translate(x, y);
  if (outline) {
    g.fillStyle = outline;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { g.translate(dx, dy); g.fill(p); g.translate(-dx, -dy); }
  }
  g.fillStyle = color;
  g.fill(p);
  g.restore();
}
