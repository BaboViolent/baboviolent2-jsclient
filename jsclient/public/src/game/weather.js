import {
  WEATHER_NONE, WEATHER_FOG, WEATHER_SNOW, WEATHER_RAIN,
  WEATHER_SANDSTORM, WEATHER_LAVA,
} from './constants.js';

export const WEATHER_VISUALS = {
  [WEATHER_NONE]: null,
  [WEATHER_FOG]: null,
  [WEATHER_SNOW]: { rate: 32, texture: 'smoke1', color: [1, 1, 1, 0.8], size: [0.04, 0.12], speed: [0.4, 1.0] },
  [WEATHER_RAIN]: { rate: 55, texture: 'glow', color: [0.55, 0.7, 0.8, 0.55], size: [0.025, 0.06], speed: [5, 8] },
  [WEATHER_SANDSTORM]: { rate: 20, texture: 'smoke1', color: [0.75, 0.58, 0.3, 0.25], size: [0.2, 0.5], speed: [1, 2.5] },
  [WEATHER_LAVA]: { rate: 12, texture: 'glow', color: [1, 0.28, 0.02, 0.65], size: [0.05, 0.18], speed: [0.3, 1.2] },
};

export class WeatherSystem {
  constructor() {
    this.weather = WEATHER_NONE;
    this.emission = 0;
  }

  reset(weather) {
    this.weather = weather;
    this.emission = 0;
  }

  update(delay, focus, particles) {
    const cfg = WEATHER_VISUALS[this.weather];
    if (!cfg) return;
    this.emission += delay * cfg.rate;
    const count = Math.min(16, Math.floor(this.emission));
    if (!count) return;
    this.emission -= count;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * 10;
      const position = [focus[0] + Math.cos(angle) * radius, focus[1] + Math.sin(angle) * radius, 3 + Math.random() * 5];
      const isLava = this.weather === WEATHER_LAVA;
      if (isLava) position[2] = 0.05;
      particles.spawn({
        position,
        direction: isLava ? [0, 0, 1] : [0.15, -0.1, -1],
        speedFrom: cfg.speed[0], speedTo: cfg.speed[1], pitchTo: isLava ? 35 : 5,
        startSizeFrom: cfg.size[0], startSizeTo: cfg.size[1],
        endSizeFrom: cfg.size[0], endSizeTo: cfg.size[1] * (isLava ? 1.8 : 1),
        durationFrom: isLava ? 0.5 : 0.8, durationTo: isLava ? 1.4 : 1.8,
        startColor: cfg.color, endColor: [...cfg.color.slice(0, 3), 0],
        gravity: isLava ? 0.15 : 0, airResistance: 0,
        count: 1, texture: cfg.texture, additive: isLava,
      });
    }
  }
}
