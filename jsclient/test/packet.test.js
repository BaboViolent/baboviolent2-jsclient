import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeFrame, parseExplosion, parseProjectileCoordFrame, parseVoteRequest, voteRequest, voteResponse,
} from '../public/src/net/packet.js';
import { NET } from '../public/src/net/protocol.js';

test('NET_SVCL_EXPLOSION decodes the exact legacy 29-byte layout', () => {
  const payload = new Uint8Array(29);
  const view = new DataView(payload.buffer);
  const values = [1.25, -2.5, 0.5, 0, 1, 0, 1.5];
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  payload[28] = 17;

  assert.deepEqual(parseExplosion(payload), {
    position: [1.25, -2.5, 0.5],
    normal: [0, 1, 0],
    radius: 1.5,
    playerID: 17,
  });
});

test('NET_SVCL_EXPLOSION preserves signed owner IDs', () => {
  const payload = new Uint8Array(29);
  payload[28] = 0xff;
  assert.equal(parseExplosion(payload).playerID, -1);
});

test('NET_SVCL_EXPLOSION rejects the old truncated payload', () => {
  assert.throws(() => parseExplosion(new Uint8Array(28)), /expected 29/);
});

test('NET_SVCL_PROJECTILE_COORD_FRAME follows the aligned C struct layout', () => {
  const payload = new Uint8Array(24);
  const view = new DataView(payload.buffer);
  view.setInt32(0, 1234, true);
  view.setInt32(8, 77, true);
  view.setInt16(12, 125, true);
  view.setInt16(14, -250, true);
  view.setInt16(16, 50, true);
  payload.set([10, 0xf6, 5], 18);
  assert.deepEqual(parseProjectileCoordFrame(payload), {
    uniqueID: 1234,
    frameID: 77,
    position: [1.25, -2.5, 0.5],
    vel: [1, -1, 0.5],
  });
});

test('vote request and response preserve the legacy wire layouts', () => {
  const request = decodeFrame(voteRequest(7, 'set sv_gameType 2'));
  assert.equal(request.typeId, NET.CLSV_SVCL_VOTE_REQUEST);
  assert.equal(request.payload.length, 81);
  assert.deepEqual(parseVoteRequest(request.payload), { command: 'set sv_gameType 2', playerID: 7 });

  const response = decodeFrame(voteResponse(7, true));
  assert.equal(response.typeId, NET.CLSV_VOTE);
  assert.deepEqual([...response.payload], [1, 7]);
});
