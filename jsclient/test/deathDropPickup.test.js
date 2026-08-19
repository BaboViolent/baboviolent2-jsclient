import test from 'node:test';
import assert from 'node:assert/strict';

import { Projectile } from '../public/src/game/projectile.js';
import { readFile } from 'node:fs/promises';
import {
  PLAYER_STATUS_ALIVE,
  PLAYER_STATUS_DEAD,
  PROJECTILE_LIFE_PACK,
  PROJECTILE_DROPED_GRENADE,
} from '../public/src/game/constants.js';

function player(status, position = [4, 4, 0.25]) {
  return { status, currentCF: { position } };
}

test('dead owner cannot instantly consume health or grenade death drops', () => {
  for (const type of [PROJECTILE_LIFE_PACK, PROJECTILE_DROPED_GRENADE]) {
    const drop = new Projectile(type, [4, 4, 0.25], [0, 0, 1], 3);
    assert.equal(drop.checkPickup([player(PLAYER_STATUS_DEAD)]), null);
    assert.equal(drop.dead, false);
  }
});

test('living player can collect a nearby death drop', () => {
  const drop = new Projectile(PROJECTILE_DROPED_GRENADE, [4, 4, 0.25], [0, 0, 1], 3);
  const living = player(PLAYER_STATUS_ALIVE, [4.1, 4, 0.25]);
  const result = drop.checkPickup([living]);
  assert.equal(result?.item, 'grenade');
  assert.equal(result?.player, living);
  assert.equal(drop.dead, true);
});

test('native pickup radius includes drops almost half a unit from player centre', () => {
  const drop = new Projectile(PROJECTILE_LIFE_PACK, [4, 4, 0.25], [0, 0, 1], 3);
  const living = player(PLAYER_STATUS_ALIVE, [4.49, 4, 0.25]);
  assert.equal(drop.checkPickup([living])?.item, 'life');
});

test('grenade pickup retains the native equip sound', async () => {
  const game = await readFile(new URL('../public/src/game/game.js', import.meta.url), 'utf8');
  assert.match(
    game,
    /item === 'grenade'[\s\S]*?nbGrenadeLeft[\s\S]*?play3D\('equip\.wav', player\.currentCF\.position, \{ range: 5, volume: 255 \}\)/,
  );
});
