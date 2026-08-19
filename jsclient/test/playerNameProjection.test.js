import test from 'node:test';
import assert from 'node:assert/strict';
import { projectWorldToScreen } from '../public/src/render/renderer.js';

test('player name projection maps the world origin to canvas center', () => {
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  assert.deepEqual(projectWorldToScreen(identity, [0, 0, 0], 800, 600), [400, 300]);
});

test('player name projection excludes points outside the visible clip volume', () => {
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  assert.equal(projectWorldToScreen(identity, [2, 0, 0], 800, 600), null);
});
