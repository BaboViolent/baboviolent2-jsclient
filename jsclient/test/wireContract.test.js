import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Rust and JavaScript publish the identical versioned wire contract', async () => {
  const clientUrl = new URL('../WIRE_CONTRACT.json', import.meta.url);
  const serverUrl = new URL('../../../babo-dedicated-server/protocol/WIRE_CONTRACT.json', import.meta.url);
  const client = JSON.parse(await readFile(clientUrl, 'utf8'));
  const server = await readFile(serverUrl, 'utf8').then(JSON.parse).catch((error) => {
    if (error.code === 'ENOENT') return null; // Single-repository CI checkout.
    throw error;
  });
  if (server) assert.deepEqual(client, server);
  assert.equal(client.transport, 'websocket-binary');
  assert.equal(client.packets['205'], 33);
  assert.equal(client.packets['212'], 17);
});
