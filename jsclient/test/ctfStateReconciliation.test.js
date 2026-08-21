import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('duplicate CTF transitions still reconcile authoritative pod position', async () => {
  const source = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');
  const handler = source.slice(
    source.indexOf('function applyChangeFlagState'),
    source.indexOf('function applyDropFlag'),
  );

  assert.doesNotMatch(handler, /if \(oldState === newState\) return/);
  assert.match(handler, /ctf\.flagState\[flagId\] = newState/);
  assert.match(handler, /newState === FLAG_AT_POD && game\.map\?\.flagPod/);
});

test('versioned flag packets reject stale snapshots that would teleport a dropped flag', async () => {
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');
  assert.match(main, /function acceptFlagRevision/);
  assert.match(main, /delta !== 0 && delta >= 0x80000000/);
  assert.match(main, /payload\.length >= 34/);
  assert.match(main, /payload\.length >= 17/);
  assert.match(main, /payload\.length >= 8/);
});
