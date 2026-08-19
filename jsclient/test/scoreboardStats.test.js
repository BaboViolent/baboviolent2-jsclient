import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { parsePlayerEnumState } from '../public/src/net/packet.js';

test('player enum exposes authoritative dealt damage, returns, and attempts', () => {
  const payload = new Uint8Array(96);
  const view = new DataView(payload.buffer);
  view.setInt16(39, 4, true);
  view.setInt16(41, 3, true);
  view.setInt16(43, 9, true);
  view.setFloat32(51, 2.75, true);
  const state = parsePlayerEnumState(payload);
  assert.equal(state.score, 4);
  assert.equal(state.returns, 3);
  assert.equal(state.flagAttempts, 9);
  assert.equal(state.damageDealt, 2.75);
});

test('CTF scoreboard uses successful score for caps instead of flag attempts', async () => {
  const [hud, main] = await Promise.all([
    readFile(new URL('../public/src/ui/hud.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/main.js', import.meta.url), 'utf8'),
  ]);
  assert.match(hud, /col\.caps[^\n]*String\(p\.score \?\? 0\)/);
  assert.doesNotMatch(hud, /col\.caps[^\n]*flagAttempts/);
  assert.match(main, /p\.damage = st\.damageDealt/);
  assert.match(main, /p\.returns = st\.returns/);
});

test('offline CTF kills do not increment the field displayed as caps', async () => {
  const game = await readFile(new URL('../public/src/game/game.js', import.meta.url), 'utf8');
  assert.match(game, /killer\.kills\+\+;\s*if \(this\.gameType !== GAME_TYPE_CTF\) killer\.score\+\+;/);
});
