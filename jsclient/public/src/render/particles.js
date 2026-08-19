// Ground-plane particle quads (fine under the top-down camera), standing in for
// the engine's dkp* system
// (dkpCreateParticleEx). Parameters mirror the call sites in Weapon.cpp and
// GameProjectile.cpp: start/end size, start/end colour, gravity, air resistance.

function rand(a, b) {
  return a + Math.random() * (b - a);
}

export function projectileTrailColor(teamID, teamMode, alpha) {
  if (!teamMode) return [1, 1, 1, alpha];
  if (teamID === 0) return [0.45, 0.55, 1.0, alpha];
  if (teamID === 1) return [1.0, 0.45, 0.45, alpha];
  return [1, 1, 1, alpha];
}

export class ParticleSystem {
  constructor(max = 2048) {
    this.particles = [];
    this.max = max;
  }

  spawn({
    position, direction = [0, 0, 1], speedFrom = 1, speedTo = 2, pitchTo = 45,
    startSizeFrom = 0.05, startSizeTo = 0.25, endSizeFrom = 0.25, endSizeTo = 0.45,
    durationFrom = 0.5, durationTo = 2, startColor = [1, 1, 1, 1], endColor = [1, 1, 1, 0],
    gravity = 0, airResistance = 0.25, count = 5, texture = 'smoke1', additive = false,
  }) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.max) break;
      const pitch = rand(0, pitchTo) * (Math.PI / 180);
      const yaw = rand(0, Math.PI * 2);
      // Cone around `direction`, approximated with a tangent basis.
      const up = Math.abs(direction[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
      const rx = direction[1] * up[2] - direction[2] * up[1];
      const ry = direction[2] * up[0] - direction[0] * up[2];
      const rz = direction[0] * up[1] - direction[1] * up[0];
      const rl = Math.hypot(rx, ry, rz) || 1;
      const right = [rx / rl, ry / rl, rz / rl];
      const ux = direction[1] * right[2] - direction[2] * right[1];
      const uy = direction[2] * right[0] - direction[0] * right[2];
      const uz = direction[0] * right[1] - direction[1] * right[0];

      const sp = Math.sin(pitch);
      const cp = Math.cos(pitch);
      const dir = [
        direction[0] * cp + (right[0] * Math.cos(yaw) + ux * Math.sin(yaw)) * sp,
        direction[1] * cp + (right[1] * Math.cos(yaw) + uy * Math.sin(yaw)) * sp,
        direction[2] * cp + (right[2] * Math.cos(yaw) + uz * Math.sin(yaw)) * sp,
      ];
      const speed = rand(speedFrom, speedTo);
      const duration = rand(durationFrom, durationTo);

      this.particles.push({
        pos: [...position],
        vel: [dir[0] * speed, dir[1] * speed, dir[2] * speed],
        life: 0,
        duration,
        startSize: rand(startSizeFrom, startSizeTo),
        endSize: rand(endSizeFrom, endSizeTo),
        startColor,
        endColor,
        gravity,
        airResistance,
        texture,
        additive,
        angle: rand(0, Math.PI * 2),
        angleSpeed: rand(-30, 30) * (Math.PI / 180),
      });
    }
  }

  update(delay) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += delay;
      if (p.life >= p.duration) {
        this.particles.splice(i, 1);
        continue;
      }
      p.pos[0] += p.vel[0] * delay;
      p.pos[1] += p.vel[1] * delay;
      p.pos[2] += p.vel[2] * delay;
      p.vel[2] -= 9.8 * p.gravity * delay;
      const drag = Math.max(0, 1 - p.airResistance * delay * 4);
      p.vel[0] *= drag;
      p.vel[1] *= drag;
      p.vel[2] *= drag;
      p.angle += p.angleSpeed * delay;
      const t = p.life / p.duration;
      p.size = p.startSize + (p.endSize - p.startSize) * t;
      p.color = [
        p.startColor[0] + (p.endColor[0] - p.startColor[0]) * t,
        p.startColor[1] + (p.endColor[1] - p.startColor[1]) * t,
        p.startColor[2] + (p.endColor[2] - p.startColor[2]) * t,
        p.startColor[3] + (p.endColor[3] - p.startColor[3]) * t,
      ];
    }
  }

  visible() {
    return this.particles;
  }
}

