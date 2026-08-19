// Weapon instances and local shot resolution.
// Ported from src/Game/Weapon.cpp (Weapon::shoot) and src/Game/Game.cpp
// (Game::shoot). In the real client the ray is resolved server-side and echoed
// back as NET_SVCL_PLAYER_SHOOT; with no server yet we resolve it locally,
// which is exactly what Game::shootSV does.
import {
  WEAPONS, WEAPON_MODEL_SCALE, SHOOT_RANGE, PROJECTILE_DIRECT, PROJECTILE_ROCKET,
  PROJECTILE_GRENADE, PROJECTILE_COCKTAIL_MOLOTOV, PROJECTILE_NONE, PLAYER_RADIUS,
  WEAPON_SHOTGUN, WEAPON_CHAIN_GUN, WEAPON_PHOTON_RIFLE, WEAPON_FLAME_THROWER,
  WEAPON_KNIVES, WEAPON_NUCLEAR, WEAPON_SHIELD, SV_ENABLE_SHOTGUN_RELOAD,
} from './constants.js';
import { rayTest, raySphere } from './raycast.js';

const DEG = Math.PI / 180;

function randRange(a, b) {
  return a + Math.random() * (b - a);
}

function rotateAboutZ(v, angleRad) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

function rotateAboutAxis(v, angleRad, axis) {
  const [x, y, z] = axis;
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const dot = x * v[0] + y * v[1] + z * v[2];
  return [
    v[0] * c + (y * v[2] - z * v[1]) * s + x * dot * (1 - c),
    v[1] * c + (z * v[0] - x * v[2]) * s + y * dot * (1 - c),
    v[2] * c + (x * v[1] - y * v[0]) * s + z * dot * (1 - c),
  ];
}

function matColumn(mat, col) {
  const i = col * 3;
  return [mat[i], mat[i + 1], mat[i + 2]];
}

export class Weapon {
  constructor(weaponID) {
    this.weaponID = weaponID;
    Object.assign(this, WEAPONS[weaponID]);
    this.currentFireDelay = 0;
    this.currentImp = this.startImp;
    this.firingNuzzle = -1;
    this.charge = 0;
    this.justCharged = 0;
    this.shotInc = 0;
    this.fullReload = false;
    this._lastReloadBucket = -1;
    this.chainOverHeat = 1;
    this.overHeated = false;
    this.nukeFrameID = 0;
    this.nukeArmed = false;
    this.flameSecondsFired = 0;
    this._elapsedSinceShot = Infinity;
    /** Nuzzle dummy positions in model space; filled once the DKO is loaded. */
    this.nuzzles = [];
    /** Eject dummies with matrix columns for brass direction (Weapon.cpp:413). */
    this.ejectors = [];
  }

  setModel(built) {
    this.built = built;
    this.nuzzles = [];
    this.ejectors = [];
    for (let i = 1; ; i++) {
      const flash = built.dummies.find((d) => d.name === `flash${i}`);
      if (!flash) break;
      this.nuzzles.push({
        position: flash.positions[0] ?? [0, 0, 0],
        matrix: flash.matrices[0] ?? [1, 0, 0, 0, 1, 0, 0, 0, 1],
      });
    }
    for (let i = 1; ; i++) {
      const eject = built.dummies.find((d) => d.name === `eject${i}`);
      if (!eject) break;
      this.ejectors.push({
        position: eject.positions[0] ?? [0, 0, 0],
        matrix: eject.matrices[0] ?? [1, 0, 0, 0, 1, 0, 0, 0, 1],
      });
    }
  }

  /** A dropped reload-based gun is collected halfway through its reload. */
  beginPickupReload() {
    const reloadMax = this.weaponID === WEAPON_SHOTGUN
      ? 3
      : (this.fireDelay >= 1 ? this.fireDelay : 0);
    this.currentFireDelay = reloadMax * 0.5;
  }

