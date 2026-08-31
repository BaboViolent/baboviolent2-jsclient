// Local player movement, ported from Player::update / Player::controlIt
// (src/Game/PlayerUpdate.cpp lines ~252 and ~476).
import {
  PLAYER_ACCEL, PLAYER_ACCEL_ICE, PLAYER_FRICTION, PLAYER_FRICTION_ICE,
  PLAYER_MAX_SPEED, PLAYER_Z, THEME_SNOW, WEAPON_SMG, WEAPON_KNIVES, WEAPON_DUAL_MACHINE_GUN,
  STARTING_GRENADES, STARTING_MOLOTOVS, PLAYER_STATUS_ALIVE, SV_TIME_TO_SPAWN,
} from './constants.js';
import { DEFAULT_DECALS } from './skin.js';
import { identity3, rotateArbitrary, orthonormalize } from '../core/mat3.js';
import { SnapshotInterpolator } from '../net/interpolation.js';

export class Player {
  constructor(id = 0) {
    this.playerID = id;
    this.name = 'Babo';
    this.teamID = 0;
    this.status = PLAYER_STATUS_ALIVE;
    this.life = 1;
    this.score = 0;
    this.kills = 0;
    this.deaths = 0;
    this.screenHit = 0;
    this.protection = 0;
    this.weaponID = WEAPON_SMG;
    this.meleeWeaponID = WEAPON_KNIVES;
    this.pendingWeaponID = WEAPON_SMG;
    this.pendingMeleeWeaponID = WEAPON_KNIVES;
    this.nbGrenadeLeft = STARTING_GRENADES;
    this.nbMolotovLeft = STARTING_MOLOTOVS;
    this.grenadeDelay = 0;
    this.meleeDelay = 0;
    this.lastShootWasNade = false;
    /** Seconds this player remains revealed on the minimap after firing. */
    this.firedShowDelay = 0;
    /** Legacy remote-detonation/cleanup state, reset by NET_SVCL_EXPLOSION owner ID. */
    this.rocketInAir = false;
    this.flagAttempts = 0;
    this.returns = 0;
    this.damage = 0;
    this.returns = 0;
    this.skin = 'skin10';
    this.decals = {
      red: [...DEFAULT_DECALS.red],
      green: [...DEFAULT_DECALS.green],
      blue: [...DEFAULT_DECALS.blue],
    };
    this.currentCF = { position: [0, 0, PLAYER_Z], vel: [0, 0, 0], angle: 0 };
    this.lastCF = { position: [0, 0, PLAYER_Z], vel: [0, 0, 0], angle: 0 };
    this.mousePosOnMap = [0, 0, 0];
    this.netInterpolator = new SnapshotInterpolator();
    /** Rolling-ball orientation, accumulated from movement. */
    this.matrix = identity3();
    /** Seconds alive this life (Game.cpp — player-player collision after 3s). */
    this.timeAlive = 0;
    /** Countdown before respawn allowed (PlayerUpdate.cpp — sv_timeToSpawn). */
    this.timeToSpawn = SV_TIME_TO_SPAWN;
  }

  spawnAt(pos) {
    this.netInterpolator.reset();
    this.currentCF.position = [pos[0], pos[1], PLAYER_Z];
    this.lastCF.position = [pos[0], pos[1], PLAYER_Z];
    this.currentCF.vel = [0, 0, 0];
    // Player.cpp:857 — every spawn refreshes throwables.
    this.nbGrenadeLeft = STARTING_GRENADES;
    this.nbMolotovLeft = STARTING_MOLOTOVS;
    this.grenadeDelay = 0;
    this.meleeDelay = 0;
    this.timeAlive = 0;
    this.timeToSpawn = 0;
  }

  queueNetworkFrame(frame, receivedAt) {
    this.netInterpolator.push(frame, receivedAt);
  }

  applyNetworkInterpolation(now) {
    const frame = this.netInterpolator.sample(now);
    if (!frame) return;
    this.lastCF.position = [...this.currentCF.position];
    this.lastCF.vel = [...this.currentCF.vel];
    this.currentCF.position = frame.position;
    this.currentCF.vel = frame.vel;
    this.mousePosOnMap = frame.mousePos;
    this.aimAndRoll();
  }

  tickDelays(delay) {
    if (this.firedShowDelay > 0) {
      this.firedShowDelay = Math.max(0, this.firedShowDelay - delay);
    }
    if (this.grenadeDelay > 0) {
      this.grenadeDelay -= delay;
      if (this.grenadeDelay < 0) this.grenadeDelay = 0;
    }
    if (this.meleeDelay > 0) {
      this.meleeDelay -= delay;
      if (this.meleeDelay < 0) this.meleeDelay = 0;
    }
  }

