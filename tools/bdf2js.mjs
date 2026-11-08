// Converts a BDF bitmap font (glyphs at most 8 pixels wide) into an ES module of glyph bit rows.
//   node tools/bdf2js.mjs <font.bdf> <out.js> <exportName> "<credit line>"
// Only printable ASCII plus a few punctuation marks are kept. Each glyph is `h` bytes, one per row from the
// top of the font cell, the leftmost pixel in the most significant bit. The font is monospaced: `w` is the
// advance of every character.
import { readFileSync, writeFileSync } from 'node:fs';

const [src, out, name, credit] = process.argv.slice(2);
if (!src || !out || !name) throw new Error('usage: node tools/bdf2js.mjs <font.bdf> <out.js> <exportName> "<credit>"');
const bdf = readFileSync(src, 'utf8');
const [W, H, , yOff] = /^FONTBOUNDINGBOX (-?\d+) (-?\d+) (-?\d+) (-?\d+)/m.exec(bdf).slice(1).map(Number);
const baseline = H + yOff; // cell row just below the baseline
const KEEP = (c) => (c >= 32 && c <= 126) || [0xb7, 0x2014, 0x2019, 0x2026].includes(c);

const glyphs = {};
for (const block of bdf.split(/^STARTCHAR /m).slice(1)) {
  const code = Number(/^ENCODING (-?\d+)/m.exec(block)[1]);
  if (!KEEP(code)) continue;
  const [bw, bh, bx, by] = /^BBX (-?\d+) (-?\d+) (-?\d+) (-?\d+)/m.exec(block).slice(1).map(Number);
  if (bw + bx > 8) throw new Error(`glyph ${code} is wider than 8 pixels`);
  const rows = /^BITMAP\n([\s\S]*?)^ENDCHAR/m.exec(block)[1].trim().split('\n').filter(Boolean);
  const cell = new Array(H).fill(0);
  const top = baseline - (by + bh); // cell row of the glyph's top row
  rows.forEach((hex, i) => {
    const y = top + i;
    if (y >= 0 && y < H) cell[y] = (parseInt(hex.slice(0, 2), 16) >> bx) & 0xff;
  });
  glyphs[code] = cell;
}

const hex = (r) => '0x' + r.toString(16).padStart(2, '0');
const lines = Object.entries(glyphs).map(([c, rows]) => `    ${c}: [${rows.map(hex).join(', ')}],`);
writeFileSync(out, `// ${credit}
// Converted from ${src.split(/[\/]/).pop()} by tools/bdf2js.mjs. Do not edit by hand.
//
// Glyph bytes by character code: ${H} rows from the top of the ${W}x${H} cell, leftmost pixel = bit 7.
export const ${name} = {
  w: ${W}, h: ${H}, baseline: ${baseline},
  glyphs: {
${lines.join('\n')}
  },
};
`);
console.log(`${Object.keys(glyphs).length} glyphs, ${W}x${H}, baseline ${baseline}, written to ${out}`);
