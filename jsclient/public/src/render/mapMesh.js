// Builds the static map geometry.
// Ground: Map::buildGround / buildGroundLayer. Walls: Map::regenCell (src/Game/Map.cpp:661).
import { WALL_SHADE } from '../game/constants.js';

class MeshBuilder {
  constructor() {
    this.data = []; // x,y,z, u,v, shade, alpha
  }

  vert(x, y, z, u, v, shade, alpha) {
    this.data.push(x, y, z, u, v, shade, alpha);
  }

  /** Two triangles from four corner descriptors, in the order the C++ quads use. */
  quad(a, b, c, d) {
    this.vert(...a); this.vert(...b); this.vert(...c);
    this.vert(...a); this.vert(...c); this.vert(...d);
  }

  get count() {
    return this.data.length / 7;
  }

  toFloat32() {
    return new Float32Array(this.data);
  }
}

/** Ground quads. `dirtLayer` emits the same quads with per-vertex dirt alpha. */
function buildGround(map, dirtLayer) {
  const b = new MeshBuilder();
  for (let y = 0; y < map.sizeY; y++) {
    for (let x = 0; x < map.sizeX; x++) {
      if (!map.isPassable(x, y)) continue;
      const a00 = dirtLayer ? map.dirtAtVertex(x, y) : 1;
      const a10 = dirtLayer ? map.dirtAtVertex(x + 1, y) : 1;
      const a11 = dirtLayer ? map.dirtAtVertex(x + 1, y + 1) : 1;
      const a01 = dirtLayer ? map.dirtAtVertex(x, y + 1) : 1;
      if (dirtLayer && a00 + a10 + a11 + a01 <= 0) continue;
      b.quad(
        [x, y, 0, x, y, 1, a00],
        [x + 1, y, 0, x + 1, y, 1, a10],
        [x + 1, y + 1, 0, x + 1, y + 1, 1, a11],
        [x, y + 1, 0, x, y + 1, 1, a01],
      );
    }
  }
  return b;
}

/**
 * Wall sides. The C++ splits a wall column into three texture bands:
 * z 0..1 bottom (tex_wall_both when height==1, else tex_wall_bottom),
 * z 1..h-1 center, z h-1..h top. Each band is emitted into its own builder.
 */
function buildWalls(map) {
  const bands = { bottom: new MeshBuilder(), both: new MeshBuilder(), center: new MeshBuilder(), up: new MeshBuilder() };
  const top = new MeshBuilder();

  const side = (b, x, y, z0, z1, dir, shade, vRepeat) => {
    // dir: 0 = north (-Y face), 1 = east (+X), 2 = south (+Y), 3 = west (-X)
    const corners = [
      [[x, y], [x + 1, y]],
      [[x + 1, y], [x + 1, y + 1]],
      [[x + 1, y + 1], [x, y + 1]],
      [[x, y + 1], [x, y]],
    ][dir];
    const [p0, p1] = corners;
    b.quad(
      [p0[0], p0[1], z1, 0, vRepeat, shade, 1],
      [p0[0], p0[1], z0, 0, 0, shade, 1],
      [p1[0], p1[1], z0, 1, 0, shade, 1],
      [p1[0], p1[1], z1, 1, vRepeat, shade, 1],
    );
  };

  const shades = [WALL_SHADE.north, WALL_SHADE.east, WALL_SHADE.south, WALL_SHADE.west];
  const neighbour = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  for (let y = 0; y < map.sizeY; y++) {
    for (let x = 0; x < map.sizeX; x++) {
      if (map.isPassable(x, y)) continue;
      const h = map.heightAt(x, y);
      const bottomBand = h === 1 ? bands.both : bands.bottom;

      for (let d = 0; d < 4; d++) {
        const nx = x + neighbour[d][0];
        const ny = y + neighbour[d][1];
        if (nx < 0 || ny < 0 || nx >= map.sizeX || ny >= map.sizeY) continue;
        const nPassable = map.isPassable(nx, ny);
        const nHeight = map.heightAt(nx, ny);

        if (nPassable) side(bottomBand, x, y, 0, 1, d, shades[d], 1);

        if (h > 2 && (nPassable || h > nHeight)) {
          const base = nPassable ? 1 : Math.max(1, nHeight);
          if (h - 1 > base) side(bands.center, x, y, base, h - 1, d, shades[d], h - 1 - base);
        }

        if (h > 1 && (nPassable || h > nHeight)) {
          side(bands.up, x, y, h - 1, h, d, shades[d], 1);
        }
      }

      // Cap
      top.quad(
        [x, y, h, x, y, 1, 1],
        [x + 1, y, h, x + 1, y, 1, 1],
        [x + 1, y + 1, h, x + 1, y + 1, 1, 1],
        [x, y + 1, h, x, y + 1, 1, 1],
      );
    }
  }

  return { ...bands, top };
}

/** @returns {{name:string, texture:string, data:Float32Array, count:number}[]} */
export function buildMapMeshes(map) {
  const walls = buildWalls(map);
  const batches = [
    { name: 'floor', texture: 'tex_floor', builder: buildGround(map, false), blend: false },
    { name: 'floorDirt', texture: 'tex_floor_dirt', builder: buildGround(map, true), blend: true },
    { name: 'wallBottom', texture: 'tex_wall_bottom', builder: walls.bottom, blend: false },
    { name: 'wallBoth', texture: 'tex_wall_both', builder: walls.both, blend: false },
    { name: 'wallCenter', texture: 'tex_wall_center', builder: walls.center, blend: false },
    { name: 'wallUp', texture: 'tex_wall_up', builder: walls.up, blend: false },
    { name: 'wallTop', texture: 'tex_wall_top', builder: walls.top, blend: false },
  ];

  return batches
    .filter((b) => b.builder.count > 0)
    .map((b) => ({ name: b.name, texture: b.texture, blend: b.blend, data: b.builder.toFloat32(), count: b.builder.count }));
}
