import * as THREE from 'three';
import { addInkLines } from './ink.js';

// Builds the 3D scene for a tile-based location:
// walls as painted one-tile panels, hip roofs, a cobbled floor,
// billboard sprites, wall decals and point lights.

const LIGHT_SCALE = 2.0;
const FACE_DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

function hash3(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function buildWorld(scene, level, tileTypes, assets) {
  const rows = level.tiles;
  const depth = rows.length, width = rows[0].length;
  const typeAt = (x, z) => (z < 0 || z >= depth || x < 0 || x >= width ? null : tileTypes[rows[z][x]]);

  const materials = new Map();
  const material = (key, opts = {}) => {
    const id = key + JSON.stringify(opts);
    if (!materials.has(id)) {
      const a = assets[key];
      materials.set(id, new THREE.MeshLambertMaterial({
        map: a.texture,
        emissiveMap: a.glow,
        emissive: a.glow ? 0xffffff : 0x000000,
        alphaTest: 0.5,
        ...opts,
      }));
    }
    return materials.get(id);
  };

  const geometries = new Map();
  const panel = (w, h) => {
    const id = `${w}x${h}`;
    if (!geometries.has(id)) geometries.set(id, new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0));
    return geometries.get(id);
  };

  // --- roofs: gable roofs whose ridge runs along the street-facing side, so
  // neighbouring tiles join into continuous rooflines.
  const ROOF_H = 0.6, ROOF_W = 0.56; // height and half-width (incl. overhang)
  const roofTex = assets['textures/roof-tiles'].texture;
  roofTex.repeat.set(1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ map: roofTex, side: THREE.DoubleSide });
  const gableMat = new THREE.MeshLambertMaterial({ color: 0x3a2618, side: THREE.DoubleSide });
  const slope = Math.hypot(ROOF_W, ROOF_H);
  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, -ROOF_W, 0.5, 0, -ROOF_W, 0.5, ROOF_H, 0, -0.5, 0, -ROOF_W, 0.5, ROOF_H, 0, -0.5, ROOF_H, 0,
    -0.5, 0, ROOF_W, -0.5, ROOF_H, 0, 0.5, ROOF_H, 0, -0.5, 0, ROOF_W, 0.5, ROOF_H, 0, 0.5, 0, ROOF_W,
  ], 3));
  roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 1, slope, 0, 0, 1, slope, 0, slope,
    0, 0, 0, slope, 1, slope, 0, 0, 1, slope, 1, 0,
  ], 2));
  roofGeo.computeVertexNormals();
  const gableGeo = new THREE.BufferGeometry();
  gableGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -ROOF_W, 0, 0, ROOF_W, 0, ROOF_H, 0], 3));
  gableGeo.computeVertexNormals();

  const isRoof = (x, z) => !!typeAt(x, z)?.roof;
  const isFloor = (x, z) => !!typeAt(x, z)?.floor;
  function addRoof(x, z, wallHeight) {
    // Ridge along x if the house faces north/south, along z if it faces east/west.
    const facesNS = isFloor(x, z - 1) || isFloor(x, z + 1);
    const facesEW = isFloor(x - 1, z) || isFloor(x + 1, z);
    const alongX = facesNS || (!facesEW && (isRoof(x - 1, z) || isRoof(x + 1, z)));
    const group = new THREE.Group();
    group.add(new THREE.Mesh(roofGeo, roofMat));
    const [ax, az] = alongX ? [1, 0] : [0, 1];
    for (const s of [-1, 1]) {
      if (isRoof(x + ax * s, z + az * s)) continue;
      const g = new THREE.Mesh(gableGeo, gableMat);
      g.position.x = 0.5 * s;
      group.add(g);
    }
    group.rotation.y = alongX ? 0 : Math.PI / 2;
    group.position.set(x, wallHeight, z);
    scene.add(group);
  }

  // --- walls, with rounded bevels on true outside corners only.
  // A tile corner is an outside corner when the same wall tile shows both faces
  // that meet there; faces of neighbouring buildings in a row are coplanar and
  // never qualify, so rows of houses stay seamless.
  const BEVEL = level.bevel ?? 0.07; // radius in tiles
  const ARC_SEGMENTS = 3;            // per half of the quarter-round
  const sideOf = (dx, dz) => (dx ? (dx > 0 ? 'E' : 'W') : (dz > 0 ? 'S' : 'N'));
  const faceKey = (t, x, z, dx, dz) => t.faces[hash3(x, z, sideOf(dx, dz).charCodeAt(0)) % t.faces.length];
  const faceVisible = (t, x, z, dx, dz) => {
    const n = typeAt(x + dx, z + dz);
    return !!n && (n.floor || (n.low && !t.low));
  };

  // Builds a vertical strip from a list of columns {x, z, nx, nz, u}; v runs 0..1 up to height h.
  function strip(cols, h, key) {
    const pos = [], nor = [], uv = [], idx = [];
    cols.forEach((c, i) => {
      pos.push(c.x, 0, c.z, c.x, h, c.z);
      nor.push(c.nx, 0, c.nz, c.nx, 0, c.nz);
      uv.push(c.u, 0, c.u, 1);
      if (i) { const k = 2 * i; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    scene.add(new THREE.Mesh(g, material(key)));
  }

  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const t = typeAt(x, z);
      if (!t || !t.wall) continue;
      let wallHeight = 0;
      for (const [dx, dz] of Object.values(FACE_DIRS)) {
        const key = faceKey(t, x, z, dx, dz);
        const h = assets[key].aspect;
        wallHeight = Math.max(wallHeight, h);
        if (!faceVisible(t, x, z, dx, dz)) continue;

        // Face frame: outward normal n, "right" r as seen by a viewer facing the wall.
        const th = Math.atan2(dx, dz);
        const rx = Math.round(Math.cos(th)), rz = Math.round(-Math.sin(th));
        const cx = x + dx * 0.5, cz = z + dz * 0.5;
        const bevelEnd = faceVisible(t, x, z, rx, rz);      // corner at u = 1
        const bevelStart = faceVisible(t, x, z, -rx, -rz);  // corner at u = 0
        const u0 = bevelStart ? BEVEL : 0, u1 = bevelEnd ? 1 - BEVEL : 1;
        const at = (u) => ({ x: cx + rx * (u - 0.5), z: cz + rz * (u - 0.5), nx: dx, nz: dz, u });
        strip([at(u0), at(u1)], h, key);

        if (bevelEnd) {
          // Quarter-round between this face and the face whose normal is r. The first
          // half continues this face's texture, the second half the neighbour's.
          const qx = cx + rx * 0.5, qz = cz + rz * 0.5;           // the sharp corner
          const ax = qx - (dx + rx) * BEVEL, az = qz - (dz + rz) * BEVEL; // arc centre
          const other = faceKey(t, x, z, rx, rz);
          const arc = (phi, u) => {
            const nx = dx * Math.cos(phi) + rx * Math.sin(phi), nz = dz * Math.cos(phi) + rz * Math.sin(phi);
            return { x: ax + nx * BEVEL, z: az + nz * BEVEL, nx, nz, u };
          };
          const half = (from, to, uFrom, uTo, key2) => {
            const cols = [];
            for (let i = 0; i <= ARC_SEGMENTS; i++) {
              const k = i / ARC_SEGMENTS;
              cols.push(arc(from + (to - from) * k, uFrom + (uTo - uFrom) * k));
            }
            strip(cols, assets[key2].aspect, key2);
          };
          half(0, Math.PI / 4, 1 - BEVEL, 1, key);
          half(Math.PI / 4, Math.PI / 2, 0, BEVEL, other);
        }
      }
      if (t.roof) addRoof(x, z, wallHeight);
    }
  }

  // --- floor (one texture repeat per tile)
  const cobAsset = assets['textures/cobblestone'];
  const cob = cobAsset.texture;
  const floorScale = level.floorScale ?? 2; // tiles covered by one repeat of the texture
  cob.repeat.set(width / floorScale, depth / floorScale);
  const bump = cobAsset.height || cob; // dedicated height map if present
  bump.repeat.set(width / floorScale, depth / floorScale);
  // The floor is seen at grazing angles: use full anisotropic filtering so the
  // painted detail stays crisp instead of smearing.
  cob.anisotropy = bump.anisotropy = 16;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({
      map: cob,
      bumpMap: bump,
      bumpScale: cobAsset.height ? 1.5 : 4,
      roughness: 0.75, // slightly damp; painted highlights do most of the work
      metalness: 0,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((width - 1) / 2, 0, (depth - 1) / 2);
  scene.add(floor);
  // Hand-drawn outlines around each stone (needs a real height map).
  const ink = cobAsset.height ? addInkLines(floor.material, level.ink) : null;


  // --- lights
  const lights = [];
  const addLight = (spec, x, y, z) => {
    const l = new THREE.PointLight(spec.color, spec.intensity * LIGHT_SCALE, 7, 1.5);
    l.position.set(x, y, z);
    l.userData = { base: l.intensity, flicker: spec.flicker || 0, seed: Math.random() * 100 };
    scene.add(l);
    lights.push(l);
  };

  // --- blob shadows: a soft dark ellipse on the ground under each billboard.
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.85)');
    grd.addColorStop(0.55, 'rgba(0,0,0,0.5)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  // --- billboards
  const billboards = [];
  for (const e of level.entities) {
    const a = assets[e.sprite];
    const h = e.height, w = h / a.aspect;
    const mesh = new THREE.Mesh(panel(w, h), material(e.sprite, { side: THREE.DoubleSide }).clone());
    mesh.material.color.setScalar(1.5); // billboards read better slightly over-lit, like the concept art
    mesh.position.set(e.x, 0, e.z);
    scene.add(mesh);
    let shadow = null;
    if (e.shadow !== false) {
      // Sized from the sprite: wide props get a wide, shallow ellipse.
      const sw = e.shadowWidth ?? w * 0.95;
      shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.scale.set(sw, 1, Math.min(sw * 0.6, 0.45));
      shadow.position.set(e.x, 0.002, e.z);
      shadow.renderOrder = 1;
      scene.add(shadow);
    }
    billboards.push({
      entity: e, mesh, shadow,
      near: a.texture,
      far: e.far ? assets[e.far].texture : null,
    });
    if (e.light) addLight(e.light, e.x, e.light.y, e.z + 0.05);
  }

  // --- decals (flat on a wall face)
  for (const d of level.decals) {
    const a = assets[d.sprite];
    const [dx, dz] = FACE_DIRS[d.wall.face];
    const h = d.height, w = h / a.aspect;
    const mesh = new THREE.Mesh(panel(w, h), material(d.sprite));
    mesh.position.set(d.wall.x + dx * 0.51, d.y - h / 2, d.wall.z + dz * 0.51);
    mesh.rotation.y = Math.atan2(dx, dz);
    scene.add(mesh);
    if (d.light) addLight(d.light, d.wall.x + dx * 0.75, d.y + 0.1, d.wall.z + dz * 0.75);
  }

  // --- collision / queries
  const blockers = new Set(level.entities.filter((e) => e.block).map((e) => `${Math.round(e.x)},${Math.round(e.z)}`));
  const isWall = (x, z) => { const t = typeAt(x, z); return !t || !!t.wall; };
  const isBlocked = (x, z) => isWall(x, z) || blockers.has(`${x},${z}`);
  const entityAt = (x, z) => level.entities.find((e) => Math.round(e.x) === x && Math.round(e.z) === z);

  return {
    width, depth, lights, billboards, typeAt, isWall, isBlocked, entityAt, ink,

    update(time, camera, { farSwap = true, lightsOn = true } = {}) {
      for (const l of lights) {
        const u = l.userData;
        const n = Math.sin(time * 9 + u.seed) * 0.5 + Math.sin(time * 23 + u.seed * 3) * 0.3 + Math.sin(time * 4.1 + u.seed) * 0.2;
        l.intensity = lightsOn ? u.base * (1 + n * u.flicker) : 0;
      }
      const yaw = camera.rotation.y;
      for (const b of billboards) {
        b.mesh.rotation.y = yaw;
        if (b.shadow) b.shadow.rotation.y = yaw; // ellipse stays aligned with the sprite
        if (b.far) {
          const dist = Math.hypot(b.mesh.position.x - camera.position.x, b.mesh.position.z - camera.position.z);
          const tex = farSwap && dist > 6 ? b.far : b.near;
          if (b.mesh.material.map !== tex) b.mesh.material.map = tex;
        }
      }
    },
  };
}
