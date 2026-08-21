import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Escape menu displays the release version supplied by the server', async () => {
  const [html, main, server, dockerfile, workflow] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../server.js', import.meta.url), 'utf8'),
    readFile(new URL('../../Dockerfile', import.meta.url), 'utf8'),
    readFile(new URL('../../.github/workflows/ci-cd.yml', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /id="igClientVersion"/);
  assert.match(main, /fetch\('\/api\/version'\)/);
  assert.match(server, /CLIENT_VERSION/);
  assert.match(server, /url === '\/api\/version'/);
  assert.match(dockerfile, /ARG CLIENT_VERSION=development/);
  assert.match(workflow, /CLIENT_VERSION=\$\{\{ github\.ref_name \}\}/);
});
