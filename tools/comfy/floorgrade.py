"""Colour grading for painted floors, in OKLab (perceptual), used by fit-floor.py (--grade NAME) and runnable on its own.

The lantern glints (orange, bright) are kept: hue rotations fade out inside the orange band, statistics are taken on the
non-glint pixels, and the transfer scale is clamped so glints are neither clipped nor flattened.

  python tools/comfy/floorgrade.py stats <image.png> [--mask <mask.png>]   -> mean/std of L,a,b + hue/chroma (non-glint pixels)

Presets (parameters are printed when a grade is applied; GRADES below is the single source of truth):
  warm     stone hue and chroma pulled to the midpoint of the old placeholder floor and the A5 rose floor, lightness unchanged
  dusk     purple kept, chroma x0.85, shadows lifted, glints a touch brighter and more saturated
  match    OKLab mean/std transfer to the colours next to the floor in the demo (stone bases, timber, plaster)
  concept  OKLab mean/std transfer to the concept art's own floor (game-2/art/ref/concept-ground.png)
"""
import json
import math
import sys
import numpy as np
from PIL import Image

def to_lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(l):
    l = np.clip(l, 0, 1)
    return np.where(l <= 0.0031308, l * 12.92, 1.055 * l ** (1 / 2.4) - 0.055) * 255.0


def rgb_to_oklab(rgb):
    r, g, b = (to_lin(rgb[..., i].astype(np.float64)) for i in range(3))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    return np.stack([0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
                     1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
                     0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_], -1)


def oklab_to_rgb(lab):
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return np.clip(to_srgb(np.stack([r, g, bl], -1)), 0, 255)


def hue_deg(lab):
    return np.degrees(np.arctan2(lab[..., 2], lab[..., 1])) % 360


def chroma(lab):
    return np.hypot(lab[..., 1], lab[..., 2])


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def glint_weight(lab):
    """1 for the orange lantern glints (hue ~20..100 deg, noticeably chromatic), 0 for the purple stones, soft edges."""
    dh = np.abs((hue_deg(lab) - 60 + 180) % 360 - 180)            # distance from orange (60 deg)
    return (1 - smoothstep((dh - 30) / 25)) * smoothstep((chroma(lab) - 0.04) / 0.04)


def stats(lab, w):
    keep = (1 - w) > 0.5
    px = lab[keep]
    mean, std = px.mean(0), px.std(0)
    h = math.degrees(math.atan2(mean[2], mean[1])) % 360
    return {'mean': mean, 'std': std, 'hue': h, 'chroma': float(math.hypot(mean[1], mean[2])), 'n': int(keep.sum())}


def load_lab(path, mask=None):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im).astype(np.float64)
    lab = rgb_to_oklab(a[..., :3])
    m = a[..., 3] > 0
    if mask is not None:
        m = m & (np.asarray(Image.open(mask).convert('L')) > 127)
    return lab, m


def _ref(d):
    return {'mean': np.array(d['mean']), 'std': np.array(d['std']), 'hue': d['hue'], 'chroma': d['chroma']}


def reference_stats(root):
    """Target stats: game-2/art/ref/floor-grade-stats.json (walls beside the floor, old placeholder floor, A5 colour target:
    measured from the demo) plus the concept art's own floor (computed from game-2/art/ref/concept-ground.png)."""
    j = json.load(open(f'{root}/game-2/art/ref/floor-grade-stats.json', encoding='utf-8'))
    out = {k: _ref(v) for k, v in j.items() if k != 'about'}
    lab, _ = load_lab(f'{root}/game-2/art/ref/concept-ground.png')
    flat = lab.reshape(-1, 3)
    out['concept'] = stats(flat, glint_weight(flat))
    return out


