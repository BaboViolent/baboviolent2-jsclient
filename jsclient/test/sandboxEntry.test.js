import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('sandbox URL starts local play and M opens an instant map picker', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/main.js', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /id="sandboxMapPicker"/);
  assert.match(main, /get\('mode'\) === 'sandbox'/);
  assert.match(main, /document\.getElementById\('loading'\)\.hidden = true/);
  assert.match(main, /game\.musicEnabled = !sandboxEntry/);
  assert.match(main, /if \(sandboxEntry\) \{\s*await startLocalPlay\(\)/);
  assert.match(main, /consumePress\('KeyM'\).*setSandboxMapPicker/);
  assert.match(main, /await switchMap\(mapBase\(name\)\)/);
});
