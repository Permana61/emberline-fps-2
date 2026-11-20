// Weapons: one table, one view model, one set of rules. Main owns the ray
// and the damage; this module owns the numbers, the magazine and the kick.
// Spread grows with movement speed and with sustained fire, so stopping to
// aim pays — the same rule the bots shoot by.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  sidearm: { name: 'P9 Sidearm', price: 0, damage: 26, headMult: 2, mag: 12, reserve: 48, gap: 0.16, reload: 1.4, spreadStill: 0.003, spreadMove: 0.02, auto: false, range: 45 },
  rifle: { name: 'AK-47', price: 2700, damage: 34, headMult: 2, mag: 30, reserve: 90, gap: 0.096, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, auto: true, range: 80 },
  smg: { name: 'HX-9 SMG', price: 1400, damage: 22, headMult: 2, mag: 28, reserve: 112, gap: 0.07, reload: 1.6, spreadStill: 0.004, spreadMove: 0.024, auto: true, range: 40 },
  shotgun: { name: 'M870 Breacher', price: 1800, damage: 14, headMult: 1.6, mag: 6, reserve: 24, gap: 0.8, reload: 2.4, spreadStill: 0.02, spreadMove: 0.03, auto: false, pellets: 7, range: 22 },
  sniper: { name: 'LW-50 Longshot', price: 4200, damage: 95, headMult: 2, mag: 5, reserve: 15, gap: 1.1, reload: 2.8, spreadStill: 0.0008, spreadMove: 0.05, auto: false, range: 90 },
  // VK-7 Vandal: hard-hitting assault rifle. More damage per shot than the
  // AK-47, but a slower fire rate, a smaller magazine and a much harder kick,
  // so every shot has to count.
  vandal: { name: 'VK-7 Vandal', price: 3100, damage: 40, headMult: 2, mag: 25, reserve: 75, gap: 0.13, reload: 2.1, spreadStill: 0.0025, spreadMove: 0.03, auto: true, range: 75, kick: 0.09, bloom: 0.18 },
};
export const GRENADE = { name: 'Frag Grenade', price: 300, damage: 90, radius: 5.5, fuse: 1.6 };

