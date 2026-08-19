import test from 'node:test';
import assert from 'node:assert/strict';

import { Weapon } from '../public/src/game/weapon.js';
import {
  WEAPON_SHOTGUN,
  WEAPON_SNIPER,
  WEAPON_BAZOOKA,
  WEAPON_PHOTON_RIFLE,
  WEAPON_SMG,
  WEAPON_CHAIN_GUN,
} from '../public/src/game/constants.js';

test('picked-up reload guns begin halfway through their maximum reload', () => {
  for (const id of [WEAPON_SNIPER, WEAPON_BAZOOKA, WEAPON_PHOTON_RIFLE]) {
    const weapon = new Weapon(id);
    weapon.beginPickupReload();
    assert.equal(weapon.currentFireDelay, weapon.fireDelay * 0.5);
  }

  const shotgun = new Weapon(WEAPON_SHOTGUN);
  shotgun.beginPickupReload();
  assert.equal(shotgun.currentFireDelay, 1.5);
});

test('picked-up rapid-fire guns remain immediately usable', () => {
  for (const id of [WEAPON_SMG, WEAPON_CHAIN_GUN]) {
    const weapon = new Weapon(id);
    weapon.beginPickupReload();
    assert.equal(weapon.currentFireDelay, 0);
  }
});
