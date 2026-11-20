// Player movement: acceleration, friction, gravity, crouch and jump, with
// the body resolved as a box against the world colliders one axis at a time,
// so a wall can stop the player but never swallow them.
import * as THREE from 'three';

// Body and movement tuning, in one block so the feel can be tweaked here.
const BODY = {
  radius: 0.34,
  standHeight: 1.72,
  crouchHeight: 1.12,
  standEye: 1.6,
  crouchEye: 1.02,
  walkSpeed: 5.2,
  crouchSpeed: 2.4,
  groundAccel: 42,
  airAccel: 9,
  friction: 9,
  gravity: 20,
  jumpSpeed: 6.2,
};
const PITCH_LIMIT = 1.45;
const MAX_FALL = -30;

export function createPlayer(colliders) {
  const body = {
    position: new THREE.Vector3(0, 0, 9.5),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: BODY.standEye,
    onGround: true,
    crouching: false,
    height: BODY.standHeight,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  // `lift` trims the box top and bottom, so standing on the floor is never
  // read as walking into a wall, and the crown never snags a low ceiling.
  function hitAt(x, y, z, height, lift) {
    probe.min.set(x - BODY.radius, y + lift, z - BODY.radius);
    probe.max.set(x + BODY.radius, y + height - lift, z + BODY.radius);
    for (const box of colliders) {
      if (probe.intersectsBox(box)) return box;
    }
    return null;
  }

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(PITCH_LIMIT, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function updateCrouch(keys, dt) {
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantCrouch && !body.crouching) {
      body.crouching = true;
      body.height = BODY.crouchHeight;
    } else if (!wantCrouch && body.crouching) {
      // Only stand up when there is headroom to do so.
      if (!hitAt(body.position.x, body.position.y, body.position.z, BODY.standHeight, 0.02)) {
        body.crouching = false;
        body.height = BODY.standHeight;
      }
    }
    const eyeTarget = body.crouching ? BODY.crouchEye : BODY.standEye;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);
  }

  function step(dt, keys) {
    updateCrouch(keys, dt);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward !== 0 || strafe !== 0) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const speed = body.crouching ? BODY.crouchSpeed : BODY.walkSpeed;
    const accel = body.onGround ? BODY.groundAccel : BODY.airAccel;
    const blend = Math.min(1, (accel * dt) / speed);
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && wish.lengthSq() === 0) {
      const damp = Math.max(0, 1 - BODY.friction * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }

    if (keys.has('Space') && body.onGround) {
      body.velocity.y = BODY.jumpSpeed;
      body.onGround = false;
    }
    body.velocity.y -= BODY.gravity * dt;

    // Horizontal axes first, each blocked independently.
    const nextX = body.position.x + body.velocity.x * dt;
    if (!hitAt(nextX, body.position.y, body.position.z, body.height, 0.04)) {
      body.position.x = nextX;
    } else {
      body.velocity.x = 0;
    }
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!hitAt(body.position.x, body.position.y, nextZ, body.height, 0.04)) {
      body.position.z = nextZ;
    } else {
      body.velocity.z = 0;
    }

    // Then vertical: land on top of a collider, or bump the head under one.
    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = hitAt(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(MAX_FALL, body.velocity.y);
  }

  return {
    state: body,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
  };
}
