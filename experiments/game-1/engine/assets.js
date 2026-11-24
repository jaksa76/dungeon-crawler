import * as THREE from 'three';
import { generatePlaceholder, pixelate } from './placeholders.js';

// Loads every asset in the manifest. Real files win; missing files fall back to
// procedural placeholders. Each asset becomes:
//   { image, texture, glow (THREE.Texture|null), aspect (h/w), real (bool) }

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function makeTexture(source, { repeat = false } = {}) {
  const t = new THREE.Texture(source);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

// Self-illumination is derived automatically: bright, saturated, warm pixels
// (lit windows, flames, lanterns) become an emissive map.
function deriveGlow(source) {
  const w = source.width, h = source.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(source, 0, 0);
  const data = g.getImageData(0, 0, w, h);
  const d = data.data;
  let count = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gr = d[i + 1], b = d[i + 2], a = d[i + 3];
    const max = Math.max(r, gr, b), min = Math.min(r, gr, b);
    const sat = max ? (max - min) / max : 0;
    const glow = a > 128 && max > 225 && sat > 0.35 && r > b && gr > 120;
    if (glow) count++;
    else d[i] = d[i + 1] = d[i + 2] = 0;
    d[i + 3] = 255;
  }
  if (!count) return null;
  g.putImageData(data, 0, 0);
  return c;
}

// Bounding box of the opaque content, as fractions of the image (y from the top).
function contentBox(source) {
  const w = Math.min(256, source.width), h = Math.max(1, Math.round((source.height / source.width) * w));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(source, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: 1, y1: 1 };
  return { x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h };
}

export async function loadAssets(manifest, basePath) {
  const assets = {};
  const entries = Object.entries(manifest);

  // First pass: everything that isn't derived from another asset.
  await Promise.all(entries.filter(([, s]) => !s.from).map(async ([key, spec]) => {
    const img = await loadImage(`${basePath}/${key}.png`);
    const image = img || generatePlaceholder(spec.gen);
    assets[key] = { image, real: !!img, spec };
  }));

  // Second pass: derived assets (e.g. far-distance sprites) use their own file if
  // present, otherwise a pixelated copy of the source.
  await Promise.all(entries.filter(([, s]) => s.from).map(async ([key, spec]) => {
    const img = await loadImage(`${basePath}/${key}.png`);
    const image = img || pixelate(assets[spec.from].image, spec.width || 24);
    assets[key] = { image, real: !!img, spec };
  }));

  // Optional height maps (<key>-height.png, e.g. from tools/heightmap.mjs).
  await Promise.all(entries.filter(([, s]) => s.heightMap).map(async ([key]) => {
    const img = await loadImage(`${basePath}/${key}-height.png`);
    if (img) assets[key].heightImage = img;
  }));

  for (const a of Object.values(assets)) {
    a.aspect = a.image.height / a.image.width;
    if (a.heightImage) {
      a.height = makeTexture(a.heightImage, a.spec);
      a.height.colorSpace = THREE.NoColorSpace; // data, not colour
      a.height.magFilter = THREE.LinearFilter;  // smooth slopes, no stair steps
    }
    a.texture = makeTexture(a.image, a.spec);
    const glowSrc = a.spec.glow ? deriveGlow(a.image) : null;
    a.glow = glowSrc ? makeTexture(glowSrc, a.spec) : null;
    if (a.spec.trim) {
      // Crop away transparent margins so feet touch the ground and `height`
      // means the height of the visible figure.
      const b = contentBox(a.image);
      for (const t of [a.texture, a.glow]) {
        if (!t) continue;
        t.repeat.set(b.x1 - b.x0, b.y1 - b.y0);
        t.offset.set(b.x0, 1 - b.y1);
      }
      a.aspect = ((b.y1 - b.y0) * a.image.height) / ((b.x1 - b.x0) * a.image.width);
    }
  }
  return assets;
}
