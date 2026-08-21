import test from 'node:test';
import assert from 'node:assert/strict';
import { GameUI } from '../public/src/ui/ui.js';

test('chat expires from the HUD but remains in the console chat log', () => {
  const ui = new GameUI({});
  ui.addChat('hello');

  ui.update(13);

  assert.equal(ui.chatMessages.length, 0);
  assert.deepEqual(ui.chatLogMessages, ['hello']);
  assert.match(ui.consoleMessages.at(-1), /hello/);
});

test('announcements appear transiently and remain in the console', () => {
  const ui = new GameUI({});
  ui.addAnnouncement('Player joined the server');

  ui.update(6);

  assert.equal(ui.eventMessages.length, 0);
  assert.equal(ui.consoleMessages.at(-1), 'Player joined the server');
});
