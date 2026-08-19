// Projectile simulation, ported from src/Game/GameProjectile.cpp.
import { rayTest } from './raycast.js';
import {
  PROJECTILE_ROCKET, PROJECTILE_GRENADE, PROJECTILE_COCKTAIL_MOLOTOV, PROJECTILE_FLAME,
  PROJECTILE_LIFE_PACK, PROJECTILE_DROPED_WEAPON, PROJECTILE_DROPED_GRENADE,
  PLAYER_STATUS_ALIVE, WEAPON_BAZOOKA, WEAPON_GRENADE,
} from './constants.js';

const GRAVITY = 9.8;
const ROCKET_MAX_SPEED = 10;
const BOUNCE = 0.65;
const FLAME_GROUND_Z = 0;
const FLAME_BURN_RADIUS = 0.5;
const ROCKET_HIT_RADIUS = 0.5;
const MOLOTOV_HIT_RADIUS = 0.5;
const ROCKET_EXPLOSION_RADIUS = 2.0;
const ROCKET_DAMAGE_RADIUS = 2.0;
const GRENADE_EXPLOSION_RADIUS = 1.5;
const GRENADE_DAMAGE_RADIUS = 1.5;

function reflect(v, n) {
  const d = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
  return [v[0] - 2 * d * n[0], v[1] - 2 * d * n[1], v[2] - 2 * d * n[2]];
}

function randRange(a, b) {
  return a + Math.random() * (b - a);
}

/** @param {object} opts optional { locked, vel, remoteEntity, weaponDropID, rotateVel } */
export class Projectile {
  constructor(type, position, direction, ownerID, vel = null, opts = {}) {
    this.type = type;
    this.ownerID = ownerID;
    this.uniqueID = opts.uniqueID ?? null;
    /** C++ remoteEntity — client copies from net do not simulate fuse/burn authority. */
    this.remoteEntity = opts.remoteEntity ?? false;
    this.currentCF = {
      position: [...position],
      vel: vel ? [...vel] : [...direction],
      angle: 0,
    };
    this.lastCF = { position: [...position] };
    this.dead = false;
    this.rotation = 0;
    this.spawnParticleTime = 0;
    this.movementLock = opts.locked ?? false;
    this.stickToPlayer = -1;
    this.stickFor = 0;
    this.timeSinceThrown = 0;
    /** Burn cadence — 20 ticks at 30 Hz (GameProjectile.cpp:555). */
    this._burnTickAcc = 0;
    this.weaponDropID = opts.weaponDropID ?? null;
    this.rotateVel = opts.rotateVel ?? 360;

    if (type !== PROJECTILE_FLAME) {
      const dirXY = Math.hypot(direction[0], direction[1]) || 1;
      this.currentCF.angle = (Math.acos(Math.min(Math.max(direction[1] / dirXY, -1), 1)) * 180) / Math.PI;
      if (direction[0] > 0) this.currentCF.angle = -this.currentCF.angle;
    }

    switch (type) {
      case PROJECTILE_ROCKET:
        this.duration = 10;
        this.scaleVel(2.5);
        break;
      case PROJECTILE_GRENADE:
        this.duration = 2;
        this.scaleVel(5);
        this.currentCF.vel[2] += 5;
        break;
      case PROJECTILE_COCKTAIL_MOLOTOV:
        this.duration = 10;
        this.scaleVel(6);
        this.currentCF.vel[2] += 2;
        break;
      case PROJECTILE_FLAME:
        this.duration = 10;
        this.currentCF.vel = vel ? [...vel] : [0, 0, 0];
        if (this.movementLock) this.lockToGround(this.currentCF.position);
        break;
      case PROJECTILE_LIFE_PACK:
        this.duration = 20;
        this.rotateVel = randRange(-90, 90);
        break;
      case PROJECTILE_DROPED_WEAPON:
        this.duration = 30;
        this.rotateVel = randRange(-90, 90);
        break;
      case PROJECTILE_DROPED_GRENADE:
        this.duration = 25;
        this.rotateVel = randRange(-90, 90);
        break;
      default:
        this.duration = 5;
        break;
    }
  }

