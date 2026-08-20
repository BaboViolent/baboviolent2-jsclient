import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHostPort, joinTargetToWsUrl } from '../public/src/net/joinTarget.js';

test('join targets support DNS, IPv4, IPv6, and complete websocket URLs', () => {
  assert.equal(joinTargetToWsUrl('game.test', 8080), 'ws://game.test:8080/ws');
  assert.equal(joinTargetToWsUrl('127.0.0.1:9000'), 'ws://127.0.0.1:9000/ws');
  assert.equal(joinTargetToWsUrl('[2001:db8::1]:9000'), 'ws://[2001:db8::1]:9000/ws');
  assert.equal(joinTargetToWsUrl('2001:db8::1', 8080), 'ws://[2001:db8::1]:8080/ws');
  assert.equal(joinTargetToWsUrl('wss://game.test:9443/custom'), 'wss://game.test:9443/custom');
  assert.equal(joinTargetToWsUrl('ws://game.test'), 'ws://game.test:8080/ws');
  assert.equal(joinTargetToWsUrl('game.test', 8080, 'https:'), 'wss://game.test:8080/ws');
  assert.equal(formatHostPort('2001:db8::1', 9000), '[2001:db8::1]:9000');
});
