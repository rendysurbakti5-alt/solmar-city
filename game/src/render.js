// Drawing only: the game state and the current screen in, pixels out. The camera looks down
// on Solmar City in a warm afternoon light — pastel towers with sun shadows, palms, a teal
// sea — and the HUD frames it: health and armour, cash and wanted stars, a live minimap in
// the corner, the mission objective along the bottom, and dialogue when someone is talking.
// The world is drawn tile by tile only where the camera can see; the minimap's base map is
// painted once onto its own canvas and blitted every frame with the blips on top.
import { FONT, FONT_DISPLAY, PALETTE, TILE, VIEW, WORLD } from './config.js';
import { T_LOT, T_PARK, T_PIER, T_PLAZA, T_ROAD, T_RUNWAY, T_SAND, T_SCRUB, T_SIDE, T_WATER } from './city.js';
import { CAR_MODELS } from './entities.js';
import { GAME_TITLE, GAME_SUBTITLE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_HELP = 'help';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const TILE_COLORS = {
  [T_WATER]: PALETTE.water,
  [T_SAND]: PALETTE.sand,
  [T_ROAD]: PALETTE.road,
  [T_SIDE]: PALETTE.sidewalk,
  [T_LOT]: '#bfa87e',
  [T_PARK]: PALETTE.grass,
  [T_PLAZA]: PALETTE.plaza,
  [T_RUNWAY]: '#3f3d40',
  [T_PIER]: '#a9805a',
  [T_SCRUB]: PALETTE.scrub,
};

/** Deterministic per-tile hash, so ground variation never flickers between frames. */
function tileHash(tx, ty) {
  let h = (tx * 374761393 + ty * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function shade(hex, factor) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  let minimapBase = null;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  /** Client (mouse) pixels to logical view pixels. */
  function toLogical(clientX, clientY) {
    const ratio = window.devicePixelRatio || 1;
    return { x: (clientX * ratio - view.x) / view.scale, y: (clientY * ratio - view.y) / view.scale };
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, display) {
    const key = `${size}|${display ? 1 : 0}`;
    if (!fonts.has(key)) fonts.set(key, `${size}px ${display ? FONT_DISPLAY : FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }
  function outlined(value, x, y, size, color, align, display) {
    context.lineWidth = Math.max(2, size / 9);
    context.strokeStyle = 'rgba(30,20,10,0.75)';
    const key = `${size}|${display ? 1 : 0}`;
    if (!fonts.has(key)) fonts.set(key, `${size}px ${display ? FONT_DISPLAY : FONT}`);
    context.font = fonts.get(key);
    context.textAlign = align;
    context.strokeText(value, x, y);
    context.fillStyle = color;
    context.fillText(value, x, y);
  }

  function buildMinimap(city) {
    minimapBase = document.createElement('canvas');
    minimapBase.width = 256;
    minimapBase.height = 192;
    const m = minimapBase.getContext('2d');
    const sx = 256 / city.cols;
    const sy = 192 / city.rows;
    for (let ty = 0; ty < city.rows; ty += 1) {
      for (let tx = 0; tx < city.cols; tx += 1) {
        const t = city.tiles[ty * city.cols + tx];
        m.fillStyle = t === T_LOT ? '#b7a67f' : TILE_COLORS[t];
        m.fillRect(Math.floor(tx * sx), Math.floor(ty * sy), Math.ceil(sx), Math.ceil(sy));
      }
    }
    m.fillStyle = 'rgba(255,255,255,0.5)';
    for (const b of city.buildings) {
      m.fillRect((b.x / WORLD.width) * 256, (b.y / WORLD.height) * 192, Math.max(1.5, (b.w / WORLD.width) * 256), Math.max(1.5, (b.h / WORLD.height) * 192));
    }
  }

  // --- the world -------------------------------------------------------------------------

  function drawGround(city, cam, time) {
    const tx0 = Math.max(0, Math.floor(cam.x / TILE));
    const ty0 = Math.max(0, Math.floor(cam.y / TILE));
    const tx1 = Math.min(city.cols - 1, Math.floor((cam.x + VIEW.width) / TILE));
    const ty1 = Math.min(city.rows - 1, Math.floor((cam.y + VIEW.height) / TILE));
    for (let ty = ty0; ty <= ty1; ty += 1) {
      for (let tx = tx0; tx <= tx1; tx += 1) {
        const t = city.tiles[ty * city.cols + tx];
        const x = tx * TILE - cam.x;
        const y = ty * TILE - cam.y;
        const h = tileHash(tx, ty);
        context.fillStyle = TILE_COLORS[t];
        context.fillRect(x, y, TILE + 1, TILE + 1);
        if (t === T_LOT || t === T_PARK || t === T_SCRUB) {
          context.fillStyle = h > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
          context.fillRect(x, y, TILE + 1, TILE + 1);
        } else if (t === T_WATER) {
          if (h > 0.6) {
            context.fillStyle = 'rgba(10,70,95,0.35)';
            context.fillRect(x, y, TILE + 1, TILE + 1);
          }
          // Foam where the sea meets the sand.
          if (city.tileAt(tx, ty - 1) === T_SAND || city.tileAt(tx, ty - 1) === T_PIER) {
            context.fillStyle = 'rgba(255,255,255,0.55)';
            const wave = Math.sin(time * 1.7 + tx * 0.9) * 3;
            context.fillRect(x, y + wave, TILE + 1, 3);
          }
        } else if (t === T_SAND && h > 0.88) {
          // A beach umbrella and its little shadow of shade.
          context.fillStyle = 'rgba(120,90,40,0.25)';
          context.beginPath();
          context.arc(x + 20 + h * 22, y + 38, 11, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = ['#ef6461', '#f2cc8f', '#81b29a'][Math.floor(h * 10) % 3];
          context.beginPath();
          context.arc(x + 18 + h * 22, y + 34, 10, 0, Math.PI * 2);
          context.fill();
        } else if (t === T_PIER) {
          context.fillStyle = 'rgba(0,0,0,0.16)';
          context.fillRect(x, y + 20, TILE + 1, 3);
          context.fillRect(x, y + 44, TILE + 1, 3);
        }
      }
    }
    // Lane dashes along every avenue and street the camera can see.
    context.strokeStyle = PALETTE.roadLine;
    context.lineWidth = 3;
    context.setLineDash([26, 22]);
    for (const cx of city.avenueCenters) {
      if (cx < cam.x - 40 || cx > cam.x + VIEW.width + 40) continue;
      context.beginPath();
      context.moveTo(cx - cam.x, Math.max(0, 3 * TILE - cam.y));
      context.lineTo(cx - cam.x, Math.min(VIEW.height, 48 * TILE - cam.y));
      context.stroke();
    }
    for (const cy of city.streetCenters) {
      if (cy < cam.y - 40 || cy > cam.y + VIEW.height + 40) continue;
      context.beginPath();
      context.moveTo(0, cy - cam.y);
      context.lineTo(VIEW.width, cy - cam.y);
      context.stroke();
    }
    context.setLineDash([]);
    // The runway's threshold stripes.
    context.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 6; i += 1) {
      const x = 58 * TILE + i * 14 - cam.x;
      const y = 3 * TILE - cam.y;
      if (x > -20 && x < VIEW.width + 20 && y > -140 && y < VIEW.height + 20) context.fillRect(x, y + 8, 8, TILE * 2 - 16);
    }
  }

  function drawBuilding(b, cam) {
    const x = b.x - cam.x;
    const y = b.y - cam.y;
    if (x + b.w < -80 || y + b.h < -80 || x > VIEW.width + 80 || y > VIEW.height + 120) return;
    const lift = Math.min(46, b.height);
    // Sun shadow, cast to the south-east.
    context.fillStyle = PALETTE.shadow;
    context.fillRect(x + 10 + lift * 0.4, y + 12 + lift * 0.5, b.w, b.h);
    // The south wall, then the roof above it, edged so even pale stucco reads as a building.
    context.fillStyle = shade(b.color, 0.7);
    context.fillRect(x, y + lift * 0.45, b.w, b.h);
    context.fillStyle = shade(b.roof, 0.82);
    context.fillRect(x - 1.5, y - 1.5, b.w + 3, b.h + 3);
    context.fillStyle = b.roof;
    context.fillRect(x, y, b.w, b.h);
    context.fillStyle = 'rgba(255,255,255,0.22)';
    context.fillRect(x, y, b.w, 5);
    context.fillStyle = 'rgba(0,0,0,0.13)';
    context.fillRect(x + 6, y + 6, b.w - 12, b.h - 12);
    context.fillStyle = b.roof;
    context.fillRect(x + 10, y + 10, b.w - 20, b.h - 20);
    // Rooftop clutter — air-conditioning boxes and a water tank on the tall ones.
    context.fillStyle = 'rgba(70,60,48,0.35)';
    const acCount = Math.min(5, Math.floor((b.w * b.h) / 26000));
    for (let i = 0; i < acCount; i += 1) {
      const hx = tileHash(b.seed + i * 31, i * 7);
      const hy = tileHash(i * 17, b.seed + i * 13);
      context.fillRect(x + 14 + hx * (b.w - 44), y + 14 + hy * (b.h - 44), 15, 11);
    }
    if (b.floors >= 7) {
      const tx = x + b.w * (0.25 + tileHash(b.seed, 3) * 0.5);
      context.fillStyle = 'rgba(90,70,50,0.55)';
      context.fillRect(tx, y + 16, 16, 13);
      context.fillRect(tx + 2, y + 12, 12, 5);
    }
    // Windows down the sunlit wall, placed by the building's own seed.
    if (b.floors >= 2) {
      const colsW = Math.max(2, Math.floor(b.w / 26));
      const rowsW = Math.min(6, b.floors);
      context.fillStyle = 'rgba(38,52,74,0.55)';
      for (let r = 0; r < rowsW; r += 1) {
        for (let c = 0; c < colsW; c += 1) {
          const h = tileHash(b.seed + c * 7, r * 13 + b.seed);
          if (h < 0.35) continue;
          context.fillStyle = h > 0.8 ? 'rgba(255,214,120,0.8)' : 'rgba(38,52,74,0.5)';
          context.fillRect(x + 10 + c * 24, y + lift * 0.45 + 8 + r * 13, 12, 7);
        }
      }
    }
    if (b.name !== null) {
      context.fillStyle = '#3a2c18';
      const label = b.name;
      context.font = `bold 13px ${FONT}`;
      const w = Math.min(b.w - 8, context.measureText(label).width + 16);
      context.fillStyle = 'rgba(24,20,14,0.82)';
      context.fillRect(x + b.w / 2 - w / 2, y + b.h + lift * 0.45 - 24, w, 20);
      text(label, x + b.w / 2, y + b.h + lift * 0.45 - 10, 13, '#ffe9a8', 'center');
    }
  }

  function drawPalm(palm, cam, time) {
    const x = palm.x - cam.x;
    const y = palm.y - cam.y;
    if (x < -60 || y < -60 || x > VIEW.width + 60 || y > VIEW.height + 60) return;
    const s = palm.s;
    context.fillStyle = 'rgba(46,32,16,0.22)';
    context.beginPath();
    context.ellipse(x + 12 * s, y + 8 * s, 20 * s, 7 * s, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.palmTrunk;
    context.lineWidth = 5 * s;
    context.beginPath();
    context.moveTo(x, y);
    context.quadraticCurveTo(x + 4 * s, y - 16 * s, x + 9 * s, y - 30 * s);
    context.stroke();
    const sway = Math.sin(time * 1.3 + palm.x * 0.05) * 0.05;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + sway + palm.y * 0.01;
      context.strokeStyle = i % 2 === 0 ? PALETTE.palmLeaf : PALETTE.palmLeafDark;
      context.lineWidth = 3.4 * s;
      context.beginPath();
      context.moveTo(x + 9 * s, y - 30 * s);
      context.quadraticCurveTo(
        x + 9 * s + Math.cos(a) * 16 * s,
        y - 30 * s + Math.sin(a) * 10 * s - 5 * s,
        x + 9 * s + Math.cos(a) * 27 * s,
        y - 30 * s + Math.sin(a) * 16 * s + 6 * s,
      );
      context.stroke();
    }
    context.fillStyle = '#7a5230';
    context.beginPath();
    context.arc(x + 7 * s, y - 28 * s, 3 * s, 0, Math.PI * 2);
    context.arc(x + 12 * s, y - 27 * s, 3 * s, 0, Math.PI * 2);
    context.fill();
  }

  // --- the moving world --------------------------------------------------------------------

  function drawCar(car, cam, time) {
    const model = CAR_MODELS[car.model];
    const x = car.x - cam.x;
    const y = car.y - cam.y;
    if (x < -90 || y < -90 || x > VIEW.width + 90 || y > VIEW.height + 90) return;
    context.save();
    context.translate(x, y);
    // Shadow first, unrotated sun offset.
    context.fillStyle = PALETTE.shadow;
    context.beginPath();
    context.ellipse(6, 9, model.length * 0.52, model.width * 0.62, 0, 0, Math.PI * 2);
    context.fill();
    context.rotate(car.angle);
    const L = model.length;
    const W = model.width;
    // Wheels: the front pair turns with the steering.
    context.fillStyle = '#1d1d20';
    const wy = W / 2 - 2;
    context.fillRect(-L * 0.3, -wy - 3, 11, 5);
    context.fillRect(-L * 0.3, wy - 2, 11, 5);
    context.save();
    context.translate(L * 0.26, -wy - 3);
    context.rotate(car.steerVis * 0.45);
    context.fillRect(-5, 0, 11, 5);
    context.restore();
    context.save();
    context.translate(L * 0.26, wy - 2);
    context.rotate(car.steerVis * 0.45);
    context.fillRect(-5, 0, 11, 5);
    context.restore();
    // Body.
    const body = car.wreck ? '#3c3a3c' : car.color;
    context.fillStyle = body;
    context.beginPath();
    context.roundRect(-L / 2, -W / 2, L, W, 8);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.20)';
    context.beginPath();
    context.roundRect(-L / 2 + 3, -W / 2 + 3, L - 6, W / 2 - 3, 6);
    context.fill();
    // Cabin and glass.
    context.fillStyle = car.wreck ? '#242426' : '#22344a';
    context.beginPath();
    context.roundRect(-L * 0.16, -W / 2 + 4, L * 0.34, W - 8, 5);
    context.fill();
    context.fillStyle = 'rgba(160,210,235,0.5)';
    context.fillRect(L * 0.1, -W / 2 + 5, 5, W - 10);
    if (car.model === 'van' || car.model === 'pickup') {
      context.fillStyle = car.wreck ? '#333' : shade(car.color, 1.06);
      context.fillRect(-L / 2 + 4, -W / 2 + 3, L * 0.3, W - 6);
    }
    if (car.model === 'cab') {
      context.fillStyle = '#20303f';
      context.fillRect(-4, -6, 12, 12);
      text('TAXI', 2, 3.5, 7, '#ffd23e', 'center');
    }
    if (car.kind === 'police' || car.model === 'police') {
      context.fillStyle = '#20303f';
      context.fillRect(-L * 0.1, -W / 2, L * 0.2, W);
      const flash = Math.sin(time * 11 + car.sirenPhase) > 0;
      context.fillStyle = flash ? '#ff3b30' : '#7a1610';
      context.fillRect(-6, -W / 2 + 2, 12, 6);
      context.fillStyle = flash ? '#1c6fff' : '#0d2c63';
      context.fillRect(-6, W / 2 - 8, 12, 6);
      text('POLICE', 0, 3, 8, '#20303f', 'center');
    }
    // Lights.
    context.fillStyle = '#fff6c9';
    context.fillRect(L / 2 - 3, -W / 2 + 3, 3, 5);
    context.fillRect(L / 2 - 3, W / 2 - 8, 3, 5);
    context.fillStyle = '#d23b2e';
    context.fillRect(-L / 2, -W / 2 + 3, 3, 5);
    context.fillRect(-L / 2, W / 2 - 8, 3, 5);
    context.restore();
    // Damage smoke.
    if (!car.wreck && car.health < 45) {
      const puff = (Math.sin(time * 7 + car.id * 3) + 1) / 2;
      context.fillStyle = `rgba(60,58,60,${0.25 + puff * 0.2})`;
      context.beginPath();
      context.arc(x + 10, y - 6 - puff * 12, 5 + puff * 6, 0, Math.PI * 2);
      context.fill();
    }
    if (car.wreck) {
      context.fillStyle = 'rgba(30,28,28,0.5)';
      context.beginPath();
      context.arc(x, y, model.length * 0.3, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPerson(x, y, angle, shirt, skin, walkPhase, moving, isPlayer, hasGun) {
    context.fillStyle = 'rgba(46,32,16,0.25)';
    context.beginPath();
    context.ellipse(x + 3, y + 5, 11, 5, 0, 0, Math.PI * 2);
    context.fill();
    const stride = moving ? Math.sin(walkPhase) * 6 : 0;
    context.strokeStyle = isPlayer ? '#2c3550' : '#4a4238';
    context.lineWidth = 4.4;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle + 2.6) * 9 + Math.cos(angle) * stride * 0.4, y + Math.sin(angle + 2.6) * 9 + Math.sin(angle) * stride * 0.4);
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle - 2.6) * 9 - Math.cos(angle) * stride * 0.4, y + Math.sin(angle - 2.6) * 9 - Math.sin(angle) * stride * 0.4);
    context.stroke();
    context.fillStyle = shirt;
    context.beginPath();
    context.arc(x, y, 9.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = skin;
    context.beginPath();
    context.arc(x + Math.cos(angle) * 2.5, y + Math.sin(angle) * 2.5, 5.6, 0, Math.PI * 2);
    context.fill();
    if (isPlayer) {
      context.strokeStyle = '#ffd23e';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, 12.5, 0, Math.PI * 2);
      context.stroke();
    }
    if (hasGun) {
      context.strokeStyle = '#22242a';
      context.lineWidth = 3.4;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + Math.cos(angle) * 17, y + Math.sin(angle) * 17);
      context.stroke();
    }
  }

  function drawPickup(pickup, cam, time) {
    const x = pickup.x - cam.x;
    const y = pickup.y - cam.y + Math.sin(pickup.bob) * 3;
    if (x < -40 || y < -40 || x > VIEW.width + 40 || y > VIEW.height + 40) return;
    const pulse = 12 + Math.sin(time * 4 + pickup.bob) * 2.5;
    context.fillStyle = 'rgba(255,233,168,0.20)';
    context.beginPath();
    context.arc(x, y, pulse + 7, 0, Math.PI * 2);
    context.fill();
    if (pickup.kind === 'health') {
      context.fillStyle = '#fdfdf8';
      context.fillRect(x - 9, y - 9, 18, 18);
      context.fillStyle = '#d23b2e';
      context.fillRect(x - 2.5, y - 6, 5, 12);
      context.fillRect(x - 6, y - 2.5, 12, 5);
    } else if (pickup.kind === 'armor') {
      context.fillStyle = '#3f6fb5';
      context.beginPath();
      context.roundRect(x - 8, y - 10, 16, 20, 4);
      context.fill();
      context.fillStyle = '#cfe1f5';
      context.fillRect(x - 5, y - 6, 10, 4);
    } else if (pickup.kind === 'pistol') {
      context.fillStyle = '#22242a';
      context.fillRect(x - 10, y - 3, 17, 6);
      context.fillRect(x + 2, y + 2, 5, 8);
      context.fillStyle = '#ffd23e';
      context.beginPath();
      context.arc(x, y - 12, 3, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillStyle = '#3f9e4d';
      context.fillRect(x - 10, y - 6, 20, 12);
      context.fillStyle = '#d9f0d9';
      text('$', x, y + 4.5, 12, '#3f9e4d', 'center');
    }
  }

  function drawMarker(x, y, cam, time, label, color) {
    const sx = x - cam.x;
    const sy = y - cam.y;
    const bob = Math.sin(time * 3.4) * 6;
    const grad = context.createLinearGradient(0, sy - 190, 0, sy);
    grad.addColorStop(0, 'rgba(255,210,62,0)');
    grad.addColorStop(1, 'rgba(255,210,62,0.30)');
    context.fillStyle = grad;
    context.fillRect(sx - 13, sy - 190, 26, 190);
    context.fillStyle = color;
    context.save();
    context.translate(sx, sy - 44 + bob);
    context.rotate(Math.PI / 4);
    context.fillRect(-11, -11, 22, 22);
    context.restore();
    outlined(label, sx, sy - 40 + bob, 17, '#ffffff', 'center');
  }

  // --- HUD -----------------------------------------------------------------------------------

  function drawStar(cx, cy, r, filled, flash) {
    context.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    if (filled) {
      context.fillStyle = flash ? '#ff5d3b' : '#ffd23e';
      context.fill();
    }
    context.strokeStyle = 'rgba(20,14,6,0.8)';
    context.lineWidth = 1.6;
    context.stroke();
  }

  function drawMinimap(state, city) {
    if (minimapBase === null) buildMinimap(city);
    const W = 216;
    const H = 162;
    const x0 = 18;
    const y0 = VIEW.height - H - 18;
    context.fillStyle = 'rgba(16,20,16,0.72)';
    context.beginPath();
    context.roundRect(x0 - 5, y0 - 5, W + 10, H + 10, 8);
    context.fill();
    context.drawImage(minimapBase, x0, y0, W, H);
    const sx = (wx) => x0 + (wx / WORLD.width) * W;
    const sy = (wy) => y0 + (wy / WORLD.height) * H;
    for (const car of state.cars) {
      if (car.kind === 'police') {
        context.fillStyle = Math.sin(state.time * 9 + car.sirenPhase) > 0 ? '#ff3b30' : '#3b82f6';
        context.fillRect(sx(car.x) - 2.4, sy(car.y) - 2.4, 4.8, 4.8);
      }
    }
    if (state.objective !== null) {
      context.fillStyle = '#ffd23e';
      context.save();
      context.translate(sx(state.objective.x), sy(state.objective.y));
      context.rotate(Math.PI / 4);
      context.fillRect(-3.6, -3.6, 7.2, 7.2);
      context.restore();
    }
    for (const pickup of state.pickups) {
      if (!pickup.active || pickup.kind === 'cash') continue;
      context.fillStyle = pickup.kind === 'health' ? '#ff7b72' : pickup.kind === 'armor' ? '#7ab3ff' : '#ffd23e';
      context.fillRect(sx(pickup.x) - 1.8, sy(pickup.y) - 1.8, 3.6, 3.6);
    }
    const p = state.player;
    context.save();
    context.translate(sx(p.x), sy(p.y));
    context.rotate(p.angle);
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-5, -4.6);
    context.lineTo(-5, 4.6);
    context.closePath();
    context.fill();
    context.restore();
    text('SOLMAR CITY', x0 + 4, y0 - 10, 11, 'rgba(255,255,255,0.75)', 'left');
  }

  function wrapText(value, maxWidth, size) {
    context.font = `${size}px ${FONT}`;
    const words = value.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const trial = line === '' ? word : `${line} ${word}`;
      if (context.measureText(trial).width > maxWidth && line !== '') {
        lines.push(line);
        line = word;
      } else line = trial;
    }
    if (line !== '') lines.push(line);
    return lines;
  }

  function drawHud(state, city) {
    const p = state.player;
    // Health and armour, top-left.
    context.fillStyle = 'rgba(16,20,16,0.55)';
    context.beginPath();
    context.roundRect(16, 14, 252, 52, 8);
    context.fill();
    context.fillStyle = '#3a3f3a';
    context.fillRect(24, 24, 200, 13);
    const hpFrac = Math.max(0, p.health / 100);
    context.fillStyle = hpFrac > 0.35 ? '#69c24a' : '#e2574c';
    context.fillRect(24, 24, 200 * hpFrac, 13);
    context.fillStyle = '#3a3f3a';
    context.fillRect(24, 43, 200, 9);
    context.fillStyle = '#7ab3ff';
    context.fillRect(24, 43, 200 * Math.max(0, p.armor / 100), 9);
    text(p.weapon === 'pistol' ? 'PISTOL' : 'FISTS', 232, 36, 13, '#ffe9a8', 'left');
    // Cash and stars, top-right.
    const cooling = state.time - state.wanted.lastCrime > 6 && state.wanted.heat > 0;
    outlined(`$${p.money}`, VIEW.width - 24, 42, 30, '#8be28b', 'right');
    for (let i = 0; i < 5; i += 1) {
      drawStar(VIEW.width - 36 - i * 34, 66, 13, i < state.wanted.stars, cooling && Math.sin(state.time * 6) > 0);
    }
    if (state.wanted.bust > 0.15) {
      const frac = Math.min(1, state.wanted.bust / 2.2);
      context.fillStyle = 'rgba(178,34,34,0.85)';
      context.fillRect(VIEW.width / 2 - 110, 18, 220 * frac, 10);
      outlined('BUSTED?', VIEW.width / 2, 48, 20, '#ff8a7a', 'center');
    }
    drawMinimap(state, city);
    // Objective along the bottom.
    if (state.objective !== null) {
      const label = `${state.objective.label}   ·   ${Math.round(state.objective.dist / 10)}m`;
      context.font = `bold 17px ${FONT}`;
      const w = Math.min(760, context.measureText(label).width + 36);
      context.fillStyle = 'rgba(16,20,16,0.66)';
      context.beginPath();
      context.roundRect(VIEW.width / 2 - w / 2, VIEW.height - 46, w, 32, 8);
      context.fill();
      text(label, VIEW.width / 2, VIEW.height - 24, 17, '#ffe9a8', 'center');
    }
    if (state.toast !== null) {
      const a = Math.min(1, (3.6 - state.toast.t) / 0.6, state.toast.t / 0.2);
      context.globalAlpha = Math.max(0, a);
      context.font = `15px ${FONT}`;
      const w = context.measureText(state.toast.text).width + 28;
      context.fillStyle = 'rgba(16,20,16,0.7)';
      context.beginPath();
      context.roundRect(VIEW.width / 2 - w / 2, 74, w, 28, 8);
      context.fill();
      text(state.toast.text, VIEW.width / 2, 93, 15, '#ffffff', 'center');
      context.globalAlpha = 1;
    }
    if (state.banner !== null) {
      const t = state.banner.t;
      const a = Math.min(1, t / 0.3, (3.4 - t) / 0.7);
      context.globalAlpha = Math.max(0, a);
      outlined(state.banner.title, VIEW.width / 2, 148, 44, '#ffd23e', 'center', true);
      if (state.banner.sub !== '') outlined(state.banner.sub, VIEW.width / 2, 178, 19, '#ffffff', 'center');
      context.globalAlpha = 1;
    }
    // Dialogue: a panel along the bottom that leaves the minimap clear.
    if (state.mission.dialogue !== null) {
      const d = state.mission.dialogue;
      const line = d.lines[Math.min(d.i, d.lines.length - 1)];
      const boxH = 108;
      const boxX = 252;
      context.fillStyle = 'rgba(14,16,22,0.88)';
      context.beginPath();
      context.roundRect(boxX, VIEW.height - boxH - 56, VIEW.width - boxX - 24, boxH, 10);
      context.fill();
      context.fillStyle = '#ffd23e';
      context.fillRect(boxX, VIEW.height - boxH - 56, 6, boxH);
      text(line[0], boxX + 26, VIEW.height - boxH - 26, 16, '#ffd23e', 'left');
      const lines = wrapText(line[1], VIEW.width - boxX - 90, 19);
      lines.forEach((l, i) => text(l, boxX + 26, VIEW.height - boxH + 2 + i * 24, 19, '#f5f2e8', 'left'));
      if (Math.sin(state.time * 5) > -0.2) text('E ▸', VIEW.width - 48, VIEW.height - 66, 16, '#ffd23e', 'right');
    }
    // Context controls hint.
    const hint = p.car !== null ? 'W A S D drive · Space handbrake · F get out · P pause' : 'W A S D move · Shift run · F enter car · Space punch · mouse aim · P pause';
    text(hint, VIEW.width - 16, VIEW.height - 12, 12.5, 'rgba(255,255,255,0.55)', 'right');
  }

  // --- screens ---------------------------------------------------------------------------------

  function drawWorld(state, city, camOverride) {
    const cam = camOverride ?? state.camera;
    drawGround(city, cam, state.time);
    for (const b of city.buildings) drawBuilding(b, cam);
    for (const palm of city.palms) drawPalm(palm, cam, state.time);
    for (const skid of state.skids) {
      context.fillStyle = `rgba(30,28,28,${0.34 * (1 - skid.t / 7)})`;
      context.save();
      context.translate(skid.x - cam.x, skid.y - cam.y);
      context.rotate(skid.angle);
      context.fillRect(-13, -13, 26, 5);
      context.fillRect(-13, 8, 26, 5);
      context.restore();
    }
    for (const pickup of state.pickups) if (pickup.active) drawPickup(pickup, cam, state.time);
    for (const ped of state.peds) {
      const x = ped.x - cam.x;
      const y = ped.y - cam.y;
      if (x < -40 || y < -40 || x > VIEW.width + 40 || y > VIEW.height + 40) continue;
      if (ped.state === 'down') {
        context.save();
        context.translate(x, y);
        context.rotate(ped.angle + Math.PI / 2);
        context.fillStyle = ped.shirt;
        context.fillRect(-11, -5, 22, 10);
        context.fillStyle = ped.skin;
        context.beginPath();
        context.arc(14, 0, 5, 0, Math.PI * 2);
        context.fill();
        context.restore();
      } else {
        drawPerson(x, y, ped.angle, ped.shirt, ped.skin, ped.walkPhase, ped.speed > 8, false, false);
      }
    }
    for (const car of state.cars) drawCar(car, cam, state.time);
    const p = state.player;
    if (p.car === null && state.outcome === null) {
      drawPerson(p.x - cam.x, p.y - cam.y, p.angle, '#1f8a8a', '#c68863', p.walkPhase, p.moving, true, p.weapon === 'pistol');
    }
    for (const fx of state.particles) {
      context.globalAlpha = Math.max(0, 1 - fx.t / fx.life);
      context.fillStyle = fx.color;
      context.beginPath();
      context.arc(fx.x - cam.x, fx.y - cam.y, fx.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    if (state.objective !== null && state.mission.dialogue === null) {
      drawMarker(state.objective.x, state.objective.y, cam, state.time, state.objective.marker ?? '◆', '#ffd23e');
    }
    for (const pop of state.popups) {
      context.globalAlpha = Math.max(0, 1 - pop.t / 1.4);
      outlined(pop.text, pop.x - cam.x, pop.y - cam.y, 16, pop.color, 'center');
    }
    context.globalAlpha = 1;
    // Warm sun wash and a soft vignette.
    const grad = context.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, 'rgba(255,176,84,0.07)');
    grad.addColorStop(1, 'rgba(24,40,80,0.08)');
    context.fillStyle = grad;
    context.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawTitle(state, ui) {
    const t = state.time;
    const cam = {
      x: 1750 + Math.sin(t * 0.06) * 850,
      y: 2280 + Math.cos(t * 0.045) * 240,
    };
    drawWorld(state, ui.city, cam);
    context.fillStyle = 'rgba(20,16,30,0.38)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    const grad = context.createLinearGradient(0, 96, 0, 210);
    grad.addColorStop(0, '#ffd23e');
    grad.addColorStop(0.6, '#ff8c42');
    grad.addColorStop(1, '#ef6461');
    context.font = `92px ${FONT_DISPLAY}`;
    context.textAlign = 'center';
    context.fillStyle = grad;
    context.strokeStyle = 'rgba(40,16,4,0.85)';
    context.lineWidth = 10;
    context.strokeText(GAME_TITLE, VIEW.width / 2, 196);
    context.fillText(GAME_TITLE, VIEW.width / 2, 196);
    outlined(GAME_SUBTITLE, VIEW.width / 2, 240, 24, '#ffffff', 'center');
    const items = ui.menuItems;
    items.forEach((item, i) => {
      const y = 330 + i * 52;
      if (i === ui.menuIndex) {
        context.fillStyle = 'rgba(255,210,62,0.9)';
        context.beginPath();
        context.roundRect(VIEW.width / 2 - 170, y - 30, 340, 42, 9);
        context.fill();
        text(item, VIEW.width / 2, y, 25, '#33240a', 'center');
      } else {
        outlined(item, VIEW.width / 2, y, 25, '#f5f2e8', 'center');
      }
    });
    text('W A S D / arrows to move · F to steal a car · mouse to aim · your city, your rules', VIEW.width / 2, VIEW.height - 54, 16, 'rgba(255,255,255,0.85)', 'center');
    text('An original open-world crime game. Every name, street and story in it was invented here.', VIEW.width / 2, VIEW.height - 28, 13, 'rgba(255,255,255,0.6)', 'center');
  }

  function drawPanel(title, lines, prompt) {
    context.fillStyle = 'rgba(12,14,20,0.62)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    const w = 620;
    const h = 130 + lines.length * 30 + 56;
    const x = VIEW.width / 2 - w / 2;
    const y = VIEW.height / 2 - h / 2;
    context.fillStyle = 'rgba(18,20,28,0.94)';
    context.beginPath();
    context.roundRect(x, y, w, h, 12);
    context.fill();
    outlined(title, VIEW.width / 2, y + 66, 40, '#ffd23e', 'center', true);
    lines.forEach((line, i) => text(line, VIEW.width / 2, y + 108 + i * 30, 18, '#e8e3d3', 'center'));
    text(prompt, VIEW.width / 2, y + h - 24, 17, '#8be28b', 'center');
  }

  /** Paint one frame. `ui` carries the screen, the city, and the title menu's state. */
  function draw(state, screen, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0e1420';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.textBaseline = 'alphabetic';
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
      return;
    }
    drawWorld(state, ui.city, null);
    drawHud(state, ui.city);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The city holds its breath.', '', `Cash $${state.player.money} · Cars stolen ${state.stats.stolen}`], 'P or Esc to keep driving');
    } else if (screen === SCREEN_HELP) {
      drawPanel('HOW TO PLAY', [
        'W A S D / arrows — move and drive. Shift — run. Space — punch / handbrake.',
        'F — enter or leave a car. Mouse — aim the pistol. Click / J — fire.',
        'Follow the gold marker: Paloma at Club Palma hands out the story jobs.',
        'Crimes raise your wanted stars. Lose the police to cool them — or Tito',
        'at the garage buys any car you bring him, no questions asked.',
      ], 'Esc to go back');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Solmar PD finally kept up.', 'You walk out of the station lighter of pocket.'], 'Enter to continue');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('DOWNED', ['Solmar General picked you up off the pavement.', 'The bill is in your pocket. The city is still out there.'], 'Enter to continue');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toLogical };
}