  lockToGround(pos, normal = null) {
    this.movementLock = true;
    if (normal) {
      this.currentCF.position = [
        pos[0] + normal[0] * 0.1,
        pos[1] + normal[1] * 0.1,
        pos[2] + normal[2] * 0.1,
      ];
    } else {
      this.currentCF.position = [pos[0], pos[1], FLAME_GROUND_Z];
    }
    this.currentCF.vel = [0, 0, 0];
  }

  scaleVel(f) {
    this.currentCF.vel[0] *= f;
    this.currentCF.vel[1] *= f;
    this.currentCF.vel[2] *= f;
  }

  /** @returns {object|null} burn / explosion events */
  update(delay, map, players, particles, audio = null) {
    if (this.dead) return null;
    const cf = this.currentCF;
    this.lastCF.position = [...cf.position];
    this.timeSinceThrown += delay;

    if (this.type === PROJECTILE_FLAME) {
      return this.updateFlame(delay, map, players, particles);
    }

    // Online copies are render-only. Rust owns their integration and every
    // collision/explosion; locally ray-testing between coordinate frames can
    // otherwise produce false floor impacts that never occurred on the server.
    if (this.remoteEntity) {
      this.rotation += this.rotateVel * delay;
      if (this.type === PROJECTILE_LIFE_PACK || this.type === PROJECTILE_DROPED_GRENADE) {
        return this.checkPickup(players);
      }
      return null;
    }

    this.rotation += this.rotateVel * delay;
    let speed = Math.hypot(cf.vel[0], cf.vel[1], cf.vel[2]);

    if (this.type === PROJECTILE_ROCKET) {
      if (speed > ROCKET_MAX_SPEED) {
        const k = ROCKET_MAX_SPEED / speed;
        cf.vel[0] *= k; cf.vel[1] *= k; cf.vel[2] *= k;
        speed = ROCKET_MAX_SPEED;
      }
      for (let i = 0; i < 3; i++) cf.position[i] += cf.vel[i] * delay;
      for (let i = 0; i < 3; i++) cf.vel[i] += cf.vel[i] * delay * 3;
    } else if (speed > 0.5 || cf.position[2] > 0.2) {
      for (let i = 0; i < 3; i++) cf.position[i] += cf.vel[i] * delay;
      cf.vel[2] -= GRAVITY * delay;
    } else {
      cf.vel = [0, 0, 0];
    }

    const wall = rayTest(map, this.lastCF.position, cf.position);
    if (wall.hit) {
      if (this.type === PROJECTILE_ROCKET) {
        cf.position = wall.point;
        return this.explode(wall.normal, ROCKET_EXPLOSION_RADIUS, WEAPON_BAZOOKA);
      }
      if (this.type === PROJECTILE_COCKTAIL_MOLOTOV) {
        cf.position = [
          wall.point[0] + wall.normal[0] * 0.1,
          wall.point[1] + wall.normal[1] * 0.1,
          wall.point[2] + wall.normal[2] * 0.1,
        ];
        return this.spawnFlamePatch(wall.normal);
      }
      cf.position = [
        wall.point[0] + wall.normal[0] * 0.01,
        wall.point[1] + wall.normal[1] * 0.01,
        wall.point[2] + wall.normal[2] * 0.01,
      ];
      cf.vel = reflect(cf.vel, wall.normal).map((v) => v * BOUNCE);
      if (this.type === PROJECTILE_GRENADE && audio) {
        audio.play3D('GrenadeRebond.wav', cf.position, { range: 1, volume: 200 });
      }
    }

    if (this.type === PROJECTILE_ROCKET) {
      for (const p of players) {
        if (p.playerID === this.ownerID) continue;
        const d = Math.hypot(
          p.currentCF.position[0] - cf.position[0],
          p.currentCF.position[1] - cf.position[1],
          p.currentCF.position[2] - cf.position[2],
        );
        if (d < ROCKET_HIT_RADIUS) return this.explode([0, 0, 1], ROCKET_EXPLOSION_RADIUS, WEAPON_BAZOOKA);
      }
    }

    if (this.type === PROJECTILE_COCKTAIL_MOLOTOV) {
      for (const p of players) {
        if (p.playerID === this.ownerID) continue;
        const d = Math.hypot(
          p.currentCF.position[0] - cf.position[0],
          p.currentCF.position[1] - cf.position[1],
        );
        if (d < MOLOTOV_HIT_RADIUS) return this.spawnFlamePatch([0, 0, 1]);
      }
    }

    const pickup = this.checkPickup(players);
    if (pickup) return pickup;

    // GameProjectile.cpp:651 — only the authority copy counts down the fuse.
    if (!this.remoteEntity) {
      this.duration -= delay;
      if (this.duration <= 0) {
        if (this.type === PROJECTILE_GRENADE) {
          return this.explode([0, 0, 1], GRENADE_EXPLOSION_RADIUS, WEAPON_GRENADE);
        }
        if (this.type === PROJECTILE_COCKTAIL_MOLOTOV) {
          return this.spawnFlamePatch([0, 0, 1]);
        }
        return this.kill();
      }
    }
    return null;
  }

