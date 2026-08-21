import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('KOTH is a fifth team game type with authoritative hill state', async () => {
  const constants = await readFile(new URL('../public/src/game/constants.js', import.meta.url), 'utf8');
  const protocol = await readFile(new URL('../public/src/net/protocol.js', import.meta.url), 'utf8');
  const main = await readFile(new URL('../public/src/main.js', import.meta.url), 'utf8');
  const hud = await readFile(new URL('../public/src/ui/hud.js', import.meta.url), 'utf8');

  assert.match(constants, /GAME_TYPE_KOTH = 4/);
  assert.match(constants, /'King of the Hill'/);
  assert.match(protocol, /SVCL_KOTH_STATE: 136/);
  assert.match(main, /case NET\.SVCL_KOTH_STATE/);
  assert.match(hud, /'HILL CONTESTED'/);
  assert.match(hud, /const isTeamScore = isTDM \|\| isKOTH/);
});
