// EMBERLINE — Foundry Yard, a round-based tactical FPS on three.js.
//
// This file is the boot + orchestration layer only: it wires the modules
// together (world, input, player, weapon, bots, bomb, grenades, HUD, audio,
// match state), runs the fixed-step simulation, and stages deterministic
// screenshots. All shooting, movement and bot brains live in their own
// modules; main.js only decides *when* they run and *what* a hit means.
//
// Match shape: Vanguard (you + 5 bots) attacks, Cinder (6 bots) defends.
// First to 5 rounds wins. A round ends by elimination, by spike detonation,
// by defuse, or by the clock. `?shot=start|play|buy|end&seed=N` renders one
// frozen frame for a capture and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, GRENADE } from './weapon.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createGrenades } from './grenades.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createState, PHASE, ECONOMY } from './state.js';

// ---------------------------------------------------------------------------
// Setup: fixed step, seeded RNG, renderer, scene, module wiring
// ---------------------------------------------------------------------------

const FIXED_STEP = 1 / 60;
const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 4;
const BOMB_FUSE = 30;
const BUY_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];
const BUY_ORDER = ['rifle', 'smg', 'shotgun', 'sniper', 'grenade', 'vandal'];

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

// Small deterministic RNG so a seed reproduces the same bot behaviour.
function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 85);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const bots = createBots(scene, world, random);
const bomb = createBomb(scene);
const grenades = createGrenades(scene, world);
const weapon = createWeapon(camera);
const hud = createHud();
const audio = createAudio();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;

// Scratch vectors — reused so the hot loop never allocates.
const aimDir = new THREE.Vector3();
const shotDir = new THREE.Vector3();
const shotFrom = new THREE.Vector3();

const state = createState();
const body = player.state;
// The player as a combatant, shaped like a bot so the same code can target
// either: pos is the live body position, alive/health are ours to own.
const me = { pos: body.position, alive: true, health: 100, isPlayer: true, name: 'You' };
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let plantHold = 0;
let defuseHold = 0;
let lastBeep = 0;
let buyItems = [];

// ---------------------------------------------------------------------------
// Round MVP: kills + damage per combatant, reset every round
// ---------------------------------------------------------------------------

const mvpTable = new Map();

function mvpEntry(name, team, isPlayer) {
  let entry = mvpTable.get(name);
  if (!entry) {
    entry = { name, team, isPlayer: Boolean(isPlayer), kills: 0, damage: 0 };
    mvpTable.set(name, entry);
  }
  return entry;
}

function mvpRecordDamage(name, team, amount, isPlayer) {
  if (shot || amount <= 0) return; // staged captures must not pollute stats
  mvpEntry(name, team, isPlayer).damage += Math.round(amount);
}

function mvpRecordKill(name, team, isPlayer) {
  if (shot) return;
  mvpEntry(name, team, isPlayer).kills += 1;
}

function pickMvp() {
  let best = null;
  for (const entry of mvpTable.values()) {
    const better = !best
      || entry.kills > best.kills
      || (entry.kills === best.kills && entry.damage > best.damage);
    if (better) best = entry;
  }
  if (!best || (best.kills === 0 && best.damage === 0)) return null;
  return best;
}

// Announce the round MVP at the end of a round. hud.showMvp is owned by
// another worker, so guard it: if the banner is not there yet, the MVP line
// goes to the kill feed instead. Never crash on a missing method.
function announceMvp() {
  const best = pickMvp();
  if (!best) return;
  const line = `MVP Round ${state.round}: ${best.name} — ${best.kills} eliminations, ${best.damage} damage`;
  if (hud.showMvp) {
    hud.showMvp({
      name: best.name,
      team: best.team,
      kills: best.kills,
      damage: best.damage,
      round: state.round,
      isPlayer: best.isPlayer,
    });
  } else {
    hud.feedLine(line);
  }
}

// ---------------------------------------------------------------------------
// Tracers: a small fixed pool, reused — no allocation in the hot loop
// ---------------------------------------------------------------------------

const tracers = [];
for (let i = 0; i < 10; i += 1) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf0a830, transparent: true, opacity: 0 }));
  scene.add(line);
  tracers.push({ line, life: 0 });
}

function fireTracer(from, to) {
  const slot = tracers.find((t) => t.life <= 0) ?? tracers[0];
  const points = slot.line.geometry.attributes.position;
  points.setXYZ(0, from.x, from.y, from.z);
  points.setXYZ(1, to.x, to.y, to.z);
  points.needsUpdate = true;
  slot.line.material.opacity = 0.9;
  slot.life = 0.08;
}

