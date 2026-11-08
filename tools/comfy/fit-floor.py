"""Fit a whole-picture floor (e.g. the user-supplied ChatGPT cobblestones, vanishing point at the top centre) to the demo view.

The demo draws floor.png over the whole 640x360 view; the horizon is row 180 and the game never shows the floor above the
cut row (walls hide it), so those rows are transparent, as for the painted Flux floors. Lanczos resampling only: no pixelization,
no recolouring unless --grade is given (colour grades live in tools/comfy/floorgrade.py: warm | dusk | match | concept).

usage: python tools/comfy/fit-floor.py <picture.png> <out.png> [--horizon 180] [--vp-row 0] [--vp-col 724]
                                       [--sx 0.442] [--sy 0.442] [--cut 224] [--sheet <sheet.png>] [--grade NAME]
       python tools/comfy/fit-floor.py --fit A --grade warm --apply     (the demo floor: reads game-2/art/ref/cobblestones-chatgpt.png,
                                       writes game-2/assets/floor.png and the sheet game-2/art/painted/floor.png)
  --fit      named fit: A = horizon 180 (the engine's horizon, ~16 stones across the bottom), B = 110 (~14), B2 = 70 (~11)
  --grade    colour grade applied to the scaled picture in OKLab before placing it (the lantern glints keep their character);
             the parameters used are printed
  --apply    use the default paths above instead of <picture.png> <out.png> (and write the sheet)
  --horizon  view row where the picture's vanishing point lands (180 = the engine's horizon; a higher row, e.g. 110, makes the
             stones at the bottom of the view larger: stone size at the bottom is proportional to (360 - horizon))
  --vp-row/--vp-col  vanishing point in the picture (pixels)
  --sx/--sy  horizontal / vertical scale (0.442 = 640 / 1448; sy < sx squashes the perspective, which looks wrong)
  --cut      first view row kept (rows above become transparent)
  --sheet    also write the 1536x1024 sheet that `node tools/studio2d.mjs slice floor` turns back into out.png
             (view at 2.4x, centred vertically at y=80, magenta key above the cut, #202020 bars)
Needs Pillow (ComfyUI's .venv has it). Then, for the demo: copy out.png to game-2/assets/floor.png.
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import floorgrade

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FITS = {'A': 180.0, 'B': 110.0, 'B2': 70.0}
W, H = 640, 360
args = sys.argv[1:]
pos = []
while args and not args[0].startswith('--'):
    pos.append(args.pop(0))
opt = {'horizon': 180.0, 'vp-row': 0.0, 'vp-col': 724.0, 'sx': 640 / 1448, 'sy': None, 'cut': 224, 'sheet': None,
       'grade': None, 'fit': None, 'apply': False}
i = 0
while i < len(args):
    k = args[i][2:]
    if k == 'apply':
        opt[k] = True
        i += 1
        continue
    opt[k] = args[i + 1] if k in ('sheet', 'grade', 'fit') else float(args[i + 1])
    i += 2
if opt['fit']:
    opt['horizon'] = FITS[opt['fit']]
if opt['apply']:
    pos = [os.path.join(ROOT, 'game-2/art/ref/cobblestones-chatgpt.png'), os.path.join(ROOT, 'game-2/assets/floor.png')]
    opt['sheet'] = opt['sheet'] or os.path.join(ROOT, 'game-2/art/painted/floor.png')
src, dst = pos[:2]
if opt['sy'] is None:
    opt['sy'] = opt['sx']

im = Image.open(src).convert('RGB')
sx, sy = opt['sx'], opt['sy']
w, h = round(im.width * sx), round(im.height * sy)
scaled = im.resize((w, h), Image.LANCZOS)
if opt['grade']:
    scaled, gparams = floorgrade.grade(scaled, opt['grade'], ROOT)
    print('grade', opt['grade'], gparams)
# place the vanishing point (vp-col, vp-row) at (W/2, horizon)
ox = round(W / 2 - opt['vp-col'] * sx)
oy = round(opt['horizon'] - opt['vp-row'] * sy)
canvas = Image.new('RGB', (W, H), (255, 0, 255))
canvas.paste(scaled, (ox, oy))
out = canvas.convert('RGBA')
px = out.load()
cut = int(opt['cut'])
for y in range(H):
    for x in range(W):
        r, g, b, a = px[x, y]
        if y < cut or (r, g, b) == (255, 0, 255):   # above the cut, or outside the picture: transparent
            px[x, y] = (0, 0, 0, 0)
out.save(dst)
cover = ox <= 0 and ox + w >= W and oy + h >= H
print(f'{dst}: scaled {w}x{h} at ({ox},{oy}); covers the view below the cut: {cover}')

if opt['sheet']:
    k = 1536 / W
    sheet = Image.new('RGB', (1536, 1024), (255, 0, 255))
    big = canvas.resize((1536, round(H * k)), Image.LANCZOS)
    cp = canvas.load()
    big_px = big.load()
    sheet.paste(big, (0, 80))
    sp = sheet.load()
    cutrow = 80 + round(cut * k)
    for y in range(80, cutrow):
        for x in range(1536):
            sp[x, y] = (255, 0, 255)
    for y in list(range(0, 80)) + list(range(944, 1024)):
        for x in range(1536):
            sp[x, y] = (32, 32, 32)
    sheet.save(opt['sheet'])
    print('sheet', opt['sheet'])
