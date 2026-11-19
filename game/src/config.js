// Solmar City — every tuning number, colour and name in one place.
// The world is a fixed pixel map; the renderer scales a 1280x720 logical view to the window,
// so no rule below depends on the player's screen size.

/** The whole island map, in world pixels. */
export const WORLD = { width: 5120, height: 3840 };

/** One city tile. Roads, sidewalks and lots are all laid out on this grid. */
export const TILE = 64;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The logical view the camera shows, in pixels, before it is scaled to the window. */
export const VIEW = { width: 1280, height: 720 };

export const PLAYER = {
  radius: 14,
  walkSpeed: 168,
  runSpeed: 292,
  health: 100,
  armor: 100,
  punchRange: 36,
  punchDamage: 26,
  punchCooldown: 0.34,
};

export const CAR = {
  radius: 17,
  enterRange: 66,
  runOverSpeed: 120,
};

/** Wanted stars: heat thresholds, how fast heat cools, and how many police each star sends. */
export const WANTED = {
  starHeat: [0, 12, 30, 55, 90, 135],
  coolRate: 2.6,
  coolDelay: 6,
  policeByStar: [0, 1, 2, 3, 4, 6],
  bustHoldSeconds: 2.2,
};

export const CRIME = {
  stealCar: 10,
  hitCar: 6,
  hitPed: 16,
  shootAt: 8,
  killPed: 26,
  missionTheft: 22,
};

/** Warm coastal palette: sun-bleached pavement, pastel towers, teal water. */
export const PALETTE = {
  water: '#1d7f96',
  waterDeep: '#146a84',
  sand: '#ecd29a',
  sandWet: '#dfc084',
  grass: '#79b657',
  scrub: '#a9bd76',
  sidewalk: '#cfc4ae',
  curb: '#b7ab90',
  road: '#4c4a4e',
  roadLine: '#e8e3d3',
  plaza: '#e3d3ae',
  parkPath: '#d9c48f',
  shadow: 'rgba(46, 32, 16, 0.28)',
  palmTrunk: '#8a6844',
  palmLeaf: '#3f9e4d',
  palmLeafDark: '#2f7d3c',
};

export const DISTRICT_PAINT = {
  downtown: ['#f2b879', '#ee9d8f', '#f6d38a', '#e8a2b4', '#f0c475', '#d98e6a'],
  marina: ['#f7dfae', '#f2cf8e', '#ffc9d1', '#bfe3c8'],
  palmheights: ['#fbeed3', '#f3d9a4', '#eec39a', '#f5deb0'],
  portside: ['#b9c0c4', '#a8b6ba', '#c7b299', '#9fb3ad'],
  oldtown: ['#f0b27a', '#e58e6d', '#f6cf87', '#dfa06b'],
};

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
export const FONT_DISPLAY = '"Arial Black", "Trebuchet MS", system-ui, sans-serif';

/** Where a run in progress is kept between visits (this browser only). */
export const SAVE_KEY = 'solmar-city.save.v1';

/** The name over the title screen and in the HUD. */
export const GAME_TITLE = 'SOLMAR CITY';
export const GAME_SUBTITLE = 'a sun-soaked crime story';
