import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('authoritative flame-stick packets keep remote fire attached to its victim', async () => {
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');

  assert.match(main, /case NET\.SVCL_FLAME_STICK_TO_PLAYER:/);
  assert.match(main, /game\.projectiles\.find\(\(p\) => p\.uniqueID === projectileId\)/);
  assert.match(main, /flame\.stickToPlayer = playerId;/);
  assert.match(main, /flame\.movementLock = playerId >= 0;/);
});

test('molotov scatter reflects half the impact velocity like the native client', async () => {
  const projectile = await readFile(new URL('../public/src/game/projectile.js', import.meta.url), 'utf8');

  assert.match(projectile, /reflect\(\[sv\[0\] \* 0\.5, sv\[1\] \* 0\.5, sv\[2\] \* 0\.5\]/);
});
