// Ground decals (blood splats, scorch marks), ported from Game.h FloorMark.
const MAX_FLOOR_MARK = 500;

export class DecalSystem {
  constructor() {
    this.marks = Array.from({ length: MAX_FLOOR_MARK }, () => ({ delay: 0 }));
    this.next = 0;
  }

  spawn({ position, angle = 0, size, delay, startDelay = 0, texture, color = [1, 1, 1, 1] }) {
    const slot = this.next;
    this.next = (this.next + 1) % MAX_FLOOR_MARK;
    this.marks[slot] = {
      position: [...position],
      angle,
      size,
      delay,
      startDelay,
      texture,
      color: [...color],
    };
  }

  /** Game::spawnBlood — damage*10 scattered 30-second floor marks. */
  spawnBlood(position, damage, random = Math.random) {
    const amount = Math.min(2, Math.max(0, damage));
    const count = Math.floor(amount * 10);
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const distance = random() * amount * 2.5;
      const maxSize = Math.max(0.05, 1 - distance / 2.5);
      this.spawn({
        position: [position[0] + Math.cos(angle) * distance, position[1] + Math.sin(angle) * distance, 0.025],
        angle: random() * Math.PI * 2,
        size: 0.05 + random() * (maxSize - 0.05),
        delay: 30,
        startDelay: distance * 0.5,
        texture: `blood${String(1 + Math.floor(random() * 10)).padStart(2, '0')}`,
        color: [0.25 + random() * 0.25, 0, 0, 0.5 + random() * 0.5],
      });
    }
    return count;
  }

  spawnExplosionMark(position, radius) {
    this.spawn({
      position: [position[0], position[1], 0.025],
      angle: Math.random() * Math.PI * 2,
      size: radius * 0.55,
      delay: 180,
      texture: 'explosionMark',
      color: [1, 1, 1, 0.9],
    });
  }

  update(delay) {
    for (const mark of this.marks) {
      if (mark.delay <= 0 && mark.startDelay <= 0) continue;
      if (mark.startDelay > 0) {
        mark.startDelay -= delay;
      } else {
        mark.delay -= delay;
      }
    }
  }

  /** Active marks for rendering. */
  visible() {
    return this.marks.filter((m) => m.delay > 0 && m.startDelay <= 0);
  }
}
