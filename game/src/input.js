// Keyboard + mouse + pointer lock. Plain browser APIs only.
// Edge-triggered actions (grenade, buy keys) are consumed through
// takePressed, so one physical press can only ever fire one action.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0 };

  function press(event) {
    if (!keys.has(event.code)) pressed.add(event.code);
    keys.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  function release(event) {
    keys.delete(event.code);
  }

  function dropAll() {
    keys.clear();
    pressed.clear();
  }

  window.addEventListener('keydown', press);
  window.addEventListener('keyup', release);
  window.addEventListener('blur', dropAll);
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) state.firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const look = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
    takePressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    clearPressed() {
      pressed.clear();
    },
  };
}
