// Foundry Yard — a 44 x 28 m decommissioned foundry, rebuilt from scratch.
// Three lanes (Long A west, Mid through the furnace hall, Short B east) link
// two spike sites, and a new Boiler Room cuts between Mid and Site B.
// Everything solid is both a movement collider and a bullet stopper; all
// detail comes from procedural canvas textures, no external assets.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { x: -17, z: -10, label: 'A' },
  B: { x: 17, z: -10, label: 'B' },
};
export const SPAWNS = {
  vanguard: [[-14, 11], [-8, 12], [-2, 12], [4, 12], [10, 11], [16, 12]],
  cinder: [[-16, -11], [-8, -12], [0, -12], [8, -12], [16, -11], [-20, -6]],
};
// Bot waypoint graph. Nodes are plain {x, z} points; routes are index lists
// bots walk in order. Nodes 20-21 live inside the Boiler Room.
export const WAYPOINTS = [
  { x: -14, z: 11 }, { x: -8, z: 12 }, { x: -2, z: 12 }, { x: 4, z: 12 }, { x: 10, z: 11 },
  { x: -16, z: 0 }, { x: -8, z: 2 }, { x: 0, z: 2 }, { x: 8, z: 2 }, { x: 16, z: 0 },
  { x: -17, z: -10 }, { x: 17, z: -10 },
  { x: -16, z: -11 }, { x: -8, z: -12 }, { x: 0, z: -12 }, { x: 8, z: -12 }, { x: 16, z: -11 },
  { x: 0, z: -6 }, { x: -12, z: -6 }, { x: 12, z: -6 },
  { x: 15.5, z: -3.5 }, { x: 17.5, z: -6.5 },
];
export const ROUTES = {
  A: [5, 18, 10],
  B: [9, 19, 11],
  MID: [7, 17, 14],
  Boiler: [9, 20, 21, 11],
};