// ---------------------------------------------------------------------------
// Round lifecycle: teams, buy phase, deploy, round end, next round
// ---------------------------------------------------------------------------

function makeTeams() {
  const vanguardSpawns = SPAWNS.vanguard.slice();
  const cinderSpawns = SPAWNS.cinder.slice();
  const vanguardRoutes = ['A', 'B', 'MID', 'A', 'B'];
  for (let i = 0; i < 5; i += 1) {
    bots.makeBot('vanguard', `Vanguard-${i + 1}`, vanguardSpawns[i + 1], vanguardRoutes[i]);
  }
  const cinderRoutes = ['A', 'B', 'MID', 'A', 'B', 'MID'];
  for (let i = 0; i < 6; i += 1) {
    bots.makeBot('cinder', `Cinder-${i + 1}`, cinderSpawns[i], cinderRoutes[i]);
  }
}

function startRound() {
  state.phase = PHASE.BUY;
  state.timeLeft = state.buyTime;
  state.bomb.state = 'idle';
  state.bomb.site = null;
  state.bomb.timer = BOMB_FUSE;
  bomb.hide();
  plantHold = 0;
  defuseHold = 0;
  mvpTable.clear();
  me.alive = true;
  me.health = 100;
  body.position.set(SPAWNS.vanguard[0][0], 0, SPAWNS.vanguard[0][1]);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  bots.reset();
  weapon.refill();
  refreshBuy();
  hud.setRound(state.round);
  hud.setScore(state.score.vanguard, state.score.cinder, state.winsToTake);
  hud.setMoney(state.money);
  hud.setHealth(100);
  hud.setBomb('SPIKE NOT PLANTED', 'idle');
  hud.showOverlay('buy');
  hud.showBuy(state.money, buyItems);
  audio.round();
}

function refreshBuy() {
  const owned = (id) => (id === 'grenade' ? weapon.state.grenades > 0 : weapon.state.id === id);
  buyItems = [
    { key: '1', id: 'rifle', name: WEAPONS.rifle.name, price: WEAPONS.rifle.price, owned: owned('rifle') },
    { key: '2', id: 'smg', name: WEAPONS.smg.name, price: WEAPONS.smg.price, owned: owned('smg') },
    { key: '3', id: 'shotgun', name: WEAPONS.shotgun.name, price: WEAPONS.shotgun.price, owned: owned('shotgun') },
    { key: '4', id: 'sniper', name: WEAPONS.sniper.name, price: WEAPONS.sniper.price, owned: owned('sniper') },
    { key: '5', id: 'grenade', name: GRENADE.name, price: GRENADE.price, owned: owned('grenade') },
    { key: '6', id: 'vandal', name: WEAPONS.vandal.name, price: WEAPONS.vandal.price, owned: owned('vandal') },
  ];
}

function buy(id) {
  if (state.phase !== PHASE.BUY) return;
  if (id === 'grenade') {
    if (state.money < GRENADE.price || weapon.state.grenades >= 2) return;
    state.money -= GRENADE.price;
    weapon.state.grenades += 1;
  } else {
    const def = WEAPONS[id];
    if (state.money < def.price || weapon.state.id === id) return;
    state.money -= def.price;
    weapon.equip(id);
  }
  hud.setMoney(state.money);
  hud.setWeapon(weapon.def().name);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  refreshBuy();
  hud.showBuy(state.money, buyItems);
}

function deploy() {
  if (state.phase !== PHASE.BUY) return;
  state.phase = PHASE.LIVE;
  state.timeLeft = state.roundTime;
  hud.hideOverlay();
  hud.hideBuy();
  input.requestLock();
  audio.unlock();
}

function teamLabel(team) {
  return team === 'vanguard' ? 'Vanguard' : 'Cinder';
}

function endRound(winner, reason) {
  if (state.phase === PHASE.OVER || state.phase === PHASE.MATCH) return;
  state.phase = PHASE.OVER;
  state.winner = winner;
  if (winner === 'vanguard') {
    state.score.vanguard += 1;
    state.money += ECONOMY.roundWin;
  } else {
    state.score.cinder += 1;
    state.money += ECONOMY.roundLoss;
  }
  hud.setScore(state.score.vanguard, state.score.cinder, state.winsToTake);
  hud.setMoney(state.money);
  hud.feedLine(`${teamLabel(winner)} takes the round — ${reason}`);
  announceMvp();
  const leaderScore = winner === 'vanguard' ? state.score.vanguard : state.score.cinder;
  if (leaderScore === state.winsToTake - 1) {
    hud.feedLine(`${teamLabel(winner)} is on match point — next round decides it`);
  }
  if (document.pointerLockElement) document.exitPointerLock();
  if (state.score.vanguard >= state.winsToTake || state.score.cinder >= state.winsToTake) {
    state.phase = PHASE.MATCH;
    state.matchWinner = winner;
    hud.showOverlay('match', `${teamLabel(winner)} wins the match ${state.score.vanguard} — ${state.score.cinder}.`);
  } else {
    hud.showOverlay('round', `${teamLabel(winner)} takes round ${state.round} — ${reason}.`);
  }
}

