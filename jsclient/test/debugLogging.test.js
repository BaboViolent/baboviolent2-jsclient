import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('local debug mode correlates CTF packets, revisions, and rendered flags', async () => {
  const [server, main, renderer, logger] = await Promise.all([
    readFile(new URL('../server.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/render/renderer.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/debugLog.js', import.meta.url), 'utf8'),
  ]);

  assert.match(server, /JSCLIENT_DEBUG_LOG/);
  assert.match(server, /isLoopback\(req\.socket\.remoteAddress\)/);
  assert.match(server, /MAX_DEBUG_BODY/);
  assert.match(logger, /params\.get\('debug'\) === '1'/);
  for (const event of ['flag-packet-enum', 'flag-packet-change', 'flag-packet-drop', 'flag-revision']) {
    assert.match(main, new RegExp(event));
  }
  assert.match(renderer, /debugLog\('flag-render'/);
  assert.match(renderer, /carrierFound/);
  assert.match(renderer, /authoritativePosition/);
  assert.match(renderer, /renderPosition/);
});

test('local debug mode correlates authoritative and rendered ground entities by ID', async () => {
  const [game, renderer] = await Promise.all([
    readFile(new URL('../public/src/game/game.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/render/renderer.js', import.meta.url), 'utf8'),
  ]);

  for (const event of [
    'world-entity-spawn',
    'world-entity-update-missing',
    'world-entity-delete',
    'world-entity-delete-missing',
    'world-entity-remove',
    'world-entities',
  ]) {
    assert.match(game, new RegExp(event));
  }
  assert.match(game, /kind: PROJECTILE_DEBUG_NAMES/);
  assert.match(renderer, /debugLog\('world-render'/);
  assert.match(renderer, /reason: 'model-missing'/);
});
