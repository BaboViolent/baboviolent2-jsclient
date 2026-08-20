import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coordFrame, decodeFrame, parseCoordFrame, parsePlayerSpawn, playerInfo, spawnRequest,
} from '../public/src/net/packet.js';

test('player info uses the native 122-byte field layout without overlapping IP and name', () => {
  const payload = decodeFrame(playerInfo(3, 'Alice', 'user', 'secret')).payload;
  assert.equal(payload.length, 122);
  assert.equal(payload[0], 3);
  assert.deepEqual([...payload.subarray(1, 17)], new Array(16).fill(0));
  assert.equal(new TextDecoder().decode(payload.subarray(17, 22)), 'Alice');
  assert.equal(new TextDecoder().decode(payload.subarray(49, 53)), 'user');
  assert.equal(new TextDecoder().decode(payload.subarray(70, 76)), 'secret');
});

test('spawn request and response match native gcc byte vectors', () => {
  const request = decodeFrame(spawnRequest(3, 2, 8, 'skin10', {
    r: [1, 2, 3], g: [4, 5, 6], b: [7, 8, 9],
  })).payload;
  assert.equal(request.length, 19);
  assert.deepEqual([...request], [3, 2, 8, 115, 107, 105, 110, 49, 48, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

  const response = new Uint8Array([3, 2, 8, 0, 12, 0, 233, 255, 4, 0,
    115, 107, 105, 110, 49, 48, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(parsePlayerSpawn(response), {
    playerID: 3, weaponID: 2, meleeID: 8, position: [1.2, -2.3, 0.4], skin: 'skin10',
    decals: { red: response.subarray(17, 20), green: response.subarray(20, 23), blue: response.subarray(23, 26) },
  });
});

test('coordinate frames retain native alignment padding and round-trip', () => {
  const payload = decodeFrame(coordFrame(3, 0x01020304, [1, -2, 0.25], [1, -1, 0], [3, 4, 0.25], 0x11223344)).payload;
  assert.equal(payload.length, 28);
  assert.deepEqual([...payload.subarray(0, 8)], [3, 0, 0, 0, 4, 3, 2, 1]);
  assert.deepEqual([...payload.subarray(24, 28)], [0x44, 0x33, 0x22, 0x11]);
  assert.deepEqual(parseCoordFrame(payload), {
    playerID: 3, frameID: 0x01020304, position: [1, -2, 0.25],
    vel: [1, -1, 0], mousePos: [3, 4, 0.25],
  });
});