// Small deterministic RNG (mulberry32) so texture speckle is stable per seed.
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintCanvas(w, h, painter, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  painter(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFloorTexture() {
  return paintCanvas(512, 512, (g, w, h) => {
    const rnd = mulberry(101);
    g.fillStyle = '#2b2115';
    g.fillRect(0, 0, w, h);
    // Big poured-concrete slabs with dark joints, offset every other row.
    g.strokeStyle = '#191209';
    g.lineWidth = 4;
    for (let row = 0; row < 4; row += 1) {
      const y = row * 128;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      const off = row % 2 === 0 ? 0 : 64;
      for (let col = 0; col < 5; col += 1) {
        const x = ((col * 128 + off) % w);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 128); g.stroke();
      }
    }
    // Grit and scorch blotches.
    for (let i = 0; i < 2400; i += 1) {
      g.fillStyle = rnd() > 0.45 ? 'rgba(0,0,0,0.18)' : 'rgba(235,190,130,0.06)';
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    for (let i = 0; i < 10; i += 1) {
      g.fillStyle = 'rgba(8,4,2,0.22)';
      g.beginPath();
      g.ellipse(rnd() * w, rnd() * h, 26 + rnd() * 46, 14 + rnd() * 26, rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    // A faded amber guide line down the middle of the slab.
    g.strokeStyle = 'rgba(240,168,48,0.5)';
    g.lineWidth = 5;
    g.setLineDash([30, 20]);
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    g.setLineDash([]);
  }, 6, 4);
}

function makeWallTexture() {
  return paintCanvas(512, 512, (g, w, h) => {
    const rnd = mulberry(202);
    g.fillStyle = '#382a1c';
    g.fillRect(0, 0, w, h);
    // Vertical corrugation: alternating light ridges and dark valleys.
    for (let x = 0; x < w; x += 24) {
      g.fillStyle = (x / 24) % 2 === 0 ? 'rgba(255,215,150,0.07)' : 'rgba(0,0,0,0.16)';
      g.fillRect(x, 0, 12, h);
    }
    // Horizontal seams and bolt heads.
    g.strokeStyle = '#221809';
    g.lineWidth = 3;
    for (let y = 0; y <= h; y += 170) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    g.fillStyle = '#150e05';
    for (let y = 85; y < h; y += 170) {
      for (let x = 12; x < w; x += 24) {
        g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
      }
    }
    // Rust weeping down from the top edge.
    for (let i = 0; i < 22; i += 1) {
      const x = rnd() * w;
      const len = 50 + rnd() * 170;
      const grad = g.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, 'rgba(130,66,22,0.4)');
      grad.addColorStop(1, 'rgba(130,66,22,0)');
      g.fillStyle = grad;
      g.fillRect(x, 0, 4 + rnd() * 9, len);
    }
    // Chevrons along the skirting.
    g.fillStyle = '#c8932a';
    for (let x = -16; x < w; x += 32) {
      g.save();
      g.translate(x, h - 30);
      g.rotate(0.55);
      g.fillRect(0, 0, 15, 60);
      g.restore();
    }
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(0, h - 32, w, 5);
  }, 8, 1);
}

function makeCrateTexture() {
  return paintCanvas(256, 256, (g, w, h) => {
    const rnd = mulberry(303);
    g.fillStyle = '#5a4630';
    g.fillRect(0, 0, w, h);
    // Plank seams.
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 3;
    for (let y = 64; y < h; y += 64) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    // Steel corner brackets.
    g.strokeStyle = '#2b1f11';
    g.lineWidth = 7;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
    for (let i = 0; i < 420; i += 1) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    g.fillStyle = 'rgba(242,234,217,0.9)';
    g.textAlign = 'center';
    g.font = 'bold 36px sans-serif';
    g.fillText('EMBER', w / 2, h / 2 - 4);
    g.font = 'bold 20px sans-serif';
    g.fillText('FOUNDRY', w / 2, h / 2 + 26);
  });
}

function makeSignTexture(lines, bg, fg, accent) {
  return paintCanvas(256, 384, (g, w, h) => {
    const rnd = mulberry(lines.join('').length * 11 + 3);
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = accent;
    g.fillRect(0, 0, w, 12);
    g.fillRect(0, h - 12, w, 12);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.font = 'bold 42px sans-serif';
    lines.forEach((line, i) => g.fillText(line, w / 2, 96 + i * 54));
    g.strokeStyle = fg;
    g.lineWidth = 4;
    g.strokeRect(12, 12, w - 24, h - 24);
    for (let i = 0; i < 260; i += 1) {
      g.fillStyle = 'rgba(0,0,0,0.1)';
      g.fillRect(rnd() * w, rnd() * h, 3, 3);
    }
  });
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // One standard material per palette entry, plus the textured heroes.
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  materials.canvas = new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.95, metalness: 0.02 });
  materials.surface = new THREE.MeshStandardMaterial({ map: makeWallTexture(), roughness: 0.85, metalness: 0.15 });
  materials.hairline = new THREE.MeshStandardMaterial({ map: makeCrateTexture(), roughness: 0.9, metalness: 0.05 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.45, metalness: 0.7 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 0.5, metalness: 0.6 });
  const tealBarrel = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.55, metalness: 0.3 });
  const emberBarrel = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.55, metalness: 0.3 });

  const colliders = [];
  const shootables = [];

  // Solid box: a collider for movement and a surface bullets stop on.
  function solid(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  // Arbitrary mesh prop: same bookkeeping, caller picks the shape.
  function prop(mesh, collide = false) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  // Flat wall sign: decoration only, never a collider or a bullet stopper.
  function sign(lines, bg, fg, accent, w, h, x, y, z, rotY) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: makeSignTexture(lines, bg, fg, accent), roughness: 0.85 }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    group.add(mesh);
    return mesh;
  }
  function markSite(site, material) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.0, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE[material]), side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    group.add(ring);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 0.3), materials[material]);
    post.position.set(site.x + 2.4, 1.1, site.z - 2.4);
    post.castShadow = true;
    group.add(post);
  }

  // ---- Shell: floor + four outer walls, 44 x 28 m, 5 m high, open sky ----
  solid(44.4, 0.4, 28.4, 0, -0.2, 0, 'canvas');
  solid(0.4, 5, 28.4, -22.2, 2.5, 0, 'surface');
  solid(0.4, 5, 28.4, 22.2, 2.5, 0, 'surface');
  solid(44.4, 5, 0.4, 0, 2.5, -14.2, 'surface');
  solid(44.4, 5, 0.4, 0, 2.5, 14.2, 'surface');

  // ---- Furnace hall: the mid pillar and its two low flanking blocks ----
  solid(2.2, 4.4, 2.2, 0, 2.2, -2, 'hairline');
  solid(3.4, 1.2, 1.4, -5.4, 0.6, -2, 'hairline');
  solid(3.4, 1.2, 1.4, 5.4, 0.6, -2, 'hairline');

  // ---- Long A: tall crate wall with a gap, low corner crate ----
  solid(1.2, 2.6, 6.0, -13, 1.3, -4, 'surface');
  solid(1.6, 0.8, 1.6, -16.5, 0.4, -5.5, 'hairline');
  solid(2.2, 1.1, 1.2, -10, 0.55, 6, 'hairline');

  // ---- Short B: stacked crates for a boostable sightline over the site ----
  solid(1.6, 0.8, 1.6, 14, 0.4, -5, 'hairline');
  solid(1.6, 0.8, 1.6, 14, 1.2, -5, 'hairline');
  solid(2.4, 1.1, 1.2, 10, 0.55, 6, 'hairline');

  // ---- Spawn cover and the mid connectors ----
  solid(2.0, 1.0, 1.0, -6, 0.5, 8, 'hairline');
  solid(2.0, 1.0, 1.0, 6, 0.5, 8, 'hairline');
  solid(1.2, 2.2, 1.2, -4, 1.1, -8, 'surface');
  solid(1.2, 2.2, 1.2, 4, 1.1, -8, 'surface');
  solid(6.0, 0.5, 2.4, 0, 0.25, -11.5, 'surface');
  markSite(SITES.A, 'teal');
  markSite(SITES.B, 'ember');

  // ---- NEW: Boiler Room — connector between Mid-east and Site B ----
  // Footprint x 12.5..20.5, z -9.5..-2.5, walls 3.2 m high. Three doors:
  // south gap (x 13.2..16.2) from Mid, west gap (z -7..-5) from Short B's
  // approach, north gap (x 15..18) out to Site B. The old B route and the
  // new Boiler route both thread these gaps.
  // South wall (facing Mid).
  solid(0.7, 3.2, 0.4, 12.85, 1.6, -2.5, 'surface');
  solid(4.3, 3.2, 0.4, 18.35, 1.6, -2.5, 'surface');
  // West wall (facing Short B).
  solid(0.4, 3.2, 2.5, 12.5, 1.6, -8.25, 'surface');
  solid(0.4, 3.2, 2.5, 12.5, 1.6, -3.75, 'surface');
  // North wall (facing Site B).
  solid(2.5, 3.2, 0.4, 13.75, 1.6, -9.5, 'surface');
  solid(2.5, 3.2, 0.4, 19.25, 1.6, -9.5, 'surface');
  // Overhead beams so the room reads as enclosed without a ceiling.
  solid(8.0, 0.25, 0.5, 16.5, 3.4, -4, 'surface', false);
  solid(8.0, 0.25, 0.5, 16.5, 3.4, -8, 'surface', false);
  // The boiler itself: a fat horizontal tank along the east side.
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 3.4, 20), brassMat);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(18.7, 1.05, -4.3);
  prop(tank, true);
  // Rivet rings around the tank.
  for (const rx of [17.4, 18.7, 20.0]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.05, 8, 24), steelMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(rx, 1.05, -4.3);
    prop(ring, false);
  }
  // A vertical pressure vessel in the north-east corner.
  const vessel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.8, 16), steelMat);
  vessel.position.set(19.8, 0.9, -7.5);
  prop(vessel, true);
  // Pressure gauge: brass rim, glowing amber dial on the tank's south face.
  const gauge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16),
    new THREE.MeshStandardMaterial({ color: 0x2a1c08, emissive: new THREE.Color('#ffb35c'), emissiveIntensity: 1.6 }),
  );
  gauge.rotation.x = Math.PI / 2;
  gauge.position.set(18.7, 1.6, -3.26);
  group.add(gauge);
  // Steam pipes climbing the north wall inside the room.
  for (const px of [13.6, 14.3, 15.0]) {
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.2, 10), brassMat);
    riser.position.set(px, 1.6, -9.05);
    prop(riser, false);
  }
  // Floor grate under the room's centre (flush, no collision).
  solid(2.6, 0.06, 2.6, 16, 0.03, -6, 'ink', false);
  sign(['BOILER', 'ROOM'], '#1c1408', '#f0a830', '#e4572e', 2.2, 3.2, 13.75, 2.2, -9.24, 0);
  sign(['HOT', 'STEAM'], '#3d0f0f', '#ffd9c9', '#e4572e', 1.8, 2.6, 12.76, 2.2, -3.75, Math.PI / 2);

  // ---- Wall signs (flat, no collision) ----
  sign(['SITE', 'A'], '#123f3c', '#eafaf7', '#2ec4b6', 2.2, 3.2, -17, 2.6, -13.95, 0);
  sign(['SITE', 'B'], '#4a1c0e', '#ffe9dc', '#e4572e', 2.2, 3.2, 17, 2.6, -13.95, 0);
  sign(['DANGER', 'HOT', 'METAL'], '#1c1408', '#f0a830', '#e4572e', 2.0, 3.0, -6, 2.4, -13.95, 0);
  sign(['EMBER', 'LINE'], '#221a13', '#f2ead9', '#f0a830', 2.6, 3.8, 6, 2.8, -13.95, 0);
  sign(['FOUNDRY', 'YARD'], '#221a13', '#f2ead9', '#2ec4b6', 3.0, 2.2, 0, 3.0, 13.95, Math.PI);
  sign(['KEEP', 'OUT'], '#3d0f0f', '#ffd9c9', '#e4572e', 1.8, 2.6, -12, 2.4, 13.95, Math.PI);
  sign(['CINDER', 'CREW'], '#1c1408', '#f0a830', '#e4572e', 2.0, 2.8, 12, 2.4, 13.95, Math.PI);
  sign(['LONG', 'A'], '#123f3c', '#eafaf7', '#2ec4b6', 2.0, 3.0, -21.95, 2.6, -4, Math.PI / 2);
  sign(['SHORT', 'B'], '#4a1c0e', '#ffe9dc', '#e4572e', 2.0, 3.0, 21.95, 2.6, -4, -Math.PI / 2);
  sign(['MID'], '#221a13', '#f0a830', '#2ec4b6', 1.6, 2.4, -21.95, 2.4, 6, Math.PI / 2);

  // ---- Yard dressing: wall pipe runs, barrels, corner crates ----
  function pipeRun(x, y, z, len, alongX) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, len, 12), brassMat);
    m.position.set(x, y, z);
    if (alongX) m.rotation.z = Math.PI / 2;
    else m.rotation.x = Math.PI / 2;
    prop(m);
  }
  pipeRun(0, 4.6, -13.9, 44, true);
  pipeRun(0, 4.6, 13.9, 44, true);
  pipeRun(-21.9, 4.4, 0, 28, false);
  pipeRun(21.9, 4.4, 0, 28, false);
  function barrel(x, z, mat) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 16), mat);
    m.position.set(x, 0.55, z);
    prop(m, true);
  }
  barrel(-20.5, 8, tealBarrel); barrel(-19.6, 8.6, emberBarrel); barrel(-20.5, -12.5, emberBarrel);
  barrel(20.5, 8, emberBarrel); barrel(19.6, 8.6, tealBarrel); barrel(20.5, -12.5, tealBarrel);
  barrel(-20.5, 2, emberBarrel); barrel(20.5, 2, tealBarrel);
  // Low crates tucked against the walls, out of every lane.
  solid(1.4, 0.7, 1.4, -19.5, 0.35, -8, 'hairline');
  solid(1.4, 0.7, 1.4, 19.5, 0.35, -8, 'hairline');
  solid(1.4, 0.7, 1.4, -19.5, 0.35, 12, 'hairline');
  solid(1.4, 0.7, 1.4, 19.5, 0.35, 12, 'hairline');
  // Furnace chimney in the north-west corner + the glowing furnace mouth.
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 7, 14), steelMat);
  chimney.position.set(-20, 3.5, -12);
  prop(chimney, true);
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.0, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x1a0d05, emissive: new THREE.Color('#ff7a1a'), emissiveIntensity: 2.2 }),
  );
  glow.position.set(0, 0.7, -3.15);
  group.add(glow);

  // Hanging lamps over Mid, both sites and the Boiler Room.
  function lamp(x, y, z, color) {
    const shadeMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 0.4, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: new THREE.Color(color), emissiveIntensity: 0.9, side: THREE.DoubleSide }),
    );
    shadeMesh.position.set(x, y, z);
    group.add(shadeMesh);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }),
    );
    bulb.position.set(x, y - 0.2, z);
    group.add(bulb);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 5 - y, 6), steelMat);
    cord.position.set(x, (5 + y) / 2, z);
    group.add(cord);
  }
  lamp(0, 3.6, -2, '#ffb35c');
  lamp(-17, 3.6, -10, '#2ec4b6');
  lamp(17, 3.6, -10, '#e4572e');
  lamp(16.5, 3.4, -6, '#ff8c2e');

  // Dust motes drifting in the light — atmosphere only, no gameplay effect.
  const dustCount = 260;
  const dustPos = new Float32Array(dustCount * 3);
  const dr = mulberry(909);
  for (let i = 0; i < dustCount; i += 1) {
    dustPos[i * 3] = (dr() - 0.5) * 42;
    dustPos[i * 3 + 1] = 0.4 + dr() * 4.2;
    dustPos[i * 3 + 2] = (dr() - 0.5) * 27;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xffd9a0, size: 0.07, transparent: true, opacity: 0.45, sizeAttenuation: true,
  }));
  group.add(dust);

  // ---- Lighting: dusk amber key, cool teal fill, warm furnace glow ----
  scene.add(new THREE.HemisphereLight(new THREE.Color('#f0c98a'), new THREE.Color(PALETTE.canvas), 1.7));
  scene.add(new THREE.AmbientLight(new THREE.Color('#ffe0b3'), 0.55));
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb35c'), 3.0);
  key.position.set(14, 18, 10);
  key.target.position.set(0, 0, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.teal), 0.8);
  fill.position.set(-12, 10, 12);
  scene.add(fill);
  const furnaceLight = new THREE.PointLight(new THREE.Color('#ff7a1a'), 30, 14, 1.8);
  furnaceLight.position.set(0, 1.2, -3.4);
  scene.add(furnaceLight);
  const siteALight = new THREE.PointLight(new THREE.Color(PALETTE.teal), 14, 10, 1.8);
  siteALight.position.set(-17, 3.2, -10);
  scene.add(siteALight);
  const siteBLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 14, 10, 1.8);
  siteBLight.position.set(17, 3.2, -10);
  scene.add(siteBLight);
  // Boiler Room's own hot work light.
  const boilerLight = new THREE.PointLight(new THREE.Color('#ff8c2e'), 12, 10, 1.8);
  boilerLight.position.set(16.5, 3.0, -6);
  scene.add(boilerLight);

  return { colliders, shootables, group };
}
