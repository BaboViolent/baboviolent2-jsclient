// WebAudio wrapper standing in for dks* (dksCreateSoundFromFile / dksPlay3DSound /
// dksPlayMusic). 3D rolloff matches FMOD inverse distance with min = range,
// max = 10000 (dksPlay3DSound in src/Engine/Zeven/dks/dks.cpp:569).
import { CONTENT_ROOT, WEATHER_AMBIENCE } from '../game/constants.js';

const MAX_3D_DIST = 10000;

/** FMOD_3D_INVERSEROLLOFF with rolloff factor 1. */
function fmodAttenuation(dist, minDist) {
  if (dist <= minDist) return 1;
  if (dist >= MAX_3D_DIST) return 0;
  return minDist / dist;
}

export class Audio3D {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.listener = [0, 0, 0];
    this.masterGain = null;
    /** @type {Map<string, { file: string, volume: number, gen: number, source?: AudioBufferSourceNode, gain?: GainNode }>} */
    this.loops = new Map();
    this._loopGen = 0;
  }

  /** Browsers require a user gesture before audio can start. */
  resume() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.6;
      this.masterGain.connect(this.ctx.destination);
      for (const loop of this.loops.values()) {
        if (!loop.source) void this.startLoop(loop.file, loop.volume, loop);
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  async load(file) {
    if (this.buffers.has(file)) return this.buffers.get(file);
    const promise = (async () => {
      const res = await fetch(`${CONTENT_ROOT}/main/sounds/${file}`);
      if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
      this.resume();
      return this.ctx.decodeAudioData(await res.arrayBuffer());
    })();
    this.buffers.set(file, promise);
    return promise;
  }

  setListener(position) {
    this.listener = position;
  }

  setMasterVolume(v) {
    if (this.masterGain) this.masterGain.gain.value = v;
  }

  stopLoop(key) {
    const loop = this.loops.get(key);
    if (!loop?.source) return;
    try {
      loop.source.stop();
    } catch {
      /* already stopped */
    }
    loop.source.disconnect();
    loop.gain?.disconnect();
    loop.source = null;
    loop.gain = null;
  }

  async startLoop(file, volume, store) {
    if (!this.ctx) return;
    const gen = store.gen;
    let buffer;
    try {
      buffer = await this.load(file);
    } catch {
      return;
    }
    if (store.gen !== gen || this.loops.get(store.key)?.gen !== gen) {
      return;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = volume / 255;
    source.connect(gain).connect(this.masterGain);
    source.start();
    if (store.gen !== gen) {
      try { source.stop(); } catch { /* ignore */ }
      return;
    }
    store.source = source;
    store.gain = gain;
  }

  /** Game.cpp:295 — Music.ogg at volume 60. */
  playMusic(file = 'Music.ogg', volume = 60) {
    this.stopLoop('music');
    const gen = ++this._loopGen;
    const entry = { key: 'music', file, volume, gen, source: null, gain: null };
    this.loops.set('music', entry);
    void this.startLoop(file, volume, entry);
  }

  stopMusic() {
    this.stopLoop('music');
    this.loops.delete('music');
    ++this._loopGen;
  }

  /** Looping 2D ambience per weather (CRain/CLava in src/Weather/). */
  setMapAmbience(weather) {
    this.stopLoop('ambience');
    this.loops.delete('ambience');
    const cfg = WEATHER_AMBIENCE[weather];
    if (!cfg) return;
    const gen = ++this._loopGen;
    const entry = { key: 'ambience', file: cfg.file, volume: cfg.volume, gen, source: null, gain: null };
    this.loops.set('ambience', entry);
    void this.startLoop(cfg.file, cfg.volume, entry);
  }

  async play3D(file, position, { range = 5, volume = 255, loop = false } = {}) {
    if (!this.ctx) return null;
    let buffer;
    try {
      buffer = await this.load(file);
    } catch {
      return null;
    }
    const dist = Math.hypot(
      position[0] - this.listener[0],
      position[1] - this.listener[1],
      position[2] - this.listener[2],
    );
    const attenuation = fmodAttenuation(dist, range);
    if (attenuation <= 0) return null;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    const gain = this.ctx.createGain();
    gain.gain.value = (volume / 255) * attenuation;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, (position[0] - this.listener[0]) / Math.max(range * 2, 0.01)));
    source.connect(gain).connect(pan).connect(this.masterGain);
    source.start();
    return source;
  }

  /** GameSpawn.cpp:422 — random ric1..5 on wall impact. */
  playImpact(position) {
    const idx = 1 + Math.floor(Math.random() * 5);
    return this.play3D(`ric${idx}.wav`, position, { range: 2, volume: 150 });
  }

  /** Player.cpp:986/1061 — attacker hit confirm (Client.cpp: sfxHit = Hit.wav). */
  async play2D(file, volume = 255, startDelaySec = 0) {
    if (!this.ctx) return null;
    let buffer;
    try {
      buffer = await this.load(file);
    } catch {
      return null;
    }
    const when = this.ctx.currentTime + Math.max(0, startDelaySec);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume / 255;
    source.connect(gain).connect(this.masterGain);
    source.start(when);
    return source;
  }

  /** Player.cpp:1050 — random hit1..2 at the victim. */
  playHit(position) {
    const idx = 1 + Math.floor(Math.random() * 2);
    return this.play3D(`hit${idx}.wav`, position, { range: 5, volume: 255 });
  }
}