export function createWeapon(camera) {
  // Dark gunmetal only — no brown/cream anywhere, so nothing reads as wood.
  const mats = {
    steel: new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.38, metalness: 0.85 }),
    bright: new THREE.MeshStandardMaterial({ color: 0x43484f, roughness: 0.3, metalness: 0.9 }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: 0.65, metalness: 0.15 }),
    grip: new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.6, metalness: 0.2 }),
  };

  function cube(mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    return mesh;
  }

  function barrel(mat, r, len, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat);
    mesh.rotation.x = Math.PI / 2; // cylinder axis -> along Z (the barrel line)
    mesh.position.set(x, y, z);
    return mesh;
  }

  function gripAndStock(g, stockLen = 0.22) {
    g.add(cube(mats.grip, 0.05, 0.14, 0.06, 0, -0.12, 0.15, 0.35)); // pistol grip
    g.add(cube(mats.bright, 0.012, 0.05, 0.02, 0, -0.09, 0.06, 0.2)); // trigger
    g.add(cube(mats.steel, 0.015, 0.012, 0.1, 0, -0.115, 0.07)); // trigger guard
    g.add(cube(mats.polymer, 0.07, 0.085, stockLen, 0, -0.015, 0.32)); // stock
    g.add(cube(mats.grip, 0.075, 0.1, 0.02, 0, -0.015, 0.435)); // butt plate
  }

  // AK-47: long receiver, long barrel, gas tube, front sight, and the
  // signature curved (banana) magazine — built from 4 angled segments.
  function buildAK47() {
    const g = new THREE.Group();
    g.add(cube(mats.steel, 0.085, 0.105, 0.44, 0, 0, 0)); // receiver
    g.add(cube(mats.bright, 0.07, 0.018, 0.38, 0, 0.06, -0.01)); // top cover
    g.add(cube(mats.steel, 0.05, 0.03, 0.06, 0, 0.075, 0.1)); // rear sight block
    g.add(cube(mats.bright, 0.03, 0.012, 0.1, 0, 0.085, 0.02, -0.08)); // sight leaf
    g.add(barrel(mats.steel, 0.014, 0.38, 0, 0.018, -0.4)); // barrel
    g.add(barrel(mats.bright, 0.012, 0.28, 0, 0.055, -0.33)); // gas tube
    g.add(cube(mats.steel, 0.04, 0.05, 0.05, 0, 0.04, -0.44)); // gas block
    g.add(cube(mats.polymer, 0.075, 0.065, 0.2, 0, 0.005, -0.3)); // handguard
    for (const z of [-0.24, -0.3, -0.36]) {
      g.add(cube(mats.polymer, 0.08, 0.07, 0.015, 0, 0.005, z));
    }
    g.add(cube(mats.steel, 0.045, 0.025, 0.04, 0, 0.06, -0.57)); // front sight base
    g.add(cube(mats.bright, 0.012, 0.05, 0.012, 0, 0.09, -0.57)); // sight post
    g.add(cube(mats.steel, 0.008, 0.04, 0.03, -0.02, 0.085, -0.57));
    g.add(cube(mats.steel, 0.008, 0.04, 0.03, 0.02, 0.085, -0.57));
    g.add(barrel(mats.bright, 0.019, 0.07, 0, 0.018, -0.62)); // muzzle
    g.add(cube(mats.steel, 0.035, 0.035, 0.03, 0, 0.018, -0.65, 0, 0, Math.PI / 4)); // muzzle nut
    // Curved magazine — each segment swings further forward as it goes down.
    const magSteps = [
      [0, -0.11, -0.03, 0.1],
      [0, -0.175, -0.065, 0.3],
      [0, -0.235, -0.115, 0.52],
      [0, -0.285, -0.175, 0.75],
    ];
    for (const [x, y, z, tilt] of magSteps) {
      g.add(cube(mats.bright, 0.05, 0.13, 0.065, x, y, z, tilt));
    }
    g.add(cube(mats.polymer, 0.055, 0.02, 0.075, 0, -0.335, -0.21, 0.75)); // mag base plate
    g.add(cube(mats.bright, 0.03, 0.02, 0.05, 0.055, 0.01, -0.02)); // charging handle
    g.add(cube(mats.steel, 0.008, 0.015, 0.09, 0.047, 0.03, 0.05)); // selector lever
    gripAndStock(g);
    return g;
  }

  // VK-7 Vandal: angular slab receiver, long vented handguard, vertical
  // foregrip, compensator muzzle and a straight 25-round magazine — a
  // heavier, sharper silhouette than the AK, to match the harder kick.
  function buildVandal() {
    const g = new THREE.Group();
    g.add(cube(mats.steel, 0.09, 0.11, 0.42, 0, 0, 0)); // receiver
    g.add(cube(mats.bright, 0.06, 0.015, 0.4, 0, 0.062, -0.01)); // top rail
    g.add(cube(mats.bright, 0.035, 0.04, 0.03, 0, 0.085, -0.08)); // low-profile sight
    g.add(cube(mats.bright, 0.02, 0.012, 0.12, 0, 0.072, 0.08)); // rail slots
    g.add(barrel(mats.steel, 0.015, 0.4, 0, 0.02, -0.4)); // barrel
    g.add(cube(mats.polymer, 0.08, 0.07, 0.26, 0, 0.005, -0.32)); // vented handguard
    for (const z of [-0.24, -0.3, -0.36]) {
      g.add(cube(mats.steel, 0.082, 0.012, 0.02, 0, 0.04, z)); // vent ribs
    }
    g.add(cube(mats.grip, 0.04, 0.09, 0.05, 0, -0.08, -0.38, 0.15)); // vertical foregrip
    g.add(barrel(mats.bright, 0.021, 0.09, 0, 0.02, -0.63)); // compensator
    g.add(cube(mats.steel, 0.045, 0.02, 0.03, 0, 0.02, -0.66)); // comp ports
    g.add(cube(mats.bright, 0.05, 0.2, 0.06, 0, -0.16, -0.04, 0.06)); // straight mag
    g.add(cube(mats.polymer, 0.055, 0.02, 0.07, 0, -0.265, -0.055, 0.06)); // mag base plate
    g.add(cube(mats.bright, 0.03, 0.02, 0.05, 0.055, 0.01, -0.02)); // charging handle
    g.add(cube(mats.steel, 0.008, 0.015, 0.09, 0.047, 0.03, 0.05)); // selector lever
    gripAndStock(g);
    return g;
  }

  // The other weapons keep the same dark-metal look, with distinct silhouettes.
  function buildSidearm() {
    const g = new THREE.Group();
    g.add(cube(mats.steel, 0.05, 0.05, 0.22, 0, 0.02, -0.05));
    g.add(cube(mats.bright, 0.04, 0.02, 0.06, 0, 0.05, -0.14));
    g.add(cube(mats.grip, 0.045, 0.13, 0.06, 0, -0.07, 0.06, 0.25));
    return g;
  }

  function buildSMG() {
    const g = new THREE.Group();
    g.add(cube(mats.steel, 0.07, 0.09, 0.3, 0, 0, 0));
    g.add(barrel(mats.steel, 0.013, 0.16, 0, 0.01, -0.22));
    g.add(cube(mats.bright, 0.045, 0.16, 0.05, 0, -0.12, -0.05)); // straight mag
    g.add(cube(mats.grip, 0.045, 0.1, 0.05, 0, -0.09, 0.12, 0.3));
    g.add(cube(mats.polymer, 0.06, 0.07, 0.12, 0, -0.01, 0.2));
    return g;
  }

  function buildShotgun() {
    const g = new THREE.Group();
    g.add(cube(mats.steel, 0.08, 0.09, 0.3, 0, 0, 0.05));
    g.add(barrel(mats.steel, 0.016, 0.5, 0, 0.02, -0.32));
    g.add(barrel(mats.bright, 0.014, 0.34, 0, -0.03, -0.28));
    g.add(cube(mats.polymer, 0.07, 0.06, 0.14, 0, -0.03, -0.28)); // pump
    gripAndStock(g);
    return g;
  }

  function buildSniper() {
    const g = new THREE.Group();
    g.add(cube(mats.steel, 0.08, 0.1, 0.36, 0, 0, 0));
    g.add(barrel(mats.steel, 0.012, 0.6, 0, 0.02, -0.45));
    g.add(barrel(mats.bright, 0.025, 0.18, 0, 0.08, -0.05)); // scope
    g.add(cube(mats.bright, 0.05, 0.02, 0.03, 0.05, 0.02, 0.05)); // bolt handle
    g.add(cube(mats.bright, 0.05, 0.1, 0.06, 0, -0.1, -0.02)); // mag
    gripAndStock(g);
    return g;
  }

  const models = {
    sidearm: buildSidearm(),
    rifle: buildAK47(),
    smg: buildSMG(),
    shotgun: buildShotgun(),
    sniper: buildSniper(),
    vandal: buildVandal(),
  };

  // Rig: yawed slightly so the long rifle barrel points toward screen centre
  // instead of running off the right edge, and big enough to read clearly.
  const rig = new THREE.Group();
  for (const model of Object.values(models)) {
    model.visible = false;
    rig.add(model);
  }
  models.sidearm.visible = true;
  rig.position.set(0.24, -0.24, -0.5);
  rig.rotation.y = 0.28;
  rig.rotation.z = -0.04;
  rig.scale.setScalar(0.85);
  camera.add(rig);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.accent),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  flash.position.set(0.09, -0.2, -1.02); // at the rifle muzzle tip
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.09, -0.18, -0.8);
  camera.add(flashLight);

  let def = WEAPONS.sidearm;
  const state = {
    id: 'sidearm',
    mag: def.mag,
    reserve: def.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
    grenades: 0,
  };

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.35);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    rig.position.z = -0.5 + state.kick;
    rig.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const progress = Math.min(1, (def.reload - state.reloadLeft) * 2);
      rig.rotation.x = -0.55 * progress;
      if (state.reloadLeft === 0) {
        const take = Math.min(def.mag - state.mag, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def() {
      return def;
    },
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def.gap;
      state.flash = 0.06;
      state.kick = def.kick ?? 0.055;
      state.bloom = Math.min(1, state.bloom + (def.bloom ?? 0.12));
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      const move = Math.min(1, speed / 5.2);
      return def.spreadStill + move * def.spreadMove + state.bloom * 0.012;
    },
    equip(id) {
      if (!WEAPONS[id]) return;
      def = WEAPONS[id];
      state.id = id;
      for (const [key, model] of Object.entries(models)) model.visible = key === id;
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
    },
    refill() {
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
  };
}
