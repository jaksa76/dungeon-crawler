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

  for (const a of Object.values(assets)) {
    a.aspect = a.image.height / a.image.width;
    a.texture = makeTexture(a.image, a.spec);
    const glowSrc = a.spec.glow ? deriveGlow(a.image) : null;
    a.glow = glowSrc ? makeTexture(glowSrc, a.spec) : null;
  }
  return assets;
}
