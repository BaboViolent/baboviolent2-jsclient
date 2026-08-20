import test from 'node:test';
import assert from 'node:assert/strict';
import { Bv2Client } from '../public/src/net/client.js';
import {
  decodeFrame, parsePlayerChangeName, parsePlayerHit, parsePlayerUpdateSkin,
  playerChangeName, playerInfo, playerUpdateSkin,
} from '../public/src/net/packet.js';
import { NET } from '../public/src/net/protocol.js';

test('profile name and appearance have fixed bounded vectors', () => {
  const nameFrame = decodeFrame(playerChangeName(4, 'abcdefghijklmnopqrstuvwxyz123456789'));
  assert.equal(nameFrame.typeId, NET.CLSV_SVCL_PLAYER_CHANGE_NAME);
  assert.equal(nameFrame.payload.length, 33);
  assert.equal(parsePlayerChangeName(nameFrame.payload).name, 'abcdefghijklmnopqrstuvwxyz12345');

  const skinFrame = decodeFrame(playerUpdateSkin(4, 'skin23', {
    r: [1, 2, 3], g: [4, 5, 6], b: [7, 8, 9],
  }));
  assert.equal(skinFrame.payload.length, 17);
  assert.deepEqual(parsePlayerUpdateSkin(skinFrame.payload), {
    playerID: 4, skin: 'skin23',
    decals: {
      red: skinFrame.payload.subarray(8, 11),
      green: skinFrame.payload.subarray(11, 14),
      blue: skinFrame.payload.subarray(14, 17),
    },
  });
});

test('profile names preserve BV2 colours and legacy glyphs on UTF-8 boundaries', () => {
  const decorated = '\x03Red \u009b King';
  const changed = decodeFrame(playerChangeName(4, decorated));
  assert.equal(parsePlayerChangeName(changed.payload).name, decorated);

  const crossing = `${'a'.repeat(29)}\u009bé`;
  const info = decodeFrame(playerInfo(4, crossing));
  const decoded = new TextDecoder().decode(info.payload.subarray(17, 49)).replace(/\0.*$/s, '');
  assert.equal(decoded, `${'a'.repeat(29)}\u009b`);
  assert.equal(decoded.includes('\ufffd'), false);
});

test('rapid profile edits coalesce to the latest reliable control packet', async () => {
  const client = new Bv2Client({ url: 'ws://example.invalid/ws' });
  client.playerId = 2;
  client.connected = true;
  const sent = [];
  client.send = (frame) => sent.push(decodeFrame(frame));
  client.updateProfileName('first');
  client.updateProfileName('second');
  client.updateProfileName('final');
  client.updateProfileSkin('skin1', { red: [0, 0, 0], green: [0, 0, 0], blue: [0, 0, 0] });
  client.updateProfileSkin('skin23', { red: [1, 0, 0], green: [0, 1, 0], blue: [0, 0, 1] });
  await new Promise((resolve) => setTimeout(resolve, 130));
  assert.equal(sent.length, 2);
  assert.equal(parsePlayerChangeName(sent.find((f) => f.typeId === 205).payload).name, 'final');
  assert.equal(parsePlayerUpdateSkin(sent.find((f) => f.typeId === 212).payload).skin, 'skin23');
});

test('signed wire IDs preserve the world attacker sentinel', () => {
  const payload = new Uint8Array(10);
  payload[1] = 0xff;
  new DataView(payload.buffer).setFloat32(3, 50, true);
  assert.equal(parsePlayerHit(payload).fromID, -1);
});
