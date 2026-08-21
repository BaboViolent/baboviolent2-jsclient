import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('FFA and Champion offer one join action instead of team choices', async () => {
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.match(main, /GAME_TYPE_DM \|\| game\.gameType === GAME_TYPE_SND/);
  assert.match(main, /freeForAllMode \? 'Join game' : 'Join blue team'/);
  assert.match(main, /btnRedTeam\.hidden = freeForAllMode/);
  assert.match(main, /btnAutoTeam\.hidden = freeForAllMode/);
  assert.match(css, /\.ig-col \.ig-btn\[hidden\]\s*\{\s*display: none !important;/);
});

test('FFA and Champion scoreboards separate active players from spectators', async () => {
  const hud = await readFile(new URL('../public/src/ui/hud.js', import.meta.url), 'utf8');
  assert.match(hud, /gt === GAME_TYPE_SND \? 'CHAMPION' : 'FREE FOR ALL'/);
  assert.match(hud, /pl\.teamID === PLAYER_TEAM_BLUE \|\| pl\.teamID === PLAYER_TEAM_RED/);
  assert.match(hud, /const drawSpectators = \(\) =>/);
  assert.match(hud, /'SPECTATORS'/);
  assert.match(hud, /if \(isFFA\)[\s\S]*drawSpectators\(\)/);
});
