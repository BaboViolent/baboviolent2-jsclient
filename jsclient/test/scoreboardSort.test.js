import test from 'node:test';
import assert from 'node:assert/strict';

import { compareScoreboardPlayers } from '../public/src/ui/hud.js';

test('scoreboard sorts kills highest first with deterministic ties', () => {
  const players = [
    { id: 4, kills: 3, score: 9, deaths: 2 },
    { id: 1, kills: 8, score: 1, deaths: 7 },
    { id: 3, kills: 3, score: 9, deaths: 1 },
    { id: 2, kills: 3, score: 12, deaths: 8 },
  ];

  assert.deepEqual(players.sort(compareScoreboardPlayers).map((p) => p.id), [1, 2, 3, 4]);
});
