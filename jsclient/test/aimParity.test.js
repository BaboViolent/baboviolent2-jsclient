import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/src/game/game.js';
import { Player } from '../public/src/game/player.js';
import { Weapon } from '../public/src/game/weapon.js';
import { Renderer, projectWorldToScreen } from '../public/src/render/renderer.js';
import { WEAPON_SMG, WEAPON_SNIPER, WEAPON_DUAL_MACHINE_GUN, PLAYER_TEAM_SPECTATOR } from '../public/src/game/constants.js';

function fixture({ width = 1920, height = 1080, scale = 1 } = {}) {
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    gl: { canvas: { clientWidth: width, clientHeight: height, width: Math.floor(width * scale), height: Math.floor(height * scale) } },
    cameraFocus: [19, 20, 0.25], cameraHeight: 7, cameraShake: [0, 0],
  });
  const player = new Player();
  player.spawnAt([20, 20]);
  player.weapon = new Weapon(WEAPON_SMG);
  player.mousePosOnMap = [20, 20, 0];
  return Object.assign(Object.create(Game.prototype), {
    renderer, thisPlayer: player, map: { sizeX: 40, sizeY: 40 },
    input: { mouse: { x: width * 0.625, y: height * 0.37 } },
    ui: { playing: true, menuOpen: false, consoleActive: false, chatActive: false },
    specLookAt: [12, 14, 0], specZoom: 0,
  });
}

function close(actual, expected, tolerance = 0.001) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}

test('aim projects back to the cursor through the actual view during camera lag, shake, zoom and DPI scaling', () => {
  for (const size of [{ width: 800, height: 600, scale: 1 }, { width: 1920, height: 1080, scale: 2 }, { width: 1365, height: 767, scale: 0.75 }]) {
    const game = fixture(size);
    for (const zoom of [5, 7, 12]) {
      game.renderer.cameraHeight = zoom;
      game.renderer.cameraShake = [0.18, -0.12];
      game.updateAim();
      assert.equal(game.thisPlayer.mousePosOnMap[2], 0);
      const { mvp } = game.renderer.viewProjection(game.thisPlayer);
      const pixel = projectWorldToScreen(mvp, game.thisPlayer.mousePosOnMap, size.width, size.height);
      close(pixel[0], game.input.mouse.x);
      close(pixel[1], game.input.mouse.y);
    }
  }
});

test('moving while tracking a target does not displace the world point under the cursor', () => {
  const game = fixture();
  const target = [22, 21, 0];
  for (let frame = 0; frame < 60; frame++) {
    game.thisPlayer.currentCF.position[0] += 0.03;
    game.updateCamera(1 / 60);
    const { mvp } = game.renderer.viewProjection(game.thisPlayer);
    const cursor = projectWorldToScreen(mvp, target, 1920, 1080);
    game.input.mouse = { x: cursor[0], y: cursor[1] };
    game.updateAim();
    game.thisPlayer.mousePosOnMap.forEach((value, axis) => close(value, target[axis]));
  }
});

test('camera eases toward the native 5:4 blend of body and aim', () => {
  const game = fixture();
  game.renderer.cameraFocus = [20, 20, 0.25];
  game.thisPlayer.mousePosOnMap = [29, 11, 0];
  game.updateCamera(0.1);
  close(game.renderer.cameraFocus[0], 21);
  close(game.renderer.cameraFocus[1], 19);
  close(game.renderer.cameraFocus[2], 0.25 + (5 * 0.25 / 9 - 0.25) * 0.25);
});

test('ordinary weapons respect map margins while sniper look-ahead reaches the edge', () => {
  for (const weaponID of [WEAPON_SMG, WEAPON_SNIPER]) {
    const game = fixture();
    game.thisPlayer.weapon = new Weapon(weaponID);
    game.thisPlayer.currentCF.position = [1, 1, 0.25];
    game.thisPlayer.mousePosOnMap = [-8, -8, 0];
    game.updateCamera(0.4);
    assert.deepEqual(game.renderer.cameraFocus.slice(0, 2), weaponID === WEAPON_SNIPER ? [0, -1] : [5, 4]);
    close(game.renderer.cameraHeight, weaponID === WEAPON_SNIPER ? 12 : 7);
  }
});

test('small maps center the ordinary camera and spectators retain their free camera', () => {
  const game = fixture();
  game.map = { sizeX: 6, sizeY: 6 };
  game.updateCamera(0.4);
  assert.deepEqual(game.renderer.cameraFocus.slice(0, 2), [3, 3]);
  game.thisPlayer.teamID = PLAYER_TEAM_SPECTATOR;
  game.specZoom = 3;
  game.updateCamera(0.4);
  assert.deepEqual(game.renderer.cameraFocus, game.specLookAt);
  close(game.renderer.cameraHeight, 17);
});

test('menu cursor motion and a zero-size canvas preserve gameplay aim', () => {
  const game = fixture();
  const initial = [...game.thisPlayer.mousePosOnMap];
  game.ui.menuOpen = true;
  game.updateAim();
  assert.deepEqual(game.thisPlayer.mousePosOnMap, initial);
  game.ui.menuOpen = false;
  game.renderer.gl.canvas.clientWidth = 0;
  game.updateAim();
  assert.deepEqual(game.thisPlayer.mousePosOnMap, initial);
});

test('spawn discards the previous life aim before camera tracking resumes', () => {
  const game = fixture();
  game.thisPlayer.mousePosOnMap = [-100, -100, 0];
  game.snapCameraToSpawn([20, 20]);
  game.updateCamera(1 / 60);
  assert.deepEqual(game.renderer.cameraFocus.slice(0, 2), [20, 20]);
});

function armedPlayer(weaponID = WEAPON_SMG) {
  const player = new Player();
  player.spawnAt([10, 10]);
  player.weapon = new Weapon(weaponID);
  player.weapon.nuzzles = [{ position: [40, 60, 50] }];
  return player;
}

test('precise cursor compensates for an offset muzzle when aiming at a distant target', () => {
  const player = armedPlayer();
  player.mousePosOnMap = [10, 20, 0];
  player.aimAndRoll();
  assert.ok(player.currentCF.angle > 0, 'must turn left to compensate for a muzzle on the right');
  // Native uses the preceding angle to locate the muzzle; verify its stable
  // result sends the muzzle ray through the target, rather than parallel to it.
  for (let i = 0; i < 20; i++) player.aimAndRoll();
  const muzzle = player.weapon.muzzleWorld(player);
  const angle = player.currentCF.angle * Math.PI / 180;
  const dx = player.mousePosOnMap[0] - muzzle[0];
  const dy = player.mousePosOnMap[1] - muzzle[1];
  close(dx * Math.cos(angle) + dy * Math.sin(angle), 0, 1e-7);
});

test('close targets, dual guns and missing muzzle models keep body-centered aim', () => {
  for (const mode of ['close', 'dual', 'unloaded']) {
    const player = armedPlayer(mode === 'dual' ? WEAPON_DUAL_MACHINE_GUN : WEAPON_SMG);
    if (mode === 'unloaded') player.weapon.nuzzles = [];
    player.mousePosOnMap = [10, mode === 'close' ? 11 : 20, 0];
    player.aimAndRoll();
    close(player.currentCF.angle, 0);
  }
});
