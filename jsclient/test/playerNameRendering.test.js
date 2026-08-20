import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('overhead player names retain the original 28px size and offset without a shadow pass', async () => {
  const hud = await readFile(new URL('../public/src/ui/hud.js', import.meta.url), 'utf8');
  const method = hud.match(/renderPlayerNames\(game, scale\) \{([\s\S]*?)\n  \}\n\n  render\(game\)/)?.[1] ?? '';

  assert.match(method, /const fontSize = 28 \* scale;/);
  assert.match(method, /const offset = 28 \* scale;/);
  assert.equal((method.match(/this\.textCenter\(/g) ?? []).length, 1);
  assert.match(method, /this\.textCenter\(fontSize, x, y - offset, name, TEXT_COLORS\[9\]\);/);
});
