import test from 'node:test';
import assert from 'node:assert/strict';
import { Audio3D } from '../public/src/audio/audio.js';

test('saved master volume survives deferred WebAudio creation', () => {
  const gain = { gain: { value: 1 }, connect() {} };
  globalThis.window = {
    AudioContext: class {
      constructor() { this.state = 'running'; }
      createGain() { return gain; }
      get destination() { return {}; }
    },
  };

  const audio = new Audio3D();
  audio.setMasterVolume(32 / 255);
  audio.resume();

  assert.equal(gain.gain.value, 32 / 255);
});
