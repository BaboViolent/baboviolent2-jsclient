import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('profile name has dedicated readable label and bitmap input sizing', async () => {
  const [menu, css, input] = await Promise.all([
    readFile(new URL('../public/src/ui/menu2.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/style.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/ui/colorInput.js', import.meta.url), 'utf8'),
  ]);

  assert.match(menu, /profile-name-row/);
  assert.match(menu, /profile-name-label/);
  assert.match(css, /\.profile-name-label[\s\S]*?font-size:\s*clamp\(24px, 2vw, 32px\)/);
  assert.match(css, /profile-name-row \.menu-edit-wrap[\s\S]*?font-size:\s*clamp\(24px, 2vw, 32px\)/);
  assert.match(css, /height:\s*clamp\(52px, 6vh, 66px\)/);
  assert.match(input, /getComputedStyle\(wrap\)\.fontSize/);
  assert.match(input, /new ResizeObserver\(\(\) => render\(\)\)/);
  assert.match(input, /resizeObserver\.observe\(wrap\)/);
  assert.doesNotMatch(input, /getPropertyValue\('--bv2-input-font-size'\)/);
});

test('browser menu has no quit-tab control', async () => {
  const [html, menu, main] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/ui/menu2.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/main.js', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(html, /id="btnQuit"/);
  assert.doesNotMatch(menu, /btnQuit|onQuit/);
  assert.doesNotMatch(main, /menu2\.onQuit|window\.close\(\)/);
});
