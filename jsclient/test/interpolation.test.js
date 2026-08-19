import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotInterpolator } from '../public/src/net/interpolation.js';

const frame = (x, vx = 10) => ({ position: [x, 0, .25], vel: [vx, 0, 0], mousePos: [x + 1, 0, .25] });

test('interpolates across irregular snapshot arrivals', () => {
  const net = new SnapshotInterpolator({ delayMs: 50 });
  net.push(frame(0), 0);
  net.push(frame(1), 100);
  assert.equal(net.sample(100).position[0], .5);
});

test('bounds extrapolation and snaps teleports', () => {
  const net = new SnapshotInterpolator({ delayMs: 0, maxExtrapolationMs: 100, teleportDistance: 3 });
  net.push(frame(0), 0);
  assert.equal(net.sample(1000).position[0], 1);
  net.push(frame(10, 0), 1001);
  assert.equal(net.frames.length, 1);
  assert.equal(net.sample(1001).position[0], 10);
});