  update(delay, owner, audio = null) {
    this._elapsedSinceShot += delay;
    if (this.justCharged > 0) {
      this.justCharged -= delay;
      if (this.justCharged < 0) this.justCharged = 0;
    }

    if (this.currentImp > this.startImp) {
      this.currentImp -= delay * 10;
      if (this.currentImp < this.startImp) this.currentImp = this.startImp;
    }

    if (this.currentFireDelay > 0) {
      this.currentFireDelay -= delay;
      if (this.currentFireDelay < 0) this.currentFireDelay = 0;
    }

    // Shotgun tube-by-tube reload (PlayerUpdate.cpp:141).
    if (this.fullReload && this.weaponID === WEAPON_SHOTGUN) {
      if (this.shotInc > 0 && this.currentFireDelay > 0) {
        const bucket = Math.floor((this.currentFireDelay / 3) * 100);
        if (bucket % 17 === 0 && bucket !== this._lastReloadBucket) {
          this._lastReloadBucket = bucket;
          this.shotInc--;
          if (audio) {
            audio.play3D('shotgunReload.wav', owner.currentCF.position, { range: 5, volume: 230 });
          }
        }
      } else if (this.shotInc <= 0) {
        this.fullReload = false;
        this._lastReloadBucket = -1;
      }
    }

    this.chainOverHeat += delay * 0.25;
    if (this.chainOverHeat > 1) {
      this.chainOverHeat = 1;
      this.overHeated = false;
    }
    if (this.chainOverHeat > 0.5) this.overHeated = false;

    if (this.weaponID === WEAPON_NUCLEAR && this.nukeArmed) {
      this.nukeFrameID += delay * 30;
    }

    this.updateMeleeAnim();
  }

  /** Knife pop / shield deploy anim (Weapon.cpp:617-638). */
  updateMeleeAnim() {
    if (this.weaponID === WEAPON_KNIVES && this.currentFireDelay > 0) {
      const fd = this.fireDelay;
      if (this.currentFireDelay > fd - 0.1) {
        this.modelAnim = (1 - (this.currentFireDelay - (fd - 0.1)) / 0.1) * 10;
      } else if (this.currentFireDelay < 0.25) {
        this.modelAnim = (this.currentFireDelay / 0.25) * 10;
      } else {
        this.modelAnim = 10;
      }
    } else if (this.weaponID === WEAPON_SHIELD && this.currentFireDelay > 0) {
      this.modelAnim = Math.min(20, ((this.fireDelay - this.currentFireDelay) / this.fireDelay) * 20);
    } else {
      this.modelAnim = 0;
    }
  }

  /** World-space muzzle position for the current nuzzle, in player space. */
  muzzleWorld(owner) {
    if (!this.nuzzles.length) return [...owner.currentCF.position];
    const nuzzle = this.nuzzles[Math.max(this.firingNuzzle, 0)];
    const scaled = [
      nuzzle.position[0] * WEAPON_MODEL_SCALE,
      nuzzle.position[1] * WEAPON_MODEL_SCALE,
      nuzzle.position[2] * WEAPON_MODEL_SCALE,
    ];
    const rotated = rotateAboutZ(scaled, owner.currentCF.angle * DEG);
    return [
      rotated[0] + owner.currentCF.position[0],
      rotated[1] + owner.currentCF.position[1],
      rotated[2],
    ];
  }

  ejectBrass(owner) {
    if (!this.ejectors.length) return null;
    const idx = Math.max(this.firingNuzzle, 0) % this.ejectors.length;
    const eject = this.ejectors[idx];
    const scaled = [
      eject.position[0] * WEAPON_MODEL_SCALE,
      eject.position[1] * WEAPON_MODEL_SCALE,
      eject.position[2] * WEAPON_MODEL_SCALE,
    ];
    const pos = rotateAboutZ(scaled, owner.currentCF.angle * DEG);
    const world = [
      pos[0] + owner.currentCF.position[0],
      pos[1] + owner.currentCF.position[1],
      owner.currentCF.position[2] - 0.25 + pos[2],
    ];
    const up = rotateAboutZ(matColumn(eject.matrix, 1), owner.currentCF.angle * DEG);
    const right = rotateAboutZ(matColumn(eject.matrix, 0), owner.currentCF.angle * DEG);
    const dir = [up[0] * (this.damage + 1), up[1] * (this.damage + 1), up[2] * (this.damage + 1)];
    return { position: world, direction: dir, right };
  }

