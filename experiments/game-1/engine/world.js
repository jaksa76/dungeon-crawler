import * as THREE from 'three';
import { addInkLines } from './ink.js';
import { planLayout, FACE_DIRS } from './layout.js';

// Builds the 3D scene for a tile-based location:
// walls stacked from storeys (optionally jettied), gable roofs with chimneys,
// a cobbled floor, floor decals, billboard sprites, wall decals and point lights.
//
// Units: x, z and wall offsets (`u`) are in tiles; every height (`height`, `y`)
// in level data is in metres (see `level.scale`).

const LIGHT_SCALE = 2.0;

export function buildWorld(scene, level, tileTypes, assets) {
  const layout = planLayout(level, tileTypes, assets);
  const { M, width, depth, typeAt } = layout;

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

  const beamMat = new THREE.MeshLambertMaterial({ color: 0x3a2416, side: THREE.DoubleSide });
  function quad(p, mat) { // four [x, y, z] corners in order
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p.flat(), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, mat));
  }

  // --- roofs: gable roofs whose ridge runs along the street-facing side, so
  // neighbouring tiles of the same height join into continuous rooflines.
  const roofTex = assets['textures/roof-tiles'].texture;
  roofTex.repeat.set(1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ map: roofTex, side: THREE.DoubleSide });
  const gableMat = new THREE.MeshLambertMaterial({ color: 0x3a2618, side: THREE.DoubleSide });
  const chimneyMat = new THREE.MeshLambertMaterial({ color: 0x4e4458 });
  const chimneyCapMat = new THREE.MeshLambertMaterial({ color: 0x2a2430 });

  function roofGeometry(H, W) {
    const id = `roof${H.toFixed(3)}x${W.toFixed(3)}`;
    if (geometries.has(id)) return geometries.get(id);
    const slope = Math.hypot(W, H);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.5, 0, -W, 0.5, 0, -W, 0.5, H, 0, -0.5, 0, -W, 0.5, H, 0, -0.5, H, 0,
      -0.5, 0, W, -0.5, H, 0, 0.5, H, 0, -0.5, 0, W, 0.5, H, 0, 0.5, 0, W,
    ], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([
      0, 0, 1, 0, 1, slope, 0, 0, 1, slope, 0, slope,
      0, 0, 0, slope, 1, slope, 0, 0, 1, slope, 1, 0,
    ], 2));
    g.computeVertexNormals();
    geometries.set(id, g);
    return g;
  }
  function gableGeometry(H, W) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -W, 0, 0, W, 0, H, 0], 3));
    g.computeVertexNormals();
    return g;
  }
  const roofW = (b) => 0.5 + b.outTop + 0.1;

  function addRoof(b) {
    const H = b.roofH, W = roofW(b);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(roofGeometry(H, W), roofMat));
    const [ax, az] = b.alongX ? [1, 0] : [0, 1];
    for (const s of [-1, 1]) {
      const n = layout.at(b.x + ax * s, b.z + az * s);
      const joins = n && n.roof && n.alongX === b.alongX && Math.abs(n.top - b.top) < 1e-4
        && Math.abs(n.roofH - H) < 1e-4 && Math.abs(roofW(n) - W) < 1e-4;
      if (joins) continue;
      const g = new THREE.Mesh(gableGeometry(H, W), gableMat);
      g.position.x = (0.5 - 0.003) * s; // just inside, so a taller neighbour's wall wins
      group.add(g);
    }
    if (b.chimney) {
      const along = ((b.x * 7 + b.z * 13) % 5) / 5 - 0.4; // -0.4 .. 0.4
      const side = (b.x + b.z) % 2 ? 0.18 : -0.18;
      const ch = 0.42 + H * 0.6;
      const base = H * (1 - Math.abs(side) / W); // roof height at that point
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.13, ch, 0.13).translate(0, ch / 2, 0), chimneyMat);
      c.position.set(along, base - 0.15, side);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.17), chimneyCapMat);
      cap.position.set(along, base - 0.15 + ch, side);
      group.add(c, cap);
    }
    group.rotation.y = b.alongX ? 0 : Math.PI / 2;
    group.position.set(b.x, b.top, b.z);
    scene.add(group);
  }

  // --- walls, with rounded bevels on true outside corners only.
  // A tile corner is an outside corner when the same wall tile shows both faces
  // that meet there as street faces; faces of neighbouring buildings in a row are
  // coplanar and never qualify, so rows of houses stay seamless.
  const BEVEL = level.bevel ?? 0.07; // radius in tiles
  const ARC_SEGMENTS = 3;            // per half of the quarter-round

  // Vertical strip through columns {x, z, nx, nz, u}, pushed `out` along each normal.
  function strip(cols, y0, y1, v0, v1, key, out) {
    const pos = [], nor = [], uv = [], idx = [];
    cols.forEach((c, i) => {
      const x = c.x + c.nx * out, z = c.z + c.nz * out;
      pos.push(x, y0, z, x, y1, z);
      nor.push(c.nx, 0, c.nz, c.nx, 0, c.nz);
      uv.push(c.u, v0, c.u, v1);
      if (i) { const k = 2 * i; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    scene.add(new THREE.Mesh(g, material(key)));
  }

  // Texture v-range for storey i of building b drawn with `key`.
  function vRange(b, i, key) {
    const lv = b.levels[i];
    if (!b.storeys) return [0, lv.y1 / assets[key].aspect]; // plain wall: repeat upwards
    const [g, u] = layout.split(key);
    return i === 0 ? [0, g] : [g, lv.top ? 1 : u];
  }

  for (const b of layout.buildings.values()) {
    const { x, z } = b;
    for (const [dx, dz] of Object.values(FACE_DIRS)) {
      const from = layout.visibleFrom(x, z, dx, dz);
      if (from === null) continue;
      const street = from === 0;
      const keys = layout.faceKeys(x, z, dx, dz);

      // Face frame: outward normal n, "right" r as seen by a viewer facing the wall.
      const th = Math.atan2(dx, dz);
      const rx = Math.round(Math.cos(th)), rz = Math.round(-Math.sin(th));
      const cx = x + dx * 0.5, cz = z + dz * 0.5;
      const bevelEnd = street && layout.visibleFrom(x, z, rx, rz) === 0;     // corner at u = 1
      const bevelStart = street && layout.visibleFrom(x, z, -rx, -rz) === 0; // corner at u = 0
      const u0 = bevelStart ? BEVEL : 0, u1 = bevelEnd ? 1 - BEVEL : 1;
      const at = (u) => ({ x: cx + rx * (u - 0.5), z: cz + rz * (u - 0.5), nx: dx, nz: dz, u });
      const otherKeys = bevelEnd ? layout.faceKeys(x, z, rx, rz) : null;

      let prevOut = 0;
      b.levels.forEach((lv, i) => {
        if (lv.y1 <= from + 1e-4) return;
        const key = keys[i];
        let [v0, v1] = vRange(b, i, key);
        let y0 = lv.y0;
        if (y0 < from) { v0 += ((v1 - v0) * (from - y0)) / (lv.y1 - y0); y0 = from; }
        const out = street ? lv.out : 0;
        strip([at(u0), at(u1)], y0, lv.y1, v0, v1, key, out);

        if (bevelEnd) {
          // Quarter-round between this face and the face whose normal is r. The first
          // half continues this face's texture, the second half the neighbour's.
          const qx = cx + rx * 0.5, qz = cz + rz * 0.5;                   // the sharp corner
          const ax = qx - (dx + rx) * BEVEL, az = qz - (dz + rz) * BEVEL; // arc centre
          const other = otherKeys[i];
          const arc = (phi, u) => {
            const nx = dx * Math.cos(phi) + rx * Math.sin(phi), nz = dz * Math.cos(phi) + rz * Math.sin(phi);
            return { x: ax + nx * BEVEL, z: az + nz * BEVEL, nx, nz, u };
          };
          const half = (a0, a1, uFrom, uTo, k2) => {
            const cols = [];
            for (let j = 0; j <= ARC_SEGMENTS; j++) {
              const k = j / ARC_SEGMENTS;
              cols.push(arc(a0 + (a1 - a0) * k, uFrom + (uTo - uFrom) * k));
            }
            const [w0, w1] = vRange(b, i, k2);
            strip(cols, y0, lv.y1, w0, w1, k2, out);
          };
          half(0, Math.PI / 4, 1 - BEVEL, 1, key);
          half(Math.PI / 4, Math.PI / 2, 0, BEVEL, other);
        }

        if (out > 0) {
          // End caps where the overhang stops, and a soffit under each step out.
          const P = (u, o, y) => { const c = at(u); return [c.x + dx * o, y, c.z + dz * o]; };
          if (!bevelStart) quad([P(0, 0, y0), P(0, out, y0), P(0, out, lv.y1), P(0, 0, lv.y1)], beamMat);
          if (!bevelEnd) quad([P(1, 0, y0), P(1, out, y0), P(1, out, lv.y1), P(1, 0, lv.y1)], beamMat);
          if (out > prevOut) quad([P(u0, prevOut, y0), P(u1, prevOut, y0), P(u1, out, y0), P(u0, out, y0)], beamMat);
        }
        prevOut = out;
      });
    }
    if (b.roof) addRoof(b);
  }

  // --- floor (one texture repeat per `floorScale` tiles)
  const cobAsset = assets['textures/cobblestone'];
  const cob = cobAsset.texture;
  const floorScale = level.floorScale ?? 2;
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
      roughness: level.floorRoughness ?? 0.75,
      metalness: 0,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((width - 1) / 2, 0, (depth - 1) / 2);
  scene.add(floor);
  // Hand-drawn outlines around each stone (needs a real height map).
  const ink = cobAsset.height ? addInkLines(floor.material, level.ink) : null;

  // --- floor decals: flat sprites on the ground (puddles, leaves, ...).
  // Puddles are glossy so lamps leave sharp highlights in them, like wet stone.
  const floorDecalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  for (const d of level.floorDecals || []) {
    const a = assets[d.sprite];
    const m = new THREE.Mesh(floorDecalGeo, new THREE.MeshStandardMaterial({
      map: a.texture, transparent: true, depthWrite: false,
      roughness: d.roughness ?? 0.08, metalness: 0,
      emissive: 0xffffff, emissiveMap: a.texture, emissiveIntensity: 0.18, // the sky it reflects
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    const w = d.width * M;
    m.scale.set(w, 1, w * a.aspect);
    m.rotation.y = d.rotation || 0;
    m.position.set(d.x, 0.001, d.z);
    m.renderOrder = 0;
    scene.add(m);
  }

  // --- lights
  const lights = [];
  const lightRange = level.lightRange ?? 4.5;
  const addLight = (spec, x, y, z) => {
    const l = new THREE.PointLight(spec.color, spec.intensity * LIGHT_SCALE, spec.range ?? lightRange, level.lightDecay ?? 1.5);
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

  // --- billboards. Normals tilt upwards so lights above a sprite (a torch over a
  // sack) still light it; a flat facing normal would leave it black.
  const billboards = [];
  const spritePanel = (w, h) => {
    const id = `sprite${w}x${h}`;
    if (!geometries.has(id)) {
      const g = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
      const n = g.attributes.normal;
      for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 0.6, 0.8);
      geometries.set(id, g);
    }
    return geometries.get(id);
  };
  const overlit = new Map();
  const billboardMaterial = (key) => {
    // Billboards read better slightly over-lit, like the concept art.
    if (!overlit.has(key)) {
      const m = material(key, { side: THREE.DoubleSide }).clone();
      m.color.setScalar(1.5);
      overlit.set(key, m);
    }
    return overlit.get(key);
  };
  for (const e of level.entities) {
    const a = assets[e.sprite];
    const h = e.height * M, w = h / a.aspect;
    let mat = billboardMaterial(e.sprite);
    if (e.far) mat = mat.clone(); // swaps its map with distance
    const mesh = new THREE.Mesh(spritePanel(w, h), mat);
    mesh.position.set(e.x, (e.y || 0) * M, e.z);
    scene.add(mesh);
    let shadow = null;
    if (e.shadow !== false && !e.y) {
      // Sized from the sprite: wide props get a wide, shallow ellipse.
      const sw = e.shadowWidth !== undefined ? e.shadowWidth * M : w * 0.95;
      shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.scale.set(sw, 1, Math.min(sw * 0.6, 0.45));
      shadow.position.set(e.x, 0.002, e.z);
      shadow.renderOrder = 1;
      scene.add(shadow);
    }
    // Optional turned views of a prop that has a facing (see `viewSprite` in update()).
    // Each view is drawn at the entity's `height`, so its width follows its own aspect.
    const viewOf = (key) => ({ tex: assets[key].texture, glow: assets[key].glow, w: h / assets[key].aspect });
    const views = e.views
      ? { front: { tex: a.texture, glow: a.glow, w },
          ...Object.fromEntries(Object.entries(e.views).map(([k, key]) => [k, viewOf(key)])) }
      : null;
    billboards.push({
      entity: e, mesh, shadow, w, views,
      facing: e.facing ? FACE_DIRS[e.facing] : null,
      near: a.texture,
      far: e.far ? assets[e.far].texture : null,
    });
    if (e.light) addLight(e.light, e.x, e.light.y * M, e.z + 0.05);
  }

  // --- decals: flat on a wall face, or `blade` (sticking out of it, like a
  // hanging sign). `u` shifts along the face (-0.5..0.5, + is right when facing it).
  for (const d of level.decals) {
    const a = assets[d.sprite];
    const { x, z, face } = d.wall;
    const [dx, dz] = FACE_DIRS[face];
    const th = Math.atan2(dx, dz);
    const rx = Math.round(Math.cos(th)), rz = Math.round(-Math.sin(th));
    const h = d.height * M, w = h / a.aspect, y = d.y * M, u = d.u || 0;
    const out = layout.outAt(x, z, dx, dz, y) + 0.5 + (d.depth ?? 0.01);
    const mesh = new THREE.Mesh(d.blade ? spritePanel(w, h) : panel(w, h), d.blade ? billboardMaterial(d.sprite) : material(d.sprite));
    if (d.blade) {
      mesh.position.set(x + dx * (out + w / 2) + rx * u, y - h / 2, z + dz * (out + w / 2) + rz * u);
      mesh.rotation.y = th + Math.PI / 2 * (d.flip ? -1 : 1);
    } else {
      mesh.position.set(x + dx * out + rx * u, y - h / 2, z + dz * out + rz * u);
      mesh.rotation.y = th;
    }
    scene.add(mesh);
    if (d.light) {
      const lo = out + (d.light.out ?? 0.2);
      addLight(d.light, x + dx * lo + rx * u, y + 0.1 * M, z + dz * lo + rz * u);
    }
  }

  // --- collision / queries. Unnamed entities are scenery: never block, never described.
  const blockers = new Set(level.entities.filter((e) => e.block).map((e) => `${Math.round(e.x)},${Math.round(e.z)}`));
  const isWall = (x, z) => { const t = typeAt(x, z); return !t || !!t.wall; };
  const isBlocked = (x, z) => isWall(x, z) || blockers.has(`${x},${z}`);
  const entityAt = (x, z) => level.entities.find((e) => e.name && Math.round(e.x) === x && Math.round(e.z) === z);

  return {
    width, depth, lights, billboards, typeAt, isWall, isBlocked, entityAt, ink, layout,

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
        if (b.views && b.facing) {
          // Which way does the prop appear to face, seen from where the camera is?
          // cos = how squarely we look at its front; side > 0 = it faces screen-right.
          const ux = camera.position.x - b.mesh.position.x, uz = camera.position.z - b.mesh.position.z;
          const len = Math.hypot(ux, uz) || 1;
          const cos = (ux * b.facing[0] + uz * b.facing[1]) / len;
          const right = (b.facing[0] * Math.cos(yaw) - b.facing[1] * Math.sin(yaw)) > 0;
          const name = cos > 0.94 ? 'front'
            : cos > 0.64 ? (right ? 'threeQuarterRight' : 'threeQuarterLeft')
            : (right ? 'sideRight' : 'sideLeft'); // past ~50° (or behind it) the side view is the nearest art
          const v = b.views[name] || b.views.front;
          if (b.mesh.material.map !== v.tex) {
            b.mesh.material.map = v.tex;
            b.mesh.material.emissiveMap = v.glow;
          }
          b.mesh.scale.x = v.w / b.w;
          if (b.shadow && b.entity.shadowWidth == null) b.shadow.scale.x = v.w * 0.95;
        }
        if (b.far) {
          const dist = Math.hypot(b.mesh.position.x - camera.position.x, b.mesh.position.z - camera.position.z);
          const tex = farSwap && dist > 6 ? b.far : b.near;
          if (b.mesh.material.map !== tex) b.mesh.material.map = tex;
        }
      }
    },
  };
}
