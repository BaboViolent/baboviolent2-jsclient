import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { NATIVE_INTRO_DURATION_MS } from '../public/src/ui/menu2.js';

test('browser intro retains the active native RnDLabs sequence', async () => {
  const [html, css, menu] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/style.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/ui/menu2.js', import.meta.url), 'utf8'),
  ]);

  assert.equal(NATIVE_INTRO_DURATION_MS, 3000);
  assert.match(html, /<canvas id="introLogo"/);
  const introMarkup = html.match(/<div id="intro"[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.doesNotMatch(introMarkup, /BaboViolent|Click or press/);
  assert.match(menu, /loadImage\('main\/textures\/RnDLabs\.tga'\)/);
  assert.match(css, /0%\s*{ opacity: 0; }/);
  assert.match(css, /33\.333%\s*{ opacity: 1; }/);
  assert.match(css, /66\.667%\s*{ opacity: 1; }/);
  assert.match(css, /100%\s*{ opacity: 0; }/);
});
