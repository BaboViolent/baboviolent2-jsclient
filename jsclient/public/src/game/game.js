// Game loop and world state. Equivalent of src/Game/Game.cpp (Game::update).
import { Player } from './player.js';
import { Weapon } from './weapon.js';
import { Projectile, createFlameField, createDeathDrop } from './projectile.js';
import { Brass } from './brass.js';
import { DecalSystem } from './decals.js';
import { ParticleSystem, EFFECTS } from '../render/particles.js';
import { loadModel } from '../render/model.js';
import { Audio3D } from '../audio/audio.js';
import { GameUI } from '../ui/ui.js';
import { pickSpawn } from './spawn.js';
import { performCollision, collisionClip } from './collision.js';
import { CTFState, mapSupportsCTF } from './ctf.js';
import { decalsForPlayer } from './skin.js';
import { rayTest } from './raycast.js';
import { WeatherSystem } from './weather.js';
import { debugLog, debugLoggingEnabled } from '../debugLog.js';
import {
  PLAYER_Z, WEAPONS, PROJECTILE_ROCKET, PROJECTILE_GRENADE, PROJECTILE_COCKTAIL_MOLOTOV,
  PROJECTILE_FLAME, PROJECTILE_LIFE_PACK, PROJECTILE_DROPED_WEAPON, PROJECTILE_DROPED_GRENADE,
  WEAPON_GRENADE, WEAPON_COCKTAIL_MOLOTOV, WEAPON_NUCLEAR, WEAPON_BAZOOKA, WEAPON_SMG, WEAPON_FLAME_THROWER,
  WEAPON_KNIVES, WEAPON_SHIELD, WEAPON_SNIPER, WEAPON_PHOTON_RIFLE,
  SV_NUKE_RADIUS, SV_NUKE_TIMER, weatherFromTheme,
  GAME_TYPE_DM, GAME_TYPE_CTF, GAME_TYPE_TDM, GAME_TYPE_KOTH, PLAYER_TEAM_BLUE, PLAYER_TEAM_RED, PLAYER_TEAM_SPECTATOR,
  PLAYER_STATUS_ALIVE, PLAYER_STATUS_DEAD,
  GAME_PLAYING,
  PLAYER_RADIUS, BOUNCE_FACTOR, SV_TIME_TO_SPAWN,
  SPECTATOR_SPEED, SPECTATOR_CAM_HEIGHT, SPECTATOR_ZOOM_MIN, SPECTATOR_ZOOM_STEP,
} from './constants.js';

const TRACER_DURATION = 0.08;
const PHOTON_BEAM_DURATION = 30 / 30;

const PROJECTILE_DEBUG_NAMES = {
  [PROJECTILE_ROCKET]: 'rocket',
  [PROJECTILE_GRENADE]: 'grenade',
  [PROJECTILE_LIFE_PACK]: 'health',
  [PROJECTILE_DROPED_WEAPON]: 'weapon',
  [PROJECTILE_DROPED_GRENADE]: 'grenade-pack',
  [PROJECTILE_COCKTAIL_MOLOTOV]: 'molotov',
  [PROJECTILE_FLAME]: 'flame',
};

function debugProjectile(proj) {
  const round = (value) => Math.round((value ?? 0) * 10000) / 10000;
  return {
    id: proj.uniqueID,
    type: proj.type,
    kind: PROJECTILE_DEBUG_NAMES[proj.type] ?? `type-${proj.type}`,
    owner: proj.ownerID,
    position: proj.currentCF.position.map(round),
    velocity: proj.currentCF.vel.map(round),
    duration: round(proj.duration),
    age: round(proj.timeSinceThrown),
    dead: proj.dead,
    remote: proj.remoteEntity,
    movementLock: proj.movementLock,
    stickToPlayer: proj.stickToPlayer,
    stickFor: round(proj.stickFor),
    weaponDropID: proj.weaponDropID,
  };
}

export class Game {
  constructor(renderer, input) {
    this.renderer = renderer;
    this.input = input;
    this.map = null;
    this.players = [];
    this.thisPlayer = new Player(0);
    this.players.push(this.thisPlayer);
    this.projectiles = [];
    this.tracers = [];
    this.brass = [];
    this.particles = new ParticleSystem();
    this.weather = new WeatherSystem();
    this.decals = new DecalSystem();
    this.audio = new Audio3D();
    this.ui = new GameUI(this);
    this.projectileModels = {};
    this.builtModels = new Map();
    this.brassModel = null;
    this.gameType = GAME_TYPE_DM;
    this.blueScore = 0;
    this.redScore = 0;
    this.roundState = GAME_PLAYING;
    this.ctf = new CTFState();
    this.koth = { controller: -1, blueProgress: 0, redProgress: 0, goal: 15, bounds: [0, 0, 0, 0] };
    this.exploreMode = false;
    this.onlineMode = false;
    this.musicEnabled = true;
    /** @type {import('../net/client.js').Bv2Client | null} */
    this.netClient = null;
    this.flagModels = null;
    /** Match timer (ClientRender.cpp — printLeftText 5,5 size 64). */
    this.gameTimeLimit = 15 * 60;
    this.gameTimeLeft = this.gameTimeLimit;
    /** Shared throwables (gameVar.weapons[WEAPON_GRENADE/MOLOTOV]). */
    this.throwWeapons = { grenade: null, molotov: null };
    this.time = 0;
    /** Spectator free camera target, panned instead of a body (Game.cpp:587). */
    this.specLookAt = [0, 0, 0];
    this.specZoom = 0;
    this.editorMode = false;
    this.editorMap = null;
    this.editorHover = null;
    this.viewShake = 0;
    this.hitIndicator = 0;
    this.lastHitConfirmAt = -Infinity;
    this.projectileDebugLastAt = -Infinity;
  }

  /** Spectators have no body: they observe from a free camera (Game.cpp:581). */
  get isSpectating() {
    return this.thisPlayer.teamID === PLAYER_TEAM_SPECTATOR;
  }

  async setMap(map, { skipSpawn = false, preserveMatchState = false } = {}) {
    this.resetHitFeedback();
    map.weather = weatherFromTheme(map.theme);
    await this.renderer.setMap(map);
    this.map = map;
    if (this.musicEnabled) this.audio.playMusic();
    else this.audio.stopMusic();
    this.audio.setMapAmbience(map.weather);
    this.weather.reset(map.weather);
    this.thisPlayer.skinTexture = await this.renderer.loadSkin(
      this.thisPlayer.skin,
      decalsForPlayer(this.thisPlayer, this.gameType),
    );
    await this.loadThrowWeapons();
    await this.initPlayerLoadout(this.thisPlayer);
    await this.loadProjectileModels();
    await this.loadBrassModel();
    await this.loadFlagModels();
    this.initGameMode({ preserveScores: preserveMatchState });
    if (!preserveMatchState) this.gameTimeLeft = this.gameTimeLimit;
    if (this.isSpectating) {
      this.specLookAt = [map.sizeX * 0.5, map.sizeY * 0.5, 0];
      this.specZoom = 0;
    } else if (!skipSpawn) {
      this.spawnPlayer(this.thisPlayer);
    }
    this.projectiles.length = 0;
    this.tracers.length = 0;
    this.brass.length = 0;
  }

