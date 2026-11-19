// The simulation: one world state and the fixed step that advances it. The player walks and
// drives; traffic and pedestrians come and go around them; the wanted heat rises with every
// witnessed crime and cools when the police lose the trail; missions hand out steps, talk in
// dialogue, pay in cash. The renderer only reads this state, and the loop only feeds it input
// and drains its events for sound — no drawing and no browser calls live here but storage.
import { CAR as CAR_CFG, CRIME, PLAYER as PLAYER_CFG, WANTED, WORLD } from './config.js';
import { T_WATER, createCity } from './city.js';
import {
  CAR_MODELS,
  angleDiff,
  createCar,
  createPed,
  startRoute,
  stepCarPhysics,
  updatePed,
  updatePoliceCar,
  updateTrafficCar,
} from './entities.js';
import { MISSIONS } from './missions.js';
import { createRng } from './random.js';

const TRAFFIC_TARGET = 13;
const PED_TARGET = 26;
const CITY_SEED = 20261119;

export function createGame(seed) {
  const rng = createRng(seed);
  const city = createCity(createRng(CITY_SEED));
  const pois = city.pois;

  const state = {
    time: 0,
    player: null,
    cars: [],
    peds: [],
    particles: [],
    popups: [],
    skids: [],
    pickups: [],
    wanted: { heat: 0, stars: 0, lastCrime: -99, bust: 0 },
    mission: { next: 0, active: false, index: -1, step: 0, dialogue: null, timer: null, car: null, passenger: null, failed: false },
    camera: { x: 0, y: 0 },
    events: [],
    banner: null,
    toast: null,
    objective: null,
    outcome: null,
    stats: { stolen: 0, earned: 0, busted: 0, wasted: 0 },
    storyDone: false,
  };

  function resetPlayer(x, y) {
    state.player = {
      x,
      y,
      angle: -Math.PI / 2,
      vx: 0,
      vy: 0,
      health: PLAYER_CFG.health,
      armor: 0,
      money: 40,
      weapon: 'fists',
      car: null,
      walkPhase: 0,
      punchCd: 0,
      fireCd: 0,
      moving: false,
    };
  }
  resetPlayer(pois.club.door.x, pois.club.door.y + 16);

  // Parked cars fill the lots; a few sit along the coast road.
  for (const spot of city.parkingSpots) {
    if (rng.chance(0.42)) {
      const model = rng.pick(['cub', 'sedan', 'sedan', 'pickup', 'van', 'cab']);
      state.cars.push(createCar(model, spot.x, spot.y, spot.angle, 'parked', rng));
    }
  }

  function addPickup(x, y, kind, amount, respawn) {
    state.pickups.push({ x, y, kind, amount, respawn, active: true, timer: 0, bob: rng.range(0, 6) });
  }
  addPickup(pois.hospital.door.x, pois.hospital.door.y, 'health', 40, 45);
  addPickup(pois.lifeguard.building.x + 40, pois.lifeguard.building.y + 90, 'health', 40, 45);
  addPickup(pois.club.door.x - 60, pois.club.door.y, 'health', 25, 60);
  addPickup(pois.gunshop.door.x, pois.gunshop.door.y, 'pistol', 0, 90);
  addPickup(pois.police.building.x + pois.police.building.w / 2, pois.police.building.y + pois.police.building.h + 30, 'armor', 60, 90);

  function popup(x, y, text, color) {
    state.popups.push({ x, y, text, color: color ?? '#ffe9a8', t: 0 });
  }
  function burst(x, y, color, count, speed, size) {
    for (let i = 0; i < count; i += 1) {
      const a = rng.range(0, Math.PI * 2);
      const s = rng.range(speed * 0.3, speed);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rng.range(0.3, 0.8), color, size: rng.range(1, size) });
    }
  }
  function banner(title, sub) {
    state.banner = { title, sub: sub ?? '', t: 0 };
  }
  function toast(text) {
    state.toast = { text, t: 0 };
  }

  function crime(amount, x, y) {
    // A crime only heats the city when someone is around to see it: a pedestrian, a driver,
    // or a police car within earshot. Out in the scrub, nobody knows.
    let witnessed = false;
    for (const ped of state.peds) {
      if (ped.state !== 'down' && Math.hypot(ped.x - x, ped.y - y) < 300) witnessed = true;
    }
    for (const car of state.cars) {
      if ((car.kind === 'police' || car.hasDriver) && Math.hypot(car.x - x, car.y - y) < 340) witnessed = true;
    }
    if (!witnessed && state.wanted.stars === 0) return;
    state.wanted.heat += amount;
    state.wanted.lastCrime = state.time;
  }

  function starsFor(heat) {
    let stars = 0;
    for (let i = 0; i < WANTED.starHeat.length; i += 1) if (heat >= WANTED.starHeat[i]) stars = i;
    return stars;
  }

  // --- spawning around the player -------------------------------------------------------

  function roadPointNear(x, y, minD, maxD) {
    for (let tries = 0; tries < 10; tries += 1) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(minD, maxD);
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      if (px < 80 || py < 80 || px > WORLD.width - 80 || py > WORLD.height - 80) continue;
      const road = city.nearestRoadPoint(px, py);
      if (Math.hypot(road.x - px, road.y - py) > 130) continue;
      return road;
    }
    return null;
  }

  function spawnTraffic() {
    const p = state.player;
    const point = roadPointNear(p.x, p.y, 640, 980);
    if (point === null) return;
    const model = rng.pick(['cub', 'sedan', 'sedan', 'cub', 'cab', 'pickup', 'van', 'gt']);
    const angle = point.axis === 'v' ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI);
    const car = createCar(model === 'gt' ? 'sedan' : model, point.x, point.y, angle, 'traffic', rng);
    startRoute(car, city);
    // Sit in the correct lane from the first frame.
    if (car.route.axis === 'v') car.x = car.route.center + (car.route.dir > 0 ? -32 : 32);
    else car.y = car.route.center + (car.route.dir > 0 ? 32 : -32);
    state.cars.push(car);
  }

  function spawnPolice() {
    const p = state.player;
    const point = roadPointNear(p.x, p.y, 680, 1000);
    if (point === null) return;
    const angle = Math.atan2(p.y - point.y, p.x - point.x);
    state.cars.push(createCar('police', point.x, point.y, angle, 'police', rng));
  }

  function spawnPed() {
    const p = state.player;
    for (let tries = 0; tries < 8; tries += 1) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(420, 700);
      const x = p.x + Math.cos(a) * d;
      const y = p.y + Math.sin(a) * d;
      const t = city.tileAtPx(x, y);
      if (t === T_WATER || city.circleHitsSolid(x, y, 12)) continue;
      state.peds.push(createPed(x, y, rng));
      return;
    }
  }

  // --- the player -----------------------------------------------------------------------

  function nearestCar(x, y, range) {
    let best = null;
    let bestD = range;
    for (const car of state.cars) {
      if (car.wreck) continue;
      const d = Math.hypot(car.x - x, car.y - y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  /** The mechanics of getting in, with none of the consequences: staging uses this too. */
  function seatPlayer(car) {
    const p = state.player;
    car.kind = 'player';
    p.car = car;
    p.x = car.x;
    p.y = car.y;
  }

  function enterCar(car) {
    const p = state.player;
    if (car.hasDriver && car.kind === 'traffic') {
      // The driver is thrown out and runs.
      const ped = createPed(car.x + 26, car.y + 10, rng);
      ped.state = 'flee';
      ped.calm = 2.5;
      state.peds.push(ped);
      car.hasDriver = false;
      crime(CRIME.stealCar, car.x, car.y);
      state.stats.stolen += 1;
      toast(`Stolen: ${CAR_MODELS[car.model].name} — the driver is not happy`);
    } else if (car.kind === 'parked') {
      crime(CRIME.stealCar * 0.7, car.x, car.y);
      state.stats.stolen += 1;
    }
    if (state.mission.car === car && state.mission.active) {
      const step = MISSIONS[state.mission.index].steps[state.mission.step];
      if (step.type === 'steal') crime(CRIME.missionTheft, car.x, car.y);
    }
    seatPlayer(car);
    state.events.push('door');
  }

  function exitCar() {
    const p = state.player;
    const car = p.car;
    if (car === null) return;
    car.kind = car.hasDriver ? 'traffic' : 'parked';
    if (car.kind === 'traffic') startRoute(car, city);
    p.car = null;
    const side = car.angle + Math.PI / 2;
    const resolved = city.resolveCircle(car.x + Math.cos(side) * 34, car.y + Math.sin(side) * 34, PLAYER_CFG.radius);
    p.x = resolved.x;
    p.y = resolved.y;
    state.events.push('door');
  }

  function hurtPlayer(amount) {
    const p = state.player;
    if (state.outcome !== null) return;
    const absorbed = Math.min(p.armor, amount * 0.7);
    p.armor -= absorbed;
    p.health -= amount - absorbed;
    state.events.push('hurt');
    if (p.health <= 0) {
      p.health = 0;
      state.outcome = 'wasted';
      state.events.push('wasted');
    }
  }

  function updatePlayerOnFoot(dt, input) {
    const p = state.player;
    const speed = input.run ? PLAYER_CFG.runSpeed : PLAYER_CFG.walkSpeed;
    let mx = input.moveX;
    let my = input.moveY;
    const len = Math.hypot(mx, my);
    if (len > 0.01) {
      mx /= len;
      my /= len;
      p.moving = true;
      p.walkPhase += dt * (input.run ? 13 : 9);
      if (state.mission.dialogue === null && p.weapon !== 'pistol') p.angle = Math.atan2(my, mx);
    } else p.moving = false;
    if (p.weapon === 'pistol') p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    const nx = p.x + mx * speed * dt;
    const ny = p.y + my * speed * dt;
    if (city.tileAtPx(nx, ny) === T_WATER && city.tileAtPx(p.x, p.y) !== T_WATER) {
      state.events.push('splash');
    } else {
      const resolved = city.resolveCircle(nx, ny, PLAYER_CFG.radius);
      p.vx = (resolved.x - p.x) / dt;
      p.vy = (resolved.y - p.y) / dt;
      p.x = resolved.x;
      p.y = resolved.y;
    }
    p.punchCd = Math.max(0, p.punchCd - dt);
    p.fireCd = Math.max(0, p.fireCd - dt);
    if (input.interactPressed) {
      const car = nearestCar(p.x, p.y, CAR_CFG.enterRange);
      if (car !== null) enterCar(car);
    }
    if ((input.attackPressed || input.attackHeld) && state.mission.dialogue === null) {
      if (p.weapon === 'pistol' && p.fireCd <= 0) firePistol();
      else if (p.weapon !== 'pistol' && p.punchCd <= 0) throwPunch();
    }
  }

  function throwPunch() {
    const p = state.player;
    p.punchCd = PLAYER_CFG.punchCooldown;
    state.events.push('punch');
    const fx = p.x + Math.cos(p.angle) * PLAYER_CFG.punchRange;
    const fy = p.y + Math.sin(p.angle) * PLAYER_CFG.punchRange;
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - fx, ped.y - fy) < 26) {
        damagePed(ped, PLAYER_CFG.punchDamage, p.angle, false);
        break;
      }
    }
  }

  function firePistol() {
    const p = state.player;
    p.fireCd = 0.21;
    state.events.push('shoot');
    crime(CRIME.shootAt, p.x, p.y);
    const spread = rng.range(-0.03, 0.03);
    const a = p.angle + spread;
    const range = 470;
    let bestPed = null;
    let bestT = range;
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      const dx = ped.x - p.x;
      const dy = ped.y - p.y;
      const t = dx * Math.cos(a) + dy * Math.sin(a);
      if (t < 10 || t > range) continue;
      const lateral = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
      if (lateral < 15 && t < bestT) {
        bestT = t;
        bestPed = ped;
      }
    }
    let bestCar = null;
    for (const car of state.cars) {
      if (car === p.car) continue;
      const dx = car.x - p.x;
      const dy = car.y - p.y;
      const t = dx * Math.cos(a) + dy * Math.sin(a);
      if (t < 10 || t > range || t > bestT) continue;
      const lateral = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
      if (lateral < car.radius) {
        bestCar = car;
        bestT = t;
      }
    }
    const hitX = p.x + Math.cos(a) * bestT;
    const hitY = p.y + Math.sin(a) * bestT;
    burst(hitX, hitY, '#ffd23e', 3, 90, 3);
    state.particles.push({ x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22, vx: 0, vy: 0, t: 0, life: 0.06, color: '#fff3b0', size: 7 });
    if (bestPed !== null) damagePed(bestPed, 34, a, true);
    else if (bestCar !== null) {
      bestCar.health -= 9;
      if (bestCar.hasDriver) crime(CRIME.hitCar, bestCar.x, bestCar.y);
    }
  }

  function damagePed(ped, amount, angle, byGun) {
    ped.hp -= amount;
    ped.state = 'flee';
    ped.calm = 2.2;
    ped.targetX = ped.x + Math.cos(angle) * 200;
    ped.targetY = ped.y + Math.sin(angle) * 200;
    burst(ped.x, ped.y, '#e8e3d3', 4, 70, 3);
    if (ped.hp <= 0 && ped.state !== 'down') {
      ped.state = 'down';
      crime(byGun ? CRIME.killPed : CRIME.hitPed, ped.x, ped.y);
      if (rng.chance(0.75)) {
        state.pickups.push({ x: ped.x + rng.range(-8, 8), y: ped.y + rng.range(-8, 8), kind: 'cash', amount: ped.cash, respawn: 0, active: true, timer: 0, bob: 0 });
      }
    } else {
      crime(CRIME.hitPed * 0.5, ped.x, ped.y);
    }
  }

  function updatePlayerDriving(dt, input) {
    const p = state.player;
    const car = p.car;
    const impact = stepCarPhysics(car, dt, input.throttle, input.steer, input.handbrake, city);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.vx = Math.cos(car.angle) * car.speed;
    p.vy = Math.sin(car.angle) * car.speed;
    if (impact > 90) {
      state.events.push('crash2');
      hurtPlayer((impact - 90) * 0.06);
      burst(car.x, car.y, '#cfc4ae', 8, 130, 3);
    } else if (impact > 25) state.events.push('crash1');
    if (input.handbrake && Math.abs(car.speed) > 150) {
      state.skids.push({ x: car.x - Math.cos(car.angle) * 14, y: car.y - Math.sin(car.angle) * 14, angle: car.angle, t: 0 });
    }
    if (input.interactPressed && Math.abs(car.speed) < 30) exitCar();

    // Running over pedestrians and trading paint with other cars.
    const speed = Math.abs(car.speed);
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < car.radius + 10) {
        if (speed > CAR_CFG.runOverSpeed) {
          ped.hp = 0;
          ped.state = 'down';
          crime(CRIME.killPed, ped.x, ped.y);
          burst(ped.x, ped.y, '#e8e3d3', 8, 120, 3);
          state.events.push('thud');
        } else {
          ped.state = 'flee';
          ped.calm = 2;
          ped.targetX = ped.x + (ped.x - car.x) * 4;
          ped.targetY = ped.y + (ped.y - car.y) * 4;
        }
      }
    }
    for (const other of state.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const d = Math.hypot(dx, dy);
      const minD = car.radius + other.radius - 6;
      if (d > 0.01 && d < minD) {
        const push = (minD - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        other.x += ux * push;
        other.y += uy * push;
        car.x -= ux * push;
        car.y -= uy * push;
        if (speed > 120) {
          other.health -= speed * 0.05;
          car.health -= speed * 0.03;
          crime(CRIME.hitCar, other.x, other.y);
          state.events.push('crash1');
          burst(other.x - ux * other.radius, other.y - uy * other.radius, '#ffd23e', 5, 110, 3);
        }
        other.speed *= 0.6;
        car.speed *= 0.75;
      }
    }
  }

  function explodeCar(car) {
    car.exploded = true;
    state.events.push('explosion');
    burst(car.x, car.y, '#ff8c42', 26, 260, 5);
    burst(car.x, car.y, '#5b4a68', 16, 120, 6);
    const p = state.player;
    if (p.car === car) {
      exitCar();
      hurtPlayer(34);
    } else if (Math.hypot(p.x - car.x, p.y - car.y) < 95) hurtPlayer(22);
    for (const ped of state.peds) {
      if (ped.state !== 'down' && Math.hypot(ped.x - car.x, ped.y - car.y) < 95) {
        ped.hp = 0;
        ped.state = 'down';
      }
    }
    for (const other of state.cars) {
      if (other !== car && Math.hypot(other.x - car.x, other.y - car.y) < 90) other.health -= 40;
    }
  }

  // --- wanted, police and busting ---------------------------------------------------------

  function updateWanted(dt) {
    const w = state.wanted;
    w.stars = starsFor(w.heat);
    const p = state.player;
    let policeNear = false;
    for (const car of state.cars) {
      if (car.kind === 'police' && !car.wreck && Math.hypot(car.x - p.x, car.y - p.y) < 400) policeNear = true;
    }
    if (state.time - w.lastCrime > WANTED.coolDelay && !policeNear && w.heat > 0) {
      w.heat = Math.max(0, w.heat - WANTED.coolRate * dt);
      w.stars = starsFor(w.heat);
    }
    // Keep the police fleet at the size the stars demand.
    let policeCount = 0;
    for (const car of state.cars) if (car.kind === 'police' && !car.wreck) policeCount += 1;
    const wanted = WANTED.policeByStar[w.stars];
    if (policeCount < wanted && rng.chance(dt * 1.4)) spawnPolice();
    if (w.stars === 0) {
      for (const car of state.cars) {
        if (car.kind === 'police') {
          car.kind = 'traffic';
          car.hasDriver = true;
          startRoute(car, city);
        }
      }
    }
    // Busted: a police car holding station next to a slow or standing player.
    if (w.stars > 0 && state.outcome === null) {
      let holding = false;
      for (const car of state.cars) {
        if (car.kind !== 'police' || car.wreck) continue;
        const d = Math.hypot(car.x - p.x, car.y - p.y);
        const playerSlow = p.car === null ? !p.moving : Math.abs(p.car.speed) < 26;
        if (d < (p.car === null ? 58 : 78) && playerSlow) holding = true;
      }
      if (holding) {
        w.bust += dt;
        if (w.bust >= WANTED.bustHoldSeconds) {
          state.outcome = 'busted';
          state.events.push('busted');
        }
      } else w.bust = Math.max(0, w.bust - dt * 1.6);
    } else w.bust = 0;
  }

  // --- missions ---------------------------------------------------------------------------

  function stepTarget(step) {
    if (step.type === 'getcar') {
      const car = nearestCar(state.player.x, state.player.y, 4000);
      return car === null ? null : { x: car.x, y: car.y };
    }
    if (step.type === 'steal') {
      return state.mission.car === null ? null : { x: state.mission.car.x, y: state.mission.car.y };
    }
    if (step.type === 'escape') return null;
    const poi = pois[step.at];
    if (poi === undefined) return null;
    if (step.at === 'pier' && step.type === 'pickup') return { x: poi.x, y: poi.y };
    return { x: poi.door.x, y: poi.door.y };
  }

  function beginStep(index) {
    const m = state.mission;
    m.step = index;
    const def = MISSIONS[m.index];
    const step = def.steps[index];
    m.timer = step.time ?? null;
    if (step.wantedOnStart) {
      state.wanted.heat = Math.max(state.wanted.heat, WANTED.starHeat[step.wantedOnStart]);
      state.wanted.lastCrime = state.time;
    }
    if (step.type === 'steal') {
      if (step.tag === 'aurora') {
        const car = createCar('gt', pois.portlot.x, pois.portlot.y, -Math.PI / 2, 'parked', rng);
        car.color = '#ff5d3b';
        m.car = car;
        state.cars.push(car);
      } else if (step.tag === 'freight') {
        const car = createCar('van', pois.portlot.x - 120, pois.portlot.y + 60, Math.PI, 'parked', rng);
        car.color = '#a8c6c0';
        m.car = car;
        state.cars.push(car);
      }
    }
  }

  function startMission(index) {
    const m = state.mission;
    m.active = true;
    m.index = index;
    m.car = null;
    m.passenger = null;
    m.dialogue = { lines: MISSIONS[index].intro, i: 0, after: 'begin' };
    banner(MISSIONS[index].title, `a job from ${MISSIONS[index].giver}`);
    state.events.push('blip');
  }

  function failMission(reason) {
    const m = state.mission;
    m.active = false;
    m.dialogue = null;
    m.car = null;
    m.passenger = null;
    m.timer = null;
    state.wanted.heat = Math.min(state.wanted.heat, 18);
    banner('Job failed', reason);
    state.events.push('sting-bad');
  }

  function completeMission() {
    const m = state.mission;
    const def = MISSIONS[m.index];
    state.player.money += def.reward;
    state.stats.earned += def.reward;
    popup(state.player.x, state.player.y - 30, `+$${def.reward}`, '#8be28b');
    m.dialogue = { lines: def.outro, i: 0, after: 'finish' };
    m.active = false;
    m.car = null;
    m.passenger = null;
    m.timer = null;
    state.events.push('sting-ok');
    state.events.push('cash');
  }

  function advanceDialogue() {
    const m = state.mission;
    if (m.dialogue === null) return;
    state.events.push('blip');
    m.dialogue.i += 1;
    if (m.dialogue.i >= m.dialogue.lines.length) {
      const after = m.dialogue.after;
      m.dialogue = null;
      if (after === 'begin') beginStep(0);
      else if (after === 'finish') {
        state.mission.next += 1;
        if (state.mission.next >= MISSIONS.length) {
          state.storyDone = true;
          banner('SOLMAR CITY', 'story complete — the city is yours');
        }
      }
    }
  }

  function updateMission(dt) {
    const m = state.mission;
    const p = state.player;
    if (!m.active) {
      if (m.next < MISSIONS.length && m.dialogue === null) {
        const door = pois.club.door;
        state.objective = { x: door.x, y: door.y, label: `Meet Paloma at Club Palma — ${MISSIONS[m.next].title}`, dist: Math.hypot(p.x - door.x, p.y - door.y), marker: 'P' };
        if (state.objective.dist < 78) startMission(m.next);
      } else if (m.dialogue === null) {
        state.objective = chopObjective();
      }
      return;
    }
    const def = MISSIONS[m.index];
    const step = def.steps[m.step];
    if (m.timer !== null) {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission('out of time');
        return;
      }
    }
    if (m.car !== null && m.car.wreck && (step.type === 'goto' && step.needTag)) {
      failMission('the car is wrecked');
      return;
    }
    const target = stepTarget(step);
    let label = step.label;
    if (m.passenger !== null) label += ` — ${m.passenger} is with you`;
    if (m.timer !== null) label += ` — ${Math.ceil(m.timer)}s`;
    state.objective = target === null ? { x: p.x, y: p.y, label, dist: 0, marker: '!' } : { x: target.x, y: target.y, label, dist: Math.hypot(p.x - target.x, p.y - target.y), marker: '◆' };
    let done = false;
    if (step.type === 'getcar') done = p.car !== null;
    else if (step.type === 'steal') done = p.car !== null && p.car === m.car;
    else if (step.type === 'escape') done = state.wanted.stars === 0;
    else if (target !== null) {
      const r = step.r ?? 80;
      const inCarOk = !step.inCar || p.car !== null;
      const tagOk = !step.needTag || p.car === m.car;
      done = state.objective.dist < r && inCarOk && tagOk;
    }
    if (done) {
      if (step.passenger) {
        m.passenger = step.passenger;
        toast(`${step.passenger} is in the car`);
      }
      if (step.type === 'goto' && step.at === 'hospital') m.passenger = null;
      state.events.push('pickup');
      if (m.step + 1 >= def.steps.length) completeMission();
      else beginStep(m.step + 1);
    }
  }

  function chopObjective() {
    const p = state.player;
    if (p.car !== null && p.car.kind === 'player') {
      const door = pois.garage.door;
      return { x: door.x, y: door.y, label: "Sell this car at Tito's Garage (free roam)", dist: Math.hypot(p.x - door.x, p.y - door.y), marker: '$' };
    }
    return null;
  }

  function updateChopShop() {
    const p = state.player;
    if (state.mission.active || p.car === null) return;
    const door = pois.garage.door;
    if (Math.hypot(p.x - door.x, p.y - door.y) > 105) return;
    const car = p.car;
    if (car.model === 'police') {
      toast("Tito: 'A police Interceptor? Get that out of here!'");
      p.x += 130;
      return;
    }
    const pay = Math.round((CAR_MODELS[car.model].value * Math.max(0.15, car.health / 100)) / 10);
    exitCar();
    state.cars.splice(state.cars.indexOf(car), 1);
    state.player.money += pay;
    state.stats.earned += pay;
    popup(door.x, door.y - 20, `+$${pay} — Tito takes the ${CAR_MODELS[car.model].name}`, '#8be28b');
    state.events.push('cash');
    toast('Car sold. Tito asks no questions.');
  }

  // --- pickups, effects, camera -------------------------------------------------------------

  function updatePickups(dt) {
    const p = state.player;
    for (const pickup of state.pickups) {
      if (!pickup.active) {
        if (pickup.respawn > 0) {
          pickup.timer -= dt;
          if (pickup.timer <= 0) pickup.active = true;
        }
        continue;
      }
      pickup.bob += dt * 3;
      const range = pickup.kind === 'cash' ? 40 : 30;
      if (Math.hypot(p.x - pickup.x, p.y - pickup.y) < range) {
        if (pickup.kind === 'health' && p.health >= PLAYER_CFG.health) continue;
        if (pickup.kind === 'armor' && p.armor >= PLAYER_CFG.armor) continue;
        if (pickup.kind === 'pistol' && p.weapon === 'pistol') continue;
        pickup.active = false;
        pickup.timer = pickup.respawn;
        if (pickup.kind === 'health') {
          p.health = Math.min(PLAYER_CFG.health, p.health + pickup.amount);
          popup(p.x, p.y - 24, `+${pickup.amount} health`, '#8be28b');
          state.events.push('pickup');
        } else if (pickup.kind === 'armor') {
          p.armor = Math.min(PLAYER_CFG.armor, p.armor + pickup.amount);
          popup(p.x, p.y - 24, 'vest on', '#a8c6e8');
          state.events.push('pickup');
        } else if (pickup.kind === 'pistol') {
          p.weapon = 'pistol';
          popup(p.x, p.y - 24, 'Pistol — aim with the mouse, click to fire', '#ffd23e');
          toast('Pistol acquired');
          state.events.push('pickup');
        } else if (pickup.kind === 'cash') {
          p.money += pickup.amount;
          state.stats.earned += pickup.amount;
          popup(p.x, p.y - 24, `+$${pickup.amount}`, '#ffe9a8');
          state.events.push('cash');
        }
      }
    }
    // Cash drops that were never collected fade away.
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = state.pickups[i];
      if (pickup.kind === 'cash' && pickup.respawn === 0 && !pickup.active) state.pickups.splice(i, 1);
    }
  }

  function updateEffects(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const fx = state.particles[i];
      fx.t += dt;
      fx.x += fx.vx * dt;
      fx.y += fx.vy * dt;
      fx.vx *= 0.92;
      fx.vy *= 0.92;
      if (fx.t >= fx.life) state.particles.splice(i, 1);
    }
    for (let i = state.popups.length - 1; i >= 0; i -= 1) {
      const pop = state.popups[i];
      pop.t += dt;
      pop.y -= dt * 34;
      if (pop.t > 1.4) state.popups.splice(i, 1);
    }
    for (let i = state.skids.length - 1; i >= 0; i -= 1) {
      state.skids[i].t += dt;
      if (state.skids[i].t > 7) state.skids.splice(i, 1);
    }
    if (state.banner !== null) {
      state.banner.t += dt;
      if (state.banner.t > 3.4) state.banner = null;
    }
    if (state.toast !== null) {
      state.toast.t += dt;
      if (state.toast.t > 3.6) state.toast = null;
    }
  }

  // --- the step -----------------------------------------------------------------------------

  function step(dt, input) {
    state.time += dt;
    if (state.events.length > 240) state.events.splice(0, state.events.length - 240);
    const p = state.player;

    if (state.mission.dialogue !== null) {
      if (input.confirmPressed) advanceDialogue();
      updateEffects(dt);
      updateCamera(dt);
      return;
    }
    if (state.outcome !== null) {
      updateEffects(dt);
      return;
    }

    if (p.car !== null) updatePlayerDriving(dt, input);
    else updatePlayerOnFoot(dt, input);

    // Traffic and pedestrians flow around the player; the far ones are recycled.
    let trafficCount = 0;
    for (const car of state.cars) if (car.kind === 'traffic') trafficCount += 1;
    if (trafficCount < TRAFFIC_TARGET && rng.chance(dt * 2.2)) spawnTraffic();
    if (state.peds.length < PED_TARGET && rng.chance(dt * 3)) spawnPed();

    const danger = { x: p.x, y: p.y, r: 130 };
    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      const car = state.cars[i];
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (car.kind === 'traffic') {
        if (d > 1500) {
          state.cars.splice(i, 1);
          continue;
        }
        const event = updateTrafficCar(car, dt, city, state.cars);
        if (event === 'honk') state.events.push('honk');
      } else if (car.kind === 'police') {
        if (d > 1700 && state.wanted.stars === 0) {
          state.cars.splice(i, 1);
          continue;
        }
        updatePoliceCar(car, dt, city, { x: p.x, y: p.y, vx: p.vx, vy: p.vy });
      }
      if (car.wreck && !car.exploded && car.health <= -25) explodeCar(car);
      if (car !== p.car && Math.abs(car.speed) > 60 && p.car === null) {
        // A moving car is bad news for a pedestrian player.
        if (Math.hypot(car.x - p.x, car.y - p.y) < car.radius + 12) {
          hurtPlayer(Math.abs(car.speed) * 0.07);
          p.x += (p.x - car.x) * 0.4;
          p.y += (p.y - car.y) * 0.4;
        }
      }
    }
    for (let i = state.peds.length - 1; i >= 0; i -= 1) {
      const ped = state.peds[i];
      if (Math.hypot(ped.x - p.x, ped.y - p.y) > 1200) {
        state.peds.splice(i, 1);
        continue;
      }
      const localDanger = state.wanted.stars > 0 || (p.car !== null && Math.abs(p.car.speed) > 200) ? danger : null;
      updatePed(ped, dt, city, localDanger, rng);
    }

    updateWanted(dt);
    updateMission(dt);
    updateChopShop();
    updatePickups(dt);
    updateEffects(dt);
    updateCamera(dt);
  }

  function updateCamera(dt) {
    const p = state.player;
    const look = p.car !== null ? 0.42 : 0.18;
    const tx = p.x + p.vx * look - 640;
    const ty = p.y + p.vy * look - 360;
    const cam = state.camera;
    const k = Math.min(1, dt * 5);
    cam.x += (Math.max(0, Math.min(WORLD.width - 1280, tx)) - cam.x) * k;
    cam.y += (Math.max(0, Math.min(WORLD.height - 720, ty)) - cam.y) * k;
  }

  // --- outcomes and saving --------------------------------------------------------------------

  function respawnOutcome() {
    const p = state.player;
    const w = state.wanted;
    if (state.outcome === 'busted') {
      state.stats.busted += 1;
      const fine = Math.min(p.money, 120 + w.stars * 60);
      p.money -= fine;
      if (p.car !== null) exitCar();
      p.x = pois.police.door.x;
      p.y = pois.police.door.y + 8;
      toast(fine > 0 ? `Busted. The fine took $${fine}.` : 'Busted. They let you go with a warning.');
    } else if (state.outcome === 'wasted') {
      state.stats.wasted += 1;
      const bill = Math.min(p.money, 150);
      p.money -= bill;
      if (p.car !== null) exitCar();
      p.x = pois.hospital.door.x;
      p.y = pois.hospital.door.y + 8;
      p.health = PLAYER_CFG.health;
      toast(`Solmar General patched you up. Bill: $${bill}.`);
    }
    w.heat = 0;
    w.stars = 0;
    w.bust = 0;
    state.outcome = null;
    if (state.mission.active) failMission('you were stopped');
  }

  function serialize() {
    const p = state.player;
    return {
      money: p.money,
      weapon: p.weapon,
      next: state.mission.next,
      storyDone: state.storyDone,
      x: p.x,
      y: p.y,
      stats: state.stats,
    };
  }

  function applySave(data) {
    const p = state.player;
    p.money = data.money ?? p.money;
    p.weapon = data.weapon ?? 'fists';
    state.mission.next = data.next ?? 0;
    state.storyDone = data.storyDone ?? false;
    if (Number.isFinite(data.x) && Number.isFinite(data.y) && !city.circleHitsSolid(data.x, data.y, PLAYER_CFG.radius)) {
      p.x = data.x;
      p.y = data.y;
    }
    if (data.stats) state.stats = data.stats;
    state.camera.x = Math.max(0, Math.min(WORLD.width - 1280, p.x - 640));
    state.camera.y = Math.max(0, Math.min(WORLD.height - 720, p.y - 360));
  }

  function snapCamera() {
    const p = state.player;
    state.camera.x = Math.max(0, Math.min(WORLD.width - 1280, p.x - 640));
    state.camera.y = Math.max(0, Math.min(WORLD.height - 720, p.y - 360));
  }

  /**
   * Debug hooks the screenshot scenes stage with: they place the player, traffic, police and
   * pedestrians and set the wanted heat, then let the real step() run the scene forward.
   */
  const stage = {
    placePlayer(x, y) {
      const p = state.player;
      if (p.car !== null) exitCar();
      p.x = x;
      p.y = y;
      snapCamera();
    },
    seatInNewCar(modelId, x, y, angle) {
      const car = createCar(modelId, x, y, angle, 'parked', rng);
      state.cars.push(car);
      seatPlayer(car);
      snapCamera();
      return car;
    },
    addTraffic(modelId, x, y, angle) {
      const car = createCar(modelId, x, y, angle, 'traffic', rng);
      startRoute(car, city);
      state.cars.push(car);
      return car;
    },
    addPolice(x, y, angle) {
      const car = createCar('police', x, y, angle, 'police', rng);
      state.cars.push(car);
      return car;
    },
    addPed(x, y) {
      const ped = createPed(x, y, rng);
      state.peds.push(ped);
      return ped;
    },
    setHeat(heat) {
      state.wanted.heat = heat;
      state.wanted.lastCrime = state.time;
    },
    startMissionAt(index) {
      state.mission.next = index;
      startMission(index);
    },
    snapCamera,
  };

  return { state, city, step, advanceDialogue, respawnOutcome, serialize, applySave, stage };
}
