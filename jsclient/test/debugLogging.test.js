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
