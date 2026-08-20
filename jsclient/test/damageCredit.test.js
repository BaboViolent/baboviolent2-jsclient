import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/src/game/game.js';

function harness() {
  const game = Object.create(Game.prototype);
  game.audio = { playHit() {} };
  game.decals = { spawnBlood() {} };
  game.particles = { spawn() {} };
  game.confirmLocalHit = () => {};
  return game;
}

test('online authoritative hit does not add dealt damage to the victim', () => {
  const game = harness();
  const attacker = { playerID: 1, damage: 7 };
  const victim = {
    playerID: 2, damage: 3, life: 1, status: 1,
    currentCF: { position: [0, 0, 0], vel: [0, 0, 0] },
  };
  game.thisPlayer = attacker;
  game.resolvePlayer = (id) => (id === 1 ? attacker : id === 2 ? victim : null);
  game.applyNetHit({ playerID: 2, fromID: 1, weaponID: 0, lifeRemaining: 0.75, vel: null });
  assert.equal(attacker.damage, 7, 'server enum remains authoritative');
  assert.equal(victim.damage, 3);
});

test('offline hit credits a non-self attacker and never the victim', () => {
  const game = harness();
  const attacker = { playerID: 1, damage: 2 };
  const victim = {
    playerID: 2, damage: 4, life: 1, protection: 0,
    currentCF: { position: [0, 0, 0] }, screenHit: 0,
  };
  game.players = [attacker, victim];
  game.thisPlayer = attacker;
  game.hitPlayer(victim, 0.25, attacker, 0);
  assert.equal(attacker.damage, 2.25);
  assert.equal(victim.damage, 4);

  game.hitPlayer(victim, 0.25, victim, 0);
  assert.equal(victim.damage, 4, 'self damage is not dealt damage');
});
