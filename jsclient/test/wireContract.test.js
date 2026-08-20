import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Rust and JavaScript publish the identical versioned wire contract', async () => {
  const clientUrl = new URL('../WIRE_CONTRACT.json', import.meta.url);
  const serverUrl = new URL('../../../babo-dedicated-server/protocol/WIRE_CONTRACT.json', import.meta.url);
  const [client, server] = await Promise.all([
    readFile(clientUrl, 'utf8').then(JSON.parse),
    readFile(serverUrl, 'utf8').then(JSON.parse),
  ]);
  assert.deepEqual(client, server);
  assert.equal(client.transport, 'websocket-binary');
  assert.equal(client.packets['205'], 33);
  assert.equal(client.packets['212'], 17);
});
