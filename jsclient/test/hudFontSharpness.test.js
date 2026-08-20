import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('large native HUD bitmap text uses crisp nearest-neighbor sampling', async () => {
  const hud = await readFile(new URL('../public/src/ui/hud.js', import.meta.url), 'utf8');

  assert.match(hud, /loadTexture\('main\/fonts\/babo\.tga',[\s\S]*nearest: true/);
  assert.match(hud, /textCenter\(64 \* sx,[\s\S]*`Spawn in/);
});
