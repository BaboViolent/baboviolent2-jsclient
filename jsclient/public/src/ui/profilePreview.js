// Profile babo preview — CUserLogin.cpp Paint(pic_babo): rolling sphere + BaboShadow.
import { createProgram, createTexture, mat4 } from '../render/gl.js';
import { buildSphere } from '../render/sphere.js';
import { recolorSkin } from '../game/skin.js';

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
uniform mat4 uMVP;
uniform mat4 uModel;
out vec2 vUV;
out vec3 vNormal;
void main() {
  vUV = aUV;
  vNormal = normalize(mat3(uModel) * normalize(aPos));
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec3 vNormal;
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  vec4 tex = texture(uTex, vUV);
  if (tex.a < 0.01) discard;
  float lit = 0.45 + 0.55 * max(dot(vNormal, normalize(vec3(0.3, -0.5, 1.0))), 0.0);
  fragColor = vec4(tex.rgb * lit, tex.a);
}`;

const SHADOW_VS = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aUV;
uniform mat4 uMVP;
out vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = uMVP * vec4(aPos, 0.0, 1.0);
}`;

const SHADOW_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  fragColor = vec4(1.0, 1.0, 1.0, texture(uTex, vUV).a * 0.75);
}`;

export const PROFILE_PREVIEW_FOV = 66;

function rotZ(deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return new Float32Array([
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

function rotY(deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

function rotX(deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ]);
}

export function advancePreviewRotation(rotation, delay, movement = {}) {
  const horizontal = Number(Boolean(movement.right)) - Number(Boolean(movement.left));
  const vertical = Number(Boolean(movement.down)) - Number(Boolean(movement.up));
  const active = horizontal !== 0 || vertical !== 0;
  const yawSpeed = active || rotation.manual ? horizontal * 120 : 90;
  const yaw = (rotation.yaw + yawSpeed * delay + 360) % 360;
  const pitch = Math.max(-65, Math.min(65, rotation.pitch + vertical * 100 * delay));
  return { yaw, pitch, manual: rotation.manual || active };
}

function translate(x, y, z) {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);
}

export class ProfilePreview {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!this.gl) throw new Error('WebGL2 required for profile preview');
    this.assets = assets;
    this.rotation = { yaw: 0, pitch: 0, manual: false };
    this.skinTex = null;
    this.shadowTex = null;
    this._initGL();
    this.resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      requestAnimationFrame(() => this.render());
    });
    this.resizeObserver?.observe(canvas);
  }

  _initGL() {
    const gl = this.gl;
    this.prog = createProgram(gl, VS, FS);
    this.shadowProg = createProgram(gl, SHADOW_VS, SHADOW_FS);
    this.uMvp = gl.getUniformLocation(this.prog, 'uMVP');
    this.uModel = gl.getUniformLocation(this.prog, 'uModel');
    this.uTex = gl.getUniformLocation(this.prog, 'uTex');
    this.uShadowMvp = gl.getUniformLocation(this.shadowProg, 'uMVP');
    this.uShadowTex = gl.getUniformLocation(this.shadowProg, 'uTex');

    const data = buildSphere(5, 24, 24);
    this.sphereCount = 24 * 24 * 6;
    this.sphereVao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    gl.bindVertexArray(this.sphereVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);

    const shadowVerts = new Float32Array([
      -8, 8, 0, 0,
      8, 8, 1, 0,
      8, -8, 1, 1,
      -8, 8, 0, 0,
      8, -8, 1, 1,
      -8, -8, 0, 1,
    ]);
    this.shadowVao = gl.createVertexArray();
    const sbo = gl.createBuffer();
    gl.bindVertexArray(this.shadowVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, sbo);
    gl.bufferData(gl.ARRAY_BUFFER, shadowVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  async load() {
    const shadow = await this.assets.loadImage('main/textures/BaboShadow.tga');
    this.shadowTex = createTexture(this.gl, shadow, { repeat: false, mipmap: false });
  }

  async updateSkin(skinName, decals) {
    const mask = await this.assets.loadImage(`main/skins/${skinName}.tga`);
    const tex = recolorSkin(mask, decals);
    const gl = this.gl;
    if (this.skinTex) gl.deleteTexture(this.skinTex);
    this.skinTex = createTexture(gl, tex, { repeat: false, mipmap: false });
  }

  tick(delay, input) {
    this.rotation = advancePreviewRotation(this.rotation, delay, {
      left: input?.moveLeft,
      right: input?.moveRight,
      up: input?.moveUp,
      down: input?.moveDown,
    });
  }

  render() {
    if (!this.skinTex || !this.shadowTex) return;
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width: cw, height: ch } = this.canvas.getBoundingClientRect();
    // Assets load while Menu2 is hidden. Wait for real layout rather than
    // baking a fallback viewport that clips until later interaction.
    if (cw <= 0 || ch <= 0) return;
    const pw = Math.floor(cw * dpr);
    const ph = Math.floor(ch * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }

    gl.viewport(0, 0, pw, ph);
    gl.clearColor(0.02, 0.06, 0.14, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = pw / ph;
    const proj = mat4.perspective(PROFILE_PREVIEW_FOV, aspect, 1, 1000);
    const view = mat4.lookAt([-4, -12, 7], [0, 0, 5], [0, 0, 1]);
    const vp = mat4.multiply(proj, view);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(this.shadowProg);
    gl.uniformMatrix4fv(this.uShadowMvp, false, vp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform1i(this.uShadowTex, 0);
    gl.bindVertexArray(this.shadowVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    let model = translate(0, 0, 5);
    model = mat4.multiply(model, rotY(90));
    model = mat4.multiply(model, rotX(this.rotation.pitch));
    model = mat4.multiply(model, rotZ(this.rotation.yaw));
    const mvp = mat4.multiply(vp, model);

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.uMvp, false, mvp);
    gl.uniformMatrix4fv(this.uModel, false, model);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.skinTex);
    gl.uniform1i(this.uTex, 0);
    gl.bindVertexArray(this.sphereVao);
    gl.drawArrays(gl.TRIANGLES, 0, this.sphereCount);
    gl.bindVertexArray(null);
  }
}
