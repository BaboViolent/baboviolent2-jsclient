import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('joining an active server preserves authoritative score and timer through map load', async () => {
  const [main, game] = await Promise.all([
    readFile(new URL('../public/src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/game/game.js', import.meta.url), 'utf8'),
  ]);

  assert.match(main, /case NET\.SVCL_SERVER_INFO:[\s\S]*?beginDeferredMapLoad\(mapName\)/);
  assert.match(main, /function beginDeferredMapLoad[\s\S]*?preserveMatchState: true/);
  assert.match(main, /async function switchMap\(name, \{ skipSpawn = false, preserveMatchState = false \}/);
  assert.match(game, /initGameMode\(\{ preserveScores: preserveMatchState \}\)/);
  assert.match(game, /if \(!preserveMatchState\) this\.gameTimeLeft = this\.gameTimeLimit/);
  assert.match(game, /\[this\.blueScore, this\.redScore, this\.ctf\.blueWin, this\.ctf\.redWin\] = score/);
  assert.match(game, /this\.ctf\.flagState = flagState/);
  assert.match(game, /this\.ctf\.flagPos = flagPos/);
});

test('only a fresh match path resets map-local scores and timer', async () => {
  const game = await readFile(new URL('../public/src/game/game.js', import.meta.url), 'utf8');
  assert.match(game, /initGameMode\(\{ preserveScores = false \} = \{\}\)/);
  assert.match(game, /if \(preserveScores\)[\s\S]*?else \{\s*this\.blueScore = 0;\s*this\.redScore = 0;/);
});