  /** Walk-over pickup for life packs and dropped grenades (GameProjectile.cpp:930-967). */
  checkPickup(players) {
    if (this.type !== PROJECTILE_LIFE_PACK && this.type !== PROJECTILE_DROPED_GRENADE) return null;
    const cf = this.currentCF;
    for (const p of players) {
      // Game::playerInRadius only returns living players. Without this guard,
      // a newly-created death drop is consumed by its dead owner on the next
      // client tick because both still occupy the same position.
      if (p.status !== PLAYER_STATUS_ALIVE) continue;
      const d = Math.hypot(p.currentCF.position[0] - cf.position[0], p.currentCF.position[1] - cf.position[1]);
      // Game::playerInRadius adds the babo's 0.25 radius to the item's 0.25
      // radius, giving native pickups an effective center distance of 0.50.
      if (d > 0.5) continue;
      this.dead = true;
      if (this.type === PROJECTILE_LIFE_PACK) {
        return { type: 'pickup', item: 'life', player: p, position: [...cf.position], uniqueID: this.uniqueID };
      }
      return { type: 'pickup', item: 'grenade', player: p, position: [...cf.position], uniqueID: this.uniqueID };
    }
    return null;
  }

  updateFlame(delay, map, players, particles) {
    const cf = this.currentCF;

    if (this.stickToPlayer >= 0) {
      const stuck = players.find((p) => p.playerID === this.stickToPlayer);
      if (!stuck || stuck.status !== PLAYER_STATUS_ALIVE) {
        this.stickToPlayer = -1;
        this.stickFor = 0;
        this.movementLock = true;
        cf.position[2] = FLAME_GROUND_Z;
        cf.vel = [0, 0, 0];
      } else {
        cf.position[0] = stuck.currentCF.position[0];
        cf.position[1] = stuck.currentCF.position[1];
        cf.position[2] = FLAME_GROUND_Z;
      }
      this.stickFor -= delay;
      if (this.stickFor <= 0) {
        this.stickFor = 1.0;
        this.stickToPlayer = -1;
        this.movementLock = true;
      }
    } else {
      if (!this.movementLock) {
        const speed = Math.hypot(cf.vel[0], cf.vel[1], cf.vel[2]);
        if (speed > 0.01 || cf.position[2] > 0.2) {
          cf.position[0] += cf.vel[0] * delay;
          cf.position[1] += cf.vel[1] * delay;
          cf.position[2] += cf.vel[2] * delay;
          cf.vel[2] -= GRAVITY * delay;
        }
        const wall = rayTest(map, this.lastCF.position, cf.position);
        if (wall.hit || cf.position[2] <= FLAME_GROUND_Z) {
          const snap = wall.hit ? wall.point : cf.position;
          this.lockToGround(snap, wall.hit ? wall.normal : null);
        }
      } else {
        cf.position[2] = FLAME_GROUND_Z;
        cf.vel = [0, 0, 0];
      }

      // Stick when a babo walks through — runs even on ground-locked flames (GameProjectile.cpp:532).
      if (this.stickFor > 0) this.stickFor -= delay;
      if (this.stickFor <= 0) {
        this.stickFor = 0;
        const ignoreOwner = this.timeSinceThrown > 0.5 ? -1 : this.ownerID;
      for (const p of players) {
        if (p.status !== PLAYER_STATUS_ALIVE) continue;
        if (p.playerID === ignoreOwner) continue;
        const d = Math.hypot(p.currentCF.position[0] - cf.position[0], p.currentCF.position[1] - cf.position[1]);
        if (d < FLAME_BURN_RADIUS) {
            this.stickToPlayer = p.playerID;
            this.movementLock = true;
            this.stickFor = 3;
            break;
          }
        }
      }
    }

    this.spawnParticleTime++;
    if (this.spawnParticleTime >= 30) this.spawnParticleTime = 0;
    if (particles && this.spawnParticleTime % 3 === 0) {
      particles.spawnGroundFlame(cf.position);
    }
    if (particles && this.spawnParticleTime % 10 === 0) {
      particles.spawnGroundFlameSmoke(cf.position);
    }

    // ~20 server ticks between burns (GameProjectile.cpp:555) at 30 Hz.
    let burn = null;
    if (!this.remoteEntity) {
      this._burnTickAcc += delay;
      if (this._burnTickAcc >= 20 / 30.0) {
        this._burnTickAcc -= 20 / 30.0;
        burn = {
          type: 'burn',
          position: [...cf.position],
          radius: FLAME_BURN_RADIUS,
          ownerID: this.ownerID,
          timeSinceThrown: this.timeSinceThrown,
        };
      }
    }

    this.duration -= delay;
    if (this.duration <= 0) {
      this.dead = true;
    }
    return burn;
  }