function nextRound() {
  if (state.phase === PHASE.MATCH) {
    // Fresh match: scores, money and loadout all reset.
    state.round = 1;
    state.score.vanguard = 0;
    state.score.cinder = 0;
    state.money = ECONOMY.start;
    weapon.equip('sidearm');
    weapon.state.grenades = 0;
  } else {
    state.round += 1;
  }
  startRound();
}

// ---------------------------------------------------------------------------
// Damage: player hurt / bot hurt / resolving a bot's shot / player shooting
// ---------------------------------------------------------------------------

function damagePlayer(amount, fromName) {
  if (shot) return; // staged capture: the player never dies in a screenshot
  if (!me.alive || state.phase === PHASE.BUY) return;
  me.health -= amount;
  hud.setHealth(me.health);
  hud.hurt();
  if (me.health <= 0) {
    me.alive = false;
    state.deaths += 1;
    hud.feedLine(`${fromName} eliminated You`);
    if (document.pointerLockElement) document.exitPointerLock();
    hud.showOverlay('round', 'You are down. Your squad fights on — spectating.');
    // Death does not end the round: bots decide it. The overlay is a pause
    // screen; clicking resumes the spectator view.
    state.phase = PHASE.LIVE;
  }
}

// Apply damage to a bot. When the player dealt it, show the hit marker,
// pay the kill bonus and feed the kill — and credit the MVP table.
function damageBot(bot, amount, part, byPlayer) {
  const killed = bots.damage(bot, amount);
  if (byPlayer) {
    mvpRecordDamage(me.name, 'vanguard', amount, true);
    hud.hitMarker(killed);
    audio.hit();
    if (killed) {
      mvpRecordKill(me.name, 'vanguard', true);
      audio.kill();
      state.kills += 1;
      state.money += ECONOMY.kill;
      hud.setMoney(state.money);
      hud.feedLine(`You eliminated ${bot.name}${part === 'head' ? ' (headshot)' : ''}`);
    }
  }
  return killed;
}

// Resolve one bot shot event against its target (player or another bot).
// The shooter is credited with damage — and with the kill, if it lands.
function resolveBotShot(shotEv) {
  const shooter = shotEv.shooter;
  shotFrom.set(shooter.pos.x, 1.45, shooter.pos.z);
  const target = shotEv.target;
  const dx = target.pos.x - shooter.pos.x;
  const dz = target.pos.z - shooter.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  shotDir.set(
    dx / dist + (random() * 2 - 1) * shotEv.spread,
    (random() * 2 - 1) * shotEv.spread * 0.5,
    dz / dist + (random() * 2 - 1) * shotEv.spread,
  );
  shotDir.normalize();
  raycaster.set(shotFrom, shotDir);
  raycaster.far = dist + 2;
  const wall = raycaster.intersectObjects(world.shootables, false)[0];
  if (wall && wall.distance < dist - 0.5) return; // cover stops the shot
  const head = random() < shotEv.headChance;
  const dmg = head ? shotEv.damage * 2 : shotEv.damage;
  fireTracer(shotFrom, new THREE.Vector3(target.pos.x, 1.3, target.pos.z));
  mvpRecordDamage(shooter.name, shooter.team, dmg, false);
  if (target.isPlayer) {
    damagePlayer(dmg, shooter.name);
  } else {
    const killed = damageBot(target, dmg, head ? 'head' : 'torso', false);
    if (killed) mvpRecordKill(shooter.name, shooter.team, false);
  }
}

