import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('death flow no longer renders a separate in-game respawn button', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/main.js', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(html, /id="btnRespawn"/);
  assert.match(main, /if \(game\.onlineMode && onlineAwaitingSpawn && !game\.isSpectating\)/);
  assert.match(main, /if \(game\.thisPlayer\.timeToSpawn <= 0\) requestOnlineSpawn\(\);/);
  assert.match(main, /resumeGame\(\);/);
});

test('initial and later spawn waits can dismiss the menu normally', async () => {
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /btnRespawn\.addEventListener/);
  assert.doesNotMatch(main, /updateRespawnDisplay\(/);
  assert.match(main, /function joinTeamOnline\(teamId\) \{[\s\S]*?onlineAwaitingSpawn = true;/);
  assert.match(main, /game\.update\(delay\);/);
  assert.doesNotMatch(main, /menu2\.onResume[^]*?onlineAwaitingSpawn\) showIngameMenu/);
});
