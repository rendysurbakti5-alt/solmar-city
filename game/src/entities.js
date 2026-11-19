// The moving people and machines of Solmar City: car models and their shared physics, traffic
// cars that follow the avenues and streets in the right-hand lane and brake for each other,
// police Interceptors that hunt a target point, and pedestrians who stroll the sidewalks and
// the promenade and run when there is trouble. Everything moves with the same circle-versus-
// buildings collision the city provides, so nothing here can leave the world or enter a wall.
import { T_PARK, T_PIER, T_PLAZA, T_ROAD, T_RUNWAY, T_SAND, T_SIDE, T_WATER } from './city.js';

/** The cars of Solmar City, all invented here: name, size in pixels, pace and paint. */
export const CAR_MODELS = {
  cub: { name: 'Comet Cub', length: 44, width: 24, top: 305, accel: 235, grip: 3.4, value: 900, colors: ['#e2574c', '#f2f0e6', '#7ec8e3', '#f6c453', '#98d8a0'] },
  sedan: { name: 'Palma Sedan', length: 50, width: 25, top: 335, accel: 245, grip: 3.2, value: 1600, colors: ['#3f6fb5', '#c0c6cc', '#5b4a68', '#e8e3d3', '#884444'] },
  cab: { name: 'Solmar Cab', length: 50, width: 25, top: 330, accel: 245, grip: 3.2, value: 1500, colors: ['#f7b731'] },
  gt: { name: 'Aurora GT', length: 52, width: 27, top: 470, accel: 360, grip: 3.9, value: 9000, colors: ['#ff5d3b', '#ffd23e', '#e8e8f0'] },
  van: { name: 'Burro Van', length: 56, width: 28, top: 262, accel: 195, grip: 2.7, value: 2200, colors: ['#dfe3e6', '#a8c6c0', '#c9a86a'] },
  pickup: { name: 'Dune Runner', length: 54, width: 27, top: 325, accel: 265, grip: 3.0, value: 2600, colors: ['#c96f2e', '#6a8f5f', '#8899aa'] },
  police: { name: 'Interceptor', length: 52, width: 26, top: 445, accel: 335, grip: 3.8, value: 0, colors: ['#f2f4f6'] },
};

let nextCarId = 1;
let nextPedId = 1;

export function createCar(modelId, x, y, angle, kind, rng) {
  const model = CAR_MODELS[modelId];
  return {
    id: nextCarId++,
    model: modelId,
    x,
    y,
    angle,
    speed: 0,
    steerVis: 0,
    color: kind === 'police' ? '#f2f4f6' : rng.pick(model.colors),
    kind, // 'traffic' | 'police' | 'parked'
    hasDriver: kind !== 'parked',
    health: 100,
    wreck: false,
    radius: model.length * 0.36,
    route: null,
    stuck: 0,
    reverseTimer: 0,
    honkTimer: 0,
    sirenPhase: rng.range(0, 6),
  };
}

/** Start a traffic car's route on the road it sits on: axis, direction and its right-hand lane. */
export function startRoute(car, city) {
  const near = city.nearestRoadPoint(car.x, car.y);
  if (near.axis === 'v') {
    car.route = { axis: 'v', center: near.x, dir: Math.sin(car.angle) < 0 ? -1 : 1, cooldown: 0 };
  } else {
    car.route = { axis: 'h', center: near.y, dir: Math.cos(car.angle) < 0 ? -1 : 1, cooldown: 0 };
  }
}

function angleTo(from, x, y) {
  return Math.atan2(y - from.y, x - from.x);
}

export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Shared car physics: throttle and steering in, new position out. Returns the impact speed of
 * any building hit (0 when the way was clear) so the caller can price the damage and the noise.
 */
