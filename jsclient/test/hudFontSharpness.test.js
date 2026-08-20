import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { vectorStatusVisibility } from '../public/src/ui/hud.js';
import { PLAYER_STATUS_DEAD } from '../public/src/game/constants.js';

test('status labels use a high-DPI browser vector overlay instead of bitmap glyphs', async () => {
  const hud = await readFile(new URL('../public/src/ui/hud.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');

  assert.match(html, /id="spawnStatusText"/);
  assert.match(html, /id="spectatorStatusText"/);
  assert.match(css, /\.status-text-overlay[\s\S]*font-family: Tahoma, Verdana, sans-serif/);
  assert.match(hud, /spawn\.textContent = `Spawn in \$\{formatCountdown\(wait\)\}`/);
  assert.match(html, /<strong>SPECTATOR<\/strong><span>move keys to fly, wheel to zoom<\/span>/);
  assert.doesNotMatch(hud, /this\.textCenter\([^\n]*'SPECTATOR/);
});

test('Tab scoreboard suppresses both vector status labels', () => {
  const base = {
    ui: { menuOpen: false, showScoreboard: false },
    editorMode: false,
    isSpectating: false,
    thisPlayer: { status: PLAYER_STATUS_DEAD, life: 0, timeToSpawn: 5 },
  };
  assert.deepEqual(vectorStatusVisibility(base), { spawn: true, spectator: false });
  assert.deepEqual(
    vectorStatusVisibility({ ...base, isSpectating: true }),
    { spawn: false, spectator: true },
  );
  assert.deepEqual(
    vectorStatusVisibility({ ...base, ui: { ...base.ui, showScoreboard: true } }),
    { spawn: false, spectator: false },
  );
  assert.deepEqual(
    vectorStatusVisibility({ ...base, isSpectating: true, ui: { ...base.ui, showScoreboard: true } }),
    { spawn: false, spectator: false },
  );
});
