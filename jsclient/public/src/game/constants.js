// Ported from src/Game/Map.h, src/Game/Game.h and src/Source/GameVar.cpp.

export const CONTENT_ROOT = '/content';

export const COLLISION_EPSILON = 0.05;
export const BOUNCE_FACTOR = 0.45;
export const MAP_VERSION = 20202;
export const MAX_PLAYER = 32;

export const PLAYER_RADIUS = 0.25;
export const PLAYER_Z = 0.25;
export const PLAYER_ACCEL = 12.5;
export const PLAYER_ACCEL_ICE = 4.0;
export const PLAYER_FRICTION = 4.0;
export const PLAYER_FRICTION_ICE = 1.0;
export const PLAYER_MAX_SPEED = 3.25;

export const GAME_TYPE_DM = 0;
export const GAME_TYPE_TDM = 1;
export const GAME_TYPE_CTF = 2;
export const GAME_TYPE_SND = 3;
export const GAME_TYPE_COUNT = 4;
export const GAME_PLAYING = -1;
export const GAME_BLUE_WIN = 0;
export const GAME_RED_WIN = 1;
export const GAME_DRAW = 2;

export const GAME_TYPE_NAMES = ['Deathmatch', 'Team Deathmatch', 'Capture The Flag', 'Search & Destroy'];

export const PLAYER_TEAM_SPECTATOR = -1;
/** Chat addressed to every team, distinct from spectator chat (Client.cpp:951). */
export const CHAT_TEAM_ALL = -2;
export const PLAYER_TEAM_BLUE = 0;
export const PLAYER_TEAM_RED = 1;

export const PLAYER_STATUS_DEAD = 0;
export const PLAYER_STATUS_ALIVE = 1;

export const THEME_NAMES = [
  'grass', 'snow', 'sand', 'city', 'modern', 'lava', 'animal', 'orange',
  'core', 'frozen', 'grain', 'medieval', 'metal', 'rainy', 'real', 'road',
  'rock', 'savana', 'soft', 'street', 'tropical', 'winter', 'wooden',
];
export const THEME_SNOW = 1;
export const THEME_SAND = 2;
export const THEME_CITY = 3;
export const THEME_LAVA = 5;
export const THEME_CORE = 8;
export const THEME_FROZEN = 9;
export const THEME_GRAIN = 10;
export const THEME_RAINY = 13;
export const THEME_ROAD = 15;
export const THEME_ROCK = 16;
export const THEME_STREET = 19;
export const THEME_WINTER = 21;

export const WEATHER_NONE = 0;
export const WEATHER_FOG = 1;
export const WEATHER_SNOW = 2;
export const WEATHER_RAIN = 3;
export const WEATHER_SANDSTORM = 4;
export const WEATHER_LAVA = 5;

// Map::reloadWeather (src/Game/Map.cpp)
export const WEATHER_FOG_PARAMS = {
  [WEATHER_RAIN]: { start: 4, end: -3, color: [0.15, 0.25, 0.25, 1] },
  [WEATHER_FOG]: { start: 1, end: -0.25, color: [0.3, 0.4, 0.4, 1] },
};

/** Map::reloadWeather (src/Game/Map.cpp:623-634) — theme drives weather, not the bvm field. */
export function weatherFromTheme(theme) {
  if (theme === THEME_GRAIN) return WEATHER_FOG;
  if (theme === THEME_SNOW || theme === THEME_FROZEN || theme === THEME_WINTER) return WEATHER_SNOW;
  if (theme === THEME_SAND || theme === THEME_STREET) return WEATHER_SANDSTORM;
  if (theme === THEME_CITY || theme === THEME_RAINY || theme === THEME_ROAD) return WEATHER_RAIN;
  if (theme === THEME_LAVA || theme === THEME_CORE || theme === THEME_ROCK) return WEATHER_LAVA;
  return WEATHER_NONE;
}

