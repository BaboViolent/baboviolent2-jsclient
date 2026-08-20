export const NATIVE_PANEL_START_Y = 600;
export const NATIVE_PANEL_START_VELOCITY = -1200;
export const NATIVE_PANEL_GRAVITY = -2000;
export const NATIVE_PANEL_BOUNCE = -0.25;

export function createMenuPanelMotion() {
  return {
    y: NATIVE_PANEL_START_Y,
    velocity: NATIVE_PANEL_START_VELOCITY,
    impactsLeft: 2,
    active: true,
  };
}

/** Port of CPanel::update from the classic menu. */
export function stepMenuPanelMotion(motion, delay) {
  if (!motion?.active || motion.velocity === 0) return 0;

  motion.velocity += NATIVE_PANEL_GRAVITY * delay;
  motion.y += motion.velocity * delay;
  let impacts = 0;

  if (motion.y <= 0) {
    motion.y = 0;
    motion.velocity *= NATIVE_PANEL_BOUNCE;
    if (motion.velocity < 0.15 || motion.impactsLeft === 0) {
      motion.velocity = 0;
      motion.active = false;
    } else if (motion.impactsLeft > 0) {
      motion.impactsLeft -= 1;
      impacts = 1;
    }
  }

  return impacts;
}