  spawnFlamePatch(normal) {
    this.dead = true;
    return {
      type: 'flamePatch',
      position: [...this.currentCF.position],
      ownerID: this.ownerID,
      normal,
      scatterVel: [
        this.currentCF.vel[0] * 0.5,
        this.currentCF.vel[1] * 0.5,
        this.currentCF.vel[2] * 0.5,
      ],
    };
  }

  kill() {
    this.dead = true;
    return null;
  }

  explode(normal, radius, weaponID) {
    this.dead = true;
    return {
      type: 'explosion',
      position: [...this.currentCF.position],
      normal,
      radius,
      damageRadius: weaponID === WEAPON_BAZOOKA ? ROCKET_DAMAGE_RADIUS : GRENADE_DAMAGE_RADIUS,
      ownerID: this.ownerID,
      weaponID,
      reportToServer: !this.remoteEntity,
    };
  }
}

/** Molotov impact — two flames like GameProjectile.cpp:896-923 (center + scatter). */
export function createFlameField(center, ownerID, scatterVel, normal, opts = {}) {
  const flames = [];
  const nx = normal?.[0] ?? 0;
  const ny = normal?.[1] ?? 0;
  const nz = normal?.[2] ?? 1;
  const z = Math.max(FLAME_GROUND_Z, center[2] ?? FLAME_GROUND_Z);
  const flameOpts = { locked: true, remoteEntity: opts.remoteEntity ?? false };

  flames.push(new Projectile(
    PROJECTILE_FLAME,
    [center[0], center[1], z],
    [0, 0, 1],
    ownerID,
    [0, 0, 0],
    flameOpts,
  ));

  const sv = scatterVel ?? [0, 0, 0];
  const speed = Math.hypot(sv[0], sv[1], sv[2]);
  if (speed > 0.01) {
    const vel = reflect([sv[0], sv[1], sv[2]], [nx, ny, nz]);
    vel[0] += randRange(-1, 1);
    vel[1] += randRange(-1, 1);
    vel[2] += randRange(0, 1);
    flames.push(new Projectile(
      PROJECTILE_FLAME,
      [center[0], center[1], z],
      [0, 0, 1],
      ownerID,
      vel,
      { locked: false, remoteEntity: opts.remoteEntity ?? false },
    ));
  }

  return flames;
}

/** Scatter velocity for death drops (Player.cpp:1274-1277). */
export function deathDropVel(playerVel = [0, 0, 0]) {
  const yaw = Math.random() * Math.PI * 2;
  const pitch = randRange(-45, 45) * (Math.PI / 180);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const vel = [Math.sin(yaw) * sp * 3, Math.cos(yaw) * sp * 3, cp * 3];
  vel[0] += playerVel[0] * 0.25;
  vel[1] += playerVel[1] * 0.25;
  vel[2] += playerVel[2] * 0.25;
  return vel;
}

export function createDeathDrop(type, position, playerVel, opts = {}) {
  const vel = deathDropVel(playerVel);
  return new Projectile(type, [...position], [0, 0, 1], opts.ownerID ?? 0, vel, opts);
}
