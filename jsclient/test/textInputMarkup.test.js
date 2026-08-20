import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeBv2Text } from '../public/src/ui/colorInput.js';

test('game text capture opts out of password-manager overlays', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const input = html.match(/<input id="textInput"[\s\S]*?>/)?.[0] ?? '';

  for (const marker of [
    'autocomplete="off"',
    'data-1p-ignore',
    'data-bwignore',
    'data-lpignore="true"',
    'data-form-type="other"',
    'data-protonpass-ignore="true"',
    'data-keeper-ignore="true"',
  ]) {
    assert.ok(input.includes(marker), `missing ${marker}`);
  }
});

test('in-game input normalizes live color markup and extended Babo glyphs', () => {
  assert.equal(normalizeBv2Text('white^1blue^4red'), `white\x01blue\x04red`);
  assert.equal(normalizeBv2Text('ø'), String.fromCharCode(155));
  assert.equal(normalizeBv2Text(String.fromCharCode(155)), String.fromCharCode(155));
});

test('focused game input accumulates Alt-numpad codes before rendering', async () => {
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');

  assert.match(main, /let textInputAltValue = -2/);
  assert.match(main, /\^\(\?:Digit\|Numpad\)\(\\d\)\$/);
  assert.match(main, /String\.fromCharCode\(code\)/);
  assert.match(main, /game\.ui\.inputBuffer = normalized/);
});
