import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
