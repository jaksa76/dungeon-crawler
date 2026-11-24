import * as THREE from 'three';

// Parallax backdrop: horizontally wrapping cylinders plus landmark cards.
// `follow` = how much a layer moves with the camera (1 = infinitely far away).
// Angles are in degrees; bearing is clockwise from north (-z).

const rad = (d) => (d * Math.PI) / 180;

// Fraction (0 = top) of the first row where an image has meaningful opaque content.
function contentTop(image) {
  const w = 256, h = Math.round((image.height / image.width) * w);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(image, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y++) {
    let opaque = 0;
    for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 128) opaque++;
    if (opaque > w / 40) return y / h;
  }
  return 0;
}

export function buildBackdrop(scene, spec, assets, eyeHeight) {
  const items = [];

  spec.layers.forEach((layer, i) => {
    const tex = assets[layer.image].texture;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    // `from`: elevation of the image's bottom edge. Either `to` (elevation of the
    // image's top edge) or `peak` (elevation of the highest opaque content, found
    // automatically, so regenerated art with a different empty margin still fits).
    const y0 = layer.radius * Math.tan(rad(layer.from));
    let y1;
    if (layer.peak !== undefined) {
      const f = contentTop(assets[layer.image].image);
      y1 = y0 + (layer.radius * Math.tan(rad(layer.peak)) - y0) / (1 - f);
    } else {
      y1 = layer.radius * Math.tan(rad(layer.to));
    }
    // Repeat around the horizon so the art keeps square pixels, unless specified.
    const img = assets[layer.image].image;
    const repeat = layer.repeat
      ?? Math.max(1, Math.round((2 * Math.PI * layer.radius) / ((y1 - y0) * (img.width / img.height))));
    // The cylinder continues below the image down to -35°, filled by the image's
    // clamped bottom row, so looking down over a low wall never shows a gap.
    const yFill = Math.min(y0, layer.radius * Math.tan(rad(-35)));
    tex.repeat.set(-repeat, (y1 - yFill) / (y1 - y0)); // negative x: seen from inside
    tex.offset.set(0, (yFill - y0) / (y1 - y0));
    tex.needsUpdate = true;
    const geo = new THREE.CylinderGeometry(layer.radius, layer.radius, y1 - yFill, 96, 1, true);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: tex, side: THREE.BackSide, transparent: true, fog: false, depthWrite: false,
    }));
    mesh.renderOrder = -100 + i;
    items.push({ mesh, follow: layer.follow, y: eyeHeight + (yFill + y1) / 2 });
    scene.add(mesh);
  });

  spec.landmarks.forEach((lm, i) => {
    const a = assets[lm.image];
    const w = 2 * lm.radius * Math.tan(rad(lm.size / 2)), h = w * a.aspect;
    const geo = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: a.texture, transparent: true, fog: false, depthWrite: false,
    }));
    // Landmarks sit between the layers by radius: render order follows distance.
    const layerIndex = spec.layers.filter((l) => l.radius > lm.radius).length;
    mesh.renderOrder = -100 + layerIndex - 0.5 + i * 0.01;
    const b = rad(lm.bearing);
    const offset = new THREE.Vector3(Math.sin(b) * lm.radius, lm.radius * Math.tan(rad(lm.elevation)), -Math.cos(b) * lm.radius);
    mesh.rotation.y = -b; // face back toward the centre
    items.push({ mesh, follow: lm.follow, y: eyeHeight + offset.y, offset });
    scene.add(mesh);
  });

  return {
    update(camera) {
      for (const it of items) {
        it.mesh.position.set(camera.position.x * it.follow, it.y, camera.position.z * it.follow);
        if (it.offset) { it.mesh.position.x += it.offset.x; it.mesh.position.z += it.offset.z; }
      }
    },
  };
}
