import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('FFA kill feed resets both player names to white around the weapon color', async () => {
  const ui = await readFile(new URL('../public/src/ui/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /const killerReset = teamMode \? '' : '\\x09';/);
  assert.match(ui, /const victimReset = teamMode \? '' : '\\x09';/);
  assert.match(ui, /weapon}[\s\S]*victimReset/);
});

test('online team changes always enter authoritative respawn state', async () => {
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const changedTeam = p\.teamID !== teamId;/);
  assert.match(main, /if \(changedTeam \|\| p\.status !== PLAYER_STATUS_ALIVE\)/);
});

test('authoritative team changes and flag drops are announced in the event feed', async () => {
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');
  assert.match(main, /p\.name \+ ' \\x08joined the ' \+ teamName/);
  assert.match(main, /carrier\.name \+ ' \\x08dropped the ' \+ \(flagId === 0 \? 'blue' : 'red'\) \+ ' flag'/);
  assert.match(main, /carrier === game\.thisPlayer[\s\S]*carrier\.status === PLAYER_STATUS_ALIVE[\s\S]*game\.onPlayerDeath\(carrier/);
});

test('online Escape menu includes the connected server identity', async () => {
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');
  assert.match(main, /let connectedServerLabel = '';/);
  assert.match(main, /igGameSubtitle\.textContent = connectedServerLabel/);
});
