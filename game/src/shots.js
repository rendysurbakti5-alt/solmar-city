// The screenshot scenes behind ?shot=drive|foot|chase|mission. Each one stages the real game
// with its debug hooks — a car placed on an avenue, pedestrians on the promenade, police and
// wanted heat for the chase, a mission's opening talk at the club — then runs the simulation
// forward with scripted inputs, so the frame is a moment the game itself produced and the
// same seed always gives the same frame.
import { STEP } from './config.js';

const IDLE = {
  moveX: 0,
  moveY: 0,
  run: false,
  throttle: 0,
  steer: 0,
  handbrake: false,
  attackPressed: false,
  attackHeld: false,
  interactPressed: false,
  confirmPressed: false,
  aimX: 0,
  aimY: 0,
};

function run(game, seconds, input) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) game.step(STEP, typeof input === 'function' ? input(i) : input);
}

/** Downtown at midday: Santi driving an Aurora GT south through traffic on the third avenue. */
function stageDrive(game) {
  const { stage, city } = game;
  const avenueX = city.avenueCenters[2];
  const hero = stage.seatInNewCar('gt', avenueX - 32, 1250, Math.PI / 2);
  hero.color = '#ff5d3b';
  stage.addTraffic('cub', avenueX - 32, 1750, Math.PI / 2);
  stage.addTraffic('cab', avenueX + 32, 1900, -Math.PI / 2);
  stage.addTraffic('van', avenueX - 32, 2350, Math.PI / 2);
  stage.addTraffic('sedan', city.avenueCenters[1] + 32, 1560, -Math.PI / 2);
  stage.addTraffic('cub', 1560, city.streetCenters[2] + 32, 0);
  stage.addPed(avenueX - 90, 1330);
  stage.addPed(avenueX + 95, 1620);
  run(game, 3.4, { ...IDLE, throttle: 1 });
}

/** The promenade: Santi on foot among the strollers, the beach and the sea behind him. */
function stageFoot(game) {
  const { stage } = game;
  stage.placePlayer(2310, 3110);
  const spots = [
    [2240, 3080], [2380, 3140], [2450, 3060], [2180, 3160],
    [2520, 3120], [2290, 3180], [2410, 3200], [2560, 3060],
  ];
  for (const [x, y] of spots) stage.addPed(x, y);
  run(game, 2.4, (i) => ({ ...IDLE, moveX: i < 90 ? 1 : 0, moveY: i < 90 ? 0.25 : 0 }));
}

/** Four stars over Portside: an Aurora GT running north with the Interceptors closing in. */
function stageChase(game) {
  const { stage, city } = game;
  const avenueX = city.avenueCenters[4];
  const car = stage.seatInNewCar('gt', avenueX + 32, 2750, -Math.PI / 2);
  car.color = '#ff5d3b';
  stage.setHeat(100);
  stage.addPolice(avenueX + 32, 3120, -Math.PI / 2);
  stage.addPolice(avenueX - 32, 3300, -Math.PI / 2);
  stage.addPolice(avenueX - 330, city.streetCenters[3], 0);
  stage.addTraffic('van', avenueX - 32, 2050, Math.PI / 2);
  stage.addTraffic('cub', avenueX + 32, 1750, -Math.PI / 2);
  run(game, 2.3, (i) => ({ ...IDLE, throttle: 1, steer: Math.sin(i * 0.06) * 0.045 }));
}

/** A job begins: Paloma's opening talk for the Aurora job, outside Club Palma. */
function stageMission(game) {
  const { stage, city } = game;
  const door = city.pois.club.door;
  stage.placePlayer(door.x - 26, door.y + 30);
  stage.addPed(door.x + 90, door.y + 46);
  stage.addPed(door.x - 130, door.y + 20);
  stage.startMissionAt(2);
  run(game, 0.4, IDLE);
}

/**
 * Set the game to the named scene and return nothing: the caller paints the frame.
 * Any other name stages the drive, the game's most complete single view.
 */
export function stageShot(name, game) {
  if (name === 'foot') stageFoot(game);
  else if (name === 'chase') stageChase(game);
  else if (name === 'mission') stageMission(game);
  else stageDrive(game);
}
