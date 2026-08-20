import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Game } from '../public/src/game/game.js';

test('older delayed weapon hydration cannot overwrite a newer authoritative generation', async () => {
  const resolvers = [];
  const game = Object.create(Game.prototype);
  game.loadBuiltModel = () => new Promise((resolve) => resolvers.push(resolve));
  const player = { _netStateGen: 1 };
  const older = game.setWeapon(player, 0, 1);
  player._netStateGen = 2;
  const newer = game.setWeapon(player, 1, 2);
  resolvers[1]({ id: 'new', dummies: [] });
  await newer;
  resolvers[0]({ id: 'old', dummies: [] });
  await older;
  assert.equal(player.weaponID, 1);
  assert.equal(player.weapon.built.id, 'new');
});

test('spawn and enum mutate life status and loadout before asynchronous hydration', async () => {
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');
  assert.match(main, /function applyPlayerSpawn[\s\S]*?p\.status = PLAYER_STATUS_ALIVE[\s\S]*?void applyPlayerSkin/);
  assert.match(main, /function applyPlayerEnum[\s\S]*?p\.status = netStatusToLocal[\s\S]*?void game\.setWeapon/);
  assert.match(main, /_netStateGen = \(p\._netStateGen \?\? 0\) \+ 1/);
});
