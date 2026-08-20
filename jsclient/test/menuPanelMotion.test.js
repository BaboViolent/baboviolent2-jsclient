import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMenuPanelMotion,
  stepMenuPanelMotion,
  NATIVE_PANEL_START_Y,
  NATIVE_PANEL_START_VELOCITY,
} from '../public/src/ui/menuPanelMotion.js';

test('classic menu panel starts below the screen and travels upward', () => {
  const motion = createMenuPanelMotion();
  assert.equal(motion.y, NATIVE_PANEL_START_Y);
  assert.equal(motion.velocity, NATIVE_PANEL_START_VELOCITY);
  stepMenuPanelMotion(motion, 1 / 60);
  assert.ok(motion.y < NATIVE_PANEL_START_Y);
  assert.ok(motion.velocity < NATIVE_PANEL_START_VELOCITY);
});

test('classic menu panel emits two landing impacts and settles at zero', () => {
  const motion = createMenuPanelMotion();
  let impacts = 0;
  for (let frame = 0; frame < 600 && motion.active; frame += 1) {
    impacts += stepMenuPanelMotion(motion, 1 / 60);
  }
  assert.equal(impacts, 2);
  assert.equal(motion.y, 0);
  assert.equal(motion.active, false);
});
