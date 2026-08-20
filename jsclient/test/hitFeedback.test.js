import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/src/game/game.js';

function feedbackHarness() {
  const played = [];
  const game = Object.create(Game.prototype);
  game.time = 0;
  game.hitIndicator = 0;
  game.lastHitConfirmAt = -Infinity;
  game.audio = { ctx: { currentTime: 0 }, play2D: (...args) => played.push(args) };
  return { game, played };
}

test('shotgun pellets coalesce while SMG and sniper actions remain immediate', () => {
  const { game, played } = feedbackHarness();
  for (let pellet = 0; pellet < 5; pellet++) game.confirmLocalHit();
  assert.equal(played.length, 1);
  assert.equal(game.hitIndicator, 1);
  game.audio.ctx.currentTime = 0.04;
  game.confirmLocalHit();
  game.audio.ctx.currentTime = 0.2;
  game.confirmLocalHit();
  assert.equal(played.length, 3);
  assert.ok(played.every(([asset]) => asset === 'Hit.wav'));
});

test('explosion and sustained flame feedback cannot queue future clicks or clip gain', () => {
  const { game, played } = feedbackHarness();
  for (let tick = 0; tick < 100; tick++) {
    game.audio.ctx.currentTime = tick * 0.01;
    game.confirmLocalHit();
  }
  assert.ok(played.length <= 25);
  assert.ok(played.every(([, volume]) => volume === 210));
  game.resetHitFeedback();
  assert.equal(game.hitIndicator, 0);
  assert.equal(game.lastHitConfirmAt, -Infinity);
});
