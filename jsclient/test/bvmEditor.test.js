import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createEditorMap, parseBVM, serializeBVM } from '../public/src/game/bvm.js';
import { MAP_VERSION, WEATHER_RAIN } from '../public/src/game/constants.js';

test('editor maps round-trip tiles, dirt, spawns, flags, metadata and theme', () => {
  const map = createEditorMap(4, 3, { author: 'Browser Editor', name: 'roundtrip', theme: 3 });
  map.cells[0] = 5;
  map.cells[7] = 0x80;
  map.dirt[2 * (map.sizeX + 1) + 1] = 0.5;
  map.dmSpawns = [[1.5, 1.5, 0.25]];
  map.blueSpawns = [[0.5, 1.5, 0.25]];
  map.redSpawns = [[3.5, 1.5, 0.25]];
  map.flagPod = [[0.5, 0.5, 0.25], [3.5, 2.5, 0.25]];
  map.objective = [[1.5, 0.5, 0.25], [2.5, 2.5, 0.25]];

  const bytes = serializeBVM(map);
  const result = parseBVM(bytes);
  assert.equal(result.version, MAP_VERSION);
  assert.equal(result.author, 'Browser Editor');
  assert.equal(result.theme, 3);
  assert.equal(result.weather, WEATHER_RAIN);
  assert.deepEqual([...result.cells], [...map.cells]);
  assert.ok(Math.abs(result.dirt[11] - 128 / 255) < 0.0001);
  assert.deepEqual(result.dmSpawns, map.dmSpawns);
  assert.deepEqual(result.blueSpawns, map.blueSpawns);
  assert.deepEqual(result.redSpawns, map.redSpawns);
  assert.deepEqual(result.flagPod, map.flagPod);
  assert.deepEqual(result.objective, map.objective);
});

test('editor export uses native little-endian 32-bit version and 16-bit fields', () => {
  const bytes = serializeBVM(createEditorMap(7, 9, { theme: 5 }));
  const view = new DataView(bytes);
  assert.equal(view.getUint32(0, true), 20202);
  assert.equal(view.getInt16(29, true), 5);
  assert.equal(view.getInt16(31, true), 5);
  assert.equal(view.getInt16(33, true), 7);
  assert.equal(view.getInt16(35, true), 9);
});

test('canonical browser export remains byte-identical to the Rust parser fixture', async () => {
  const map = createEditorMap(2, 2, { author: 'JS editor', theme: 3 });
  map.cells.set([0x80, 2, 3, 0x80]);
  map.dmSpawns = [[0.5, 0.5, 0.25]];
  map.blueSpawns = [[0.5, 1.5, 0.25]];
  map.redSpawns = [[1.5, 0.5, 0.25]];
  map.flagPod = [[0.5, 0.5, 0.25], [1.5, 1.5, 0.25]];
  const fixture = (await readFile(new URL('./fixtures/editor-rust.bvm.base64', import.meta.url), 'utf8')).trim();
  assert.equal(Buffer.from(serializeBVM(map)).toString('base64'), fixture);
});
