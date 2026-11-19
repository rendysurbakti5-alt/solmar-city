// Keyboard and mouse input. Held keys are read as a set every frame; one-shot presses (interact,
// attack, pause, confirm) are queued as bit flags and taken once by the loop, so a press between
// two frames is never lost and never counted twice. The mouse is tracked in client pixels and
// the loop converts it to world coordinates through the renderer's view transform.

export const ACTION_INTERACT = 1;
export const ACTION_ATTACK = 2;
export const ACTION_PAUSE = 4;
export const ACTION_CONFIRM = 8;
export const ACTION_NEXT = 16;

const INTERACT = new Set(['KeyF', 'KeyE', 'Enter']);
const ATTACK_KEYS = new Set(['Space', 'KeyJ']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CONFIRM = new Set(['Enter', 'Space']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false };

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      held.add(event.code);
      return;
    }
    held.add(event.code);
    if (INTERACT.has(event.code)) actions |= ACTION_INTERACT;
    if (ATTACK_KEYS.has(event.code)) actions |= ACTION_ATTACK;
    if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    if (event.code === 'KeyE' || event.code === 'Enter' || event.code === 'Space') actions |= ACTION_NEXT;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  window.addEventListener('mousemove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  target.addEventListener('pointerdown', (event) => {
    mouse.down = true;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    actions |= ACTION_ATTACK;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  return {
    /** Movement axes from WASD and the arrow keys: x right, y down, each -1, 0 or 1. */
    axes() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    /** Car controls: throttle -1..1 (S brakes/reverses), steer -1..1, handbrake held. */
    driving() {
      const throttle = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
      const steer = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      return { throttle, steer, handbrake: held.has('Space') };
    },
    running() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    mouse,
    held,
  };
}
