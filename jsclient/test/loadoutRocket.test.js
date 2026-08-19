import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../public/src/game/player.js';
import { Weapon } from '../public/src/game/weapon.js';
import { Projectile } from '../public/src/game/projectile.js';
import { EFFECTS, ParticleSystem, projectileTrailColor } from '../public/src/render/particles.js';
import { WEAPONS, WEAPON_BAZOOKA, WEAPON_SHOTGUN, WEAPON_FLAME_THROWER, PROJECTILE_ROCKET } from '../public/src/game/constants.js';

test('pending loadout does not replace the current living weapon', () => {
  const player = new Player(0);
  player.weaponID = WEAPON_BAZOOKA;
  player.pendingWeaponID = WEAPON_SHOTGUN;
  assert.equal(player.weaponID, WEAPON_BAZOOKA);
  assert.equal(player.pendingWeaponID, WEAPON_SHOTGUN);
});

test('projectile trails use native team colors', () => {
  assert.deepEqual(projectileTrailColor(0, true, 0.75), [0.45, 0.55, 1, 0.75]);
  assert.deepEqual(projectileTrailColor(1, true, 0.25), [1, 0.45, 0.45, 0.25]);
  assert.deepEqual(projectileTrailColor(0, false, 0.75), [1, 1, 1, 0.75]);
});

test('network rockets face their velocity and never run local collision', () => {
  const rocket = new Projectile(PROJECTILE_ROCKET, [2, 2, 0], [1, 0, 0], 0, [2.5, 0, 0], { remoteEntity: true });
  assert.equal(rocket.currentCF.angle, -90);
  const before = [...rocket.currentCF.position];
  const result = rocket.update(0.25, { sizeX: 1, sizeY: 1 }, [], null);
  assert.equal(result, null);
  assert.deepEqual(rocket.currentCF.position, before);
  assert.equal(rocket.dead, false);
});

test('native base flamethrower and photon contracts stay intact', () => {
  const flame = new Weapon(7);
  const photon = new Weapon(6);
  assert.equal(flame.projectile, 1);
  assert.equal(photon.projectile, 1);
  assert.equal(photon.damage, 0.24);
  assert.equal(photon.fireDelay, 1.5);
});

test('all browser weapon accuracy values match the native constructor table', () => {
  assert.deepEqual(
    WEAPONS.slice(0, 8).map(({ startImp, impressision, nbShot, fireDelay, reculVel }) => (
      [startImp, impressision, nbShot, fireDelay, reculVel]
    )),
    [
      [1, 8, 1, 0.1, 0.5],
      [12, 20, 5, 0.85, 3],
      [0, 0, 2, 2, 3],
      [2, 10, 1, 0.1, 0.8],
      [5, 15, 1, 0.1, 2],
      [0, 0, 1, 1.75, 3],
      [0, 0, 1, 1.5, 5],
      [10, 10, 1, 0.1, 0],
    ],
  );
});

test('old-school flamethrower uses the fixed native three-unit range', () => {
  const flame = new Weapon(WEAPON_FLAME_THROWER);
  flame.currentImp = 0;
  flame.impressision = 0;
  const owner = new Player(0);
  owner.weapon = flame;
  owner.currentCF.position = [0, 0, 0.25];
  owner.currentCF.angle = 0;
  const game = {
    map: { sizeX: 100, sizeY: 100, isPassable: () => true, heightAt: () => 0 },
    players: [owner], onlineMode: false,
    audio: { play3D() {} },
  };
  const first = flame.tryFire(owner, game, { triggerPressed: true })[0];
  const firstRange = Math.hypot(...first.networkTo.map((v, i) => v - first.from[i]));
  assert.ok(Math.abs(firstRange - 3) < 1e-6);
  flame.update(0.1, owner);
  const second = flame.tryFire(owner, game, { triggerPressed: true })[0];
  const secondRange = Math.hypot(...second.networkTo.map((v, i) => v - second.from[i]));
  assert.ok(Math.abs(secondRange - 3) < 1e-6);
});

test('old-school flamethrower trace includes every babo in its wide segment', () => {
  const flame = new Weapon(WEAPON_FLAME_THROWER);
  flame.currentImp = 0;
  flame.impressision = 0;
  const owner = new Player(0);
  const near = new Player(1);
  const far = new Player(2);
  owner.weapon = flame;
  owner.currentCF.position = [0, 0, 0.25];
  owner.currentCF.angle = 0;
  near.currentCF.position = [0, 1, 0.25];
  far.currentCF.position = [0.25, 2.3, 0.25];
  const game = {
    map: { sizeX: 100, sizeY: 100, isPassable: () => true, heightAt: () => 0 },
    players: [owner, near, far], onlineMode: false,
    audio: { play3D() {} },
  };
  const trace = flame.tryFire(owner, game, { triggerPressed: true })[0];
  assert.deepEqual(trace.victims, [near, far]);
  assert.equal(trace.damage, 0.08);
});

test('old-school flamethrower visual is a paired blue-to-red 21-sample stream', () => {
  const particles = new ParticleSystem(100);
  EFFECTS.flameStream(particles, [0, 0, 0.25], [0, 3, 0.25], [0, 0, 0]);
  assert.equal(particles.particles.length, 42);
  assert.deepEqual(particles.particles[0].startColor, [0, 0, 1, 0]);
  assert.deepEqual(particles.particles[1].startColor, [0, 0, 1, 1]);
  assert.equal(particles.particles[40].startColor[0], 1);
  assert.equal(particles.particles[40].startColor[2], 0);
  assert.equal(particles.particles[41].startColor[0], 1);
  assert.equal(particles.particles[41].startColor[2], 0);
  assert.equal(particles.particles[40].duration, 1);
});

test('bazooka remote detonation requires a fresh click after safety delay', () => {
  const weapon = new Weapon(WEAPON_BAZOOKA);
  const owner = new Player(0);
  owner.weapon = weapon;
  owner.rocketInAir = true;
  weapon.currentFireDelay = weapon.fireDelay - 0.3;
  assert.deepEqual(weapon.tryFire(owner, {}, { triggerPressed: false }), []);
  const events = weapon.tryFire(owner, {}, { triggerPressed: true });
  assert.equal(events.length, 1);
  assert.equal(events[0].projectile, PROJECTILE_ROCKET);
  assert.equal(events[0].remoteDetonate, true);
});
