import test from 'node:test';
import assert from 'node:assert/strict';

import { readFile } from 'node:fs/promises';

import { advancePreviewRotation, PROFILE_PREVIEW_FOV } from '../public/src/ui/profilePreview.js';

test('profile preview uses a closer view without a hidden-layout fallback', async () => {
  assert.equal(PROFILE_PREVIEW_FOV, 66);
  const source = await readFile(new URL('../public/src/ui/profilePreview.js', import.meta.url), 'utf8');
  assert.match(source, /getBoundingClientRect\(\)/);
  assert.match(source, /if \(cw <= 0 \|\| ch <= 0\) return/);
  assert.doesNotMatch(source, /clientWidth \|\| 256/);
});

test('profile preview idles like native then accepts movement rotation', () => {
  let rotation = advancePreviewRotation({ yaw: 0, pitch: 0, manual: false }, 1, {});
  assert.deepEqual(rotation, { yaw: 90, pitch: 0, manual: false });

  rotation = advancePreviewRotation(rotation, 0.5, { left: true, up: true });
  assert.deepEqual(rotation, { yaw: 30, pitch: -50, manual: true });

  rotation = advancePreviewRotation(rotation, 1, { down: true });
  assert.deepEqual(rotation, { yaw: 30, pitch: 50, manual: true });
});

test('manual profile rotation clamps pitch and wraps yaw', () => {
  const rotation = advancePreviewRotation({ yaw: 350, pitch: 60, manual: true }, 1, {
    right: true,
    down: true,
  });
  assert.deepEqual(rotation, { yaw: 110, pitch: 65, manual: true });
});
