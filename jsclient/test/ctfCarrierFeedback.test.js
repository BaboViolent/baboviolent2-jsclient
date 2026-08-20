import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('carried flag uses the native carrier position and aim-relative angle', async () => {
  const renderer = await readFile(new URL('../public/src/render/renderer.js', import.meta.url), 'utf8');
  const hud = await readFile(new URL('../public/src/ui/hud.js', import.meta.url), 'utf8');

  assert.match(renderer, /p\[0\] = player\.currentCF\.position\[0\]/);
  assert.match(renderer, /p\[1\] = player\.currentCF\.position\[1\]/);
  assert.match(renderer, /p\[2\] = player\.currentCF\.position\[2\]/);
  assert.match(renderer, /angle = \(player\.currentCF\.angle - 90\)/);
  assert.doesNotMatch(hud, /carrierFlagId\?\.\(game\.thisPlayer\.playerID\)/);
  assert.doesNotMatch(hud, /YOU HAVE THE FLAG/);
});

test('carried flag preserves the native upright DKO transform', async () => {
  const renderer = await readFile(new URL('../public/src/render/renderer.js', import.meta.url), 'utf8');
  const modelMatrix = renderer.match(/const modelMatrix = new Float32Array\(\[([\s\S]*?)\]\)/)?.[1] ?? '';

  assert.match(modelMatrix, /c, s, 0, 0,/);
  assert.match(modelMatrix, /-s, c, 0, 0,/);
  assert.match(modelMatrix, /0, 0, scale, 0,/);
  assert.match(renderer, /this\.models\.draw\(f\.built, modelMatrix, anim\);/);
});
