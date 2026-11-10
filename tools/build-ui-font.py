"""Build the HUD webfont from the project's public-domain 5x8 bitmap font.
Requires fonttools. Run from the repository root: python3 tools/build-ui-font.py
"""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

source = Path('tools/fonts/misc-fixed-5x8.bdf').read_text().splitlines()
glyphs = {'.notdef': TTGlyphPen(None).glyph()}
cmap = {}
code = None
rows = []
bitmap = False
for line in source:
    if line.startswith('ENCODING '):
        code = int(line.split()[1])
    elif line == 'BITMAP':
        rows = []
        bitmap = True
    elif line == 'ENDCHAR':
        bitmap = False
        if code is None or code < 0:
            continue
        name = f'uni{code:04X}'
        pen = TTGlyphPen(None)
        for y, row in enumerate(rows):
            for x in range(5):
                if row & (0x80 >> x):
                    x0, y0 = x * 100, (6 - y) * 100
                    pen.moveTo((x0, y0))
                    pen.lineTo((x0, y0 + 100))
                    pen.lineTo((x0 + 100, y0 + 100))
                    pen.lineTo((x0 + 100, y0))
                    pen.closePath()
        glyphs[name] = pen.glyph()
        cmap[code] = name
    elif bitmap:
        rows.append(int(line, 16))

font = FontBuilder(800, isTTF=True)
font.setupGlyphOrder(list(glyphs))
font.setupCharacterMap(cmap)
font.setupGlyf(glyphs)
font.setupHorizontalMetrics({name: (500, 0) for name in glyphs})
font.setupHorizontalHeader(ascent=700, descent=-100)
font.setupNameTable({'familyName': 'RPG Pixel', 'styleName': 'Regular',
                    'uniqueFontIdentifier': 'RPGPixel5x8', 'fullName': 'RPG Pixel',
                    'psName': 'RPGPixel', 'version': 'Version 1.0'})
font.setupOS2(sTypoAscender=700, sTypoDescender=-100, usWinAscent=700, usWinDescent=100)
font.setupPost()
font.font.flavor = 'woff'
font.save('engine2d/assets/rpg-pixel.woff')
