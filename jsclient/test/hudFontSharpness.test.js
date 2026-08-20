import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('status labels use a high-DPI browser vector overlay instead of bitmap glyphs', async () => {
  const hud = await readFile(new URL('../public/src/ui/hud.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');

  assert.match(html, /id="spawnStatusText"/);
  assert.match(html, /id="spectatorStatusText"/);
  assert.match(css, /\.status-text-overlay[\s\S]*font-family: "Arial Black"/);
  assert.match(hud, /spawn\.textContent = `Spawn in \$\{formatCountdown\(wait\)\}`/);
  assert.match(hud, /spectator\.textContent = 'SPECTATOR — move keys to fly, wheel to zoom'/);
  assert.doesNotMatch(hud, /this\.textCenter\([^\n]*'SPECTATOR/);
});
