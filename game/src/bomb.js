// The objective: plant the spike at a site, defend it, or defuse it.
// Plant takes 3 s of holding E inside a site ring; defuse takes 4 s.
// A planted spike ticks for 30 s, then detonates for the attackers.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES } from './world.js';

const SITE_RADIUS = 2.2;
const SPIKE_HEIGHT = 0.18;
const LIGHT_HEIGHT = 1.2;

export function createBomb(scene) {
  const accent = new THREE.Color(PALETTE.accent);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.35, 0.5),
    new THREE.MeshStandardMaterial({
      color: accent,
      roughness: 0.4,
      emissive: accent,
      emissiveIntensity: 0.4,
    }),
  );
  mesh.visible = false;
  scene.add(mesh);

  const light = new THREE.PointLight(accent, 0, 8);
  scene.add(light);

  function hide() {
    mesh.visible = false;
    light.intensity = 0;
  }

  return {
    mesh,
    light,
    nearSite(x, z) {
      for (const key of Object.keys(SITES)) {
        const site = SITES[key];
        if (Math.hypot(x - site.x, z - site.z) < SITE_RADIUS) return key;
      }
      return null;
    },
    place(x, z, planted) {
      mesh.visible = true;
      mesh.position.set(x, SPIKE_HEIGHT, z);
      light.position.set(x, LIGHT_HEIGHT, z);
      light.intensity = planted ? 6 : 0;
    },
    hide,
    blink(time) {
      light.intensity = 3 + 3 * Math.sin(time * 6);
    },
  };
}