def transfer(lab, w, src, dst, strength=1.0, clamp=(0.7, 1.3), shift_l=0.0):
    """Reinhard-style mean/std transfer in OKLab, scale clamped; glints keep their hue/chroma character."""
    ratio = np.clip(dst['std'] / np.maximum(src['std'], 1e-6), *clamp)
    out = (lab - src['mean']) * ratio + dst['mean'] + np.array([shift_l, 0, 0])
    out = lab + (out - lab) * strength
    # glints: keep their own a,b (orange) and only follow the lightness mapping
    g = w[..., None]
    out[..., 1:] = out[..., 1:] * (1 - g) + lab[..., 1:] * g
    return out


def grade(img, name, root=None, params=None):
    """img: PIL RGB image (the scaled picture). Returns (graded PIL RGB image, parameter dict used)."""
    arr = np.asarray(img.convert('RGB')).astype(np.float64)
    lab = rgb_to_oklab(arr)
    w = glint_weight(lab)
    src = stats(lab, w)
    p = {}
    if name in (None, '', 'none'):
        return img, {}
    if name == 'warm':
        refs = reference_stats(root)
        ph, ah = refs['old_placeholder'], refs['a5_target']
        # target = circular midpoint of the old placeholder floor's hue and the A5 rose floor's hue, mean of their chromas
        hr = math.radians
        hue_to = math.degrees(math.atan2(math.sin(hr(ph['hue'])) + math.sin(hr(ah['hue'])),
                                         math.cos(hr(ph['hue'])) + math.cos(hr(ah['hue'])))) % 360
        chroma_to = (ph['chroma'] + ah['chroma']) / 2
        dh = (hue_to - src['hue'] + 180) % 360 - 180
        cs = chroma_to / src['chroma']
        p = {'hue_from': round(src['hue'], 1), 'hue_to': round(hue_to, 1), 'hue_shift_deg': round(dh, 1),
             'chroma_from': round(src['chroma'], 4), 'chroma_to': round(chroma_to, 4), 'chroma_scale': round(cs, 3),
             'lightness': 'unchanged', 'glints': 'hue/chroma untouched'}
        h = np.radians(dh) * (1 - w)
        a, b = lab[..., 1], lab[..., 2]
        a2 = a * np.cos(h) - b * np.sin(h)
        b2 = a * np.sin(h) + b * np.cos(h)
        cscale = 1 - (1 - cs) * (1 - w)
        lab = np.stack([lab[..., 0], a2 * cscale, b2 * cscale], -1)
    elif name == 'dusk':
        cs, lift, gl, gc = 0.85, 0.045, 0.03, 1.12
        p = {'chroma_scale_stones': cs, 'shadow_lift': lift, 'glint_lightness_add': gl, 'glint_chroma_scale': gc}
        L = lab[..., 0]
        L2 = L + lift * (1 - smoothstep((L - 0.25) / 0.3)) * (1 - w) + gl * w
        c = 1 - (1 - cs) * (1 - w) + (gc - 1) * w
        lab = np.stack([L2, lab[..., 1] * c, lab[..., 2] * c], -1)
    elif name in ('match', 'concept'):
        dst = reference_stats(root)['concept' if name == 'concept' else 'walls_band']
        p = {'src_mean': [round(float(x), 4) for x in src['mean']], 'src_std': [round(float(x), 4) for x in src['std']],
             'dst_mean': [round(float(x), 4) for x in dst['mean']], 'dst_std': [round(float(x), 4) for x in dst['std']],
             'clamp': [0.7, 1.3]}
        lab = transfer(lab, w, src, dst)
    else:
        raise SystemExit(f'unknown grade {name!r}')
    out = oklab_to_rgb(lab)
    return Image.fromarray(np.round(out).astype(np.uint8), 'RGB'), p


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == 'stats':
        mask = sys.argv[sys.argv.index('--mask') + 1] if '--mask' in sys.argv else None
        lab, m = load_lab(sys.argv[2], mask)
        s = stats(lab[m], glint_weight(lab[m]))
        print({k: (np.round(v, 4).tolist() if hasattr(v, 'tolist') else v) for k, v in s.items()})
    else:
        print(__doc__)