export const EFFECTS = {
  rocketTrail(ps, position, teamID, teamMode) {
    const color = projectileTrailColor(teamID, teamMode, 0.75);
    const trailColor = [
      Math.min(1, color[0] * 1.6),
      Math.min(1, color[1] * 1.4 + 0.2),
      Math.min(1, color[2] * 0.7),
      0.95,
    ];
    ps.spawn({
      position, direction: [0, 0, 1], speedFrom: 0, speedTo: 0, pitchTo: 0,
      startSizeFrom: 0.18, startSizeTo: 0.18, endSizeFrom: 0.55, endSizeTo: 0.95,
      durationFrom: 0.35, durationTo: 0.35,
      startColor: trailColor,
      endColor: [...trailColor.slice(0, 3), 0],
      airResistance: 0, count: 1, texture: 'shotGlow', additive: true,
    });
    ps.spawn({
      position, direction: [0, 0, 1], speedFrom: 0, speedTo: 0, pitchTo: 0,
      startSizeFrom: 0.11, startSizeTo: 0.11, endSizeFrom: 0.25, endSizeTo: 0.4,
      durationFrom: 0.25, durationTo: 0.25,
      startColor: [trailColor[0], trailColor[1], trailColor[2], 0.25],
      endColor: [...trailColor.slice(0, 3), 0],
      airResistance: 0, count: 1, texture: 'smoke1',
    });
  },

  grenadeTrail(ps, position, teamID, teamMode) {
    const color = projectileTrailColor(teamID, teamMode, 0.25);
    ps.spawn({
      position, direction: [0, 0, 1], speedFrom: 0, speedTo: 0, pitchTo: 0,
      startSizeFrom: 0.125, startSizeTo: 0.125, endSizeFrom: 0.2, endSizeTo: 0.2,
      durationFrom: 2, durationTo: 2,
      startColor: color, endColor: [...color.slice(0, 3), 0],
      airResistance: 0, count: 1, texture: 'shotGlow', additive: true,
    });
  },

  molotovTrail(ps, position) {
    ps.spawn({
      position, direction: [0, 0, 1], speedFrom: 0.15, speedTo: 0.15, pitchTo: 0,
      startSizeFrom: 0.25, startSizeTo: 0.25, endSizeFrom: 0.025, endSizeTo: 0.025,
      durationFrom: 0.25, durationTo: 0.25,
      startColor: [1, 0.75, 0, 1], endColor: [1, 0.75, 0, 0],
      airResistance: 0, count: 1, texture: 'smoke1', additive: true,
    });
  },

  firingSmoke(ps, position, direction) {
    ps.spawn({
      position, direction,
      speedFrom: 1, speedTo: 2, pitchTo: 45,
      startSizeFrom: 0.05, startSizeTo: 0.25, endSizeFrom: 0.25, endSizeTo: 0.45,
      durationFrom: 0.5, durationTo: 2,
      startColor: [0.6, 0.6, 0.6, 0.5], endColor: [0.6, 0.6, 0.6, 0],
      count: 3, texture: 'smoke1',
    });
  },

  impact(ps, position, normal) {
    ps.spawn({
      position, direction: normal,
      speedFrom: 0.5, speedTo: 1.5, pitchTo: 60,
      startSizeFrom: 0.05, startSizeTo: 0.15, endSizeFrom: 0.15, endSizeTo: 0.3,
      durationFrom: 0.3, durationTo: 0.8,
      startColor: [1, 0.9, 0.7, 0.8], endColor: [0.5, 0.5, 0.5, 0],
      count: 4, texture: 'smoke2',
    });
  },

  blood(ps, position, normal, damage = 0.5) {
    const amount = Math.min(2, Math.max(0, damage));
    ps.spawn({
      position, direction: normal,
      speedFrom: amount, speedTo: amount * 2, pitchTo: 90,
      startSizeFrom: 0.25, startSizeTo: 0.25, endSizeFrom: 0.25, endSizeTo: 0.25,
      durationFrom: 2, durationTo: 2,
      startColor: [0.8, 0, 0, 0.9], endColor: [0.4, 0, 0, 0],
      gravity: 0.1, airResistance: 0,
      count: Math.floor(amount * 10), texture: `blood${String(Math.floor(rand(1, 11))).padStart(2, '0')}`,
    });
  },

  explosion(ps, position) {
    ps.spawn({
      position, direction: [0, 0, 1],
      speedFrom: 1, speedTo: 3, pitchTo: 80,
      startSizeFrom: 0.2, startSizeTo: 0.5, endSizeFrom: 0.5, endSizeTo: 1.0,
      durationFrom: 0.5, durationTo: 1.5,
      startColor: [1, 0.6, 0.1, 1], endColor: [0.3, 0.3, 0.3, 0],
      count: 12, texture: 'smoke1', additive: true,
    });
  },

  flameStream(ps, from, to, normal) {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    // Weapon.cpp's oldest FT renderer: two additive smoke1 particles at each
    // of 21 evenly spaced samples. The stream starts blue and tight, then
    // blooms toward a wide red/orange end with increasingly long persistence.
    const segments = 20;
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const size = 0.6 * (t * 0.5 + 0.5);
      const spread = 0.3 * t;
      const center = [from[0] + dx * t, from[1] + dy * t, from[2] + dz * t];
      const position = [
        center[0] + rand(-spread, spread),
        center[1] + rand(-spread, spread),
        center[2],
      ];
      const green = rand(0, t * 0.75);
      ps.spawn({
        position, direction: [normal[0], normal[1], 1 + normal[2]],
        speedFrom: 1, speedTo: 1, pitchTo: 0,
        startSizeFrom: size, startSizeTo: size, endSizeFrom: 0, endSizeTo: 0,
        durationFrom: t, durationTo: t,
        startColor: [t, green, 1 - t, 0],
        endColor: [t, t * 0.75, 1 - t, 1],
        airResistance: 0, count: 1, texture: 'smoke1', additive: true,
      });
      ps.spawn({
        position: [
          center[0] + rand(-spread, spread),
          center[1] + rand(-spread, spread),
          center[2],
        ],
        direction: [
          normal[0] + rand(-0.2, 0.2),
          normal[1] + rand(-0.2, 0.2),
          1 + normal[2],
        ],
        speedFrom: 1, speedTo: 1, pitchTo: 0,
        startSizeFrom: 0, startSizeTo: 0, endSizeFrom: size, endSizeTo: size,
        durationFrom: t, durationTo: t,
        startColor: [t, rand(0, t * 0.75), 1 - t, 1],
        endColor: [t, t * 0.75, 1 - t, 0],
        airResistance: 0, count: 1, texture: 'smoke1', additive: true,
      });
    }
  },

  knifeSlash(ps, position, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    const dir = [-Math.sin(rad), Math.cos(rad), 0];
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      ps.spawn({
        position: [
          position[0] + dir[0] * t * 0.8,
          position[1] + dir[1] * t * 0.8,
          0.2,
        ],
        direction: [dir[0], dir[1], 0.3],
        speedFrom: 0.5, speedTo: 1.5, pitchTo: 30,
        startSizeFrom: 0.08, startSizeTo: 0.12, endSizeFrom: 0.02, endSizeTo: 0.05,
        durationFrom: 0.15, durationTo: 0.35,
        startColor: [0.9, 0.95, 1, 0.9], endColor: [0.7, 0.8, 1, 0],
        count: 1, texture: 'shotGlow', additive: true,
      });
    }
  },
};