export function stepCarPhysics(car, dt, throttle, steer, handbrake, city) {
  if (car.wreck) {
    car.speed = 0;
    return 0;
  }
  const model = CAR_MODELS[car.model];
  const tile = city.tileAtPx(car.x, car.y);
  const offroad = tile !== T_ROAD && tile !== T_RUNWAY;
  const inWater = tile === T_WATER;
  const topHere = inWater ? 30 : offroad ? model.top * 0.55 : model.top;

  if (throttle > 0) car.speed += model.accel * throttle * dt * (car.speed < 0 ? 2.2 : 1);
  else if (throttle < 0) car.speed += model.accel * throttle * dt * (car.speed > 0 ? 2.6 : 0.7);
  const drag = inWater ? 2.4 : handbrake ? 1.6 : 0.55;
  car.speed -= car.speed * drag * dt;
  if (handbrake) car.speed -= car.speed * 1.4 * dt;
  car.speed = Math.max(-model.top * 0.38, Math.min(topHere, car.speed));
  if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;

  const steerAuthority = Math.min(1, Math.abs(car.speed) / 120) * (car.speed < 0 ? -1 : 1);
  car.angle += steer * model.grip * 0.62 * steerAuthority * dt * (handbrake ? 1.5 : 1);
  car.steerVis += (steer - car.steerVis) * Math.min(1, dt * 10);

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const before = Math.abs(car.speed);
  const resolved = city.resolveCircle(nx, ny, car.radius);
  car.x = resolved.x;
  car.y = resolved.y;
  let impact = 0;
  if (resolved.impact > 0.12 && before > 60) {
    impact = before * resolved.impact;
    car.speed *= 0.25;
    car.health -= impact * 0.055;
  }
  if (inWater) car.health -= dt * 7;
  if (car.health <= 0 && !car.wreck) {
    car.wreck = true;
    car.speed = 0;
  }
  return impact;
}

/** A small deterministic hash so each traffic car makes its own mind up at each crossing. */
function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * One step of a traffic car: hold the right-hand lane of its avenue or street, turn at some
 * crossings, and brake for whatever is ahead. Returns 'honk' when it has been stuck a while.
 */
export function updateTrafficCar(car, dt, city, cars) {
  if (car.wreck || !car.hasDriver) return null;
  if (car.route === null) startRoute(car, city);
  const route = car.route;
  route.cooldown = Math.max(0, route.cooldown - dt);
  const model = CAR_MODELS[car.model];

  // Is a crossing near? Decide, once per crossing, whether to turn onto it.
  const crossings = route.axis === 'v' ? city.streetCenters : city.avenueCenters;
  const along = route.axis === 'v' ? car.y : car.x;
  for (let i = 0; i < crossings.length; i += 1) {
    if (Math.abs(along - crossings[i]) < 7 && route.cooldown <= 0) {
      route.cooldown = 1.2;
      if (hash2(car.id, i * 7 + Math.floor(car.x / 500)) < 0.38) {
        const turnDir = hash2(car.id, i * 13 + 5) < 0.5 ? 1 : -1;
        car.route = route.axis === 'v'
          ? { axis: 'h', center: crossings[i], dir: turnDir, cooldown: 1.2 }
          : { axis: 'v', center: crossings[i], dir: turnDir, cooldown: 1.2 };
      }
    }
  }

  const r = car.route;
  // The lane point ahead: on the centreline, offset to the driver's right-hand side
  // (southbound traffic keeps the west lane, eastbound the south lane), a stretch in front.
  let targetX;
  let targetY;
  if (r.axis === 'v') {
    targetX = r.center + (r.dir > 0 ? -32 : 32);
    targetY = car.y + r.dir * 170;
  } else {
    targetY = r.center + (r.dir > 0 ? 32 : -32);
    targetX = car.x + r.dir * 170;
  }
  const desired = Math.atan2(targetY - car.y, targetX - car.x);
  const diff = angleDiff(desired, car.angle);
  const steer = Math.max(-1, Math.min(1, diff * 2.4));

  // Traffic sense: anything slow in the corridor ahead means brakes.
  let throttle = car.speed < model.top * 0.52 ? 0.85 : 0;
  const aheadX = car.x + Math.cos(car.angle) * 84;
  const aheadY = car.y + Math.sin(car.angle) * 84;
  for (let i = 0; i < cars.length; i += 1) {
    const other = cars[i];
    if (other === car || other.wreck) continue;
    const dx = other.x - aheadX;
    const dy = other.y - aheadY;
    if (dx * dx + dy * dy < 46 * 46) {
      throttle = car.speed > 30 ? -0.7 : 0;
      break;
    }
  }
  if (throttle === 0 && car.speed < 4) {
    car.stuck += dt;
    if (car.stuck > 3.5) {
      car.stuck = 0;
      return 'honk';
    }
  } else car.stuck = 0;
  stepCarPhysics(car, dt, throttle, steer, false, city);
  return null;
}