  async loadBuiltModel(file) {
    if (!this.builtModels.has(file)) {
      const built = await loadModel(`main/models/${file}`);
      await this.renderer.models.loadTextures(built);
      this.builtModels.set(file, built);
    }
    return this.builtModels.get(file);
  }

  async loadThrowWeapons() {
    if (!this.throwWeapons.grenade) {
      const grenade = new Weapon(WEAPON_GRENADE);
      grenade.setModel(await this.loadBuiltModel(WEAPONS[WEAPON_GRENADE].model));
      const molotov = new Weapon(WEAPON_COCKTAIL_MOLOTOV);
      molotov.setModel(await this.loadBuiltModel(WEAPONS[WEAPON_COCKTAIL_MOLOTOV].model));
      this.throwWeapons.grenade = grenade;
      this.throwWeapons.molotov = molotov;
    }
  }

  async initPlayerLoadout(player) {
    await this.setWeapon(player, player.weaponID);
    await this.setMeleeWeapon(player, player.meleeWeaponID);
  }

  async loadBrassModel() {
    this.brassModel = await this.loadBuiltModel('Douille.DKO');
  }

  async loadProjectileModels() {
    const files = {
      [PROJECTILE_ROCKET]: 'Rocket.DKO',
      [PROJECTILE_GRENADE]: 'Grenade.DKO',
      [PROJECTILE_COCKTAIL_MOLOTOV]: 'CocktailMolotov.DKO',
      [PROJECTILE_LIFE_PACK]: 'LifePack.DKO',
      [PROJECTILE_DROPED_GRENADE]: 'Grenade.DKO',
    };
    for (const [type, file] of Object.entries(files)) {
      this.projectileModels[type] = await this.loadBuiltModel(file);
    }
  }

  async weaponDropModel(weaponID) {
    const key = `drop_${weaponID}`;
    if (!this.projectileModels[key]) {
      this.projectileModels[key] = await this.loadBuiltModel(WEAPONS[weaponID].model);
    }
    return this.projectileModels[key];
  }

  async setWeapon(player, weaponID, expectedNetGeneration = null) {
    const weapon = new Weapon(weaponID);
    weapon.setModel(await this.loadBuiltModel(WEAPONS[weaponID].model));
    if (expectedNetGeneration !== null && player._netStateGen !== expectedNetGeneration) return null;
    player.weapon = weapon;
    player.weaponID = weaponID;
    return weapon;
  }

  async setMeleeWeapon(player, weaponID, expectedNetGeneration = null) {
    const weapon = new Weapon(weaponID);
    weapon.setModel(await this.loadBuiltModel(WEAPONS[weaponID].model));
    if (weaponID === WEAPON_SHIELD) {
      weapon.builtAlt = await this.loadBuiltModel('ShieldMagnet.DKO');
    }
    if (expectedNetGeneration !== null && player._netStateGen !== expectedNetGeneration) return null;
    player.meleeWeapon = weapon;
    player.meleeWeaponID = weaponID;
    return weapon;
  }

  async loadFlagModels() {
    if (this.flagModels) return;
    const files = {
      blueFlag: 'BlueFlag.DKO',
      redFlag: 'RedFlag.DKO',
      bluePod: 'BlueFlagPod.DKO',
      redPod: 'RedFlagPod.DKO',
    };
    this.flagModels = {};
    for (const [key, file] of Object.entries(files)) {
      try {
        this.flagModels[key] = await this.loadBuiltModel(file);
      } catch {
        this.flagModels[key] = null;
      }
    }
  }

  initGameMode({ preserveScores = false } = {}) {
    if (this.gameType === GAME_TYPE_CTF && mapSupportsCTF(this.map)) {
      const score = [this.blueScore, this.redScore, this.ctf.blueWin, this.ctf.redWin];
      const flagState = [...this.ctf.flagState];
      const flagPos = this.ctf.flagPos.map((position) => [...position]);
      this.ctf.init(this.map);
      if (preserveScores) {
        [this.blueScore, this.redScore, this.ctf.blueWin, this.ctf.redWin] = score;
        this.ctf.flagState = flagState;
        this.ctf.flagPos = flagPos;
      } else {
        this.blueScore = 0;
        this.redScore = 0;
      }
    } else if (this.gameType === GAME_TYPE_CTF) {
      this.ui.log('\x04Map has no flag pods — playing DM');
      this.gameType = GAME_TYPE_DM;
    }
  }

  setGameType(type) {
    if (this.gameType === type) return;
    this.gameType = type;
    if (this.map) this.initGameMode();
  }

  spawnPlayer(player) {
    if (player.pendingWeaponID != null && player.pendingWeaponID !== player.weaponID) {
      void this.setWeapon(player, player.pendingWeaponID);
    }
    if (player.pendingMeleeWeaponID != null && player.pendingMeleeWeaponID !== player.meleeWeaponID) {
      void this.setMeleeWeapon(player, player.pendingMeleeWeaponID);
    }
    const pos = pickSpawn(this.map, player, this.players, this.gameType);
    player.spawnAt(pos);
    player.status = PLAYER_STATUS_ALIVE;
    player.life = 1;
    if (player === this.thisPlayer) this.snapCameraToSpawn(pos);
  }

  /** Player::spawn forces the native camera onto the new body immediately. */
  snapCameraToSpawn(pos) {
    this.renderer.cameraFocus = [pos[0], pos[1], PLAYER_Z];
    this.renderer.cameraHeight = 7;
    this.renderer.sniperZoom = 0;
    // Do not pull the camera toward the previous life's aim on the first tick.
    this.thisPlayer.mousePosOnMap = [pos[0], pos[1], 0];
  }

  /** Ask server to respawn after death (online only). */
  requestOnlineRespawn() {
    if (!this.onlineMode || !this.netClient || this.netClient.playerId < 0) return;
    if (this.isSpectating) return;
    const p = this.thisPlayer;
    this.netClient.requestSpawn(
      p.pendingWeaponID ?? p.weaponID,
      p.pendingMeleeWeaponID ?? p.meleeWeaponID,
      p.skin,
      p.decals,
    );
  }

  pickSpawnFor(player) {
    return pickSpawn(this.map, player, this.players, this.gameType);
  }

  /** Slot-based lookup like C++ `game->players[id]`. */
  resolvePlayer(id) {
    if (id === this.thisPlayer.playerID) return this.thisPlayer;
    if (id >= 0 && id < this.players.length) {
      const slot = this.players[id];
      if (slot && slot.playerID === id) return slot;
    }
    return this.players.find((p) => p && p.playerID === id) ?? null;
  }

