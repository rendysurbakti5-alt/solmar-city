// Boot and the one loop. The game moves between screens — title, play, paused, help, and the
// busted and downed panels — while the simulation advances in fixed 1/60 s steps beneath
// whichever screen is up. Input is translated here: keys and mouse in, the plain input
// object game.step reads out; the events the simulation raises become the sounds in audio.js.
// A run in progress is saved to this browser's storage and offered back as Continue.
//
// ?seed=N fixes the random stream. ?shot=drive|foot|chase|mission (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
import { SAVE_KEY, STEP } from './config.js';
import { createGame } from './game.js';
import { createAudio } from './audio.js';
import { ACTION_ATTACK, ACTION_CONFIRM, ACTION_INTERACT, ACTION_NEXT, ACTION_PAUSE, createInput } from './input.js';
import {
  SCREEN_BUSTED,
  SCREEN_HELP,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WASTED,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSave(game) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(game.serialize()));
  } catch {
    // Storage can be off (private windows): the run then lasts this visit only.
  }
}

function runShot(name) {
  const game = createGame(seed);
  stageShot(name, game);
  window.__game = game;
  let painted = 0;
  function paint() {
    renderer.draw(game.state, SCREEN_PLAY, { city: game.city, menuItems: [], menuIndex: 0 });
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let game = createGame(seed);
  window.__game = game;
  let screen = SCREEN_TITLE;
  let menuIndex = 0;
  let saveTimer = 0;
  let accumulator = 0;
  let last = performance.now();

  function menuItems() {
    const items = ['New Game'];
    if (readSave() !== null) items.push('Continue');
    items.push('How to Play');
    return items;
  }

  function announce(message) {
    status.textContent = message;
  }

  function startNew() {
    game = createGame(Math.floor(Math.random() * 4294967296));
    window.__game = game;
    screen = SCREEN_PLAY;
    announce('A new run in Solmar City. Meet Paloma at Club Palma.');
  }

  function startContinue() {
    const save = readSave();
    game = createGame(Math.floor(Math.random() * 4294967296));
    window.__game = game;
    if (save !== null) game.applySave(save);
    screen = SCREEN_PLAY;
    announce('Welcome back to Solmar City.');
  }

  function confirmMenu() {
    const item = menuItems()[menuIndex];
    if (item === 'New Game') startNew();
    else if (item === 'Continue') startContinue();
    else if (item === 'How to Play') screen = SCREEN_HELP;
  }

  function drainEvents() {
    const events = game.state.events;
    for (const event of events) {
      if (event === 'shoot') audio.shoot();
      else if (event === 'punch' || event === 'thud') audio.punch();
      else if (event === 'hurt') audio.hurt();
      else if (event === 'crash1') audio.crash(0.3);
      else if (event === 'crash2') audio.crash(0.9);
      else if (event === 'door') audio.door();
      else if (event === 'pickup') audio.pickup();
      else if (event === 'cash') audio.cash();
      else if (event === 'blip' || event === 'honk') audio.blip();
      else if (event === 'sting-ok') audio.sting(true);
      else if (event === 'sting-bad' || event === 'busted' || event === 'wasted') audio.sting(false);
      else if (event === 'explosion') audio.explosion();
      else if (event === 'splash') audio.splash();
    }
    events.length = 0;
  }

  function buildStepInput(actions) {
    const axes = input.axes();
    const driving = input.driving();
    const logical = renderer.toLogical(input.mouse.x, input.mouse.y);
    const cam = game.state.camera;
    return {
      moveX: axes.x,
      moveY: axes.y,
      run: input.running(),
      throttle: driving.throttle,
      steer: driving.steer,
      handbrake: driving.handbrake,
      attackPressed: (actions & ACTION_ATTACK) !== 0,
      attackHeld: input.mouse.down || input.held.has('KeyJ'),
      interactPressed: (actions & ACTION_INTERACT) !== 0,
      confirmPressed: (actions & ACTION_NEXT) !== 0,
      aimX: cam.x + logical.x,
      aimY: cam.y + logical.y,
    };
  }

  function handleScreenActions(actions) {
    if (screen === SCREEN_TITLE) {
      if (input.held.has('ArrowUp') || input.held.has('KeyW')) menuIndex = Math.max(0, menuIndex - 1);
      if (input.held.has('ArrowDown') || input.held.has('KeyS')) menuIndex = Math.min(menuItems().length - 1, menuIndex + 1);
      if ((actions & ACTION_CONFIRM) !== 0) confirmMenu();
      return;
    }
    if (screen === SCREEN_HELP) {
      if ((actions & (ACTION_PAUSE | ACTION_CONFIRM)) !== 0) screen = SCREEN_TITLE;
      return;
    }
    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if ((actions & ACTION_CONFIRM) !== 0) {
        game.respawnOutcome();
        writeSave(game);
        screen = SCREEN_PLAY;
      }
      return;
    }
    if ((actions & ACTION_PAUSE) !== 0) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    audio.unlock();
    const actions = input.takeActions();
    handleScreenActions(actions);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === SCREEN_TITLE || screen === SCREEN_HELP) {
      // The title drifts over the city: advance the world gently behind the menu.
      game.state.time += 1 / 60;
      accumulator = 0;
    } else if (screen === SCREEN_PLAY) {
      let guard = 0;
      while (accumulator >= STEP && guard < 5) {
        game.step(STEP, buildStepInput(actions));
        accumulator -= STEP;
        guard += 1;
        if (game.state.outcome === 'busted') screen = SCREEN_BUSTED;
        else if (game.state.outcome === 'wasted') screen = SCREEN_WASTED;
        if (screen !== SCREEN_PLAY) {
          accumulator = 0;
          break;
        }
      }
      saveTimer += 1 / 60;
      if (saveTimer > 10) {
        saveTimer = 0;
        writeSave(game);
      }
    } else {
      accumulator = 0;
    }
    drainEvents();
    // Engine and siren levels for the audio loops.
    const p = game.state.player;
    let engine = 0;
    if (p.car !== null) {
      const top = 470;
      engine = Math.min(1, Math.abs(p.car.speed) / top) * 0.9 + 0.12;
    }
    let siren = 0;
    for (const car of game.state.cars) {
      if (car.kind !== 'police') continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      siren = Math.max(siren, Math.max(0, 1 - d / 720));
    }
    audio.tick(engine, siren, game.state.time);
    renderer.draw(game.state, screen, { city: game.city, menuItems: menuItems(), menuIndex });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave(game);
    }
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  announce('Solmar City. Choose New Game to begin.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