  /** True on snow themes over an icy (dirty) tile, where accel and friction drop. */
  onIce(map, slideOnIce) {
    if (!slideOnIce || map.theme !== THEME_SNOW) return false;
    const x = Math.floor(this.currentCF.position[0] - 0.5);
    const y = Math.floor(this.currentCF.position[1] - 0.5);
    return map.dirtAtVertex(x, y) > 0.5;
  }

  update(delay, map, input, slideOnIce = true) {
    if (this.status !== PLAYER_STATUS_ALIVE) {
      input = { moveUp: false, moveDown: false, moveLeft: false, moveRight: false };
    }
    const cf = this.currentCF;

    // PlayerUpdate.cpp:93 — snapshot before integration.
    this.lastCF.position[0] = cf.position[0];
    this.lastCF.position[1] = cf.position[1];
    this.lastCF.position[2] = cf.position[2];
    this.lastCF.vel[0] = cf.vel[0];
    this.lastCF.vel[1] = cf.vel[1];
    this.lastCF.vel[2] = cf.vel[2];
    this.lastCF.angle = cf.angle;

    cf.position[0] += cf.vel[0] * delay;
    cf.position[1] += cf.vel[1] * delay;
    cf.position[2] += cf.vel[2] * delay;

    // Friction is applied to the speed magnitude, not per-axis.
    let size = Math.hypot(cf.vel[0], cf.vel[1], cf.vel[2]);
    if (size > 0) {
      size -= delay * (this.onIce(map, slideOnIce) ? PLAYER_FRICTION_ICE : PLAYER_FRICTION);
      if (size < 0) size = 0;
      const scale = size / (Math.hypot(cf.vel[0], cf.vel[1], cf.vel[2]) || 1);
      cf.vel[0] *= scale;
      cf.vel[1] *= scale;
      cf.vel[2] *= scale;
    }

    const supported = cf.position[0] >= 0 && cf.position[1] >= 0
      && cf.position[0] < map.sizeX && cf.position[1] < map.sizeY;
    if (supported) {
      cf.position[2] = PLAYER_Z;
      cf.vel[2] = 0;
    } else {
      cf.vel[2] -= 9.8 * delay;
    }

    const accel = this.onIce(map, slideOnIce) ? PLAYER_ACCEL_ICE : PLAYER_ACCEL;
    if (input.moveUp) cf.vel[1] += delay * accel;
    if (input.moveDown) cf.vel[1] -= delay * accel;
    if (input.moveRight) cf.vel[0] += delay * accel;
    if (input.moveLeft) cf.vel[0] -= delay * accel;

    // PlayerUpdate.cpp:654
    size = Math.hypot(cf.vel[0], cf.vel[1], cf.vel[2]);
    if (size > PLAYER_MAX_SPEED) {
      cf.vel[0] = (cf.vel[0] / size) * PLAYER_MAX_SPEED;
      cf.vel[1] = (cf.vel[1] / size) * PLAYER_MAX_SPEED;
      cf.vel[2] = (cf.vel[2] / size) * PLAYER_MAX_SPEED;
    }

    this.aimAndRoll();
  }

  /** Facing angle + ball roll, ported from PlayerUpdate.cpp:330-360. */
  aimAndRoll() {
    const cf = this.currentCF;
    let dx = this.mousePosOnMap[0] - cf.position[0];
    let dy = this.mousePosOnMap[1] - cf.position[1];
    // PlayerUpdate.cpp:325 — native cl_preciseCursor defaults to true. Use
    // the current muzzle for distant targets, but body aim for dual guns and
    // close targets where the muzzle correction would become unstable.
    const distance = Math.hypot(dx, dy, this.mousePosOnMap[2] - cf.position[2]);
    if (this.weapon?.nuzzles?.length && this.weapon.weaponID !== WEAPON_DUAL_MACHINE_GUN && distance > 1.5) {
      const muzzle = this.weapon.muzzleWorld(this);
      dx = this.mousePosOnMap[0] - muzzle[0];
      dy = this.mousePosOnMap[1] - muzzle[1];
    }
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    // angle is in DEGREES and measured from +Y, negative when aiming right.
    cf.angle = (Math.acos(Math.min(Math.max(dy, -1), 1)) * 180) / Math.PI;
    if (dx > 0) cf.angle = -cf.angle;

    const mx = cf.position[0] - this.lastCF.position[0];
    const my = cf.position[1] - this.lastCF.position[1];
    const mz = cf.position[2] - this.lastCF.position[2];
    if (mx || my || mz) {
      const moveLen = Math.hypot(mx, my, mz);
      const angle = Math.PI * moveLen;
      // right = cross(movement, +Z)
      const rx = my;
      const ry = -mx;
      const rl = Math.hypot(rx, ry) || 1;
      this.matrix = orthonormalize(rotateArbitrary(this.matrix, -angle, [rx / rl, ry / rl, 0]));
    }
  }
}
