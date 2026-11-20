// Frag grenades: a thrown sphere under gravity on a 1.6 s fuse, then area
// damage that falls off with distance. One live grenade at a time per
// thrower; the mesh and the blast sphere are pooled, never allocated per
// throw. `world` is kept in the signature for callers that pass it.
import * as THREE from 'three';
import { GRENADE } from './weapon.js';

const THROW_SPEED = 14;
const THROW_UP = 4;
const GRENADE_GRAVITY = 14;
const REST_HEIGHT = 0.09;
const BLAST_TIME = 0.25;

export function createGrenades(scene, world) {
  void world;
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 }),
  );
  shell.visible = false;
  scene.add(shell);

  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0, depthWrite: false }),
  );
  blast.visible = false;
  scene.add(blast);

  const live = {
    active: false,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    fuse: 0,
    blastT: 0,
  };

  function throwGrenade(from, dir) {
    if (live.active) return false;
    live.active = true;
    live.pos.copy(from);
    live.vel.copy(dir).multiplyScalar(THROW_SPEED);
    live.vel.y += THROW_UP;
    live.fuse = GRENADE.fuse;
    shell.visible = true;
    return true;
  }

  function detonate() {
    live.active = false;
    shell.visible = false;
    blast.visible = true;
    blast.position.copy(live.pos);
    blast.scale.setScalar(0.1);
    live.blastT = BLAST_TIME;
    return { x: live.pos.x, z: live.pos.z, damage: GRENADE.damage, radius: GRENADE.radius };
  }

  // Returns {x, z, damage, radius} on the frame it detonates, else null.
  function step(dt) {
    if (live.blastT > 0) {
      live.blastT -= dt;
      const grown = 1 + (BLAST_TIME - live.blastT) * 18;
      blast.scale.setScalar(Math.max(0.1, grown));
      blast.material.opacity = Math.max(0, live.blastT * 2);
      if (live.blastT <= 0) blast.visible = false;
      return null;
    }
    if (!live.active) return null;
    live.fuse -= dt;
    live.vel.y -= GRENADE_GRAVITY * dt;
    live.pos.addScaledVector(live.vel, dt);
    if (live.pos.y < REST_HEIGHT) {
      live.pos.y = REST_HEIGHT;
      live.vel.set(0, 0, 0);
    }
    shell.position.copy(live.pos);
    if (live.fuse > 0) return null;
    return detonate();
  }

  function damageAt(x, z, px, pz) {
    const dist = Math.hypot(x - px, z - pz);
    if (dist > GRENADE.radius) return 0;
    return Math.round(GRENADE.damage * (1 - dist / GRENADE.radius));
  }

  return { throwGrenade, step, damageAt };
}
