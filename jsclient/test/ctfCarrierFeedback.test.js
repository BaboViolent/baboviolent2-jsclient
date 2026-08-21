import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { carriedFlagMatrix, CARRIED_FLAG_TILT } from '../public/src/render/renderer.js';

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

test('carried flag is pitched toward the top-down camera for stable visibility', async () => {
  const renderer = await readFile(new URL('../public/src/render/renderer.js', import.meta.url), 'utf8');

  assert.match(renderer, /CARRIED_FLAG_TILT/);
  assert.match(renderer, /carriedFlagMatrix\(p, angle, scale\)/);
  assert.match(renderer, /this\.models\.draw\(f\.built, modelMatrix, anim\);/);
});

test('carried flag has an angle-independent top-down cloth footprint', () => {
  const scale = 0.005;
  const expected = Math.sin(CARRIED_FLAG_TILT) * scale;
  for (let degrees = 0; degrees < 360; degrees += 5) {
    const matrix = carriedFlagMatrix([4, 8, 0.25], degrees * Math.PI / 180, scale);
    // Column 2 maps the flag's authored vertical axis into world space. Its
    // XY magnitude is its visible top-down width and must never collapse.
    assert.ok(Math.abs(Math.hypot(matrix[8], matrix[9]) - expected) < 1e-7);
  }
});

test('native map-misc order draws flags before player bodies and weapons', async () => {
  const renderer = await readFile(new URL('../public/src/render/renderer.js', import.meta.url), 'utf8');
  const render = renderer.slice(renderer.indexOf('render(game) {'), renderer.indexOf('playerWeaponMatrix('));

  assert.ok(render.indexOf('this.renderFlags(game, mvp);') < render.indexOf('gl.bindTexture(gl.TEXTURE_2D, player.skinTexture);'));
  assert.ok(render.indexOf('this.renderFlags(game, mvp);') < render.indexOf('this.renderModels(game, mvp);'));
  assert.match(render, /this\.renderFlags\(game, mvp\);[\s\S]*gl\.useProgram\(this\.program\);[\s\S]*gl\.bindTexture\(gl\.TEXTURE_2D, player\.skinTexture\);/);
});
