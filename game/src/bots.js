// Bots: one small state machine per agent — route, hold, engage, investigate.
// They walk the waypoint graph, pause to hold angles, react to what they see
// (line of sight) and hear (gunfire within earshot), and shoot in bursts with
// the same spread idea as the player: tighter when standing still and aimed.
// New in this pass: attackers sometimes flank through the Boiler Room,
// defenders sprint to a planted spike, and hurt bots hold angles instead of
// pushing into a fight they will lose.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { ROUTES, WAYPOINTS } from './world.js';

const HEALTH = 100;
const SPEED = 3.4;
const EYE = 1.55;
const SIGHT = 34;
const HEAR = 22;
const LOW_HP = 35; // at or below this, a bot holds its angle instead of pushing
const ROTATE_BOOST = 1.3; // defenders run faster toward a planted spike
const FLANK_CHANCE = 0.4; // Vanguard B-pushers sometimes swing via Boiler Room
const BURST_SHOTS = 3; // shots per burst, then a short pause to re-aim

const _eye = new THREE.Vector3();
const _look = new THREE.Vector3();
const _ray = new THREE.Raycaster();

export function createBots(scene, world, rng) {
  const group = new THREE.Group();
  scene.add(group);

  const teamMat = {
    vanguard: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.6 }),
    cinder: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.6 }),
  };
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeo = new THREE.SphereGeometry(0.155, 16, 12);
  const legGeo = new THREE.BoxGeometry(0.2, 0.5, 0.22);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.5);

  const bots = [];
  const hitMeshes = [];

  // Attackers on a B push sometimes take the Boiler Room flank instead of
  // the direct Short B lane. Re-rolled every round in reset().
  function pickRoute(bot) {
    if (bot.team === 'vanguard' && bot.routeKey === 'B' && rng() < FLANK_CHANCE) {
      return ROUTES.Boiler.slice();
    }
    return ROUTES[bot.routeKey].slice();
  }

  function makeBot(team, name, spawn, routeKey) {
    const g = new THREE.Group();
    g.position.set(spawn[0], 0, spawn[1]);
    const torso = new THREE.Mesh(torsoGeo, teamMat[team]);
    torso.position.y = 1.0;
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.53;
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.13, 0.25, 0);
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.13, 0.25, 0);
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.2, 1.05, -0.3);
    const visorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[team]),
      emissive: new THREE.Color(PALETTE[team]),
      emissiveIntensity: 0.9,
    });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.06), visorMat);
    visor.position.set(0, 1.56, -0.14);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.1, 0.32),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[team]), roughness: 0.5 }),
    );
    stripe.position.y = 1.18;
    g.add(torso, head, legL, legR, gun, visor, stripe);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    scene.add(g);

    const bot = {
      team, name, group: g, torso, head,
      pos: g.position, yaw: team === 'vanguard' ? Math.PI : 0,
      health: HEALTH, alive: true, respawnAt: 0,
      routeKey, route: [], wp: 0, holdUntil: 0,
      state: 'route', target: null, lastSeen: null, lastSeenAt: -99,
      cooldown: 0, burst: 0, burstAt: 0, hearAt: -99, hearPos: null,
      planting: 0, defusing: 0, speed: SPEED * (0.9 + rng() * 0.2), home: [spawn[0], spawn[1]],
      // New fields: burst pacing, noise investigation, movement flag.
      burstPauseUntil: 0, investigate: null, investigateUntil: 0, moving: false, scanBase: 0,
    };
    bot.route = pickRoute(bot);
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  // True if nothing solid stands between the two eye positions.
  function canSee(from, to, time) {
    _eye.set(from.x, EYE, from.z);
    _look.set(to.x, EYE, to.z);
    const dist = _eye.distanceTo(_look);
    if (dist > SIGHT) return false;
    _ray.set(_eye, _look.sub(_eye).normalize());
    _ray.far = dist;
    return _ray.intersectObjects(world.shootables, false).length === 0;
  }

  // Gunfire noise: bots within earshot remember where the shot came from.
  function hear(x, z, time) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.pos.x - x, bot.pos.z - z);
      if (d < HEAR) {
        bot.hearAt = time;
        bot.hearPos = { x, z };
      }
    }
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.group.visible = false;
    bot.respawnAt = 0; // round-based: no respawn until the next round
    return true;
  }

  function reset() {
    for (const bot of bots) {
      const s = bot.home;
      bot.pos.set(s[0], 0, s[1]);
      bot.health = HEALTH;
      bot.alive = true;
      bot.group.visible = true;
      bot.state = 'route';
      bot.route = pickRoute(bot); // restores the route (and re-rolls the flank)
      bot.wp = 0;
      bot.holdUntil = 0;
      bot.target = null;
      bot.lastSeen = null;
      bot.lastSeenAt = -99;
      bot.planting = 0;
      bot.defusing = 0;
      bot.cooldown = 0;
      bot.burst = 0;
      bot.burstPauseUntil = 0;
      bot.investigate = null;
      bot.investigateUntil = 0;
      bot.moving = false;
    }
  }

  function faceToward(bot, x, z) {
    bot.yaw = Math.atan2(-(x - bot.pos.x), -(z - bot.pos.z));
  }

  // One bot, one fixed step. Returns a shot event for main to resolve, or null.
  function stepBot(bot, dt, time, player, enemies, phase) {
    void player; // the player is passed in through `enemies` for Cinder bots
    if (!bot.alive) return null;
    bot.cooldown = Math.max(0, bot.cooldown - dt);
    bot.moving = false;
    const rotating = phase === 'planted' && bot.team === 'cinder';

    // --- Target acquisition: nearest living enemy with line of sight. ---
    let target = null;
    let best = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(bot.pos.x - e.pos.x, bot.pos.z - e.pos.z);
      if (d < best && canSee(bot.pos, e.pos, time)) {
        best = d;
        target = e;
      }
    }
    if (target) {
      bot.lastSeen = { x: target.pos.x, z: target.pos.z };
      bot.lastSeenAt = time;
    }
    bot.target = target;

    // --- Engage: stand, aim, fire in bursts. ---
    if (target) {
      bot.state = 'engage';
      bot.investigate = null;
      faceToward(bot, target.pos.x, target.pos.z);
      if (bot.cooldown === 0 && time >= bot.burstPauseUntil && best < 30) {
        bot.cooldown = 0.16 + rng() * 0.12;
        bot.burst += 1;
        if (bot.burst >= BURST_SHOTS) {
          // End of burst: a longer pause to re-aim before the next one.
          bot.burst = 0;
          bot.burstAt = time;
          bot.burstPauseUntil = time + 0.65 + rng() * 0.35;
        }
        // Standing still and aimed: tighter than the old always-moving spread.
        const spread = (0.02 + Math.min(1, best / 30) * 0.05) * 0.7;
        return { shooter: bot, target, spread, damage: 16, headChance: 0.08 };
      }
      return null;
    }

    // --- Hurt bots hold their angle instead of pushing. ---
    if (bot.health <= LOW_HP) {
      bot.state = 'hold';
      if (bot.hearAt > 0 && time - bot.hearAt < 2 && bot.hearPos) {
        faceToward(bot, bot.hearPos.x, bot.hearPos.z);
      } else if (bot.lastSeen && time - bot.lastSeenAt < 4) {
        faceToward(bot, bot.lastSeen.x, bot.lastSeen.z);
      } else {
        const wp = WAYPOINTS[bot.route[bot.wp]];
        faceToward(bot, wp.x, wp.z);
      }
      return null;
    }

    // --- Fresh gunfire with no visible enemy: go look, briefly. ---
    if (!rotating && bot.hearAt > 0 && time - bot.hearAt < 2 && bot.hearPos && !bot.investigate) {
      bot.investigate = { x: bot.hearPos.x, z: bot.hearPos.z };
      bot.investigateUntil = time + 3;
    }
    if (bot.investigate && time < bot.investigateUntil) {
      const dx = bot.investigate.x - bot.pos.x;
      const dz = bot.investigate.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.8) {
        bot.investigate = null;
      } else {
        bot.state = 'route';
        faceToward(bot, bot.investigate.x, bot.investigate.z);
        const step = bot.speed * dt;
        bot.pos.x += (dx / dist) * step;
        bot.pos.z += (dz / dist) * step;
        bot.moving = true;
        return null;
      }
    } else {
      bot.investigate = null;
    }

    // --- Route walking, pausing to hold angles at waypoints. ---
    bot.state = 'route';
    // Defenders rotating to a planted spike skip the hold pauses and hurry.
    if (!rotating && time < bot.holdUntil) {
      // Holding an angle: slow scan across the lane ahead.
      bot.yaw = bot.scanBase + Math.sin(time * 0.6) * 0.45;
      return null;
    }
    const wp = WAYPOINTS[bot.route[bot.wp]];
    const dx = wp.x - bot.pos.x;
    const dz = wp.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      bot.wp = Math.min(bot.wp + 1, bot.route.length - 1);
      if (!rotating) {
        bot.holdUntil = time + 1.0 + rng() * 1.4;
        bot.scanBase = Math.atan2(-dx, -dz);
      }
      return null;
    }
    faceToward(bot, wp.x, wp.z);
    const pace = rotating ? bot.speed * ROTATE_BOOST : bot.speed;
    const step = pace * dt;
    bot.pos.x += (dx / dist) * step;
    bot.pos.z += (dz / dist) * step;
    bot.moving = true;
    return null;
  }

  function sync() {
    for (const bot of bots) {
      bot.group.rotation.y = bot.yaw;
      bot.group.position.set(bot.pos.x, 0, bot.pos.z);
    }
  }

  return { bots, hitMeshes, makeBot, canSee, hear, damage, reset, stepBot, sync };
}