/** GameProjectile.cpp:404-435 — rising/fading smoke1 flame puffs. */
ParticleSystem.prototype.spawnGroundFlame = function spawnGroundFlame(position) {
  const ox = rand(-0.2, 0.2);
  const oy = rand(-0.2, 0.2);
  const green = rand(0, 0.75);
  this.spawn({
    position: [position[0] + ox, position[1] + oy, position[2] + 0.05],
    direction: [0, 0, 1],
    speedFrom: 1, speedTo: 1, pitchTo: 0,
    startSizeFrom: 0.3, startSizeTo: 0.3, endSizeFrom: 0, endSizeTo: 0,
    durationFrom: 1, durationTo: 1,
    startColor: [1, green, 0, 0], endColor: [1, 0.75, 0, 1],
    count: 1, texture: 'smoke1', additive: true,
  });
  this.spawn({
    position: [position[0] + rand(-0.2, 0.2), position[1] + rand(-0.2, 0.2), position[2] + 0.05],
    direction: [rand(-0.2, 0.2), rand(-0.2, 0.2), 1],
    speedFrom: 1, speedTo: 1, pitchTo: 0,
    startSizeFrom: 0, startSizeTo: 0, endSizeFrom: 0.3, endSizeTo: 0.3,
    durationFrom: 1, durationTo: 1,
    startColor: [1, rand(0, 0.75), 0, 1], endColor: [1, 0.75, 0, 0],
    count: 1, texture: 'smoke1', additive: true,
  });
};

/** GameProjectile.cpp:437-453 — grey smoke column every 10 ticks. */
ParticleSystem.prototype.spawnGroundFlameSmoke = function spawnGroundFlameSmoke(position) {
  this.spawn({
    position: [position[0], position[1], position[2] + 0.05],
    direction: [-0.5, 0, 0.5],
    speedFrom: 1, speedTo: 1, pitchTo: 0,
    startSizeFrom: 0.15, startSizeTo: 0.15, endSizeFrom: 1.0, endSizeTo: 1.0,
    durationFrom: 3, durationTo: 3,
    startColor: [0.5, 0.5, 0.5, 0.5], endColor: [0.5, 0.5, 0.5, 0],
    count: 1, texture: 'smoke1', additive: false,
  });
};
