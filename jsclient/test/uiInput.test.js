import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { GameUI } from '../public/src/ui/ui.js';
import { CHAT_TEAM_ALL, GAME_TYPE_CTF, GAME_TYPE_DM } from '../public/src/game/constants.js';

function onlineGame() {
  const sent = [];
  return {
    onlineMode: true,
    thisPlayer: { teamID: 1 },
    netClient: {
      sendChat: (teamID, message) => sent.push({ teamID, message }),
      requestVote: (command) => sent.push({ command }),
      castVote: (yes) => sent.push({ yes }),
    },
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

test('vote console command and F1/F2 action use the network vote flow', () => {
  const game = onlineGame();
  const ui = new GameUI(game);
  ui.runCommand('vote changemap CTF-Alert');
  assert.deepEqual(game.sent, [{ command: 'changemap CTF-Alert' }]);

  ui.startVote('Starter', 'changemap CTF-Alert');
  assert.equal(ui.castVote(true), true);
  assert.deepEqual(game.sent.at(-1), { yes: true });
  assert.equal(ui.castVote(false), false, 'a player may vote only once');
  ui.updateVote(1, 0);
  assert.deepEqual({ yes: ui.vote.yes, no: ui.vote.no }, { yes: 1, no: 0 });
  ui.finishVote(true);
  assert.equal(ui.vote.active, false);
  assert.match(ui.eventMessages.at(-1).message, /Vote passed/);
});

test('active vote captures F1 and F2 before browser defaults', async () => {
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');
  assert.match(main, /\['F1', 'F2'\]\.includes\(event\.code\)/);
  assert.match(main, /event\.preventDefault\(\)/);
  assert.match(main, /event\.stopImmediatePropagation\(\)/);
  assert.match(main, /castVote\(event\.code === 'F1'\)/);
  assert.match(main, /\{ capture: true \}/);
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

test('kill feed uses neutral names in FFA and team colors in CTF', () => {
  const game = onlineGame();
  const ui = new GameUI(game);
  const killer = { name: 'Killer', teamID: 0 };
  const victim = { name: 'Victim', teamID: 1 };

  game.gameType = GAME_TYPE_DM;
  ui.addKill(killer, victim, 0);
  assert.equal(ui.eventMessages.at(-1).message.startsWith('\x09Killer'), true);
  assert.equal(ui.eventMessages.at(-1).message.includes('\x08 \x09Victim'), true);
  assert.equal(ui.eventMessages.at(-1).message.includes('{Killer'), false);
  assert.equal(ui.eventMessages.at(-1).message.includes('}Victim'), false);

  game.gameType = GAME_TYPE_CTF;
  ui.addKill(killer, victim, 0);
  assert.equal(ui.eventMessages.at(-1).message.startsWith('{Killer'), true);
  assert.equal(ui.eventMessages.at(-1).message.includes('}Victim'), true);
});

test('kill feed announces a suicide with the player on both sides', () => {
  const game = onlineGame();
  const ui = new GameUI(game);
  const player = { name: 'Babo', teamID: 0 };
  ui.addKill(player, player, 5);
  assert.match(ui.eventMessages.at(-1).message, /Babo.*Bazooka.*Babo/);
});
