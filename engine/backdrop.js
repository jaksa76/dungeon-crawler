import * as THREE from 'three';

// Parallax backdrop: horizontally wrapping cylinders plus landmark cards.
// `follow` = how much a layer moves with the camera (1 = infinitely far away).
// Angles are in degrees; bearing is clockwise from north (-z).

const rad = (d) => (d * Math.PI) / 180;

export function buildBackdrop(scene, spec, assets, eyeHeight) {
  const items = [];

  spec.layers.forEach((layer, i) => {
    const tex = assets[layer.image].texture;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(-layer.repeat, 1); // negative: viewed from inside the cylinder
    tex.needsUpdate = true;
    const y0 = layer.radius * Math.tan(rad(layer.from));
    const y1 = layer.radius * Math.tan(rad(layer.to));
    const geo = new THREE.CylinderGeometry(layer.radius, layer.radius, y1 - y0, 96, 1, true);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: tex, side: THREE.BackSide, transparent: true, fog: false, depthWrite: false,
    }));
    mesh.renderOrder = -100 + i;
    items.push({ mesh, follow: layer.follow, y: eyeHeight + (y0 + y1) / 2 });
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