/**
 * One step of a police car hunting `target` (the player, with a velocity lead). It drives the
 * roads when it is far away and cuts across lots when it is close, rams to stop its quarry,
 * and backs up when it wedges itself against a wall.
 */
export function updatePoliceCar(car, dt, city, target) {
  if (car.wreck) return;
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);
  let aimX = target.x + (target.vx ?? 0) * 0.35;
  let aimY = target.y + (target.vy ?? 0) * 0.35;
  if (dist > 620) {
    const road = city.nearestRoadPoint(target.x, target.y);
    aimX = road.x;
    aimY = road.y;
  }
  const desired = Math.atan2(aimY - car.y, aimX - car.x);
  const diff = angleDiff(desired, car.angle);
  let steer = Math.max(-1, Math.min(1, diff * 2.6));
  let throttle = 1;

  if (car.reverseTimer > 0) {
    car.reverseTimer -= dt;
    throttle = -1;
    steer = -steer;
  } else if (Math.abs(car.speed) < 12 && Math.abs(diff) < 2.4) {
    car.stuck += dt;
    if (car.stuck > 1.1) {
      car.stuck = 0;
      car.reverseTimer = 0.55;
    }
  } else car.stuck = 0;

  if (dist < 60 && Math.abs(diff) < 0.4) throttle = 0.4; // alongside: match pace, crowd the quarry
  stepCarPhysics(car, dt, throttle, steer, false, city);
}

const PED_SHIRTS = ['#ef6461', '#f4f1de', '#81b29a', '#f2cc8f', '#3d405b', '#e07a5f', '#6fb3d8', '#f6e8ea'];
const PED_SKINS = ['#f2c89b', '#c68863', '#8d5524', '#ffdbac', '#e0ac69'];

export function createPed(x, y, rng) {
  return {
    id: nextPedId++,
    x,
    y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    hp: 30,
    state: 'walk', // 'walk' | 'flee' | 'down'
    targetX: x,
    targetY: y,
    shirt: rng.pick(PED_SHIRTS),
    skin: rng.pick(PED_SKINS),
    walkPhase: rng.range(0, 6),
    calm: 0,
    cash: rng.int(4, 36),
  };
}

const PED_WALKABLE = new Set([T_SIDE, T_PLAZA, T_SAND, T_PIER, T_PARK]);

/** One step of a pedestrian: stroll to a chosen spot, or run from `danger` while it is close. */
export function updatePed(ped, dt, city, danger, rng) {
  if (ped.state === 'down') return;
  let wantSpeed = 62;
  if (danger !== null) {
    const dx = ped.x - danger.x;
    const dy = ped.y - danger.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < danger.r * danger.r) {
      ped.state = 'flee';
      ped.calm = 1.6;
      ped.targetX = ped.x + dx * 3;
      ped.targetY = ped.y + dy * 3;
    }
  }
  if (ped.state === 'flee') {
    wantSpeed = 205;
    ped.calm -= dt;
    if (ped.calm <= 0) ped.state = 'walk';
  }
  const dx = ped.targetX - ped.x;
  const dy = ped.targetY - ped.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 12 || city.tileAtPx(ped.targetX, ped.targetY) === T_WATER) {
    // Pick a new stroll target on a walkable tile nearby.
    for (let tries = 0; tries < 8; tries += 1) {
      const nx = ped.x + rng.range(-320, 320);
      const ny = ped.y + rng.range(-320, 320);
      const t = city.tileAtPx(nx, ny);
      if (PED_WALKABLE.has(t) || (ped.state === 'flee' && t !== T_WATER)) {
        ped.targetX = nx;
        ped.targetY = ny;
        break;
      }
    }
  }
  if (dist > 4) {
    const desired = Math.atan2(dy, dx);
    ped.angle += Math.max(-3.4 * dt, Math.min(3.4 * dt, angleDiff(desired, ped.angle)));
  }
  ped.speed += (wantSpeed - ped.speed) * Math.min(1, dt * 6);
  ped.walkPhase += dt * (ped.speed / 16);
  const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
  const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
  if (city.tileAtPx(nx, ny) === T_WATER) {
    ped.angle += Math.PI / 2;
    return;
  }
  const resolved = city.resolveCircle(nx, ny, 11);
  ped.x = resolved.x;
  ped.y = resolved.y;
}
