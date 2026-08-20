// Screen-space overlay: bitmap text, health bar, minimap, scoreboard, chat, console.
// Stands in for src/Game/ClientRender.cpp and Console.cpp HUD layers.
import { createProgram, createTexture } from '../render/gl.js';
import { BitmapFont, stripColorCodes } from './font.js';
import { parseColorRuns, TEXT_COLORS } from './colors.js';
import { formatCountdown } from './timeFormat.js';
import { minimapPoint, visibleMinimapFlags, visibleMinimapPlayers } from './minimap.js';
import {
  WEAPON_SNIPER, WEAPON_SHOTGUN, WEAPON_CHAIN_GUN, WEAPON_GRENADE,
  WEAPON_COCKTAIL_MOLOTOV, WEAPONS, SV_ENABLE_SHOTGUN_RELOAD,
  GAME_TYPE_CTF, GAME_TYPE_TDM, GAME_TYPE_DM, GAME_TYPE_SND, SV_WIN_LIMIT,
  PLAYER_TEAM_BLUE, PLAYER_TEAM_RED, PLAYER_TEAM_SPECTATOR, PLAYER_STATUS_ALIVE, PLAYER_STATUS_DEAD,
  GAME_BLUE_WIN, GAME_RED_WIN, GAME_DRAW, GAME_PLAYING,
} from '../game/constants.js';

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aUV;
uniform vec2 uViewport;
out vec2 vUV;
void main() {
  vUV = aUV;
  vec2 ndc = vec2(aPos.x / uViewport.x * 2.0 - 1.0, 1.0 - aPos.y / uViewport.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

/** Scoreboard occupies the right half of 800×600 (renderStats panel). */
const SCOREBOARD_X = 400;

/** Native scoreboard columns — left edges for headers, centers for stat values. */
const SCORE_COLS = {
  nameL: 408,
  killsL: 532,
  deathsL: 594,
  damageL: 656,
  returnsL: 714,
  capsL: 752,
  pingL: 772,
  killsC: 561,
  deathsC: 623,
  damageC: 685,
  returnsC: 733,
  capsC: 766,
  pingC: 786,
  scoreC: 733,
  scoreL: 714,
  seps: [528, 590, 652, 710, 748, 768],
};

export function compareScoreboardPlayers(a, b) {
  return (b.kills ?? 0) - (a.kills ?? 0)
    || (b.score ?? 0) - (a.score ?? 0)
    || (a.deaths ?? 0) - (b.deaths ?? 0)
    || (a.id ?? a.playerID ?? 0) - (b.id ?? b.playerID ?? 0);
}

const SCORE_ROW_H = 22;
const SCORE_FONT = 16;

/** Top-left HUD — smaller than raw 64×64 ortho (crisp on modern displays). */
const HUD_TIMER_FONT = 48;
const HUD_FLAG_ICON = 28;
const HUD_FLAG_SCORE_FONT = 36;
const HUD_MINIMAP_SIZE = 128;

const FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec4 uColor;
uniform float uUseTex;
out vec4 fragColor;
void main() {
  vec4 c = uUseTex > 0.5 ? texture(uTex, vUV) * uColor : uColor;
  if (c.a < 0.01) discard;
  fragColor = c;
}`;

/** GameVar.cpp:1091 — circular sniper scope mask (256×256). */
function buildSniperScopeTexture(gl) {
  const w = 256;
  const h = 256;
  const pixels = new Uint8Array(w * h * 4);
  const w2 = w / 2;
  const h2 = h / 2;
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    const dist = Math.hypot(w2 - x, h2 - y);
    const a = dist < 118 && x !== w2 && y !== h2 ? 0 : 255;
    const o = i * 4;
    pixels[o] = 0;
    pixels[o + 1] = 0;
    pixels[o + 2] = 0;
    pixels[o + 3] = a;
  }
  return createTexture(gl, { width: w, height: h, pixels }, { repeat: false, mipmap: false });
}

export class Hud {
  constructor(gl, assets) {
    this.gl = gl;
    this.assets = assets;
    this.program = createProgram(gl, VS, FS);
    this.uniforms = {
      viewport: gl.getUniformLocation(this.program, 'uViewport'),
      tex: gl.getUniformLocation(this.program, 'uTex'),
      color: gl.getUniformLocation(this.program, 'uColor'),
      useTex: gl.getUniformLocation(this.program, 'uUseTex'),
    };
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, 4 * 4 * 6 * 4096, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
    this.font = null;
    this.minimap = null;
    this.sniperScope = null;
    this.icons = {};
  }

  /** Map native 800×600 HUD coordinates to canvas pixels. */
  refScale(gl) {
    return { sx: gl.canvas.width / 800, sy: gl.canvas.height / 600 };
  }

  async load() {
    const image = await this.assets.loadImage('main/fonts/babo.tga');
    this.font = new BitmapFont(image);
    this.fontTexture = await this.assets.loadTexture('main/fonts/babo.tga', { repeat: false, mipmap: false });
    this.sniperScope = buildSniperScopeTexture(this.gl);
    const iconFiles = {
      cartridge: 'CartridgeIcon', grenade: 'GrenadeIcon', molotov: 'molotovIcon',
      blueFlag: 'BlueFlag', redFlag: 'RedFlag',
    };
    await Promise.all(Object.entries(iconFiles).map(async ([key, file]) => {
      try {
        this.icons[key] = await this.assets.loadTexture(
          `main/textures/${file}.tga`,
          { repeat: false, mipmap: false, nearest: true },
        );
      } catch {
        this.icons[key] = null;
      }
    }));
  }

  buildMinimap(map) {
    // Map.cpp regenTex — one texel per map cell, white walls on black.
    const tw = map.sizeX;
    const th = map.sizeY;
    const pixels = new Uint8Array(tw * th * 4);
    for (let y = 0; y < map.sizeY; y++) {
      for (let x = 0; x < map.sizeX; x++) {
        const solid = !map.isPassable(x, y);
        const v = solid ? 255 : 0;
        const dst = ((map.sizeY - 1 - y) * tw + x) * 4;
        pixels[dst] = v;
        pixels[dst + 1] = v;
        pixels[dst + 2] = v;
        pixels[dst + 3] = 255;
      }
    }
    this.minimap = createTexture(
      this.gl,
      { width: tw, height: th, pixels },
      { repeat: false, mipmap: false, nearest: true },
    );
    this.minimapSize = [tw, th];
    this.minimapMapSize = [map.sizeX, map.sizeY];
  }

  begin() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.viewport, gl.canvas.width, gl.canvas.height);
    gl.uniform1i(this.uniforms.tex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  end() {
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
  }

  submit(vertices, color, texture) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(vertices));
    gl.uniform4fv(this.uniforms.color, color);
    gl.uniform1f(this.uniforms.useTex, texture ? 1 : 0);
    if (texture) gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 4);
  }

  rect(x, y, w, h, color, texture = null) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rw = Math.round(w);
    const rh = Math.round(h);
    this.submit([
      rx, ry, 0, 0,
      rx, ry + rh, 0, 1,
      rx + rw, ry + rh, 1, 1,
      rx, ry, 0, 0,
      rx + rw, ry + rh, 1, 1,
      rx + rw, ry, 1, 0,
    ], color, texture);
  }

  /** Pixel-art quads — force nearest sampling so HUD icons/minimap stay crisp. */
  rectNearest(x, y, w, h, color, texture) {
    if (texture) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    }
    this.rect(x, y, w, h, color, texture);
  }

  text(size, x, y, str, color = TEXT_COLORS[9]) {
    if (!this.font) return;
    const runs = typeof str === 'string' ? parseColorRuns(str, color) : [{ text: str, color }];
    let penX = x;
    for (const run of runs) {
      const verts = this.font.layout(size, penX, y, run.text);
      if (verts.length) this.submit(verts, run.color, this.fontTexture);
      penX += this.font.width(size, stripColorCodes(run.text));
    }
  }

  textCenter(size, cx, y, str, color = TEXT_COLORS[9]) {
    const w = this.textWidth(size, typeof str === 'string' ? str : String(str));
    this.text(size, cx - w / 2, y, str, color);
  }

  textRight(size, rightX, y, str, color = TEXT_COLORS[9]) {
    const w = this.textWidth(size, typeof str === 'string' ? str : String(str));
    this.text(size, rightX - w, y, str, color);
  }

  textWidth(size, str) {
    return this.font ? this.font.width(size, stripColorCodes(str)) : 0;
  }

  renderScreenHit(player, scale) {
    const hit = player.screenHit ?? 0;
    if (hit <= 0) return;
    const gl = this.gl;
    const a = Math.min(1, hit * 3);
    this.rect(0, 0, gl.canvas.width, gl.canvas.height, [1, 0.2, 0.15, a * 0.35]);
  }

  /** Full-screen overlay when local player is dead (online respawn wait). */
  renderDeathOverlay(player, scale) {
    if (player.status !== PLAYER_STATUS_DEAD || player.life > 0) return;
    const gl = this.gl;
    const w = gl.canvas.width;
    const h = gl.canvas.height;
    const { sx, sy } = this.refScale(gl);
    const wait = player.timeToSpawn ?? 0;
    if (wait > 0) {
      this.textCenter(64 * sx, w * 0.5, 200 * sy, `Spawn in ${formatCountdown(wait)}`, TEXT_COLORS[9]);
    } else {
      this.textCenter(32 * sx, w * 0.5, 200 * sy, 'Press [[Mouse1]] to respawn', TEXT_COLORS[9]);
    }
  }

  renderMatchResult(game) {
    if (game.roundState === GAME_PLAYING) return;
    const gl = this.gl;
    const { sx, sy } = this.refScale(gl);
    const labels = {
      [GAME_BLUE_WIN]: ['Blue team wins!', TEXT_COLORS[1]],
      [GAME_RED_WIN]: ['Red team wins!', TEXT_COLORS[4]],
      [GAME_DRAW]: ['Tie game!', TEXT_COLORS[9]],
    };
    const [label, color] = labels[game.roundState] ?? ['Changing map…', TEXT_COLORS[9]];
    this.textCenter(64 * sx, gl.canvas.width * 0.5, 110 * sy, label, color);
  }

  renderSniperScope(game, scale) {
    const player = game.thisPlayer;
    if (!player?.weapon || player.weapon.weaponID !== WEAPON_SNIPER) return;
    const camZ = game.renderer.cameraHeight;
    if (camZ <= 8 || !this.sniperScope) return;

    const gl = this.gl;
    const cx = game.input.mouse.x * scale;
    const cy = game.input.mouse.y * scale;
    const r = 128 * scale;
    // ClientRender.cpp:78-79
    let scopeAlpha = 10 - (camZ - 2);
    scopeAlpha = scopeAlpha > 0 ? 1 - scopeAlpha / 2 : 1;

    this.rect(0, 0, gl.canvas.width, cy - r, [0, 0, 0, scopeAlpha]);
    this.rect(0, cy + r, gl.canvas.width, gl.canvas.height - cy - r, [0, 0, 0, scopeAlpha]);
    this.rect(0, cy - r, cx - r, r * 2, [0, 0, 0, scopeAlpha]);
    this.rect(cx + r, cy - r, gl.canvas.width - cx - r, r * 2, [0, 0, 0, scopeAlpha]);
    this.rect(cx - r, cy - r, r * 2, r * 2, [1, 1, 1, 1], this.sniperScope);
    const cross = 2 * scale;
    const crossAlpha = 1 - scopeAlpha;
    this.rect(cx - 12 * scale, cy - cross, 24 * scale, cross * 2, [0, 0, 0, crossAlpha * 0.6]);
    this.rect(cx - cross, cy - 12 * scale, cross * 2, 24 * scale, [0, 0, 0, crossAlpha * 0.6]);
  }

  /** ClientRender.cpp:135-254 — center reload bar + blinking "Reloading" text. */
  renderReloadBar(game, sx, sy, blinkOn) {
    const player = game.thisPlayer;
    const weapon = player.weapon;
    if (!weapon) return;

    let progress = 0;
    let maxDelay = 0;
    let active = false;

    if (weapon.currentFireDelay > 0 && weapon.fireDelay >= 1.0) {
      active = true;
      progress = 1 - weapon.currentFireDelay / weapon.fireDelay;
      maxDelay = weapon.fireDelay;
    } else if (player.grenadeDelay > 0) {
      active = true;
      progress = 1 - player.grenadeDelay / WEAPONS[WEAPON_GRENADE].fireDelay;
      maxDelay = WEAPONS[WEAPON_GRENADE].fireDelay;
    } else if (weapon.weaponID === WEAPON_SHOTGUN && weapon.currentFireDelay > 0) {
      active = true;
      progress = 1 - weapon.currentFireDelay / 3;
      maxDelay = 3;
    } else if (player.meleeDelay > 0 && player.meleeWeapon) {
      active = true;
      progress = 1 - player.meleeDelay / player.meleeWeapon.fireDelay;
      maxDelay = player.meleeWeapon.fireDelay;
    }

    if (!active) return;

    const barX = 300 * sx;
    const barY = 440 * sy;
    const barW = 200 * sx;
    const barH = 14 * sy;
    const fillAlpha = (maxDelay > 0 ? (maxDelay - (1 - progress) * maxDelay) / maxDelay : 0) * 0.75 + 0.25;

    this.rect(barX - 5 * sx, barY - 5 * sy, barW + 10 * sx, barH + 10 * sy, [1, 1, 1, 0.5]);
    this.rect(barX - 1 * sx, barY - 1 * sy, barW + 2 * sx, barH + 2 * sy, [0, 0, 0, 0.5]);
    this.rect(barX, barY, barW * progress, barH, [0.5, 1, 0.5, fillAlpha]);

    if (blinkOn) {
      const textSize = 32 * sx;
      const label = 'Reloading';
      const tw = this.textWidth(textSize, label);
      this.text(textSize, (400 * sx) - tw / 2, 400 * sy, label, [1, 1, 1, 1]);
    }
  }

  /** ClientRender.cpp:259-308 — vertical health + chaingun heat bars (right side). */
  renderVerticalBars(player, weapon, sx, sy, blinkOn) {
    const gl = this.gl;
    const barX = 760 * sx;
    const barTop = 390 * sy;
    const barBot = 589 * sy;
    const barW = 29 * sx;
    const innerX = 762 * sx;
    const innerW = 25 * sx;
    const innerTop = 392 * sy;
    const innerBot = 587 * sy;
    const innerH = innerBot - innerTop;

    this.rect(barX, barTop, barW, barBot - barTop, [1, 1, 1, 1]);
    this.rect(innerX, innerTop, innerW, innerH, [0, 0, 0, 1]);

    const life = Math.max(0, Math.min(1, player.life));
    if (life > 0.25 || blinkOn) {
      const fillH = innerH * life;
      this.rect(innerX + 2 * sx, innerBot - fillH, innerW - 4 * sx, fillH, [
        1 - life, life, 0, 1,
      ]);
    }

    if (weapon?.weaponID === WEAPON_CHAIN_GUN) {
      const heatTop = barTop - 200 * sy;
      const heatInnerTop = innerTop - 200 * sy;
      const heatInnerBot = innerBot - 200 * sy;
      const heat = weapon.chainOverHeat;
      const frameAlpha = 1 - heat * 0.5;

      this.rect(barX, heatTop, barW, 199 * sy, [1, 1, 1, frameAlpha]);
      this.rect(innerX, heatInnerTop, innerW, innerH, [0, 0, 0, frameAlpha]);

      if ((weapon.overHeated && blinkOn) || !weapon.overHeated) {
        const fillH = innerH * heat;
        this.rect(innerX + 2 * sx, heatInnerBot - fillH, innerW - 4 * sx, fillH, [
          1 - heat, heat, heat, frameAlpha,
        ]);
      }
    }
  }

  /** ClientRender.cpp:311-393 — grenade, molotov, shotgun shell icons. */
  renderThrowableIcons(player, weapon, sx, sy) {
    const iconSize = (base, pulse) => (32 + pulse) * sx;

    if (player.nbGrenadeLeft > 0) {
      const pulse = player.lastShootWasNade ? player.grenadeDelay * 16 : 0;
      const sz = iconSize(32, pulse);
      const cx = 718 * sx;
      const cy = 558 * sy;
      if (this.icons.grenade) {
        this.rect(cx - sz / 2, cy - sz / 2, sz, sz, [1, 1, 1, 1], this.icons.grenade);
      } else {
        this.rect(cx - sz / 2, cy - sz / 2, sz, sz, [0.3, 0.8, 0.3, 0.8]);
      }
      const ts = 32 * sx;
      const label = String(player.nbGrenadeLeft);
      this.text(ts, cx - this.textWidth(ts, label) / 2, cy - ts * 0.5, label, [1, 1, 1, 1]);
    }

    if (player.nbMolotovLeft > 0) {
      const pulse = !player.lastShootWasNade ? player.grenadeDelay * 16 : 0;
      const sz = iconSize(32, pulse);
      const cx = 718 * sx;
      const cy = 506 * sy;
      if (this.icons.molotov) {
        this.rect(cx - sz / 2, cy - sz / 2, sz, sz, [1, 1, 1, 1], this.icons.molotov);
      } else {
        this.rect(cx - sz / 2, cy - sz / 2, sz, sz, [0.9, 0.4, 0.1, 0.8]);
      }
      const ts = 32 * sx;
      const label = String(player.nbMolotovLeft);
      this.text(ts, cx - this.textWidth(ts, label) / 2, cy - ts * 0.5, label, [1, 1, 1, 1]);
    }

    if (
      weapon?.weaponID === WEAPON_SHOTGUN &&
      SV_ENABLE_SHOTGUN_RELOAD
    ) {
      const pulse = weapon.currentFireDelay * 16;
      const sz = (32 + pulse) * sx;
      const cx = 718 * sx;
      const cy = 454 * sy;
      if (this.icons.cartridge) {
        this.rect(cx - sz / 2, cy - sz / 2, sz, sz, [1, 1, 1, 1], this.icons.cartridge);
      } else {
        this.rect(cx - sz / 2, cy - sz / 2, sz, sz, [0.8, 0.7, 0.2, 0.8]);
      }
      const ts = 32 * sx;
      const shells = String(6 - weapon.shotInc);
      this.text(ts, cx - this.textWidth(ts, shells) / 2, cy - ts * 0.5, shells, [1, 1, 1, 1]);
    }
  }

  /** ClientRender.cpp:488-532 — match timer + team win/score flags (top-left). */
  renderTopLeftHud(game, sx, sy) {
    const u = sy;
    const x = Math.round(5 * sx);
    const totalSec = Math.max(0, Math.floor(game.gameTimeLeft ?? 0) + 1);
    const timer = `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
    const timerSz = HUD_TIMER_FONT * u;
    this.text(timerSz, x, Math.round(5 * u), timer, TEXT_COLORS[9]);

    if (game.gameType === GAME_TYPE_DM) return;
    if (game.gameType === GAME_TYPE_SND) {
      const roundSec = Math.max(0, Math.floor(game.roundTimeLeft ?? 0) + 1);
      const roundTimer = `${Math.floor(roundSec / 60)}:${String(roundSec % 60).padStart(2, '0')}`;
      this.text(timerSz, x, Math.round((5 + HUD_TIMER_FONT) * u), roundTimer, TEXT_COLORS[9]);
      return;
    }

    let blueVal;
    let redVal;
    let limit;
    if (game.gameType === GAME_TYPE_CTF) {
      blueVal = game.ctf?.blueWin ?? 0;
      redVal = game.ctf?.redWin ?? 0;
      limit = SV_WIN_LIMIT;
    } else {
      blueVal = game.blueScore ?? 0;
      redVal = game.redScore ?? 0;
      limit = 50;
    }

    const iconSz = Math.round(HUD_FLAG_ICON * u);
    const scoreSz = HUD_FLAG_SCORE_FONT * u;
    let rowY = Math.round((5 + HUD_TIMER_FONT + 4) * u);

    const flagRow = (tex, val, mark) => {
      if (tex) this.rectNearest(x, rowY, iconSz, iconSz, [1, 1, 1, 1], tex);
      this.text(scoreSz, x + iconSz + Math.round(4 * sx), rowY + Math.round(2 * u), `${mark}${val}/${limit}`, TEXT_COLORS[9]);
      rowY += iconSz + Math.round(4 * u);
    };

    const blueTex = this.icons.blueFlag;
    const redTex = this.icons.redFlag;
    if (blueVal >= redVal) {
      flagRow(blueTex, blueVal, '\x01');
      flagRow(redTex, redVal, '\x04');
    } else {
      flagRow(redTex, redVal, '\x04');
      flagRow(blueTex, blueVal, '\x01');
    }
  }

  /** @deprecated use renderTopLeftHud */
  renderModeScore(game, sx, sy) {
    this.renderTopLeftHud(game, sx, sy);
  }

  renderChat(ui, scale) {
    const gl = this.gl;
    const textSize = 22 * scale;
    const mobileOffset = ui.game.mobileSpectator ? 190 : 120;
    const baseY = gl.canvas.height - mobileOffset * scale;
    for (let i = 0; i < ui.chatMessages.length; i++) {
      const msg = ui.chatMessages[i];
      const alpha = msg.duration > 1 ? 0.85 : msg.duration * 0.85;
      const y = baseY - (ui.chatMessages.length - 1 - i) * (textSize + 4);
      const w = Math.min(500 * scale, this.textWidth(textSize, msg.message) + 16 * scale);
      this.rect(8 * scale, y - 2, w, textSize + 6, [0, 0, 0, alpha * 0.45]);
      this.text(textSize, 12 * scale, y, msg.message, [1, 1, 1, alpha]);
    }
    if (ui.chatActive) {
      const y = gl.canvas.height - (ui.game.mobileSpectator ? 100 : 48) * scale;
      this.rect(8 * scale, y, 500 * scale, 32 * scale, [0, 0, 0, 0.55]);
      this.text(22 * scale, 12 * scale, y + 4 * scale, ui.inputPrompt + ui.chatBuffer + '_', TEXT_COLORS[9]);
    }
  }

  renderEvents(ui, scale) {
    const gl = this.gl;
    const textSize = 24 * scale;
    const x = gl.canvas.width * 0.16 + 40 * scale;
    for (let i = 0; i < ui.eventMessages.length; i++) {
      const msg = ui.eventMessages[i];
      const alpha = msg.duration > 1 ? 1 : msg.duration;
      const y = 40 * scale + i * (textSize + 6);
      this.text(textSize, x, y, msg.message, [1, 1, 1, alpha]);
    }
  }

  renderConsole(ui, scale) {
    if (!ui.consoleActive) return;
    const gl = this.gl;
    const panelH = 320 * scale;
    this.rect(0, 0, gl.canvas.width, panelH, [0, 0, 0, 0.75]);
    this.rect(0, panelH - 5 * scale, gl.canvas.width, 5 * scale, [0.7, 0.8, 1, 0.75]);

    const log = ui.consoleEventsMode ? ui.consoleMessages : ui.chatMessages.map((m) => m.message);
    const lineH = 22 * scale;
    let y = panelH - 50 * scale;
    for (let i = log.length - 1; i >= 0 && y > 45 * scale; i--) {
      const line = typeof log[i] === 'string' ? log[i] : log[i].message;
      this.text(lineH, 16 * scale, y, line, TEXT_COLORS[9]);
      y -= lineH + 2;
    }

    this.text(18 * scale, gl.canvas.width - 200 * scale, 8 * scale, 'F1 events  F2 chat log  ` close', [1, 1, 0, 0.9]);
    this.text(22 * scale, 16 * scale, panelH - 36 * scale, ui.inputPrompt + ui.consoleBuffer + '_', TEXT_COLORS[9]);
  }

  renderScoreboard(game, _scale) {
    const ui = game.ui;
    if (!ui.showScoreboard) return;

    const gl = this.gl;
    const { sx, sy } = this.refScale(gl);
    const gt = game.gameType;
    const isCTF = gt === GAME_TYPE_CTF;
    const isTDM = gt === GAME_TYPE_TDM;
    const isDM = gt === GAME_TYPE_DM;
    const isFFA = isDM || gt === GAME_TYPE_SND;

    const boardX = Math.round(SCOREBOARD_X * sx);
    const boardW = Math.round((800 - SCOREBOARD_X) * sx);
    const rowH = SCORE_ROW_H * sy;
    const fontSz = SCORE_FONT * sy;
    const padY = 2 * sy;
    const c = SCORE_COLS;

    const col = {
      name: c.nameL * sx,
      kills: c.killsC * sx,
      deaths: c.deathsC * sx,
      damage: c.damageC * sx,
      returns: c.returnsC * sx,
      caps: c.capsC * sx,
      score: c.scoreC * sx,
      ping: c.pingC * sx,
      scoreL: c.scoreL * sx,
      killsL: c.killsL * sx,
      deathsL: c.deathsL * sx,
      damageL: c.damageL * sx,
      returnsL: c.returnsL * sx,
      capsL: c.capsL * sx,
      pingL: c.pingL * sx,
    };

    let y = 0;

    const drawSep = (xNative) => {
      this.rect(Math.round(xNative * sx), y, Math.max(1, Math.round(1 * sx)), rowH, [0.42, 0.42, 0.42, 0.55]);
    };

    const drawHeader = () => {
      this.rect(boardX, y, boardW, rowH, [0, 0, 0, 0.94]);
      this.text(fontSz, col.name, y + padY, 'PLAYER NAME', TEXT_COLORS[9]);
      if (isDM) this.text(fontSz, col.scoreL, y + padY, 'SCORE', TEXT_COLORS[9]);
      this.text(fontSz, col.killsL, y + padY, 'Kills', TEXT_COLORS[9]);
      this.text(fontSz, col.deathsL, y + padY, 'Death', TEXT_COLORS[9]);
      this.text(fontSz, col.damageL, y + padY, 'Damage', TEXT_COLORS[9]);
      if (isCTF) {
        this.text(fontSz, col.returnsL, y + padY, 'Retrn', TEXT_COLORS[9]);
        this.text(fontSz, col.capsL, y + padY, 'Caps', TEXT_COLORS[9]);
      } else if (isTDM) {
        this.text(fontSz, col.returnsL, y + padY, 'Score', TEXT_COLORS[9]);
      }
      this.text(fontSz, col.pingL, y + padY, 'PING', TEXT_COLORS[9]);
      for (const s of c.seps) drawSep(s);
      y += rowH;
    };

    const pingColor = (ping) => {
      if (ping < 0 || ping <= 80) return [0.2, 1, 0.35, 1];
      if (ping <= 150) return [1, 0.95, 0.35, 1];
      return [1, 0.35, 0.35, 1];
    };

    const drawPlayerRow = (p) => {
      this.rect(boardX, y, boardW, rowH, [0, 0, 0, 0.45]);
      let label = p.name;
      if (p.status === PLAYER_STATUS_DEAD) label = `\x03(Dead) ${label}`;
      this.text(fontSz, col.name, y + padY, label, TEXT_COLORS[9]);
      if (isDM) this.textCenter(fontSz, col.score, y + padY, String(p.score ?? 0), TEXT_COLORS[9]);
      this.textCenter(fontSz, col.kills, y + padY, String(p.kills ?? 0), TEXT_COLORS[9]);
      this.textCenter(fontSz, col.deaths, y + padY, String(p.deaths ?? 0), TEXT_COLORS[9]);
      this.textCenter(fontSz, col.damage, y + padY, (p.damage ?? 0).toFixed(1), TEXT_COLORS[9]);
      if (isCTF) {
        this.textCenter(fontSz, col.returns, y + padY, String(p.returns ?? 0), TEXT_COLORS[9]);
        this.textCenter(fontSz, col.caps, y + padY, String(p.score ?? 0), TEXT_COLORS[9]);
      } else if (isTDM) {
        this.textCenter(fontSz, col.score, y + padY, String(p.score ?? 0), TEXT_COLORS[9]);
      }
      const pingLabel = game.exploreMode ? '-' : String(p.ping ?? 0);
      this.textCenter(fontSz, col.ping, y + padY, pingLabel, pingColor(game.exploreMode ? -1 : (p.ping ?? 0)));
      y += rowH;
    };

    drawHeader();

    if (isFFA) {
      this.rect(boardX, y, boardW, rowH, [0.38, 0.38, 0.42, 0.92]);
      this.text(fontSz, col.name, y + padY, 'FREE FOR ALL', TEXT_COLORS[9]);
      y += rowH;
      const sorted = [...game.players].sort(compareScoreboardPlayers);
      for (const p of sorted) drawPlayerRow(p);
    } else {
      const drawTeam = (teamId, label, barColor, teamScore) => {
        this.rect(boardX, y, boardW, rowH, barColor);
        this.text(fontSz, col.name, y + padY, label, TEXT_COLORS[9]);
        if (isCTF) this.textCenter(fontSz, col.caps, y + padY, String(teamScore), TEXT_COLORS[9]);
        else if (isTDM) this.textCenter(fontSz, col.score, y + padY, String(teamScore), TEXT_COLORS[9]);
        y += rowH;
        const players = game.players.filter((pl) => pl.teamID === teamId).sort(compareScoreboardPlayers);
        for (const p of players) drawPlayerRow(p);
      };

      drawTeam(
        PLAYER_TEAM_BLUE,
        'BLUE TEAM',
        [0.05, 0.35, 1, 0.98],
        isCTF ? (game.ctf?.blueWin ?? 0) : (game.blueScore ?? 0),
      );
      drawTeam(
        PLAYER_TEAM_RED,
        'RED TEAM',
        [0.92, 0.08, 0.08, 0.98],
        isCTF ? (game.ctf?.redWin ?? 0) : (game.redScore ?? 0),
      );

      this.rect(boardX, y, boardW, rowH, [0.5, 0.5, 0.5, 0.82]);
      this.text(fontSz, col.name, y + padY, 'SPECTATORS', TEXT_COLORS[9]);
      y += rowH;
      const spectators = game.players
        .filter((pl) => pl.teamID === PLAYER_TEAM_SPECTATOR)
        .sort(compareScoreboardPlayers);
      for (const p of spectators) drawPlayerRow(p);
    }

    const me = game.thisPlayer;
    if (me?.status === PLAYER_STATUS_DEAD && me.life <= 0 && game.exploreMode && !game.isSpectating) {
      this.textCenter(28 * sx, 400 * sx, 520 * sy, 'Press shoot key [[Mouse1]] to respawn', TEXT_COLORS[9]);
    }
  }

  /** Player.cpp::renderName: center the bitmap name 28 px above each living Babo. */
  renderPlayerNames(game, scale) {
    const gl = this.gl;
    const fontSize = 22 * scale;
    const offset = 28 * scale;
    for (const player of game.players) {
      if (player.status !== PLAYER_STATUS_ALIVE || !player.onScreenPos || !player.name) continue;
      const [x, y] = player.onScreenPos;
      if (x <= 0 || x >= gl.canvas.width || y <= 0 || y >= gl.canvas.height) continue;
      const name = String(player.name).slice(0, 31);
      this.textCenter(fontSize, x + scale, y - offset + scale, name, [0, 0, 0, 0.9]);
      this.textCenter(fontSize, x, y - offset, name, TEXT_COLORS[9]);
    }
  }

  render(game) {
    const gl = this.gl;
    const dpr = gl.canvas.width / gl.canvas.clientWidth;
    const scale = Math.max(1, dpr);
    const ui = game.ui;
    this.begin();

    if (ui.menuOpen) {
      this.end();
      return;
    }

    const player = game.thisPlayer;
    const weapon = player.weapon;
    const { sx, sy } = this.refScale(gl);
    const blinkOn = (game.time % 0.5) < 0.125;
    const spectating = game.isSpectating;

    if (!spectating) {
      this.renderScreenHit(player, scale);
      this.renderDeathOverlay(player, scale);
      this.renderSniperScope(game, scale);
    }
    this.renderMatchResult(game);
    this.renderPlayerNames(game, scale);

    // Spectators have no body, so no health/ammo/throwables to show (Client.cpp:675).
    if (!spectating) {
      this.renderVerticalBars(player, weapon, sx, sy, blinkOn);
      this.renderReloadBar(game, sx, sy, blinkOn);
      this.renderThrowableIcons(player, weapon, sx, sy);
    } else {
      this.textCenter(22 * sx, 400 * sx, 20 * sy, 'SPECTATOR \x08move keys to fly, wheel to zoom', TEXT_COLORS[9]);
    }
    if (!ui.showScoreboard) {
      this.renderTopLeftHud(game, sx, sy);
    }

    if (this.minimap) {
        const [tw, th] = this.minimapSize;
        const [mw, mh] = this.minimapMapSize;
        const maxSide = Math.round(HUD_MINIMAP_SIZE * sy);
        const scale = Math.max(1, Math.floor(Math.min(maxSide / tw, maxSide / th)));
        const w = tw * scale;
        const h = th * scale;
        const mx = Math.round(5 * sx);
        const my = Math.round(435 * sy);
        this.rect(mx - 2, my - 2, w + 4, h + 4, [0, 0, 0, 0.45]);
        this.rectNearest(mx, my, w, h, [1, 1, 1, 1], this.minimap);
        const bounds = { x: mx, y: my, width: w, height: h, mapWidth: mw, mapHeight: mh };

        // Team knowledge is shared on the minimap. Spectators can see both
        // teams; active players only see living friends, never enemies.
        for (const friend of visibleMinimapPlayers(game.players, player, spectating)) {
          const [friendX, friendY] = minimapPoint(friend.currentCF.position, bounds);
          const color = friend.teamID === PLAYER_TEAM_BLUE
            ? [0.2, 0.55, 1, 1]
            : [1, 0.25, 0.2, 1];
          this.rect(Math.round(friendX) - 2, Math.round(friendY) - 2, 4, 4, color);
        }

        // Home/dropped flags are public. A carried flag follows a friendly
        // carrier (or either carrier for spectators), but never reveals an enemy.
        if (game.gameType === GAME_TYPE_CTF) {
          for (const flag of visibleMinimapFlags(game.ctf, game.players, player, spectating)) {
            const [flagX, flagY] = minimapPoint(flag.position, bounds);
            const color = flag.flagID === 0 ? [0.15, 0.45, 1, 1] : [1, 0.18, 0.12, 1];
            const fx = Math.round(flagX);
            const fy = Math.round(flagY);
            // A pole and offset banner reads as a flag instead of a larger player dot.
            this.rect(fx - 4, fy - 5, 2, 11, [0, 0, 0, 0.9]);
            this.rect(fx - 3, fy - 4, 1, 9, [0.9, 0.9, 0.9, 1]);
            this.rect(fx - 2, fy - 5, 7, 6, [0, 0, 0, 0.9]);
            this.rect(fx - 1, fy - 4, 5, 4, color);
          }
        }

        const p = spectating ? game.specLookAt : player.currentCF.position;
        const [dotX, dotY] = minimapPoint(p, bounds);
        const localColor = player.teamID === PLAYER_TEAM_RED
          ? [1, 0.4, 0.3, 1]
          : [0.3, 0.7, 1, 1];
        this.rect(Math.round(dotX) - 2, Math.round(dotY) - 2, 4, 4, localColor);
    }

    this.renderEvents(ui, scale);
    this.renderChat(ui, scale);
    this.renderScoreboard(game, scale);
    if (ui.showScoreboard) {
      this.renderTopLeftHud(game, sx, sy);
    }
    this.renderConsole(ui, scale);

    this.end();
  }
}
