import test from 'node:test';
import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};

const { ClientSettings, DEFAULT_SETTINGS } = await import('../public/src/ui/settings.js');

test('client settings persist audio and key bindings', () => {
  values.clear();
  const first = new ClientSettings();
  first.data.musicVolume = 42;
  first.data.bindings.melee = 'KeyQ';
  first.save();

  const restored = new ClientSettings();
  assert.equal(restored.data.musicVolume, 42);
  assert.equal(restored.data.bindings.melee, 'KeyQ');
  assert.equal(restored.data.bindings.moveUp, DEFAULT_SETTINGS.bindings.moveUp);
});

test('older settings inherit newly introduced bindings', () => {
  values.set('bv2-client-settings', JSON.stringify({ playerName: 'Legacy', bindings: { pickup: 'KeyE' } }));
  const restored = new ClientSettings();
  assert.equal(restored.data.playerName, 'Legacy');
  assert.equal(restored.data.bindings.pickup, 'KeyE');
  assert.equal(restored.data.bindings.moveLeft, 'KeyA');
});

test('new hosted games default to fifteen minutes', () => {
  assert.equal(DEFAULT_SETTINGS.host.timeLimitMinutes, 15);
});
