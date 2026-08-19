import test from 'node:test';
import assert from 'node:assert/strict';

import { GameUI } from '../public/src/ui/ui.js';
import { CHAT_TEAM_ALL } from '../public/src/game/constants.js';

function onlineGame() {
  const sent = [];
  return {
    onlineMode: true,
    thisPlayer: { teamID: 1 },
    netClient: { sendChat: (teamID, message) => sent.push({ teamID, message }) },
    sent,
  };
}

test('focused chat input submits on Enter and releases gameplay', () => {
  const game = onlineGame();
  const ui = new GameUI(game);
  ui.playing = true;
  ui.menuOpen = false;
  ui.openChat(false);
  ui.chatBuffer = 'hello world';

  assert.equal(ui.handleTextInputKey('Enter'), true);
  assert.deepEqual(game.sent, [{ teamID: CHAT_TEAM_ALL, message: 'hello world' }]);
  assert.equal(ui.chatActive, false);
  assert.equal(ui.chatBuffer, '');
});

test('focused chat and console input can be cancelled without refreshing', () => {
  const ui = new GameUI(onlineGame());
  ui.playing = true;
  ui.menuOpen = false;
  ui.openChat(true);
  ui.chatBuffer = 'discard me';
  assert.equal(ui.handleTextInputKey('Escape'), true);
  assert.equal(ui.chatActive, false);

  ui.toggleConsole();
  ui.consoleBuffer = 'help';
  assert.equal(ui.handleTextInputKey('Enter'), true);
  assert.equal(ui.consoleActive, true);
  assert.equal(ui.consoleBuffer, '');
  assert.match(ui.consoleMessages.at(-1), /Commands:/);
  assert.equal(ui.handleTextInputKey('Escape'), true);
  assert.equal(ui.consoleActive, false);
});