function shoot(spread) {
  if (!weapon.takeRound()) return false;
  camera.getWorldDirection(aimDir);
  const def = weapon.def();
  const pellets = def.pellets ?? 1;
  let hitAny = false;
  for (let p = 0; p < pellets; p += 1) {
    shotDir.copy(aimDir);
    shotDir.x += (random() * 2 - 1) * spread;
    shotDir.y += (random() * 2 - 1) * spread;
    shotDir.z += (random() * 2 - 1) * spread;
    shotDir.normalize();
    raycaster.set(camera.position, shotDir);
    raycaster.far = def.range;
    const hit = raycaster.intersectObjects(world.shootables.concat(bots.hitMeshes), false)[0];
    if (!hit) continue;
    fireTracer(camera.position, hit.point);
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const part = hit.object.userData.part;
      const dmg = Math.round(def.damage * (part === 'head' ? def.headMult : 1));
      damageBot(bot, dmg, part, true);
      hitAny = true;
    }
  }
  weapon.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  bots.hear(body.position.x, body.position.z, state.elapsed);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  audio.shot();
  return hitAny;
}

function throwGrenade() {
  if (weapon.state.grenades <= 0) return;
  camera.getWorldDirection(aimDir);
  shotFrom.copy(camera.position);
  if (grenades.throwGrenade(shotFrom, aimDir)) weapon.state.grenades -= 1;
}

// ---------------------------------------------------------------------------
// Simulation: one fixed step
// ---------------------------------------------------------------------------

function step(dt) {
  state.elapsed += dt;

  if (state.phase === PHASE.BUY) {
    state.timeLeft -= dt;
    hud.setTimer(state.timeLeft);
    if (state.timeLeft <= 0) deploy();
    return;
  }
  if (state.phase !== PHASE.LIVE && state.phase !== PHASE.PLANTED) return;
  state.timeLeft -= dt;
  hud.setTimer(state.timeLeft);

  // Bomb clock: a planted spike ticks down, then detonates for Vanguard.
  if (state.phase === PHASE.PLANTED) {
    state.bomb.timer -= dt;
    bomb.blink(state.elapsed);
    hud.setBomb(`SPIKE PLANTED — ${Math.ceil(state.bomb.timer)}s`, 'planted');
    if (Math.floor(state.bomb.timer) !== lastBeep) {
      lastBeep = Math.floor(state.bomb.timer);
      audio.beep();
    }
    if (state.bomb.timer <= 0) {
      audio.explode();
      endRound('vanguard', 'the spike detonated');
      return;
    }
  } else if (state.timeLeft <= 0) {
    endRound('cinder', 'time expired, spike not planted');
    return;
  }

  // Player movement, then the plant / defuse hold on E.
  player.step(dt, input.state.keys);
  weapon.step(dt);
  const site = bomb.nearSite(body.position.x, body.position.z);
  const holdingE = input.state.keys.has('KeyE');
  if (me.alive && holdingE && site && state.phase === PHASE.LIVE) {
    plantHold += dt;
    hud.setPlant(plantHold / PLANT_SECONDS, `Planting spike at ${site}…`);
    if (plantHold >= PLANT_SECONDS) {
      state.phase = PHASE.PLANTED;
      state.bomb.state = 'planted';
      state.bomb.site = site;
      state.bomb.x = SITES[site].x;
      state.bomb.z = SITES[site].z;
      state.bomb.timer = BOMB_FUSE;
      state.money += ECONOMY.plant;
      hud.setMoney(state.money);
      bomb.place(SITES[site].x, SITES[site].z, true);
      hud.setPlant(null);
      hud.feedLine(`You planted the spike at ${site}`);
      audio.plant();
    }
  } else if (me.alive && holdingE && state.phase === PHASE.PLANTED
    && Math.hypot(body.position.x - state.bomb.x, body.position.z - state.bomb.z) < 2.2) {
    defuseHold += dt;
    hud.setPlant(defuseHold / DEFUSE_SECONDS, 'Defusing spike…');
    if (defuseHold >= DEFUSE_SECONDS) {
      state.money += ECONOMY.defuse;
      endRound('cinder', 'the spike was defused');
      return;
    }
  } else {
    plantHold = 0;
    defuseHold = 0;
    hud.setPlant(null);
  }

  // Grenade detonation: area damage to everyone in the blast.
  const boom = grenades.step(dt);
  if (boom) {
    audio.explode();
    const targets = [me, ...bots.bots];
    for (const target of targets) {
      if (!target.alive) continue;
      const dmg = grenades.damageAt(boom.x, boom.z, target.pos.x, target.pos.z);
      if (dmg <= 0) continue;
      if (target.isPlayer) damagePlayer(dmg, 'Frag grenade');
      else damageBot(target, dmg, 'torso', true);
    }
  }

  // Bots: each step returns a shot event for main to resolve. Cinder bots
  // converge on a planted spike, and one standing on it defuses in 4 s.
  const vanguardAlive = bots.bots.filter((b) => b.team === 'vanguard' && b.alive);
  const cinderAlive = bots.bots.filter((b) => b.team === 'cinder' && b.alive);
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const enemies = bot.team === 'vanguard'
      ? [...cinderAlive]
      : [...vanguardAlive, ...(me.alive ? [me] : [])];
    if (bot.team === 'cinder' && state.phase === PHASE.PLANTED && state.bomb.site) {
      bot.route = [SITES[state.bomb.site].x < 0 ? 10 : 11];
      bot.wp = 0;
    }
    const shotEv = bots.stepBot(bot, dt, state.elapsed, me, enemies, state.phase);
    if (shotEv) resolveBotShot(shotEv);
    if (bot.team === 'cinder' && state.phase === PHASE.PLANTED) {
      const near = Math.hypot(bot.pos.x - state.bomb.x, bot.pos.z - state.bomb.z) < 2.2;
      bot.defusing = near ? bot.defusing + dt : 0;
      if (near) hud.setPlant(bot.defusing / DEFUSE_SECONDS, `${bot.name} is defusing the spike…`);
      if (bot.defusing >= DEFUSE_SECONDS) {
        hud.setPlant(null);
        endRound('cinder', 'the spike was defused');
        return;
      }
    }
  }
  bots.sync();

  // Round end by elimination.
  const vanguardUp = me.alive || vanguardAlive.length > 0;
  const cinderUp = cinderAlive.length > 0;
  if (!cinderUp) endRound('vanguard', 'enemy team eliminated');
  else if (!vanguardUp) endRound('cinder', 'Vanguard eliminated');
}

