// Spent brass casings (Douille), ported from src/Game/Game.h and Game.cpp:1063.
import { rayTest } from './raycast.js';

function reflect(v, n) {
  const d = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
  return [v[0] - 2 * d * n[0], v[1] - 2 * d * n[1], v[2] - 2 * d * n[2]];
}

function randRange(a, b) {
  return a + Math.random() * (b - a);
}

function rotateAboutAxis(v, angleDeg, axis) {
  const rad = (angleDeg * Math.PI) / 180;
  const [x, y, z] = axis;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dot = x * v[0] + y * v[1] + z * v[2];
  return [
    v[0] * c + (y * v[2] - z * v[1]) * s + x * dot * (1 - c),
    v[1] * c + (z * v[0] - x * v[2]) * s + y * dot * (1 - c),
    v[2] * c + (x * v[1] - y * v[0]) * s + z * dot * (1 - c),
  ];
}

export class Brass {
  constructor(position, direction, right, damage = 1) {
    this.position = [...position];
    this.delay = 2;
    this.soundPlayed = false;
    // Douille ctor: vel = direction * 1.5, then randomised about right/axis.
    let vel = [direction[0] * 1.5, direction[1] * 1.5, direction[2] * 1.5];
    vel = rotateAboutAxis(vel, randRange(-30, 30), right);
    vel = rotateAboutAxis(vel, randRange(0, 360), direction);
    this.vel = vel;
    this.spin = Math.hypot(vel[0], vel[1]) || 1;
  }

  update(delay, map, audio) {
    this.delay -= delay;
    if (this.delay <= 0) return false;

    const lastPos = [...this.position];
    const speed = Math.hypot(this.vel[0], this.vel[1], this.vel[2]);
    if (speed > 0.5) {
      this.position[0] += this.vel[0] * delay;
      this.position[1] += this.vel[1] * delay;
      this.position[2] += this.vel[2] * delay;
      this.vel[2] -= 9.8 * delay;

      const wall = rayTest(map, lastPos, this.position);
      if (wall.hit) {
        if (!this.soundPlayed && audio) {
          audio.play3D(`douille${1 + Math.floor(Math.random() * 3)}.wav`, this.position, { range: 1, volume: 255 });
          this.soundPlayed = true;
        }
        this.position = [
          wall.point[0] + wall.normal[0] * 0.1,
          wall.point[1] + wall.normal[1] * 0.1,
          wall.point[2] + wall.normal[2] * 0.1,
        ];
        this.vel = reflect(this.vel, wall.normal).map((v) => v * 0.3);
      }
    }
    return true;
  }
}