  confirmLocalHit() {
    const now = this.audio.ctx?.currentTime ?? this.time;
    // Pellets from one action arrive together; one immediate sound avoids a click train.
    // Automatic fire remains responsive while sustained flame cannot stack gain.
    if (now - this.lastHitConfirmAt >= 0.035) {
      this.lastHitConfirmAt = now;
      // The native Windows lookup for `Hit.wav` resolves to the shipped
      // lowercase `hit.wav` (a different, longer sample on case-sensitive web
      // hosts) and Player.cpp plays it at volume 250.
      void this.audio.play2D('hit.wav', 250);
    }
  }

  resetHitFeedback() {
    this.lastHitConfirmAt = -Infinity;
  }

  /** Game.cpp:603 — push thisPlayer off overlapping babos, then map clip. */
  resolvePlayerCollisions(local) {
    if (!this.map) return;
    for (const other of this.players) {
      if (!other || other === local || other.status !== PLAYER_STATUS_ALIVE) continue;
      if (other.timeAlive <= 3 || local.timeAlive <= 3) continue;
      const dx = other.currentCF.position[0] - local.currentCF.position[0];
      const dy = other.currentCF.position[1] - local.currentCF.position[1];
      if (dx * dx + dy * dy > 0.25) continue;
      const d = Math.hypot(dx, dy) || 1;
      local.currentCF.position[0] = other.currentCF.position[0] - (dx / d) * 0.51;
      local.currentCF.position[1] = other.currentCF.position[1] - (dy / d) * 0.51;
      local.currentCF.vel[0] = -local.currentCF.vel[0] * BOUNCE_FACTOR;
      local.currentCF.vel[1] = -local.currentCF.vel[1] * BOUNCE_FACTOR;
      local.currentCF.vel[2] = -local.currentCF.vel[2] * BOUNCE_FACTOR;
      performCollision(this.map, local.lastCF, local.currentCF, PLAYER_RADIUS);
      collisionClip(this.map, local.currentCF, PLAYER_RADIUS);
      local.lastCF.position[0] = local.currentCF.position[0];
      local.lastCF.position[1] = local.currentCF.position[1];
      local.lastCF.position[2] = local.currentCF.position[2];
    }
  }

  updateAim() {
    if (this.thisPlayer.status !== PLAYER_STATUS_ALIVE || !this.ui.playing ||
        this.ui.menuOpen || this.ui.consoleActive || this.ui.chatActive) return;
    const aim = this.renderer.screenToWorld(this.thisPlayer, this.input.mouse.x, this.input.mouse.y);
    if (aim) this.thisPlayer.mousePosOnMap = aim;
  }

  update(delay) {
    if (!this.map) return;
    this.time += delay;
    this.hitIndicator = Math.max(0, this.hitIndicator - delay);
    if (this.roundState === GAME_PLAYING && this.ui.playing && !this.ui.menuOpen && !this.ui.consoleActive && !this.ui.chatActive) {
      this.gameTimeLeft = Math.max(0, this.gameTimeLeft - delay);
    }
    this.ui.update(delay);
    this.updateViewShake(delay);

    // Spectators never enter play: no body, no aim, just a free camera (Game.cpp:581).
    if (this.isSpectating) {
      this.updateSpectator(delay);
      this.updateCamera(delay);
      this.audio.setListener(this.specLookAt);
      this.updateWorld(delay);
      return;
    }

    this.updateCamera(delay);
    this.updateAim();

    const player = this.thisPlayer;
    if (player.screenHit > 0) {
      player.screenHit -= delay * 0.75;
      if (player.screenHit < 0) player.screenHit = 0;
    }

    for (const p of this.players) {
      if (p.protection > 0) {
        p.protection -= delay;
        if (p.protection < 0) p.protection = 0;
      }
      p.tickDelays(delay);
    }

    for (const p of this.players) {
      if (p && p.status === PLAYER_STATUS_ALIVE) {
        p.timeAlive += delay;
        p.timeToSpawn = SV_TIME_TO_SPAWN;
      } else if (p && p.teamID !== PLAYER_TEAM_SPECTATOR && p.timeToSpawn > 0) {
        // PlayerUpdate.cpp:388 — only players on a real team count down to respawn.
        p.timeToSpawn -= delay;
        if (p.timeToSpawn < 0) p.timeToSpawn = 0;
      }
      if (p?.meleeWeapon) {
        p.meleeWeapon.update(delay, p);
      }
    }

    // Game.cpp:390 — player movement and weapon simulation stop completely
    // while a win/draw state is displayed. Keep rendering effects, but pin
    // the local body until the authoritative GAME_PLAYING reinitialization.
    if (this.roundState !== GAME_PLAYING) {
      player.currentCF.vel = [0, 0, 0];
      player.lastCF.position = [...player.currentCF.position];
      player.lastCF.vel = [0, 0, 0];
      this.audio.setListener(player.currentCF.position);
      this.updateWorld(delay);
      return;
    }

    player.update(delay, this.map, this.input);

    if (player.status === PLAYER_STATUS_ALIVE) {
      this.resolvePlayerCollisions(player);
      performCollision(this.map, player.lastCF, player.currentCF, PLAYER_RADIUS);
      collisionClip(this.map, player.currentCF, PLAYER_RADIUS);
      if (!this.onlineMode && player.currentCF.position[2] <= 0) {
        this.onPlayerDeath(player, null, 13);
      }
    }
    this.audio.setListener(player.currentCF.position);

    if (!this.ui.playing || this.ui.menuOpen || this.ui.consoleActive || this.ui.chatActive) {
      return;
    }

    // Online: dead until spawn timer elapses, then press fire to respawn (PlayerUpdate.cpp).
    if (this.onlineMode && player.status !== PLAYER_STATUS_ALIVE) {
      if (
        player.timeToSpawn <= 0 &&
        (this.input.shoot ||
          this.input.melee ||
          this.input.consumeThrowGrenade() ||
          this.input.consumeThrowMolotov())
      ) {
        this.requestOnlineRespawn();
        // Mouse1 is both the respawn gesture and primary fire. Consume the
        // complete held/edge state so the authoritative spawn cannot turn the
        // same physical click into an initial bullet.
        this.input.clearGameplayActions('respawn-request');
      }
      this.updateWorld(delay);
      return;
    }

    const weapon = player.weapon;
    const meleeWeapon = player.meleeWeapon;
    if (weapon) {
      weapon.update(delay, player, this.audio);
      this.checkNukeDetonation(meleeWeapon);

      // Photon charge resets when shoot key released (PlayerUpdate.cpp:554).
      if (!this.input.shoot) weapon.charge = 0;

      const canUsePrimary = player.grenadeDelay === 0 && player.meleeDelay === 0;

      if (this.input.shoot && canUsePrimary) {
        // Browser/open-server contract: sniper always emits two traces. The
        // camera-height third trace only existed in the legacy _PRO_ build.
        if (weapon.weaponID === WEAPON_SNIPER) {
          weapon.nbShot = 2;
        }
        const events = weapon.tryFire(player, this, { triggerPressed: this.input.consumeShootPress() });
        if (weapon.weaponID === WEAPON_SNIPER) weapon.nbShot = 2;
        if (events.some((e) => e.type === 'trace' || e.type === 'projectile')) {
          this.audio.play3D(weapon.sound, player.currentCF.position, { range: 5, volume: 255 });
        }
        this.applyShotEvents(events);
      }

      // k_melee — Space (PlayerUpdate.cpp:589).
      if (this.input.melee && player.grenadeDelay === 0 && player.meleeDelay === 0 && meleeWeapon) {
        const events = meleeWeapon.tryMelee(player, this);
        if (events.length) {
          player.meleeDelay = meleeWeapon.fireDelay;
          this.applyShotEvents(events);
        }
      }

      // k_throwGrenade — Mouse2 (PlayerUpdate.cpp:607).
      if (
        this.input.consumeThrowGrenade() &&
        player.grenadeDelay === 0 &&
        player.nbGrenadeLeft > 0 &&
        player.meleeDelay === 0 &&
        weapon.currentFireDelay <= 0
      ) {
        player.nbGrenadeLeft--;
        player.lastShootWasNade = true;
        player.grenadeDelay = WEAPONS[WEAPON_GRENADE].fireDelay;
        const event = this.throwWeapons.grenade.throwOnce(player);
        this.audio.play3D(WEAPONS[WEAPON_GRENADE].sound, player.currentCF.position, { range: 5, volume: 255 });
        this.applyShotEvents([event]);
      }

      // k_throwMolotov — Mouse3 (PlayerUpdate.cpp:624).
      if (
        this.input.consumeThrowMolotov() &&
        player.grenadeDelay === 0 &&
        player.nbMolotovLeft > 0 &&
        weapon.currentFireDelay <= 0
      ) {
        player.nbMolotovLeft--;
        player.lastShootWasNade = false;
        player.grenadeDelay = WEAPONS[WEAPON_COCKTAIL_MOLOTOV].fireDelay;
        const event = this.throwWeapons.molotov.throwOnce(player);
        this.audio.play3D(WEAPONS[WEAPON_COCKTAIL_MOLOTOV].sound, player.currentCF.position, { range: 5, volume: 255 });
        this.applyShotEvents([event]);
      }
    }

    if (this.input.consumePickup()) {
      void this.tryPickupWeapon(player);
    }

    this.updateWorld(delay);
  }

