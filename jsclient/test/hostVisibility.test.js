import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('operator-only hosting is absent from the JS client menu', async () => {
  const [html, menu] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/ui/menu2.js', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(html, /data-tab="host"|id="panel-host"/);
  assert.doesNotMatch(menu, /id:\s*'host'|_buildHostPanel|btnCopyHost|hostCommand/);
  assert.match(html, /data-tab="browser"/);
});
