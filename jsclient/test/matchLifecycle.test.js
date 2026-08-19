import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('map-change packet loads the next map before applying the instant server spawn', async () => {
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');
  assert.match(main, /case NET\.SVCL_MAP_CHANGE:[\s\S]*?readFixedStr\(payload, 0, 16\)/);
  assert.match(main, /switchMap\(mapName, \{ skipSpawn: true, preserveMatchState: true \}\)/);
  assert.match(main, /onlineAwaitingSpawn = false;/);
  assert.match(main, /mapLoadInFlight && typeId !== NET\.SVCL_MAP_CHANGE/);
  assert.match(main, /for \(const \[queuedType, queuedPayload\] of queued\)/);
  assert.match(main, /case NET\.SVCL_MAP_CHANGE:[\s\S]*?resetScoreboardStats\(\)/);
  assert.doesNotMatch(main, /onlineAwaitingSpawn = !game\.isSpectating/);
});

test('HUD announces blue win, red win, and tie throughout intermission', async () => {
  const hud = await readFile(new URL('../public/src/ui/hud.js', import.meta.url), 'utf8');
  assert.match(hud, /renderMatchResult\(game\)/);
  assert.match(hud, /Blue team wins!/);
  assert.match(hud, /Red team wins!/);
  assert.match(hud, /Tie game!/);
});
