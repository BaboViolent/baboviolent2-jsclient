import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  THEME_NAMES, WEATHER_FOG_PARAMS, WEATHER_NONE, WEATHER_FOG, WEATHER_SNOW,
  WEATHER_RAIN, WEATHER_SANDSTORM, WEATHER_LAVA, weatherFromTheme,
} from '../public/src/game/constants.js';
import { WEATHER_VISUALS } from '../public/src/game/weather.js';
import { interpolateFrameData } from '../public/src/render/modelRenderer.js';

const themeRoot = fileURLToPath(new URL('../../Content/main/textures/themes/', import.meta.url));

test('all 23 native themes have complete texture sets and valid weather', async () => {
  assert.equal(THEME_NAMES.length, 23);
  for (let id = 0; id < THEME_NAMES.length; id++) {
    const theme = THEME_NAMES[id];
    assert.ok(Object.hasOwn(WEATHER_VISUALS, weatherFromTheme(id)), `${theme} weather`);
    await Promise.all([
      access(`${themeRoot}/${theme}/tex_floor.tga`),
      access(`${themeRoot}/${theme}/tex_floor_dirt.tga`),
      access(`${themeRoot}/${theme}/tex_wall_center.tga`),
    ]);
  }
});

test('theme weather and native fog parameters match Map::reloadWeather', () => {
  const expected = [
    WEATHER_NONE, WEATHER_SNOW, WEATHER_SANDSTORM, WEATHER_RAIN, WEATHER_NONE,
    WEATHER_LAVA, WEATHER_NONE, WEATHER_NONE, WEATHER_LAVA, WEATHER_SNOW,
    WEATHER_FOG, WEATHER_NONE, WEATHER_NONE, WEATHER_RAIN, WEATHER_NONE,
    WEATHER_RAIN, WEATHER_LAVA, WEATHER_NONE, WEATHER_NONE, WEATHER_SANDSTORM,
    WEATHER_NONE, WEATHER_SNOW, WEATHER_NONE,
  ];
  assert.deepEqual(THEME_NAMES.map((_, id) => weatherFromTheme(id)), expected);
  assert.deepEqual(WEATHER_FOG_PARAMS[WEATHER_RAIN], { start: 4, end: -3, color: [0.15, 0.25, 0.25, 1] });
  assert.deepEqual(WEATHER_FOG_PARAMS[WEATHER_FOG], { start: 1, end: -0.25, color: [0.3, 0.4, 0.4, 1] });
});

test('animated DKO frames interpolate geometry while preserving authored UVs', () => {
  const a = new Float32Array([0, 2, 4, 0, 0, 1, 0.25, 0.75]);
  const b = new Float32Array([4, 6, 8, 1, 1, 0, 0.5, 0.5]);
  assert.deepEqual(
    [...interpolateFrameData(a, b, 0.25)],
    [1, 3, 5, 0.25, 0.25, 0.75, 0.25, 0.75],
  );
});

test('photon uses one authoritative sustained blue-white beam', async () => {
  const game = await readFile(new URL('../public/src/game/game.js', import.meta.url), 'utf8');
  const renderer = await readFile(new URL('../public/src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(game, /PHOTON_BEAM_DURATION = 30 \/ 30/);
  assert.match(game, /!event\.isFlame && !this\.onlineMode/);
  assert.match(game, /photon \? PHOTON_BEAM_DURATION : TRACER_DURATION/);
  assert.match(renderer, /if \(tracer\.photon\)[\s\S]*?0\.15, 0\.75, 1/);
});
