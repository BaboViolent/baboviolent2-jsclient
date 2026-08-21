import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('public branding and share metadata use BaboViolent', async () => {
  const [html, menu] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/ui/menu2.js', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /<title>Play BaboViolent \|/);
  assert.match(html, /property="og:title" content="Play BaboViolent Online"/);
  assert.match(html, /name="twitter:title" content="Play BaboViolent Online"/);
  assert.match(html, /<p class="boot-title">BaboViolent<\/p>/);
  assert.doesNotMatch(`${html}\n${menu}`, /BaboViolent 2|Babo Violent/);
});
