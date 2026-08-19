import test from 'node:test';
import assert from 'node:assert/strict';

import { DecalSystem } from '../public/src/game/decals.js';
import { ParticleSystem, EFFECTS } from '../public/src/render/particles.js';

test('native-strength death blood creates ten scattered floor marks', () => {
  const decals = new DecalSystem();
  assert.equal(decals.spawnBlood([5, 5, 0.25], 1, () => 0.5), 10);
  const marks = decals.marks.filter((mark) => mark.delay > 0);
  assert.equal(marks.length, 10);
  assert.ok(marks.every((mark) => mark.delay === 30));
  assert.ok(marks.every((mark) => /^blood(0[1-9]|10)$/.test(mark.texture)));
});

test('blood particles scale at ten particles per damage point', () => {
  const particles = new ParticleSystem();
  EFFECTS.blood(particles, [0, 0, 0.25], [0, 0, 1], 1);
  assert.equal(particles.particles.length, 10);
  assert.ok(particles.particles.every((particle) => particle.duration === 2));
});