  /** @returns {object[]} shot events for the game to render/apply */
  tryFire(owner, game, { triggerPressed = false } = {}) {
    if (this.weaponID === 5 && owner.rocketInAir) {
      if (!triggerPressed || this.currentFireDelay > this.fireDelay - 0.25) return [];
      const from = this.muzzleWorld(owner);
      const direction = rotateAboutZ([0, 1, 0], owner.currentCF.angle * DEG);
      return [{ type: 'projectile', projectile: PROJECTILE_ROCKET, from, direction, owner, remoteDetonate: true }];
    }
    if (this.currentFireDelay > 0) return [];
    if (this.overHeated) return [];

    // Photon rifle charge-up (Weapon.cpp:291).
    if (this.weaponID === WEAPON_PHOTON_RIFLE && this.charge < 0.5) {
      if (this.charge === 0) {
        this.justCharged = 1;
        game.audio.play3D('PhotonStart.wav', owner.currentCF.position, { range: 5, volume: 150 });
      }
      this.charge += 0.033333;
      return [];
    }
    this.charge = 0;

    // Melee weapons have no flash dummies.
    if (this.projectile === PROJECTILE_NONE) {
      return this.fireMelee(owner, game);
    }

    this.chainOverHeat -= 0.052;
    if (this.chainOverHeat < 0) {
      this.chainOverHeat = 0;
      if (this.weaponID === WEAPON_CHAIN_GUN) {
        this.overHeated = true;
        game.audio.play3D('overHeat.wav', owner.currentCF.position, { range: 5, volume: 150 });
        return [];
      }
    }

    this.firingNuzzle = (this.firingNuzzle + 1) % Math.max(this.nuzzles.length, 1);
    if (this.weaponID === WEAPON_FLAME_THROWER) {
      this.flameSecondsFired = this._elapsedSinceShot <= this.fireDelay + 0.075
        ? this.flameSecondsFired + this.fireDelay
        : 0;
    } else {
      this.flameSecondsFired = 0;
    }
    this._elapsedSinceShot = 0;
    this.currentFireDelay = this.fireDelay;

    this.shotInc++;
    if (this.shotInc >= 6 && this.weaponID === WEAPON_SHOTGUN) {
      if (SV_ENABLE_SHOTGUN_RELOAD) {
        this.currentFireDelay = 3;
        this.fullReload = true;
        this._lastReloadBucket = -1;
      } else {
        this.shotInc = 0;
      }
    }

    const from = this.muzzleWorld(owner);
    const direction = rotateAboutZ([0, 1, 0], owner.currentCF.angle * DEG);

    owner.currentCF.vel[0] -= direction[0] * this.reculVel;
    owner.currentCF.vel[1] -= direction[1] * this.reculVel;

    this.currentImp = Math.min(this.currentImp + 3, this.impressision);

    const events = [];
    const brass = this.shouldEjectBrass() ? this.ejectBrass(owner) : null;
    if (brass) events.push({ type: 'brass', ...brass });

    if (this.projectile === PROJECTILE_DIRECT) {
      for (let i = 0; i < this.nbShot; i++) {
        events.push(this.traceOne(from, direction, owner, game));
      }
    } else if (
      this.projectile === PROJECTILE_ROCKET ||
      this.projectile === PROJECTILE_GRENADE ||
      this.projectile === PROJECTILE_COCKTAIL_MOLOTOV
    ) {
      events.push({ type: 'projectile', projectile: this.projectile, from, direction, owner });
    }
    return events;
  }

