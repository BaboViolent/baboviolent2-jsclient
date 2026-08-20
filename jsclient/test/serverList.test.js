import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredServerUrls, probeServers } from '../serverList.js';
import { DEFAULT_SETTINGS } from '../public/src/ui/settings.js';

test('fresh clients default to the North Carolina CTF server', () => {
  assert.equal(DEFAULT_SETTINGS.lastIP, 'nc-ctf.baboviolent.net');
  assert.equal(DEFAULT_SETTINGS.lastPort, 443);
});

test('server list accepts comma-separated live info endpoints', () => {
  assert.deepEqual(
    configuredServerUrls({ BV2_GAME_SERVERS: 'http://one:8080, https://two:9443/' }),
    ['http://one:8080', 'https://two:9443/'],
  );
});

test('server probes warm connections and sort by players before measured ping', async () => {
  const fakeFetch = async (url) => {
    if (url.startsWith('http://offline')) throw new Error('offline');
    if (url.startsWith('http://slow')) await new Promise((resolve) => setTimeout(resolve, 8));
    return {
      ok: true,
      json: async () => ({
        name: url.includes('slow') ? 'Slow' : 'Fast',
        map: 'CTF-Alert',
        players: url.includes('slow') ? 3 : 1,
        maxPlayers: 8,
      }),
    };
  };
  const servers = await probeServers(
    ['http://slow:8082', 'http://offline:8083', 'http://fast:8081'],
    fakeFetch,
  );
  assert.deepEqual(servers.map((server) => server.name), ['Slow', 'Fast']);
  assert.equal(servers[1].port, 8081);
});

test('server probes use the public protocol port when the URL omits one', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ name: 'Hosted' }),
  });
  const [server] = await probeServers(['https://babo-server.standouthost.com'], fetchImpl);
  assert.equal(server.port, 443);
});
