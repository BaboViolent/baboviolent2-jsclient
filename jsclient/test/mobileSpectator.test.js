import test from 'node:test';
import assert from 'node:assert/strict';
import { isMobileSpectatorDevice, touchGestureDelta } from '../public/src/mobile.js';

test('touch phones and tablets use spectator-only mobile controls', () => {
  assert.equal(isMobileSpectatorDevice({ maxTouchPoints: 5, coarsePointer: true, width: 1280 }), true);
  assert.equal(isMobileSpectatorDevice({ maxTouchPoints: 1, coarsePointer: false, width: 800 }), true);
});

test('desktop and narrow non-touch windows retain normal team controls', () => {
  assert.equal(isMobileSpectatorDevice({ maxTouchPoints: 0, coarsePointer: true, width: 390 }), false);
  assert.equal(isMobileSpectatorDevice({ maxTouchPoints: 0, coarsePointer: false, width: 800 }), false);
});

test('one-finger drag pans by the gesture delta', () => {
  assert.deepEqual(touchGestureDelta([{ x: 20, y: 30 }], [{ x: 55, y: 12 }]), {
    panX: 35,
    panY: -18,
    zoom: 0,
  });
});

test('two-finger pinch produces continuous zoom without panning its center', () => {
  const gesture = touchGestureDelta(
    [{ x: 40, y: 50 }, { x: 80, y: 50 }],
    [{ x: 30, y: 50 }, { x: 90, y: 50 }],
  );
  assert.equal(gesture.panX, 0);
  assert.equal(gesture.panY, 0);
  assert.equal(gesture.zoom, -2);
});

test('mobile UI provides Android send semantics and a scoreboard toggle', async () => {
  const { readFile } = await import('node:fs/promises');
  const [html, main, input] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/src/input.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="mobileScoreboard"/);
  assert.match(html, /enterkeyhint="send"/);
  assert.match(main, /insertLineBreak.*insertParagraph/);
  assert.match(main, /e\.key === 'Enter'/);
  assert.match(input, /this\.keys\.has\('Tab'\) \|\| this\.mobileScoreboard/);
});
