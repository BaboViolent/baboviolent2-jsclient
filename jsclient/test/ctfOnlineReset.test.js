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

test('online returns are classified by the authoritative actor team', async () => {
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const flagTeam = flagId === 0 \? PLAYER_TEAM_BLUE : PLAYER_TEAM_RED;/);
  assert.match(main, /if \(newState === FLAG_AT_POD && p\.teamID === flagTeam\)/);
});
