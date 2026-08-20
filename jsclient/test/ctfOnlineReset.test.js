import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CTFState } from '../public/src/game/ctf.js';

test('online CTF reset initializes flag pods before the first world update', () => {
  const state = new CTFState();
  const map = { flagPod: [[2, 3, 0], [8, 9, 0]] };
  state.reset(map);
  assert.doesNotThrow(() => state.updatePositions([]));
  assert.deepEqual(state.flagPos, [[2, 3, 0.25], [8, 9, 0.25]]);
});

test('CTF updates are safe while the online map is still loading', () => {
  const state = new CTFState();
  assert.doesNotThrow(() => state.updatePositions([]));
  assert.deepEqual(state.flagPos, [[0, 0, 0.25], [0, 0, 0.25]]);
});

test('online returns prefer the explicit server action with a legacy fallback', async () => {
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const action = payload\.length >= 4 \? payload\[3\] : 0;/);
  assert.match(main, /if \(action === 2 \|\|/);
  assert.match(main, /const flagTeam = flagId === 0 \? PLAYER_TEAM_BLUE : PLAYER_TEAM_RED;/);
  assert.match(main, /action === 0 && newState === FLAG_AT_POD && p\.teamID === flagTeam/);
});
