import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('network explosions leave projectile retirement to exact delete packets', async () => {
  const game = await readFile(new URL('../public/src/game/game.js', import.meta.url), 'utf8');
  const explosionBranch = game.slice(
    game.indexOf('if (explosion.fromNetwork)'),
    game.indexOf('EFFECTS.explosion', game.indexOf('if (explosion.fromNetwork)')),
  );

  assert.doesNotMatch(explosionBranch, /proj\.dead\s*=\s*true/);
  assert.match(game, /deleteNetProjectile\(uniqueID\)[\s\S]*projectile\.dead = true/);
});