  resetRoundTransientState() {
    for (const player of this.players) {
      player.currentCF.vel = [0, 0, 0];
      player.lastCF.vel = [0, 0, 0];
      player.grenadeDelay = 0;
      player.meleeDelay = 0;
      for (const weapon of [player.weapon, player.meleeWeapon]) {
        if (!weapon) continue;
        weapon.currentFireDelay = 0;
        weapon.charge = 0;
        weapon.overHeated = false;
        weapon.shotInc = 0;
        weapon.fullReload = false;
      }
    }
  }

  /** World simulation that keeps running while the local player is dead or spectating. */
  updateWorld(delay) {
    this.weather.update(delay, this.renderer.cameraFocus ?? this.thisPlayer.currentCF.position, this.particles);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      const owner = this.resolvePlayer(proj.ownerID);
      const teamMode = this.gameType === GAME_TYPE_TDM || this.gameType === GAME_TYPE_CTF || this.gameType === GAME_TYPE_KOTH;
      if (proj.type === PROJECTILE_ROCKET) {
        EFFECTS.rocketTrail(this.particles, proj.currentCF.position, owner?.teamID, teamMode);
      } else if (proj.type === PROJECTILE_GRENADE) {
        EFFECTS.grenadeTrail(this.particles, proj.currentCF.position, owner?.teamID, teamMode);
      } else if (proj.type === PROJECTILE_COCKTAIL_MOLOTOV) {
        EFFECTS.molotovTrail(this.particles, proj.currentCF.position);
      }
      const result = proj.update(delay, this.map, this.players, this.particles, this.audio);
      if (result) this.applyProjectileResult(result);
      if (proj.dead) {
        debugLog('world-entity-remove', { source: 'client-simulation', entity: debugProjectile(proj) });
        this.projectiles.splice(i, 1);
      }
    }

