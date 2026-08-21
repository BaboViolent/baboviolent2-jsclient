import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Bv2Client } from '../public/src/net/client.js';
import { NET } from '../public/src/net/protocol.js';

test('Escape menu displays the release version supplied by the server', async () => {
  const [html, main, server, dockerfile, workflow] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../server.js', import.meta.url), 'utf8'),
    readFile(new URL('../../Dockerfile', import.meta.url), 'utf8'),
    readFile(new URL('../../.github/workflows/ci-cd.yml', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /id="igClientVersion"/);
  assert.match(html, /Server version: not connected/);
  assert.match(main, /fetch\('\/api\/version'\)/);
  assert.match(main, /onServerVersion/);
  assert.match(server, /CLIENT_VERSION/);
  assert.match(server, /url === '\/api\/version'/);
  assert.match(dockerfile, /ARG CLIENT_VERSION=development/);
  assert.match(workflow, /CLIENT_VERSION=\$\{\{ github\.ref_name \}\}/);
});

test('handshake exposes the dedicated server release while retaining protocol compatibility', () => {
  let received = null;
  const client = new Bv2Client({
    url: 'ws://example.invalid/ws',
    onServerVersion: (version) => { received = version; },
  });
  client.send = () => {};
  const label = new TextEncoder().encode('v0.4.17\0');
  const payload = new Uint8Array(4 + label.length);
  new DataView(payload.buffer).setUint32(0, 21000, true);
  payload.set(label, 4);
  client._dispatch(NET.SVCL_GAMEVERSION, payload);
  assert.equal(received, 'v0.4.17');
  assert.equal(client.serverVersion, 'v0.4.17');
});
