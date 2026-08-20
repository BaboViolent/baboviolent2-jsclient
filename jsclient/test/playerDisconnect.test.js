import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('a disconnected player slot is removed from scoreboard rosters', async () => {
  const [main, constants] = await Promise.all([
    readFile(new URL('../public/src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/game/constants.js', import.meta.url), 'utf8'),
  ]);

  assert.match(constants, /export const PLAYER_TEAM_DISCONNECTED = -2;/);
  assert.match(
    main,
    /case NET\.SVCL_PLAYER_DISCONNECT:[\s\S]*?p\.status = PLAYER_STATUS_DEAD;[\s\S]*?p\.teamID = PLAYER_TEAM_DISCONNECTED;/,
  );
});
