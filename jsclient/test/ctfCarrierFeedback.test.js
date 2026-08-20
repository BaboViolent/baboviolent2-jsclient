import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('carried flag stays camera-facing above the player and is shown in the HUD', async () => {
  const renderer = await readFile(new URL('../public/src/render/renderer.js', import.meta.url), 'utf8');
  const hud = await readFile(new URL('../public/src/ui/hud.js', import.meta.url), 'utf8');

  assert.match(renderer, /p\[0\] = player\.currentCF\.position\[0\]/);
  assert.match(renderer, /p\[1\] = player\.currentCF\.position\[1\]/);
  assert.match(renderer, /p\[2\] = \(player\.currentCF\.position\[2\]/);
  assert.match(renderer, /\+ 0\.5/);
  assert.doesNotMatch(renderer, /angle = \(player\.currentCF\.angle/);
  assert.match(hud, /carrierFlagId\?\.\(game\.thisPlayer\.playerID\)/);
  assert.match(hud, /YOU HAVE THE FLAG/);
});
