import test from 'node:test';
import assert from 'node:assert/strict';
import { DeferredPacketQueue } from '../public/src/net/deferredPackets.js';
import { NET } from '../public/src/net/protocol.js';

const projectile = (id, marker) => {
  const p = new Uint8Array(24);
  new DataView(p.buffer).setInt32(0, id, true);
  p[8] = marker;
  return p;
};

test('map-load queue retains only the latest snapshots per entity', () => {
  const queue = new DeferredPacketQueue();
  queue.enqueue(NET.CLSV_SVCL_PLAYER_COORD_FRAME, new Uint8Array([3, 1]));
  queue.enqueue(NET.CLSV_SVCL_PLAYER_COORD_FRAME, new Uint8Array([3, 2]));
  queue.enqueue(NET.SVCL_PROJECTILE_COORD_FRAME, projectile(44, 1));
  queue.enqueue(NET.SVCL_PROJECTILE_COORD_FRAME, projectile(44, 2));
  const drained = queue.drain();
  assert.equal(drained.length, 2);
  assert.equal(drained[0][1][1], 2);
  assert.equal(drained[1][1][8], 2);
});

test('disconnects and projectile deletes suppress stale deferred snapshots', () => {
  const queue = new DeferredPacketQueue();
  queue.enqueue(NET.CLSV_SVCL_PLAYER_COORD_FRAME, new Uint8Array([3, 9]));
  queue.enqueue(NET.SVCL_PLAYER_DISCONNECT, new Uint8Array([3]));
  queue.enqueue(NET.SVCL_PROJECTILE_COORD_FRAME, projectile(44, 9));
  const deleted = new Uint8Array(4);
  new DataView(deleted.buffer).setInt32(0, 44, true);
  queue.enqueue(NET.SVCL_DELETE_PROJECTILE, deleted);
  assert.deepEqual(queue.drain().map(([type]) => type), [
    NET.SVCL_PLAYER_DISCONNECT, NET.SVCL_DELETE_PROJECTILE,
  ]);
});

test('reliable map-load traffic is bounded while snapshots remain bounded by entities', () => {
  const queue = new DeferredPacketQueue();
  for (let i = 0; i < 512; i++) assert.equal(queue.enqueue(NET.SVCL_PLAYER_HIT, new Uint8Array(16)), true);
  assert.equal(queue.enqueue(NET.SVCL_PLAYER_HIT, new Uint8Array(16)), false);
  for (let i = 0; i < 10_000; i++) queue.enqueue(NET.CLSV_SVCL_PLAYER_COORD_FRAME, new Uint8Array([i % 32]));
  assert.equal(queue.playerSnapshots.size, 32);
});
