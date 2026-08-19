const lerp = (a, b, t) => a + (b - a) * t;

/** Small delayed snapshot buffer: absorbs packet jitter and only extrapolates briefly. */
export class SnapshotInterpolator {
  constructor({ delayMs = 50, maxExtrapolationMs = 100, teleportDistance = 3 } = {}) {
    this.delayMs = delayMs;
    this.maxExtrapolationMs = maxExtrapolationMs;
    this.teleportDistance = teleportDistance;
    this.frames = [];
  }

  reset() { this.frames.length = 0; }

  push(frame, receivedAt = performance.now()) {
    const position = [...frame.position];
    const previous = this.frames.at(-1);
    if (previous && Math.hypot(position[0] - previous.position[0], position[1] - previous.position[1]) > this.teleportDistance) {
      this.reset();
    }
    this.frames.push({ position, vel: [...frame.vel], mousePos: [...frame.mousePos], time: receivedAt });
    if (this.frames.length > 12) this.frames.shift();
  }

  sample(now = performance.now()) {
    if (!this.frames.length) return null;
    const target = now - this.delayMs;
    while (this.frames.length > 2 && this.frames[1].time <= target) this.frames.shift();
    const a = this.frames[0];
    const b = this.frames[1];
    if (b && target <= b.time) {
      const t = Math.max(0, Math.min(1, (target - a.time) / Math.max(1, b.time - a.time)));
      return {
        position: a.position.map((v, i) => lerp(v, b.position[i], t)),
        vel: a.vel.map((v, i) => lerp(v, b.vel[i], t)),
        mousePos: a.mousePos.map((v, i) => lerp(v, b.mousePos[i], t)),
      };
    }
    const dt = Math.max(0, Math.min(this.maxExtrapolationMs, target - a.time)) / 1000;
    return { position: a.position.map((v, i) => v + a.vel[i] * dt), vel: [...a.vel], mousePos: [...a.mousePos] };
  }
}
