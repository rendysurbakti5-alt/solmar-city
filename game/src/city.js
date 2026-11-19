// Solmar City itself: a seeded island city on a 64-pixel tile grid — six avenues, five streets,
// a beach and ocean to the south, a marina pier, an airstrip in the north-east scrub, and five
// districts with their own paint. The builder lays the roads first, rings them with sidewalks,
// then fills each block with towers, houses, warehouses, parks or parking lots, and records the
// special buildings (the club, the hospital, the police station, the garage) the story uses.
// Nothing here knows about the player: it answers questions — what tile is this, is this circle
// inside a wall, where is the nearest road — for the entities and the renderer.
import { DISTRICT_PAINT, TILE, WORLD } from './config.js';

export const T_WATER = 0;
export const T_SAND = 1;
export const T_ROAD = 2;
export const T_SIDE = 3;
export const T_LOT = 4;
export const T_PARK = 5;
export const T_PLAZA = 6;
export const T_RUNWAY = 7;
export const T_PIER = 8;
export const T_SCRUB = 9;

/** Avenue tile columns (two wide each) and street tile rows (two tall each). */
const AVENUE_COLS = [5, 19, 33, 47, 61, 73];
const STREET_ROWS = [7, 17, 27, 37, 46];
const COAST_ROAD_ROW = 46;
const BEACH_TOP = 48;
const WATER_TOP = 54;

