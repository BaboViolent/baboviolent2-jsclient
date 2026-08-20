import test from 'node:test';
import assert from 'node:assert/strict';
import { isMobileSpectatorDevice } from '../public/src/mobile.js';

test('touch phones and tablets use spectator-only mobile controls', () => {
  assert.equal(isMobileSpectatorDevice({ maxTouchPoints: 5, coarsePointer: true, width: 1280 }), true);
  assert.equal(isMobileSpectatorDevice({ maxTouchPoints: 1, coarsePointer: false, width: 800 }), true);
});

test('desktop and narrow non-touch windows retain normal team controls', () => {
  assert.equal(isMobileSpectatorDevice({ maxTouchPoints: 0, coarsePointer: true, width: 390 }), false);
  assert.equal(isMobileSpectatorDevice({ maxTouchPoints: 0, coarsePointer: false, width: 800 }), false);
});