    if (debugLoggingEnabled && performance.now() - this.projectileDebugLastAt >= 250) {
      debugLog('world-entities', { entities: this.projectiles.map(debugProjectile) });
      this.projectileDebugLastAt = performance.now();
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].life += delay;
      if (this.tracers[i].life >= this.tracers[i].duration) this.tracers.splice(i, 1);
    }

    for (let i = this.brass.length - 1; i >= 0; i--) {
      if (!this.brass[i].update(delay, this.map, this.audio)) this.brass.splice(i, 1);
    }

    this.particles.update(delay);
    this.decals.update(delay);
    if (this.gameType === GAME_TYPE_CTF) {
      if (this.onlineMode) {
        this.ctf.updatePositions(this.players);
      } else {
        this.ctf.update(delay, this);
      }
    }
  }

  /**
   * Enter spectator: drop the body and park the free camera where the player was
   * (Game.cpp:945 kills on team change, Game.cpp:581 then pans camLookAt).
   */
  enterSpectator() {
    const player = this.thisPlayer;
    player.teamID = PLAYER_TEAM_SPECTATOR;
    player.status = PLAYER_STATUS_DEAD;
    player.life = 0;
    player.timeToSpawn = 0;
    const from = player.currentCF.position;
    const cx = this.map ? this.map.sizeX * 0.5 : 0;
    const cy = this.map ? this.map.sizeY * 0.5 : 0;
    const spawned = from[0] !== 0 || from[1] !== 0;
    this.specLookAt = [spawned ? from[0] : cx, spawned ? from[1] : cy, 0];
    this.specZoom = 0;
  }

  /** Game.cpp:585 — free camera panned by the move keys at 10 units/sec, no collision. */
  updateSpectator(delay) {
    const canMove = this.ui.playing && !this.ui.menuOpen && !this.ui.consoleActive && !this.ui.chatActive;
    if (canMove) {
      if (this.input.moveRight) this.specLookAt[0] += SPECTATOR_SPEED * delay;
      if (this.input.moveLeft) this.specLookAt[0] -= SPECTATOR_SPEED * delay;
      if (this.input.moveUp) this.specLookAt[1] += SPECTATOR_SPEED * delay;
      if (this.input.moveDown) this.specLookAt[1] -= SPECTATOR_SPEED * delay;

      const pan = this.input.consumeTouchPan();
      const canvas = this.renderer.gl.canvas;
      const halfHeight = Math.tan((60 * Math.PI) / 360) * this.renderer.cameraHeight;
      const worldPerPixel = (halfHeight * 2) / Math.max(1, canvas.clientHeight);
      this.specLookAt[0] -= pan.x * worldPerPixel;
      this.specLookAt[1] += pan.y * worldPerPixel;

      // Map.cpp:1242 — wheel changes height, clamped to [-8, longestSide/2].
      const wheel = this.input.consumeWheel();
      if (wheel !== 0 && this.map) {
        const longestSide = Math.max(this.map.sizeX, this.map.sizeY);
        this.specZoom += wheel * SPECTATOR_ZOOM_STEP;
        this.specZoom = Math.max(SPECTATOR_ZOOM_MIN, Math.min(longestSide / 2, this.specZoom));
      }
    }

    // Map.cpp:1211 — spectators are clamped to the map instead of colliding with it.
    if (this.map) {
      if (this.specLookAt[0] < 5) this.specLookAt[0] = 5;
      if (this.specLookAt[0] > this.map.sizeX - 5) this.specLookAt[0] = this.map.sizeX - 5;
      if (this.specLookAt[1] < 4) this.specLookAt[1] = 4;
      if (this.specLookAt[1] > this.map.sizeY - 4) this.specLookAt[1] = this.map.sizeY - 4;
    }
  }

  checkNukeDetonation(meleeWeapon) {
    if (!meleeWeapon || meleeWeapon.weaponID !== WEAPON_NUCLEAR || !meleeWeapon.nukeArmed) return;
    if (meleeWeapon.nukeFrameID >= 30 * SV_NUKE_TIMER) {
      meleeWeapon.nukeArmed = false;
      meleeWeapon.nukeFrameID = 0;
      if (this.onlineMode) return;
      this.applyExplosion({
        type: 'explosion',
        position: [...this.thisPlayer.currentCF.position],
        normal: [0, 0, 1],
        radius: SV_NUKE_RADIUS,
        damageRadius: SV_NUKE_RADIUS,
        ownerID: this.thisPlayer.playerID,
        weaponID: WEAPON_NUCLEAR,
      });
    }
  }

  applyProjectileResult(result) {
    if (result.type === 'explosion') this.applyExplosion(result);
    else if (result.type === 'flamePatch') this.spawnFlamePatch(result);
    else if (result.type === 'burn') this.applyFlameBurn(result);
    else if (result.type === 'pickup') this.applyPickup(result);
  }

  /** Player.cpp:1267-1322 — life pack, weapon, unused grenades. */
  spawnDeathDrops(position, playerVel, weaponID, grenadeCount, ownerID) {
    void this.weaponDropModel(weaponID);
    if (!this.onlineMode) {
      this.projectiles.push(createDeathDrop(PROJECTILE_LIFE_PACK, position, playerVel, { ownerID }));
    }
    if (!this.onlineMode) {
      this.projectiles.push(createDeathDrop(PROJECTILE_DROPED_WEAPON, position, playerVel, {
        ownerID,
        weaponDropID: weaponID,
      }));
    }
    for (let i = 0; !this.onlineMode && i < grenadeCount; i++) {
      this.projectiles.push(createDeathDrop(PROJECTILE_DROPED_GRENADE, position, playerVel, { ownerID }));
    }
  }

  spawnDroppedWeapon(position, playerVel, weaponID, ownerID) {
    const vel = [
      playerVel[0] * 0.25,
      playerVel[1] * 0.25,
      Math.max(0.5, playerVel[2] * 0.25 + 0.5),
    ];
    this.projectiles.push(new Projectile(
      PROJECTILE_DROPED_WEAPON,
      [...position],
      [0, 0, 1],
      ownerID,
      vel,
      { weaponDropID: weaponID },
    ));
  }

  /** ServerRecv.cpp:1064 — F picks up nearest dropped weapon within 0.5 tiles. */
  async tryPickupWeapon(player) {
    let nearest = null;
    let bestD = 0.5;
    for (const proj of this.projectiles) {
      if (proj.type !== PROJECTILE_DROPED_WEAPON || proj.dead || proj.weaponDropID == null) continue;
      const d = Math.hypot(
        player.currentCF.position[0] - proj.currentCF.position[0],
        player.currentCF.position[1] - proj.currentCF.position[1],
      );
      if (d < bestD) {
        bestD = d;
        nearest = proj;
      }
    }
    if (!nearest) return;

    if (this.onlineMode) {
      this.netClient?.requestPickup(2, nearest.currentCF.position, nearest.uniqueID);
      return;
    }

    this.spawnDroppedWeapon(
      player.currentCF.position,
      player.currentCF.vel,
      player.weaponID,
      player.playerID,
    );
    const pickedUpWeapon = await this.setWeapon(player, nearest.weaponDropID);
    pickedUpWeapon.beginPickupReload();
    nearest.dead = true;
    this.audio.play3D('equip.wav', player.currentCF.position, { range: 5, volume: 255 });
  }

  applyPickup({ item, player, position = player.currentCF.position, uniqueID = 0, authoritative = false }) {
    if (this.onlineMode && !authoritative) {
      if (player === this.thisPlayer) {
        this.netClient?.requestPickup(item === 'life' ? 1 : 3, position, uniqueID);
      }
      return;
    }
    if (item === 'life') {
      player.life += 0.5;
      if (player.life > 1) player.life = 1;
      this.audio.play3D('LifePack.wav', player.currentCF.position, { range: 5, volume: 255 });
    } else if (item === 'grenade') {
      player.nbGrenadeLeft += 1;
      if (player.nbGrenadeLeft > 3) player.nbGrenadeLeft = 3;
      this.audio.play3D('equip.wav', player.currentCF.position, { range: 5, volume: 255 });
    }
  }

  async applyWeaponPickup(player, weaponID) {
    const weapon = await this.setWeapon(player, weaponID);
    weapon.beginPickupReload();
    this.audio.play3D('equip.wav', player.currentCF.position, { range: 5, volume: 255 });
  }

  spawnFlamePatch(result) {
    this.audio.play3D('cocktailmolotov.wav', result.position, { range: 5, volume: 250 });
    const remoteEntity = this.onlineMode && result.ownerID !== this.thisPlayer.playerID;
    this.projectiles.push(...createFlameField(
      result.position,
      result.ownerID,
      result.scatterVel,
      result.normal,
      { remoteEntity },
    ));
  }

  /** Molotov ground fire — radiusHit for molotov does not skip the thrower (Game.cpp:1604). */
  applyFlameBurn({ position, radius, ownerID }) {
    if (this.onlineMode) {
      if (ownerID === this.thisPlayer.playerID && this.netClient) {
        this.netClient.sendBurn(position, radius, WEAPON_COCKTAIL_MOLOTOV);
      }
      return;
    }
    const damage = WEAPONS[WEAPON_COCKTAIL_MOLOTOV].damage;
    for (const p of this.players) {
      const d = Math.hypot(p.currentCF.position[0] - position[0], p.currentCF.position[1] - position[1]);
      if (d >= radius) continue;
      const wall = rayTest(this.map, position, p.currentCF.position);
      if (wall.hit) {
        const hitDist = Math.hypot(wall.point[0] - position[0], wall.point[1] - position[1]);
        if (hitDist < d - 0.1) continue;
      }
      const falloff = 1 - d / radius;
      const owner = this.players.find((pl) => pl.playerID === ownerID);
      this.hitPlayer(p, falloff * damage, owner ?? { playerID: ownerID }, WEAPON_COCKTAIL_MOLOTOV);
    }
  }

  applyShotEvents(events) {
    for (const event of events) {
      if (event.type === 'trace') {
        if (this.onlineMode && this.netClient) {
          const w = event.owner?.weapon;
          this.netClient.sendShoot(
            event.weaponID,
            w?.firingNuzzle ?? 0,
            event.from,
            event.networkTo ?? event.to,
          );
        }
        // In online play the authoritative echo below owns the visual. Drawing
        // both here and on NET_SVCL_PLAYER_SHOOT made one photon look like two
        // rapid shots.
        if (!event.isFlame && !this.onlineMode) {
          const photon = event.weaponID === WEAPON_PHOTON_RIFLE;
          const isBazooka = event.weaponID === WEAPON_BAZOOKA;
          this.tracers.push({
            from: event.from,
            to: event.to,
            life: 0,
            duration: photon ? PHOTON_BEAM_DURATION : TRACER_DURATION,
            photon,
            width: isBazooka ? 0.10 : 0.06,
            color: isBazooka ? [1, 0.62, 0.12, 1] : null,
          });
        }
        EFFECTS.firingSmoke(this.particles, event.from, [
          event.to[0] - event.from[0], event.to[1] - event.from[1], event.to[2] - event.from[2],
        ]);
        if (event.isFlame) {
          EFFECTS.flameStream(this.particles, event.from, event.to, event.normal);
        }
        if (!this.onlineMode) {
          if (event.isFlame && event.victims?.length) {
            for (const victim of event.victims) {
              this.hitPlayer(victim, event.damage, event.owner, event.weaponID);
            }
          } else if (event.victim) {
            this.hitPlayer(event.victim, event.damage, event.owner, event.weaponID);
          } else if (!event.isFlame) {
            EFFECTS.impact(this.particles, event.to, event.normal);
            this.audio.playImpact(event.to);
          }
        }
      } else if (event.type === 'projectile') {
        const projWeapon = event.projectile === PROJECTILE_GRENADE
          ? WEAPON_GRENADE
          : event.projectile === PROJECTILE_COCKTAIL_MOLOTOV
            ? WEAPON_COCKTAIL_MOLOTOV
            : event.owner.weaponID;
        if (this.onlineMode && this.netClient) {
          // packet.playerProjectile applies the wire ×10 scale. Pass the unit
          // aim vector here, matching Game.cpp's playerProjectile.vel values.
          const vel = [...event.direction];
          this.netClient.sendProjectile(
            projWeapon,
            event.owner.weapon?.firingNuzzle ?? 0,
            event.projectile,
            event.from,
            vel,
          );
          // C++ ClientRecv — spawn only from server broadcast, not locally.
        } else {
          this.projectiles.push(new Projectile(event.projectile, event.from, event.direction, event.owner.playerID));
        }
      } else if (event.type === 'brass') {
        this.brass.push(new Brass(event.position, event.direction, event.right));
      } else if (event.type === 'melee') {
        if (this.onlineMode && this.netClient) {
          this.netClient.sendMelee();
        } else {
          this.radiusHit(event.owner.currentCF.position, event.radius, event.owner.playerID, WEAPONS[event.weaponID].damage, event.sameDmg, event.weaponID);
        }
        if (event.weaponID === WEAPON_KNIVES) {
          EFFECTS.knifeSlash(this.particles, event.owner.currentCF.position, event.owner.currentCF.angle);
        }
      } else if (event.type === 'shield') {
        if (this.onlineMode && this.netClient) {
          this.netClient.sendMelee();
        } else {
          event.owner.protection = event.duration;
        }
      } else if (event.type === 'nukeArm') {
        if (this.onlineMode && this.netClient) this.netClient.sendMelee();
      }
    }
  }

  /** Apply NET_SVCL_PLAYER_SHOOT from server (ClientRecv.cpp). */
  applyNetShoot(sh) {
    const owner = this.resolvePlayer(sh.playerID);
    if (!owner) return;
    owner.firedShowDelay = 2;
    const isLocalShoot = owner === this.thisPlayer;
    if (!sh.isFlame) {
      const photon = sh.weaponID === WEAPON_PHOTON_RIFLE;
      const isBazooka = sh.weaponID === WEAPON_BAZOOKA;
      this.tracers.push({
        from: sh.p1,
        to: sh.p2,
        life: 0,
        duration: photon ? PHOTON_BEAM_DURATION : TRACER_DURATION,
        photon,
        width: isBazooka ? 0.11 : 0.06,
        color: isBazooka ? [1, 0.62, 0.12, 1] : null,
      });
    }
    EFFECTS.firingSmoke(this.particles, sh.p1, [
      sh.p2[0] - sh.p1[0], sh.p2[1] - sh.p1[1], sh.p2[2] - sh.p1[2],
    ]);
    if (sh.isFlame && !isLocalShoot) {
      EFFECTS.flameStream(this.particles, sh.p1, sh.p2, sh.normal);
    }
    if (sh.hitPlayerID === this.thisPlayer.playerID && sh.hitPlayerID >= 0) {
      const w = WEAPONS[sh.weaponID];
      if (w) {
        const dir = [sh.p2[0] - sh.p1[0], sh.p2[1] - sh.p1[1], 0];
        const len = Math.hypot(dir[0], dir[1]) || 1;
        this.thisPlayer.currentCF.vel[0] += (dir[0] / len) * w.damage * 2;
        this.thisPlayer.currentCF.vel[1] += (dir[1] / len) * w.damage * 2;
      }
    }
    if (sh.hitPlayerID < 0 && !sh.isFlame) {
      EFFECTS.impact(this.particles, sh.p2, sh.normal);
      this.audio.playImpact(sh.p2);
    }
    if (owner !== this.thisPlayer) {
      this.audio.play3D(WEAPONS[sh.weaponID]?.sound ?? 'SMG.wav', owner.currentCF.position, { range: 5, volume: 255 });
    }
  }

  applyNetMelee(playerID) {
    const owner = this.resolvePlayer(playerID);
    if (!owner) return;
    if (owner === this.thisPlayer) return;
    const fallbackMeleeId = owner.meleeWeaponID ?? WEAPON_KNIVES;
    let weapon = owner.meleeWeapon;
    if (!weapon) {
      // Remote players that arrive through enum state may not have a melee weapon
      // object yet; still play their melee impact/sound immediately.
      weapon = new Weapon(fallbackMeleeId);
      owner.meleeWeapon = weapon;
      owner.meleeWeaponID = fallbackMeleeId;
      void this.setMeleeWeapon(owner, fallbackMeleeId);
    }
    if (!weapon) return;
    weapon.currentFireDelay = weapon.fireDelay;
    if (weapon.weaponID === WEAPON_NUCLEAR) {
      weapon.nukeArmed = true;
      weapon.nukeFrameID = 0;
    }
    this.audio.play3D(weapon.sound, owner.currentCF.position, { range: 5, volume: 255 });
    if (weapon.weaponID === WEAPON_KNIVES) {
      EFFECTS.knifeSlash(this.particles, owner.currentCF.position, owner.currentCF.angle);
    }
  }

  /** NET_SVCL_PLAYER_HIT — damage field is remaining life (Player.cpp hit()). */
  applyNetHit(hit) {
    const victim = this.resolvePlayer(hit.playerID);
    if (!victim) return;
    const prevLife = victim.life;
    victim.life = Math.max(0, hit.lifeRemaining);
    const dealt = Math.max(0, prevLife - victim.life);
    if (dealt > 0) {
      // Scoreboard damage is server-owned online; its enum update identifies the attacker.
      victim.screenHit = Math.min(1, dealt);
      this.audio.playHit(victim.currentCF.position);
      this.decals.spawnBlood(victim.currentCF.position, dealt);
      EFFECTS.blood(this.particles, victim.currentCF.position, [0, 0, 1], dealt);
      const attacker = this.resolvePlayer(hit.fromID);
      if (attacker === this.thisPlayer && attacker !== victim) {
        this.confirmLocalHit();
      }
    }
    if (victim === this.thisPlayer && hit.vel) {
      victim.currentCF.vel[0] += hit.vel[0];
      victim.currentCF.vel[1] += hit.vel[1];
      victim.currentCF.vel[2] += hit.vel[2];
    }
    if (victim === this.thisPlayer && [WEAPON_BAZOOKA, WEAPON_GRENADE, WEAPON_NUCLEAR].includes(hit.weaponID)) {
      const realDamage = WEAPONS[hit.weaponID]?.damage || 1;
      this.viewShake += Math.min(1.2, Math.max(0, 1.5 - dealt / realDamage));
    }
    if (victim.life <= 1e-6 && victim.status === PLAYER_STATUS_ALIVE) {
      const attacker = this.resolvePlayer(hit.fromID);
      if (this.onlineMode && !this.exploreMode && attacker) {
        this.ui.addKill(attacker, victim, hit.weaponID);
      }
      this.onPlayerDeath(victim, attacker ?? { playerID: hit.fromID }, hit.weaponID);
    }
  }

  spawnNetProjectile(sp) {
    const owner = this.resolvePlayer(sp.playerID);
    if (!owner) {
      debugLog('world-entity-spawn-rejected', { reason: 'owner-missing', packet: sp });
      return;
    }
    // GameSpawn.cpp:497 — client copies are remoteEntity; thrower simulates fuse/burn.
    // Once online, every projectile copy follows Rust authority, including the
    // thrower's own copy. This prevents duplicate local fuse/burn reports.
    // This method is only entered for a server packet. During initial map load
    // packets may flush before startOnlinePlay marks the session online, but
    // they are still server-owned and must never run local collision/expiry.
    const authority = false;
    if (sp.projectileType === PROJECTILE_DROPED_WEAPON) {
      void this.weaponDropModel(sp.weaponID);
    }
    const projectile = new Projectile(
      sp.projectileType,
      sp.position,
      sp.vel,
      sp.playerID,
      sp.vel,
      { remoteEntity: !authority, uniqueID: sp.uniqueID, weaponDropID: sp.weaponID },
    );
    this.projectiles.push(projectile);
    debugLog('world-entity-spawn', { source: 'server-packet', entity: debugProjectile(projectile) });
    if (sp.projectileType === PROJECTILE_ROCKET) owner.rocketInAir = true;
  }

  applyProjectileCoordFrame(frame) {
    const projectile = this.projectiles.find((p) => p.uniqueID === frame.uniqueID);
    if (!projectile) {
      debugLog('world-entity-update-missing', { frame });
      return;
    }
    projectile.lastCF.position = [...projectile.currentCF.position];
    projectile.currentCF.position = [...frame.position];
    projectile.currentCF.vel = [...frame.vel];
  }

  deleteNetProjectile(uniqueID) {
    const projectile = this.projectiles.find((p) => p.uniqueID === uniqueID);
    if (projectile) {
      debugLog('world-entity-delete', { source: 'server-packet', entity: debugProjectile(projectile) });
      projectile.dead = true;
    } else {
      debugLog('world-entity-delete-missing', { id: uniqueID });
    }
  }

  processUIInput() {
    const ui = this.ui;
    const input = this.input;

    if (input.consumePress('Backquote')) {
      if (ui.toggleConsole()) {
        ui.log('\x03Console opened (` to close)');
      }
      return;
    }

    if (ui.consoleActive) {
      ui.showScoreboard = false;
      if (input.consumePress('F1')) ui.consoleEventsMode = true;
      if (input.consumePress('F2')) ui.consoleEventsMode = false;
      if (input.consumePress('Enter')) ui.submitConsole();
      if (input.consumePress('Escape')) ui.consoleActive = false;
      return;
    }

    if (ui.chatActive) {
      if (input.consumePress('Enter')) ui.submitChat();
      if (input.consumePress('Escape')) ui.closeChat();
      return;
    }

    ui.showScoreboard = input.tabHeld;

    if (input.consumePress('KeyT') && ui.playing && !ui.menuOpen) ui.openChat(false);
    if (input.consumePress('KeyY') && ui.playing && !ui.menuOpen) ui.openChat(true);
  }

  updateViewShake(delay) {
    this.viewShake = Math.max(0, this.viewShake - delay * 0.75);
    if (this.viewShake <= 0) {
      this.renderer.cameraShake = [0, 0];
      return;
    }
    const amount = Math.min(1.0, this.viewShake) * 0.06;
    const angle = this.time * 53.0;
    this.renderer.cameraShake = [Math.cos(angle) * amount, Math.sin(angle) * amount];
  }

  updateCamera(delay) {
    const map = this.map;
    const player = this.thisPlayer;
    if (!map || !player) return;

    // Map.cpp:1247 — spectators look at their own free target from height 14 + zoom.
    if (this.isSpectating) {
      this.smoothCamera(this.specLookAt, SPECTATOR_CAM_HEIGHT + this.specZoom, delay);
      this.renderer.sniperZoom = 0;
      return;
    }
    const isSniper = player.weapon?.weaponID === WEAPON_SNIPER;
    // ClientRender.cpp:47 — look ahead toward the cursor, not just the body.
    const p = player.currentCF.position;
    const aim = player.mousePosOnMap;
    const focus = player.status === PLAYER_STATUS_ALIVE
      ? p.map((value, axis) => (value * 5 + aim[axis] * 4) / 9)
      : [...(this.renderer.cameraFocus ?? p)];
    focus[0] = Math.max(0, Math.min(map.sizeX, focus[0]));
    focus[1] = Math.max(-1, Math.min(map.sizeY + 1, focus[1]));
    // Map.cpp:1193 — ordinary weapons keep the view inside the map; snipers
    // can look all the way to its edges. Small maps stay centered.
    if (!isSniper) {
      const marginX = Math.min(5, map.sizeX / 2);
      const marginY = Math.min(4, map.sizeY / 2);
      focus[0] = Math.max(marginX, Math.min(map.sizeX - marginX, focus[0]));
      focus[1] = Math.max(marginY, Math.min(map.sizeY - marginY, focus[1]));
    }
    if (isSniper && this.ui.playing && !this.ui.menuOpen) {
      // Map.cpp:1227 — zoom from mouse distance to player (5–12 world units).
      const dx = player.mousePosOnMap[0] - player.currentCF.position[0];
      const dy = player.mousePosOnMap[1] - player.currentCF.position[1];
      let dis = Math.hypot(dx, dy, aim[2] - p[2]) * 2;
      dis = Math.max(5, Math.min(12, dis));
      this.smoothCamera(focus, dis, delay);
    } else {
      this.smoothCamera(focus, 7, delay);
      this.renderer.sniperZoom = 0;
    }
  }

  smoothCamera(focus, height, delay) {
    const r = this.renderer;
    if (!r.cameraFocus) r.cameraFocus = [...focus];
    const factor = Math.min(1, 2.5 * delay);
    r.cameraFocus[0] += (focus[0] - r.cameraFocus[0]) * factor;
    r.cameraFocus[1] += (focus[1] - r.cameraFocus[1]) * factor;
    r.cameraFocus[2] += ((focus[2] ?? 0.25) - r.cameraFocus[2]) * factor;
    r.cameraHeight += (height - r.cameraHeight) * factor;
  }

  onPlayerDeath(victim, killer, weaponID) {
    if (victim._deathHandled) return;
    victim._deathHandled = true;

    if (this.gameType === GAME_TYPE_CTF && !this.onlineMode) {
      this.ctf.dropCarrierFlags(victim, this);
    }

    const deathPos = [...victim.currentCF.position];
    const deathVel = [...victim.currentCF.vel];
    const droppedWeapon = victim.weaponID;
    const droppedGrenades = victim.nbGrenadeLeft;

    if (!this.onlineMode && killer && killer !== victim) {
      killer.kills++;
      if (this.gameType !== GAME_TYPE_CTF) killer.score++;
      if (this.gameType === GAME_TYPE_TDM) {
        if (killer.teamID === PLAYER_TEAM_BLUE) this.blueScore++;
        else if (killer.teamID === PLAYER_TEAM_RED) this.redScore++;
      }
      if (!this.exploreMode) {
        this.ui.addKill(killer, victim, weaponID ?? killer.weaponID);
      }
    }
    if (!this.onlineMode) {
      victim.deaths++;
    }

    this.decals.spawnBlood(deathPos, 1);
    EFFECTS.blood(this.particles, deathPos, [0, 0, 1], 1);
    this.audio.play3D(`BaboCreve${1 + Math.floor(Math.random() * 3)}.wav`, deathPos, { range: 5, volume: 255 });

    if (!this.exploreMode) {
      this.spawnDeathDrops(deathPos, deathVel, droppedWeapon, droppedGrenades, victim.playerID);
    }

    victim.nbGrenadeLeft = 0;
    victim.nbMolotovLeft = 0;

    if (this.onlineMode) {
      victim.status = PLAYER_STATUS_DEAD;
      victim.life = 0;
      victim.timeToSpawn = SV_TIME_TO_SPAWN;
      if (victim === this.thisPlayer) {
        this.ui.log('\x04You died — wait to respawn');
      }
      return;
    }

    victim.life = 1;
    victim._deathHandled = false;
    this.spawnPlayer(victim);

  }

  /** Player::hit — 3D hurt sound, blood, and attacker confirm. */
  hitPlayer(victim, damage, from, weaponID = null) {
    if (damage <= 0 || victim.life <= 0) return;
    let cdamage = damage;
    if (victim.protection > 0.6) cdamage *= 0.5;
    if (cdamage <= 0) return;

    this.audio.playHit(victim.currentCF.position);

    this.decals.spawnBlood(victim.currentCF.position, cdamage);
    EFFECTS.blood(this.particles, victim.currentCF.position, [0, 0, 1], cdamage);

    victim.life -= cdamage;
    victim.screenHit = Math.min(1, (victim.screenHit ?? 0) + cdamage);
    if (cdamage > 1) victim.screenHit = Math.min(1, cdamage);

    const attacker = from?.playerID != null
      ? this.players.find((p) => p.playerID === from.playerID)
      : from;
    if (attacker && attacker !== victim) {
      attacker.damage = (attacker.damage ?? 0) + cdamage;
    }
    if (attacker === this.thisPlayer && attacker !== victim) {
      this.confirmLocalHit();
    }

    if (victim.life <= 0) {
      this.onPlayerDeath(victim, attacker, weaponID);
    }
  }

  /** Knives only — attacker immune (Game.cpp:1604). */
  radiusHit(position, radius, fromID, damage, sameDmg = false, weaponID = null) {
    const owner = this.players.find((p) => p.playerID === fromID);
    if (!owner) return;

    for (const p of this.players) {
      if (p.playerID === fromID && weaponID === WEAPON_KNIVES) continue;
      const d = Math.hypot(p.currentCF.position[0] - position[0], p.currentCF.position[1] - position[1]);
      if (d >= radius) continue;

      const wall = rayTest(this.map, position, p.currentCF.position);
      if (wall.hit) {
        const hitDist = Math.hypot(wall.point[0] - position[0], wall.point[1] - position[1]);
        if (hitDist < d - 0.1) continue;
      }

      const falloff = sameDmg ? 1 : 1 - d / radius;
      this.hitPlayer(p, falloff * damage, owner, weaponID);
    }
  }

  applyExplosion(explosion) {
    if (this.onlineMode && this.netClient && explosion.reportToServer) {
      this.netClient.sendExplosion(
        explosion.position,
        explosion.normal ?? [0, 0, 1],
        explosion.radius ?? 1.5,
        explosion.weaponID ?? WEAPON_GRENADE,
      );
      return;
    }

    if (explosion.fromNetwork) {
      const owner = this.resolvePlayer(explosion.ownerID);
      if (owner) owner.rocketInAir = false;
      // The explosion packet does not identify its source projectile. The
      // server sends NET_SVCL_DELETE_PROJECTILE with the exact unique ID, so
      // do not guess by owner/proximity: a second live grenade can be nearby.
    }

    EFFECTS.explosion(this.particles, explosion.position);
    this.decals.spawnExplosionMark(explosion.position, explosion.radius ?? 1.5);
    this.audio.play3D('Explosion1.wav', explosion.position, { range: 12, volume: 255 });

    if (this.onlineMode) return;

    const weaponDamage = explosion.weaponID != null
      ? WEAPONS[explosion.weaponID].damage
      : 1.5;

    for (const p of this.players) {
      const d = Math.hypot(
        p.currentCF.position[0] - explosion.position[0],
        p.currentCF.position[1] - explosion.position[1],
      );
      if (d > explosion.damageRadius) continue;
      const falloff = 1 - d / explosion.damageRadius;
      const owner = this.players.find((pl) => pl.playerID === explosion.ownerID);
      this.hitPlayer(p, falloff * weaponDamage, owner ?? { playerID: explosion.ownerID }, explosion.weaponID ?? WEAPON_GRENADE);
      const len = d || 1;
      p.currentCF.vel[0] += ((p.currentCF.position[0] - explosion.position[0]) / len) * falloff * 8;
      p.currentCF.vel[1] += ((p.currentCF.position[1] - explosion.position[1]) / len) * falloff * 8;
    }
  }
}
