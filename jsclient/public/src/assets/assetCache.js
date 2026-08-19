// Texture cache over the original Content/ tree. Nothing is converted on disk.
import { decodeTGA } from './tga.js';
import { CONTENT_ROOT } from '../game/constants.js';
import { createTexture } from '../render/gl.js';

// Only these three exist on disk per theme. Map::reloadTheme also tries
// tex_wall_bottom/up/top/both, but those files were never shipped and the
// corresponding dktCreateTextureFromFile calls return 0, so every wall band
// ends up drawn with tex_wall_center.
const THEME_TEXTURES = ['tex_floor', 'tex_floor_dirt', 'tex_wall_center'];
const THEME_ALIASES = {
  tex_wall_bottom: 'tex_wall_center',
  tex_wall_up: 'tex_wall_center',
  tex_wall_top: 'tex_wall_center',
  tex_wall_both: 'tex_wall_center',
};

export class AssetCache {
  constructor(gl) {
    this.gl = gl;
    this.images = new Map();
    this.textures = new Map();
  }

  async loadImage(relPath) {
    if (this.images.has(relPath)) return this.images.get(relPath);
    const promise = (async () => {
      const res = await fetch(`${CONTENT_ROOT}/${relPath}`);
      if (!res.ok) throw new Error(`${relPath}: HTTP ${res.status}`);
      return decodeTGA(await res.arrayBuffer());
    })();
    this.images.set(relPath, promise);
    return promise;
  }

  async loadTexture(relPath, options) {
    const key = `${relPath}|${JSON.stringify(options ?? {})}`;
    if (this.textures.has(key)) return this.textures.get(key);
    const promise = this.loadImage(relPath).then((img) => createTexture(this.gl, img, options));
    this.textures.set(key, promise);
    return promise;
  }

  /** Theme textures, falling back to the grass theme like Map::reloadTheme does. */
  async loadTheme(themeName) {
    const out = {};
    await Promise.all(
      THEME_TEXTURES.map(async (name) => {
        try {
          out[name] = await this.loadTexture(`main/textures/themes/${themeName}/${name}.tga`);
        } catch {
          out[name] = await this.loadTexture(`main/textures/themes/grass/${name}.tga`);
        }
      }),
    );
    for (const [alias, target] of Object.entries(THEME_ALIASES)) out[alias] = out[target];
    return out;
  }
}
