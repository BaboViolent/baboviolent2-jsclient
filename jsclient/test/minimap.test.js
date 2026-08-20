import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  minimapPoint,
  visibleMinimapFlags,
  visibleMinimapPlayers,
} from '../public/src/ui/minimap.js';
import {
  PLAYER_STATUS_ALIVE,
  PLAYER_STATUS_DEAD,
  PLAYER_TEAM_BLUE,
  PLAYER_TEAM_RED,
  GAME_TYPE_DM,
  GAME_TYPE_TDM,
} from '../public/src/game/constants.js';
import { FLAG_AT_POD, FLAG_DROPPED } from '../public/src/game/ctf.js';

const player = (teamID, status = PLAYER_STATUS_ALIVE) => ({
  teamID,
  status,
  currentCF: { position: [1, 1, 0.25] },
});

test('minimap shows living friends but not enemies or dead teammates', () => {
  const viewer = player(PLAYER_TEAM_BLUE);
  const friend = player(PLAYER_TEAM_BLUE);
  const deadFriend = player(PLAYER_TEAM_BLUE, PLAYER_STATUS_DEAD);
  const enemy = player(PLAYER_TEAM_RED);
  assert.deepEqual(
    visibleMinimapPlayers([viewer, friend, deadFriend, enemy], viewer, GAME_TYPE_TDM),
    [friend],
  );
  assert.deepEqual(
    visibleMinimapPlayers([viewer, friend, deadFriend, enemy], viewer, GAME_TYPE_TDM, true),
    [friend, enemy],
  );
});

test('FFA minimap reveals only opponents who fired recently', () => {
  const viewer = player(PLAYER_TEAM_BLUE);
  const hiddenSameID = player(PLAYER_TEAM_BLUE);
  const hiddenOtherID = player(PLAYER_TEAM_RED);
  const revealed = player(PLAYER_TEAM_BLUE);
  revealed.firedShowDelay = 1.5;
  assert.deepEqual(
    visibleMinimapPlayers([viewer, hiddenSameID, hiddenOtherID, revealed], viewer, GAME_TYPE_DM),
    [revealed],
  );
});

test('minimap shows public flags and friendly carriers but hides enemy carriers', () => {
  const viewer = player(PLAYER_TEAM_BLUE);
  const friend = player(PLAYER_TEAM_BLUE);
  const enemy = player(PLAYER_TEAM_RED);
  const ctf = {
    flagState: [FLAG_AT_POD, FLAG_DROPPED],
    flagPos: [[2, 3, 0.25], [8, 9, 0.25]],
  };
  const players = [viewer, friend, enemy];
  assert.deepEqual(visibleMinimapFlags(ctf, players, viewer).map(({ flagID }) => flagID), [0, 1]);
  ctf.flagState = [1, 2];
  assert.deepEqual(visibleMinimapFlags(ctf, players, viewer).map(({ flagID }) => flagID), [0]);
  assert.deepEqual(visibleMinimapFlags(ctf, players, viewer, true).map(({ flagID }) => flagID), [0, 1]);
});

test('minimap conversion preserves BV2 north-up orientation', () => {
  assert.deepEqual(minimapPoint([5, 2], {
    x: 10, y: 20, width: 100, height: 50, mapWidth: 10, mapHeight: 10,
  }), [60, 60]);
});

test('minimap renders flags as a pole and banner instead of a player square', async () => {
  const hud = await readFile(new URL('../public/src/ui/hud.js', import.meta.url), 'utf8');
  assert.match(hud, /A pole and offset banner reads as a flag/);
  assert.match(hud, /this\.rect\(fx - 4, fy - 5, 2, 11/);
  assert.match(hud, /this\.rect\(fx - 1, fy - 4, 5, 4, color\)/);
});