export function createCity(rng) {
  const cols = WORLD.width / TILE;
  const rows = WORLD.height / TILE;
  const tiles = new Uint8Array(cols * rows);
  const buildings = [];
  const palms = [];
  const parkingSpots = [];
  const pois = {};

  const at = (tx, ty) => tiles[ty * cols + tx];
  const set = (tx, ty, value) => {
    tiles[ty * cols + tx] = value;
  };

  // Base coat: scrub in the north, lots in the city, sand then sea in the south.
  for (let ty = 0; ty < rows; ty += 1) {
    for (let tx = 0; tx < cols; tx += 1) {
      if (ty >= WATER_TOP) set(tx, ty, T_WATER);
      else if (ty >= BEACH_TOP) set(tx, ty, T_SAND);
      else if (ty <= 2) set(tx, ty, T_SCRUB);
      else set(tx, ty, T_LOT);
    }
  }

  // The airstrip: a runway strip in the north-east scrub, with a taxiway down to the road grid.
  for (let tx = 57; tx <= 78; tx += 1) {
    set(tx, 3, T_RUNWAY);
    set(tx, 4, T_RUNWAY);
  }
  for (let ty = 5; ty <= 6; ty += 1) set(67, ty, T_ROAD);
  set(68, 5, T_ROAD);
  set(68, 6, T_ROAD);

  // Roads: avenues run the island's length, streets cross them, the coast road hugs the beach.
  for (const c of AVENUE_COLS) {
    for (let ty = 3; ty < BEACH_TOP; ty += 1) {
      set(c, ty, T_ROAD);
      set(c + 1, ty, T_ROAD);
    }
  }
  for (const r of STREET_ROWS) {
    for (let tx = 0; tx < cols; tx += 1) {
      if (ty_isBeach(r)) continue;
      set(tx, r, T_ROAD);
      set(tx, r + 1, T_ROAD);
    }
  }
  function ty_isBeach(r) {
    return r >= WATER_TOP;
  }

  // Re-assert the runway where the avenues crossed it.
  for (let tx = 57; tx <= 78; tx += 1) {
    set(tx, 3, T_RUNWAY);
    set(tx, 4, T_RUNWAY);
  }

  // The marina pier: two tiles of planks reaching into the sea, east of the last avenue.
  for (let ty = BEACH_TOP; ty < rows; ty += 1) {
    set(55, ty, T_PIER);
    set(56, ty, T_PIER);
  }

  // Sidewalks ring every road tile that is not already beach, water or runway.
  const roadSnapshot = Uint8Array.from(tiles);
  for (let ty = 0; ty < rows; ty += 1) {
    for (let tx = 0; tx < cols; tx += 1) {
      if (roadSnapshot[ty * cols + tx] !== T_LOT) continue;
      let nearRoad = false;
      for (let dy = -1; dy <= 1 && !nearRoad; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          if (roadSnapshot[ny * cols + nx] === T_ROAD) nearRoad = true;
        }
      }
      if (nearRoad) set(tx, ty, T_SIDE);
    }
  }
  // The promenade: the two sand rows above the beach become boardwalk.
  for (let tx = 0; tx < cols; tx += 1) {
    if (at(tx, BEACH_TOP) === T_SAND) set(tx, BEACH_TOP, T_SIDE);
  }

  function districtAt(tx, ty) {
    if (ty >= 39) return 'marina';
    if (tx >= 63) return 'portside';
    if (tx >= 27 && tx <= 54 && ty <= 36) return 'downtown';
    if (tx <= 18) return 'palmheights';
    return 'oldtown';
  }

  function addBuildingPx(px, py, pw, ph, floors, district, name) {
    const building = {
      x: px,
      y: py,
      w: pw,
      h: ph,
      floors,
      height: floors * 9,
      color: rng.pick(DISTRICT_PAINT[district]),
      roof: rng.pick(DISTRICT_PAINT[district]),
      district,
      name: name ?? null,
      seed: rng.int(1, 100000),
    };
    buildings.push(building);
    return building;
  }

  function addBuilding(tx, ty, tw, th, floors, district, name) {
    const inset = 6;
    const building = addBuildingPx(tx * TILE + inset, ty * TILE + inset, tw * TILE - inset * 2, th * TILE - inset * 2, floors, district, name);
    for (let y = ty; y < ty + th; y += 1) {
      for (let x = tx; x < tx + tw; x += 1) set(x, y, T_LOT);
    }
    return building;
  }

  // Fill each block between roads with buildings, a park, a plaza or a parking lot.
  const blockEdgesX = [0, ...AVENUE_COLS.flatMap((c) => [c, c + 2]), cols];
  const blockEdgesY = [3, ...STREET_ROWS.flatMap((r) => [r, r + 2]), BEACH_TOP];
  for (let by = 0; by < blockEdgesY.length - 1; by += 1) {
    for (let bx = 0; bx < blockEdgesX.length - 1; bx += 1) {
      const x0 = blockEdgesX[bx];
      const x1 = blockEdgesX[bx + 1];
      const y0 = blockEdgesY[by];
      const y1 = blockEdgesY[by + 1];
      if (x1 - x0 < 3 || y1 - y0 < 3) continue;
      fillBlock(x0, y0, x1, y1);
    }
  }

  function fillBlock(x0, y0, x1, y1) {
    const cx = Math.floor((x0 + x1) / 2);
    const cy = Math.floor((y0 + y1) / 2);
    if (y0 <= 4 && x1 > 56) return; // the airstrip's scrub stays clear of buildings
    const district = districtAt(cx, cy);
    const inner = { x0: x0 + 1, y0: y0 + 1, x1: x1 - 1, y1: y1 - 1 };
    const w = inner.x1 - inner.x0;
    const h = inner.y1 - inner.y0;
    if (w < 2 || h < 2) return;
    const roll = rng.random();
    if (roll < 0.13) {
      // A park: grass, a path cross, palms.
      for (let ty = inner.y0; ty < inner.y1; ty += 1) {
        for (let tx = inner.x0; tx < inner.x1; tx += 1) set(tx, ty, T_PARK);
      }
      for (let i = 0; i < w + h; i += 1) {
        palms.push({ x: rng.range(inner.x0 * TILE + 20, inner.x1 * TILE - 20), y: rng.range(inner.y0 * TILE + 20, inner.y1 * TILE - 20), s: rng.range(0.85, 1.2) });
      }
      return;
    }
    if (roll < 0.22) {
      // A parking lot: plaza tiles and rows of parked-car spots.
      for (let ty = inner.y0; ty < inner.y1; ty += 1) {
        for (let tx = inner.x0; tx < inner.x1; tx += 1) set(tx, ty, T_PLAZA);
      }
      for (let tx = inner.x0; tx < inner.x1; tx += 2) {
        parkingSpots.push({ x: (tx + 0.5) * TILE, y: (inner.y0 + 0.6) * TILE, angle: Math.PI / 2 });
        if (inner.y1 - inner.y0 > 2) parkingSpots.push({ x: (tx + 0.5) * TILE, y: (inner.y1 - 0.6) * TILE, angle: -Math.PI / 2 });
      }
      return;
    }
    // Buildings: split the block into lots with alleys between, so a block reads as a row of
    // separate buildings — towers of mixed heights downtown, warehouses at the port, houses
    // and small blocks elsewhere — instead of one slab on an empty apron.
    const lotCols = district === 'portside' ? (w >= 9 ? 2 : 1) : w >= 9 ? 3 : w >= 5 ? 2 : 1;
    const lotRows = district === 'portside' ? 1 : h >= 6 ? 2 : 1;
    for (let ly = 0; ly < lotRows; ly += 1) {
      for (let lx = 0; lx < lotCols; lx += 1) {
        if (district !== 'downtown' && district !== 'portside' && rng.chance(0.08)) continue; // a gap-tooth lot
        const tx0 = inner.x0 + Math.floor((lx * w) / lotCols);
        const tx1 = inner.x0 + Math.floor(((lx + 1) * w) / lotCols);
        const ty0 = inner.y0 + Math.floor((ly * h) / lotRows);
        const ty1 = inner.y0 + Math.floor(((ly + 1) * h) / lotRows);
        const floors = district === 'downtown' ? rng.int(5, 16) : district === 'portside' ? rng.int(1, 2) : rng.int(1, 4);
        addBuildingPx(tx0 * TILE + 5, ty0 * TILE + 5, (tx1 - tx0) * TILE - 10, (ty1 - ty0) * TILE - 10, floors, district, null);
      }
    }
  }

  // Special buildings the story needs, placed over whatever the blocks grew.
  function placePoi(key, tx, ty, tw, th, floors, district, name) {
    // Clear whatever the blocks grew on this ground first, so nothing overlaps.
    const px = tx * TILE;
    const py = ty * TILE;
    for (let i = buildings.length - 1; i >= 0; i -= 1) {
      const b = buildings[i];
      if (b.x < px + tw * TILE && b.x + b.w > px && b.y < py + th * TILE && b.y + b.h > py) buildings.splice(i, 1);
    }
    const building = addBuilding(tx, ty, tw, th, floors, district, name);
    pois[key] = {
      building,
      door: { x: (tx + tw / 2) * TILE, y: (ty + th) * TILE + 26 },
      x: (tx + tw / 2) * TILE,
      y: (ty + th / 2) * TILE,
    };
    return building;
  }
  placePoi('club', 36, 42, 5, 3, 2, 'marina', 'CLUB PALMA');
  placePoi('hospital', 22, 30, 6, 3, 4, 'oldtown', 'SOLMAR GENERAL');
  placePoi('police', 37, 20, 5, 3, 5, 'downtown', 'SOLMAR PD');
  placePoi('motel', 8, 20, 5, 2, 2, 'palmheights', 'MOTEL PALMA');
  placePoi('garage', 64, 30, 5, 3, 1, 'portside', "TITO'S GARAGE");
  placePoi('gunshop', 50, 30, 3, 2, 2, 'downtown', 'SOLMAR SPORTING');
  placePoi('warehouse', 8, 10, 6, 3, 1, 'palmheights', 'PALMA FREIGHT');
  placePoi('hangar', 63, 5, 5, 2, 1, 'portside', 'SOLMAR AIR');
  placePoi('lifeguard', 29, 49, 2, 1, 1, 'marina', 'LIFEGUARD');

  pois.pier = { x: 56 * TILE, y: 57 * TILE, door: { x: 56 * TILE, y: 52 * TILE } };
  pois.portlot = { x: 72 * TILE, y: 42 * TILE, door: { x: 72 * TILE, y: 40 * TILE } };
  pois.airstrip = { x: 67.5 * TILE, y: 3.5 * TILE, door: { x: 67.5 * TILE, y: 6 * TILE } };
  pois.plaza = { x: 13 * TILE, y: 32 * TILE, door: { x: 13 * TILE, y: 32 * TILE } };

  // Palms along the promenade and the beach, and in the scrub by the airstrip road.
  for (let tx = 1; tx < cols - 1; tx += 1) {
    if (rng.chance(0.4)) palms.push({ x: tx * TILE + rng.range(8, 56), y: BEACH_TOP * TILE + rng.range(20, 44), s: rng.range(0.9, 1.3) });
    if (rng.chance(0.3)) palms.push({ x: tx * TILE + rng.range(8, 56), y: (BEACH_TOP + 3) * TILE + rng.range(6, 50), s: rng.range(0.8, 1.15) });
  }

  const avenueCenters = AVENUE_COLS.map((c) => (c + 1) * TILE);
  const streetCenters = STREET_ROWS.map((r) => (r + 1) * TILE);

  function tileAtPx(x, y) {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return T_WATER;
    return tiles[ty * cols + tx];
  }

  /** True when a circle of radius r at (x, y) touches any building or the world's edge. */
  function circleHitsSolid(x, y, r) {
    if (x < r || y < r || x > WORLD.width - r || y > WORLD.height - r) return true;
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      if (x + r < b.x || x - r > b.x + b.w || y + r < b.y || y - r > b.y + b.h) continue;
      const nx = Math.max(b.x, Math.min(x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(y, b.y + b.h));
      const dx = x - nx;
      const dy = y - ny;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }

  /** Push a circle out of every building it touches; returns how hard it hit (0 when it moved freely). */
  function resolveCircle(x, y, r) {
    let impact = 0;
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      if (x + r < b.x || x - r > b.x + b.w || y + r < b.y || y - r > b.y + b.h) continue;
      const nx = Math.max(b.x, Math.min(x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(y, b.y + b.h));
      let dx = x - nx;
      let dy = y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 < 0.001) {
        // Centre inside the rect: leave by the shortest side.
        const left = x - b.x;
        const right = b.x + b.w - x;
        const top = y - b.y;
        const bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - r;
        else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r;
        else y = b.y + b.h + r;
        impact = 1;
        continue;
      }
      const d = Math.sqrt(d2);
      dx /= d;
      dy /= d;
      x = nx + dx * r;
      y = ny + dy * r;
      impact = Math.max(impact, 1 - d / r);
    }
    x = Math.max(r, Math.min(WORLD.width - r, x));
    y = Math.max(r, Math.min(WORLD.height - r, y));
    return { x, y, impact };
  }

  /** The nearest point on a road centreline, for traffic and police navigation. */
  function nearestRoadPoint(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const cx of avenueCenters) {
      const d = Math.abs(x - cx);
      if (d < bestD) {
        bestD = d;
        best = { x: cx, y, axis: 'v' };
      }
    }
    for (const cy of streetCenters) {
      const d = Math.abs(y - cy);
      if (d < bestD) {
        bestD = d;
        best = { x, y: cy, axis: 'h' };
      }
    }
    return best;
  }

  return {
    cols,
    rows,
    tiles,
    buildings,
    palms,
    parkingSpots,
    pois,
    avenueCenters,
    streetCenters,
    coastY: COAST_ROAD_ROW * TILE,
    tileAt(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return T_WATER;
      return tiles[ty * cols + tx];
    },
    tileAtPx,
    isWaterPx(x, y) {
      return tileAtPx(x, y) === T_WATER;
    },
    isRoadPx(x, y) {
      const t = tileAtPx(x, y);
      return t === T_ROAD || t === T_RUNWAY;
    },
    districtAt,
    circleHitsSolid,
    resolveCircle,
    nearestRoadPoint,
  };
}
