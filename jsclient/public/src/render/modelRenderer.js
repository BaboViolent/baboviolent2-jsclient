// Textured/lit .DKO model program. Separate from the map program because model
// vertices carry a real normal (layout: pos3, normal3, uv2).
import { createProgram } from './gl.js';

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform mat4 uMVP;
uniform mat4 uModel;
uniform float uUnlit;
out vec2 vUV;
out float vShade;
void main() {
  vUV = aUV;
  vec3 n = normalize(mat3(uModel) * aNormal);
  vShade = uUnlit > 0.5 ? 1.0 : 0.35 + 0.65 * max(dot(n, normalize(vec3(0.3, -0.5, 1.0))), 0.0);
  gl_Position = uMVP * uModel * vec4(aPos, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUV;
in float vShade;
uniform sampler2D uTex;
uniform vec4 uColor;
uniform float uUseTex;
uniform float uAlphaCutoff;
out vec4 fragColor;
void main() {
  vec4 base = uUseTex > 0.5 ? texture(uTex, vUV) * uColor : uColor;
  if (base.a < uAlphaCutoff) discard;
  fragColor = vec4(base.rgb * vShade, base.a);
}`;

export const MODEL_STRIDE = 8 * 4;

export function interpolateFrameData(a, b, t) {
  if (!b || a.length !== b.length || t <= 0) return a;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 8) {
    // Positions and normals interpolate; authored UVs stay on frame A.
    for (let j = 0; j < 6; j++) out[i + j] = a[i + j] + (b[i + j] - a[i + j]) * t;
    out[i + 6] = a[i + 6];
    out[i + 7] = a[i + 7];
  }
  return out;
}

export class ModelRenderer {
  constructor(gl, assets) {
    this.gl = gl;
    this.assets = assets;
    this.program = createProgram(gl, VS, FS);
    this.uniforms = {
      mvp: gl.getUniformLocation(this.program, 'uMVP'),
      model: gl.getUniformLocation(this.program, 'uModel'),
      tex: gl.getUniformLocation(this.program, 'uTex'),
      color: gl.getUniformLocation(this.program, 'uColor'),
      useTex: gl.getUniformLocation(this.program, 'uUseTex'),
      alphaCutoff: gl.getUniformLocation(this.program, 'uAlphaCutoff'),
      unlit: gl.getUniformLocation(this.program, 'uUnlit'),
    };
    this.uploaded = new WeakMap();
  }

  frameKey(built, frameIndex) {
    const frame = ((frameIndex % built.frameCount) + built.frameCount) % built.frameCount;
    return `${Math.floor(frame)}:${Math.round((frame % 1) * 8)}`;
  }

  upload(built, frameIndex = 0) {
    const frame = ((frameIndex % built.frameCount) + built.frameCount) % built.frameCount;
    const fi = Math.floor(frame);
    const step = Math.round((frame - fi) * 8);
    const t = step / 8;
    const next = (fi + 1) % built.frameCount;
    const key = `${fi}:${step}`;
    const cache = this.uploaded.get(built) ?? new Map();
    if (!this.uploaded.has(built)) this.uploaded.set(built, cache);
    if (cache.has(key)) return cache.get(key);

    const gl = this.gl;
    const batches = built.frames[fi].batches.map((batch, index) => {
      const vao = gl.createVertexArray();
      const vbo = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      const nextBatch = built.frames[next].batches[index];
      const data = t > 0 && nextBatch?.material === batch.material
        ? interpolateFrameData(batch.data, nextBatch.data, t)
        : batch.data;
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, MODEL_STRIDE, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, MODEL_STRIDE, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, MODEL_STRIDE, 24);
      gl.bindVertexArray(null);
      return { vao, count: batch.count, material: batch.material };
    });
    cache.set(key, batches);
    return batches;
  }

  begin(mvp) {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.mvp, false, mvp);
    gl.uniform1i(this.uniforms.tex, 0);
    gl.uniform1f(this.uniforms.alphaCutoff, 0);
    gl.uniform1f(this.uniforms.unlit, 0);
    gl.activeTexture(gl.TEXTURE0);
  }

  draw(built, modelMatrix, frameIndex = 0, { alphaCutoff = 0, blend = null, unlit = false } = {}) {
    const gl = this.gl;
    gl.uniformMatrix4fv(this.uniforms.model, false, modelMatrix);
    gl.uniform1f(this.uniforms.alphaCutoff, alphaCutoff);
    gl.uniform1f(this.uniforms.unlit, unlit ? 1 : 0);

    const prevBlend = blend !== null;
    if (prevBlend) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, blend === 'add' ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    }

    for (const batch of this.upload(built, frameIndex)) {
      const mat = batch.material;
      const diffuse = mat.diffuse ?? [1, 1, 1, 1];
      const alpha = 1 - (mat.transparency ?? 0);
      gl.uniform4f(this.uniforms.color, diffuse[0], diffuse[1], diffuse[2], alpha);
      gl.uniform1f(this.uniforms.useTex, mat.glTexture ? 1 : 0);
      if (mat.glTexture) gl.bindTexture(gl.TEXTURE_2D, mat.glTexture);
      gl.bindVertexArray(batch.vao);
      gl.drawArrays(gl.TRIANGLES, 0, batch.count);
    }
    gl.bindVertexArray(null);

    if (prevBlend) {
      gl.disable(gl.BLEND);
    }
  }

  /** Resolve each material's diffuse texture; missing files fall back to colour. */
  async loadTextures(built, basePath = 'main/models/') {
    const materials = new Set();
    for (const frame of built.frames) {
      for (const batch of frame.batches) materials.add(batch.material);
    }
    await Promise.all(
      [...materials].map(async (material) => {
        const file = material.texDiffuse || material.texDkt;
        if (!file || material.glTexture) return;
        try {
          material.glTexture = await this.assets.loadTexture(`${basePath}${file}`, { repeat: false });
        } catch {
          material.glTexture = null;
        }
      }),
    );
  }
}
