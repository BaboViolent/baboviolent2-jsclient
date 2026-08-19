import test from 'node:test';
import assert from 'node:assert/strict';

import { rasterCells, EDITOR_TOOLS, WorldMapEditor } from '../public/src/ui/worldMapEditor.js';
import { createProfileEditorMap } from '../public/src/ui/mapEditor.js';

test('fast editor drags rasterize every crossed world cell', () => {
  assert.deepEqual(rasterCells([1, 1], [6, 1]), [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1]]);
  const diagonal = rasterCells([0, 0], [4, 3]);
  assert.deepEqual(diagonal[0], [0, 0]);
  assert.deepEqual(diagonal.at(-1), [4, 3]);
  assert.ok(diagonal.length >= 5);
});

test('contextual erase clears terrain, dirt, and entities without changing the tool', () => {
  const editor = Object.create(WorldMapEditor.prototype);
  editor.tool = 'redFlag';
  editor.map = createProfileEditorMap(8, 8, 'erase', 0, 'Babo');
  editor.map.cells[2 * 8 + 3] = 5;
  editor.map.dirt[2 * 9 + 3] = 1;
  editor.map.dmSpawns = [[3.5, 2.5, .25]];
  editor.map.flagPod[0] = [3.5, 2.5, .25];
  editor.eraseAt(3, 2);
  assert.equal(editor.map.cells[19], 0x80);
  assert.equal(editor.map.dirt[21], 0);
  assert.deepEqual(editor.map.dmSpawns, []);
  assert.equal(editor.tool, 'redFlag');
});

test('new editor maps take author from the active profile', () => {
  const map = createProfileEditorMap(16, 20, 'arena', 4, 'Profile Babo');
  assert.equal(map.author, 'Profile Babo');
  assert.equal(map.name, 'arena');
  assert.equal(map.theme, 4);
});

test('in-world palette includes terrain, spawn, flag, objective and erase tools', () => {
  const ids = EDITOR_TOOLS.map(([id]) => id);
  for (const id of ['floor', 'wall', 'dirt', 'dm', 'blue', 'red', 'blueFlag', 'redFlag', 'blueObjective', 'redObjective', 'eraseEntity']) {
    assert.ok(ids.includes(id), id);
  }
});