/** Looping ambience files (CLava.cpp, CRain/CSnow weather classes). */
export const WEATHER_AMBIENCE = {
  [WEATHER_RAIN]: { file: 'rain2.wav', volume: 50 },
  [WEATHER_SANDSTORM]: { file: 'wind.wav', volume: 50 },
  [WEATHER_LAVA]: { file: 'lava.wav', volume: 50 },
};

// Per-face brightness used by Map::regenCell for the four wall sides.
export const WALL_SHADE = { north: 0.3, east: 0.4, south: 0.7, west: 0.8 };

// Ids must match src/Source/GameVar.h exactly - they travel on the wire.
export const WEAPON_SMG = 0;
export const WEAPON_SHOTGUN = 1;
export const WEAPON_SNIPER = 2;
export const WEAPON_DUAL_MACHINE_GUN = 3;
export const WEAPON_CHAIN_GUN = 4;
export const WEAPON_BAZOOKA = 5;
export const WEAPON_PHOTON_RIFLE = 6;
export const WEAPON_FLAME_THROWER = 7;
export const WEAPON_GRENADE = 8;
export const WEAPON_COCKTAIL_MOLOTOV = 9;
export const WEAPON_KNIVES = 10;
export const WEAPON_NUCLEAR = 11;
export const WEAPON_SHIELD = 12;
export const WEAPON_MINIBOT = 13;

/** Primary guns only (Client.cpp btn_guns) — not grenade, molotov, or melee. */
export const PRIMARY_WEAPON_IDS = [
  WEAPON_SMG, WEAPON_SHOTGUN, WEAPON_SNIPER, WEAPON_DUAL_MACHINE_GUN,
  WEAPON_CHAIN_GUN, WEAPON_BAZOOKA, WEAPON_PHOTON_RIFLE, WEAPON_FLAME_THROWER,
];

/** Secondary melee choices at spawn (knives or shield). */
export const MELEE_WEAPON_IDS = [WEAPON_KNIVES, WEAPON_SHIELD];

export const STARTING_GRENADES = 2;
export const STARTING_MOLOTOVS = 1;

export const PROJECTILE_DIRECT = 1;
export const PROJECTILE_ROCKET = 2;
export const PROJECTILE_GRENADE = 3;
export const PROJECTILE_LIFE_PACK = 4;
export const PROJECTILE_DROPED_WEAPON = 5;
export const PROJECTILE_DROPED_GRENADE = 6;
export const PROJECTILE_COCKTAIL_MOLOTOV = 7;
export const PROJECTILE_FLAME = 8;
export const PROJECTILE_GIB = 9;
export const PROJECTILE_NONE = 10;
export const PROJECTILE_PHOTON = 11;

