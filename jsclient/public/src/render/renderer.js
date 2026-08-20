// Frame rendering. Equivalent of src/Game/GameRender.cpp (Game::render).
import { createProgram, createTexture, mat4 } from './gl.js';
import { buildMapMeshes } from './mapMesh.js';
import { buildSphere } from './sphere.js';
import { ModelRenderer } from './modelRenderer.js';
import { Hud } from '../ui/hud.js';
import { toMat4 } from '../core/mat3.js';
import { recolorSkin, DEFAULT_DECALS, normalizeDecals } from '../game/skin.js';
import { WEATHER_FOG_PARAMS, PLAYER_RADIUS, WEAPON_MODEL_SCALE, DROP_MODEL_SCALE, WEAPON_KNIVES, WEAPON_SHIELD, PROJECTILE_FLAME, PROJECTILE_DROPED_WEAPON, PROJECTILE_DROPED_GRENADE, PROJECTILE_LIFE_PACK, GAME_TYPE_CTF, PLAYER_STATUS_ALIVE } from '../game/constants.js';

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in float aShade;
layout(location=3) in float aAlpha;
uniform mat4 uMVP;
uniform mat4 uModel;
uniform vec3 uCamPos;
uniform float uLit;
out vec2 vUV;
out float vShade;
out float vAlpha;
out float vDist;
void main() {
  vUV = aUV;
  vAlpha = aAlpha;
  vec4 world = uModel * vec4(aPos, 1.0);
  vShade = aShade;
  if (uLit > 0.5) {
    // The sphere is centred on the model origin, so its normal is normalize(aPos).
    vec3 n = normalize(mat3(uModel) * normalize(aPos));
    vShade *= 0.45 + 0.55 * max(dot(n, normalize(vec3(0.3, -0.5, 1.0))), 0.0);
  }
  vDist = distance(world.xyz, uCamPos);
  gl_Position = uMVP * world;
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUV;
in float vShade;
in float vAlpha;
in float vDist;
uniform sampler2D uTex;
uniform vec4 uFogColor;
uniform vec2 uFogRange;   // start, end; end <= start disables
uniform vec4 uTint;
out vec4 fragColor;
void main() {
  vec4 tex = texture(uTex, vUV) * uTint;
  vec3 rgb = tex.rgb * vShade;
  if (uFogRange.y > uFogRange.x) {
    float f = clamp((uFogRange.y - vDist) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
    rgb = mix(uFogColor.rgb, rgb, f);
  }
  float a = tex.a * vAlpha;
  fragColor = vec4(rgb, a);
}`;

const STRIDE = 7 * 4;

/** Project a world point into canvas pixels, matching Player::onScreenPos. */
export function projectWorldToScreen(mvp, point, width, height) {
  const [x, y, z = 0] = point;
  const clipX = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
  const clipY = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
  const clipZ = mvp[2] * x + mvp[6] * y + mvp[10] * z + mvp[14];
  const clipW = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
  if (clipW <= 0) return null;
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  const ndcZ = clipZ / clipW;
  if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1 || ndcZ < -1 || ndcZ > 1) return null;
  return [
    (ndcX * 0.5 + 0.5) * width,
    (1 - (ndcY * 0.5 + 0.5)) * height,
  ];
}

export class Renderer {
  constructor(gl, assets) {
    this.gl = gl;
    this.assets = assets;
    this.program = createProgram(gl, VS, FS);
    this.uniforms = {
      mvp: gl.getUniformLocation(this.program, 'uMVP'),
      model: gl.getUniformLocation(this.program, 'uModel'),
      camPos: gl.getUniformLocation(this.program, 'uCamPos'),
      tex: gl.getUniformLocation(this.program, 'uTex'),
      fogColor: gl.getUniformLocation(this.program, 'uFogColor'),
      fogRange: gl.getUniformLocation(this.program, 'uFogRange'),
      tint: gl.getUniformLocation(this.program, 'uTint'),
      lit: gl.getUniformLocation(this.program, 'uLit'),
    };
    this.mapBatches = [];
    this.themeTextures = null;
    this.spriteVAO = this.createDynamicVAO(6);
    // drawSphere(0.25f, 16, 16) in Player::render
    this.sphere = { ...this.createVAOFromData(buildSphere(PLAYER_RADIUS, 16, 16)), count: 16 * 16 * 6 };
    this.identity = mat4.identity();
    this.models = new ModelRenderer(gl, assets);
    this.hud = new Hud(gl, assets);
    this.effectTextures = {};
    // Map::setCameraPos: camDest = lookAt + (0,0,7), looking straight down.
    this.cameraHeight = 7;
    this.cameraShake = [0, 0];
    this.sniperZoom = 0;
    /** Free camera target used by spectators instead of the player body (Game.cpp:587). */
    this.cameraFocus = null;
    this.renderScale = 1;
  }

  createVAOFromData(data) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.setupAttribs();
    gl.bindVertexArray(null);
    return { vao, vbo };
  }

  createDynamicVAO(vertexCount) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertexCount * STRIDE, gl.DYNAMIC_DRAW);
    this.setupAttribs();
    gl.bindVertexArray(null);
    return { vao, vbo };
  }

  setupAttribs() {
    const gl = this.gl;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE, 20);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, STRIDE, 24);
  }

  async setMap(map) {
    const gl = this.gl;
    // Load everything first: frames keep rendering during these awaits, so the
    // old batches must stay valid until the new ones are ready.
    const themeTextures = await this.assets.loadTheme(map.themeName);
    this.baboShadow = await this.assets.loadTexture('main/textures/BaboShadow.tga', { repeat: false });
    await this.loadEffectTextures();
    if (!this.hud.font) await this.hud.load();

    this.themeTextures = themeTextures;
    this.rebuildMap(map);
    this.hud.buildMinimap(map);
  }

  /** Rebuild edited geometry without reloading theme/effect assets. */
  rebuildMap(map) {
    const gl = this.gl;
    const newBatches = buildMapMeshes(map).map((batch) => ({
      ...batch,
      ...this.createVAOFromData(batch.data),
    }));

    for (const batch of this.mapBatches) {
      gl.deleteVertexArray(batch.vao);
      gl.deleteBuffer(batch.vbo);
    }
    this.map = map;
    this.mapBatches = newBatches;
  }

  async loadEffectTextures() {
    const names = {
      smoke1: 'Smoke1', smoke2: 'Smoke2', glow: 'glowTrail', flash: 'nuzzleFlash',
      shotGlow: 'shotGlow', explosionMark: 'ExplosionMark',
    };
    for (let i = 1; i <= 10; i++) names[`blood${String(i).padStart(2, '0')}`] = `blood${String(i).padStart(2, '0')}`;
    await Promise.all(
      Object.entries(names).map(async ([key, file]) => {
        try {
          this.effectTextures[key] = await this.assets.loadTexture(`main/textures/${file}.tga`, { repeat: false });
        } catch {
          this.effectTextures[key] = null;
        }
      }),
    );
  }

  async loadSkin(name, decals = DEFAULT_DECALS) {
    const mask = await this.assets.loadImage(`main/skins/${name}.tga`);
    const d = normalizeDecals(decals);
    return createTexture(this.gl, recolorSkin(mask, d), { repeat: false, mipmap: false });
  }

  resize() {
    const canvas = this.gl.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.renderScale;
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  /** Map::setCameraPos + GameRender.cpp:120 - directly overhead, looking down. */
  cameraFor(player) {
    const p = this.cameraFocus ?? player.currentCF.position;
    const shake = this.cameraShake ?? [0, 0];
    return {
      eye: [p[0] + shake[0], p[1] + shake[1], p[2] + this.cameraHeight],
      center: [p[0] + shake[0], p[1] + shake[1], 0],
    };
  }

  viewProjection(player) {
    const gl = this.gl;
    const { eye, center } = this.cameraFor(player);
    const proj = mat4.perspective(60, gl.canvas.width / gl.canvas.height, 0.1, 200);
    // Up is +Y so the map keeps its authored orientation under a top-down view.
    const view = mat4.lookAt(eye, center, [0, 1, 0]);
    return { mvp: mat4.multiply(proj, view), eye };
  }

  drawSprite(texture, x, y, z, size, angle, tint = [1, 1, 1, 1]) {
    const gl = this.gl;
    const c = Math.cos(angle) * size * 0.5;
    const s = Math.sin(angle) * size * 0.5;
    // Quad lying on the map plane, rotated to face the aim direction.
    const corners = [
      [-c + s, -s - c, 0, 1],
      [c + s, s - c, 1, 1],
      [c - s, s + c, 1, 0],
      [-c - s, -s + c, 0, 0],
    ];
    const v = [];
    const push = (i) => v.push(x + corners[i][0], y + corners[i][1], z, corners[i][2], corners[i][3], 1, 1);
    push(0); push(1); push(2);
    push(0); push(2); push(3);

    gl.bindVertexArray(this.spriteVAO.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteVAO.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(v));
    gl.uniform4fv(this.uniforms.tint, tint);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.uniform4f(this.uniforms.tint, 1, 1, 1, 1);
  }

  /** Flat quad stretched between two world points, used for bullet tracers. */
  drawBeam(texture, from, to, width, tint) {
    const gl = this.gl;
    let dx = to[0] - from[0];
    let dy = to[1] - from[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy * width * 0.5;
    const ny = dx * width * 0.5;
    const v = [];
    const push = (p, off, u, w) => v.push(p[0] + off[0], p[1] + off[1], p[2], u, w, 1, 1);
    push(from, [nx, ny], 0, 1);
    push(from, [-nx, -ny], 0, 0);
    push(to, [-nx, -ny], 1, 0);
    push(from, [nx, ny], 0, 1);
    push(to, [-nx, -ny], 1, 0);
    push(to, [nx, ny], 1, 1);

    gl.bindVertexArray(this.spriteVAO.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteVAO.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(v));
    gl.uniform4fv(this.uniforms.tint, tint);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.uniform4f(this.uniforms.tint, 1, 1, 1, 1);
  }

  drawParticles(particles) {
    const gl = this.gl;
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.uniform2f(this.uniforms.fogRange, 0, 0);
    let additive = null;
    for (const p of particles) {
      const tex = this.effectTextures[p.texture];
      if (!tex) continue;
      if (p.additive !== additive) {
        additive = p.additive;
        gl.blendFunc(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      }
      this.drawSprite(tex, p.pos[0], p.pos[1], p.pos[2], p.size, p.angle, p.color);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  render(game) {
    const gl = this.gl;
    this.resize();
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    const fog = WEATHER_FOG_PARAMS[this.map?.weather];
    const clear = fog ? fog.color : [0.05, 0.06, 0.08, 1];
    gl.clearColor(...clear);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    if (!this.map) return;

    const { mvp, eye } = this.viewProjection(game.thisPlayer);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.mvp, false, mvp);
    gl.uniformMatrix4fv(this.uniforms.model, false, this.identity);
    gl.uniform1f(this.uniforms.lit, 0);
    gl.uniform3fv(this.uniforms.camPos, eye);
    gl.uniform1i(this.uniforms.tex, 0);
    gl.uniform4f(this.uniforms.tint, 1, 1, 1, 1);
    // Fog in BV2 is inverted (fogStart > fogEnd); express it as a plain near/far band.
    if (fog) {
      gl.uniform4fv(this.uniforms.fogColor, fog.color);
      gl.uniform2f(this.uniforms.fogRange, Math.min(fog.start, fog.end) + 8, Math.max(fog.start, fog.end) + 20);
    } else {
      gl.uniform2f(this.uniforms.fogRange, 0, 0);
    }
    gl.activeTexture(gl.TEXTURE0);

    gl.disable(gl.BLEND);
    for (const batch of this.mapBatches) {
      if (batch.blend) continue;
      gl.bindTexture(gl.TEXTURE_2D, this.themeTextures[batch.texture]);
      gl.bindVertexArray(batch.vao);
      gl.drawArrays(gl.TRIANGLES, 0, batch.count);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const batch of this.mapBatches) {
      if (!batch.blend) continue;
      gl.bindTexture(gl.TEXTURE_2D, this.themeTextures[batch.texture]);
      gl.bindVertexArray(batch.vao);
      gl.drawArrays(gl.TRIANGLES, 0, batch.count);
    }

    gl.depthMask(false);
    for (const player of game.players) {
      if (player.status !== PLAYER_STATUS_ALIVE) continue;
      const p = player.currentCF.position;
      if (this.baboShadow) this.drawSprite(this.baboShadow, p[0] + 0.06, p[1] - 0.06, 0.02, 1.1, 0, [0, 0, 0, 0.45]);
    }
    gl.depthMask(true);

    gl.disable(gl.BLEND);
    gl.uniform1f(this.uniforms.lit, 1);
    gl.bindVertexArray(this.sphere.vao);
    for (const player of game.players) {
      if (player.status !== PLAYER_STATUS_ALIVE || !player.skinTexture) continue;
      gl.uniformMatrix4fv(this.uniforms.model, false, toMat4(player.matrix, player.currentCF.position));
      gl.bindTexture(gl.TEXTURE_2D, player.skinTexture);
      gl.drawArrays(gl.TRIANGLES, 0, this.sphere.count);
    }
    gl.uniform1f(this.uniforms.lit, 0);
    gl.uniformMatrix4fv(this.uniforms.model, false, this.identity);
    gl.bindVertexArray(null);

    this.renderModels(game, mvp);
    this.renderFlags(game, mvp);

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.mvp, false, mvp);
    gl.uniformMatrix4fv(this.uniforms.model, false, this.identity);
    gl.uniform1f(this.uniforms.lit, 0);
    gl.uniform2f(this.uniforms.fogRange, 0, 0);
    gl.enable(gl.BLEND);
    this.renderTracers(game);
    this.renderGroundFlames(game, mvp);
    this.drawParticles(game.particles.visible());
    this.drawDecals(game.decals.visible());
    if (game.editorMode) this.drawEditorMarkers(game);
    gl.bindVertexArray(null);

    if (!game.editorMode) {
      for (const player of game.players) {
        player.onScreenPos = player.status === PLAYER_STATUS_ALIVE
          ? projectWorldToScreen(mvp, player.currentCF.position, gl.canvas.width, gl.canvas.height)
          : null;
      }
      this.hud.render(game);
    }
  }

  playerWeaponMatrix(player, forward = 0, extraAngleDeg = 0) {
    const a = (player.currentCF.angle + extraAngleDeg) * (Math.PI / 180);
    const c = Math.cos(a) * WEAPON_MODEL_SCALE;
    const s = Math.sin(a) * WEAPON_MODEL_SCALE;
    const dirX = -Math.sin(a);
    const dirY = Math.cos(a);
    const p = player.currentCF.position;
    return new Float32Array([
      c, s, 0, 0,
      -s, c, 0, 0,
      0, 0, WEAPON_MODEL_SCALE, 0,
      p[0] + forward * dirX, p[1] + forward * dirY, 0, 1,
    ]);
  }

  renderModels(game, mvp) {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    this.models.begin(mvp);

    for (const player of game.players) {
      if (player.status !== PLAYER_STATUS_ALIVE) continue;
      if (player.weapon?.built) {
        this.models.draw(player.weapon.built, this.playerWeaponMatrix(player));
      }
      const melee = player.meleeWeapon;
      if (!melee?.built) continue;
      const anim = melee.modelAnim || 0;
      const matrix = this.playerWeaponMatrix(player);

      if (melee.weaponID === WEAPON_KNIVES) {
        // Weapon.cpp:717 — alpha-tested animated knife mesh.
        this.models.draw(melee.built, matrix, anim, { alphaCutoff: 0.3 });
      } else if (melee.weaponID === WEAPON_SHIELD) {
        // Weapon.cpp:727 — ShieldMagnet then additive shield rings.
        if (melee.builtAlt) {
          this.models.draw(melee.builtAlt, matrix, anim);
        }
        this.models.draw(melee.built, matrix, anim, { blend: 'add', unlit: true });
        gl.depthMask(false);
        for (let i = 0; i < 10; i++) {
          this.models.draw(
            melee.built,
            this.playerWeaponMatrix(player, 0, (i + 1) * 36),
            anim,
            { blend: 'add', unlit: true },
          );
        }
        gl.depthMask(true);
      } else {
        this.models.draw(melee.built, matrix, anim);
      }
    }

    for (const proj of game.projectiles) {
      if (proj.type === PROJECTILE_FLAME) continue;
      let built = game.projectileModels[proj.type];
      let scale = WEAPON_MODEL_SCALE;
      if (proj.type === PROJECTILE_DROPED_WEAPON && proj.weaponDropID != null) {
        built = game.projectileModels[`drop_${proj.weaponDropID}`];
        scale = WEAPON_MODEL_SCALE;
      } else if (
        proj.type === PROJECTILE_DROPED_GRENADE ||
        proj.type === PROJECTILE_LIFE_PACK
      ) {
        scale = DROP_MODEL_SCALE;
      }
      if (!built) continue;
      const a = proj.type === PROJECTILE_DROPED_WEAPON
        ? proj.rotation * (Math.PI / 180)
        : proj.currentCF.angle * (Math.PI / 180);
      const c = Math.cos(a) * scale;
      const s = Math.sin(a) * scale;
      const p = proj.currentCF.position;
      this.models.draw(built, new Float32Array([
        c, s, 0, 0,
        -s, c, 0, 0,
        0, 0, scale, 0,
        p[0], p[1], p[2], 1,
      ]));
    }

    this.renderBrass(game);
    gl.bindVertexArray(null);
    this.renderShieldDeployFlash(game, mvp);
  }

  effectGlowTexture() {
    return this.effectTextures.shotGlow || this.effectTextures.glow;
  }

  /** Weapon.cpp:746 — cyan deploy flash while modelAnim < 10. */
  renderShieldDeployFlash(game, mvp) {
    const glow = this.effectGlowTexture();
    if (!glow) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.mvp, false, mvp);
    gl.uniformMatrix4fv(this.uniforms.model, false, this.identity);
    gl.uniform1f(this.uniforms.lit, 0);
    gl.uniform2f(this.uniforms.fogRange, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);

    for (const player of game.players) {
      const melee = player.meleeWeapon;
      if (!melee || melee.weaponID !== WEAPON_SHIELD || melee.modelAnim >= 10) continue;
      const p = player.currentCF.position;
      const alpha = 1 - melee.modelAnim / 10;
      const a = player.currentCF.angle * (Math.PI / 180);
      // Weapon.cpp:763 — ±25 model units at 0.005 scale ≈ 0.25 world units.
      const flashSize = 50 * WEAPON_MODEL_SCALE;
      this.drawSprite(glow, p[0], p[1], 0.05, flashSize, a, [0, 0.9, 1, alpha]);
    }

    gl.enable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
  }

  renderGroundFlames(game, mvp) {
    const glow = this.effectTextures.shotGlow || this.effectGlowTexture();
    if (!glow) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.mvp, false, mvp);
    gl.uniformMatrix4fv(this.uniforms.model, false, this.identity);
    gl.uniform1f(this.uniforms.lit, 0);
    gl.uniform2f(this.uniforms.fogRange, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);

    for (const proj of game.projectiles) {
      if (proj.type !== PROJECTILE_FLAME || proj.dead) continue;
      const p = proj.currentCF.position;
      // GameProjectile.cpp:1137-1142 — 2×2 shotGlow at z=0, additive.
      const z = 0.05;
      const heightFade = Math.max(0, 1 - p[2]);
      const alpha = (0.1 + Math.random() * 0.05) * heightFade;
      this.drawSprite(glow, p[0], p[1], z, 2, 0, [1, 0.75, 0, alpha]);
    }

    gl.enable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
  }

  renderFlags(game, mvp) {
    if (game.gameType !== GAME_TYPE_CTF || !game.flagModels || !game.map) return;
    const gl = this.gl;
    const scale = WEAPON_MODEL_SCALE;
    const anim = game.ctf?.flagAnim ?? 0;
    this.models.begin(mvp);

    const pods = [
      { built: game.flagModels.bluePod, pos: game.map.flagPod[0] },
      { built: game.flagModels.redPod, pos: game.map.flagPod[1] },
    ];
    for (const pod of pods) {
      if (!pod.built) continue;
      const p = pod.pos;
      this.models.draw(pod.built, new Float32Array([
        scale, 0, 0, 0,
        0, scale, 0, 0,
        0, 0, scale, 0,
        p[0], p[1], p[2] ?? 0.25, 1,
      ]));
    }

    const flags = [
      { built: game.flagModels.blueFlag, pos: game.ctf.flagPos[0], angle: 0 },
      { built: game.flagModels.redFlag, pos: game.ctf.flagPos[1], angle: 0 },
    ];
    for (let i = 0; i < flags.length; i++) {
      const f = flags[i];
      if (!f.built) continue;
      const carrier = game.ctf.flagState[i];
      const p = [...f.pos];
      let angle = 0;
      if (carrier >= 0) {
        const player = game.players.find((pl) => pl.playerID === carrier);
        if (player) {
          // Player.cpp:645 + MapRender.cpp:780 — the native client keeps the
          // DKO upright at the carrier and rotates it with angle - 90. Laying
          // it flat makes the rotating weapon depth-occlude the flag.
          p[0] = player.currentCF.position[0];
          p[1] = player.currentCF.position[1];
          p[2] = player.currentCF.position[2] ?? 0.25;
          angle = (player.currentCF.angle - 90) * (Math.PI / 180);
        }
      }
      const c = Math.cos(angle) * scale;
      const s = Math.sin(angle) * scale;
      const modelMatrix = new Float32Array([
        c, s, 0, 0,
        -s, c, 0, 0,
        0, 0, scale, 0,
        p[0], p[1], p[2] ?? 0.25, 1,
      ]);
      this.models.draw(f.built, modelMatrix, anim);
    }
    gl.bindVertexArray(null);
  }

  renderBrass(game) {
    if (!game.brassModel || !game.brass.length) return;
    for (const shell of game.brass) {
      const spin = shell.delay * 90 * (Math.PI / 180);
      const c = Math.cos(spin) * WEAPON_MODEL_SCALE;
      const s = Math.sin(spin) * WEAPON_MODEL_SCALE;
      const p = shell.position;
      this.models.draw(game.brassModel, new Float32Array([
        c, s, 0, 0,
        -s, c, 0, 0,
        0, 0, WEAPON_MODEL_SCALE, 0,
        p[0], p[1], p[2], 1,
      ]));
    }
  }

  drawDecals(marks) {
    const gl = this.gl;
    if (!marks.length) return;
    gl.depthMask(false);
    for (const mark of marks) {
      const tex = this.effectTextures[mark.texture];
      if (!tex) continue;
      let alpha = mark.color[3];
      if (mark.delay < 10) alpha *= mark.delay * 0.1;
      this.drawSprite(tex, mark.position[0], mark.position[1], mark.position[2], mark.size, mark.angle, [
        mark.color[0], mark.color[1], mark.color[2], alpha,
      ]);
    }
    gl.depthMask(true);
  }

  drawEditorMarkers(game) {
    const texture = this.effectTextures.shotGlow || this.effectTextures.glow;
    if (!texture || !game.editorMap) return;
    const draw = (point, color, size = 0.55) => {
      if (!point || (point[0] === 0 && point[1] === 0)) return;
      this.drawSprite(texture, point[0], point[1], 0.08, size, 0, color);
    };
    for (const point of game.editorMap.dmSpawns) draw(point, [1, 1, 1, 0.9]);
    for (const point of game.editorMap.blueSpawns) draw(point, [0.1, 0.45, 1, 0.95]);
    for (const point of game.editorMap.redSpawns) draw(point, [1, 0.15, 0.1, 0.95]);
    draw(game.editorMap.flagPod[0], [0.1, 0.3, 1, 1], 0.8);
    draw(game.editorMap.flagPod[1], [1, 0.1, 0.1, 1], 0.8);
    draw(game.editorMap.objective[0], [0.1, 0.8, 1, 1], 0.7);
    draw(game.editorMap.objective[1], [1, 0.5, 0.1, 1], 0.7);
    if (game.editorHover) draw([game.editorHover[0] + 0.5, game.editorHover[1] + 0.5, 0.1], [1, 1, 0.1, 0.65], 0.9);
  }

  renderTracers(game) {
    const gl = this.gl;
    const glow = this.effectTextures.glow;
    if (!glow) return;
    gl.depthMask(false);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    for (const tracer of game.tracers) {
      const fade = tracer.life / tracer.duration;
      const baseAlpha = 1 - fade;
      const width = tracer.width ?? 0.06;
      if (tracer.photon) {
        // Native photon is a sustained blue-white energy beam, not the short
        // amber bullet streak used by ordinary hitscan weapons.
        this.drawBeam(glow, tracer.from, tracer.to, 0.18, [0.15, 0.75, 1, baseAlpha * 0.95]);
        this.drawBeam(glow, tracer.from, tracer.to, 0.055, [0.85, 0.98, 1, baseAlpha]);
      } else {
        const c = tracer.color ?? [1, 0.9, 0.6, 1];
        this.drawBeam(glow, tracer.from, tracer.to, width, [
          c[0],
          c[1],
          c[2],
          c[3] * baseAlpha,
        ]);
      }
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
  }
}
