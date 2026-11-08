"""Colour grade + horizon cut for a painted floor sheet (a colour step: nothing is resampled or pixelized).
Flux paints the cobbles in hard two-tone halves (terracotta and lavender); this pulls the hue (Lab a/b) of the ground
toward the target floor's mean and compresses its spread, leaves lightness alone, then turns everything above the cut row
into the key colour (the game never shows that strip, and Flux paints a tree line there).

usage: python tools/comfy/grade-floor.py <painted.png> <out.png> <target.png> [--shift 0.85] [--spread 0.5] [--light 0] [--cut 618]
  <painted.png>  the 1536x1024 sheet from `paint floor` (magenta sky, #202020 bars)
  <target.png>   a floor whose colours are right (its opaque pixels are the target; game-2/art/ref/floor-colour.png)
  --cut          first sheet row kept: 80 + 224 * 2.4 = 618 is row 224 of the 640x360 view
Needs numpy and Pillow (ComfyUI's own .venv has both). Then: node tools/studio2d.mjs slice floor <out.png>
"""
import sys
import numpy as np
from PIL import Image

src, dst, tgt = sys.argv[1:4]
opt = {'shift': 0.85, 'spread': 0.5, 'light': 0.0, 'cut': 618}
i = 4
while i < len(sys.argv):
    opt[sys.argv[i][2:]] = float(sys.argv[i + 1]); i += 2
cut = int(opt['cut'])


def to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def to_rgb(lab):
    fy = (lab[..., 0] + 16) / 116
    f = np.stack([fy + lab[..., 1] / 500, fy, fy - lab[..., 2] / 200], -1)
    xyz = np.where(f ** 3 > 0.008856, f ** 3, (f - 16 / 116) / 7.787) * np.array([0.95047, 1.0, 1.08883])
    m = np.array([[3.2404542, -1.5371385, -0.4985314], [-0.9692660, 1.8760108, 0.0415560], [0.0556434, -0.2040259, 1.0572252]])
    c = xyz @ m.T
    c = np.where(c > 0.0031308, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055, 12.92 * c)
    return np.clip(c * 255, 0, 255)


sheet = np.asarray(Image.open(src).convert('RGB')).astype(float)
key = (sheet == [255, 0, 255]).all(-1)
bars = (sheet == [32, 32, 32]).all(-1)
ground = ~key & ~bars
rows = np.arange(sheet.shape[0])[:, None] >= cut
stats = ground & rows

t = np.asarray(Image.open(tgt).convert('RGBA')).astype(float)
lt = to_lab(t[..., :3][t[..., 3] > 200])
la = to_lab(sheet[stats])
mu_a, mu_t = la.mean(0), lt.mean(0)

lab = to_lab(sheet[ground])
for ch in (1, 2):
    lab[:, ch] = (lab[:, ch] - mu_a[ch]) * opt['spread'] + mu_a[ch] + (mu_t[ch] - mu_a[ch]) * opt['shift']
lab[:, 0] += (mu_t[0] - mu_a[0]) * opt['light']
sheet[ground] = to_rgb(lab)
sheet[:cut][~bars[:cut]] = [255, 0, 255]          # above the cut: key colour (bars stay)
Image.fromarray(sheet.astype(np.uint8)).save(dst)
print('Lab mean ground', mu_a.round(1), '-> target', mu_t.round(1), '; wrote', dst, '(rows above', cut, 'keyed)')