// Weapon(dko, sound, fireDelay, name, damage, impressision, nbShot, reculVel,
// startImp, weaponID, projectileType) - GameVar.cpp:278. Indexed by weapon id.
// `damage` here is the constructor default; sv_*Damage overrides it at runtime.
export const WEAPONS = [
  { name: 'SMG', model: 'SMG.DKO', sound: 'SMG.wav', fireDelay: 0.1, damage: 0.1, impressision: 8, nbShot: 1, reculVel: 0.5, startImp: 1, projectile: PROJECTILE_DIRECT },
  { name: 'Shotgun', model: 'ShotGun.DKO', sound: 'Shotgun.wav', fireDelay: 0.85, damage: 0.21, impressision: 20, nbShot: 5, reculVel: 3.0, startImp: 12, projectile: PROJECTILE_DIRECT },
  { name: 'Sniper Rifle', model: 'Sniper.DKO', sound: 'Sniper.wav', fireDelay: 2.0, damage: 0.3, impressision: 0, nbShot: 2, reculVel: 3.0, startImp: 0, projectile: PROJECTILE_DIRECT },
  { name: 'Dual Machine Gun', model: 'DualMachineGun.DKO', sound: 'DualMachineGun.wav', fireDelay: 0.1, damage: 0.13, impressision: 10, nbShot: 1, reculVel: 0.8, startImp: 2, projectile: PROJECTILE_DIRECT },
  { name: 'Chain Gun', model: 'ChainGun.DKO', sound: 'ChainGun.wav', fireDelay: 0.1, damage: 0.19, impressision: 15, nbShot: 1, reculVel: 2.0, startImp: 5, projectile: PROJECTILE_DIRECT },
  { name: 'Bazooka', model: 'Bazooka.DKO', sound: 'Bazooka.wav', fireDelay: 1.75, damage: 0.85, impressision: 0, nbShot: 1, reculVel: 3.0, startImp: 0, projectile: PROJECTILE_ROCKET },
  { name: 'Photon Rifle', model: 'PhotonRifle.DKO', sound: 'PhotonRifle.wav', fireDelay: 1.5, damage: 0.24, impressision: 0, nbShot: 1, reculVel: 5.0, startImp: 0, projectile: PROJECTILE_DIRECT },
  { name: 'Flame Thrower', model: 'FlameThrower.DKO', sound: 'FlameThrower.wav', fireDelay: 0.1, damage: 0.08, impressision: 10, nbShot: 1, reculVel: 0, startImp: 10, projectile: PROJECTILE_DIRECT },
  { name: 'Grenade', model: 'Hand.DKO', sound: 'Grenade.wav', fireDelay: 1.0, damage: 1.5, impressision: 0, nbShot: 1, reculVel: -1.0, startImp: 0, projectile: PROJECTILE_GRENADE },
  { name: 'Flame', model: 'Hand.DKO', sound: 'Grenade.wav', fireDelay: 1.0, damage: 0.15, impressision: 0, nbShot: 1, reculVel: -1.0, startImp: 0, projectile: PROJECTILE_COCKTAIL_MOLOTOV },
  { name: 'Popup Knives', model: 'Knifes.DKO', sound: 'knifes.wav', fireDelay: 1.0, damage: 0.6, impressision: 0, nbShot: 1, reculVel: 0, startImp: 0, projectile: PROJECTILE_NONE },
  { name: 'Nuke Bot', model: 'Nuclear.DKO', sound: 'Siren.WAV', fireDelay: 12.0, damage: 8.0, impressision: 0, nbShot: 1, reculVel: 0, startImp: 0, projectile: PROJECTILE_NONE },
  { name: 'Instant Shield', model: 'Shield.DKO', sound: 'shield.wav', fireDelay: 3.0, damage: 0, impressision: 0, nbShot: 1, reculVel: 0, startImp: 0, projectile: PROJECTILE_NONE },
  { name: 'Mini Bot', model: 'Antena.DKO', sound: 'equip.wav', fireDelay: 1.0, damage: 0.05, impressision: 0, nbShot: 1, reculVel: 0, startImp: 0, projectile: PROJECTILE_NONE },
];

// Weapon models are authored at 200x scale; Player::render draws them at .005.
export const WEAPON_MODEL_SCALE = 0.005;
export const DROP_MODEL_SCALE = 0.0025;

export const ITEM_LIFE_PACK = 1;
export const ITEM_WEAPON = 2;
export const ITEM_GRENADE = 3;
export const SHOOT_RANGE = 128;

// Defaults from src/Source/GameVar.cpp (offline sandbox uses these until phase 4).
export const SV_ENABLE_SHOTGUN_RELOAD = true;
export const SV_WIN_LIMIT = 7;
export const SV_NUKE_RADIUS = 6;
export const SV_NUKE_TIMER = 3;
/** Seconds before dead players may request spawn (GameVar.cpp sv_timeToSpawn). */
export const SV_TIME_TO_SPAWN = 5;

// Spectator free camera (Game.cpp:587 pans camLookAt, Map.cpp:1247 sets height 14 + zoom).
export const SPECTATOR_SPEED = 10;
export const SPECTATOR_CAM_HEIGHT = 14;
export const SPECTATOR_ZOOM_MIN = -8;
/** dksGetMouseWheelVel is ±120 per notch and scaled by 0.01 (Map.cpp:1242). */
export const SPECTATOR_ZOOM_STEP = 1.2;
export const FLAME_HIT_RADIUS = 0.5;
