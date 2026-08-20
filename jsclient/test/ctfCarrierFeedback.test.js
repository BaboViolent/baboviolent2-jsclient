import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('carried flag is offset from the player and shown in the HUD', async () => {
  const renderer = await readFile(new URL('../public/src/render/renderer.js', import.meta.url), 'utf8');
  const hud = await readFile(new URL('../public/src/ui/hud.js', import.meta.url), 'utf8');

  assert.match(renderer, /p\[0\] -= Math\.cos\(angle\) \* 0\.38/);
  assert.match(renderer, /p\[2\] = \(player\.currentCF\.position\[2\]/);
  assert.match(hud, /carrierFlagId\?\.\(game\.thisPlayer\.playerID\)/);
  assert.match(hud, /YOU HAVE THE FLAG/);
});
