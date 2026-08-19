import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePlayerShoot } from '../public/src/net/packet.js';

test('shot impact normals decode legacy signed bytes', () => {
  const payload = new Uint8Array(20);
  payload[16] = (-120) & 0xff;
  payload[17] = 60;
  payload[18] = (-30) & 0xff;
  assert.deepEqual(parsePlayerShoot(payload).normal, [-1, 0.5, -0.25]);
});
