import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorMap } from '../public/src/game/bvm.js';
import { pickSpawn } from '../public/src/game/spawn.js';
import { GAME_TYPE_CTF, GAME_TYPE_DM, PLAYER_STATUS_ALIVE } from '../public/src/game/constants.js';

const playerAt = (x, y, teamID) => ({
  teamID, status: PLAYER_STATUS_ALIVE, currentCF: { position: [x, y, 0.25] },
});

test('DM spawn is farthest from every live opponent', () => {
  const map = createEditorMap(12, 12);
  map.dmSpawns = [[1.5, 1.5, 0.25], [10.5, 10.5, 0.25]];
  const spawning = playerAt(0, 0, 0);
  const opponent = playerAt(2, 2, 1);
  assert.deepEqual(pickSpawn(map, spawning, [spawning, opponent], GAME_TYPE_DM), [10.5, 10.5, 0.25]);
});

test('team spawn distance ignores teammates like native GameSpawn', () => {
  const map = createEditorMap(12, 12);
  map.dmSpawns = [[1.5, 1.5, 0.25], [10.5, 10.5, 0.25]];
  const spawning = playerAt(0, 0, 0);
  const teammate = playerAt(10, 10, 0);
  const enemy = playerAt(2, 2, 1);
  assert.deepEqual(pickSpawn(map, spawning, [spawning, teammate, enemy], GAME_TYPE_CTF), [10.5, 10.5, 0.25]);
});
