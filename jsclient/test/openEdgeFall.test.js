import test from 'node:test';
import assert from 'node:assert/strict';

import { performCollision, collisionClip } from '../public/src/game/collision.js';
import { Player } from '../public/src/game/player.js';

const openMap = {
  sizeX: 8,
  sizeY: 8,
  theme: 0,
  isPassable: () => true,
  dirtAtVertex: () => 0,
};

const noInput = { moveUp: false, moveDown: false, moveLeft: false, moveRight: false };

test('an open map edge does not bounce or clamp the player', () => {
  const last = { position: [0.1, 4, 0.25] };
  const current = { position: [-0.1, 4, 0.25], vel: [-2, 0, 0] };
  performCollision(openMap, last, current, 0.25);
  collisionClip(openMap, current, 0.25);
  assert.equal(current.position[0], -0.1);
  assert.equal(current.vel[0], -2);
});

test('a player in black out-of-bounds space falls', () => {
  const player = new Player(0);
  player.currentCF.position = [-0.1, 4, 0.25];
  player.currentCF.vel = [0, 0, 0];
  player.update(0.1, openMap, noInput);
  assert.equal(player.currentCF.position[2], 0.25);
  assert.ok(player.currentCF.vel[2] < 0);
  player.update(0.1, openMap, noInput);
  assert.ok(player.currentCF.position[2] < 0.25);
});
