import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('in-game menu exposes no game-mode mutation controls', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/main.js', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(html, /data-gametype|igExploreModes/);
  assert.doesNotMatch(main, /querySelectorAll\('\[data-gametype\]'\)/);
});

test('in-game choices use spacious desktop-scale controls', async () => {
  const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.match(css, /height:\s*clamp\(46px, 5\.8vh, 64px\)/);
  assert.match(css, /font-size:\s*clamp\(19px, 1\.7vw, 27px\)/);
  assert.match(css, /max-width:\s*1280px/);
});
