import test from 'node:test';
import assert from 'node:assert/strict';

import { formatCountdown } from '../public/src/ui/timeFormat.js';

test('respawn countdown formats seconds without adding a minute', () => {
  assert.equal(formatCountdown(0), '0:00');
  assert.equal(formatCountdown(5), '0:05');
  assert.equal(formatCountdown(59), '0:59');
  assert.equal(formatCountdown(60), '1:00');
  assert.equal(formatCountdown(65), '1:05');
});