// ---------------------------------------------------------------------------
// Frame loop, camera, aiming, pointer lock
// ---------------------------------------------------------------------------

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    if (state.phase === PHASE.LIVE || state.phase === PHASE.PLANTED) {
      if (input.state.firing && weapon.ready() && me.alive) shoot(weapon.spread(player.groundSpeed()));
      if (input.state.keys.has('KeyR')) weapon.reload();
      if (input.takePressed('KeyG')) throwGrenade();
    }
    if (state.phase === PHASE.BUY) {
      for (const key of BUY_KEYS) {
        if (input.takePressed(key)) buy(BUY_ORDER[Number(key.slice(-1)) - 1]);
      }
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life * 10);
      }
    }
  }
  renderer.render(scene, camera);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuy();
  } else if (state.phase === PHASE.LIVE || state.phase === PHASE.PLANTED) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.phase === PHASE.BUY) deploy();
  else if (state.phase === PHASE.OVER || state.phase === PHASE.MATCH) nextRound();
  else input.requestLock();
});

// ---------------------------------------------------------------------------
// Screenshot staging: run a deterministic setup, render twice, freeze
// ---------------------------------------------------------------------------

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    body.position.set(-10, 0, 11);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.4, -6));
    hud.showOverlay('start');
  } else if (name === 'buy') {
    state.money = 2700;
    refreshBuy();
    body.position.set(-10, 0, 11);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.4, -6));
    hud.setMoney(2700);
    hud.showBuy(2700, buyItems);
  } else if (name === 'play') {
    weapon.equip('rifle'); // play shot shows the AK-47, the main weapon
    hud.setWeapon(weapon.def().name);
    state.phase = PHASE.LIVE;
    state.timeLeft = 88;
    body.position.set(-6, 0, 6);
    settle(30);
    const enemies = bots.bots.filter((b) => b.team === 'cinder' && b.alive).slice(0, 3);
    const spots = [[1, 0], [4, -2], [7, -1]]; // open mid ground, clear of the furnace pillar
    enemies.forEach((enemy, i) => { enemy.pos.set(spots[i][0], 0, spots[i][1]); });
    bots.sync();
    if (enemies.length > 0) {
      aimAt(new THREE.Vector3(4, 1.3, -2));
      shoot(0);
      settle(6);
      // Staged capture: fade the shot tracer so it does not read as a
      // full-screen laser line in the still.
      for (const t of tracers) { t.life = 0; t.line.material.opacity = 0; }
    }
    hud.setHealth(100);
    hud.setMoney(3500);
  } else if (name === 'end') {
    state.phase = PHASE.OVER;
    state.round = 5;
    state.score.vanguard = 3;
    state.score.cinder = 2;
    hud.setRound(5);
    hud.setScore(3, 2, state.winsToTake);
    body.position.set(0, 0, 8);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.4, -10));
    hud.showOverlay('round', 'Vanguard takes round 5 — the spike detonated.');
  }
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setMoney(state.money);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

makeTeams();
startRound();
syncCamera();
hud.setWeapon(weapon.def().name);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
