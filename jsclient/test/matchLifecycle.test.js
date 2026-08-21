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

test('intermission freezes the clock and deathmatch HUD uses the classic score limit', async () => {
  const [game, hud] = await Promise.all([
    readFile(new URL('../public/src/game/game.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/ui/hud.js', import.meta.url), 'utf8'),
  ]);
  assert.match(game, /this\.roundState === GAME_PLAYING[\s\S]*?this\.gameTimeLeft = Math\.max/);
  assert.match(game, /if \(this\.roundState !== GAME_PLAYING\)[\s\S]*?player\.currentCF\.vel = \[0, 0, 0\][\s\S]*?return;/);
  assert.match(hud, /limit = 50;/);
  assert.doesNotMatch(hud, /limit = 999;/);
});

test('new-round reinitialization clears stale weapon and throwable state', async () => {
  const [game, main] = await Promise.all([
    readFile(new URL('../public/src/game/game.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/main.js', import.meta.url), 'utf8'),
  ]);
  assert.match(main, /if \(reInit\) \{[\s\S]*?game\.resetRoundTransientState\(\)/);
  assert.match(game, /resetRoundTransientState\(\)[\s\S]*?weapon\.currentFireDelay = 0/);
  assert.match(game, /resetRoundTransientState\(\)[\s\S]*?player\.grenadeDelay = 0/);
});

test('map transition never sends stale-map movement after the server respawns the player', async () => {
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');
  assert.match(
    main,
    /game\.onlineMode &&[\s\S]*?netClient\?\.connected &&[\s\S]*?!mapLoadInFlight &&[\s\S]*?game\.roundState === GAME_PLAYING &&[\s\S]*?netClient\.sendCoordFrame/,
  );
});

test('map transition freezes local physics until the authoritative spawn is replayed', async () => {
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');
  assert.match(
    main,
    /if \(game\.onlineMode && mapLoadInFlight\)[\s\S]*?currentCF\.vel = \[0, 0, 0\][\s\S]*?game\.updateWorld\(delay\)[\s\S]*?else \{[\s\S]*?game\.update\(delay\)/,
  );
});

test('server timer synchronization updates both Champion clocks', async () => {
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');
  assert.match(
    main,
    /case NET\.SVCL_SYNCHRONIZE_TIMER:[\s\S]*?game\.gameTimeLeft = t\.gameTimeLeft;[\s\S]*?game\.roundTimeLeft = t\.roundTimeLeft;/,
  );
});
