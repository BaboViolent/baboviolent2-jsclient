import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('explosive hits drive a decaying camera offset', async () => {
  const [game, renderer] = await Promise.all([
    readFile(new URL('../public/src/game/game.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/render/renderer.js', import.meta.url), 'utf8'),
  ]);
  assert.match(game, /WEAPON_BAZOOKA, WEAPON_GRENADE, WEAPON_NUCLEAR/);
  assert.match(game, /this\.viewShake - delay \* 0\.75/);
  assert.match(renderer, /this\.cameraShake = \[0, 0\]/);
  assert.match(renderer, /p\[0\] \+ shake\[0\]/);
});