  shouldEjectBrass() {
    return (
      this.projectile === PROJECTILE_DIRECT &&
      this.weaponID !== WEAPON_FLAME_THROWER &&
      this.weaponID !== WEAPON_PHOTON_RIFLE
    );
  }

  /** Grenade / molotov pitch (PlayerUpdate.cpp:617, uses gameVar.weapons[WEAPON_*]->shoot). */
  throwOnce(owner) {
    this.firingNuzzle = Math.max(this.firingNuzzle, 0);
    const from = this.muzzleWorld(owner);
    const direction = rotateAboutZ([0, 1, 0], owner.currentCF.angle * DEG);
    owner.currentCF.vel[0] -= direction[0] * this.reculVel;
    owner.currentCF.vel[1] -= direction[1] * this.reculVel;
    return { type: 'projectile', projectile: this.projectile, from, direction, owner };
  }

  /** Secondary melee (knives / shield) on Space. */
  tryMelee(owner, game) {
    if (this.currentFireDelay > 0) return [];
    return this.fireMelee(owner, game);
  }

  fireMelee(owner, game) {
    this.currentFireDelay = this.fireDelay;
    game.audio.play3D(this.sound, owner.currentCF.position, { range: 5, volume: 255 });

    switch (this.weaponID) {
      case WEAPON_KNIVES:
        return [{ type: 'melee', weaponID: WEAPON_KNIVES, radius: 1, owner, sameDmg: true }];
      case WEAPON_SHIELD:
        return [{ type: 'shield', owner, duration: 2 }];
      case WEAPON_NUCLEAR:
        this.nukeArmed = true;
        this.nukeFrameID = 0;
        return [{ type: 'nukeArm', owner }];
      default:
        return [];
    }
  }

  /** Game::shoot's spread cone, then Game::shootSV's hit resolution. */
  traceOne(from, direction, owner, game) {
    const range = this.weaponID === WEAPON_FLAME_THROWER
      ? 3
      : SHOOT_RANGE;
    let p2 = [direction[0] * range, direction[1] * range, direction[2] * range];
    // The production client sends a clean unit aim vector; Rust applies the
    // authoritative weapon bloom and range, matching the original PRO server.
    const imp = game.onlineMode ? 0 : this.currentImp;
    p2 = rotateAboutZ(p2, randRange(-imp, imp) * DEG);
    p2 = rotateAboutAxis(p2, randRange(0, 360) * DEG, direction);
    p2[2] *= 0.5;
    p2 = [p2[0] + from[0], p2[1] + from[1], p2[2] + from[2]];
    // Native Game::shoot sends this full pre-collision endpoint. Keep it
    // separate from the clipped endpoint used for immediate local effects.
    const networkTo = game.onlineMode ? [...direction] : [...p2];

    const wall = rayTest(game.map, from, p2);
    let end = wall.point;
    let normal = wall.normal;
    let victim = null;
    const victims = [];
    let closest = Infinity;
    const hitRadius = this.weaponID === WEAPON_FLAME_THROWER ? 0.5 : PLAYER_RADIUS;

    for (const player of game.players) {
      if (player === owner) continue;
      const hit = raySphere(from, end, player.currentCF.position, hitRadius);
      if (hit && this.weaponID === WEAPON_FLAME_THROWER) {
        victims.push(player);
      } else if (hit && hit.t < closest) {
        closest = hit.t;
        victim = player;
        end = hit.point;
        normal = [0, 0, 1];
      }
    }

    return {
      type: 'trace',
      from,
      to: end,
      networkTo,
      normal,
      victim,
      victims,
      damage: this.damage,
      owner,
      weaponID: this.weaponID,
      isFlame: this.weaponID === WEAPON_FLAME_THROWER,
    };
  }
}
